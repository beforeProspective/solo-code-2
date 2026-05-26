# Prometheus 指标暴露行为分析

本文档围绕 `ProcessSpeedtestDataIntegrations`、`MetricsController`、`PrometheusMetricsService`、`PrometheusAllowedIpMiddleware` 的协作，回答三个关键问题。

涉及文件：

- 事件监听器：[ProcessSpeedtestDataIntegrations.php](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/ProcessSpeedtestDataIntegrations.php)
- 路由入口：[web.php](file:///e:/solo-code-2/speedtest-tracker/routes/web.php#L23-L25)
- 控制器：[MetricsController.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/MetricsController.php)
- 中间件：[PrometheusAllowedIpMiddleware.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/PrometheusAllowedIpMiddleware.php)
- 指标服务：[PrometheusMetricsService.php](file:///e:/solo-code-2/speedtest-tracker/app/Services/PrometheusMetricsService.php)
- 设置模型：[DataIntegrationSettings.php](file:///e:/solo-code-2/speedtest-tracker/app/Settings/DataIntegrationSettings.php)
- 状态枚举：[ResultStatus.php](file:///e:/solo-code-2/speedtest-tracker/app/Enums/ResultStatus.php)

---

## 整体数据流向

```
SpeedtestCompleted / SpeedtestFailed 事件
   └─> ProcessSpeedtestDataIntegrations::handle
        ├─> 若 prometheus_enabled=true
        │     Cache::forever('prometheus:latest_result', $result->id)
        │
        GET /prometheus
        └─> PrometheusAllowedIpMiddleware
                (校验 IP 白名单)
                └─> MetricsController::__invoke
                      (若 prometheus_enabled=false → 404)
                      └─> PrometheusMetricsService::generateMetrics
                           ├─ 读 Cache::get('prometheus:latest_result')
                           ├─ Result::find($resultId)
                           └─ registerMetrics (仅 Completed 结果写数值指标)
```

关键点：`prometheus:latest_result` 的写入由监听器完成，读取由指标服务完成；**写入发生在事件发生的当下**，读取发生在外部抓取 `/prometheus` 的时刻，两者之间存在时间差。

---

## 1. 最近一次测速是失败结果时，Prometheus 会看到什么指标？

### 结论

当最近一次测速结果是 `ResultStatus::Failed`（或 `Running`/`Started`/`Waiting`/`Skipped` 等非 `Completed` 状态）时，Prometheus 抓取 `/prometheus` 会拿到**一个 info 指标加上一组仅包含 status/healthy/scheduled/app_name 等标签的空数值族**——也就是说，**只有 `speedtest_tracker_result_id` 一个 gauge 会真正出现在响应里**，其余 `download_bytes`、`upload_bytes`、`ping_ms` 等数值指标**不会被注册到 CollectorRegistry，因此不会出现在渲染文本中**。

更具体地说，响应体会是类似这样的文本：

```
# HELP speedtest_tracker_result_id Speedtest result id
# TYPE speedtest_tracker_result_id gauge
speedtest_tracker_result_id{server_id="...",server_name="...",server_country="...",server_location="...",isp="...",scheduled="true",healthy="false",status="failed",app_name="Speedtest Tracker"} 12345
```

数值指标（download、upload、ping、jitter、packet_loss、latency、bytes_transferred、elapsed 等）**整段消失**。

### 为什么 info 指标仍然有意义

在 [PrometheusMetricsService::registerMetrics](file:///e:/solo-code-2/speedtest-tracker/app/Services/PrometheusMetricsService.php#L42-L137) 中，代码的顺序是：

```php
// 1. 无论状态如何，先注册 info 指标
$infoGauge = $registry->getOrRegisterGauge(
    'speedtest_tracker', 'result_id',
    'Speedtest result id',
    $labelNames
);
$infoGauge->set($result->id, $labelValues);

// 2. 非 Completed 直接返回，数值指标全部跳过
if ($result->status !== ResultStatus::Completed) {
    return;
}
// ... 下面的 download/upload/ping 等都不会被执行
```

这里的 `infoGauge->set($result->id, $labelValues)` 承载了两类信息：

1. **结果 ID 本身**：`speedtest_tracker_result_id{...} 12345` 告诉外部抓取器"最近一次测速的结果 ID 是 12345"。如果多次抓取看到这个值**变化**，说明有新的测速发生；如果保持不变，说明系统仍然记住了上一次的结果。
2. **标签集里的状态字段**：`status="failed"`、`healthy="false"`、`scheduled="true"`、`app_name="..."` 这些标签让抓取器能够：
   - 通过 `status="failed"` 判断"最近一次测速失败了"，从而触发告警或在 Grafana 里渲染红色状态。
   - 通过 `healthy="false"` 知道"系统判定这个结果不健康"。
   - 通过 `scheduled="true"/"false"` 区分是定时任务还是手动触发。
   - 通过 `app_name` 在多实例部署时做标签聚合。

这就是为什么注释里写了 *"Info metric - always exported so users can see test status (including failures)"*：**info 指标的价值在于"状态表达"，而不是"数值测量"**。失败的测速没有可信的 download/upload/ping 数值，但它仍然传递了"系统处于失败状态"这样一个重要信号，而这个信号靠标签就能表达，不需要数值。

### 为什么数值指标会被跳过

失败/未完成的测速的 `download`、`upload`、`ping` 等字段要么是 `null`，要么是一个不可靠的中间值（比如 `Running` 状态下的部分填充值）。如果不加判别就把这些值导出：

- `null` 会被 gauge 当成 0（Prometheus PHP Client 的 `Gauge::set` 对 null 的处理行为不稳定），从而**伪造一个"网速为 0"的假象**，在监控面板上产生巨大的误报。
- 中间值（如 running、started）会导致图表出现尖刺，后续恢复正常时又会跳变，污染时序数据。

所以在 [registerMetrics 的第 59-61 行](file:///e:/solo-code-2/speedtest-tracker/app/Services/PrometheusMetricsService.php#L59-L61)明确对非 `Completed` 状态短路返回，**只暴露 status 标签，不暴露数值**。这是一个有意的设计选择。

---

## 2. 缓存里有 result_id 但数据库记录已被删除，服务会返回什么？

### 结论

服务会返回一个 **200 OK + `# no data available\n` 的纯文本响应**，也就是 [PrometheusMetricsService::emptyMetrics](file:///e:/solo-code-2/speedtest-tracker/app/Services/PrometheusMetricsService.php#L154-L157) 的输出。

### 推导过程

在 [generateMetrics](file:///e:/solo-code-2/speedtest-tracker/app/Services/PrometheusMetricsService.php#L19-L40) 中：

```php
$resultId = Cache::get('prometheus:latest_result');  // 假设能取到 ID

if (! $resultId) {
    return $this->emptyMetrics();
}

$lastResult = Result::find($resultId);  // 数据库里这条记录被删了 → null

if (! $lastResult) {
    return $this->emptyMetrics();        // ← 走到这里
}
```

注意：

- `Cache::forever(...)` 把 ID **永久地** 写进缓存（[ProcessSpeedtestDataIntegrations::handle#L29-L31](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/ProcessSpeedtestDataIntegrations.php#L29-L31)），缓存不会自动过期。
- 如果外部（用户、清理任务、数据库维护）删除了 `results` 表中对应的那条记录，`Result::find($resultId)` 会返回 `null`。
- 于是 `! $lastResult` 为真，走 `emptyMetrics()` 分支，返回 `# no data available\n`。

对 Prometheus 抓取器来说：

- **HTTP 状态码仍然是 200**（因为控制器里调用 `generateMetrics()` 后直接 `response($metrics, 200, ...)` 返回，没有抛异常）。
- **响应体不再包含任何 `# HELP` / `# TYPE` / 指标样本**，只有一行注释 `# no data available`。
- 抓取器不会把这次抓取记为失败（`up` 仍然是 `1`），但**所有 gauge 的样本都会"消失"**——在 Prometheus 时间序列里表现为"从此刻起不再有新的样本点"，旧数据继续保留。

### 和"每次抓取时现查最新结果"相比的稳定性差异

对比两种实现思路：

| 维度 | 现算最新结果（每次查询 `ORDER BY created_at DESC LIMIT 1`） | 缓存 ID + 查表（当前实现） |
| --- | --- | --- |
| 数据库压力 | 每次抓取都要跑一次排序查询，抓取频率高时会给数据库带来负担 | 只有第一次（或缓存失效后）查表，后续走缓存 |
| "无数据"时的行为 | 若 `results` 表空则返回空文档；若有任何一行都能返回指标 | 若缓存 ID 对应的记录被删，返回空文档 |
| "最新结果被删"时 | 自动回退到"次新的那条"，**数值/状态依然可用** | 返回空文档，**所有指标同时消失** |
| 抓取间隔内结果变化 | 始终反映数据库最新状态 | 依赖缓存写入事件，**删除操作不会同步到缓存** |
| 出现"假阴性"的概率 | 低（除非表被清空） | 高（只要那条被缓存的 ID 对应的记录被删就会立刻空文档） |

换句话说：

- **现算最新结果更鲁棒**，因为它对"单条记录被删"具有天然的容错能力——下一条结果还能顶上。
- **缓存 ID 方案更省资源**，但在"缓存 ID 指向的那条记录被外部删除"这种极端场景下，会让 `/prometheus` 看起来"突然没有数据"——直到下一次 `SpeedtestCompleted` / `SpeedtestFailed` 事件触发，监听器用新 ID 覆盖缓存，才能恢复正常。

这是一个典型的"**性能 vs. 容错**"权衡。当前实现选择了性能，但代价是对"结果被删"的事件不敏感。如果产品层面希望在这种情况下依然能返回次新结果，可以考虑在 `! $lastResult` 分支里再回退到一次 `ORDER BY created_at DESC LIMIT 1` 查询，或者在删除 `Result` 时同步清理/更新 `prometheus:latest_result` 缓存。

---

## 3. `prometheus_enabled` 与 `prometheus_allowed_ips` 分别管哪一层？只关其中一个会发生什么？

### 两个开关所在的层级

| 开关 | 所在层级 | 生效位置 | 控制的对象 |
| --- | --- | --- | --- |
| `prometheus_enabled` | **功能存在性层（Feature Flag）** | [MetricsController::__invoke](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/MetricsController.php#L16-L27) | `/prometheus` 这个端点**对外是否"存在"**；为 `false` 时控制器 `abort(404)`，等同把功能下线。 |
| `prometheus_allowed_ips` | **访问控制层（ACL）** | [PrometheusAllowedIpMiddleware::handle](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/PrometheusAllowedIpMiddleware.php#L22-L42) | **哪些客户端 IP** 允许进入控制器逻辑；为空时放行所有请求，非空时按白名单匹配，未命中则 `abort(403)`。 |

注意 Laravel 中间件的执行顺序：**中间件在前，控制器在后**（见 [web.php#L23-L25](file:///e:/solo-code-2/speedtest-tracker/routes/web.php#L23-L25)），所以两个开关的判定顺序是：先看 `prometheus_allowed_ips`，通过后再看 `prometheus_enabled`。

### 只关其中一个的表现

下面列四种组合在外部抓取端视角下的 HTTP 状态码和响应内容：

| 场景 | `prometheus_enabled` | `prometheus_allowed_ips` | 白名单内 IP 看到 | 白名单外 IP 看到 | 业务语义 |
| --- | --- | --- | --- | --- | --- |
| 全部开启 | true | 非空 | **200** + 指标文本 (`text/plain`) | **403** Forbidden（Laravel 默认 403 页） | 功能开启，仅白名单内可访问 |
| 全部开启 | true | 空/blank | **200** + 指标文本 | **200** + 指标文本 | 功能开启，不限制来源 IP |
| **只关 `prometheus_enabled`** | **false** | 非空 | **404** Not Found | **403** Forbidden | 功能被下线，白名单内外看到的状态码不同（白名单外先被中间件拒） |
| **只关 `prometheus_enabled`** | **false** | 空/blank | **404** Not Found | **404** Not Found | 功能被下线，所有客户端一律 404 |
| **只关 `prometheus_allowed_ips`**（清空白名单） | true | 空/blank | **200** + 指标文本 | **200** + 指标文本 | 功能开启，但等于完全放开 IP 限制，任何可达客户端都能抓指标 |

### 逐项解读

1. **只关 `prometheus_enabled`（`false`，白名单非空）**
   - 白名单内的 IP：中间件放行 → 控制器里 `abort(404)` → 看到 **404 Not Found**。从 Prometheus 抓取器视角：目标"不存在"，抓取失败，`up=0`。
   - 白名单外的 IP：中间件里 `abort(403)` → 看到 **403 Forbidden**。从 Prometheus 抓取器视角：目标"存在但无权"，同样抓取失败，`up=0`。
   - 含义：**整个指标功能对外下线**。只是白名单内外的拒绝方式不同——这也是一个小的"侧信道"信号：如果一个客户端从 404 变成 403（或者反过来），就能反推出"自己是否在白名单里"。

2. **只关 `prometheus_enabled`（`false`，白名单空）**
   - 所有 IP 一律 **404 Not Found**。因为中间件看到白名单为空直接放行，然后控制器统一返回 404。
   - 这是最干净的"隐藏"方式，外部无法通过状态码差异推断白名单存在与否。

3. **只关 `prometheus_allowed_ips`（即把白名单设为空数组）**
   - 中间件看到 `blank($allowedIps)` 直接 `return $next($request)`，**所有 IP 都放行**。
   - 只要 `prometheus_enabled=true`，控制器就会生成指标并返回 **200 + 指标文本**。
   - 含义：**功能仍然对外暴露，但失去了 IP 白名单这道防线**。任何能打到服务器的客户端（包括公网扫描器）都能抓到完整的指标数据（server_id、isp、server_name 等标签可能包含隐私/拓扑信息）。这在运维上是一个需要警惕的配置状态。

### 设计上需要注意的点

- **两层开关的语义不对等**：`prometheus_enabled=false` 会让"白名单配置"在白名单内客户端那里看起来形同虚设（拿到的仍是 404）；而"白名单清空"会让功能完全裸露。
- **排障建议**：当外部抓取器报告"抓不到"时，应先查 `prometheus_enabled`（决定是否有端点），再查 `prometheus_allowed_ips`（决定是否有权限），最后查缓存与数据库（决定是否有数据）。三者任意一环出现问题，抓取端都会看到非 200 或空文档。
