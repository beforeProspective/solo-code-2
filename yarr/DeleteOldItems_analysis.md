# DeleteOldItems 清理机制深度分析

本文档对 [item.go](file:///e:/solo-code-2/yarr/src/storage/item.go#L433-L462) 中 `DeleteOldItems` 函数的清理机制进行深度分析。

---

## 清理规则概述

`DeleteOldItems` 函数的核心 SQL 删除语句如下：

```sql
delete from items
where id in (
    select id
    from (
        select
            id,
            row_number() over (partition by feed_id order by date desc) as rn,
            last_arrived,
            max(last_arrived) over (partition by feed_id) as max_la
        from items
        where status != :starred_status
    )
    where rn > :keep_size
      and last_arrived < datetime(max_la, :keep_days_limit)
)
```

参数说明：
- `:starred_status` = `STARRED` (值为 2)
- `:keep_size` = 50 ([itemsKeepSize](file:///e:/solo-code-2/yarr/src/storage/item.go#L423-L424))
- `:keep_days_limit` = "-90 days" ([itemsKeepDays](file:///e:/solo-code-2/yarr/src/storage/item.go#L423-L424))

---

## 问题 1：row_number 窗口函数如何保证每个订阅源至少保留 50 条最新文章

### 核心机制

```sql
row_number() over (partition by feed_id order by date desc) as rn
```

这是 SQLite 窗口函数的典型应用，其工作原理如下：

#### 1. `partition by feed_id` - 按订阅源分组
将所有文章按 `feed_id`（订阅源 ID）进行分组，每个订阅源的文章独立处理，互不干扰。

#### 2. `order by date desc` - 按日期降序排列
在每个订阅源分组内部，按照文章的 `date` 字段（发布时间）从新到旧排序。

#### 3. `row_number()` - 分配连续编号
为排序后的每一行分配一个从 1 开始的连续整数编号：
- 最新的文章编号 = 1
- 次新的文章编号 = 2
- ...
- 最旧的文章编号 = N（N 为该订阅源文章总数）

#### 4. `where rn > :keep_size` - 只删除编号大于 50 的记录
通过 `rn > 50` 条件过滤：
- 编号 1~50 的文章（每个订阅源最新的 50 篇）**不会被选中删除**
- 编号 51 及以上的文章才可能成为删除候选

### 效果保证
无论一个订阅源有多少文章（即使有 1000 篇），通过 `row_number` 窗口函数的编号机制，前 50 篇最新文章的 `rn` 始终 <= 50，因此永远不会被删除。

> **测试验证**：[item_test.go](file:///e:/solo-code-2/yarr/src/storage/item_test.go#L327-L346) 中的 `keeps at least 50 items` 测试用例验证了这一点——即使 99 篇文章已超过 90 天，最终仍保留 50 篇。

---

## 问题 2：max_la 的含义及长久未更新订阅源的清理影响

### `max_la` 的定义

```sql
max(last_arrived) over (partition by feed_id) as max_la
```

#### 什么是 `last_arrived`
`last_arrived` 是文章最后一次被系统抓取到的时间。在 [CreateItems](file:///e:/solo-code-2/yarr/src/storage/item.go#L121-L172) 函数中：
- 新文章首次入库时，`last_arrived` 设为当前 UTC 时间
- 已存在的文章再次被抓取到时（`on conflict`），`last_arrived` 会更新为最新抓取时间

#### 什么是 `max_la`
`max_la` 是每个订阅源分组内所有文章 `last_arrived` 的最大值，即：**该订阅源最后一次有文章被系统抓取到的时间点**。

### 时间清理条件

```sql
last_arrived < datetime(max_la, :keep_days_limit)
```

其中 `:keep_days_limit` = "-90 days"，展开后逻辑为：

> **文章的最后到达时间 < 订阅源最后更新时间 - 90 天**

换句话说：只有当一篇文章比"该订阅源最近一次活动时间"还要早 90 天以上时，才可能被删除。

### 长久未更新订阅源的清理影响

假设一个订阅源在 2025 年 1 月 1 日之后就再也没有更新过（`max_la` = 2025-01-01）：

| 场景 | 清理行为分析 |
|------|-------------|
| **所有文章的 `last_arrived` 都在 2024-12-01 之前** | 满足 `last_arrived < 2025-01-01 - 90天 = 2024-10-03`，但还需满足 `rn > 50` |
| **文章总数 <= 50** | 即使所有文章都远超 90 天，由于 `rn > 50` 条件不满足，**不会删除任何文章** |
| **文章总数 = 100，且 `last_arrived` 都在 2024-12-01** | `max_la` = 2024-12-01，`datetime(max_la, '-90 days')` = 2024-09-02<br>所有文章的 `last_arrived`（2024-12-01）都不小于 2024-09-02，**不会删除任何文章** |
| **文章总数 = 100，其中 60 篇 `last_arrived` 在 2024-01-01，40 篇在 2024-12-01** | `max_la` = 2024-12-01<br>`datetime(max_la, '-90 days')` = 2024-09-02<br>60 篇旧文章满足时间条件，且其中 `rn > 50` 的 10 篇会被删除 |

### 设计意图
这种相对时间的设计避免了"一刀切"的绝对时间删除策略：
- 对于**活跃更新**的订阅源：`max_la` 不断前移，旧文章会持续被清理
- 对于**已停更**的订阅源：不会因为时间流逝而被清空，至少保留 50 篇最新文章作为历史记录

---

## 问题 3：为什么标星文章不会被清理规则覆盖

### 核心原因

```sql
where status != :starred_status
```

这个过滤条件位于**子查询的最内层**，在窗口函数计算之前就已经生效。

### 执行顺序分析

SQL 语句的逻辑执行顺序如下：

1. **第一步**：`from items where status != :starred_status`
   - 首先过滤掉所有 `status = STARRED` 的标星文章
   - 标星文章根本不会进入后续的窗口函数计算

2. **第二步**：对剩余非星标文章计算 `row_number()` 和 `max_la`

3. **第三步**：应用 `rn > 50` 和时间条件筛选待删除记录

4. **第四步**：执行删除操作

### 效果
标星文章从一开始就被排除在候选集之外，因此：
- ✅ 不会因为文章过旧而被删除
- ✅ 不会因为编号 `rn > 50` 而被删除
- ✅ 即使订阅源长久未更新，标星文章也会永久保留

> **测试验证**：[item_test.go](file:///e:/solo-code-2/yarr/src/storage/item_test.go#L370-L392) 中的 `keeps starred` 测试用例验证了这一点——10 篇被标星的旧文章（编号 1~10，`rn` 实际上很小，但即使 `rn` 很大）也不会被删除，最终保留 50 + 10 = 60 篇。

---

## 总结

`DeleteOldItems` 函数通过三层保护机制实现了智能的数据库体积控制：

| 机制 | 实现方式 | 保护效果 |
|------|---------|---------|
| **数量保护** | `row_number() + rn > 50` | 每个订阅源至少保留 50 篇最新文章 |
| **时间保护** | `max_la` 相对时间对比 | 不活跃订阅源不会被清空 |
| **用户标记保护** | `where status != STARRED` | 用户标星的文章永久保留 |

这三层机制共同作用，既控制了数据库体积，又保证了用户体验和数据安全。
