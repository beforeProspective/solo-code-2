# FilteredLedger 核心机制深度分析

本文档深入分析 Fava 中 `FilteredLedger` 类的三个核心技术问题：过滤优先级、日期边界推导、以及性能优化策略。

---

## 问题一：多维度过滤的应用顺序与链式优先级

### 1.1 核心过滤应用顺序

在 [FilteredLedger.__init__](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L119-L171) 构造函数中，三种过滤维度的应用顺序是**固定且不可调换**的：

```
原始 entries (ledger.all_entries)
    ↓
1. AccountFilter (账户过滤)
    ↓
2. AdvancedFilter (查询字符串过滤)
    ↓
3. TimeFilter (时间过滤)
    ↓
最终 entries
```

### 1.2 关键代码实现

过滤逻辑位于 [`__init__.py`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L146-L155) 第 146-155 行：

```python
entries = ledger.all_entries
if account:
    entries = AccountFilter(account).apply(entries)
if filter and filter.strip():
    entries = AdvancedFilter(filter.strip()).apply(entries)
if time:
    time_filter = TimeFilter(ledger.options, ledger.fava_options, time)
    entries = time_filter.apply(entries)
    self.date_range = time_filter.date_range
self.entries = entries
```

### 1.3 设计意图分析

| 过滤顺序 | 过滤器类型 | 设计考量 |
|---------|-----------|---------|
| 第一优先级 | **AccountFilter** | 减少后续过滤器的处理数据量，账户过滤通常能排除大量无关条目 |
| 第二优先级 | **AdvancedFilter** | 在剩余条目中应用复杂的标签、链接、元数据等条件过滤 |
| 第三优先级 | **TimeFilter** | 最后应用时间范围裁剪，利用 `clamp_opt` 进行高效的日期范围截断 |

这种**从粗到细**的过滤策略体现了典型的性能优化思路：先通过计算成本低、过滤能力强的过滤器减少数据量，再对剩余数据应用复杂过滤。

---

## 问题二：TimeFilter 日期边界动态推导机制

### 2.1 两种日期边界来源

`_date_first` 与 `_date_last` 的推导分为两种场景：

#### 场景 A：用户提供明确的 time 过滤字符串

当 `time` 参数非空时，流程如下：

1. **TimeFilter 构造**：在 [`filters.py`](file:///e:/solo-code-2/fava/src/fava/core/filters.py#L399-L409) 第 399-409 行调用 `parse_date()`
2. **日期解析**：[`parse_date()`](file:///e:/solo-code-2/fava/src/fava/util/date.py#L401-L487) 支持多种格式：
   - 绝对日期：`2024`, `2024-05`, `2024-05-27`
   - 周/季度：`2024-W22`, `2024-Q2`
   - 财年：`FY2024`, `FY2024-Q2`
   - 范围：`2023-2024-06`, `2023 to 2024-06`
   - 相对变量：`year`, `month-1`, `(day)`

3. **财年参数集成**：使用 `fava_options.fiscal_year_end` 支持自定义财年结束日期（默认 12-31）
4. **边界赋值**：直接使用解析出的 `DateRange(begin, end)`

#### 场景 B：未提供 time 过滤（自动推导）

当用户未指定时间过滤时，系统通过**双向扫描** entries 自动推导边界，代码位于 [`__init__.py`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L162-L171) 第 162-171 行：

```python
self._date_first = None
self._date_last = None
for entry in self.entries:
    if isinstance(entry, Transaction):
        self._date_first = entry.date
        break
for entry in reversed(self.entries):
    if isinstance(entry, (Transaction, Price)):
        self._date_last = entry.date + timedelta(1)
        break
```

**推导规则**：
- **`_date_first`**：正向扫描找到第一个 `Transaction` 的日期
- **`_date_last`**：反向扫描找到最后一个 `Transaction` **或** `Price` 的日期，**加 1 天**（形成左闭右开区间）

### 2.2 Beancount options 与 Fava options 的作用

| 参数来源 | 作用 | 关键调用 |
|---------|------|---------|
| `ledger.options` (Beancount) | 传递给 `clamp_opt` 用于正确处理日期边界的记账逻辑 | [`filters.py`](file:///e:/solo-code-2/fava/src/fava/core/filters.py#L412-L418) |
| `ledger.fava_options.fiscal_year_end` | 支持财年格式的日期解析，如 `FY2024` | [`date.py`](file:///e:/solo-code-2/fava/src/fava/util/date.py#L406) |

### 2.3 clamp_opt 底层过滤机制

`TimeFilter.apply()` 使用 Beancount 内置的 `clamp_opt` 函数：

```python
clamped_entries, _ = clamp_opt(
    entries,
    self.date_range.begin,
    self.date_range.end,
    self._options,
)
```

该函数不仅简单过滤，还会：
- 正确处理记账周期的边界
- 对跨期交易进行适当的截断调整
- 保持 entries 的有序性

---

## 问题三：大型账本下的缓存与性能优化策略

### 3.1 多层级缓存架构

FilteredLedger 采用**三层缓存机制**确保毫秒级响应：

#### 第一层：FavaLedger 级别的 LRU 缓存

在 [`FavaLedger.__init__`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L388-L389) 第 388-389 行：

```python
self.get_filtered = lru_cache(maxsize=16)(self._get_filtered)
self.get_entry = lru_cache(maxsize=16)(self._get_entry)
```

- **缓存键**：`(account, filter, time)` 三元组
- **缓存大小**：最多缓存 16 个不同的过滤组合
- **缓存失效**：调用 `load_file()` 时通过 `cache_clear()` 清空

这意味着用户频繁切换过滤条件时，相同参数组合不会重复创建 FilteredLedger 实例。

#### 第二层：FilteredLedger 实例内的 cached_property

使用 `@cached_property` 装饰器缓存计算密集型属性，位于 [`__init__.py`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L181-L203)：

| 缓存属性 | 用途 | 缓存时机 |
|---------|------|---------|
| `entries_with_all_prices` | 包含所有 Price 指令的完整条目列表，用于查询 | 首次访问时 |
| `entries_without_prices` | 剔除 Price 指令的列表，用于日记账展示 | 首次访问时 |
| `root_tree` | 账户树结构 | 首次访问时 |
| `root_tree_closed` | 用于资产负债表的闭合账户树 | 首次访问时 |

#### 第三层：分页结果缓存

对于日记账分页，[`paginate_journal()`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L272-L286) 实现了本地缓存：

```python
if (
    self._pages is None
    or self._pages[0] != per_page
    or self._pages[1] != order
):
    # 仅当分页参数变化时重新计算
    pages: list[Sequence[tuple[int, Directive]]] = []
    enumerated = list(enumerate(self.entries_without_prices))
    # ... 分页逻辑
    self._pages = (per_page, order, pages)
```

### 3.2 避免深拷贝和重复排序的核心机制

#### 机制 1：生成器与列表推导式，而非深拷贝

所有过滤器都使用**列表推导式**创建新列表，而不是深拷贝：

- [AccountFilter.apply()](file:///e:/solo-code-2/fava/src/fava/core/filters.py#L463-L475)：
  ```python
  return [
      entry
      for entry in entries
      if any(
          account.has_component(name, value) or match(name)
          for name in get_entry_accounts(entry)
      )
  ]
  ```

- [AdvancedFilter.apply()](file:///e:/solo-code-2/fava/src/fava/core/filters.py#L446-L448)：
  ```python
  return [entry for entry in entries if include(entry)]
  ```

这些操作只复制**引用**，不复制 entry 对象本身。

#### 机制 2：利用 entries 的天然有序性

Beancount 加载后的 `all_entries` 本身已经**按日期排序**，因此：

- TimeFilter 可以利用 `clamp_opt` 的高效范围截断
- `slice_entry_dates()` 使用**二分查找**快速定位日期边界：

```python
def slice_entry_dates(entries, begin, end):
    index_begin = bisect_left(entries, begin, key=_get_date)
    index_end = bisect_left(entries, end, key=_get_date)
    return entries[index_begin:index_end]
```

时间复杂度从 O(n) 降至 O(log n) + O(k)（k 为结果集大小）。

#### 机制 3：延迟计算与按需加载

`@cached_property` 确保：
- 只有实际被访问的属性才会被计算
- 同一属性多次访问只计算一次
- 不同 FilteredLedger 实例之间互不干扰

### 3.3 性能优化总结

| 优化手段 | 效果 | 代码位置 |
|---------|------|---------|
| LRU 缓存过滤组合 | 避免重复创建 FilteredLedger | [`__init__.py`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L388) |
| cached_property 缓存计算结果 | 避免重复构建树和过滤列表 | [`__init__.py`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L181-L203) |
| 分页结果本地缓存 | 翻页时无需重新排序和分片 | [`__init__.py`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L272-L286) |
| 引用复制而非深拷贝 | 内存开销减少，GC 压力降低 | 各 Filter.apply() 方法 |
| 二分查找日期切片 | O(log n) 时间定位边界 | [`helpers.py`](file:///e:/solo-code-2/fava/src/fava/beans/helpers.py#L32-L47) |
| 过滤顺序从粗到细 | 尽早减少数据量 | [`__init__.py`](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L146-L155) |

---

## 关键类关系图

```
FavaLedger
├── all_entries (原始条目，加载时排序一次)
├── get_filtered() → lru_cache(maxsize=16)
│   └── FilteredLedger (每个过滤组合一个实例)
│       ├── entries (三层过滤后的结果)
│       ├── @cached_property entries_with_all_prices
│       ├── @cached_property entries_without_prices
│       ├── @cached_property root_tree
│       ├── @cached_property root_tree_closed
│       └── _pages (分页缓存)
└── options / fava_options (配置参数)
```

---

## 结论

1. **过滤优先级**：账户过滤 → 高级过滤 → 时间过滤，遵循从粗到细的性能优化原则
2. **日期边界**：优先使用用户指定的 time 参数解析，未指定时通过双向扫描 Transaction/Price 自动推导，集成财年配置
3. **性能保障**：通过三层缓存（LRU + cached_property + 分页缓存）、引用复制、二分查找等技术，在数万条指令的账本中仍能维持毫秒级响应
