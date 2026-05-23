# SQLite 存储层并发性、配额清理与分页安全性深度分析

本文围绕 Gatus 在采用关系型存储（尤其是 SQLite）时的三个典型风险点——热重载期间的锁争用、结果集合配额维护的事务边界以及分页参数的健壮性——逐一展开分析，并基于代码现状给出结论。

涉及的关键代码位置：

- [sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L54-L105) —— `Store` 结构体与 `NewStore`
- [sql.go (InsertEndpointResult)](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L239-L381) —— 结果写入与配额清理主流程
- [sql.go (deleteOldEndpointResults)](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L1025-L1043) —— 超量结果的批量删除
- [specific_sqlite.go](file:///e:/solo-code-2/gatus/storage/store/sql/specific_sqlite.go) —— SQLite schema 与索引
- [store.go](file:///e:/solo-code-2/gatus/storage/store/store.go#L120-L151) —— `store.Initialize`
- [main.go (initializeStorage)](file:///e:/solo-code-2/gatus/main.go#L102-L215) —— 热重载期间的存储初始化与清理
- [main.go (listenToConfigurationFileChanges)](file:///e:/solo-code-2/gatus/main.go#L226-L252) —— 热重载时序
- [memory/util.go](file:///e:/solo-code-2/gatus/storage/store/memory/util.go#L11-L77) —— 内存层分页 `ShallowCopyEndpointStatus` / `getStartAndEndIndex`
- [api/util.go](file:///e:/solo-code-2/gatus/api/util.go#L17-L46) —— HTTP 请求层的分页参数解析
- [api/endpoint_status.go](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L87-L114) —— `GetEndpointStatus` HTTP 入口
- [watchdog/endpoint.go](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L15-L32) —— `monitorEndpoint` 的立即执行与 Ticker 循环

---

## 问题一：SQLite 热重载期间的锁争用与 `database-is-locked` 风险

### 1.1 SQLite 连接的预配置

在 [sql.go:89-96](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L89-L96)，当驱动为 `sqlite` 时，Gatus 主动施加了三条关键约束：

```go
if driver == "sqlite" {
    _, _ = store.db.Exec("PRAGMA journal_mode=WAL")
    _, _ = store.db.Exec("PRAGMA synchronous=NORMAL")
    // Prevents driver from running into "database is locked" errors
    // This is because we're using WAL to improve performance
    store.db.SetMaxOpenConns(1)
}
```

- 开启 **WAL 日志模式**：读者与写者不再互斥，读可以与写并发。
- 降级 `synchronous=NORMAL`：降低 flush 开销。
- **`SetMaxOpenConns(1)`**：整个 `sql.DB` 连接池被强制压缩为单连接。这是最根本的"防线"——Go 侧任何时刻只有一个连接能访问 SQLite 文件，因此从 **driver 层面彻底规避了多连接竞争同一个文件锁** 导致的 `SQLITE_BUSY`。

### 1.2 `initializeStorage` 的实际执行时序

热重载的完整顺序在 [main.go:226-252](file:///e:/solo-code-2/gatus/main.go#L226-L252)：

```
T0: stop(cfg)                           // 终止 watchdog、controller(=HTTP server)、metrics
T1: time.Sleep(1 * time.Second)
T2: save()
T3: loadConfiguration()
T4: store.Get().Close()                 // 关闭旧 DB 句柄
T5: initializeStorage(updatedConfig)     // 新 DB、删除失效 keys、清理告警
T6: start(updatedConfig)                // 重新启动 controller / watchdog
```

在 `T5` 调用的 `initializeStorage` 里，主要的写操作是：

1. `DeleteAllSuiteStatusesNotInKeys(...)` —— 单条 `DELETE FROM suites WHERE suite_key NOT IN (...)`
2. `DeleteAllEndpointStatusesNotInKeys(...)` —— 单条 `DELETE FROM endpoints WHERE endpoint_key NOT IN (...)`
3. 对每个 Endpoint 循环执行 `DeleteAllTriggeredAlertsNotInChecksumsByEndpoint` 与 `GetTriggeredEndpointAlert`

这些操作**全部串行在主 goroutine 中**；此时 HTTP server 尚未重启、watchdog 也未启动，因此前端 API 不可能与这些操作发生真正的并发。换言之，"初始化期间高并发前端轮询"这一场景在当前代码中**并不会真的出现**。

### 1.3 真正的并发窗口：`start(updatedConfig)` 之后

锁争用的压力高峰实际上出现在 `start()` 之后：

- `watchdog.Monitor` 会为每个启用的 Endpoint 立即启动一个 goroutine，并在 [watchdog/endpoint.go:16-17](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L16-L17) 直接执行 `executeEndpoint`（无延迟）：

  ```go
  // Run it immediately on start
  executeEndpoint(ep, cfg, extraLabels)
  ticker := time.NewTicker(ep.Interval)
  ```

- 每个 `executeEndpoint` 最终调用 `store.Get().InsertEndpointResult`，开启一次写事务。
- 与此同时 `controller.Handle` 已将 HTTP server 启动，前端恢复轮询，读取走 `GetAllEndpointStatuses` / `GetEndpointStatus` 等事务。

由于 `SetMaxOpenConns(1)`，Go 侧的 `*sql.DB` 会把所有 `Begin/Exec/Query` 序列化到同一个物理连接上，因此：

- **不会触发 `database-is-locked` 异常**（SQLite 的 `SQLITE_BUSY` 只有在多连接并发写/读写冲突时才会抛出；单连接下 Go 的 `database/sql` 会在连接层面队列化请求）。
- 但代价是 **所有操作串行排队**：当大量 Endpoint 在启动同时写库时，读请求（前端轮询）会被置于写事务之后等待，可能出现接口响应延迟。
- WAL 模式带来的"读写并发"优势在单连接策略下基本被抵消；它仅对极端情况（例如通过 `*sql.Conn` 直接使用 raw connection、或者驱动在内部额外创建辅助连接）提供兜底。

### 1.4 结论

- 若严格按照当前代码路径，`initializeStorage` 阶段前端 HTTP server 已被 `stop()` 关闭，**不存在高并发前端轮询**，因此不会产生真正的锁争用。
- 真正的写压力来自 `start()` 之后 watchdog 立即执行的大量 `InsertEndpointResult`。此时由于 `SetMaxOpenConns(1)` 串行化，**不会抛出 `database-is-locked`**，但会出现吞吐瓶颈与读请求排队等待。
- 若用户在外部绕过 Gatus 的 HTTP 层（例如直接用 `sqlite3` 或其他进程操作同一个 DB 文件）进行并发读写，则由于 `PRAGMA journal_mode=WAL` 的加持，冲突概率较低，但仍可能在极端写压力下看到 `SQLITE_BUSY`；Gatus 自身对此未做 `busy_timeout` 或重试。

---

## 问题二：`InsertEndpointResult` 配额清理的粒度与事务隔离

### 2.1 触发条件：高于阈值时一次性批量清理

在 [sql.go:322-331](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L322-L331) 中，清理由一段 `if` 守卫：

```go
numberOfResults, err := s.getNumberOfResultsByEndpointID(tx, endpointID)
if err == nil {
    if numberOfResults > int64(s.maximumNumberOfResults+resultsAboveMaximumCleanUpThreshold) {
        if err = s.deleteOldEndpointResults(tx, endpointID); err != nil {
            logr.Errorf(...)
        }
    }
}
```

其中 `resultsAboveMaximumCleanUpThreshold = 10`（见 [sql.go:34](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L34)）。也就是说：

- 并非每次写入都删除旧记录。
- 只有当当前数量 **超过** `maximumNumberOfResults + 10` 时才会触发一次清理。
- 这样把清理的成本 **摊销** 到 10 次写入上，避免每次写入都做一次大规模 `DELETE`。

### 2.2 清理 SQL：单条批量 `DELETE`，保留最新 N 条

`deleteOldEndpointResults` 的实现位于 [sql.go:1025-1043](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L1025-L1043)：

```go
DELETE FROM endpoint_results
WHERE endpoint_id = $1
  AND endpoint_result_id NOT IN (
      SELECT endpoint_result_id
      FROM endpoint_results
      WHERE endpoint_id = $1
      ORDER BY endpoint_result_id DESC
      LIMIT $2
  )
```

关键点：

- **不是逐条 `DELETE`**，而是一条批量语句一次性删除所有"超出配额的旧行"。
- 清理量通常是 `resultsAboveMaximumCleanUpThreshold`（即 10 条左右），因为触发条件就是 `count > maximum + 10`，所以真正要删的行数约为 10，而不是从 `maximum+10` 条开始逐条删。
- 对 `endpoint_events`、`suite_results` 也采用完全相同的模式（[sql.go:1005-1023](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L1005-L1023)）。

### 2.3 事务边界

`InsertEndpointResult` 的整体流程从 [sql.go:240](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L240) `tx, err := s.db.Begin()` 开始，到 [sql.go:377-379](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L377-L379) `tx.Commit()` 结束。所有子操作：

- `getEndpointID` / `insertEndpoint`
- `getNumberOfEventsByEndpointID` / `insertEndpointEvent` / `deleteOldEndpointEvents`
- `insertEndpointResult`
- `getNumberOfResultsByEndpointID` / `deleteOldEndpointResults`
- `updateEndpointUptime` / `mergeHourlyUptimeEntriesOlderThanMergeThresholdIntoDailyUptimeEntries`
- 写穿透缓存刷新

**全部运行在同一个事务 `tx` 内**，最终一次 `COMMIT`。

### 2.4 并发写入时的隔离性

- **SQLite 侧**：开启 WAL + `SetMaxOpenConns(1)` 后，写事务在任何时刻至多一个；其他等待者在 Go 连接池层排队，因此对外部观察者而言写入是 **完全串行** 的，不存在"两个写事务同时看到中间态"的可能。
- **PostgreSQL 侧**：`tx.Begin()` 默认使用连接级隔离级别（`lib/pq` 默认 `READ COMMITTED`）。每个 Endpoint 的写入操作在一个事务内完成后才 `COMMIT`，其他并发写事务不会看到本事务未提交的部分结果。
- **写入缓存层（写穿透）**：在 [sql.go:364-376](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L364-L376) 中，缓存刷新是在**事务 `Commit` 之前**执行的（使用当前事务 `tx` 读取最新数据并 `SetWithTTL`）。如果 `Commit` 失败、事务回滚，缓存里却已经是"未来"的状态——这是一个小的一致性瑕疵，但不影响磁盘数据的事务原子性。
- **静默失败的清理**：注意 `deleteOldEndpointResults`、`deleteOldEndpointEvents`、`updateEndpointUptime` 的错误都只是 `logr.Errorf` 记录，并不会中断或回滚事务。即便清理失败，最新结果仍然会被成功 `COMMIT`。这种设计使配额约束变成 **尽力而为**，而不是强一致。

### 2.5 结论

- 底层清理使用 **单条批量 `DELETE ... WHERE id NOT IN (SELECT ... LIMIT max)`** 的模式，一次事务内清掉约 10 条"超量行"。
- 整个写入+清理在**同一个事务**中，对磁盘数据而言具备事务原子性。
- **SQLite 下由于单连接策略写入串行，绝对不存在并发写相互干扰**；PostgreSQL 下由于每次写入在独立事务中完成并立即提交，也满足 `READ COMMITTED` 级别的事务隔离。
- 轻微瑕疵：缓存刷新在 `Commit` 之前完成；如果最终 `Commit` 失败，缓存中可能残留短暂的"超前"数据。

---

## 问题三：超大页码下分页的越界与内存安全

### 3.1 分页参数的来源与约束

HTTP 层的分页解析集中在 [api/util.go:17-46](file:///e:/solo-code-2/gatus/api/util.go#L17-L46)：

```go
func extractPageAndPageSizeFromRequest(c *fiber.Ctx, maximumNumberOfResults int) (page, pageSize int) {
    // ... 解析 Query 参数，缺省 DefaultPage=1、DefaultPageSize=50
    if page == 1 && pageSize > maximumNumberOfResults {
        pageSize = maximumNumberOfResults
    } else if pageSize < 1 {
        pageSize = DefaultPageSize
    }
    return
}
```

注意这个约束 **只对 `page == 1` 的情况限制 `pageSize` 上限**。对于 `page >= 2` 的请求，即便传入极大的 `pageSize` 或极大的 `page`，都不会在 API 层被裁剪。

### 3.2 存储层的两条实现路径

#### 3.2.1 SQL 路径

在 [sql.go:791-803](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L791-L803)（`getEndpointResultsByEndpointID`）与 [sql.go:761-789](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L761-L789)（`getEndpointEventsByEndpointID`）中：

```go
rows, err := tx.Query(`
    SELECT ...
    FROM endpoint_results
    WHERE endpoint_id = $1
    ORDER BY endpoint_result_id DESC
    LIMIT $2 OFFSET $3
`, endpointID, pageSize, (page-1)*pageSize)
```

- 当 `(page-1)*pageSize` 超过总行数时，SQL 层面会返回 **空结果集**，`rows.Next()` 循环一次都不进入，`results` 切片保持 nil。
- `pageSize` 决定的是 **预分配上限**，而不是实际分配的内存；切片的容量由 `append` 的增长策略控制。
- 若 `pageSize` 极大（例如 `math.MaxInt32`），SQLite 仍会按 OFFSET 扫描然后 LIMIT，但 Go 侧只对实际返回的行 `append`。SQLite 自身对 LIMIT/OFFSET 数值范围的约束远小于 `int` 上限，因此**不会造成进程级别的 OOM**，只是查询变慢。

#### 3.2.2 内存路径

`ShallowCopyEndpointStatus`（[memory/util.go:11-37](file:///e:/solo-code-2/gatus/storage/store/memory/util.go#L11-L37)）委托给 `getStartAndEndIndex`：

```go
func getStartAndEndIndex(numberOfResults int, page, pageSize int) (int, int) {
    if page < 1 || pageSize < 0 {
        return -1, -1
    }
    start := numberOfResults - (page * pageSize)
    end   := numberOfResults - ((page - 1) * pageSize)
    if start > numberOfResults { start = -1 }
    else if start < 0         { start = 0 }
    if end > numberOfResults   { end = numberOfResults }
    return start, end
}
```

调用方随后：

```go
if resultsStart < 0 || resultsEnd < 0 {
    shallowCopy.Results = []*endpoint.Result{}
} else {
    shallowCopy.Results = ss.Results[resultsStart:resultsEnd]
}
```

几个值得注意的点：

1. **`page < 1` 或 `pageSize < 0` 直接返回空切片**——对无效输入友好。
2. `start` 在切片下界之下时被夹到 0，在上界之上时返回空。
3. `end` 被夹到 `numberOfResults`。因此即便 `page/pageSize` 极大，最终得到的都是 **合法的子切片区间**，不会越界。
4. **返回的是共享底层数组的子切片**（浅拷贝），而不是新分配的副本，所以内存安全、高效。
5. 理论上的边界：`start` 是 `numberOfResults - page*pageSize`，如果 `pageSize` 非常大导致 `page*pageSize` 整数溢出，`start` 会变成负值，被夹到 0，随后切片仍合法——因此即便整数溢出也不会崩溃。
6. 但当 `pageSize` 为 0 时要特别小心：`page < 1` 的判断并不包括 `pageSize == 0`，因此 `start = end = numberOfResults`，得到零长度子切片 `ss.Results[n:n]`，合法。

现有测试 [memory/util_test.go:29-67](file:///e:/solo-code-2/gatus/storage/store/memory/util_test.go#L29-L67) 已验证：页码超过实际数据时（如 page=4、pageSize=10，而实际只有 25 条）返回 0 条结果。

### 3.3 读请求与维护任务（清理）并发的影响

- **SQL 路径**：`GetEndpointStatus` 在事务内执行 `SELECT ... LIMIT/OFFSET`。若 `deleteOldEndpointResults` 在同一时刻完成 `COMMIT`，后续的读会看到"被清理后的新状态"；由于读是在自己的事务里，读到的数据是那一刻的一致快照。SQLite WAL 提供快照读语义，PostgreSQL 的 `READ COMMITTED` 同理。不会因"读到刚被删除的行"而产生越界，因为 OFFSET/LIMIT 由数据库端计算。
- **内存路径**：`GetEndpointStatusByKey` 在 `RLock` 下读取 `endpointCache`，随后释放锁再做 `ShallowCopyEndpointStatus`。如果此时另一 goroutine 正在 `InsertEndpointResult` 中重写 `ss.Results = ss.Results[len(ss.Results)-max:]`，则**读端持有的是旧的 `*endpoint.Status` 指针**（因为 `InsertEndpointResult` 是用 `s.endpointCache.Set(endpointKey, status)` 用新对象替换缓存项，而不是原地修改），因此读端的切片不会因为维护任务而突变。

### 3.4 结论

- **不会抛出越界异常**：无论是 SQL 路径（`LIMIT/OFFSET` 由数据库处理，无匹配行即返回空）还是内存路径（`getStartAndEndIndex` 将区间夹到合法范围），超大页码最终只会得到空切片。
- **不会造成无效的内存分配**：
  - SQL 路径下 `rows.Next()` 循环只对实际返回行数 `append`；即便 `pageSize` 很大，也不会产生大的空分配。
  - 内存路径下 `ShallowCopyEndpointStatus` 返回共享底层数组的子切片，不产生新的结果对象分配。
- **维护任务削减结果集不会影响正在进行的读**：
  - SQL 路径：事务的快照隔离保证读不会看到"删到一半"的状态。
  - 内存路径：`InsertEndpointResult` 通过 `Set` 替换缓存值，读端持有的旧对象不会被原地裁剪。
- 潜在小瑕疵：`extractPageAndPageSizeFromRequest` 仅对 `page == 1` 限制 `pageSize`，对 `page >= 2` 传入的超大 `pageSize` 不做裁剪，可能产生一次大范围 OFFSET 扫描；不过在现有代码下不会导致崩溃或越界，只是查询耗时增加。

---

## 综合建议

1. 若对 SQLite 锁稳定性有更高要求，可在 `NewStore` 中额外执行 `PRAGMA busy_timeout=5000`，在少量跨连接场景下进一步降低 `SQLITE_BUSY` 概率。
2. 若希望配额严格，可在 `deleteOldEndpointResults` 失败时回滚事务（或在后续某次写入里重试），当前实现是"尽力而为"。
3. 若担心超大 `pageSize` 扫描成本，可在 `extractPageAndPageSizeFromRequest` 中对所有页统一约束 `pageSize` 上限。
4. 缓存刷新建议放在 `Commit` 成功之后执行，以避免极端情况下缓存与磁盘数据短时间不一致。
