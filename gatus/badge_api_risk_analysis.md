# Badge API 与 Uptime/Metrics 风险分析

本文针对 Gatus 架构中三个与 Badge / Uptime / Metrics 相关的潜在风险点进行代码层面的溯源分析，并给出结论与可落地的缓解方案。

## 1. UptimeBadge 缺乏写穿透缓存，是否会引起数据库连接耗尽？

### 代码溯源

- UptimeBadge 位于 [badge.go](file:///e:/solo-code-2/gatus/api/badge.go#L42-L74)，通过路径 `:duration` 控制窗口（`30d`/`7d`/`24h`/`1h`），直接调用：
  ```go
  uptime, err := store.Get().GetUptimeByKey(key, from, time.Now())
  ```
- 该 Handler 返回响应前显式设置了：
  ```go
  c.Set("Cache-Control", "no-cache, no-store, must-revalidate")
  c.Set("Expires", "0")
  ```
  浏览器和 CDN 缓存被彻底禁用，每次加载均会穿透到服务端。

- `GetUptimeByKey` 在 SQL 存储实现位于 [sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L164-L186)，内部执行流程：
  1. `s.db.Begin()` 开启事务；
  2. `getEndpointIDGroupAndNameByKey` 查询 `endpoints` 表拿到 `endpoint_id`；
  3. `getEndpointUptime` 对 `endpoint_uptimes` 执行带 `SUM(total_executions), SUM(successful_executions), SUM(total_response_time)` 的聚合 SQL（[sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L856-L881)）；
  4. 事务提交后返回。

- 相比之下，`GetEndpointStatusByKey` 在相同文件的 [sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L711-L740) 中使用 `writeThroughCache`（`github.com/TwiN/gocache/v2`）做写穿透缓存。但 `GetUptimeByKey` / `getEndpointUptime` **完全没有读取缓存的逻辑**，也没有像 `GetEndpointStatusByKey` 那样在 `InsertEndpointResult` 后刷新缓存（参见 [sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L364-L376)，该逻辑只会 invalidate + 刷新 `ep.Key()+"*"` 模式的缓存，不包含 uptime 查询）。

- SQLite 驱动下在 [sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L95) 显式设置了 `db.SetMaxOpenConns(1)`，意味着**所有并发请求会串行排队在单连接上**，聚合查询一旦变慢（例如 `30d` 窗口未 merge 前仍保留大量 hourly 记录），直接表现为连接被长时间占用。Postgres 场景下虽然 `MaxOpenConns` 由 lib/pq 默认值控制，但高并发仍可能耗尽连接池。

### 结论

- ✅ **风险客观存在**：当大量请求并发访问不同 `key` + 不同 `duration` 的 UptimeBadge 时，SQL 聚合查询每次直接打到 DB，缺乏任何结果级缓存；SQLite 的单连接会被长耗时聚合查询完全占满；Postgres 则会快速耗尽 `MaxOpenConns`。
- ❗ 更严重的是 `ResponseTimeBadge`、`ResponseTimeChart`、`UptimeRaw` 等其他 Badge/Raw/Chart 端点同样调用 `GetUptimeByKey` / `GetAverageResponseTimeByKey` / `GetHourlyAverageResponseTimeByKey`，共用相同模式，风险会被成倍放大。

### 建议

1. 在 `sql.Store` 中新增 `uptimeCache`（如 `map[string]uptimeEntry` + RWMutex），key = `endpointID + fromUnix + toUnix`，TTL 设为 1 分钟；`getEndpointUptime` 读前先查缓存。
2. 在路由层增加服务器侧的 HTTP 缓存（例如 fiber 的 `fiber-cache` 中间件），key 由 `path + key + duration` 组成，TTL 30~60 秒即可显著降低压力。
3. 对 SVG / shields 响应增加 `ETag`/`Last-Modified`，允许客户端通过 `304 Not Modified` 复用资源，避免每次都全量返回。

---

## 2. Endpoint 刚上线时恶意 30d 窗口是否会触发除零 panic？

### 代码溯源

`getEndpointUptime` 位于 [sql.go](file:///e:/solo-code-2/gatus/storage/store/sql/sql.go#L856-L881)：

```go
rows, err := tx.Query(`
    SELECT SUM(total_executions), SUM(successful_executions), SUM(total_response_time)
    FROM endpoint_uptimes
    WHERE endpoint_id = $1
      AND hour_unix_timestamp >= $2
      AND hour_unix_timestamp <= $3
`, endpointID, from.Unix(), to.Unix())
if err != nil {
    return 0, 0, err
}
var totalExecutions, totalSuccessfulExecutions, totalResponseTime int
for rows.Next() {
    _ = rows.Scan(&totalExecutions, &totalSuccessfulExecutions, &totalResponseTime)
}
if totalExecutions > 0 {
    uptime = float64(totalSuccessfulExecutions) / float64(totalExecutions)
    avgResponseTime = time.Duration(float64(totalResponseTime)/float64(totalExecutions)) * time.Millisecond
}
return
```

关键点：
- `SUM(...)` 在**无匹配行**时返回 **一行全 NULL**，而不是 0 行。因此 `rows.Next()` 一定返回 `true` 一次。
- `rows.Scan` 把 `NULL` 写入 `int` 变量时，Go 会把目标变量保持在零值（`totalExecutions == 0`）。
- 只有在 `totalExecutions > 0` 时才执行除法，`== 0` 时直接返回 `uptime=0`，**不存在除零风险**。

对 memory 存储的 [memory.go](file:///e:/solo-code-2/gatus/storage/store/memory/memory.go#L105-L134) 做同样检查：

```go
if totalExecutions == 0 {
    return 0, nil
}
return float64(successfulExecutions) / float64(totalExecutions), nil
```

同样在除之前有显式判断。

### 结论

- ✅ **不会发生除零 panic**：SQL 路径通过 `if totalExecutions > 0` 守卫，memory 路径通过 `if totalExecutions == 0 { return 0 }` 守卫。Endpoint 刚上线 1 天内用 `30d` 窗口调用只会得到 `uptime=0`，`generateUptimeBadgeSVG` 最终渲染为 `0%` 的红色 Badge，是**业务语义上的误导**而非程序崩溃。

### 业务风险提示

- 虽然不会 panic，但“新上线的 Endpoint 被渲染为 0% Uptime”的行为会给运维和告警接收者造成严重误判；同时若用户把 SVG 直接嵌入 README，首次部署的 30 天里 Badge 一直是红色，不符合预期。
- 建议在 `generateUptimeBadgeSVG` 中把 `uptime==0` 的场景单独渲染为 `unknown` 或灰底，或在 `UptimeBadge` Handler 里查询 Endpoint 首次有数据的时间点，对窗口过短的情况返回 422 或走默认 `1h` 窗口。

---

## 3. PublishMetricsForEndpoint 全量推送会否导致 Prometheus 基数爆炸？

### 代码溯源

- `InitializePrometheusMetrics` 位于 [metrics.go](file:///e:/solo-code-2/gatus/metrics/metrics.go#L77-L164)，注册了如下 `CounterVec`/`GaugeVec`：
  - `gatus_results_total` labels: `key, group, name, type, success` + `extraLabels`
  - `gatus_results_duration_seconds` labels: `key, group, name, type` + `extraLabels`
  - `gatus_results_connected_total` labels: `key, group, name, type` + `extraLabels`
  - `gatus_results_code_total` labels: `key, group, name, type, code` + `extraLabels`  ← 高风险，`code` 是可变维度
  - `gatus_results_certificate_expiration_seconds` labels: `key, group, name, type` + `extraLabels`
  - `gatus_results_domain_expiration_seconds` labels: `key, group, name, type` + `extraLabels`
  - `gatus_results_endpoint_success` labels: `key, group, name, type` + `extraLabels`
  - 还有三组 suite 指标。

- `PublishMetricsForEndpoint` 位于 [metrics.go](file:///e:/solo-code-2/gatus/metrics/metrics.go#L166-L200)，对**每一次 Endpoint 执行结果**无条件调用 `WithLabelValues(...).Inc()` / `Set(...)`。没有白名单/限流/采样逻辑。

- External Endpoint 的写入入口在 [external_endpoint.go](file:///e:/solo-code-2/gatus/api/external_endpoint.go#L18-L91)，只要 `Authorization: Bearer <token>` 匹配即可：
  ```go
  if cfg.Metrics {
      metrics.PublishMetricsForEndpoint(convertedEndpoint, result, extraLabels)
  }
  ```
  注意：`cfg.Metrics` 是全局总开关，一旦开启，**所有 ExternalEndpoints 的心跳/写入都会被全量上推到 Prometheus**，没有任何 key 级别的过滤。

### 风险推导

- 假设管理员配置了 N 个 ExternalEndpoints，每个的 `Heartbeat.Interval` 为 30s，单个端点每天会产生 `2880` 次 `PublishMetricsForEndpoint` 调用；乘以 7 个 Counter/Gauge，每个调用可能因 `code` 不同产生新时间线。
- `gatus_results_code_total` 的 `code` label 同时承载 HTTP 状态码与 DNS RCODE：
  - HTTP 状态码理论上可达 600 个离散值；
  - DNS RCODE 有 16 种；
  - 两者叠加为 `key × code` 组合，当 ExternalEndpoints 数量上千时，单指标时间线数量即可突破 10^5。
- Prometheus 的基数爆炸表现：TSDB 内存占用急剧上升、WAL 写放大、查询缓慢直至 OOM。Gatus 本身不限制每个 endpoint 的 label 取值范围，也没有 `metricRelabelings` 层面的丢弃策略。
- `extraLabels` 通过 `cfg.GetUniqueExtraMetricLabels()` 注入，这些标签来自每个 `Endpoint.ExtraLabels`。如果配置中使用了高基数的 `extraLabels`（如 `pod_name`、`request_id` 等），会进一步放大基数。

### 结论

- ✅ **基数爆炸是真实存在的风险**：
  - `PublishMetricsForEndpoint` 对每次结果无差别推送；
  - `code` label 取值无界；
  - ExternalEndpoint 只要 token 匹配即可写入，外部高频推流会快速积累大量时间线；
  - 无任何 key 级别开关、采样或丢弃策略。

### 建议

1. 在 `ExternalEndpoint` 配置结构中增加 `Metrics bool` 字段，默认 `false`，仅对显式开启的 ExternalEndpoint 推送 Prometheus 指标。
2. 对 `gatus_results_code_total` 进行 label 收敛：
   - HTTP 状态码按段聚合（`2xx`/`3xx`/`4xx`/`5xx`/`other`）；
   - DNS RCODE 仅保留常见的 5~6 种，其余归为 `OTHER`。
3. 在 Prometheus 侧为 Gatus 配置 `relabel_configs` / `metric_relabel_configs`，对 `code` 做 `labelmap` 归一化，对 `key` 做白名单过滤。
4. 给 `extraLabels` 加配置校验，禁止使用高基数字段；同时在 `InitializePrometheusMetrics` 中对 `extraLabels` 总数设上限（如最多 5 个）。
5. 对 `/metrics` 输出做采集限流（如使用 Prometheus 的 `scrape_timeout` + 服务端的采样计数器），避免大 scrape 占用过多 CPU。

---

## 小结

| 编号 | 风险点 | 是否真实存在 | 严重级别 | 关键文件 |
| --- | --- | --- | --- | --- |
| 1 | UptimeBadge 聚合查询无缓存，SQLite 单连接会被占满 | ✅ 是 | 高 | `api/badge.go`, `storage/store/sql/sql.go` |
| 2 | 无数据窗口下 `SUM` 除零 panic | ❌ 否（有 `totalExecutions > 0` 守卫） | 低 | `storage/store/sql/sql.go#L856-L881` |
| 3 | `PublishMetricsForEndpoint` 全量推送 + `code` 无界 label 导致基数爆炸 | ✅ 是 | 高 | `metrics/metrics.go`, `api/external_endpoint.go` |

建议优先处理 1 和 3：1 可通过本地进程内缓存（TTL 30s）快速止血，3 则需要从配置层到 `code` label 收敛的多层改造。
