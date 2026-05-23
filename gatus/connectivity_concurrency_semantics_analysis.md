# Gatus 连通性检测 / 并发信号量 / 全局连通性语义 分析

本文档围绕 `config/connectivity/connectivity.go` 中 `Checker.IsConnected` 的并发安全、`watchdog/watchdog.go` 中 `Concurrency=0` 时的信号量上限语义，以及 `executeEndpoint` 将公网连通性作为所有端点健康检查的总闸门这三点进行分析。

---

## 1. `IsConnected` 的并发写入与"公网检测风暴"

### 1.1 代码现状

`Checker` 结构体与 `IsConnected` 的实现位于 [connectivity.go](file:///e:/solo-code-2/gatus/config/connectivity/connectivity.go#L36-L54)：

```go
type Checker struct {
    Target   string
    Interval time.Duration

    isConnected bool
    lastCheck   time.Time
}

func (c *Checker) IsConnected() bool {
    if now := time.Now(); now.After(c.lastCheck.Add(c.Interval)) {
        c.lastCheck, c.isConnected = now, c.Check()
    }
    return c.isConnected
}
```

`Check()` 的实现见 [connectivity.go#L44-L47](file:///e:/solo-code-2/gatus/config/connectivity/connectivity.go#L44-L47)，内部通过 `client.CanCreateNetworkConnection("tcp", c.Target, "", &client.Config{Timeout: 5*time.Second})` 发起一次 TCP 连接，默认超时 5 秒。

调用方是 watchdog 中的每个 goroutine：
- [endpoint.go#L44](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L44)
- [external_endpoint.go#L37](file:///e:/solo-code-2/gatus/watchdog/external_endpoint.go#L37)
- [suite.go#L42](file:///e:/solo-code-2/gatus/watchdog/suite.go#L42)

每个监控协程在每个周期都会调用一次 `IsConnected()`。

### 1.2 数据竞争判定（Go 数据竞争）

- 读：`now.After(c.lastCheck.Add(c.Interval))` 读 `c.lastCheck`；函数尾部读 `c.isConnected`。
- 写：`c.lastCheck, c.isConnected = now, c.Check()` 在条件成立时同时写两个字段。
- 这些读写全部发生在多个 goroutine 上，且没有任何 `sync.Mutex`、`sync/atomic`、`sync.RWMutex` 等同步原语保护。

按 Go 内存模型，**两个未同步的并发读写访问同一变量构成数据竞争**。使用 `go test -race` 运行时，该函数必然被竞态检测器报告。

具体后果（非穷举，属于未定义行为）：
1. 多个 goroutine 同时读到"过期"的 `c.lastCheck`，全部判定条件为 true。
2. 写入时 `c.lastCheck` 与 `c.isConnected` 各自为多字节值，在 32/64 位上被撕裂读取的可能性在 Go 内存模型下存在；读到"半写入"的 `time.Time` 会使 `Add`/`After` 出现不可预测结果。
3. `c.isConnected` 在一个 goroutine 写 `true`、另一个写 `false` 时可能出现读到"中间态"，尤其在 32 位架构上是真实风险。

### 1.3 关键前置：`executeEndpoint` 的 Acquire 在前、`IsConnected` 在后

在讨论"多少个 goroutine 能同时触发 `IsConnected`"之前，必须先看三条执行路径的调用顺序：

| 文件 | `Acquire` 位置 | `IsConnected` 位置 |
|---|---|---|
| [endpoint.go](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L35-L47) | L37 `monitoringSemaphore.Acquire(ctx, 1)` | L44 `cfg.Connectivity.Checker.IsConnected()` |
| [external_endpoint.go](file:///e:/solo-code-2/gatus/watchdog/external_endpoint.go#L28-L40) | L30 `monitoringSemaphore.Acquire(ctx, 1)` | L37 `cfg.Connectivity.Checker.IsConnected()` |
| [suite.go](file:///e:/solo-code-2/gatus/watchdog/suite.go#L33-L45) | L35 `monitoringSemaphore.Acquire(ctx, 1)` | L42 `cfg.Connectivity.Checker.IsConnected()` |

**三条路径全部是先 Acquire 信号量，再调用 `IsConnected()`。** 这意味着：能同时进入 `IsConnected()` 的 goroutine 数量，不会超过信号量的权重上限——信号量本身就是 `IsConnected` 并发度的"天然闸门"。

### 1.4 `ValidateAndSetConcurrencyDefaults` 对并发度的归一化

[config.go#L688-L699](file:///e:/solo-code-2/gatus/config/config.go#L688-L699)：

```go
func ValidateAndSetConcurrencyDefaults(config *Config) {
    if config.DisableMonitoringLock {
        config.Concurrency = 0                    // 路径 A：deprecated 标志 → 保持 0
    } else if config.Concurrency <= 0 && !config.DisableMonitoringLock {
        config.Concurrency = DefaultConcurrency   // = 3，路径 B → 普通 concurrency: 0
    }
}
```

[watchdog.go#L27-L36](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L27-L36)：

```go
if cfg.Concurrency == 0 {
    monitoringSemaphore = semaphore.NewWeighted(UnlimitedConcurrencyWeight) // = 10000
} else {
    monitoringSemaphore = semaphore.NewWeighted(int64(cfg.Concurrency))
}
```

**直接结论：普通 `concurrency: 0` 在进入 `Monitor` 之前会被改成 `3`。** 它走路径 B，信号量上限是 3。`Concurrency=0` 到达 `Monitor` 并触发 10000 上限的唯一路径是 `disable-monitoring-lock: true`（路径 A）。

### 1.5 真正能同时触发 `IsConnected` 的 goroutine 上限

| 配置方式 | 信号量上限 | 同时进入 `IsConnected` 的最大 goroutine 数 | 并发 `Check()` 风暴风险 |
|---|---|---|---|
| `concurrency: 0`（普通路径） | 3 | **最多 3 个** | 无实际风暴（仅 3 个 TCP 连接） |
| `concurrency: 5` | 5 | **最多 5 个** | 无实际风暴 |
| `disable-monitoring-lock: true`（deprecated） | 10000 | **最多 10000 个** | 存在真实风暴可能 |
| 未配置 | 3 | **最多 3 个** | 无实际风暴 |

**对之前分析的修正**：原分析假设"数百个 goroutine 同时跨过 Interval 边界并发调用 `IsConnected`"，这在普通路径下不可能发生——信号量上限 3 意味着同时进入 `IsConnected` 的 goroutine 不可能超过 3 个。

但即使只有 2~3 个 goroutine 并发进入，数据竞争依然成立：按 Go 内存模型，只要有两个并发的未同步读写访问同一变量，就构成数据竞争。`-race` 检测必然报告。

**风暴场景仅在废弃路径下真实存在**：如果用户仍使用 `disable-monitoring-lock: true`，信号量上限 10000 意味着同一微秒内可能有数百甚至数千个 goroutine 同时跨过 `now.After` 边界，全部判定 true 并同时发起 5 秒 TCP 连接到公网 DNS。这种突发连接峰值可能触发 Cloudflare 等 DNS 服务商的速率限制，导致 Gatus 源 IP 被临时封禁。

### 1.6 结论修正

- **数据竞争**：无论走哪条配置路径，只要 `IsConnected` 被多个 goroutine 并发调用且无同步保护，就是 Go 数据竞争。严重度：高。
- **并发 TCP 风暴**：仅在废弃路径 `disable-monitoring-lock: true` 下真实存在。普通路径被信号量限制在 3 个并发以内，不构成风暴。严重度：中（仅影响废弃路径用户，且即将随 v6.0.0 移除）。

### 1.4 建议修复方向

- 用 `sync.Mutex` + "双检锁"模式，或使用 `sync/atomic.Value` 缓存上次结果与过期时间，让只有一个 goroutine 实际执行 `Check()`。
- 更简洁的做法是使用 `singleflight.Group`：在一次 `Interval` 内所有并发调用共享一个 `Check()` 结果。
- 将 `c.Check()` 放到独立 goroutine 中按 `Interval` 周期驱动（类似一个后台 ticker），`IsConnected()` 只原子读 `c.isConnected`，完全避免调用路径上的竞争。

---

## 2. `Concurrency=0` 时 `UnlimitedConcurrencyWeight=10000` 作为"近似无上限"的风险

### 2.1 关键前置：`ValidateAndSetConcurrencyDefaults` 的归一化逻辑

在讨论 `watchdog.go` 中的信号量之前，必须先看 `config.go` 中 `ValidateAndSetConcurrencyDefaults` 的归一化逻辑，它在 `Monitor` 被调用 **之前** 执行（[config.go#L341](file:///e:/solo-code-2/gatus/config/config.go#L341)）：

```go
func ValidateAndSetConcurrencyDefaults(config *Config) {
    if config.DisableMonitoringLock {
        config.Concurrency = 0  // 路径 A：deprecated 标志
    } else if config.Concurrency <= 0 && !config.DisableMonitoringLock {
        config.Concurrency = DefaultConcurrency  // = 3，路径 B
    }
}
```

- `DefaultConcurrency` 在 [config.go#L45](file:///e:/solo-code-2/gatus/config/config.go#L45) 定义为 `3`。
- `DisableMonitoringLock` 是已废弃字段，将在 v6.0.0 中移除（[config.go#L79-L80](file:///e:/solo-code-2/gatus/config/config.go#L79-L80)）。

**这意味着：用户在 YAML 中显式写 `concurrency: 0` 时，在进入 `Monitor` 之前会被归一化为 `3`。`Concurrency=0` 到达 `Monitor` 的唯一路径是 `disable-monitoring-lock: true`。**

`Concurrency` 字段注释（[config.go#L83](file:///e:/solo-code-2/gatus/config/config.go#L83)）声称"Set to 0 for unlimited concurrency"，但这与实际行为矛盾——这是一个**文档与实现不一致的 bug**。

### 2.2 代码现状（`Monitor` 内部）

[watchdog.go#L11-L15](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L11-L15)：

```go
const UnlimitedConcurrencyWeight = 10000
```

[watchdog.go#L27-L36](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L27-L36)：

```go
if cfg.Concurrency == 0 {
    monitoringSemaphore = semaphore.NewWeighted(UnlimitedConcurrencyWeight)  // 只有路径 A 走到这里
} else {
    monitoringSemaphore = semaphore.NewWeighted(int64(cfg.Concurrency))        // 路径 B 走这里，值为 3
}
```

使用方在 [endpoint.go#L37](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L37)：

```go
if err := monitoringSemaphore.Acquire(ctx, 1); err != nil {
    return
}
defer monitoringSemaphore.Release(1)
```

此处 `ctx` 是包级变量，由 `Monitor` 中 `context.WithCancel(context.Background())` 得到，**只有在 `Shutdown` 时才会被取消**。

### 2.3 两条配置路径与阻塞行为

| 配置方式 | 归一化后 `Concurrency` | 信号量上限 | 第几个 goroutine 开始阻塞 |
|---|---|---|---|
| `concurrency: 0`（普通路径） | 被改成 `3` | 3 | 第 4 个 |
| `concurrency: 5` | 保持 `5` | 5 | 第 6 个 |
| `disable-monitoring-lock: true`（deprecated） | 保持 `0` | 10000 | 第 10001 个 |
| 未配置 | 被改成 `3` | 3 | 第 4 个 |

**对第 10001 个 goroutine 阻塞结论的影响**：

- 原问题假设"正常 `concurrency=0` 会走到 10000 上限"——这是**错误的**。正常路径下 `concurrency=0` 会被改写为 `3`，第 4 个 goroutine 就会阻塞，远在第 10001 个之前。
- 第 10001 个 goroutine 阻塞只发生在废弃路径 `disable-monitoring-lock: true` 上。对于仍在使用该废弃字段的用户，风险依然存在：`semaphore.Weighted` 会按 FIFO 排队，排队延迟超过 Endpoint 的 Interval 时，`time.Ticker` 丢 tick 导致监控执行次数隐性下降。
- 但由于废弃路径即将在 v6.0.0 中移除，这个 10000 上限的实际影响面会随版本升级而消失。

### 2.4 真正需要关注的问题

1. **文档与实现不一致**：`Concurrency` 字段注释写"Set to 0 for unlimited concurrency"，但实际被归一化为 `3`。用户按文档配置 `concurrency: 0` 期待"无限制"，实际得到并发度 `3`，与预期严重不符。
2. **缺乏真正的"无限制"选项**：v6.0.0 移除 `disable-monitoring-lock` 后，将**没有任何方式**获得真正的无限制并发（甚至 10000 的近似上限也无从获得）。用户若需要高并发只能设置一个显式的大数字（如 `concurrency: 100000`），但这又引入了"需要猜多大才够"的问题。
3. **覆盖率退化**：无论并发度是 `3` 还是 `10000`，当 Endpoint 总数超过并发度时，排队延迟仍会导致 `time.Ticker` 丢 tick，只是触发阈值不同（`3` 路径在第 4 个 Endpoint 就开始，`10000` 路径在第 10001 个才开始）。

### 2.5 结论

- 正常 `concurrency=0` **不会**把 `0` 送进 `semaphore.NewWeighted`——它先被归一化为 `3`。
- `0` 送进 `semaphore.NewWeighted` 的唯一路径是 `disable-monitoring-lock: true`（deprecated）。
- "第 10001 个 goroutine 阻塞"的结论仅适用于废弃路径；对正常路径用户，第 4 个 goroutine 就会阻塞，影响更大、更早。
- 建议：
  - 修复 `ValidateAndSetConcurrencyDefaults`：当用户**显式**配置 `concurrency: 0` 时应尊重其意图，不做归一化；仅在**未配置**（零值）时才设为 `DefaultConcurrency`。
  - 或将 `Concurrency` 改为指针类型 `*int`，区分"未设置"与"显式设为 0"。
  - 为被 ticker 丢弃的周期增加 metrics，方便运维观察监控覆盖率。

---

## 3. `IsConnected` 作为"全局总闸门"的语义混淆

### 3.1 代码现状

[endpoint.go#L44-L47](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L44-L47)：

```go
if cfg.Connectivity != nil && cfg.Connectivity.Checker != nil && !cfg.Connectivity.Checker.IsConnected() {
    logr.Infof("[watchdog.executeEndpoint] No connectivity; skipping execution")
    return
}
```

同样的判断也出现在 `external_endpoint.go`、`suite.go` 中。

`Checker` 的目标是公网 DNS（如 `1.1.1.1:53`），用于判断"Gatus 能否访问互联网"。

### 3.2 "公网可达性"与"目标可达性"的混淆

- 当 Endpoint 的 URL 指向 **本地回环**（`127.0.0.1`）或 **内网地址**（`10.x.x.x`、`192.168.x.x`），其可达性与公网 DNS 是否可达完全无关。
- 但当前逻辑下，一旦公网 DNS 短暂不可达（运营商抖动、Cloudflare 出问题、公司出网策略变化等），所有这些内网端点的健康检查会被跳过：
  - `store.Get().InsertEndpointResult` 不会写入新结果；
  - 前端 UI 上的"上次检查时间"会停止更新；
  - 告警逻辑基于历史结果，可能因结果"老化"而错误触发或错误抑制。

这构成了"大面积误报"的真实风险：运维可能观察到"所有 Endpoint 同时 HEALTHY 但不动"或"全部转 UNHEALTHY"，排障方向会被误导到业务层，而实际原因是公网 DNS 抖动。

### 3.3 建议

- 将"公网连通性"从"是否执行端点检查"的总闸门改为：
  1. 仅在 Endpoint 的 URL 指向公网时作为抑制告警的条件；或
  2. 作为一个独立的 metric 与日志事件暴露，让运维自行关联，而不改变端点检查流程。
- 更进一步，可以在 Endpoint 级别加一个开关，例如 `ignore-connectivity-check: true`，让回环/内网端点显式地跳过 `IsConnected` 总闸门。
- `IsConnected` 返回 false 时仍应执行端点检查，但在结果中标记 `ConnectivityLoss`，以便告警侧决定是否抑制。

---

## 总结

| 编号 | 问题 | 结论 | 严重度 |
| --- | --- | --- | --- |
| 1a | `IsConnected` 的并发读写构成 Go 数据竞争 | 无论走哪条配置路径，只要多个 goroutine 并发调用且无同步保护，就是数据竞争。`-race` 必报。 | 高 |
| 1b | 并发 TCP 风暴 | 仅在废弃路径 `disable-monitoring-lock: true` 下真实存在（信号量 10000）。普通路径被信号量限制在 3 个并发以内。 | 中（仅废弃路径） |
| 2 | `concurrency: 0` 被静默改写为 3 | 文档与实现不一致；正常用户期待"无限制"实际得到"3"；v6.0.0 后将无任何方式获得无限制并发。 | 中 |
| 3 | 全局连通性作为所有端点检查的总闸门 | 公网 DNS 抖动会导致内网端点检查被跳过，构成大面积误报风险 | 高 |

建议修复优先级：**3 → 1a → 2 → 1b**。问题 3 影响所有使用连通性检测的用户，问题 1a 影响所有开启竞争检测的 CI，问题 2 影响所有按文档配置 `concurrency: 0` 的用户，问题 1b 仅影响废弃路径用户。
