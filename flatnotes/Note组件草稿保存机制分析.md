# Note.vue 草稿保存与自动保存机制分析

本文档详细分析 `client/views/Note.vue` 中的草稿保存、自动保存机制及权限控制逻辑。

---

## 1. 草稿存取策略：localStorage 与 sessionStorage 的选择

### 核心方法分析

#### 1.1 `isCurrentTokenStored()` 函数

文件：[tokenStorage.js](file:///e:/solo-code-2/flatnotes/client/tokenStorage.js#L39-L46)

```javascript
export function isCurrentTokenStored() {
  const localToken = localStorage.getItem(tokenStorageKey);
  if (localToken == null) {
    return false;
  }
  const sessionToken = sessionStorage.getItem(tokenStorageKey);
  return localToken === sessionToken;
}
```

**判断逻辑**：
- 检查 `localStorage` 中是否存在 token
- 若不存在，直接返回 `false`
- 若存在，比较 `localStorage` 和 `sessionStorage` 中的 token 是否一致
- 一致返回 `true`，否则返回 `false`

**语义解释**：
- `true`：用户勾选了"记住我"，token 被持久化存储
- `false`：用户未勾选"记住我"，仅存在会话级存储，或未登录

#### 1.2 `saveDraft()` 方法

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L443-L453)

```javascript
function saveDraft() {
  const content = toastEditor.value.getMarkdown();
  const userHasPersistedToken = isCurrentTokenStored();
  if (content) {
    if (userHasPersistedToken) {
      localStorage.setItem(note.value.title, content);
    } else {
      sessionStorage.setItem(note.value.title, content);
    }
  }
}
```

**存储策略**：
| isCurrentTokenStored() | 使用的存储方式 | 生命周期 |
|------------------------|---------------|----------|
| `true` | `localStorage` | 持久化，浏览器关闭后保留 |
| `false` | `sessionStorage` | 会话级，标签页关闭后清除 |

**设计意图**：
- 持久化登录用户：草稿长期保存，即使关闭浏览器也可恢复
- 临时登录用户：草稿仅在当前会话有效，保护隐私

#### 1.3 `loadDraft()` 方法

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L460-L464)

```javascript
function loadDraft() {
  const localDraft = localStorage.getItem(note.value.title);
  const sessionDraft = sessionStorage.getItem(note.value.title);
  return localDraft || sessionDraft;
}
```

**加载策略**：
- 同时尝试从 `localStorage` 和 `sessionStorage` 加载
- `localStorage` 优先级更高（`||` 短路运算）
- 任一存储中存在草稿即返回
- 兼容用户登录状态变化的场景

#### 1.4 `clearDraft()` 方法

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L455-L458)

```javascript
function clearDraft() {
  localStorage.removeItem(note.value.title);
  sessionStorage.removeItem(note.value.title);
}
```

**清除策略**：
- 同时从两种存储中清除草稿
- 确保草稿被彻底删除，避免残留

---

## 2. 令牌过期处理流程

### 2.1 自动保存触发机制

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L419-L440)

```javascript
function startContentChangedTimeout() {
  clearContentChangedTimeout();
  contentChangedTimeout = setTimeout(contentChangedHandler, 1000);
}

function contentChangedHandler() {
  if (isContentChanged()) {
    unsavedChanges.value = true;
    setBeforeUnloadConfirmation(true);
    saveDraft();  // 自动保存草稿
  } else {
    unsavedChanges.value = false;
    setBeforeUnloadConfirmation(false);
    clearDraft();
  }
}
```

**触发时机**：
- 编辑器内容变化时，通过 `@change` 事件触发 `startContentChangedTimeout`
- 防抖延迟 1 秒后执行 `contentChangedHandler`
- 检测到内容变化时调用 `saveDraft()` 保存草稿

### 2.2 API 请求拦截器

文件：[api.js](file:///e:/solo-code-2/flatnotes/client/api.js#L12-L26)

```javascript
api.interceptors.request.use(
  function (config) {
    if (config.url !== "api/token") {
      const token = getStoredToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  function (error) {
    return Promise.reject(error);
  },
);
```

**作用**：
- 非 token 请求自动添加 `Authorization` 请求头
- 从 `sessionStorage` 中获取当前 token

### 2.3 401 未授权错误处理

文件：[api.js](file:///e:/solo-code-2/flatnotes/client/api.js#L28-L45)

```javascript
export function apiErrorHandler(error, toast) {
  if (error.response?.status === 401) {
    const redirectPath = router.currentRoute.value.fullPath;
    router.push({
      name: "login",
      query: { [constants.params.redirect]: redirectPath },
    });
  } else {
    console.error(error);
    toast.add(
      getToastOptions(
        "Unknown error communicating with the server. Please try again.",
        "Unknown Error",
        "error",
      ),
    );
  }
}
```

**处理流程**：
1. API 返回 401 状态码（令牌过期或无效）
2. 获取当前路由路径作为重定向参数
3. 路由跳转到登录页面，并携带 `redirect` 查询参数
4. 登录成功后可跳转回原页面

### 2.4 保存操作中的错误处理

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L280-L330)

```javascript
function saveNew(newTitle, newContent, close = false) {
  createNote(newTitle, newContent)
    .then((data) => {
      clearDraft();  // 成功后清除草稿
      // ...
    })
    .catch(noteSaveFailure);
}

function noteSaveFailure(error) {
  if (error.response?.status === 409) {
    // 处理重复标题
  } else if (error.response?.status === 413) {
    // 处理文件过大
  } else {
    apiErrorHandler(error, toast);  // 调用全局错误处理
  }
}
```

**完整流程**：

```
用户编辑内容 → 1秒防抖 → saveDraft() 写入本地存储
用户点击保存 → createNote/updateNote API 调用
    ↓
令牌过期 → 401 响应 → noteSaveFailure → apiErrorHandler
    ↓
清除 token（后端通过Cookie失效）→ 跳转登录页
    ↓
草稿仍在本地存储，登录后可恢复
```

**关键点**：
- 草稿保存在**API 调用之前**（自动保存机制）
- 即使 API 失败，草稿仍然保留在本地
- 用户重新登录后，进入同一笔记会检测到草稿并提示恢复

---

## 3. 权限控制：禁用草稿保存机制

### 3.1 `canModify` 计算属性

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L153-L155)

```javascript
const canModify = computed(
  () => globalStore.config.authType != authTypes.readOnly,
);
```

**权限判断逻辑**：
- 从全局 store 获取 `authType` 配置
- 与 `authTypes.readOnly`（值为 `"read_only"`）比较
- 不等于只读模式时，返回 `true` 表示可修改

### 3.2 认证类型常量

文件：[constants.js](file:///e:/solo-code-2/flatnotes/client/constants.js#L15-L20)

```javascript
export const authTypes = {
  none: "none",        // 无认证，可自由访问
  readOnly: "read_only",  // 只读模式
  password: "password",  // 密码认证
  totp: "totp",        // TOTP 双因素认证
};
```

### 3.3 UI 层面的禁用

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L56-L86)

```vue
<!-- Buttons -->
<div class="flex shrink-0 self-end md:self-baseline print:hidden">
  <!-- Delete Button -->
  <CustomButton
    v-show="canModify && !isNewNote"
    label="Delete"
    ...
  />
  <!-- Save Button -->
  <CustomButton
    v-show="editMode"
    label="Save"
    ...
  />
  <!-- Edit Toggle -->
  <Toggle
    v-if="canModify"
    label="Edit"
    :isOn="editMode"
    ...
  />
</div>
```

**禁用效果**：
| 元素 | 控制条件 | 只读模式下行为 |
|------|---------|---------------|
| 删除按钮 | `v-show="canModify && !isNewNote"` | 隐藏 |
| 保存按钮 | `v-show="editMode"` | 因无法进入编辑模式而不显示 |
| 编辑切换开关 | `v-if="canModify"` | 不渲染 |

### 3.4 编辑模式的控制

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L468-L472)

```javascript
// Keyboard Shortcuts
// 'e' to edit
Mousetrap.bind("e", () => {
  if (editMode.value === false && canModify.value) {
    editHandler();
  }
});
```

**键盘快捷键保护**：
- 按下 `e` 键时检查 `canModify.value`
- 只读模式下快捷键无效

### 3.5 草稿机制的隐式禁用

虽然 `saveDraft` 方法本身没有直接检查 `canModify`，但通过以下流程实现了隐式禁用：

```
只读模式 (canModify = false)
    ↓
编辑开关不显示 / 快捷键禁用
    ↓
无法进入 editMode
    ↓
ToastEditor 不渲染（v-if="editMode"）
    ↓
@change 事件无法触发
    ↓
startContentChangedTimeout 不执行
    ↓
saveDraft 永远不会被调用
```

**关键代码**：

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L98-L106)

```vue
<ToastEditor
  v-if="editMode"
  ref="toastEditor"
  :initialValue="getInitialEditorValue()"
  :initialEditType="loadDefaultEditorMode()"
  :addImageBlobHook="addImageBlobHook"
  @change="startContentChangedTimeout"
  @keydown="keydownHandler"
/>
```

`ToastEditor` 组件只有在 `editMode` 为 `true` 时才渲染，而 `editMode` 的切换完全受 `canModify` 控制。

### 3.6 新建笔记场景

对于新建笔记：

文件：[Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue#L193-L204)

```javascript
} else {
  newTitle.value = "";
  note.value = new Note();
  editMode.value = false;
  nextTick(() => {
    editHandler();  // 直接进入编辑模式
    loadingIndicator.value.setLoaded();
  });
}
```

**注意**：新建笔记时会直接调用 `editHandler()` 进入编辑模式，但：
- 新建笔记路由只有在用户登录后才可访问
- 只读模式下无法创建新笔记
- 因此不存在权限越界问题

---

## 总结

### 核心机制

1. **存储策略**：根据登录持久性决定使用 `localStorage` 或 `sessionStorage`，平衡用户体验与隐私安全

2. **错误处理**：通过 Axios 拦截器统一处理 401 错误，自动跳转登录页，草稿保留在本地

3. **权限控制**：通过 `canModify` 计算属性控制编辑入口，从源头阻止未授权用户进入编辑模式，从而间接禁用草稿保存

### 关键文件

| 文件 | 作用 |
|------|------|
| [Note.vue](file:///e:/solo-code-2/flatnotes/client/views/Note.vue) | 草稿保存、加载、清除逻辑 |
| [tokenStorage.js](file:///e:/solo-code-2/flatnotes/client/tokenStorage.js) | token 存储与状态判断 |
| [api.js](file:///e:/solo-code-2/flatnotes/client/api.js) | 请求拦截与错误处理 |
| [constants.js](file:///e:/solo-code-2/flatnotes/client/constants.js) | 认证类型常量 |
| [globalStore.js](file:///e:/solo-code-2/flatnotes/client/globalStore.js) | 全局配置状态管理 |
