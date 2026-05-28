# Fava 预算管理与解析模块深度分析

> 核心源码：[budgets.py](file:///e:/solo-code-2/fava/src/fava/core/budgets.py)
> 日期工具：[date.py](file:///e:/solo-code-2/fava/src/fava/util/date.py)

---

## 一、parse_budgets：从 Custom 指令中识别与提取预算条目

### 1.1 识别机制

[parse_budgets](file:///e:/solo-code-2/fava/src/fava/core/budgets.py#L86-L128) 函数接收 Beancount 全部 Custom 类型条目的序列，通过生成器表达式进行第一层过滤：

```python
for entry in (entry for entry in custom_entries if entry.type == "budget"):
```

该生成器仅保留 `entry.type == "budget"` 的条目，其余类型的 Custom 指令（如 `"query"`、`"fava-option"` 等）直接被跳过。Beancount 的 Custom 指令格式为：

```beancount
2015-04-09 custom "budget" Expenses:Books "monthly" 20.00 EUR
```

其中 `entry.type` 对应第一个值 `"budget"`，`entry.values[0]` 是账户名，`entry.values[1]` 是周期单位字符串，`entry.values[2]` 是金额+货币对。

### 1.2 周期单位解析与异常处理

过滤后的条目进入 `try` 块，首先通过 [INTERVALS](file:///e:/solo-code-2/fava/src/fava/util/date.py#L246-L256) 字典查找周期单位：

```python
interval = INTERVALS.get(str(entry.values[1].value).lower())
```

`INTERVALS` 是一个将小写字符串映射到 `Interval` 子类单例的字典，支持的键值包括：

| 键值 | 对应的 Interval 实例 |
|------|---------------------|
| `"year"` / `"yearly"` | `_IntervalYear` |
| `"quarter"` / `"quarterly"` | `_IntervalQuarter` |
| `"month"` / `"monthly"` | `_IntervalMonth` |
| `"week"` / `"weekly"` | `_IntervalWeek` |
| `"day"` / `"daily"` | `_IntervalDay` |

当用户写入无法识别的周期单位（如 `"biweekly"`、`"annually"` 等不在字典中的字符串）时，`INTERVALS.get()` 返回 `None`，触发以下逻辑：

```python
if not interval:
    errors.append(
        BudgetError(
            entry.meta,
            "Invalid interval for budget entry",
            entry,
        ),
    )
    continue
```

该函数会生成一条 `BudgetError`，包含原始条目的元信息（文件名、行号）、错误描述以及条目引用本身，随后 `continue` 跳过当前条目继续解析下一条。

此外，`try` 块还捕获了两种结构性异常：

```python
except (IndexError, TypeError):
    errors.append(
        BudgetError(entry.meta, "Failed to parse budget entry", entry),
    )
```

- **IndexError**：当 `entry.values` 列表中缺少必要的元素（例如只写了 `custom "budget" Expenses:Books` 而没有周期和金额），访问 `entry.values[1]` 或 `entry.values[2]` 时触发。
- **TypeError**：当 `entry.values[2].value` 的结构不符合预期（例如金额部分不是 `Amount` 对象），访问 `.number` 或 `.currency` 属性时触发。

两种异常均被统一收集到 `errors` 列表中，以 `BudgetError` 形式返回，**不会中断整个解析流程**——这是一种容错式设计，保证单条指令的错误不影响其余有效预算条目的解析。

### 1.3 解析流程总结图

```
Custom 条目序列
    │
    ▼  过滤 entry.type == "budget"
预算类型条目
    │
    ▼  try 块
┌───────────────────────────┐
│ INTERVALS.get(周期字符串)   │
│   ├── 找到 → 构建 Budget   │──→ budgets[account].append(budget)
│   └── None → BudgetError  │──→ errors 列表
└───────────────────────────┘
    │
    ▼  except (IndexError, TypeError)
    BudgetError("Failed to parse budget entry") ──→ errors 列表
```

---

## 二、calculate_budget：按天迭代累加的预算计算与性能瓶颈

### 2.1 核心算法

[calculate_budget](file:///e:/solo-code-2/fava/src/fava/core/budgets.py#L150-L179) 的核心逻辑如下：

```python
currency_dict: dict[str, Decimal] = defaultdict(Decimal)

for day in days_in_daterange(date_from, date_to):
    matches = _matching_budgets(budget_list, day)
    for budget in matches.values():
        days_in_period = budget.period.number_of_days(day)
        currency_dict[budget.currency] += budget.number / days_in_period
```

其计算思路是**将每个预算周期总额均匀摊到每一天**：

1. `days_in_daterange(date_from, date_to)` 生成从 `date_from` 到 `date_to`（不含）的每一天日期
2. 对每一天，调用 [_matching_budgets](file:///e:/solo-code-2/fava/src/fava/core/budgets.py#L131-L147) 找到当天有效的预算配置
3. 将预算金额除以该周期的天数，得到日均预算值，累加到对应货币的字典中

### 2.2 days_in_daterange 的实现

[days_in_daterange](file:///e:/solo-code-2/fava/src/fava/util/date.py#L569-L576) 是一个简单的生成器：

```python
def days_in_daterange(start_date, end_date):
    for diff in range((end_date - start_date).days):
        yield start_date + timedelta(diff)
```

它计算总天数 `(end_date - start_date).days`，然后逐一 yield 每一天的 `date` 对象。时间复杂度为 **O(D)**，其中 D 为日期范围内的天数。

### 2.3 _matching_budgets 的逐日查找

```python
def _matching_budgets(budgets, date_active):
    last_seen_budgets = {}
    for budget in budgets:
        if budget.date_start <= date_active:
            last_seen_budgets[budget.currency] = budget
        else:
            break
    return last_seen_budgets
```

该函数遍历同一账户下的所有预算条目（假设已按 `date_start` 排序），找最后一个 `date_start <= date_active` 的条目作为当前生效的预算。对于同一货币，后配置的预算会覆盖先前的。时间复杂度为 **O(B)**，B 为该账户的预算条目数。

### 2.4 性能瓶颈分析

当用户在前端选择跨越数十年的时间范围时，例如从 2000-01-01 到 2030-12-31：

| 参数 | 估算值 |
|------|--------|
| 天数 D | ≈ 11,323 天 |
| 每账户预算条目 B | 通常 1~5 条 |
| 总循环次数 | D × B ≈ 11,323 × 3 ≈ 33,969 |

**单账户计算**的绝对耗时可接受，但问题在以下几个维度叠加后急剧恶化：

#### 2.4.1 O(D × B) 的线性膨胀

每增加一天，就要完整执行一次 `_matching_budgets` 遍历。对于 30 年范围，内层循环执行次数超过 3 万次，且每次都涉及 `Decimal` 精确除法运算——`Decimal` 的算术运算比原生浮点数慢约 10-100 倍。

#### 2.4.2 与 calculate_budget_children 的乘法效应

如第三节所述，`calculate_budget_children` 会对每个子账户分别调用 `calculate_budget`，如果账户树有 N 个子节点，则总复杂度为 **O(N × D × B)**。当 N=50、D=11,323、B=3 时，总迭代次数约 **170 万次**。

#### 2.4.3 无缓存、无区间优化

当前算法的**根本问题**是：在预算配置没有变化的时间段内（同一预算条目的整个有效期内），每天的日预算额 `budget.number / days_in_period` 是一个常量，但算法仍然逐天重复计算。理想的做法是**按预算周期分块计算**：

```python
# 优化思路：不逐天迭代，而是按预算周期区间累加
for budget in matching_budgets:
    overlap_start = max(date_from, budget.date_start)
    overlap_end = min(date_to, next_budget_date)
    overlap_days = (overlap_end - overlap_start).days
    currency_dict[budget.currency] += budget.number * overlap_days / days_in_period
```

这样可将复杂度从 **O(D × B)** 降至 **O(B²)**（仅需遍历预算条目之间的区间边界），对于长跨度时间范围有数量级的提升。

#### 2.4.4 量化对比

| 场景 | 当前算法迭代次数 | 区间优化后迭代次数 |
|------|-----------------|-------------------|
| 1 个月、1 条预算 | ~30 | 1 |
| 1 年、3 条预算 | ~365 × 3 = 1,095 | ~3 |
| 30 年、5 条预算 | ~10,957 × 5 = 54,785 | ~5 |
| 30 年、50 子账户、5 条预算 | ~2,739,250 | ~250 |

---

## 三、calculate_budget_children：多级子科目遍历与预算冲突叠加

### 3.1 子科目匹配策略

[calculate_budget_children](file:///e:/solo-code-2/fava/src/fava/core/budgets.py#L182-L207) 的实现：

```python
def calculate_budget_children(budgets, account, date_from, date_to):
    currency_dict: dict[str, Decimal] = Counter()

    for child in budgets:
        if child.startswith(account):
            currency_dict.update(
                calculate_budget(budgets, child, date_from, date_to),
            )
    return dict(currency_dict)
```

该函数遍历 `budgets` 字典（`BudgetDict = dict[str, list[Budget]]`）的**所有键**，使用 `child.startswith(account)` 进行前缀匹配来判断是否为指定账户的子科目。

这种匹配方式依赖于 Beancount 的账户命名规范——子科目通过冒号分隔，如 `Expenses:Books` 是 `Expenses` 的子科目。`startswith` 匹配在此约定下有效，但存在一个边界问题：

- `startswith("Expenses:Bo")` 会错误匹配 `Expenses:Books` 和 `Expenses:Bond`
- 不过在实际使用中，`account` 参数总是完整的账户名（由 Fava 前端传入），所以此问题通常不会触发

### 3.2 遍历合并累加器

对于每个匹配的子科目键，函数调用 `calculate_budget` 获取该子科目的预算字典，然后通过 `Counter.update()` 合并到累加器中。

`Counter.update()` 的行为是**将相同键的值相加**：

```python
>>> from collections import Counter
>>> c = Counter({"EUR": Decimal("100")})
>>> c.update({"EUR": Decimal("50")})
>>> c["EUR"]  # 100 + 50 = 150
Decimal("150")
```

这意味着如果一个父账户和其子账户分别定义了同币种的预算，它们的金额会被**累加**而非覆盖。

### 3.3 预算冲突的叠加行为

考虑以下场景：

```beancount
2020-01-01 custom "budget" Expenses:Books "monthly" 100 EUR
2020-01-01 custom "budget" Expenses "monthly" 500 EUR
```

当调用 `calculate_budget_children(budgets, "Expenses", ...)` 时：

1. 遍历到 `"Expenses"` → 匹配 → 调用 `calculate_budget` → 得到 `{"EUR": 500 × 月数摊分}`
2. 遍历到 `"Expenses:Books"` → 匹配 → 调用 `calculate_budget` → 得到 `{"EUR": 100 × 月数摊分}`
3. `Counter.update()` 合并 → 最终结果 `{"EUR": (500 + 100) × 月数摊分}`

**关键结论：预算配置是叠加的，不是互斥的。** 父账户的预算代表"该账户自身的预算额度"，子账户的预算代表"子账户自身的预算额度"，两者独立计算后求和。这体现了 Beancount 账户层级模型的设计哲学——每个账户节点是独立记账单元。

### 3.4 性能问题：全局线性扫描

当前实现存在两个性能缺陷：

#### 3.4.1 全量键遍历

```python
for child in budgets:  # 遍历 budgets 字典的全部键
    if child.startswith(account):
```

该循环遍历 `budgets` 字典的**所有键**，即使绝大部分键都不是目标账户的子科目。对于拥有数千个账户的账本，每次调用都需要完整扫描。优化方案是维护一个按账户层级预构建的树形索引，使子科目查找从 O(K) 降至 O(log K) 或 O(1)。

#### 3.4.2 重复计算

每个子科目独立调用 `calculate_budget`，导致 `days_in_daterange` 被重复生成 N 次（N 为子科目数），且 `_matching_budgets` 的匹配逻辑也被重复执行。若将所有子科目的预算条目合并后统一按区间计算，可消除大量冗余。

### 3.5 多级嵌套的完整示例

假设账户树如下：

```
Expenses
├── Books
│   ├── Fiction
│   └── Technical
├── Food
└── Transport
```

预算配置：

```beancount
2020-01-01 custom "budget" Expenses "monthly" 500 EUR
2020-01-01 custom "budget" Expenses:Books "monthly" 100 EUR
2020-01-01 custom "budget" Expenses:Books:Fiction "monthly" 30 EUR
2020-01-01 custom "budget" Expenses:Food "monthly" 200 EUR
```

调用 `calculate_budget_children(budgets, "Expenses", date_from, date_to)` 的遍历过程：

| 遍历到的键 | `startswith("Expenses")` | 子计算结果 (月均) |
|-----------|--------------------------|------------------|
| `"Expenses"` | ✅ | 500 EUR |
| `"Expenses:Books"` | ✅ | 100 EUR |
| `"Expenses:Books:Fiction"` | ✅ | 30 EUR |
| `"Expenses:Food"` | ✅ | 200 EUR |

累加结果：`500 + 100 + 30 + 200 = 830 EUR/月`

注意 `Expenses:Books` 的预算（100 EUR）与 `Expenses:Books:Fiction` 的预算（30 EUR）是**叠加关系**，而非包含关系。`Expenses:Books` 的 100 EUR 不包含其子科目 Fiction 的 30 EUR。这种设计意味着**预算总额 = 各层级独立预算声明的算术和**。

---

## 四、总结

| 方面 | 当前实现 | 潜在风险/改进方向 |
|------|---------|------------------|
| **parse_budgets** | 生成器过滤 + `INTERVALS` 字典查找 + 双层异常捕获 | 容错设计合理，但缺少对 `values[0]` 账户名有效性的校验 |
| **calculate_budget** | `days_in_daterange` 逐天迭代 + `_matching_budgets` 线性查找 | 30 年范围约 11,000 次迭代，可改为按预算区间分块计算将复杂度从 O(D×B) 降至 O(B²) |
| **calculate_budget_children** | 全局键扫描 + `Counter.update` 累加 | 多级叠加语义正确但无去重/冲突检测机制；全量扫描 O(K) 可通过树索引优化；重复调用 `calculate_budget` 可合并 |
| **Decimal 精度** | 每日执行 `budget.number / days_in_period` | 大量精确除法运算开销显著，区间累加后一次除法即可 |
