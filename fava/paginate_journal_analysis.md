# Fava 账本分页逻辑深入分析

本文档深入分析 [FilteredLedger.paginate_journal](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L254-L291) 方法的内部实现机制，解答三个关键设计问题。

---

## 1. `_pages` 缓存元组的内部状态与失效机制

### 缓存数据结构定义

`self._pages` 是 `FilteredLedger` 类的私有缓存属性，其类型声明位于 [__init__.py#L137-L144](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L137-L144)：

```python
self._pages: (
    tuple[
        int,
        Literal["asc", "desc"],
        list[Sequence[tuple[int, Directive]]],
    ]
    | None
) = None
```

该三元组包含三个核心内部状态：

| 位置 | 类型 | 含义 |
|------|------|------|
| `[0]` | `int` | 每页显示条数 `per_page` |
| `[1]` | `Literal["asc", "desc"]` | 排序方式 `order` |
| `[2]` | `list[Sequence[tuple[int, Directive]]]` | 已分片的页面数据列表 |

页面数据 `pages[2]` 是一个列表，每个元素代表一页内容。每页是一个 `(全局索引, 指令对象)` 元组序列。

### 缓存失效逻辑

缓存检查与失效逻辑位于 [__init__.py#L272-L276](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L272-L276)：

```python
if (
    self._pages is None
    or self._pages[0] != per_page
    or self._pages[1] != order
):
    # 重建缓存...
```

**为什么修改 `per_page` 或 `order` 必须立即销毁缓存？**

#### (1) `per_page` 变更导致页面边界完全重绘

当每页显示条数改变时，所有交易条目在页面间的分配关系被彻底打破：

- **原逻辑（per_page=1000）**：条目 0-999 → 第1页，1000-1999 → 第2页...
- **新逻辑（per_page=500）**：条目 0-499 → 第1页，500-999 → 第2页...

旧缓存中的页面分片已完全不适用，强行复用会导致：
- 同一请求页包含错误的条目范围
- 总页数计算错误
- 条目重复或遗漏

#### (2) `order` 变更导致条目顺序完全反转

排序方式从 `asc`（升序）变为 `desc`（降序）或反之，意味着条目序列被整体反转：

- **asc 顺序**：最早的交易 → 第1页开头
- **desc 顺序**：最新的交易 → 第1页开头

旧缓存的条目顺序与新请求完全相反，必须完全重建。

---

## 2. 降序排列下的生成器/迭代器内存优化

### 问题背景

当用户请求 `desc` 降序查看日记账时，如果直接对百万级 `entries` 数组执行 `list(reversed(entries))`，会：
1. 触发完整列表复制，占用 O(n) 额外内存
2. 即使只需要第1页的1000条数据，也需要先反转全部百万条记录

### 优化实现

核心优化代码位于 [__init__.py#L278-L283](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L278-L283)：

```python
enumerated = list(enumerate(self.entries_without_prices))
entries = (
    iter(enumerated) if order == "asc" else reversed(enumerated)
)
while batch := tuple(islice(entries, per_page)):
    pages.append(batch)
```

### 逐层解析优化策略

#### 步骤1：`reversed(enumerated)` —— 反向迭代器而非反向列表

`reversed()` 内置函数作用于列表时，**不创建新列表**，而是返回一个 `list_reverseiterator` 对象：

- 内部仅持有原列表引用和一个反向游标
- 内存占用为 O(1)（仅迭代器状态），而非 O(n)
- 按需从后向前逐个产出元素

#### 步骤2：`islice(entries, per_page)` —— 惰性切片

`itertools.islice` 对迭代器进行切片，具有以下特性：

- 不预取全部数据，仅在迭代时逐个消费
- 每次调用 `islice(entries, per_page)` 会从迭代器当前位置向后取 `per_page` 个元素
- 实现了"游标式"分页，不需要计算起始偏移量

#### 步骤3：`tuple(islice(...))` —— 按需物化

仅在需要构建当前页时才将 `islice` 生成器转换为元组：

- 每次循环仅物化 `per_page` 个元素（如1000条）
- 内存峰值为 O(per_page) 而非 O(total_entries)

**内存占用对比**（假设100万条记录，per_page=1000）：

| 实现方式 | 峰值内存占用 |
|----------|-------------|
| `list(reversed(entries))[start:end]` | ≈ 100万条 × 单条大小 |
| `tuple(islice(reversed(entries), 1000))` | ≈ 1000条 × 单条大小 |

---

## 3. 局部渲染序号与全局索引的逆向映射

### 问题背景

`entries_without_prices` 已剔除 `Price` 价格变动指令（见 [__init__.py#L188-L191](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L188-L191)）：

```python
@cached_property
def entries_without_prices(self) -> Sequence[Directive]:
    """The filtered entries, without prices for journals."""
    return [e for e in self.entries if not isinstance(e, Price)]
```

这意味着分页导出的条目序列与原始 `entries` 列表之间存在索引"间隙"——Price 条目被跳过了。

### 映射机制实现

关键在于分页前的 `enumerate` 调用，位于 [__init__.py#L278](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L278)：

```python
enumerated = list(enumerate(self.entries_without_prices))
```

### 索引映射原理

#### (1) 索引的双重含义

`enumerate(self.entries_without_prices)` 产生的元组 `(i, directive)` 中：

- **`i`**：`entries_without_prices` 列表中的**全局索引**（剔除 Price 后的过滤列表）
- **`directive`**：原始 Directive 对象，本身还携带 `meta` 中的源文件位置等信息

这个索引 `i` 不是临时的局部渲染序号，而是**持久的全局定位编号**，它对应于过滤后列表中的位置。

#### (2) 前端如何使用该索引

`JournalPage` 数据类定义于 [__init__.py#L96-L101](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L96-L101)：

```python
@dataclass(frozen=True)
class JournalPage:
    """A page of journal entries."""
    entries: Sequence[tuple[int, Directive]]
    total_pages: int
```

前端收到的 `entries` 是 `(global_index, directive)` 元组序列。当用户点击某条交易时：

1. 前端将 `global_index` 传回后端
2. 后端直接通过 `filtered.entries_without_prices[global_index]` 精确定位
3. 无需重新扫描或搜索整个条目列表

#### (3) 逆向查找的准确性保证

映射关系的正确性由以下两点保证：

**时间不变性**：
- `entries_without_prices` 是 `@cached_property`，在 `FilteredLedger` 实例生命周期内缓存
- 只要过滤条件（account/time/filter）不变，列表内容和索引就不变

**枚举时机正确性**：
- `enumerate()` 调用发生在 `entries_without_prices` 上，而非原始 `entries`
- 这确保索引 `i` 与 `entries_without_prices[i]` 严格一一对应
- Price 条目在枚举之前已被剔除，不会造成索引错位

### 索引映射示例

假设原始 `entries` 列表内容如下：

| 原始索引 | 条目类型 | entries_without_prices 中的全局索引 i |
|----------|----------|---------------------------------------|
| 0 | Transaction | 0 |
| 1 | Price | —（被剔除）— |
| 2 | Transaction | 1 |
| 3 | Transaction | 2 |
| 4 | Price | —（被剔除）— |
| 5 | Balance | 3 |

分页导出时，前端收到的 `(i, directive)` 元组为：
- `(0, Transaction@idx0)`
- `(1, Transaction@idx2)`
- `(2, Transaction@idx3)`
- `(3, Balance@idx5)`

当用户点击第3条记录（i=2），后端直接 `entries_without_prices[2]` 即可准确获取原始索引为3的 Transaction，无需任何额外查找。

---

## 总结

`paginate_journal` 方法的三项关键设计体现了对大规模数据场景的深思熟虑：

1. **缓存失效策略**：通过将 `per_page` 和 `order` 纳入缓存键，确保分页参数变更时数据一致性，杜绝了缓存污染风险。

2. **降序迭代优化**：组合使用 `reversed()` 反向迭代器、`islice()` 惰性切片和按需物化，将内存占用从 O(n) 降至 O(per_page)，支持百万级交易流畅分页。

3. **索引映射机制**：在剔除 Price 之前完成枚举，确保全局索引与过滤后列表的一一对应，前端点击定位无需额外扫描开销。
