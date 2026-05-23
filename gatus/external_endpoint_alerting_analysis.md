# ExternalEndpoint 与 Endpoint 告警机制差异及配置重载级联影响分析

本文基于 `watchdog/watchdog.go`、`watchdog/external_endpoint.go`、`watchdog/endpoint.go`、`api/external_endpoint.go`、`watchdog/alerting.go`、`main.go` 等源码对三个问题进行深入分析。

---

## 1. 仅依赖外部推送的 ExternalEndpoint 告警 vs 普通 Endpoint 告警

### 1.1 生命周期（Life Cycle）

| 维度 | Endpoint | ExternalEndpoint（仅推送，无 Heartbeat） |
|---|---|---|
| 驱动方式 | 内部主动轮询（`monitorEndpoint` goroutine + `time.Ticker`） | 外部 HTTP 推送到 `/api/v1/endpoints/:key/results` |
| 启动方式 | `watchdog.Monitor()` 统一为每个 Endpoint 启一条 goroutine | 不启动任何定时任务 |
| 执行节奏 | 由 `ep.Interval` 固定节拍；进程存活即恒在 | 完全无节拍；仅在外部系统触发推送时发生 |
| 对进程的依赖 | 强依赖 Gatus 自身存活 | 依赖外部系统 + Gatus HTTP 服务同时存活 |

普通 Endpoint 的告警生命周期由 `watchdog.endpoint.go` 中的 `monitorEndpoint` 函数驱动：它在一个持久 goroutine 中按 `ep.Interval` 循环执行 `executeEndpoint`，后者调用 `ep.EvaluateHealth()` → `UpdateEndpointStatus` → `HandleAlerting`。

仅依赖推送的 ExternalEndpoint 没有对应的 goroutine。它唯一的状态入口点是 `api.external_endpoint.go` 中的 `CreateExternalEndpointResult` 处理函数：收到一次 HTTP 推送，即构造 `Result`、写入存储、调用 `watchdog.HandleAlerting`，并在返回前把 `convertedEndpoint` 上的 `NumberOfSuccessesInARow` / `NumberOfFailuresInARow` 同步回 `externalEndpoint` 对象（L80–L82）。

关键差异：

- **Endpoint 的执行节奏由 Gatus 进程内部时钟决定**，外部网络波动或目标服务挂起都会被感知并直接产出失败 `Result`，从而进入失败计数与告警逻辑。
- **ExternalEndpoint 的执行节奏完全由外部系统决定**。如果外部系统停止推送（即使服务还活着），Gatus 端不会自发感知，只有配置了 `Heartbeat.Interval` 时，`monitorExternalEndpointHeartbeat` 才会以"心跳失败"的形式产出一条失败结果并走告警流程（见 `watchdog/external_endpoint.go#L42-L83`）。

### 1.2 状态持久化（State Persistence）

两者都通过 `store.Get().InsertEndpointResult` 写入结果，并通过 `store.Get().UpsertTriggeredEndpointAlert` 持久化"已触发告警"，但持久化的"锚点"不同：

- **Endpoint**：
  - 在 `handleAlertsToTrigger/Resolve` 中直接修改的是真实 `ep` 指针上的 `NumberOfSuccessesInARow`、`NumberOfFailuresInARow`、`LastReminderSent`、`Alert.Triggered`（`watchdog/alerting.go#L27-L118`）。
  - 这个 `ep` 指针长期存活在 `cfg.Endpoints` 中，不会在两次执行之间被重建。
  - 重启 / 配置重载时，`initializeStorage` 会从 `GetTriggeredEndpointAlert` 读取持久化字段并回填（`main.go#L137-L160`）。

- **ExternalEndpoint（仅推送）**：
  - `HandleAlerting` 接收的是**由 `externalEndpoint.ToEndpoint()` 构造出的 `*endpoint.Endpoint` 副本**（`api/external_endpoint.go#L62`）。`ToEndpoint()` 对 `Alerts` 切片做的是**浅拷贝**（`config/endpoint/external_endpoint.go#L95`：`Alerts: externalEndpoint.Alerts`），因此 `convertedEndpoint.Alerts` 与 `externalEndpoint.Alerts` **共享完全相同的 `*alert.Alert` 指针**。
  - `handleAlertsToTrigger` / `handleAlertsToResolve` 中对 `endpointAlert.Triggered` 的修改（`watchdog/alerting.go#L70`、`#L98`），**直接作用在原 `externalEndpoint.Alerts` 中共享的 `*alert.Alert` 对象上**。因此 `Alert.Triggered` 的内存状态**不会丢失**——它始终挂在 `cfg.ExternalEndpoints[i].Alerts[j]` 这个持久对象上。
  - 但 `LastReminderSent` 是 `endpoint.Endpoint` 结构体上的字段（`config/endpoint/endpoint.go#L140`），不在 `alert.Alert` 上；且 `ExternalEndpoint` 结构体本身也没有 `LastReminderSent` 字段。`convertedEndpoint.LastReminderSent` 的修改发生在临时对象上，**每次推送都会以零值开始**，意味着 reminder 的节流判断（`watchdog/alerting.go#L43`）在推送路径下实际上是每次推送都会满足 `time.Since(zeroTime) >= MinimumReminderInterval`，即只要告警已触发且配置了 reminder 间隔，每次推送都会尝试发送 reminder。
  - 处理完成后，代码把 `convertedEndpoint.NumberOfSuccessesInARow / NumberOfFailuresInARow` 两个整数值写回 `externalEndpoint` 对象（`api/external_endpoint.go#L81-L82`）。这两个字段与 `Alert.Triggered` 一样，在推送路径下都是跨次持久的。

### 1.3 本质结论

1. **生命周期不同质**：Endpoint 是"主动、节拍化、进程内"的循环；ExternalEndpoint 是"被动、事件化、进程外"的回调。
2. **告警去抖（FailureThreshold / SuccessThreshold）对两者的语义一致，但对 ExternalEndpoint 更脆弱**：
   - 每次推送都会基于 **该 externalEndpoint 内存对象上遗留的 `NumberOf*InARow`** 进行累计；若配置重载、Gatus 重启或该对象被替换，连续计数就会从 0 重新开始。
   - 对 Endpoint 而言，只要进程没死，计数就一直在同一个 `ep` 指针上累计，对重载的鲁棒性仅由持久化层提供。
3. **ExternalEndpoint 的"告警触发/恢复"完全依赖推送事件**：如果外部系统停止推送而没配置 Heartbeat，Gatus 既不会触发告警也不会恢复告警，告警状态会"冻结"在上一次推送的状态上。Endpoint 则会因主动轮询持续产出结果，状态单调推进。

---

## 2. 配置重载空窗期的 ExternalEndpoint 推送数据

相关流程位于 `main.go` 的 `listenToConfigurationFileChanges`（L226-L252）：

```
watchdog.Shutdown(cfg)            // 取消 context -> 所有 Monitor goroutine 退出
controller.Shutdown()             // app.Shutdown() -> 关闭 Fiber HTTP 服务
metrics.UnregisterPrometheusMetrics()
closeTunnels(cfg)
time.Sleep(time.Second)
save()                             // 持久化当前状态
loadConfiguration()                // 读新配置
store.Get().Close()                // 关闭旧存储
initializeStorage(updatedConfig)   // 建连接 + 清理 + 回填
start(updatedConfig)               // 起 controller + watchdog
```

### 2.1 空窗期的两个阶段

**阶段 A：`controller.Shutdown()` 到新 `controller.Handle` 之间**

Fiber 的 `app.Shutdown()` 会：
- 停止 `net.Listener`，新连接无法建立；
- 对已连接请求等待最多 `ShutdownTimeout`（若未配置，fiber 默认行为会立即关闭连接）。

这意味着：
- **新的推送请求会直接 TCP 连接失败**，外部系统侧表现为 `connection refused` / `connection reset`；
- **已在处理中的请求有机会在 `app.Shutdown()` 返回前完成**，其结果会被 `save()` 落盘（若在 `save()` 前完成）；
- 在 `app.Shutdown()` 之后、新 `app.Listen` 之前的这段时间，HTTP 服务完全不可用，**所有推送全部被 TCP 层丢弃**，没有任何重试缓存或持久化缓冲。

**阶段 B：`store.Get().Close()` 到 `initializeStorage` 完成之间**

需要先澄清一个关键事实：包级变量 `initialized`（`storage/store.go#L101`）**只在 `Initialize` 中被设为 `true`，从未在任何位置被重置为 `false`**——`Close()` 只是 `Store` 接口的方法，仅由具体实现（memory / sql）执行清理，不修改 `initialized`。因此：

- `store.Get().Close()` 之后，`initialized` 仍为 `true`；
- 下次调用 `store.Get()` 时，**不会进入 `if !initialized` 分支**，也不会创建临时存储，而是直接返回已指向旧存储的 `store` 变量；
- 对 memory store，`Close()` 是空操作（`storage/store/memory/memory.go#L330-L332`），旧存储数据仍然完整可读可写；
- 对 sql store，`Close()` 会关闭数据库连接并清空缓存（`storage/store/sql/sql.go#L578-L584`），后续 `InsertEndpointResult` 会因连接已关闭而报错。

在 `listenToConfigurationFileChanges` 的流程中，`store.Get().Close()` 与 `initializeStorage(updatedConfig)` 之间**没有 `start(updatedConfig)`**——新的 HTTP 服务要到 `start()` 才启动，所以阶段 B 实际上新的 HTTP 服务尚未启动，推送请求仍然无法到达。阶段 B 的唯一风险是：如果在旧服务已经关闭、新服务尚未启动的极短窗口内，由其他 goroutine（如 Heartbeat）调用 `store.Get()`，它拿到的是旧存储实例，对 memory store 无影响，对 sql store 则会报错。

因此，**"自动初始化临时存储"的推断不成立**；阶段 B 不存在"写入临时内存 Store 随后被替换"的问题。空窗期内推送数据丢失的主要机制仍然是阶段 A 的 TCP 连接拒绝。

### 2.2 影响范围

- **阶段 A**：TCP 连接拒绝期间，ExternalEndpoint 的 `NumberOfSuccessesInARow` / `NumberOfFailuresInARow` 连续性被打断——推送根本无法送达 Gatus，所以不存在"部分写入"的情况；
- **阶段 B**：由于新 HTTP 服务尚未启动，推送同样无法到达；若有 Heartbeat goroutine 在此窗口内执行，对 memory store 无影响，对 sql store 则会因连接关闭而报错；
- 若外部系统在空窗期推送了"服务恢复"，由于推送根本无法送达 Gatus，`Alert.Triggered` 仍然保持之前的状态（不会被修改），重载完成后 Gatus 仍认为告警状态与重载前的内存状态一致——不会出现"恢复信号丢失"的情况，但由于推送根本不存在；
- Heartbeat 在重载完成后首次执行时，`HasEndpointStatusNewerThan` 可能因空窗期时间较长而误报"未在窗口内收到结果"，触发心跳失败告警。

### 2.3 结论

**在 Gatus 进程执行 stop → initializeStorage 的空窗期内，所有到达的 ExternalEndpoint 推送数据都会被完全丢弃**，既不会被持久化，也不会参与告警判定。建议：

- 配置 Heartbeat 以把"Gatus 自身不可达"也纳入可观测范围；
- 推送端应实现带退避的重试（以及对 404/5xx 的区分处理），避免把"Gatus 正在重载"当成一次业务失败。

---

## 3. 配置重载清除 SuiteStatuses 对连续状态字段的级联影响

在 `main.go` 的 `initializeStorage` 中，Gatus 会执行两类清理（L107-L134）：

```go
store.Get().DeleteAllSuiteStatusesNotInKeys(suiteKeys)      // 清理 suite 状态
store.Get().DeleteAllEndpointStatusesNotInKeys(keys)        // 清理 endpoint 状态
```

随后再执行 `DeleteAllTriggeredAlertsNotInChecksumsByEndpoint` 和 `GetTriggeredEndpointAlert` 回填（L136-L212）。

需要明确的是：**`SuiteStatuses` 与 `EndpointStatus` 是两条完全独立的存储通道**。`suite.Status` 仅包含 `Results []*suite.Result`（`config/suite/suite_status.go#L4-L16`），不包含任何 `NumberOfSuccessesInARow` / `NumberOfFailuresInARow` 字段——这些字段属于 `endpoint.Endpoint`，由 `TriggeredEndpointAlert` 持久化。因此，"清除 SuiteStatuses" 本身对普通 Endpoint 或 ExternalEndpoint 的连续计数字段**没有直接影响**。但会带来以下级联状态丢失：

### 3.1 Suite 级可观测性丢失

- **历史结果列表清空**：`suite.Status.Results` 被删除，UI 的 `SuiteDetails`、`SequentialFlowDiagram`、`ResponseTimeChart` 失去历史基线；
- **Uptime / 平均响应时间统计回归**：`GetUptimeByKey`、`GetAverageResponseTimeByKey`、`GetHourlyAverageResponseTimeByKey` 对 suite key 的查询结果被清零；
- **Suite 级 Success/Failure 连续计数隐式丢失**：虽然 Gatus 没有显式字段，但 Suite 执行结果被清空后，任何基于 Suite 历史结果推导的"连续成功次数"（例如自定义前端展示、外部报表系统）都会被打断。

### 3.2 与 Endpoint 连续状态的间接耦合

Suite 内部的每个子 Endpoint 有独立的 `NumberOfSuccessesInARow` / `NumberOfFailuresInARow`，它们的持久化锚点是 `TriggeredEndpointAlert` 而非 `SuiteStatuses`。但以下情形会导致级联损失：

1. **Suite 从配置中被整体移除**：
   - `DeleteAllSuiteStatusesNotInKeys` 清掉该 suite 的状态；
   - 同时 `DeleteAllEndpointStatusesNotInKeys` 也会清掉属于该 suite 的子 Endpoint 的 `EndpointStatus`；
   - `DeleteAllTriggeredAlertsNotInChecksumsByEndpoint` 会清掉这些子 Endpoint 的所有告警持久化条目（`main.go#L187-L212` 只对仍在配置中的 suite 子 Endpoint 执行回填，已删除 suite 的子 Endpoint 不会再处理）；
   - 结果：**这些子 Endpoint 的 `NumberOfSuccessesInARow`、`Alert.Triggered`、`ResolveKey` 等全部丢失**，即使未来重新把它们加回配置，也只能从 0 重新累计。

2. **Suite 仍在配置中，但内部 Endpoint 被替换/重命名**：
   - 旧 Endpoint 的 `EndpointStatus` 会因 key 不在保留列表中而被删除；
   - 旧 Endpoint 的 `TriggeredEndpointAlert` 会因 checksum 或 key 不匹配被删除；
   - 新 Endpoint 是全新的，`NumberOf*InARow` 从 0 开始。

3. **ExternalEndpoint 与 Suite 混合场景**：
   - ExternalEndpoint 的 `EndpointStatus` 和 `TriggeredEndpointAlert` 由其自身 key 保留或删除，不受 SuiteStatuses 清理直接影响；
   - 但如果外部系统把"同一个外部服务"同时注册为 ExternalEndpoint（用于推送）和 Suite 的子 Endpoint（用于主动补检），则：
     - SuiteStatuses 清除不会波及 ExternalEndpoint 的计数；
     - 但若 Suite 被移除，则子 Endpoint 的主动轮询停止，只剩 ExternalEndpoint 的推送路径；
     - 推送路径又存在 1.2 节所述的"临时对象 → 仅回写两个整数"问题，在重载空窗期（第 2 节）更容易丢失连续状态。

4. **Heartbeat 关联**：
   - 如果某个 ExternalEndpoint 配置了 Heartbeat，`monitorExternalEndpointHeartbeat` 在启动时会用 `HasEndpointStatusNewerThan(now - Interval)` 判断；
   - 如果其 `EndpointStatus` 在重载时被误清（例如因 key 拼写改变），第一次心跳就会错误地触发"未在窗口内收到结果"的告警；
   - 这与 `SuiteStatuses` 无直接关系，但在"大规模 Endpoints + ExternalEndpoints 混合 + 配置重载"场景中会叠加出现。

### 3.3 内存中的计数器 vs 持久化计数器的错配

`initializeStorage` 在回填时（`main.go#L155-L157`、`#L180-L182`、`#L206-L208`）执行：

```go
ep.NumberOfSuccessesInARow, ep.NumberOfFailuresInARow = numberOfSuccessesInARow, alert.FailureThreshold
```

这里的 `NumberOfFailuresInARow` 被**硬编码为 `alert.FailureThreshold`**（因为只有当告警已经触发时，失败次数必然 ≥ 阈值，且无法从存储精确恢复）。这意味着：

- 即使原本是 `FailureThreshold + N` 的连续失败，重载后也会被当作恰好 `FailureThreshold`；
- 对那些"FailureThreshold 之后还需要累计额外失败次数才走下一步逻辑"的自定义告警/处理来说，会损失精度；
- 恢复计数（`NumberOfSuccessesInARow`）是精确恢复的，但失败计数是近似的。

这个行为与 `SuiteStatuses` 清理无关，但在"混合大规模配置 + 频繁重载"的场景中会与前述丢失一起放大状态偏差。

### 3.4 小结

1. **删除 `SuiteStatuses` 本身不直接影响 Endpoint/ExternalEndpoint 的 `NumberOfSuccessesInARow`**，后者由 `TriggeredEndpointAlert` 持久化承载。
2. **真正的级联损失来自"Suite 整体被移除"或"Suite 内 Endpoint 被替换"**：此时 `DeleteAllEndpointStatusesNotInKeys` + `DeleteAllTriggeredAlertsNotInChecksumsByEndpoint` 会一起清理，连续计数完全丢失。
3. **恢复计数 (`NumberOfSuccessesInARow`) 会被精确回填，失败计数 (`NumberOfFailuresInARow`) 只被近似回填为 `FailureThreshold`**，存在细微精度损失。
4. **混合部署（主动 Endpoint + 被动 ExternalEndpoint + Suite）下，一次配置重载会同时暴露三类问题**：
   - 空窗期推送丢失（第 2 节）；
   - 已删除 Suite 子 Endpoint 连续计数归零；
   - 失败计数被钳制到 `FailureThreshold`，丧失超限信息。

---

## 总结

| 问题 | 结论 |
|---|---|
| 1. 生命周期与持久化差异 | Endpoint 是主动轮询、单一持久 `ep` 指针；ExternalEndpoint 是事件驱动，每次推送 `ToEndpoint()` 浅拷贝 Alerts 指针，`Alert.Triggered` 因共享指针不会丢失，`NumberOf*InARow` 显式回写，仅 `LastReminderSent` 每次以零值开始。 |
| 2. 空窗期推送 | 会被完全丢弃（TCP 拒绝是主要丢失机制；`initialized` 从未被重置，`store.Get()` 不会创建临时存储，阶段 B 不存在数据写入临时存储被替换的推断不成立。建议推送端做重试，同时为关键 ExternalEndpoint 启用 Heartbeat。 |
| 3. SuiteStatuses 清理的级联 | 对 `NumberOf*InARow` 无直接影响；但若伴随 Suite 或子 Endpoint 被移除，会间接触发连续计数归零，且失败计数仅以 `FailureThreshold` 回填，存在精度损失。 |

建议在大规模混合部署场景中：
- 将推送端与 Gatus 之间解耦，避免把 Gatus 重载视为业务事件；
- 尽量保持 key 稳定，避免在重载中改名；
- 对需要高精度失败计数的告警，在业务侧自行维护连续失败次数；
- 为所有关键 ExternalEndpoint 启用 Heartbeat。
