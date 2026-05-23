# API `EndpointStatuses` 缓存策略深度分析

本文档基于 Gatus 当前 `api` 模块的实现，针对 `EndpointStatuses` 接口所使用的全局 FIFO 缓存（容量 100、TTL 10s）在三个典型场景下的行为进行深入分析。

核心代码位置：
- 缓存定义：[cache.go](file:///e:/solo-code-2/gatus/api/cache.go)
- 接口实现：[endpoint_status.go](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L22-L52)
- 底层存储（SQLite 实现）：[sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L89-L96)
- 底层查询实现：[sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L117)

---

## 一、恶意攻击者高频随机 `page`/`pageSize` 引发的快速驱逐现象

### 1.1 关键实现回顾

```go
// api/cache.go
cache = gocache.NewCache().WithMaxSize(100).WithEvictionPolicy(gocache.FirstInFirstOut)

// api/endpoint_status.go
value, exists := cache.Get(fmt.Sprintf("endpoint-status-%d-%d", page, pageSize))
...
cache.SetWithTTL(fmt.Sprintf("endpoint-status-%d-%d", page, pageSize), data, cacheTTL)
```

缓存的键空间完全由 `page` 与 `pageSize` 的笛卡儿积决定，攻击者可以轻易构造出远超容量上限的独立键。

### 1.2 FIFO 驱逐的雪崩过程

FIFO（First-In-First-Out）策略按写入先后顺序驱逐，不考虑访问频率与新近度。当容量为 100 时，只要攻击者持续注入不同键：

1. **第一阶段（填充期）**：前 100 个不同的键被正常写入，缓存处于饱和状态。
2. **第二阶段（持续污染期）**：第 101 个键写入时，最早的键被驱逐，依次类推。攻击者每秒发送 N 个不同键（N 可以远大于 100），那么：
   - 每 1/N 秒就会有一条条目被挤出；
   - 所有合法用户的常用键（如 `page=1&pageSize=20`）都会在极短时间内失效，因为它们处于队列的"旧端"。
3. **第三阶段（完全失效期）**：在 FIFO 下，只要攻击者持续请求，**任何一个合法键的命中概率趋近于 0**。例如攻击者每毫秒发送一个新键，那么缓存中实际上只保留最近 100ms 内的新键，所有老键（包括真实用户使用的常规分页）都会被连续驱逐。

### 1.3 造成的具体现象

- **命中率塌陷**：正常用户几乎每次都触发 miss，退化为"裸数据库访问"。
- **缓存形同虚设**：系统设计上期望的 10 秒保护窗口完全失效，缓存的存在对防御无意义。
- **写入放大**：攻击者每来一个请求就会触发一次 `SetWithTTL`，反而给缓存本身带来额外的序列化/反序列化、内存分配与 FIFO 维护开销。
- **无自愈性**：与 LRU/LFU 不同，FIFO 不会因为合法用户的高频访问而把热点键"保住"，驱逐逻辑完全与使用热度无关，因此一旦被污染就持续污染，直到攻击者停止。

### 1.4 结论

在 FIFO + 小容量的组合下，**攻击者只需维持每秒数百个不同分页键**，即可让缓存对合法流量几乎完全失效，并将所有压力直接倾泻到底层存储层。

---

## 二、缓存失效下 `GetAllEndpointStatuses` 对 SQLite 的冲击

### 2.1 SQLite 存储层的关键约束

```go
// storage/store/sql/sql.go
if driver == "sqlite" {
    _, _ = store.db.Exec("PRAGMA foreign_keys=ON")
    _, _ = store.db.Exec("PRAGMA journal_mode=WAL")
    _, _ = store.db.Exec("PRAGMA synchronous=NORMAL")
    // Prevents driver from running into "database is locked" errors
    // This is because we're using WAL to improve performance
    store.db.SetMaxOpenConns(1)
}
```

此处显式将 `MaxOpenConns` 设为 1，目的就是用串行化来规避 SQLite 的经典 `database is locked`。但这同时也意味着**整个 Go 进程对该 SQLite 实例只有一条物理连接**，所有读写必须排队通过。

### 2.2 `GetAllEndpointStatuses` 的开销

该查询会聚合多张表（`endpoint_status`、`endpoint_status_result`、`endpoint_status_event`、`endpoint_status_uptime` 等），涉及多表 `JOIN` 与分页窗口；在端点数量较大时单次查询耗时可达毫秒到数百毫秒量级。

### 2.3 高频并发下的连锁反应

1. **连接池饱和**：`MaxOpenConns=1`，同一时刻只有一个查询能真正持有连接。其余查询在 `database/sql` 的内部队列中阻塞等待。队列深度随并发飙升而增长。
2. **`database is locked`（SQLITE_BUSY）**：虽然启用 WAL 并 `MaxOpenConns=1` 可以在很大程度上避免多连接冲突，但如果 watchdog 协程同时在执行写操作（`Insert`/清理过期数据），读查询与写查询仍会在 SQLite 层面的锁上竞争：
   - 写者持有 `RESERVED`/`PENDING` 锁时，读者无法推进；
   - 高频读请求持续撞锁，会出现 `SQLITE_BUSY`（`database is locked`）。
3. **查询超时与上下文取消**：Fiber 路由通常带请求超时，排队等待的查询会因上游超时被取消，形成"发出 → 排队 → 取消"的资源浪费链条。
4. **WAL 文件膨胀**：大量读请求会抑制 checkpoint 的机会（checkpoint 与读并发时会退化为 PASSIVE，甚至失败），导致 `-wal` 文件持续增长，查询变慢，进入恶性循环。
5. **CPU 与内存**：`json.Marshal` 大对象列表、Fiber 协程堆积、`database/sql` 内部的互斥竞争都会推高 CPU 与内存占用，最终触发 OOM 或节点被上游 LB 摘除。
6. **最致命的异常**：综合上述，底层抛出的致命异常通常是以下之一：
   - `database is locked`（`SQLITE_BUSY` / `SQLITE_BUSY_SNAPSHOT`）
   - 连接获取超时（`context deadline exceeded` 或 `sql: database is closed`）
   - WAL checkpoint 失败导致的磁盘空间耗尽（间接表现为 `disk I/O error`）

### 2.4 结论

SQLite 作为嵌入式单文件数据库，并不适合承担每秒数百甚至上千并发读的负载。在缓存被击穿的情况下，**数据库层最直接的致命异常是 `database is locked`**，并伴生查询队列积压、WAL 膨胀、资源耗尽等次生问题，最终导致服务整体不可用。

---

## 三、配置热重载删除 Endpoint 后的幽灵数据问题

### 3.1 缓存键构成的缺陷

```go
cache.Get(fmt.Sprintf("endpoint-status-%d-%d", page, pageSize))
```

键中只包含分页参数，**不包含任何与配置相关的校验和或版本号**（如 `cfg.Checksum()`、endpoint 列表哈希、配置版本号等）。这意味着只要 TTL 未到期，缓存会返回与当前实际配置无关的旧快照。

### 3.2 热重载的触发点

配置热重载发生在 [config/configuration.go](file:///e:/solo-code-2/gatus/config/configuration.go) 的监控协程中：当检测到配置文件变更，会重新加载并替换 `cfg.Endpoints`，同时通过 store 清理已删除 endpoint 的历史数据。

### 3.3 幽灵数据展示的具体时序

假设 `TTL = 10s`：

1. **T0**：缓存命中键 `endpoint-status-1-20`，返回包含 endpoint A 的快照。
2. **T1 = T0 + 1s**：管理员从配置中删除 endpoint A，热重载生效，底层 store 中 A 的状态数据被清理或标记为已删除。
3. **T1 ~ T0 + 10s**：任意用户请求 `page=1&pageSize=20`，`EndpointStatuses` 直接命中缓存，**仍然返回包含 A 的旧快照**。
4. **T0 + 10s**：缓存条目过期，下次请求才会重新走 `GetAllEndpointStatuses`，此时返回的才是最新配置下的真实结果。

### 3.4 影响范围

- **展示层幽灵数据**：前端仪表盘在最长 10 秒内仍会显示一个已被删除的 endpoint，造成监控视图与真实配置不一致。
- **级联影响**：如果前端依赖该接口做告警聚合或自动决策，则会产生误判（例如 A 明明已删除却仍显示 `UP`/`DOWN`）。
- **与 Remote Instances 合并的叠加**：接口还会从远程实例拉取数据并 `append`。若远程端也删除了 A 而本地缓存没过期，整体列表仍会错误地包含 A。
- **可观测性问题**：用户排查"为什么 A 已经删了还在展示"时，无法从 HTTP 响应头或响应体中获知该结果来自旧缓存，定位困难。

### 3.5 是否会造成短暂幽灵数据展示？

**会，且最长持续 10 秒**（即 `cacheTTL`）。这是一个典型的"读缓存 + 无版本化键 + 写旁路（配置热重载不走缓存失效路径）"的一致性缺陷。

### 3.6 建议的修复方向（供参考）

1. **键中引入配置版本**：把 `cfg.Checksum()` 或 endpoint 数量/哈希拼入缓存键，例如 `endpoint-status-{checksum}-{page}-{pageSize}`。热重载后所有旧缓存键自然失效，无需主动清理。
2. **热重载时主动失效**：在配置热重载成功后主动清空全局 `cache`，或对 `endpoint-status-*` 前缀做通配失效（取决于 gocache 能力）。
3. **增加请求级校验**：返回响应时带上 `X-Config-Version` 头，前端可比对后判断是否需要强制刷新。
4. **缩小 TTL 或改用弱一致标记**：将 TTL 调小并在响应体里附带时间戳/版本号，使用户可显式感知数据新鲜度。

---

## 总结

| 维度 | 问题 | 根因 | 后果 |
| --- | --- | --- | --- |
| 缓存层 | FIFO 快速驱逐 | 小容量 + 键空间可被枚举 | 缓存命中率趋零，所有请求穿透到底层 |
| 存储层 | SQLite 崩溃 | 单连接 + 高频并发 | `database is locked`、WAL 膨胀、资源耗尽 |
| 一致性 | 幽灵数据 | 键未含配置版本 | 配置热重载后最长 10 秒内返回已删除 endpoint |

三者叠加构成一个典型的"缓存失效 → 数据库过载 → 展示不一致"的雪崩链条：攻击者通过随机分页击穿缓存 → SQLite 被并发读压垮 → 合法用户不仅看不到实时数据，还会在热重载时看到已删除 endpoint 的幽灵状态。建议从**缓存键版本化 + 缓存策略升级（LRU/LFU + 更大容量）+ 存储层限流/降级**三条路径同时治理。
