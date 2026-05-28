# Fava QueryShell 模块深度分析

## 一、QueryShell 的查询执行流程与数据结构转换

### 1.1 完整调用链

前端发起查询请求后，调用链如下：

```
HTTP GET /api/query
  → json_api.get_query()                          # [json_api.py:316]
    → QueryShell.execute_query_serialised()        # [query_shell.py:167]
      → FavaBQLShell.run()                         # [query_shell.py:89]
        → beanquery.connect() → 创建查询上下文      # [query_shell.py:91]
        → BQLShell.onecmd(query) → 命令派发         # [query_shell.py:98]
          → on_Select(statement)                    # [query_shell.py:134]
            → self.context.execute(statement)       # [query_shell.py:135]
              → 返回 beanquery.Cursor
```

### 1.2 beanquery 驱动连接与查询上下文

[FavaBQLShell.run()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L89-L108) 每次执行查询时，都会重新建立与 beanquery 的连接：

```python
self.context = connect(
    "beancount:",
    entries=entries,
    errors=self.ledger.errors,
    options=self.ledger.options,
)
```

`beanquery.connect()` 使用 `"beancount:"` 协议标识符创建查询上下文，传入账本条目（entries）、错误列表（errors）和选项映射（options）。这意味着每次查询都会基于最新的账本快照执行，保证数据一致性。

### 1.3 命令派发机制

`self.onecmd(query)` 继承自 [BQLShell](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L79)（beanquery 的交互式 Shell 基类）。`onecmd` 方法负责：

1. **词法/语法解析**：将查询字符串解析为 AST
2. **命令路由**：根据解析结果派发到对应的 `on_` 前缀方法
3. **错误捕获**：解析失败抛出 `ParseError`，编译失败抛出 `CompilationError`

关键的重写点在 [on_Select()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L134-L135)：

```python
def on_Select(self, statement: str) -> Cursor:
    return self.context.execute(statement)
```

原版 BQLShell 的 `on_Select` 会将 Cursor 格式化输出到终端，而 FavaBQLShell 直接返回 Cursor 对象，使得调用方可以获取原始数据结构进行后续处理。

### 1.4 非查询命令的处理

对于非 SELECT 类命令（如 `help`、`run`、`exit` 等），FavaBQLShell 做了特殊处理：

- **禁用命令**：[noop()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L125-L131) 方法将 `Reload`、`exit`、`quit`、`EOF` 等命令替换为无操作
- **run 命令**：[do_run()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L137-L154) 从账本中查找已保存的命名查询并执行
- **文本输出**：非 SELECT 命令的结果写入 `io.StringIO`，最终作为字符串返回

### 1.5 数据结构类型转换协作

beanquery 的 `Cursor` 对象提供两个关键属性：

| 属性 | 类型 | 说明 |
|------|------|------|
| `cursor.description` | `list[ColumnDescription]` | 每列的 `name` 和 `datatype` 元信息 |
| `cursor` (可迭代) | 迭代器，每行为 `tuple` | 包含 Beancount 原生数据类型 |

beanquery 返回的行数据可能包含以下 Beancount 特有类型：

- `beancount.core.amount.Amount`（金额：number + currency）
- `beancount.core.position.Position`（持仓：units + cost）
- `beancount.core.inventory.Inventory`（库存：Position 列表）
- `decimal.Decimal`（高精度数值）
- `datetime.date`（日期）
- `set`（集合）
- 基本类型：`str`、`int`、`bool`

Fava 在 [_serialise()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L242-L253) 中将这些类型分两步转换：

**第一步：列类型映射**

```python
dtypes = [
    COLUMNS.get(c.datatype, ObjectColumn)(c.name)
    for c in cursor.description
]
```

[COLUMNS](file:///e:/solo-code-2/fava/src/fava/core/query.py#L160-L170) 字典将 beanquery 的 Python 类型映射到 Fava 的列描述类：

| beanquery 数据类型 | Fava 列描述类 | 序列化策略 |
|---|---|---|
| `Amount` | `AmountColumn` | 透传（依赖 JSON Provider 转为字符串） |
| `Decimal` | `DecimalColumn` | 透传（simplejson 原生支持） |
| `Inventory` | `InventoryColumn` | `UNITS.apply_inventory()` → `SimpleCounterInventory` |
| `Position` | `PositionColumn` | 透传（依赖 JSON Provider 转为字符串） |
| `bool` | `BoolColumn` | 透传 |
| `datetime.date` | `DateColumn` | 透传（依赖 JSON Provider 转为字符串） |
| `int` | `IntColumn` | 透传 |
| `set` | `SetColumn` | 透传 |
| `str` | `StrColumn` | 透传 |
| 其他 | `ObjectColumn` | `str()` 降级为字符串 |

**第二步：逐行逐列映射**

```python
mappers = [d.serialise for d in dtypes]
mapped_rows = [
    tuple(mapper(row[i]) for i, mapper in enumerate(mappers))
    for row in cursor
]
```

每列根据其类型描述类的 `serialise` 静态方法进行值转换，最终组装为 `QueryResultTable(dtypes, mapped_rows)`。

---

## 二、查询超时控制与防挂起机制分析

### 2.1 现状：缺乏超时控制

经过对代码库的全面搜索（关键词：`timeout`、`signal.alarm`、`threading.Timer`、`SIGALRM`、`query.*limit`、`max.*row`），**Fava 当前没有任何查询级别的超时控制或强制中断机制**。

具体表现：

1. **[execute_query_serialised()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L167-L185)** 同步阻塞执行查询，没有超时参数
2. **[FavaBQLShell.run()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L89-L108)** 直接调用 `onecmd`，无任何执行时间限制
3. **[on_Select()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L134-L135)** 直接调用 `context.execute()`，无行数或时间限制
4. **Flask 请求处理层**：无请求级别的超时中间件
5. **WSGI 服务器层**：生产环境使用的 cheroot（见 [cli.py:151-158](file:///e:/solo-code-2/fava/src/fava/cli.py#L151-L158)）未配置请求超时

### 2.2 风险场景

一个需要扫描全表并执行上万次比对的超长关联查询可能导致：

- **单线程阻塞**：Flask + cheroot 默认使用线程池处理请求，一个耗时查询会占用一个工作线程
- **级联阻塞**：如果所有工作线程都被慢查询占满，服务器将无法响应新请求
- **内存溢出**：超大数据集的查询结果全部加载到内存（`_serialise` 会遍历整个 Cursor），可能导致 OOM
- **无限循环**：虽然 beanquery 本身的查询引擎不太可能产生真正的无限循环，但极端复杂的查询（如笛卡尔积关联）可能产生天文数字级的结果集

### 2.3 可能的防挂起方案

针对上述风险，可以考虑以下改进方向：

#### 方案一：查询执行超时（signal 方案，仅限 POSIX）

```python
import signal

class QueryTimeoutError(FavaShellError):
    """Query execution timed out."""

def _timeout_handler(signum, frame):
    raise QueryTimeoutError("Query timed out")

def run_with_timeout(entries, query, timeout_seconds=30):
    old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(timeout_seconds)
    try:
        result = self.shell.run(entries, query)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)
    return result
```

**局限**：`signal.SIGALRM` 仅在 Unix/Linux 上可用，Windows 不支持。且信号只在主线程生效。

#### 方案二：子进程隔离 + 超时

使用 `multiprocessing` 在子进程中执行查询，主进程通过 `Process.join(timeout)` 控制超时：

```python
from multiprocessing import Process, Queue

def _run_query_in_process(entries, query, result_queue, timeout=30):
    def target():
        try:
            result = shell.run(entries, query)
            result_queue.put(("ok", result))
        except Exception as e:
            result_queue.put(("error", str(e)))

    result_queue = Queue()
    p = Process(target=target)
    p.start()
    p.join(timeout=timeout)
    if p.is_alive():
        p.terminate()
        raise QueryTimeoutError(f"Query exceeded {timeout}s limit")
```

**优势**：跨平台，可强制终止；**劣势**：进程间序列化开销大，entries 数据需要跨进程传输。

#### 方案三：行数限制（应用层）

在 [_serialise()](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py#L242-L253) 中添加最大行数限制：

```python
MAX_QUERY_ROWS = 10000

def _serialise(cursor: Cursor) -> QueryResultTable:
    dtypes = [...]
    mappers = [d.serialise for d in dtypes]
    mapped_rows = []
    for i, row in enumerate(cursor):
        if i >= MAX_QUERY_ROWS:
            break
        mapped_rows.append(
            tuple(mapper(row[i]) for i, mapper in enumerate(mappers))
        )
    return QueryResultTable(dtypes, mapped_rows)
```

这是最简单且最有效的方案，直接限制结果集大小，防止内存溢出和过长响应时间。

#### 方案四：WSGI 层超时中间件

在 cheroot 或 gunicorn 前端配置请求级超时，虽然不能中断 Python 执行线程，但可以在 HTTP 层断开连接（客户端收到超时响应），后台线程仍会执行完毕但结果被丢弃。

### 2.4 风险缓解因素

尽管缺乏显式超时机制，以下因素在一定程度上缓解了风险：

1. **beanquery 是声明式查询引擎**：不支持用户自定义函数或递归，不存在真正的无限循环
2. **数据规模有限**：Beancount 账本通常条目量在千到万级，关联查询的笛卡尔积有实际上界
3. **Flask 的隐式保护**：Werkzeug 开发服务器和 cheroot 的线程池在请求异常断开时会清理资源

---

## 三、自定义序列化工具分析

### 3.1 两层序列化架构

Fava 的查询结果序列化采用**两层架构**：

```
beanquery 原生类型
    ↓ 第一层：列类型序列化（_serialise + Column.serialise）
中间表示（SerialisedQueryRowValue）
    ↓ 第二层：JSON 编码（FavaJSONProvider + _json_default）
JSON 字符串
```

### 3.2 第一层：列类型序列化

定义在 [query.py](file:///e:/solo-code-2/fava/src/fava/core/query.py) 中，每个列描述类的 `serialise` 静态方法负责将 Beancount 原生类型转换为中间表示：

#### Inventory → SimpleCounterInventory

[InventoryColumn.serialise()](file:///e:/solo-code-2/fava/src/fava/core/query.py#L147-L157) 是最关键的转换：

```python
class InventoryColumn(BaseColumn):
    dtype: str = "Inventory"

    @staticmethod
    def serialise(val: Inventory | None) -> SimpleCounterInventory | None:
        return UNITS.apply_inventory(val) if val is not None else None
```

转换路径：`Inventory` → `UNITS.apply_inventory()` → `SimpleCounterInventory`

[UNITS.apply_inventory()](file:///e:/solo-code-2/fava/src/fava/core/conversion.py#L167-L175) 的实现：

```python
def apply_inventory(self, inventory: Inventory) -> SimpleCounterInventory:
    counter = SimpleCounterInventory()
    for pos in inventory:
        counter.add(pos.units.currency, pos.units.number)
    return counter
```

这执行了**降维操作**：将 Inventory（包含多个 Position，每个 Position 有 units + cost）简化为 `SimpleCounterInventory`（按货币聚合的金额字典，丢弃 cost 信息）。

[SimpleCounterInventory](file:///e:/solo-code-2/fava/src/fava/core/inventory.py#L43-L78) 继承自 `dict[str, Decimal]`，例如：

```python
# 原始 Inventory:
# Inventory([Position(Amount(100, "USD"), Cost(90, "EUR", ...)),
#            Position(Amount(200, "USD"), None),
#            Position(Amount(50, "EUR"), None)])

# 序列化后的 SimpleCounterInventory:
# {"USD": Decimal("300"), "EUR": Decimal("50")}
```

#### Position — 透传

[PositionColumn.serialise()](file:///e:/solo-code-2/fava/src/fava/core/query.py#L114-L117) 继承自 `BaseColumn.serialise()`，直接透传 Position 对象。Position 在第二层由 `_json_default` 转为字符串。

#### Amount — 透传

[AmountColumn.serialise()](file:///e:/solo-code-2/fava/src/fava/core/query.py#L128-L131) 同样透传 Amount 对象，在第二层由 `_json_default` 转为字符串。

#### Object — 降级字符串化

[ObjectColumn.serialise()](file:///e:/solo-code-2/fava/src/fava/core/query.py#L135-L143) 对所有无法识别的类型调用 `str()` 降级处理：

```python
class ObjectColumn(BaseColumn):
    dtype: str = "object"

    @staticmethod
    def serialise(val: object) -> str:
        return str(val)
```

### 3.3 第二层：JSON 编码

[FavaJSONProvider](file:///e:/solo-code-2/fava/src/fava/core/charts.py#L73-L82) 是 Flask 的自定义 JSON 提供者，使用 `simplejson` 库配合自定义的 [_json_default](file:///e:/solo-code-2/fava/src/fava/core/charts.py#L46-L58) 函数：

```python
class FavaJSONProvider(JSONProvider):
    def dumps(self, obj: Any, **_kwargs: Any) -> str:
        return simplejson_dumps(
            obj, sort_keys=True, separators=(",", ":"), default=_json_default
        )
```

`_json_default` 函数处理 `simplejson` 不认识的类型：

| 输入类型 | 转换方式 | 输出 |
|----------|----------|------|
| `datetime.date` | `str(o)` | `"2024-01-15"` |
| `Amount` | `str(o)` | `"100.00 USD"` |
| `Booking` | `str(o)` | 枚举字符串 |
| `Position` | `str(o)` | `"100.00 USD {90.00 EUR, 2023-01-01}"` |
| `set` / `frozenset` | `list(o)` | JSON 数组 |
| `Pattern` | `o.pattern` | 正则字符串 |
| `dataclass` 实例 | `dict(field.name: getattr(o, field))` | JSON 对象 |
| `MISSING` | `None` | `null` |

对于查询结果中经过第一层序列化后的类型：

- **`SimpleCounterInventory`**：继承自 `dict[str, Decimal]`，`simplejson` 原生支持 `dict`，`Decimal` 也由 `simplejson` 原生序列化为 JSON number
- **`Position`**：由 `_json_default` 调用 `str()` 转为可读字符串
- **`Decimal`**：`simplejson` 原生支持，转为 JSON number
- **`datetime.date`**：由 `_json_default` 转为 ISO 格式字符串
- **`bool`/`int`/`str`/`None`**：JSON 原生类型，无需额外处理

### 3.4 完整序列化流程示例

以一个典型的 SELECT 查询为例：

```
SELECT account, sum(position) FROM ... GROUP BY account
```

| 步骤 | account 列 | sum(position) 列 |
|------|-----------|-----------------|
| beanquery 原始值 | `"Assets:Bank"` | `Inventory([Position(Amount(1000, "USD"), None), Position(Amount(200, "EUR"), Cost(180, "USD", ...))])` |
| 列类型映射 | `StrColumn("account")` | `InventoryColumn("sum(position)")` |
| 第一层序列化 | `"Assets:Bank"` (透传) | `SimpleCounterInventory({"USD": Decimal("1000"), "EUR": Decimal("200")})` (UNITS 降维) |
| 第二层 JSON 编码 | `"Assets:Bank"` (JSON string) | `{"EUR": 200, "USD": 1000}` (JSON object, Decimal→number) |

### 3.5 序列化的信息损失

值得注意的是，当前序列化方案存在**有意的信息损失**：

1. **Inventory → SimpleCounterInventory**：丢弃了 Position 的 cost 信息，只保留 units 按货币聚合的结果。这意味着前端无法区分同一货币下不同成本基础的持仓
2. **Position → str()**：Position 被转为人类可读的字符串（如 `"100 USD {90 EUR, 2023-01-01}"`），前端无法程序化地解析 cost 和 units 的各个组成部分
3. **Amount → str()**：同理，Amount 被转为 `"100.00 USD"` 字符串，前端需要自行解析

这种设计是**有意的权衡**：对于前端展示场景，简洁的可读表示比完整的结构化数据更实用。但对于需要精确计算的前端逻辑，可能需要在将来改为结构化 JSON 对象。

---

## 四、关键文件索引

| 文件 | 核心职责 |
|------|---------|
| [query_shell.py](file:///e:/solo-code-2/fava/src/fava/core/query_shell.py) | 查询执行入口、Shell 封装、序列化调度 |
| [query.py](file:///e:/solo-code-2/fava/src/fava/core/query.py) | 列类型定义、COLUMNS 映射表、结果数据结构 |
| [conversion.py](file:///e:/solo-code-2/fava/src/fava/core/conversion.py) | Inventory 转换策略（UNITS/AT_COST/AT_VALUE） |
| [inventory.py](file:///e:/solo-code-2/fava/src/fava/core/inventory.py) | SimpleCounterInventory / CounterInventory 定义 |
| [charts.py](file:///e:/solo-code-2/fava/src/fava/core/charts.py#L46-L82) | FavaJSONProvider 和 _json_default 定义 |
| [json_api.py](file:///e:/solo-code-2/fava/src/fava/json_api.py#L316-L320) | HTTP API 端点 get_query() |
| [application.py](file:///e:/solo-code-2/fava/src/fava/application.py#L494) | FavaJSONProvider 注册到 Flask 应用 |
| [cli.py](file:///e:/solo-code-2/fava/src/fava/cli.py#L151-L158) | WSGI 服务器（cheroot）启动配置 |
