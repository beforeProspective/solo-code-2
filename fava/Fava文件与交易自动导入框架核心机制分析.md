# Fava 文件与交易自动导入框架核心机制分析

## 概述

Fava 的自动导入框架是 Beancount 记账系统的关键组成部分，负责将银行对账单等外部文件自动转换为 Beancount 记账指令。该框架的核心实现在 [ingest.py](file:///E:/solo-code-2/fava/src/fava/core/ingest.py) 的 `IngestModule` 类中，具备以下核心能力：

1. 动态加载外部 Python 解析器配置
2. 自动识别不同格式的文件
3. 显示导入差异并支持用户交互

---

## 一、IngestModule 初始化：配置扫描与动态导入机制

### 1.1 Beancount Custom 指令配置方式

用户在 Beancount 主文件中通过 `custom "fava-option"` 指令定义导入配置：

```beancount
2016-04-01 custom "fava-option" "import-config" "import_config.py"
2016-04-01 custom "fava-option" "import-dirs" "documents/bank_statements"
2016-04-01 custom "fava-option" "import-dirs" "documents/credit_card"
```

### 1.2 配置解析流程

#### 1.2.1 Custom 指令扫描与选项解析

配置解析的入口是 [fava_options.py](file:///E:/solo-code-2/fava/src/fava/core/fava_options.py) 中的 `parse_options()` 函数：

```python
# fava_options.py:226-254
def parse_options(custom_entries: Sequence[Custom]) -> tuple[FavaOptions, list[OptionError]]:
    options = FavaOptions()
    errors = []
    for entry in (e for e in custom_entries if e.type == "fava-option"):
        try:
            if not entry.values:
                raise MissingOptionError
            parse_option_custom_entry(entry, options)
        except (IndexError, TypeError, ValueError) as err:
            msg = f"Failed to parse fava-option entry: {err!s}"
            errors.append(OptionError(entry.meta, msg, entry))
    return options, errors
```

**关键机制**：
- 过滤所有 `type == "fava-option"` 的 custom 指令
- 将指令中的 `"import-config"` 转换为 `import_config` 属性（连字符转下划线）
- 将 `"import-dirs"` 转换为 `import_dirs` 序列

#### 1.2.2 选项值解析

`parse_option_custom_entry()` 函数在 [fava_options.py:188-223](file:///E:/solo-code-2/fava/src/fava/core/fava_options.py#L188-L223) 中处理具体选项：

```python
def parse_option_custom_entry(entry: Custom, options: FavaOptions) -> None:
    key = str(entry.values[0].value).replace("-", "_")
    if key not in All_OPTS:
        raise UnknownOptionError(key)
    value = entry.values[1].value if len(entry.values) > 1 else ""
    
    if key == "import_dirs":
        options.set_import_dirs(value)
    elif key in STR_OPTS:
        setattr(options, key, value)
    # ... 其他选项处理
```

`import_dirs` 通过 `set_import_dirs()` 方法添加到序列中：

```python
# fava_options.py:141-144
def set_import_dirs(self, value: str) -> None:
    self.import_dirs.append(value)
```

### 1.3 外部 Python 配置文件动态加载

#### 1.3.1 IngestModule 初始化

`IngestModule` 继承自 `FavaModule` 基类，初始化时仅保存对 `ledger` 的引用：

```python
# ingest.py:281-289
class IngestModule(FavaModule):
    def __init__(self, ledger: FavaLedger) -> None:
        super().__init__(ledger)
        self.importers: Mapping[str, WrappedImporter] = {}
        self.hooks: Hooks = []
        self.mtime: int | None = None
        self.errors: list[IngestError] = []
```

#### 1.3.2 配置文件加载

`load_file()` 方法在文件加载或重载时被调用，负责动态加载外部配置：

```python
# ingest.py:308-327
def load_file(self) -> None:
    self.errors = []
    module_path = self.module_path  # 从 fava_options.import_config 获取路径
    if module_path is None:
        return
    
    if not module_path.exists():
        self._error("Import config does not exist")
        return
    
    new_mtime = module_path.stat().st_mtime_ns
    if new_mtime == self.mtime:  # 检查文件是否变更
        return
    
    try:
        self.importers, self.hooks = load_import_config(module_path)
        self.mtime = new_mtime
    except FavaAPIError as error:
        msg = f"Error in import config '{module_path}': {error!s}"
        self._error(msg)
```

#### 1.3.3 动态执行 Python 配置

`load_import_config()` 函数使用 `runpy.run_path()` 动态执行外部 Python 配置文件：

```python
# ingest.py:231-278
def load_import_config(module_path: Path) -> tuple[Mapping[str, WrappedImporter], Hooks]:
    try:
        mod = run_path(str(module_path))  # 动态执行 Python 文件
    except Exception as error:
        message = "".join(traceback.format_exception(*sys.exc_info()))
        raise ImportConfigLoadError(message) from error
    
    if "CONFIG" not in mod:
        msg = "CONFIG is missing"
        raise ImportConfigLoadError(msg)
    if not isinstance(mod["CONFIG"], list):
        msg = "CONFIG is not a list"
        raise ImportConfigLoadError(msg)
    
    config = mod["CONFIG"]
    hooks = mod.get("HOOKS", [])
    
    importers = {}
    for importer in config:
        if not isinstance(importer, Importer):
            name = importer.__class__.__name__
            msg = f"Importer class '{name}' in '{module_path}' does not satisfy importer protocol"
            raise ImportConfigLoadError(msg)
        wrapped_importer = WrappedImporter(importer)
        if wrapped_importer.name in importers:
            msg = f"Duplicate importer name found: {wrapped_importer.name}"
            raise ImportConfigLoadError(msg)
        importers[wrapped_importer.name] = wrapped_importer
    return importers, hooks
```

**外部配置文件格式**（示例）：
```python
from beangulp.importer import Importer
from beancount.ingest.importers import csv

CONFIG = [
    csv.Importer(
        config={
            "filename": "Chase.*\.csv",
            "account": "Assets:Banks:Chase:Checking",
            "currency": "USD",
            "lastfour": "1234",
        },
        categorizer=categorize_expenses,
    ),
    # 更多 importer...
]

HOOKS = [
    # 可选的处理钩子函数
]
```

#### 1.3.4 账单目录识别

账单目录通过 `ledger.fava_options.import_dirs` 获取，在 `import_data()` 中遍历：

```python
# ingest.py:342-346
for directory in self.ledger.fava_options.import_dirs:
    for path in walk_dir(self.ledger.join_path(directory)):
        if path in seen:
            continue
        seen.add(path)
```

`walk_dir()` 函数会忽略常见的开发目录（`.git`, `.venv`, `__pycache__` 等）。

---

## 二、文件上传与格式自动判定流程

### 2.1 文件上传 API

用户在 Web 界面上传文件时，调用 `put_upload_import_file` API 端点：

```python
# json_api.py:530-547
@api_endpoint
def put_upload_import_file() -> str:
    upload = request.files.get("file", None)
    if upload is None:
        raise NoFileUploadedError
    if not upload.filename:
        raise UploadedFileIsMissingFilenameError
    
    filepath = filepath_in_primary_imports_folder(upload.filename, g.ledger)
    
    if filepath.exists():
        raise TargetPathAlreadyExistsError(filepath)
    
    filepath.parent.mkdir(parents=True, exist_ok=True)
    upload.save(filepath)
    
    return f"Uploaded to {filepath}"
```

文件保存路径由 `filepath_in_primary_imports_folder()` 确定，使用第一个配置的 `import_dir`：

```python
# ingest.py:415-436
def filepath_in_primary_imports_folder(filename: str, ledger: FavaLedger) -> Path:
    primary_imports_folder = next(iter(ledger.fava_options.import_dirs), None)
    if primary_imports_folder is None:
        raise MissingImporterDirsError
    
    filename = filename.replace(sep, " ")
    if altsep:
        filename = filename.replace(altsep, " ")
    
    return ledger.join_path(primary_imports_folder, filename)
```

### 2.2 格式自动判定流程

#### 2.2.1 导入数据获取 API

前端通过 `get_imports` API 获取可导入文件列表：

```python
# json_api.py:598-602
@api_endpoint
def get_imports() -> Sequence[FileImporters]:
    g.ledger.changed()
    return g.ledger.ingest.import_data()
```

#### 2.2.2 Importer 遍历与 identify 调用

`import_data()` 方法是格式自动判定的核心：

```python
# ingest.py:329-361
@listify
def import_data(self) -> Iterable[FileImporters]:
    if not self.importers:
        return
    
    importers = list(self.importers.values())
    seen = set()
    
    for directory in self.ledger.fava_options.import_dirs:
        for path in walk_dir(self.ledger.join_path(directory)):
            if path in seen:
                continue
            seen.add(path)
            
            if path.stat().st_size > _FILE_TOO_LARGE_THRESHOLD:  # 8MB 限制
                continue
            
            yield FileImporters(
                name=str(path),
                basename=path.name,
                importers=[
                    importer.file_import_info(path)
                    for importer in importers
                    if importer.identify(path)
                ],
            )
```

**核心流程**：
1. 获取所有已加载的 `WrappedImporter` 对象列表
2. 遍历所有 `import_dirs` 目录下的文件
3. 跳过大于 8MB 的文件
4. 对每个文件，**依次调用所有 importer 的 `identify()` 方法**
5. 收集所有返回 `True` 的 importer，生成 `FileImporters` 对象

#### 2.2.3 WrappedImporter 的 identify 方法

`WrappedImporter` 是对实际 Importer 的安全包装，添加了异常捕获和类型验证：

```python
# ingest.py:179-184
@_catch_any
def identify(self: WrappedImporter, path: Path) -> bool:
    importer = self.importer
    matches = importer.identify(str(path))
    return _assert_type("identify", matches, bool)
```

`_catch_any` 装饰器捕获所有异常并转换为 `ImporterMethodCallError`：

```python
# ingest.py:143-155
def _catch_any(func: Callable[P, T]) -> Callable[P, T]:
    @wraps(func)
    def wrapper(*args: P.args, **kwds: P.kwargs) -> T:
        try:
            return func(*args, **kwds)
        except Exception as err:
            if isinstance(err, ImporterInvalidTypeError):
                raise
            raise ImporterMethodCallError from err
    return wrapper
```

#### 2.2.4 Importer Protocol

beangulp 的 `Importer` 基类定义了 `identify()` 方法的协议：

```python
# 来自 beangulp.importer.Importer
class Importer:
    def identify(self, filepath: str) -> bool:
        """判断该 importer 是否能处理给定文件。
        
        Args:
            filepath: 文件的绝对路径字符串
            
        Returns:
            如果能处理返回 True，否则返回 False
        """
        raise NotImplementedError
```

**典型的 identify 实现**：
```python
def identify(self, filepath: str) -> bool:
    # 检查文件名模式
    if not re.match(self.config["filename"], os.path.basename(filepath)):
        return False
    
    # 检查文件内容特征（如 CSV 表头）
    with open(filepath, encoding=self.config.get("encoding", "utf-8")) as f:
        header = f.readline()
        return self.config["columns"] in header
```

---

## 三、多 Importer 匹配的冲突解决机制

### 3.1 系统设计原则：无自动优先级，用户主导决策

通过代码分析可以发现，**Fava 的导入框架没有内置自动的优先级冲突解决机制**。当多个 importer 的 `identify()` 方法都返回 `True` 时，系统采用**"收集所有匹配，用户手动选择"**的策略。

### 3.2 后端处理：收集所有匹配项

`import_data()` 方法中的列表推导式会收集**所有**匹配的 importer：

```python
# ingest.py:356-360
importers=[
    importer.file_import_info(path)
    for importer in importers
    if importer.identify(path)  # 所有返回 True 的都会被收集
],
```

返回的 `FileImporters` 数据结构包含该文件的所有匹配 importer：

```python
# ingest.py:134-140
@dataclass(frozen=True)
class FileImporters:
    name: str           # 文件完整路径
    basename: str       # 文件名
    importers: list[FileImportInfo]  # 所有匹配的 importer 列表
```

### 3.3 前端展示：多选项并列呈现

前端在 [index.ts](file:///E:/solo-code-2/fava/frontend/src/reports/import/index.ts) 中处理 API 返回的数据：

```typescript
// index.ts:37-58
async () =>
  get_imports()
    .then((files) => {
      const today = todayAsString();
      return files.map((file) => {
        const importers = file.importers.map(
          ({ account, importer_name, date, name }) => ({
            account,
            importer_name,
            newName: newFilename(date, name),
          }),
        );
        const identified_by_importers = importers.length > 0;
        if (!identified_by_importers) {
          const newName = newFilename(today, file.basename);
          importers.push({ account: "", newName, importer_name: "" });
        }
        return { ...file, identified_by_importers, importers };
      });
    })
```

[FileList.svelte](file:///E:/solo-code-2/fava/frontend/src/reports/import/FileList.svelte) 组件通过循环展示所有匹配的 importer：

```svelte
<!-- FileList.svelte:54-110 -->
{#each file.importers as info (info.importer_name)}
  {@const file_importer_key = `${file.name}:${info.importer_name}`}
  <form class="flex-row" onsubmit={(event) => { ... }}>
    <AccountInput bind:value={...} required />
    <input size={40} bind:value={...} />
    <button type="submit">{_("Move")}</button>
    {#if info.importer_name}
      <button type="button" onclick={() => { extract(file.name, info.importer_name); }}>
        {is_cached ? _("Continue") : _("Extract")}
      </button>
      {info.importer_name}
    {/if}
  </form>
{/each}
```

**前端展示效果**：
- 每个匹配的 importer 显示为独立的一行
- 每行包含账户输入框、重命名输入框、移动按钮和提取按钮
- 提取按钮上显示具体的 importer 名称作为提示

### 3.4 提取执行：显式指定 Importer

当用户点击某个 importer 的 "Extract" 按钮时，前端调用 `get_extract` API 并**显式传入 importer 名称**：

```python
# json_api.py:323-327
@api_endpoint
def get_extract(filename: str, importer: str) -> Sequence[Any]:
    entries = g.ledger.ingest.extract(filename, importer)
    return list(map(serialise, entries))
```

后端 `extract()` 方法根据名称从字典中获取唯一的 importer：

```python
# ingest.py:363-412
def extract(self, filename: str, importer_name: str) -> list[Directive]:
    if not self.module_path:
        raise MissingImporterConfigError
    
    self.load_file()  # 重新加载（如果有变更）
    
    try:
        path = Path(filename)
        importer = self.importers[importer_name]  # 通过名称精确获取
        new_entries = extract_from_file(
            importer,
            path,
            existing_entries=self.ledger.all_entries,
        )
    except Exception as exc:
        raise ImporterExtractError from exc
    
    # 应用 HOOKS 处理
    for hook_fn in self.hooks:
        # ... 钩子处理逻辑
    
    return new_entries
```

### 3.5 冲突解决策略总结

| 阶段 | 处理方式 | 代码位置 |
|------|---------|---------|
| 格式识别 | 收集所有 `identify()` 返回 `True` 的 importer | [ingest.py:356-360](file:///E:/solo-code-2/fava/src/fava/core/ingest.py#L356-L360) |
| 前端展示 | 每个匹配的 importer 显示为独立选项 | [FileList.svelte:54-110](file:///E:/solo-code-2/fava/frontend/src/reports/import/FileList.svelte#L54-L110) |
| 提取执行 | 用户点击特定按钮，显式传入 importer 名称 | [json_api.py:323-327](file:///E:/solo-code-2/fava/src/fava/json_api.py#L323-L327) |
| 最终解析 | 通过名称从字典精确获取唯一 importer | [ingest.py:381](file:///E:/solo-code-2/fava/src/fava/core/ingest.py#L381) |

**设计意图**：
- 避免自动优先级可能导致的错误匹配
- 让用户根据业务知识做出最终决策
- 保持系统的透明性和可控性

---

## 四、核心类与数据结构关系图

```
┌─────────────────────────────────────────────────────────────┐
│                     Beancount Ledger                        │
│  (包含 custom "fava-option" 指令)                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                parse_options() [fava_options.py]           │
│  - 过滤 type == "fava-option" 的 custom 指令                │
│  - 解析 import-config → FavaOptions.import_config           │
│  - 解析 import-dirs  → FavaOptions.import_dirs[]            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    IngestModule [ingest.py]                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  load_file()                                          │  │
│  │  - 检查 module_path 存在性和修改时间                  │  │
│  │  - 调用 load_import_config()                          │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │  load_import_config()                                 │  │
│  │  - run_path() 动态执行外部 Python 文件                │  │
│  │  - 提取 CONFIG 列表中的 Importer 对象                 │  │
│  │  - 提取 HOOKS 列表                                    │  │
│  │  - 包装为 WrappedImporter，存入 self.importers 字典   │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │  import_data()                                        │  │
│  │  - 遍历所有 import_dirs 目录                          │  │
│  │  - 对每个文件，调用所有 importer.identify()           │  │
│  │  - 收集所有返回 True 的 importer                      │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│  ┌───────────────────────────▼───────────────────────────┐  │
│  │  extract(filename, importer_name)                     │  │
│  │  - 通过 importer_name 从字典精确获取 importer         │  │
│  │  - 调用 extract_from_file() 提取交易                  │  │
│  │  - 应用 HOOKS 后处理                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   WrappedImporter [ingest.py]               │
│  - importer: 原始 Importer 对象                             │
│  - name: 安全获取 importer 名称                             │
│  - identify(): 安全调用 identify，异常捕获 + 类型验证       │
│  - file_import_info(): 获取账户、日期、文件名信息            │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、关键技术要点总结

### 5.1 动态加载机制
- 使用 `runpy.run_path()` 而非 `import` 语句，支持从任意路径加载配置
- 配置文件必须定义 `CONFIG` 列表，可选定义 `HOOKS` 列表
- 基于修改时间（`mtime_ns`）实现智能缓存，避免重复加载

### 5.2 安全调用机制
- `WrappedImporter` 包装类提供三层保护：
  1. `_catch_any` 装饰器捕获所有异常，转换为标准化错误
  2. `_assert_type` 验证返回值类型，防止类型错误
  3. 方法参数和返回值都有明确的类型注解

### 5.3 冲突解决设计
- **无优先级**：系统不假设任何 importer 的优先级
- **全收集**：所有匹配的 importer 都返回给前端
- **用户决策**：最终选择由用户通过界面操作完成
- **显式指定**：提取操作必须显式传入 importer 名称

### 5.4 目录遍历策略
- `walk_dir()` 函数忽略常见开发目录（`.git`, `.venv`, `__pycache__` 等）
- 文件大小限制为 8MB，防止处理过大文件
- 使用 `seen` 集合去重，避免重复处理相同文件

---

## 参考文件

- 核心实现：[ingest.py](file:///E:/solo-code-2/fava/src/fava/core/ingest.py)
- 选项解析：[fava_options.py](file:///E:/solo-code-2/fava/src/fava/core/fava_options.py)
- API 端点：[json_api.py](file:///E:/solo-code-2/fava/src/fava/json_api.py)
- 前端导入页面：[Import.svelte](file:///E:/solo-code-2/fava/frontend/src/reports/import/Import.svelte)
- 文件列表组件：[FileList.svelte](file:///E:/solo-code-2/fava/frontend/src/reports/import/FileList.svelte)
- 前端数据处理：[index.ts](file:///E:/solo-code-2/fava/frontend/src/reports/import/index.ts)
