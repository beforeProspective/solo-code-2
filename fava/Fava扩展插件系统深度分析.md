# Fava 外部插件协同扩展系统深度分析

本文档深入分析 Fava 扩展系统的三大核心机制：扩展加载流程、entries 操作权限与副作用、前端数据注入与组件绑定。

---

## 一、ExtensionModule 初始化：Python 扩展的加载与实例化

### 1.1 整体加载流程

`ExtensionModule` 的初始化遵循以下完整调用链：

```
FavaLedger.__init__() [L396]
    ↳ ExtensionModule(ledger) [L36]
    ↳ FavaLedger.load_file() [L405]
        ↳ load_uncached() → 解析原始账本
        ↳ group_entries_by_type() → 按类型分组 entries
        ↳ parse_options() → 解析 Fava 选项
        ↳ ExtensionModule.load_file() [L434]
            ↳ 扫描 "fava-extension" 自定义指令
            ↳ find_extensions() → 动态导入模块
            ↳ 实例化 FavaExtensionBase 子类
        ↳ ExtensionModule.after_load_file() [L441]
```

代码位置参考：
- [FavaLedger.__init__](file:///E:/solo-code-2/fava/src/fava/core/__init__.py#L378-L405)
- [ExtensionModule.load_file](file:///E:/solo-code-2/fava/src/fava/core/extensions.py#L41-L76)

### 1.2 配置发现机制

扩展通过 Beancount 账本中的 `custom` 指令声明：

```beancount
2020-01-01 custom "fava-extension" "fava.ext.auto_commit"
2020-01-01 custom "fava-extension" "my_extension" "{'config_key': 'value'}"
```

在 `load_file()` 方法中 [L44-L76]：
1. 从 `all_entries_by_type.Custom` 过滤出 `type == "fava-extension"` 的条目
2. `entry.values[0].value` 为扩展模块名
3. `entry.values[1].value`（可选）为配置字典字符串

### 1.3 动态导入与类发现

[find_extensions](file:///E:/solo-code-2/fava/src/fava/ext/__init__.py#L137-L182) 函数负责动态导入：

```python
# 关键步骤
sys.path.insert(0, str(base_path))           # 将账本目录加入 Python 路径
module = importlib.import_module(name)       # 动态导入模块
for _, obj in inspect.getmembers(module, inspect.isclass):
    if issubclass(obj, FavaExtensionBase) and obj != FavaExtensionBase:
        classes.append(obj)                  # 收集所有扩展子类
```

**设计要点**：
- 支持相对路径导入（相对于账本文件目录）
- 一个模块可包含多个扩展类
- 去重机制：`_loaded_extensions` 集合防止重复实例化 [L68]

### 1.4 实例化与配置解析

[FavaExtensionBase.__init__](file:///E:/solo-code-2/fava/src/fava/ext/__init__.py#L62-L89) 执行以下操作：

1. **端点注册**：扫描所有被 `@extension_endpoint` 装饰的方法，注册到 `self.endpoints` 字典，键为 `(name, methods)`
2. **配置解析**：使用 `ast.literal_eval(config)` 安全解析配置字符串
3. **ledger 引用**：保存对 `FavaLedger` 的引用，获得完全访问权限

### 1.5 实例存储结构

```python
self._instances: dict[str, FavaExtensionBase] = {}  # 扩展实例字典，键为类名
self._loaded_extensions: set[type] = set()           # 已加载的类集合
self.errors: list[FavaExtensionError] = []           # 扩展加载错误
```

---

## 二、after_load_file 钩子：entries 操作权限与副作用

### 2.1 生命周期调用时机

`after_load_file` 在 `FavaLedger.load_file()` 的**最后一步**被调用 [L441]：

```python
# 所有核心模块加载完成后
self.accounts.load_file()
self.attributes.load_file()
# ... 其他模块 ...
self.extensions.load_file()      # 加载扩展
# ... 其他模块 ...
self.extensions.after_load_file()  # 触发钩子
```

代码位置：[FavaLedger.load_file](file:///E:/solo-code-2/fava/src/fava/core/__init__.py#L407-L441)

### 2.2 entries 的实际可变性

尽管类型标注为 `Sequence[Directive]`，但 **实际运行时类型为 Python `list`**：

```python
# 类型标注（仅作类型提示）
all_entries: Sequence[Directive]

# 实际赋值（来自 beancount loader，返回 list）
self.all_entries, self.load_errors, self.options = load_uncached(...)
```

**关键事实**：
- `Sequence` 是只读协议，但 Python `list` 是可变的
- 扩展获得 `self.ledger` 引用后，可直接操作内存中的 entries

### 2.3 可执行的操作

扩展在 `after_load_file` 中可执行以下操作：

#### 2.3.1 修改 entries 列表本身

```python
def after_load_file(self):
    # 1. 新增条目
    new_entry = Transaction(...)
    self.ledger.all_entries.append(new_entry)
    
    # 2. 删除条目
    self.ledger.all_entries[:] = [e for e in self.ledger.all_entries if condition(e)]
    
    # 3. 替换整个列表
    self.ledger.all_entries = modified_list
```

#### 2.3.2 修改分组视图

`all_entries_by_type` 是 [EntriesByType](file:///E:/solo-code-2/fava/src/fava/core/group_entries.py#L17-L31) 命名元组，每个字段也是 `list`：

```python
def after_load_file(self):
    # 直接向分组中添加条目
    self.ledger.all_entries_by_type.Transaction.append(new_tx)
    
    # 注意：all_entries 和 all_entries_by_type 是独立存储的
    # 修改一个不会自动同步到另一个！
```

> **重要警告**：`all_entries` 和 `all_entries_by_type` 在 `group_entries_by_type` 时创建了独立的列表引用。修改其中一个不会自动反映到另一个，可能导致数据不一致。

#### 2.3.3 修改条目内部属性

```python
def after_load_file(self):
    for entry in self.ledger.all_entries:
        if isinstance(entry, Transaction):
            # 修改元数据
            entry.meta["custom_tag"] = "processed"
            # 修改 Posting
            for posting in entry.postings:
                posting.meta["reviewed"] = True
```

### 2.4 对核心报表模块的副作用

#### 2.4.1 缓存失效问题

`FavaLedger` 中有两个 LRU 缓存可能受到影响：

```python
self.get_filtered = lru_cache(maxsize=16)(self._get_filtered)
self.get_entry = lru_cache(maxsize=16)(self._get_entry)
```

- `get_filtered` 缓存 `FilteredLedger` 实例，包含 `entries` 引用
- `get_entry` 按哈希查找条目

**风险**：如果扩展修改了 `all_entries`，但缓存的 `FilteredLedger` 仍然持有旧引用，可能导致报表显示不一致。

#### 2.4.2 依赖模块受影响列表

| 模块 | 依赖 | 影响评估 |
|------|------|----------|
| [FilteredLedger](file:///E:/solo-code-2/fava/src/fava/core/__init__.py#L104-L191) | `self.entries = ledger.all_entries` | 直接引用，修改 all_entries 会影响过滤结果 |
| [Tree](file:///E:/solo-code-2/fava/src/fava/core/tree.py) | 基于 entries 构建账户树 | entries 变更需要重建树 |
| [AccountDict](file:///E:/solo-code-2/fava/src/fava/core/accounts.py) | Open/Close entries | 账户元数据依赖原始 entries |
| [ChartModule](file:///E:/solo-code-2/fava/src/fava/core/charts.py) | 各种报表图表数据 | 图表计算基于 entries |
| [QueryShell](file:///E:/solo-code-2/fava/src/fava/core/query_shell.py) | BQL 查询执行 | 查询结果基于当前 entries |
| [AttributesModule](file:///E:/solo-code-2/fava/src/fava/core/attributes.py) | payees, tags, links, years | 从 entries 提取属性 |

#### 2.4.3 最佳实践与风险

**安全做法**：
```python
def after_load_file(self):
    # 1. 修改后手动调用 cache_clear
    self.ledger.get_filtered.cache_clear()
    self.ledger.get_entry.cache_clear()
    
    # 2. 保持 all_entries 和 all_entries_by_type 同步
    self.ledger.all_entries_by_type = group_entries_by_type(self.ledger.all_entries)
    
    # 3. 重新加载依赖模块
    self.ledger.accounts.load_file()
    self.ledger.attributes.load_file()
```

**潜在风险**：
- **破坏排序**：entries 必须按日期排序，否则很多算法会出错
- **哈希失效**：`hash_entry()` 基于内容，修改后需要注意 `get_entry` 的缓存
- **并发问题**：多请求环境下 entries 突变可能导致竞态条件
- **错误处理**：扩展抛出的异常可能中断整个加载流程

---

## 三、前端数据注入与组件绑定机制

### 3.1 后端向前端传递扩展元数据

扩展元数据通过 [LedgerData](file:///E:/solo-code-2/fava/src/fava/internal_api.py#L53-L76) 传递给前端：

```python
# 后端：internal_api.py L123
return LedgerData(
    # ...
    extensions=ledger.extensions.extension_details,  # [L83-L88]
    # ...
)
```

[ExtensionDetails](file:///E:/solo-code-2/fava/src/fava/core/extensions.py#L23-L30) 包含：
```python
@dataclass
class ExtensionDetails:
    name: str              # 扩展类名
    report_title: str | None  # 报告页面标题
    has_js_module: bool    # 是否有前端 JS 模块
```

前端在 [stores/index.ts](file:///E:/solo-code-2/fava/frontend/src/stores/index.ts#L21) 中接收：
```typescript
export const extensions = derived(ledgerData, (v) => v.extensions);
```

### 3.2 自定义报告页面渲染

#### 3.2.1 路由与模板渲染

后端路由定义在 [application.py L374-L388](file:///E:/solo-code-2/fava/src/fava/application.py#L374-L388)：

```python
@app.route("/<bfile>/extension/<extension_name>/")
def extension_report(extension_name: str) -> str:
    ext = g.ledger.extensions.get_extension(extension_name)
    g.extension = ext
    # 从扩展目录的 templates/ 子目录加载模板
    template = ext.jinja_env.get_template(f"{ext.name}.html")
    content = Markup(template.render(ledger=g.ledger, extension=ext))
    return render_template("_layout.html", content=content, page_title=ext.report_title)
```

模板环境配置：[FavaExtensionBase.jinja_env](file:///E:/solo-code-2/fava/src/fava/ext/__init__.py#L101-L108)
- 使用 `FileSystemLoader` 加载扩展目录下的 `templates/` 目录
- 与 Flask 全局模板环境形成 `ChoiceLoader`，可复用全局模板

#### 3.2.2 数据注入方式

扩展通过 Jinja 模板向前端传递数据有三种方式：

**方式一：内嵌 JSON 数据（推荐用于组件渲染）**
```html
<!-- FavaExtTest.html L27 -->
<svelte-component type="charts">
  <script type="application/json">{{extension.chart_data()|tojson}}</script>
</svelte-component>
```

**方式二：模板变量直接渲染**
```html
<h4>{{ portfolio.title }}</h4>
{% for account, balance in accounts %}
  <p>{{ account }}: {{ balance }}</p>
{% endfor %}
```

**方式三：通过 API 端点异步获取**（详见 3.4 节）

### 3.3 Svelte 自定义元素绑定机制

#### 3.3.1 自定义元素注册

在 [app.ts L54-L65](file:///E:/solo-code-2/fava/frontend/src/app.ts#L54-L65) 中注册：

```typescript
function defineCustomElements() {
  customElements.define("svelte-component", SvelteCustomElement);
  customElements.define("tree-table", TreeTableCustomElement);
  // ...
}
```

#### 3.3.2 SvelteCustomElement 工作原理

[SvelteCustomElement](file:///E:/solo-code-2/fava/frontend/src/svelte-custom-elements.ts#L83-L120) 是核心桥梁：

```typescript
connectedCallback(): void {
  const type = this.getAttribute("type");  // "charts" | "query-table" | "tree-table"
  const comp = components.find((t) => t.type === type);
  const script = this.querySelector("script");
  
  // 解析内嵌 JSON 数据并验证
  const data = script?.type === "application/json" ? JSON.parse(script.innerHTML) : null;
  
  // 挂载 Svelte 组件
  this.destroy = comp.render(this, data);
}
```

#### 3.3.3 组件注册表

[components 数组](file:///E:/solo-code-2/fava/frontend/src/svelte-custom-elements.ts#L58-L75) 预定义了可用组件：

| type | 组件 | 验证器 |
|------|------|--------|
| `charts` | `ChartSwitcher.svelte` | `chart_validator` |
| `query-table` | `QueryTable.svelte` | `query_table_validator` |
| `tree-table` | `TreeTable.svelte` | `account_hierarchy_validator` |

每个组件通过 [SvelteCustomElementComponent](file:///E:/solo-code-2/fava/frontend/src/svelte-custom-elements.ts#L23-L56) 封装：
- 类型安全的 props 验证
- 自动错误处理（数据无效时显示友好错误）

### 3.4 扩展 JS 模块加载机制

#### 3.4.1 后端提供 JS 模块

路由定义：[application.py L366-L372](file:///E:/solo-code-2/fava/src/fava/application.py#L366-L372)

```python
@app.route("/<bfile>/extension_js_module/<extension_name>.js")
def extension_js_module(extension_name: str) -> Response:
    ext = g.ledger.extensions.get_extension(extension_name)
    return send_file(ext.extension_dir / f"{ext.name}.js")
```

文件位置约定：扩展目录下的 `{ClassName}.js`，如 `FavaExtTest.js`

#### 3.4.2 前端模块加载

[extensions.ts](file:///E:/solo-code-2/fava/frontend/src/extensions.ts) 负责前端管理：

```typescript
async function load_extension_module(name: string): Promise<ExtensionData> {
  const url = $urlForRaw(`extension_js_module/${name}.js`);
  const mod = await import(url);  // 动态导入 ES 模块
  
  if (typeof mod.default === "object") {
    return new ExtensionData(mod.default, { api: new ExtensionApiImpl(name) });
  }
}
```

#### 3.4.3 ExtensionModule 接口

[extension-api.d.ts](file:///E:/solo-code-2/fava/frontend/src/extension-api.d.ts) 定义：

```typescript
export interface ExtensionModule {
  init?: (c: ExtensionContext) => void | Promise<void>;
  onPageLoad?: (c: ExtensionContext) => void;
  onExtensionPageLoad?: (c: ExtensionContext) => void;
}

export interface ExtensionContext {
  api: ExtensionApi;  // API 请求包装器
}
```

#### 3.4.4 扩展 API 请求

[ExtensionApiImpl](file:///E:/solo-code-2/fava/frontend/src/extensions.ts#L18-L68) 提供统一请求方式：

```typescript
async request(
  endpoint: string,
  method: "GET" | "PUT" | "POST" | "DELETE",
  params?: Record<string, string | number>,
  body?: unknown,
  output: "json" | "string" | "raw" = "json",
): Promise<unknown> {
  const url = $urlForRaw(`extension/${this.#name}/${endpoint}`, params);
  const response = await fetch(url, { method, ...opts });
  // 返回解析后的数据
}
```

后端对应的 [extension_endpoint 路由](file:///E:/solo-code-2/fava/src/fava/application.py#L349-L364)：

```python
@app.route("/<bfile>/extension/<extension_name>/<endpoint>", methods=["GET", "POST", "PUT", "DELETE"])
def extension_endpoint(extension_name: str, endpoint: str) -> Response:
    ext = g.ledger.extensions.get_extension(extension_name)
    key = (endpoint, request.method)
    response = ext.endpoints[key](ext)  # 调用注册的端点方法
    return fava_app.make_response(response)
```

后端端点通过 `@extension_endpoint` 装饰器注册 [L189-L231](file:///E:/solo-code-2/fava/src/fava/ext/__init__.py#L189-L231)：

```python
@extension_endpoint
def example_data(self) -> Response:
    return jsonify(["some data"])  # 返回 JSON 响应
```

### 3.5 完整调用流程示例

以 `FavaExtTest` 为例，完整的前后端交互流程：

```
1. 用户访问 /extension/FavaExtTest/
   ↓
2. 后端 extension_report() 路由
   ↓ 加载 FavaExtTest/templates/FavaExtTest.html
   ↓ 模板中调用 extension.chart_data() 生成数据
   ↓ 数据通过 <script type="application/json"> 嵌入
   ↓
3. 前端 _layout.html 加载
   ↓ app.ts 初始化，定义 <svelte-component>
   ↓ <svelte-component> 的 connectedCallback 触发
   ↓ 解析 JSON 数据，验证后挂载 ChartSwitcher.svelte
   ↓
4. 前端 JS 模块加载
   ↓ handleExtensionPageLoad() 检查 has_js_module
   ↓ 动态 import /extension_js_module/FavaExtTest.js
   ↓ 调用模块的 init() 和 onExtensionPageLoad()
   ↓
5. 扩展内 API 调用
   ↓ ctx.api.get("example_data", {})
   ↓ → GET /extension/FavaExtTest/example_data
   ↓ → 后端调用 ext.endpoints[("example_data", "GET")](ext)
   ↓ 返回 JSON 响应，前端更新 UI
```

---

## 四、总结

### 4.1 扩展系统架构分层

```
┌─────────────────────────────────────────────────────┐
│                FavaLedger (核心状态)                │
│  all_entries, all_entries_by_type, prices, ...      │
└─────────────┬───────────────────────────┬───────────┘
              │                           │
              ▼                           ▼
┌─────────────────────┐       ┌───────────────────────────┐
│  ExtensionModule    │       │  其他核心模块              │
│  - 加载/实例化扩展  │       │  accounts, charts, query   │
│  - 生命周期调度     │       │                           │
└─────────┬───────────┘       └─────────────┬─────────────┘
          │                                 │
          ▼                                 ▼
┌─────────────────────┐       ┌───────────────────────────┐
│  FavaExtensionBase  │       │  前端 Svelte 组件          │
│  - 钩子方法         │       │  ChartSwitcher, QueryTable │
│  - 端点注册         │       │                           │
│  - Jinja 模板环境   │       └─────────────┬─────────────┘
│  - JS 模块路由      │                     │
└─────────┬───────────┘                     ▼
          │                   ┌───────────────────────────┐
          ▼                   │  扩展 JS 模块              │
┌─────────────────────┐       │  init, onPageLoad, API    │
│  自定义 Jinja 模板  │       │                           │
│  <svelte-component> │       └───────────────────────────┘
└─────────────────────┘
```

### 4.2 关键设计权衡

| 设计决策 | 优点 | 缺点 |
|---------|------|------|
| `after_load_file` 直接暴露可变 entries | 强大灵活，扩展可深度定制数据 | 不安全，可能破坏内部状态 |
| 类型标注 `Sequence` 但实际是 `list` | 兼容 beancount 生态 | 类型安全假象，易误用 |
| `<script type="application/json">` 内嵌数据 | SSR 友好，首屏快，无额外请求 | HTML 体积增大 |
| 动态 import 扩展 JS 模块 | 按需加载，隔离性好 | 首屏后加载，可能有闪烁 |
| `@extension_endpoint` 装饰器 | 声明式 API，简洁 | 路由注册隐式，不易追踪 |

### 4.3 扩展开发最佳实践

1. **entries 修改**：修改后务必同步 `all_entries_by_type` 并清除缓存
2. **性能考虑**：避免在 `after_load_file` 中执行耗时操作，这会阻塞页面加载
3. **错误处理**：钩子方法应捕获并适当处理异常，避免导致整个 Fava 加载失败
4. **前端组件**：优先使用 `<svelte-component>` 复用内置组件，避免重复造轮子
5. **版本兼容**：扩展应指定兼容的 Fava 版本，避免内部 API 变更导致失效

---

**文件位置索引**：
- 扩展核心调度：[extensions.py](file:///E:/solo-code-2/fava/src/fava/core/extensions.py)
- 扩展基类与发现：[ext/__init__.py](file:///E:/solo-code-2/fava/src/fava/ext/__init__.py)
- 前端扩展管理：[extensions.ts](file:///E:/solo-code-2/fava/frontend/src/extensions.ts)
- Svelte 自定义元素：[svelte-custom-elements.ts](file:///E:/solo-code-2/fava/frontend/src/svelte-custom-elements.ts)
- 应用路由：[application.py](file:///E:/solo-code-2/fava/src/fava/application.py)
- 扩展示例：[fava_ext_test/__init__.py](file:///E:/solo-code-2/fava/src/fava/ext/fava_ext_test/__init__.py)
