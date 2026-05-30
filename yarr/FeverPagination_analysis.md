# Fever 协议 Keyset 分页机制深度分析

本文档对 [fever.go](file:///e:/solo-code-2/yarr/src/server/fever.go#L295-L315) 中 `feverUnreadItemIDsHandler` 的循环分页逻辑，以及 [item.go](file:///e:/solo-code-2/yarr/src/storage/item.go) 中 `ListItems` 的 SQL 查询实现进行深度分析。

---

## 问题 1：`itemFilter.After` 如何在 ListItems 的 SQL 查询中作为分页条件

### 调用链路

在 [feverUnreadItemIDsHandler](file:///e:/solo-code-2/yarr/src/server/fever.go#L295-L315) 中，循环分页的核心代码如下：

```go
itemFilter := storage.ItemFilter{
    Status: &status,
}
for {
    items := s.db.ListItems(itemFilter, listLimit, true, false)
    if len(items) == 0 {
        break
    }
    for _, item := range items {
        itemIds = append(itemIds, item.Id)
    }
    itemFilter.After = &items[len(items)-1].Id
}
```

每次循环取最多 50 条（[listLimit](file:///e:/solo-code-2/yarr/src/server/fever.go#L226) = 50），将最后一条文章的 `Id` 赋值给 `itemFilter.After`，作为下一次查询的游标。

### SQL 分页条件的生成

在 [listQueryPredicate](file:///e:/solo-code-2/yarr/src/storage/item.go#L173-L249) 中，`After` 字段被翻译为如下 SQL 条件：

```go
if filter.After != nil {
    compare := ">"
    if newestFirst {
        compare = "<"
    }
    cond = append(cond, fmt.Sprintf(
        "(i.date, i.id) %s (select date, id from items where id = :after_id)",
        compare,
    ))
    args = append(args, sql.Named("after_id", *filter.After))
}
```

由于 `feverUnreadItemIDsHandler` 调用 `ListItems` 时 `newestFirst=true`，所以 `compare = "<"`，生成的 SQL 条件为：

```sql
(i.date, i.id) < (SELECT date, id FROM items WHERE id = :after_id)
```

结合 [ListItems](file:///e:/solo-code-2/yarr/src/storage/item.go#L261-L308) 中的 ORDER BY 子句：

```go
order := "date desc, id desc"
```

完整的 SQL 查询结构为：

```sql
SELECT i.id, i.guid, i.feed_id, i.title, i.link, i.date, i.status, i.media_links, '' as content
FROM items i
WHERE i.status = :status
  AND (i.date, i.id) < (SELECT date, id FROM items WHERE id = :after_id)
ORDER BY date DESC, id DESC
LIMIT 50
```

### 工作原理

这是典型的 **Keyset Pagination（键集分页/游标分页）** 模式：

1. **第一次查询**（无 `After`）：按 `date DESC, id DESC` 排序取前 50 条
2. **后续查询**：用上一批最后一条的 `id` 查出其 `(date, id)` 元组，然后用元组比较 `(i.date, i.id) < (last_date, last_id)` 跳过已读取的记录
3. **循环终止**：当 `ListItems` 返回空结果时退出

与传统的 `OFFSET/LIMIT` 分页不同，Keyset 分页不需要扫描并跳过前面的所有行，而是通过索引直接定位到下一批数据的起始位置。

---

## 问题 2：组合对比条件 `(date, id)` 为什么能保证不漏掉和不重复文章

### 元组比较的语义

SQL 中元组比较 `(a, b) < (c, d)` 等价于：

```
a < c OR (a = c AND b < d)
```

因此 `(i.date, i.id) < (last_date, last_id)` 等价于：

```sql
i.date < last_date OR (i.date = last_date AND i.id < last_id)
```

### 全序性保证

`id` 是 `INTEGER PRIMARY KEY AUTOINCREMENT`，具有以下特性：

- **唯一性**：任意两条记录的 `id` 一定不同
- **单调递增**：后插入的记录 `id` 一定更大

因此在元组 `(date, id)` 上存在严格的**全序关系**：即使 `date` 相同，`id` 也一定不同，所以任意两条不同记录的 `(date, id)` 元组一定可以比较大小。

### 不重复的证明

假设第 N 轮查询返回的最后一条记录为 `(d_N, id_N)`，则第 N+1 轮的 WHERE 条件为：

```sql
(i.date, i.id) < (d_N, id_N)
```

由于 `<` 是严格小于，元组 `(d_N, id_N)` 本身不会出现在下一轮结果中。而已返回的更早记录 `(d, id)`（其中 `(d, id) > (d_N, id_N)`）也不会出现，因为它们不满足 `<` 条件。因此 **不会重复**。

### 不遗漏的证明

`ORDER BY date DESC, id DESC` 定义了记录的全序排列。对于任意一条未读记录 R，其元组 `(date_R, id_R)` 在全序中恰好有一个确定位置。假设游标为 `(d_N, id_N)`：

- 如果 `(date_R, id_R) < (d_N, id_N)`，则 R 会在当前或后续轮次被查到
- 如果 `(date_R, id_R) >= (d_N, id_N)`，则 R 已在前面的轮次中被查到

由于全序的完备性，不存在"既不满足 `<` 也不满足 `>=`"的记录，因此 **不会遗漏**。

### 具体示例：date 相同的情况

假设有以下未读文章：

| id | date       |
|----|------------|
| 10 | 2025-01-01 |
| 20 | 2025-01-01 |
| 30 | 2025-01-02 |

按 `date DESC, id DESC` 排序后为：`(2025-01-02, 30) → (2025-01-01, 20) → (2025-01-01, 10)`

- 第 1 轮（假设 LIMIT=2）：取到 `(2025-01-02, 30)` 和 `(2025-01-01, 20)`，游标设为 `id=20`
- 第 2 轮：条件为 `(date, id) < (2025-01-01, 20)`，即 `date < 2025-01-01 OR (date = 2025-01-01 AND id < 20)`
  - `(2025-01-01, 10)` 满足 `date = 2025-01-01 AND id < 20`，被正确取到
  - `(2025-01-01, 20)` 不满足（id 不严格小于 20），正确排除

如果仅用 `id < 20`（而非元组比较）且按 `date DESC` 排序，在 `date` 有重复值的情况下排序不稳定，可能导致结果不可预测。元组比较通过 `(date, id)` 建立全序，从根本上消除了这种不确定性。

---

## 问题 3：索引 `idx_item__date_id_status` 如何优化性能及深分页瓶颈

### 索引定义

在 [migration.go](file:///e:/solo-code-2/yarr/src/storage/migration.go#L307-L314) 中，迁移 `m09_change_item_index` 创建了该索引：

```sql
DROP INDEX IF EXISTS idx_item_status;
CREATE INDEX IF NOT EXISTS idx_item__date_id_status ON items(date, id, status);
```

该索引替代了原有的单列索引 `idx_item_status(status)`，列顺序为 `(date, id, status)`。

### 索引对查询的优化方式

以 `feverUnreadItemIDsHandler` 的典型查询为例：

```sql
SELECT i.id, i.guid, ...
FROM items i
WHERE i.status = 0
  AND (i.date, i.id) < (SELECT date, id FROM items WHERE id = :after_id)
ORDER BY date DESC, id DESC
LIMIT 50
```

索引 `idx_item__date_id_status(date, id, status)` 的 B+tree 结构按键 `(date, id, status)` 排列，对上述查询的优化体现在以下几个方面：

#### 1. ORDER BY 匹配 — 避免排序

`ORDER BY date DESC, id DESC` 与索引的前两列 `(date, id)` 的排列方向完全一致。SQLite 可以直接按索引逆序扫描，无需在内存中执行排序操作（免除 `Using filesort` / `B-TREE` 排序步骤）。

#### 2. Keyset 定位 — 范围扫描起点

元组比较 `(i.date, i.id) < (after_date, after_id)` 可以利用 B+tree 的有序性，直接将扫描起点定位到满足条件的第一条记录（通过二分查找在 O(log N) 时间内定位），然后从该位置开始顺序扫描，直到收集满 50 条或到达边界。

#### 3. 子查询优化

```sql
SELECT date, id FROM items WHERE id = :after_id
```

`id` 是主键，此子查询通过主键索引在 O(log N) 时间内完成，代价极低。

#### 4. 覆盖索引的部分利用

索引包含 `(date, id, status)` 三列。虽然查询还需要 `guid`、`feed_id` 等不在索引中的列（需要回表），但 `status` 在索引的第三列，可以在索引扫描时直接过滤，减少回表次数。

### 深分页的瓶颈分析

尽管 Keyset 分页避免了 `OFFSET` 的线性扫描问题，但在当前索引结构下仍存在瓶颈：

#### 瓶颈 1：索引列顺序与查询模式不匹配

当前索引为 `(date, id, status)`，而查询的核心过滤条件是 `status = :status`（等值过滤）+ `(date, id) < (...)`（范围过滤）。

按照索引设计的最左前缀原则，**等值条件的列应排在范围条件的列之前**，理想顺序应为 `(status, date, id)`：

| 索引方案 | WHERE status=0 AND (date,id)<(...) | ORDER BY date,id |
|---|---|---|
| `(date, id, status)` | 先按 date,id 定位范围，再逐行检查 status | ✅ 完美匹配 |
| `(status, date, id)` | 先定位 status=0 分区，再在分区内按 date,id 范围扫描 | ✅ 分区内有序 |

使用 `(date, id, status)` 时，SQLite 的执行策略为：

1. 在索引中定位 `(after_date, after_id)` 位置
2. 从该位置开始**逆序扫描**所有索引项
3. 对每条索引项检查第三列 `status` 是否等于 `:status`
4. 不匹配则跳过，匹配则加入结果

**问题**：如果未读文章只占全部文章的 1%，则扫描 50 条未读文章平均需要跳过约 5000 条已读/星标文章，产生了大量无效 I/O。

而如果使用 `(status, date, id)` 索引：

1. 直接定位到 `status = 0` 的索引分区
2. 在分区内用 `(date, id)` 定位游标位置
3. 从游标开始逆序扫描，**所有扫描到的记录都满足 status 条件**，无需跳过

#### 瓶颈 2：深分页时游标定位的累积代价

虽然每一轮查询的子查询 `SELECT date, id FROM items WHERE id = :after_id` 是 O(log N)，但如果数据量极大（如百万级），且未读比例极低，可能需要执行数千轮循环才能遍历完所有未读项。每轮都需要：

- 一次主键查找（O(log N)）
- 从游标位置开始的索引范围扫描（跳过大量非未读项）
- 50 次回表操作

总 I/O 量与"未读项在所有项中的稀疏程度"成正比。

#### 瓶颈 3：B+tree 层级增长

SQLite 的 B+tree 在数据量增长时层级增加：

| 数据量 | 约 B+tree 层级 |
|---|---|
| 10 万 | 2-3 层 |
| 100 万 | 3-4 层 |
| 1000 万 | 4-5 层 |

每一层增加一次磁盘 I/O（在缓存未命中时），定位代价从微秒级增长到毫秒级。对于深分页场景，每轮查询都需要从根节点重新遍历 B+tree，无法复用上一轮的遍历路径。

#### 瓶颈 4：缓存局部性下降

随着分页深入，访问的索引页面越来越远离"热区"（最近插入的数据）。SQLite 的页面缓存（默认约 2MB）倾向于保留最近访问的页面，深分页访问的历史数据页面可能已被换出，导致缓存命中率下降，磁盘 I/O 增加。

### 优化建议

如果需要在大数据量场景下提升未读列表的分页性能，可考虑：

1. **调整索引列顺序**：创建 `(status, date, id)` 索引替代 `(date, id, status)`，使等值过滤列在前，消除无效索引扫描
2. **批量返回 ID**：对于仅需要 ID 列表的场景（如 `feverUnreadItemIDsHandler`），可编写专用查询只返回 `id` 列，利用覆盖索引避免回表
3. **增大 SQLite 页面缓存**：通过 `PRAGMA cache_size` 增大缓存，减少深分页时的磁盘 I/O
