# Gatus Prometheus 指标生命周期与配置热重载风险分析

本文基于 Gatus 项目中 Prometheus 指标在 `start`/`stop` 函数以及 `listenToConfigurationFileChanges` 中的注册/注销行为，结合 Prometheus Go Client 的全局单例注册表特性，分析其在运行时 panic、时序基数膨胀、监控盲区三个方面的风险。

相关代码位置：

- 启动时注册：[start](file:///e:/solo-code-2/gatus/main.go#L51-L56)
- 停止时注销：[stop](file:///e:/solo-code-2/gatus/main.go#L58-L63)
- 配置变更热重载：[listenToConfigurationFileChanges](file:///e:/solo-code-2/gatus/main.go#L225-L252)
- 指标注册逻辑：[InitializePrometheusMetrics](file:///e:/solo-code-2/gatus/metrics/metrics.go#L77-L164)
- 指标注销逻辑：[UnregisterPrometheusMetrics](file:///e:/solo-code-2/gatus/metrics/metrics.go#L34-L75)

---

## 1. 热重载时并发访问与标签基数不匹配引发的运行时 Panic 风险

### 1.1 Prometheus 注册表的全局单例特性

Prometheus Go Client 中的 `prometheus.DefaultRegisterer` 是进程级单例，任何通过 `MustRegister` 注册的指标都会被永久记录到这个 `Registry` 中。同一进程内，`Registry` 不允许对"完全相同的描述符（Fully Qualified Name + ConstLabels + Help）"重复注册，一旦重复 `MustRegister` 会直接 `panic`。

在 Gatus 里，指标通过 `reg.MustRegister(xxx)` 进行注册（`metrics.go` 第 96、103、110 等行），并且 `InitializePrometheusMetrics` 会根据 `cfg.GetUniqueExtraMetricLabels()` 的结果动态拼接 `LabelNames`：

```go
extraLabels := cfg.GetUniqueExtraMetricLabels()
resultTotal = prometheus.NewCounterVec(prometheus.CounterOpts{...},
    append([]string{"key", "group", "name", "type", "success"}, extraLabels...))
reg.MustRegister(resultTotal)
```

### 1.2 UnregisterPrometheusMetrics 的行为真相

重新审视 [UnregisterPrometheusMetrics](file:///e:/solo-code-2/gatus/metrics/metrics.go#L34-L75) 的逐行逻辑：

```go
func UnregisterPrometheusMetrics() {
    if !metricsInitialized || currentRegisterer == nil {
        return
    }
    // 依次对每个 collector 调用 Unregister
    if resultTotal != nil {
        currentRegisterer.Unregister(resultTotal)  // 从注册表中移除
    }
    // ... 其余 9 个 collector 同理
    metricsInitialized = false
    currentRegisterer = nil
    // ⚠️ 注意：resultTotal / resultDurationSeconds 等包级变量
    //    始终没有被置为 nil！旧的 *CounterVec / *GaugeVec 指针仍然有效
}
```

**关键事实**：在正常无并发的热重载路径下，`UnregisterPrometheusMetrics` 确实能够把所有 collector 从 `DefaultRegisterer` 中成功移除——因为 `currentRegisterer.Unregister` 接收的正是 `resultTotal` 等包级变量中持有的 collector 引用。因此之前关于"旧指标残留导致 `MustRegister` 报 duplicate panic"的推断在**正常路径**下并不成立。`metrics_test.go` 中注释提到的 panic 风险指的是在测试环境中对同一 Registry 反复调用 `InitializePrometheusMetrics` 且传入不同 `extraLabels` 时的场景，而非热重载的正常路径。

### 1.3 真正的 Panic 路径：并发发布 + 标签基数不匹配

热重载时的真实 panic 风险并非源于旧指标残留，而是源于**旧监控 goroutine 与新注册 collector 之间的标签基数不匹配**。完整触发链路如下：

**步骤 1 — 旧 goroutine 持有旧 extraLabels 切片**

在 [watchdog.Monitor](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L27-L58) 中，`extraLabels` 在 goroutine 启动时被捕获：

```go
extraLabels := cfg.GetUniqueExtraMetricLabels()  // 旧配置的标签名，例如 ["foo"]
go monitorEndpoint(endpoint, cfg, extraLabels, ctx)
```

旧 goroutine 内的 [monitorEndpoint](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L15-L33) 持有这个 `extraLabels` 切片的引用，通过闭包传递给 `executeEndpoint` → `PublishMetricsForEndpoint`。

**步骤 2 — stop(cfg) 触发取消，但旧 goroutine 可能仍在执行**

[watchdog.Shutdown](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L62-L73) 只是调用 `cancelFunc()`，正在执行中的 `executeEndpoint`（尤其是正在进行的 `ep.EvaluateHealth()` 网络请求）不会被中断。它会在完成后跑完整个 `PublishMetricsForEndpoint` 调用链，然后在下一轮 select 中检测到 `ctx.Done()` 才退出。

**步骤 3 — InitializePrometheusMetrics 覆盖包级变量**

在 `time.Sleep(1s)` 之后，[start](file:///e:/solo-code-2/gatus/main.go#L51-L56) → `InitializePrometheusMetrics` 用新配置的 `extraLabels`（例如 `["foo", "hello"]`，多了一个标签）创建了新的 `*CounterVec`，并**覆盖**了包级变量 `resultTotal`：

```go
resultTotal = prometheus.NewCounterVec(...,  // 新实例，LabelNames = 5 + 2 = 7
    append([]string{"key", "group", "name", "type", "success"}, "foo", "hello"))
```

**步骤 4 — 旧 goroutine 调用 WithLabelValues 时参数数量不匹配**

此时仍在运行的旧 goroutine 持有旧 `extraLabels = ["foo"]`（1 个标签），调用：

```go
resultTotal.WithLabelValues(
    append([]string{ep.Key(), ep.Group, ep.Name, "HTTP", "true"},  // 5 个基础标签
           labelValues...)...)  // labelValues 来自旧 extraLabels，只有 1 个
// 总共传入 5 + 1 = 6 个值
```

但 `resultTotal` 已经指向**新的 CounterVec**，其 `LabelNames` 定义为 5 + 2 = **7 个**。Prometheus Go Client 的 `WithLabelValues` 实现会在参数数量不匹配时直接 panic：

```
panic: inconsistent label cardinality: expected 7 label values but got 6 in prometheus.CounterVec
```

**步骤 5 — 另一个加剧因素：PublishMetricsForEndpoint 缺少守卫**

对比 [PublishMetricsForEndpoint](file:///e:/solo-code-2/gatus/metrics/metrics.go#L168-L200) 与 [PublishMetricsForSuite](file:///e:/solo-code-2/gatus/metrics/metrics.go#L204-L232)：

```go
// PublishMetricsForEndpoint — 无守卫
func PublishMetricsForEndpoint(ep *endpoint.Endpoint, result *endpoint.Result, extraLabels []string) {
    var labelValues []string
    // ... 直接访问 resultTotal，没有 metricsInitialized 检查
    resultTotal.WithLabelValues(...).Inc()
}

// PublishMetricsForSuite — 有守卫
func PublishMetricsForSuite(s *suite.Suite, result *suite.Result, extraLabels []string) {
    if !metricsInitialized {   // ✅ 防止在未初始化时访问
        return
    }
    // ...
}
```

`PublishMetricsForEndpoint` 没有 `metricsInitialized` 守卫意味着即使在 `UnregisterPrometheusMetrics` 将 `metricsInitialized` 置为 false 之后、新 collector 尚未注册之前的时间窗口内，旧 goroutine 仍会继续尝试写指标。虽然此时 `resultTotal` 还指向旧 collector（不会崩溃），但等新 collector 注册后，标签基数不匹配的 panic 窗口就打开了。

### 1.4 MustRegister Duplicate Panic 的边界场景

虽然正常热重载路径下 `MustRegister` 不会报 duplicate，但以下边界场景仍可能触发：

1. **`SkipInvalidConfigUpdate = true` 分支的永久性指标缺失**：如果新配置加载失败，`stop(cfg)` 已执行但 `start(updatedConfig)` 不会被调用，指标已被 Unregister 却没有重新注册。如果此后配置文件再次修改并成功加载，`InitializePrometheusMetrics` 会再次创建 collector 并注册——此时因为旧 collector 已被成功 Unregister，不会触发 duplicate。但如果在 `stop` 和 `start` 之间有其他代码路径（如 health check handler、debug handler）独立注册了同名指标，就会冲突。

2. **外部 collector 注入**：任何通过 `prometheus.DefaultRegisterer.MustRegister(...)` 直接注册的同名自定义指标（不在 `UnregisterPrometheusMetrics` 的清理范围内），在热重载后会与新注册的 Gatus 指标冲突。

综上，热重载的主要 panic 风险是：

- **并发发布导致标签基数不匹配**：旧 goroutine 持有的 `extraLabels` 长度与新注册 collector 的 `LabelNames` 长度不一致，`WithLabelValues` 直接 panic；
- **`PublishMetricsForEndpoint` 缺少 `metricsInitialized` 守卫**：放大了并发窗口内的无效写入和标签错配概率；
- **边界场景下的 MustRegister 冲突**：外部自定义指标与热重载后的 Gatus 指标同名时触发。

---

## 2. 大量动态参数 Endpoint 监控对 Prometheus 基数的影响

### 2.1 指标定义中存在的高基数维度

查看 [PublishMetricsForEndpoint](file:///e:/solo-code-2/gatus/metrics/metrics.go#L166-L200)，每次监控结果发布时会为每个 endpoint 构造如下 Label 组合：

```go
resultTotal.WithLabelValues(
    append([]string{ep.Key(), ep.Group, ep.Name, string(endpointType),
                    strconv.FormatBool(result.Success)}, labelValues...)...).Inc()
```

其中：

- `key`：`group + "_" + name`，通常每个 Endpoint 唯一；
- `name`、`group`：与 key 强相关，对基数进一步放大；
- `type`：HTTP / DNS / TCP / ICMP 等，值集合小；
- `success`：true/false，2 个值；
- `code`（仅 `resultCodeTotal`）：包含所有出现过的 HTTP 状态码或 DNS RCode；
- `extraLabels`：来自 `Endpoint.ExtraLabels`，由用户自定义，**可包含任意动态参数（租户 ID、Region、客户名等）**。

### 2.2 时序基数的计算公式

Prometheus 的"时序基数"= 指标数 × 每个指标的 label 值笛卡尔积。在 Gatus 中：

- 对 `resultTotal`：基数 ≈ `E × 2`（E 为启用的 endpoint 数，`success` 两个分支），乘以 `extraLabels` 的笛卡尔积；
- 对 `resultCodeTotal`：基数 ≈ `E × C`（C 为出现过的状态码数量），乘以 `extraLabels` 笛卡尔积；
- 对 `resultDurationSeconds`、`resultConnectedTotal`、`resultEndpointSuccess`：基数 ≈ `E`，乘以 `extraLabels` 笛卡尔积；
- `suite_*` 指标同理按 suite 数量再放一份。

当存在如下配置：

```yaml
endpoints:
  - name: "check-tenant-${TENANT_ID}"
    url: "https://${TENANT_ID}.example.com/health"
    extraLabels:
      tenant_id: "${TENANT_ID}"
      region: "${REGION}"
      shard: "${SHARD}"
```

若按 1000 个 endpoint、3 个 extraLabel（假设 tenant×region×shard=10k 组合）、15 个常见 HTTP 状态码估算，仅 `resultCodeTotal` 一个指标就会产生 **1000 × 15 × 10000 = 1.5 亿** 条时序；配合 `resultTotal`（2 × 1000 × 10000 = 2000 万）等其他 7 个 endpoint 指标以及 3 个 suite 指标，**轻松突破数千万条时序**。

### 2.3 基数膨胀对 Prometheus 的影响

1. **内存爆炸**：Prometheus 为每条活跃时序维护一个 head 系列（包含 chunk、符号表、倒排索引等），每百万时序在现代节点上约占 5~15 GB 内存。数千万条时序会让 Prometheus 进程 OOM 或被 OOM-killer 杀掉。
2. **查询性能线性恶化**：PromQL 执行依赖倒排索引扫描，时序越多 `match` 阶段越慢；`rate()`、`histogram_quantile()`、`sum by (...)` 等聚合会呈现明显线性退化。
3. **远程写背压**：Remote Write 发送到 Thanos / VictoriaMetrics / Mimir 时，每条新时序都要在接收端创建新的流，形成写放大与追加 WAL 延迟。
4. **抓取超时**：`/metrics` 返回体大小与活跃时序数成正比，当 `/metrics` 页面超过几 MB 时，Prometheus 的 `scrape_timeout` 容易被触发，导致 "context deadline exceeded"，部分 endpoint 结果被丢弃。
5. **热重载时的时序残留**：热重载后旧的 endpoint 对应的时序在 Prometheus Server 端会作为 "stale series" 保留 5 分钟到 1 小时（`--storage.tsdb.retention.time` 控制，但标记 stale 的时间窗为 5 分钟），叠加新 endpoint 的时序，会形成"新旧交替期"的基数尖峰。

### 2.4 结论

只要 Endpoint 配置中包含 `extraLabels` 这类随租户 / 请求 / 动态参数变化的标签，Gatus 的 Prometheus 指标就会**把 Endpoint 的数量直接放大为 Prometheus 的时序基数**。当 Endpoint 数量大、参数取值多的时候，即使 `resultTotal` 这一种 CounterVec 也足以让 Prometheus 服务进入高基数告警状态。

---

## 3. 指标启停与配置热重载完全绑定导致的监控盲区

### 3.1 当前生命周期的时间线

在 `listenToConfigurationFileChanges` 的代码中，一次热重载的顺序是：

```
t0  检测到配置变更
t1  stop(cfg)                     // watchdog.Shutdown → cancelFunc()
                                 // controller.Shutdown
                                 // metrics.UnregisterPrometheusMetrics()
t2  time.Sleep(1s)                // 等待 1 秒
t3  loadConfiguration()           // 重新解析 YAML + Validate
t4  store.Get().Close()
t5  initializeStorage(updatedConfig)
t6  start(updatedConfig)          // controller.Handle
                                 // metrics.InitializePrometheusMetrics
                                 // watchdog.Monitor
```

关键点：**监控指标被"停止"（Unregister + Shutdown 取消）的时机 `t1`，与"重新启动"的时机 `t6` 之间存在不可忽略的时间差**。

### 3.2 配置加载失败时的盲区

在 `loadConfiguration()` 或 `initializeStorage()` 失败时，有两条分支：

- **分支 A：`SkipInvalidConfigUpdate = true`**
  ```go
  logr.Errorf("...")
  cfg.UpdateLastFileModTime()
  continue
  ```
  此时旧配置已经 `stop(cfg)`——Watchdog 已取消、指标已 Unregister，但**不会重新 `start`**，直接回到 30 秒轮询循环。从 `t1` 到下一次配置再次变更并成功加载的这一段时间（可能数小时甚至永久），Gatus 完全处于"既不监控，也不暴露指标"的状态，Prometheus `/metrics` 只暴露默认的 `go_*`、`process_*` 等基础指标，业务可用性指标彻底消失。

- **分支 B：`SkipInvalidConfigUpdate = false`**
  ```go
  panic(err)
  ```
  进程直接 panic，Prometheus `/metrics` 彻底不可用，所有 endpoint 指标出现断崖式断点。

### 3.3 盲区在监控链路上的具体表现

1. **Gatus 自身指标缺失**：`gatus_results_total`、`gatus_results_endpoint_success` 等在 `t1` 时刻被 Unregister，`/metrics` 不再包含它们，直到 `t6` 之后才重新出现。Prometheus 的 `up` 指标虽然会继续返回 1（因为 `/metrics` 端点仍存在），但 `gatus_results_endpoint_success` 会被当作 `stale`，在 Grafana 面板上出现"断图"。
2. **Watchdog 未运行**：由于 `cancelFunc()` 已执行，所有 `monitorEndpoint` goroutine 都已退出，**`t1 ~ t6` 期间没有任何探测发生**，真实的故障无法被捕获。这段时间即使某个 endpoint 挂了，Gatus 也不会记录到任何 `result`，下游的告警规则（例如 `gatus_results_endpoint_success == 0` 持续 5 分钟）会因数据缺失而误判为"无数据"而不是"故障"。
3. **重新注册后的 Counter 重置**：`resultTotal` 是 CounterVec，热重载后 `InitializePrometheusMetrics` 会重新创建一个新的 `*CounterVec`，从 0 开始。Prometheus 对 Counter 的 `rate()` / `increase()` 在遇到 reset 时会修正（基于 resets 检测），但在 `t1` 到 `t6` 之间的那段空窗期会导致 `increase()` 计算**丢失这段时间应有的增长量**，长期趋势图被拉低。
4. **配置加载失败回调的永久盲区**：如分支 A 所示，当新配置非法时 `start` 不再被调用，此时已停止的旧监控**永远不会被恢复**。只要运维人员不主动重启 Gatus，盲区持续到下一次文件修改且成功加载为止。

### 3.4 为什么是"监控生命周期与配置热重载绑定"造成的

根本原因是：把 Prometheus 指标的"注册/注销"、Watchdog 的"启停"与配置文件的"热重载"三件事强耦合在同一条调用链上。合理的设计应当是：

- 监控指标注册一次，在进程生命周期内常驻；
- 配置热重载只更新被监控对象列表（Endpoint / Suite），不做 Unregister + Re-register；
- 加载失败时保留旧配置继续监控，仅在后台记录错误日志，而不是把指标一起停掉。

当前实现下，任何一次配置文件的写入错误都会把"监控发布中断"和"业务探测中断"两个故障打包同时出现，使运维团队在真正需要依赖监控判断系统健康度的时候反而看不到任何数据。

---

## 小结

| 风险点 | 根因 | 影响 |
| ------ | ---- | ---- |
| 运行时 panic | 热重载时旧 goroutine 持有旧 `extraLabels` 切片，在新注册的 CounterVec 上以错误的参数数量调用 `WithLabelValues`，导致标签基数不匹配 panic；`PublishMetricsForEndpoint` 缺少 `metricsInitialized` 守卫加剧并发窗口 | 进程级崩溃，服务不可用 |
| 时序基数膨胀 | Endpoint 的 `extraLabels` + `key/group/name` 直接映射为时序标签，动态参数导致笛卡尔积爆炸 | Prometheus 内存、查询、抓取全面恶化 |
| 监控盲区 | `stop(cfg)` 与 `start(cfg)` 之间的时间差 + 加载失败分支不恢复旧配置 + `UnregisterPrometheusMetrics` 不置 nil 导致旧 collector 数据丢失 | `/metrics` 指标断图 + 探测中断 + Counter 重置 |
