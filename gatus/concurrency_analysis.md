# Gatus 并发与一致性深度分析

本文档基于 Gatus 当前代码（v5）对 watchdog 并发监控、配置热重载与 controller 实时读取三大场景进行深入分析，并针对三个问题逐一展开讨论。

---

## 问题一：`cfg.Concurrency = 0` 时的雪崩效应

### 1.1 代码现状

在 [watchdog.go](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L11-L36) 中：

```go
const (
    // UnlimitedConcurrencyWeight is the semaphore weight used when concurrency is set to 0 (unlimited).
    // This provides a practical upper limit while allowing very high concurrency for large deployments.
    UnlimitedConcurrencyWeight = 10000
)

if cfg.Concurrency == 0 {
    monitoringSemaphore = semaphore.NewWeighted(UnlimitedConcurrencyWeight)
} else {
    monitoringSemaphore = semaphore.NewWeighted(int64(cfg.Concurrency))
}
```

随后在 [endpoint.go](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L35-L42) 中，每次 `executeEndpoint` 都会 `Acquire(ctx, 1)`：

```go
func executeEndpoint(ep *endpoint.Endpoint, cfg *config.Config, extraLabels []string) {
    if err := monitoringSemaphore.Acquire(ctx, 1); err != nil {
        return
    }
    defer monitoringSemaphore.Release(1)
    ...
}
```

当 endpoint 数量非常庞大（远超 10000）时，超过该上限的 goroutine 会在 `Acquire` 处阻塞等待，形成一个巨大的等待队列。

### 1.2 雪崩效应的多维度分析

#### 维度 A：系统资源（CPU / 内存 / 文件描述符）

- **goroutine 膨胀（启动阶段）**：`Monitor(cfg)` 为每个 endpoint 启动前都有 `time.Sleep(222 * time.Millisecond)` 的间隔，这意味着**每秒最多启动约 4.5 个 goroutine**，是一个极其平缓的渐进加载。100 个 endpoint 约需 22 秒，1000 个约需 3.7 分钟，**启动阶段不存在瞬间洪峰**。但需注意：被 222ms 错开启动的第一批 goroutine 会在 `monitorEndpoint` 中**立即执行一次** `executeEndpoint`（ticker 之前的首次执行），这些首次执行之间也是错开 222ms 的，因此也不会并发堆积。
- **goroutine 膨胀（稳态运行）**：当所有 endpoint 都已启动后，如果 endpoint 数量极大且 `cfg.Concurrency = 0`（即信号量权重 10000），稳态下会出现高并发。例如 10000 个 endpoint 每个 interval 为 10 秒，则稳态下每秒约有 1000 个 `executeEndpoint` 同时运行。此时被信号量放行的大量并发请求仍可能消耗较多系统资源，但这是**稳态持续高并发**而非**启动瞬间洪峰**。
- **文件描述符耗尽**：每次 `executeEndpoint` 都会通过 `http.Client`（或 gRPC/SSH/DNS 客户端）建立网络连接。`semaphore.Weighted` 只限制 *同时运行* 的 `Acquire` 数，不能限制 *已经建立但尚未关闭* 的连接数（尤其是 Keep-Alive 连接池）。稳态高并发下若每个 endpoint 使用独立 client，仍可能触达操作系统的 `ulimit -n` 限制（典型为 1024），造成 `too many open files`，进而导致：
  - 新的 TCP 建连失败；
  - DNS 解析的 socket 申请失败；
  - 甚至 log 文件 / TLS 证书文件无法打开。
- **调度开销放大**：Go runtime 在数万 goroutine 全部卡在 `Acquire` 时仍然会进行调度；当大量 permit 被同时释放并被下一批 goroutine 抢占时，调度器的 M-P-G 切换频率会激增，`syscall`/`nanosleep`/`futex` 热点显著上移，CPU 消耗从"业务工作"转移到"调度管理"。

#### 维度 B：Store 锁竞争（以 `memory.Store` 为例）

在 [memory.go](file:///e:/solo-code-2/gatus/storage/store/memory/memory.go#L193-L208) 中：

```go
func (s *Store) InsertEndpointResult(ep *endpoint.Endpoint, result *endpoint.Result) error {
    endpointKey := ep.Key()
    s.Lock()            // 写锁
    status, exists := s.endpointCache.Get(endpointKey)
    ...
    AddResult(status.(*endpoint.Status), result, ...)
    s.endpointCache.Set(endpointKey, status)
    s.Unlock()
    return nil
}
```

- **全局单一写锁**：`Store` 内嵌 `sync.RWMutex`，所有 endpoint 的写入串行化。当 10000 个并发 endpoint 几乎同时完成探测并调用 `InsertEndpointResult` 时，会有 **9999 个 goroutine 被阻塞在 `s.Lock()`**，等待唯一的写许可。
- **锁持有时间**：`AddResult` 内部会做切片 append、uptime map 更新等 O(1) 操作，但 GC 压力大时单次持有时间会被放大（例如 uptime map 的扩容触发 rehash）。一旦持有时间从 µs 级膨胀到 ms 级，吞吐量急剧下降。
- **写锁对读的抑制**：controller 侧使用 `RLock` 读取（见下文问题三）。由于 `Lock()` 需要等待所有正在进行的读完成，若 controller 正在执行 `GetAllEndpointStatuses` 这种遍历所有 endpoint 的操作，则写锁被推迟，所有等待写入的 goroutine 也随之堆积。

#### 维度 C：SQL Store 的额外压力

对于 [sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L238-L381) 中的 `InsertEndpointResult`：

- 每次写入都会开启一个事务，并可能执行 uptime merge、老数据清理等多个 SQL 语句。
- SQLite 模式下 `store.db.SetMaxOpenConns(1)`（见 [sql.go#L95](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L93-L96)），意味着 **所有并发事务在驱动层就已经被串行化**，但 Go 侧 10000 个 goroutine 仍然在争抢这 1 条连接，`database/sql` 内部的连接池等待队列会膨胀。
- 虽然使用了 WAL 模式（`PRAGMA journal_mode=WAL`），但 checkpoint 在高并发下仍可能阻塞读，形成"写阻塞写、再阻塞读"的二级级联。

### 1.3 总结：高并发的触发链条

```
cfg.Concurrency = 0
    ↓
monitoringSemaphore = 10000 (上限)
    ↓
endpoint 以每 222ms 一个的速率渐进启动（启动阶段安全）
    ↓
所有 endpoint 进入稳态 ticker 循环后
若 endpoint 数量极大且 interval 较短，稳态并发可达数千
    ↓
被信号量放行的大量并发 HTTP 请求
    ↓
文件描述符耗尽 / 建连失败（上游错误上报）
    ↓
几乎同时完成的探测结果涌入 InsertEndpointResult
    ↓
memory.Store 的写锁被长时间占用 → 其他写入阻塞
    ↓
controller 读锁排队 → 前端请求超时
    ↓
GC 压力增大 → 锁持有时间进一步拉长
    ↓
级联性能劣化，进程可能因 OOM 或 watchdog 超时被系统杀死
```

---

## 问题二：配置热重载与 `save` 落盘的数据完整性

### 2.1 相关代码路径

在 [main.go](file:///e:/solo-code-2/gatus/main.go#L226-L252) 中：

```go
func listenToConfigurationFileChanges(cfg *config.Config) {
    for {
        time.Sleep(30 * time.Second)
        if cfg.HasLoadedConfigurationBeenModified() {
            stop(cfg)                          // (1)
            time.Sleep(time.Second)            // (2) 等待 1s
            save()                             // (3)
            updatedConfig, err := loadConfiguration()
            ...
            store.Get().Close()                // (4)
            initializeStorage(updatedConfig)   // (5)
            start(updatedConfig)
            return
        }
    }
}
```

`stop(cfg)` 调用 [watchdog.Shutdown](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L62-L73)：

```go
func Shutdown(cfg *config.Config) {
    for _, ep := range cfg.Endpoints {
        ep.Close()               // 关闭进行中的 HTTP 连接
    }
    ...
    cancelFunc()                 // 取消 watchdog 根 context
}
```

### 2.2 当前 `save` 的真实行为

- `memory.Store.Save()` 直接 `return nil`（[memory.go#L324-L327](file:///e:/solo-code-2/gatus/storage/store/memory/memory.go#L324-L327)）。
- `sql.Store.Save()` 也直接 `return nil`（[sql.go#L572-L575](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L572-L575)），其注释写着：*"Save does nothing, because this store is immediately persistent."*
- 因此 **当前代码库中并不存在"批量将内存状态刷盘"的 save 实现**，理论上不会出现"部分写入被 save 截断"的场景。

> 额外提示：`store.go` 中定义的 `autoSave` 定时任务（[store.go#L153-L168](file:///e:/solo-code-2/gatus/storage/store/store.go#L153-L168)）在生产代码中并未被调用，仅在测试中引用。

### 2.3 真正的风险点：写入与 Close 的竞态

虽然 `save` 是空操作，但 `Close()` 并非空操作，而且发生在 `save()` 之后：

```
stop(cfg)  →  cancelFunc()
                        │
                        ├─ monitorEndpoint 的 ticker select 收到 ctx.Done() 返回
                        ├─ 已进入 executeEndpoint 但尚未 Acquire 的 goroutine: Acquire(ctx,1) 返回 ctx 错误，提前 return
                        └─ 已越过 Acquire 并正在执行 ep.EvaluateHealth() 的 goroutine：
                                ep.Close() 已在 Shutdown 中先于 cancelFunc 被调用，
                                正在进行的 HTTP 请求会被中断，得到 context canceled/connection reset。
                                随后 UpdateEndpointStatus 仍可能被调用，写入 store。
time.Sleep(1s)
save()                       ← 对 sql/memory 都是 no-op
store.Get().Close()          ← SQL: 关闭 db 连接池、清空 write-through 缓存
```

**结论**：

1. **不会出现"部分写入被 save 截断"**，因为 `save` 本身就是 no-op；真正的数据持久化是 SQL Store 每次 `InsertEndpointResult` 的事务 `tx.Commit()`（见 [sql.go#L377-L380](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L377-L380)），一旦提交即落库，具备原子性。
2. **存在潜在竞态**：若某个 `executeEndpoint` 在 `time.Sleep(1s)` 窗口之后才返回并调用 `InsertEndpointResult`，此时 `store.Get().Close()` 已将 SQL 连接关闭，会得到 `sql: database is closed` 错误，但**不会写入半条数据**（因为事务要么 commit 要么 rollback，整体原子）。
3. **memory Store 没有 Close 风险**，但其 `endpointCache` 是进程内对象，重启后丢失属于预期。

### 2.4 若将来实现"批量 save"应如何避免数据截断

假设未来给 `memory.Store` 增加将 `endpointCache` 序列化成 JSON 并写盘的能力，推荐模式：

```go
func (s *Store) Save() error {
    s.RLock()                 // 取读锁而非写锁，允许同时读
    snapshot := s.deepCopyAllStatusesLocked()
    s.RUnlock()
    // 锁外序列化、IO，避免长时间持锁
    return writeToDiskAtomically(snapshot)
}
```

关键要点：

- **使用读锁而非写锁**：save 只需要一致性快照，不需要修改数据；让并发写入能继续获取写锁而不阻塞。
- **深拷贝（或 Copy-on-Write）快照**：避免在锁外 IO 时底层切片被 writer 修改。
- **原子写盘**：先写临时文件 `*.tmp`，完成后 `rename` 替换目标文件，确保进程中途崩溃不会留下截断的 JSON。
- **与写入端协调**：save 前调用 `watchdog.Shutdown` + `time.Sleep` 已是现有做法，若需更强一致性可引入"写入代次"（write generation）让 save 识别自己是哪个快照。

---

## 问题三：前端 UI 读取的一致性与并发安全性

### 3.1 读取路径

Controller 侧通过 Fiber HTTP 处理函数调用 [api.EndpointStatuses](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L22-L52) 或 [api.EndpointStatus](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L87-L115)：

```go
endpointStatuses, err := store.Get().GetAllEndpointStatuses(paging.NewEndpointStatusParams().WithResults(page, pageSize))
```

最终进入 `memory.Store.GetAllEndpointStatuses`（[memory.go#L46-L60](file:///e:/solo-code-2/gatus/storage/store/memory/memory.go#L46-L60)）：

```go
func (s *Store) GetAllEndpointStatuses(params *paging.EndpointStatusParams) ([]*endpoint.Status, error) {
    s.RLock()
    defer s.RUnlock()
    allStatuses := s.endpointCache.GetAll()
    pagedEndpointStatuses := make([]*endpoint.Status, 0, len(allStatuses))
    for _, v := range allStatuses {
        if status, ok := v.(*endpoint.Status); ok {
            pagedEndpointStatuses = append(pagedEndpointStatuses, ShallowCopyEndpointStatus(status, params))
        }
    }
    ...
    return pagedEndpointStatuses, nil
}
```

### 3.2 当前实现的保护与局限

| 方面 | 现状 | 说明 |
|------|------|------|
| 同一次读取内多 endpoint 的一致性 | ⚠️ **非快照一致** | 在 `RLock` 范围内遍历所有 endpoint 并逐个做 shallow copy。Go 允许多个 `RLock` 并存但 `Lock` 会等待所有 `RLock` 释放，因此**单次读调用内不会与写并发**；但多个连续读调用之间状态可能已变化。 |
| 单 endpoint 的 Results 与 Events 一致性 | ⚠️ **弱一致** | `ShallowCopyEndpointStatus`（[util.go#L11-L38](file:///e:/solo-code-2/gatus/storage/store/memory/util.go#L11-L38)）仅复制切片头（`len`/`cap`/`data` 指针），底层数组仍与 writer 共享。若 writer 的 `append` 未触发底层数组扩容（容量足够），则在原数组上写入新元素；reader 在 `RLock` 释放后做 `json.Marshal` 遍历时，可能读到新旧混合的数据。若 `append` 触发了扩容则 reader 持有的是旧数组，不受影响。**这不是 panic，只是数据不一致**。 |
| uptime / hourlyStatistics 一致性 | ✅ **安全** | `Status.Uptime` 字段有 `json:"-"` 标签（见 [status.go#L28](file:///e:/solo-code-2/gatus/config/endpoint/status.go#L28)），前端 API 在 `json.Marshal` 序列化时**完全不读取此字段**。所有主动读取 Uptime map 的函数（`GetUptimeByKey`、`GetAverageResponseTimeByKey`、`GetHourlyAverageResponseTimeByKey`）均在 `RLock` 保护下执行。`ShallowCopyEndpointStatus` 中 Uptime 被替换为 `endpoint.NewUptime()` 创建的新空对象，不与源数据共享。因此**不存在无锁并发读写 Uptime map 引发 panic 的路径**。 |
| SQL Store 读取 | ✅ 事务内一致 | `GetEndpointStatusByKey` 等使用 `s.db.Begin()` 开启事务，所有读取在同一快照内完成。 |

### 3.3 竞态复现（理论场景）

```go
// Reader (goroutine A) — 在 RLock 内获取 shallow copy
shallowCopy := ShallowCopyEndpointStatus(original)
// RLock 已释放
for _, r := range shallowCopy.Results {   // 遍历共享底层数组
    fmt.Println(r.Duration)
}

// Writer (goroutine B) — 在 Lock 内修改
AddResult(status, newResult, maxResults, maxEvents)
// 内部：status.Results = append(status.Results, newResult)
//       若未触发扩容 → 直接在原数组写入 → reader 可见新旧混合
//       若触发扩容   → 分配新数组 → reader 仍持有旧数组，不受影响
```

典型后果：

- **切片视图错乱**：reader 拿到长度 N 的切片头，但 writer 在同一底层数组写入新元素（未扩容时），reader 遍历过程中可能读到"刚刚写入但不属于本次快照"的新结果。更严重的是 writer 执行截断操作 `status.Results = status.Results[1:]` 后，新切片头指向原数组的位置 1，但 reader 的切片头仍指向位置 0，reader 实际读到的是已被逻辑删除的过期数据。
- **数据不一致但无 panic**：Go 切片底层是数组，并发读写不会触发 runtime panic，只是数据不一致。这与 map 并发读写有本质区别。

### 3.4 建议的修复策略

#### 策略 1：Copy-on-Write（推荐，改动最小）

在 `InsertEndpointResult` 中不再原地修改 `status.Results`，而是构造一个新切片再 `Set` 回去：

```go
func (s *Store) InsertEndpointResult(ep *endpoint.Endpoint, result *endpoint.Result) error {
    s.Lock()
    defer s.Unlock()
    status := s.endpointCache.GetValue(ep.Key())
    if status == nil {
        status = endpoint.NewStatus(ep.Group, ep.Name)
    }
    st := status.(*endpoint.Status)
    // 深拷贝 Results 与 Events，避免与 reader 共享底层数组
    newResults := make([]*endpoint.Result, 0, len(st.Results)+1)
    newResults = append(newResults, st.Results...)
    newResults = append(newResults, result)
    if len(newResults) > s.maximumNumberOfResults {
        newResults = newResults[len(newResults)-s.maximumNumberOfResults:]
    }
    st.Results = newResults
    // Events 类似处理
    // Uptime.HourlyStatistics 无需 CoW：前端 API 不读取（json:"-"），
    // 所有程序化读取均在 RLock 下，且 map 由 writer 独占修改
    processUptimeAfterResult(st.Uptime, result)

    s.endpointCache.Set(ep.Key(), st)
    return nil
}
```

reader 侧的 `ShallowCopyEndpointStatus` 在 `RLock` 下拿到的 `st.Results` 从此不再被 writer 修改，**彻底消除数据竞争**。

代价：每次写入多一次 O(N) 拷贝；若 `maximumNumberOfResults` 设为 1000，该开销通常可接受。

#### 策略 2：每个 Endpoint 独立 RWMutex

将 `Store` 级别的全局锁拆成每个 endpoint 一把锁：

```go
type Store struct {
    sync.RWMutex              // 仅保护 endpointCache map 本身
    locks map[string]*sync.RWMutex
    endpointCache *gocache.Cache
}
```

好处：跨 endpoint 无锁竞争；坏处：实现复杂度较高，且要避免 key 删除后锁泄漏。

#### 策略 3：API 层快照缓存

[api.EndpointStatuses](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L25-L50) 已经有一层 TTL 缓存（`cache.SetWithTTL`），可以将其升级为"定时快照"模式：后台每 1–2 秒生成一次全量快照并替换，前端始终读取最新快照。这样完全避免请求路径与写入路径的锁交互。

### 3.5 跨多维度一致性

"心跳 + 延迟"等多维度数据对应 `Status.Results` / `Status.Uptime.HourlyStatistics` / `Status.Events` 等多个字段：

- **单次 HTTP 请求内**：只要使用策略 1 的 CoW，并在 `RLock` 范围内一次完成所有字段的 shallow copy，即可保证本次响应的各字段来自同一时刻。
- **跨多次请求**：无法保证（实时监控系统的普遍限制），前端应允许展示时附带时间戳让用户理解数据是"近似实时"的。
- **与 SQL Store 的对比**：SQL Store 以事务为天然快照边界，一致性优于 memory 实现；如果对一致性要求高，推荐直接切换到 SQLite/Postgres Store。

---

## 结论汇总

| 问题 | 风险等级 | 现状 | 建议 |
|------|----------|------|------|
| 并发 = 0 的稳态高并发 | 🔴 高 | 启动阶段 222ms 间隔保证安全；但稳态下大量 endpoint 并发探测仍可能触达 FD/内存/锁瓶颈 | 限制默认值；按 endpoint 总数自适应信号量权重；引入分批次调度 |
| save 与写入的竞态 | 🟡 中 | `save` 实际是 no-op，真正的写入是事务化的，不存在数据截断 | 保持现状即可；若未来实现批量 save，务必采用 CoW + 原子写盘 |
| 前端读取一致性 | 🟡 中 | Uptime map 不存在无锁并发读写 panic（json:"-" + RLock 保护）；但 Results/Events 切片共享底层数组，存在数据不一致风险 | 对 Results/Events 采用 Copy-on-Write；或改用 SQL Store 以获得事务一致性 |

> 本分析基于当前仓库代码静态阅读得出，未在真实负载下做压测。如需进一步验证，建议在 CI 中引入 `go test -race` 并构造 10k+ endpoint 的集成测试。
