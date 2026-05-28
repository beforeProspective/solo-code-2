# Fava 账本文件重载机制深度分析

## 目录

- [1. 缓存精确清理机制与数据旧版本残留漏洞分析](#1-缓存精确清理机制与数据旧版本残留漏洞分析)
- [2. 重载临界期内并发请求的脏数据读取与未初始化引用异常](#2-重载临界期内并发请求的脏数据读取与未初始化引用异常)
- [3. 高频重载场景下的CPU资源耗尽与内存溢出隐患](#3-高频重载场景下的cpu资源耗尽与内存溢出隐患)

---

## 1. 缓存精确清理机制与数据旧版本残留漏洞分析

### 1.1 `lru_cache` 装饰器的绑定方式

在 [FavaLedger.\_\_init\_\_](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L378-L405) 中，`get_filtered` 和 `get_entry` 并非使用常规的 `@lru_cache` 装饰器语法，而是通过手动绑定到实例属性的方式创建：

```python
self.get_filtered = lru_cache(maxsize=16)(self._get_filtered)
self.get_entry = lru_cache(maxsize=16)(self._get_entry)
```

这种绑定方式的关键设计含义是：每个 `FavaLedger` 实例拥有**独立的** lru_cache 实例，缓存不跨实例共享。`maxsize=16` 表示 `get_filtered` 最多缓存 16 种过滤参数组合的结果，`get_entry` 最多缓存 16 条按哈希值索引的条目。

### 1.2 `cache_clear()` 的调用时机与精确性

在 [FavaLedger.load_file](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L407-L441) 方法中，缓存清除的调用顺序为：

```python
def load_file(self) -> None:
    # 第一步：加载新的原始数据
    self.all_entries, self.load_errors, self.options = load_uncached(...)
    # 第二步：立即清除两个 lru_cache
    self.get_filtered.cache_clear()   # ← 行 413
    self.get_entry.cache_clear()      # ← 行 414
    # 第三步：基于新数据构建派生属性
    self.all_entries_by_type = group_entries_by_type(self.all_entries)
    self.prices = FavaPriceMap(self.all_entries_by_type.Price)
    self.fava_options, self.fava_options_errors = parse_options(...)
    # 第四步：通知各模块重新加载
    self.accounts.load_file()
    self.attributes.load_file()
    # ... 其余 9 个模块的 load_file()
    self.extensions.after_load_file()
```

`cache_clear()` 是 Python `functools.lru_cache` 提供的内置方法，它会**原子性地**清空缓存字典并重置命中/未命中统计计数器。其精确性体现在：

- **全量清除而非选择性失效**：`cache_clear()` 不需要逐条匹配参数，而是直接将底层 `OrderedDict` 清空，确保不会有任何旧版本缓存项残留
- **调用位置在数据加载之后、模块重载之前**：确保新数据已就位，旧缓存已被清除，后续模块重载时通过 `get_filtered` 获取的是基于新数据的 `FilteredLedger`

### 1.3 `get_filtered` 缓存清除所避免的漏洞

`get_filtered` 返回的是 [FilteredLedger](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L104-L291) 实例。如果不清理，旧缓存将保留指向**旧 `all_entries` 引用**的 `FilteredLedger` 对象：

| 缓存未清除时的漏洞 | 具体影响 |
|---|---|
| **过期条目集合引用** | 旧 `FilteredLedger.entries` 引用的是文件变更前的 `all_entries` 切片，新增/删除/修改的条目不会反映在过滤结果中 |
| **过期价格映射** | 旧 `FilteredLedger.ledger` 仍指向当前 `FavaLedger` 实例，但 `entries_with_all_prices`（[行 182-186](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L182-L186)）通过 `cached_property` 混合了旧 entries 和 `self.ledger.all_entries_by_type.Price`，后者已被更新，导致价格条目出现重复或遗漏 |
| **过期账户树** | `root_tree` 和 `root_tree_closed`（[行 193-203](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L193-L203)）基于旧 entries 构建的 `Tree` 不会包含新条目的余额变化，资产负债表数据陈旧 |
| **过期时间范围分页** | `_pages` 缓存的分页数据与当前条目数量不匹配，可能导致页面越界或遗漏条目 |

### 1.4 `get_entry` 缓存清除所避免的漏洞

`get_entry`（[行 618-637](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L618-L637)）通过哈希值在 `self.all_entries` 中查找条目：

```python
def _get_entry(self, entry_hash: str) -> Directive:
    return next(
        entry for entry in self.all_entries
        if entry_hash == hash_entry(entry)
    )
```

如果不清理此缓存，会出现以下问题：

| 缓存未清除时的漏洞 | 具体影响 |
|---|---|
| **返回已删除条目** | 被删除的条目仍通过缓存被返回，用户可操作（修改/删除元数据）一个在源文件中已不存在的幽灵条目 |
| **返回旧版本条目** | 被修改的条目（同一哈希值可能对应修改后内容不同的条目，或旧哈希对应的条目已被替换）会返回修改前的对象，元数据编辑会应用到过期对象 |
| **`context()` 余额计算错误** | [context()](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L639-L683) 方法依赖 `get_entry` 获取条目后遍历 `self.all_entries` 计算前后余额，若缓存返回旧条目，遍历新 `all_entries` 时 `takewhile(lambda e: e is not entry)` 可能永远无法匹配（因为旧条目对象不在新列表中），导致遍历全部条目，返回完全错误的余额 |

### 1.5 缓存清理的盲区：`FilteredLedger.cached_property` 的未清除问题

值得注意的是，`cache_clear()` 仅清除了 `get_filtered` 和 `get_entry` 两个 lru_cache。但 [FilteredLedger](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L104-L291) 自身拥有四个 `cached_property`：

- `entries_with_all_prices`（行 181-186）
- `entries_without_prices`（行 188-190）
- `root_tree`（行 193-196）
- `root_tree_closed`（行 198-203）

这些 `cached_property` 的值存储在 `FilteredLedger.__dict__` 中。虽然 `get_filtered.cache_clear()` 清除后，旧的 `FilteredLedger` 实例不再被 lru_cache 引用，但在以下情况下仍可能残留：

1. **当前请求的 `g.filtered`**：Flask 请求上下文中的 `g.filtered` 是 `cached_property`（见 [_ctx_globals_class.py 行 48-55](file:///e:/solo-code-2/fava/src/fava/_ctx_globals_class.py#L48-L55)），它引用了一个旧的 `FilteredLedger`，该实例的 `cached_property` 在请求生命周期内一直有效
2. **其他线程正在使用的旧 `FilteredLedger`**：并发请求可能已通过 `get_filtered` 获取旧实例并正在使用中，`cache_clear()` 不会影响这些已取出的实例

---

## 2. 重载临界期内并发请求的脏数据读取与未初始化引用异常

### 2.1 线程安全缺失的核心问题

`FavaLedger.load_file()` 方法**没有任何线程同步保护**。唯一的锁存在于 [FileModule.\_lock](file:///e:/solo-code-2/fava/src/fava/core/file.py#L116)（`threading.Lock()`），但它仅保护文件写入操作（`set_source`、`insert_metadata`、`insert_entries`），不保护 `load_file()` 本身。

Flask 默认使用线程级并发模型，每个请求在一个独立线程中处理。`load_file()` 可在以下入口被触发：

| 触发路径 | 代码位置 | 触发方式 |
|---|---|---|
| 请求前钩子 | [application.py 行 269](file:///e:/solo-code-2/fava/src/fava/application.py#L269) | `ledger.changed()` → `load_file()` |
| JSON API `get_changed` | [json_api.py 行 302](file:///e:/solo-code-2/fava/src/fava/json_api.py#L302) | `g.ledger.changed()` |
| JSON API 各写入端点 | [json_api.py 行 557-871](file:///e:/solo-code-2/fava/src/fava/json_api.py#L557-L871) | 多处显式调用 `g.ledger.changed()` |
| `FileModule.set_source` | [file.py 行 168](file:///e:/solo-code-2/fava/src/fava/core/file.py#L168) | 在锁内直接调用 `self.ledger.load_file()` |

### 2.2 临界区属性赋值时序与脏数据读取场景

`load_file()` 方法内部的属性赋值不是原子操作。从 [行 409-441](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L409-L441)，属性按以下顺序逐一赋值：

```
T0: self.all_entries = new_entries
T1: self.load_errors = new_errors
T2: self.options = new_options
T3: self.get_filtered.cache_clear()
T4: self.get_entry.cache_clear()
T5: self.all_entries_by_type = grouped_new
T6: self.prices = new_price_map
T7: self.fava_options, self.fava_options_errors = parsed_new
T8: self.watcher.update(...)
T9: self.accounts.load_file()       # 读 self.all_entries_by_type
T10: self.attributes.load_file()
T11: self.budgets.load_file()        # 读 self.all_entries_by_type.Custom
T12: ... 其余模块
T13: self.extensions.after_load_file()
```

并发请求在此期间可能读取到以下不一致状态：

#### 场景 A：`all_entries` 已更新但 `all_entries_by_type` 尚未更新（T0-T5 之间）

```python
# 线程1 正在执行 load_file()，刚完成 T0
self.all_entries = new_entries  # 新条目
# ← 线程2 此时进入
entries = g.ledger.all_entries_by_type.Price  # 旧分类！
```

- **影响**：[FilteredLedger.entries_with_all_prices](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L182-L186) 会将新的 `self.entries`（来自新 `all_entries`）与旧的 `self.ledger.all_entries_by_type.Price` 合并排序，导致价格条目重复或缺失
- **影响**：[BudgetModule.load_file()](file:///e:/solo-code-2/fava/src/fava/core/budgets.py#L52-L55) 读取 `self.ledger.all_entries_by_type.Custom`，会基于旧分类计算预算

#### 场景 B：`options` 已更新但 `fava_options` 尚未更新（T2-T7 之间）

```python
# 线程1 刚完成 T2
self.options = new_options
# ← 线程2 此时创建 FilteredLedger
time_filter = TimeFilter(ledger.options, ledger.fava_options, time)
```

- **影响**：[TimeFilter.\_\_init\_\_](file:///e:/solo-code-2/fava/src/fava/core/filters.py) 使用 `options` 和 `fava_options` 两个参数，若两者版本不一致，`fiscal_year_end` 可能与 `operating_currency` 的设定不匹配
- **影响**：[FavaMisc.errors](file:///e:/solo-code-2/fava/src/fava/core/misc.py#L53-L60) 属性读取 `self.ledger.options["operating_currency"]`，可能与 `fava_options` 的其他选项版本不一致

#### 场景 C：`cache_clear()` 已执行但模块尚未完成重载（T3-T13 之间）

```python
# 线程1 已完成 cache_clear()，正在执行模块 load_file()
self.accounts.load_file()  # 内部调用 self.ledger.all_entries_by_type
# ← 线程2 此时调用 get_filtered
filtered = ledger.get_filtered(account="Expenses")
# get_filtered 缓存已清空，会创建新的 FilteredLedger
# 但此时 accounts 模块可能正在清空重建中
```

- **影响**：[FilteredLedger.account_is_closed()](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L238-L252) 读取 `self.ledger.accounts[account_name].close_date`，而 [AccountDict.load_file()](file:///e:/solo-code-2/fava/src/fava/core/accounts.py#L130-L153) 执行了 `self.clear()` 后正在重建，可能触发 `KeyError`

#### 场景 D：`accounts` 已清空但尚未重建完成（T9 内部）

```python
# AccountDict.load_file() 内部
def load_file(self):
    self.clear()  # ← 此时所有账户数据被清空
    # ← 线程2 此时访问
    # self.ledger.accounts["Assets:Bank"]  → KeyError!
    tree = Tree(self.ledger.all_entries)
    for open_entry in self.ledger.all_entries_by_type.Open:
        ...
```

- **影响**：任何并发访问 `ledger.accounts[account_name]` 的代码都会触发 `KeyError`，包括 `account_is_closed()` 和模板渲染中的账户详情获取

### 2.3 `before_request` 钩子中的竞态

[application.py 行 261-271](file:///e:/solo-code-2/fava/src/fava/application.py#L261-L271) 的 `before_request` 钩子：

```python
@fava_app.before_request
def _perform_global_filters() -> None:
    if request.endpoint in {"json_api.get_changed", "json_api.get_errors"}:
        return
    ledger = getattr(g, "ledger", None)
    if ledger:
        if request.blueprint != "json_api":
            ledger.changed()  # ← 可能触发 load_file()
        ledger.extensions.before_request()
```

关键竞态路径：

1. **请求 A** 进入 `before_request`，调用 `ledger.changed()`，检测到文件变化，开始执行 `load_file()`
2. **请求 B** 同时进入 `before_request`，调用 `ledger.changed()`，此时 `watcher.check()` 可能返回 `False`（因为 `last_checked` 已被请求 A 更新），因此请求 B 跳过重载
3. **请求 B** 继续执行，访问正处于重载过程中的 `ledger` 属性 → **脏数据读取**

或者更危险的情况：

1. **请求 A** 调用 `ledger.changed()` → `load_file()` 开始执行
2. **请求 A** 在 `load_file()` 执行过程中（尚未完成），Flask 的 WSGI 处理器切换线程
3. **请求 B** 的 `before_request` 中 `changed()` 返回 `True`（因为后台 `watchfiles` 线程又更新了 `mtime`），再次调用 `load_file()` → **双重重载**

### 2.4 `g.filtered` 请求上下文与共享 Ledger 的矛盾

Flask 的 `g` 对象是请求级别的，`g.filtered` 通过 [_ctx_globals_class.py](file:///e:/solo-code-2/fava/src/fava/_ctx_globals_class.py#L48-L55) 中的 `cached_property` 惰性创建：

```python
@cached_property
def filtered(self) -> FilteredLedger:
    args = request.args
    return self.ledger.get_filtered(
        account=args.get("account", ""),
        filter=args.get("filter", ""),
        time=args.get("time", ""),
    )
```

虽然 `g.filtered` 是请求隔离的，但它引用的 `self.ledger` 是**所有请求共享的同一个 `FavaLedger` 实例**。因此：

- 请求 A 的 `g.filtered.ledger` 和请求 B 的 `g.filtered.ledger` 指向同一对象
- 当 `load_file()` 被触发时，所有请求的 `g.filtered.ledger.all_entries`、`g.filtered.ledger.options` 等属性被**就地替换**
- `g.filtered.entries` 是在创建时从旧 `all_entries` 过滤出的列表快照，本身不会变，但 `g.filtered.ledger` 的属性可能已被更新为不一致状态
- [FilteredLedger.prices()](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L218-L236) 访问 `self.ledger.prices`，该属性可能在请求处理过程中被替换

### 2.5 可能的异常类型汇总

| 异常类型 | 触发条件 | 代码位置 |
|---|---|---|
| `KeyError` | 访问 `accounts[account_name]` 时 `AccountDict` 正被 `clear()` 后重建 | [accounts.py 行 130](file:///e:/solo-code-2/fava/src/fava/core/accounts.py#L130) |
| `StopIteration` / `EntryNotFoundForHashError` | `get_entry` 缓存已清除但新 `all_entries` 尚未赋值 | [\_\_init\_\_.py 行 630-637](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L630-L637) |
| `AttributeError` | 模块 `load_file()` 执行中途访问尚未赋值的属性 | 各模块 `load_file()` |
| `TypeError` | `options` 和 `fava_options` 版本不匹配导致类型不兼容 | [filters.py TimeFilter](file:///e:/solo-code-2/fava/src/fava/core/filters.py) |
| 数据逻辑错误 | 无异常但返回错误结果（旧 entries + 新 prices 混合） | [FilteredLedger.entries_with_all_prices](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L182-L186) |

---

## 3. 高频重载场景下的CPU资源耗尽与内存溢出隐患

### 3.1 CPU 计算资源耗尽分析

#### 3.1.1 Beancount 全量解析开销

[load_uncached()](file:///e:/solo-code-2/fava/src/fava/beans/load.py#L18-L32) 每次调用都通过 `loader._load()` 执行完整的 Beancount 文件解析：

```python
def load_uncached(beancount_file_path, *, is_encrypted):
    return loader._load(
        [(beancount_file_path, True)],
        None, None, None,
    )
```

该函数不使用 Beancount 自身的缓存机制（对比 `loader.load_file()` 会使用缓存），每次都是全量解析。对于大型账本（10万+ 行），单次解析可能需要数秒的 CPU 时间。

#### 3.1.2 模块级联重载的累积开销

[load_file()](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L407-L441) 中 11 个模块的 `load_file()` 调用形成串行计算链：

| 模块 | 主要计算操作 | CPU 开销等级 |
|---|---|---|
| `accounts` | [group_entries_by_account + Tree 构建 + 遍历 Open/Close](file:///e:/solo-code-2/fava/src/fava/core/accounts.py#L130-L153) | 高（O(n) 条目遍历 + O(n) 树构建） |
| `attributes` | [ExponentialDecayRanker 更新](file:///e:/solo-code-2/fava/src/fava/core/attributes.py#L71) | 中 |
| `budgets` | [解析 Custom 条目中的预算](file:///e:/solo-code-2/fava/src/fava/core/budgets.py#L52-L55) | 低 |
| `charts` | 无重操作 | 低 |
| `commodities` | 遍历条目提取商品 | 低 |
| `extensions` | [find_extensions 动态加载 + 实例化](file:///e:/solo-code-2/fava/src/fava/core/extensions.py#L41-L76) | 中（文件系统 I/O + 反射） |
| `file` | 源文件管理 | 低 |
| `format_decimal` | DisplayContext 构建 | 低 |
| `misc` | [sidebar_links + upcoming_events](file:///e:/solo-code-2/fava/src/fava/core/misc.py#L44-L51) | 低 |
| `query_shell` | 无重操作 | 低 |
| `ingest` | [导入模块加载](file:///e:/solo-code-2/fava/src/fava/core/ingest.py#L308) | 中（文件系统 I/O） |

其中 `accounts.load_file()` 是最大的 CPU 消耗者，因为它需要构建完整的账户树并遍历所有条目。

#### 3.1.3 高频触发场景下的 CPU 风暴

在多用户/多账本部署模式下，以下场景会引发 CPU 风暴：

**场景 1：编辑器自动保存 + 文件包含链**

许多编辑器（VS Code、Vim）配置了自动保存，用户编辑一个 `.beancount` 文件时可能每秒触发一次保存。如果主文件通过 `include` 指令包含了 10 个子文件，`watchfiles` 后台线程（[_WatchfilesThread](file:///e:/solo-code-2/fava/src/fava/core/watcher.py#L27-L79)）会监控所有包含的文件和文档目录：

```
编辑器保存 → watchfiles 检测变化 → 更新 mtime
→ 下一个请求的 before_request → changed() → load_file()
→ 全量解析 + 11 模块重载 → 数秒 CPU 时间
```

如果保存频率高于 `load_file()` 完成频率，请求将排队等待重载完成，导致请求响应延迟持续累积。

**场景 2：文档目录监控的级联触发**

[paths_to_watch()](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L493-L509) 返回的监控列表包含所有文档目录。在 `_WatchfilesThread` 中使用 `recursive=True`（[行 162](file:///e:/solo-code-2/fava/src/fava/core/watcher.py#L162)），任何文档目录下的文件变化（包括临时文件创建/删除）都会更新 `mtime`：

```
文件管理器缩略图生成 → 文档目录下生成 .thumb 文件
→ watchfiles 递归监控检测到 → mtime 更新
→ changed() → load_file()
```

**场景 3：多账本实例的并行重载**

每个 `FavaLedger` 实例拥有两个独立的 `watchfiles` 后台线程（[行 160-165](file:///e:/solo-code-2/fava/src/fava/core/watcher.py#L160-L165)）。在 N 个账本的部署模式下：

- 后台线程数：2N
- 若所有账本共享同一文件系统且同时发生变更，可能同时触发 N 个 `load_file()` 调用
- 每个 `load_file()` 的 CPU 开销叠加，导致 CPU 使用率飙升至 N × 单次重载开销

### 3.2 内存溢出隐患分析

#### 3.2.1 多版本对象并存问题

`load_file()` 不是原子操作，在执行过程中新旧版本的对象可能同时存在于内存中。具体地：

**阶段 1：解析结果的双重驻留**

```python
# 行 409-410
self.all_entries, self.load_errors, self.options = load_uncached(...)
```

`load_uncached()` 返回新的条目列表后，旧 `self.all_entries` 引用仍可能被以下对象持有：

- `get_filtered` lru_cache 中的旧 `FilteredLedger` 实例（在 `cache_clear()` 前仍被引用）
- 当前请求上下文 `g.filtered.entries` 的引用
- 其他线程正在遍历的 `all_entries`

在 `cache_clear()` 执行前，旧条目列表和新条目列表同时驻留内存，内存峰值约为正常使用量的 2 倍。

**阶段 2：`FilteredLedger` 的延迟释放**

即使 `get_filtered.cache_clear()` 已执行，旧的 `FilteredLedger` 实例可能仍被并发请求的 `g.filtered` 引用。`FilteredLedger` 包含：

| 属性 | 内存占用估算 |
|---|---|
| `entries` | 过滤后的条目列表，可能包含数万条 `Directive` 对象 |
| `entries_with_all_prices`（cached_property） | 条目 + 价格条目的合并排序列表 |
| `entries_without_prices`（cached_property） | 过滤掉价格的条目列表 |
| `root_tree`（cached_property） | 完整的账户树结构，每个节点包含 `CounterInventory` |
| `root_tree_closed`（cached_property） | 结账后的账户树 |

一个大型账本的 `FilteredLedger` 实例可能占用 50-200MB 内存。如果 lru_cache 中有 16 个不同过滤参数的 `FilteredLedger`（maxsize=16），则总占用可达 800MB-3.2GB。

**阶段 3：模块中间状态的双重驻留**

各模块的 `load_file()` 通常采用"先清空再重建"的模式，如 [AccountDict.load_file()](file:///e:/solo-code-2/fava/src/fava/core/accounts.py#L130-L153)：

```python
def load_file(self):
    self.clear()                    # 释放旧数据
    entries_by_account = group_entries_by_account(...)  # 创建新数据
    tree = Tree(self.ledger.all_entries)  # 创建新树
```

在 `clear()` 和重建之间，如果触发 GC，旧数据可能已被回收。但 `tree = Tree(...)` 在构建过程中，新树和旧条目的分组结果同时存在。

#### 3.2.2 明文内存溢出风险

Beancount 条目以明文 Python 对象形式存储在内存中。每个 `Transaction` 条目包含：

- `meta`：字典，包含 filename、lineno 和用户自定义元数据
- `date`：date 对象
- `flag`：字符串
- `payee`、`narration`：字符串
- `postings`：列表，每个 posting 包含 account、units、cost 等

在频繁重载场景下：

1. **旧 `all_entries` 列表的延迟 GC**：Python 的引用计数 GC 在最后一个引用消失前不会释放内存。并发请求持有旧 `FilteredLedger.ledger.all_entries` 的引用期间，旧条目无法被回收
2. **`lru_cache` 的 maxsize 上限**：`get_filtered` 的 `maxsize=16` 意味着最多 16 个 `FilteredLedger` 实例被缓存。在高频重载下，如果 `cache_clear()` 和新缓存填充交替进行，可能出现短时间内同时存在旧缓存（待清除）和新缓存（待填充）的情况
3. **`FilteredLedger.__dict__` 的 cached_property 累积**：`cached_property` 的值存储在实例的 `__dict__` 中，不会自动失效。即使 `get_filtered` 缓存被清除，已从缓存中取出并正在使用的 `FilteredLedger` 实例仍保留其所有 `cached_property` 值

#### 3.2.3 多账本模式下的内存倍增

在多账本部署模式下，每个 `FavaLedger` 实例独立维护：

- `all_entries` 列表
- `all_entries_by_type` 分组
- `prices` 价格映射
- `accounts` 账户字典
- `get_filtered` lru_cache（maxsize=16）
- `get_entry` lru_cache（maxsize=16）
- 2 个 `watchfiles` 后台线程

N 个账本的总内存占用约为 N × 单账本内存。在高频重载下，由于新旧版本并存，峰值内存可达 2N × 单账本内存。

### 3.3 缺乏防护机制的具体清单

| 缺失机制 | 当前状态 | 潜在影响 |
|---|---|---|
| **重载防抖（Debounce）** | 无。每次 `changed()` 返回 `True` 立即触发 `load_file()` | 编辑器自动保存每秒触发一次，每次都全量重载 |
| **重载互斥锁** | 无。`load_file()` 无线程锁保护 | 并发请求同时触发多次重载，或重载期间读取不一致状态 |
| **重载速率限制** | 无。无最小重载间隔设定 | 短时间多次文件变更导致连续重载 |
| **增量加载** | 无。每次 `load_uncached()` 全量解析 | 小修改也需全量解析整个文件包含链 |
| **旧版本引用追踪** | 无。不追踪旧 `FilteredLedger` 的引用计数 | 无法确认旧数据何时可安全释放 |
| **内存压力监控** | 无。无内存使用上限或告警 | 大账本 + 高频重载导致 OOM |
| **watcher 事件合并** | `_WatchfilesThread` 批量返回变化但不做事件合并 | 同一秒内的多次文件变更可能触发多次 `load_file()` |

### 3.4 `watchfiles` 后台线程的资源消耗

每个 `FavaLedger` 实例创建 2 个后台线程（[_FilesWatchfilesThread](file:///e:/solo-code-2/fava/src/fava/core/watcher.py#L81-L90) 和 [_WatchfilesThread](file:///e:/solo-code-2/fava/src/fava/core/watcher.py#L27-L79)）：

- `_FilesWatchfilesThread`：监控文件父目录，非递归
- `_WatchfilesThread`：监控文档目录，递归

在 N 个账本的部署中，后台线程数为 2N。`watchfiles` 底层使用 OS 级文件监控（inotify/ReadDirectoryChangesW），每个监控实例消耗内核资源：

- Linux inotify：每个 watch 实例消耗约 1KB 内核内存，递归监控大目录树可能创建数千个 watch
- Windows ReadDirectoryChangesW：每个目录句柄消耗内核资源
- macOS kqueue：每个文件描述符消耗内核资源

### 3.5 量化风险场景

假设一个中等规模的 Fava 部署：

- 5 个账本，每个包含 50000 条目
- 单次 `load_file()` 耗时 2 秒（解析 1.5s + 模块重载 0.5s）
- 单账本内存占用 300MB（entries + caches + trees）
- 编辑器自动保存间隔 1 秒

| 场景 | CPU 影响 | 内存影响 |
|---|---|---|
| 单账本正常编辑 | 每秒 2s CPU → CPU 持续 100% | 峰值 600MB（新旧版本并存） |
| 5 账本同时编辑 | 5 × 2s CPU → 需要多核支撑 | 峰值 3GB（5 × 600MB） |
| 含 include 链的大账本 | 单次 5s+ CPU | 峰值 1GB+ |
| 10 账本 + 高频变更 | 10 × 2s CPU → 系统级 CPU 饱和 | 峰值 6GB，可能 OOM |

---

## 总结

Fava 的账本重载机制在架构层面存在三个核心问题：

1. **缓存清理精确但覆盖不全**：`get_filtered.cache_clear()` 和 `get_entry.cache_clear()` 能精确清除 lru_cache，但 `FilteredLedger` 的 `cached_property` 和请求上下文中的旧实例引用无法被追踪和清除，存在数据版本残留风险

2. **完全缺失线程安全保护**：`load_file()` 的多步属性赋值在无锁环境下执行，并发请求可读取到任意中间状态，从脏数据到 `KeyError` 异常均有发生可能

3. **高频重载场景无防护**：缺乏防抖、速率限制、增量加载和内存监控机制，在多用户/多账本部署下容易引发 CPU 风暴和内存溢出
