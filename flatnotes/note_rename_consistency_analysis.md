# 笔记重命名操作前后端一致性校验分析

本文档对 flatnotes 笔记重命名过程中，前端 `client/views/Note.vue` 与后端 `server/notes/file_system/file_system.py` 之间强一致的命名冲突校验流程进行分析。

## 1. 后端：文件存在性检测与 `FileExistsError` 抛出

### 代码位置

- 校验与抛出逻辑：[file_system.py#L80-L102](file:///e:/solo-code-2/flatnotes/server/notes/file_system/file_system.py#L80-L102)
- 相关路径计算：[file_system.py#L166-L167](file:///e:/solo-code-2/flatnotes/server/notes/file_system/file_system.py#L166-L167)

### 核心流程

```python
def update(self, title: str, data: NoteUpdate) -> Note:
    """Update a specific note."""
    is_valid_filename(title)
    filepath = self._path_from_title(title)
    if data.new_title is not None:
        new_filepath = self._path_from_title(data.new_title)
        if filepath != new_filepath and os.path.isfile(new_filepath):
            raise FileExistsError(
                f"Failed to rename. '{data.new_title}' already exists."
            )
        os.rename(filepath, new_filepath)
        title = data.new_title
        filepath = new_filepath
    ...
```

### 关键点说明

1. **计算旧路径与新路径**：
   - `filepath = self._path_from_title(title)` 将当前标题拼接为 `storage_path/title.md`。
   - `new_filepath = self._path_from_title(data.new_title)` 将新标题拼接为 `storage_path/new_title.md`。
2. **判定为“重命名”场景**：只有当 `data.new_title is not None` 时才进入命名空间检查分支。
3. **冲突判断的三重保护**：
   - `filepath != new_filepath`：避免新旧标题相同（例如大小写变化但底层路径相同的情况）时出现误报。
   - `os.path.isfile(new_filepath)`：直接在底层文件系统上探测目标路径对应的 `.md` 文件是否已经存在。这一步是事务级的物理校验，能保证存储层面不会出现覆盖。
4. **抛出 `FileExistsError`**：一旦检测到冲突便立即抛异常，中断重命名流程，`os.rename` 不会执行，保证不会覆盖已有笔记。

> 该设计的意义在于：以“底层文件系统的实时状态”为唯一真值，避免了仅靠内存缓存或索引判断导致的竞态问题。

## 2. FastAPI 路由：捕获 `FileExistsError` 并返回 HTTP 409

### 代码位置

- PATCH `/api/notes/{title}` 路由：[main.py#L109-L128](file:///e:/solo-code-2/flatnotes/server/main.py#L109-L128)
- 消息常量：[api_messages.py#L2](file:///e:/solo-code-2/flatnotes/server/api_messages.py#L2)

### 核心流程

```python
@router.patch(
    "/api/notes/{title}",
    dependencies=auth_deps,
    response_model=Note,
)
def patch_note(title: str, data: NoteUpdate):
    try:
        return note_storage.update(title, data)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=api_messages.invalid_note_title,
        )
    except FileExistsError:
        raise HTTPException(
            status_code=409, detail=api_messages.note_exists
        )
    except FileNotFoundError:
        raise HTTPException(404, api_messages.note_not_found)
```

其中：

```python
note_exists = "Cannot create note. A note with the same title already exists."
```

### 关键点说明

1. **异常到 HTTP 状态码的映射**：路由端点用 `try/except` 捕获底层存储层抛出的 `FileExistsError`，并将其翻译为语义化的 HTTP `409 Conflict`，这是 REST 规范中表示“资源冲突”的标准状态码。
2. **统一错误载荷**：通过 `detail=api_messages.note_exists` 将可读文案放入响应体，便于前端精确提示用户。
3. **职责分离**：`FileSystemNotes.update` 只负责领域层异常的抛出，FastAPI 路由层负责把领域异常翻译为 HTTP 协议层面的响应，两者解耦、易于替换底层存储实现。

## 3. 前端：`updateNote` 收到 409 后的 UI 拦截与提示

### 代码位置

- API 封装：[api.js#L114-L124](file:///e:/solo-code-2/flatnotes/client/api.js#L114-L124)
- 保存回调与错误处理：[Note.vue#L253-L330](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L253-L330)

### 3.1 `updateNote` 的调用约定

```javascript
export async function updateNote(title, newTitle, newContent) {
  try {
    const response = await api.patch(`api/notes/${encodeURIComponent(title)}`, {
      newTitle: newTitle,
      newContent: newContent,
    });
    return new Note(response.data);
  } catch (response) {
    return Promise.reject(response);
  }
}
```

说明：`updateNote` 自身并不区分错误类型，只负责把 axios 的异常 **再抛出**（`Promise.reject`），让调用方自行决定如何处理。这使得错误处理的职责下放到视图层，视图层可以根据具体业务场景定制不同提示。

### 3.2 `Note.vue` 保存回调中的 409 拦截

```javascript
function saveExisting(newTitle, newContent, close = false) {
  if (newTitle == note.value.title && newContent == note.value.content) {
    noteSaveSuccess(close);
    return;
  }

  updateNote(note.value.title, newTitle, newContent)
    .then((data) => {
      clearDraft();
      note.value = data;
      router.replace({ name: "note", params: { title: note.value.title } });
      noteSaveSuccess(close);
    })
    .catch(noteSaveFailure);
}

function noteSaveFailure(error) {
  if (error.response?.status === 409) {
    toast.add(
      getToastOptions(
        "A note with this title already exists. Please try again with a new title.",
        "Duplicate",
        "error",
      ),
    );
  } else if (error.response?.status === 413) {
    entityTooLargeToast("note");
  } else {
    apiErrorHandler(error, toast);
  }
}
```

新笔记分支 `saveNew` 也共用同一个 `noteSaveFailure` 回调：

```javascript
function saveNew(newTitle, newContent, close = false) {
  createNote(newTitle, newContent)
    .then(...)
    .catch(noteSaveFailure);
}
```

### 关键点说明

1. **以 `error.response?.status === 409` 为唯一判据**：`noteSaveFailure` 通过 axios 错误对象中的响应状态码精确识别“标题已存在”的业务语义，避免了误把 401/404/500 等其他错误当作冲突来处理。
2. **使用 PrimeVue `toast` 弹框提醒**：调用 `toast.add(getToastOptions(...))` 向用户展示“标题已存在”的友好文案（文案用英文，便于后续 i18n），引导用户换一个标题重新保存。
3. **保持编辑态不回退**：发生 409 时只调用 `toast.add`，并不会执行 `editMode.value = false`、`router.replace` 或 `clearDraft`。因此：
   - 用户仍然停留在可编辑界面；
   - 已输入的标题与正文被完整保留；
   - 草稿 (`localStorage`/`sessionStorage`) 也不会被清除，便于继续修改。
4. **其他错误走通用错误处理**：413 走 `entityTooLargeToast`，其余错误（401、网络错误等）走 `apiErrorHandler`，实现了错误的分层处理。

## 整体流程示意

```
用户在 Note.vue 更改标题并点击 Save
        │
        ▼
saveHandler → saveExisting / saveNew
        │
        ▼
调用 api.updateNote (PATCH /api/notes/{title})
        │
        ▼
server: patch_note 调用 note_storage.update
        │
        ▼
FileSystemNotes.update：
  1. 计算 new_filepath
  2. os.path.isfile(new_filepath) 检测冲突
  3. 冲突 → raise FileExistsError     ← 关键一致性校验点
        │
        ▼
FastAPI 路由捕获 FileExistsError → HTTPException(409, detail=note_exists)
        │
        ▼
axios 把 409 作为 rejected Promise 返回
        │
        ▼
noteSaveFailure(error):
  if (error.response?.status === 409):
      toast.add("A note with this title already exists...")
      // 保持 editMode 为 true，不清草稿，用户可继续编辑
```

## 结论

本项目通过 **“后端以文件系统物理存在性为真值 → 路由层翻译为 HTTP 409 → 前端按状态码拦截并保持编辑态”** 的三段式流程，实现了重命名场景下前后端状态的强一致：

- **存储层**（`FileSystemNotes.update`）在执行 `os.rename` 之前用 `os.path.isfile` 做防御式检查，杜绝了覆盖其他笔记的风险，是一致性的“最后一道闸”。
- **接口层**（`patch_note`）将领域异常精准翻译为 `409 Conflict`，把业务语义通过 HTTP 协议透出。
- **视图层**（`Note.vue` 的 `noteSaveFailure`）仅对 `409` 做专门的文案提示与编辑态保持，避免在失败场景下强制退出编辑模式或丢弃用户输入，从而引导用户重新输入标题再次保存。
