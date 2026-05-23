# watchdog/alerting.go 处理流程风险分析

本文针对 `watchdog/alerting.go` 在实际运行时可能遇到的三类隐患进行分析，覆盖外部 `AlertProvider` 长时间阻塞、恶意超大 JSON 体导致的 CPU/内存风险、以及热重载场景下基于 `ResolveKey` 恢复链路的潜在错乱。

---

## 1. AlertProvider 长时间阻塞对健康检查轮询节拍的扰乱

### 1.1 调用链路

`HandleAlerting` 在 [watchdog/alerting.go#L16-L25](file:///e:/solo-code-2/gatus/watchdog/alerting.go#L16-L25) 中被同步调用，`monitorEndpoint` 在 [watchdog/endpoint.go#L15-L33](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L15-L33) 中为每个 Endpoint 启动单独的 goroutine，循环如下：

```go
ticker := time.NewTicker(ep.Interval)
for {
    select {
    case <-ctx.Done():
        return
    case <-ticker.C:
        executeEndpoint(ep, cfg, extraLabels)
    }
}
```

`executeEndpoint` 在 [watchdog/endpoint.go#L35-L72](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L35-L72) 末尾同步调用 `HandleAlerting`，内部直接调用 `alertProvider.Send(...)`（见 [watchdog/alerting.go#L63](file:///e:/solo-code-2/gatus/watchdog/alerting.go#L63)），并在成功后调用 `store.Get().UpsertTriggeredEndpointAlert(...)` 持久化（[watchdog/alerting.go#L73](file:///e:/solo-code-2/gatus/watchdog/alerting.go#L73)）。

关键点：
- **没有独立的告警派发协程，也没有超时控制**；
- `time.Ticker` 只会在 `select` 循环回到 `<-ticker.C` 分支被消费时才累积下一次 tick；
- `monitoringSemaphore.Acquire(ctx, 1)` 是在 `executeEndpoint` 内完成，阻塞期间该权重一直持有。

### 1.2 具体扰乱方式

当某个 `AlertProvider`（如 PagerDuty/Slack）因限流导致 `Send` 长时间挂起时：

1. **当前 Endpoint 的下一次 `ticker.C` 事件被无限期积压**。`executeEndpoint` 未返回，`select` 无法响应到下一轮循环，`ticker.C` 会持续积压缓冲 tick（`time.NewTicker` 的 channel 带缓冲，但消费不出来）。
2. **健康检查完全停摆**。`ep.EvaluateHealth()` 不再执行，新的 `Result` 不再产生，`store.Get().InsertEndpointResult` 不再写入，导致该 Endpoint 历史监控数据中断。
3. **级联阻塞**：`defer monitoringSemaphore.Release(1)` 只有在 `executeEndpoint` 返回时才执行，若 [watchdog/watchdog.go#L37](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L37) 中的 `monitoringSemaphore.Acquire(ctx, 1)` 持有未释放，那么在 `cfg.Concurrency` 受限时，**其他 Endpoint 也会被阻塞在 `Acquire`**，整个 watchdog 停顿。
4. **告警重发与计数失真**：挂起期间 `ep.NumberOfFailuresInARow` 在 [watchdog/alerting.go#L29](file:///e:/solo-code-2/gatus/watchdog/alerting.go#L29) 已经 ++，但 `endpointAlert.Triggered` 在 `Send` 返回 err 时不会置位，网络恢复后下一轮会立即再次尝试发送，可能产生多次重复告警。
5. **维护窗口误判**：挂起期间若进入/离开维护窗口，`IsUnderMaintenance()` 判定在挂之前已经完成，维护窗口内本应被跳过的告警也可能被错误地发出。

### 1.3 本质原因

`HandleAlerting` 与端点探测强耦合，`alertProvider.Send` 在端点主循环中同步执行，缺乏超时、异步化与信号量释放的保护。

---

## 2. 恶意超大 JSON 体对 CPU/内存的冲击

### 2.1 相关代码

告警模板中形如 `[BODY].user.name` 的解析由 [config/endpoint/placeholder.go#L175-L177](file:///e:/solo-code-2/gatus/config/endpoint/placeholder.go#L175-L177) 触发，最终落到 [jsonpath/jsonpath.go#L11-L21](file:///e:/solo-code-2/gatus/jsonpath/jsonpath.go#L11-L21)：

```go
func Eval(path string, b []byte) (string, int, error) {
    var object interface{}
    if err := json.Unmarshal(b, &object); err != nil {
        return "", 0, err
    }
    return walk(path, object)
}
```

随后 [jsonpath/jsonpath.go#L24-L67](file:///e:/solo-code-2/gatus/jsonpath/jsonpath.go#L24-L67) 的 `walk` 递归按 `.` 分割，逐层递归调用自身，深度等于 `path` 分段数；而 `walk` 在无法匹配键时也不会提前失败，只要路径是合法的就会一直递归。

### 2.2 风险点

1. **`json.Unmarshal` 无大小限制**：`result.Body` 直接交给 `json.Unmarshal(b, &object)`，`encoding/json` 解码器**没有深度上限，也没有最大 body 限制**。若被监控目标返回一个几十 MB 甚至 GB 级 JSON，Go 运行时会分配大量 `map[string]interface{}`，内存压力激增，有 OOM 风险。
2. **递归深度无上限**：`walk` 深度等价于 `path` 长度线性增长；对于恶意构造的极深嵌套 JSON（如 `{"a":{"a":{"a":...}}}`），`walk` 会持续递归，**goroutine 栈会被耗尽**，最终栈溢出崩溃。
3. **CPU 暴涨**：`walk` 每层递归都要 `fmt.Sprintf("%v", value)`，对于嵌套极深且每层都是大对象的场景，每层递归都会做完整的 `Sprintf`，CPU 占用随嵌套深度近似线性增长。
4. **map 遍历/再序列化开销**：当 `walk` 走到最后一层，`json.Marshal(value)` 会对整个剩余子树再做一次序列化（[jsonpath/jsonpath.go#L50-L51](file:///e:/solo-code-2/gatus/jsonpath/jsonpath.go#L50-L51)），对大对象来说是额外的 CPU/内存消耗。

### 2.3 触发场景

- **超大体量**：监控目标返回 MB/GB 级 JSON（如某些后端误把全量日志 dump 到响应体）。
- **极深嵌套**：监控目标返回几十/几百层嵌套的 JSON（如递归转储链路数据）。
- **极深 JSONPath**：告警模板中 `[BODY].a.b.c...` 极长路径，配合深嵌套 JSON 触发 `walk` 递归爆炸。

### 2.4 本质原因

`jsonpath.Eval` 缺乏对输入 body 大小的上限、对递归深度的上限、也没有超时或保护性终止条件。

---

## 3. 热重载后基于 `ResolveKey` 的恢复链路错乱

### 3.1 热重载流程回顾

热重载由 [main.go#L226-L252](file:///e:/solo-code-2/gatus/main.go#L226-L252) 的 `listenToConfigurationFileChanges` 触发：

```go
stop(cfg)                          // Shutdown watchdog
time.Sleep(time.Second)
save()                              // 持久化当前状态
updatedConfig, err := loadConfiguration()
store.Get().Close()
initializeStorage(updatedConfig)    // 从存储层重新回填 Triggered 告警
start(updatedConfig)
```

在 `initializeStorage` 中，[main.go#L135-L216](file:///e:/solo-code-2/gatus/main.go#L135-L216) 会：
1. 先调用 `DeleteAllTriggeredAlertsNotInChecksumsByEndpoint(ep, checksums)` 把已经不在新配置中的告警从存储层移除；
2. 再调用 `GetTriggeredEndpointAlert(ep, alert)`，若存在则回填：
   ```go
   alert.Triggered, alert.ResolveKey = true, resolveKey
   ep.NumberOfSuccessesInARow, ep.NumberOfFailuresInARow = numberOfSuccessesInARow, alert.FailureThreshold
   ```

`checksums` 由 [alerting/alert/alert.go#L119-L129](file:///e:/solo-code-2/gatus/alerting/alert/alert.go#L119-L129) 的 `Checksum()` 计算：

```go
func (alert *Alert) Checksum() string {
    hash := sha256.New()
    hash.Write([]byte(string(alert.Type) + "_" +
        strconv.FormatBool(alert.IsEnabled()) + "_" +
        strconv.FormatBool(alert.IsSendingOnResolved()) + "_" +
        strconv.Itoa(alert.SuccessThreshold) + "_" +
        strconv.Itoa(alert.FailureThreshold) + "_" +
        alert.GetDescription()),
    )
    return hex.EncodeToString(hash.Sum(nil))
}
```

### 3.2 空窗期内修改配置的错乱场景

触发告警与恢复之间（`Triggered = true` 期间），运维对该告警的 `Type`、`Description`、`SuccessThreshold`、`FailureThreshold`、`Enabled`、`SendOnResolved` 等任意字段做了修改，由于这些字段都参与 `Checksum()` 的计算，**新告警的 `Checksum` 与持久化的 `configuration_checksum` 不一致**。结果：

1. **持久化条目被静默删除**。在 `initializeStorage` 中 [main.go#L144](file:///e:/solo-code-2/gatus/main.go#L144)：
   ```go
   numberOfTriggeredAlertsDeleted := store.Get().DeleteAllTriggeredAlertsNotInChecksumsByEndpoint(ep, checksums)
   ```
   由于旧 checksum 已不在新配置的 `checksums` 列表中，旧的 `ResolveKey`、`NumberOfSuccessesInARow` 被整条删除。
2. **回填失败，`Triggered` 丢失**。随后 `GetTriggeredEndpointAlert(ep, alert)` 找不到记录，`alert.Triggered` 不会被恢复为 `true`。
3. **恢复链路完全断裂**。由于 `Triggered` 为 `false`，`handleAlertsToResolve` 在 [watchdog/alerting.go#L87](file:///e:/solo-code-2/gatus/watchdog/alerting.go#L87) 中 `if !endpointAlert.Triggered` 会直接跳过，**永远不会再发送 RESOLVED 通知**，在对端（如 PagerDuty）上留下一个悬挂的未解决告警。
4. **对端渠道不匹配**：若运维将 `Type` 从 `slack` 改为 `pagerduty`，由于旧 `ResolveKey` 是 Slack 的消息时间戳（或 PagerDuty 的 `dedup_key`），即使新 `Checksum` 碰巧匹配，新 provider 也无法识别旧 `ResolveKey` 格式，RESOLVED 通知发往新渠道但缺少 `ResolveKey`，导致对端无法解除告警。
5. **`SendOnResolved` 变更带来的隐患**：若运维将 `send-on-resolved: true` 改为 `false`，即使 `Checksum` 不匹配导致删除，恢复链路不会发送 RESOLVED；反过来从 `false` 改为 `true` 时，由于旧 `ResolveKey` 已丢，即使恢复链路能走到 `alertProvider.Send(..., true)`，也会因 `ResolveKey` 为空而让 PagerDuty 把这次 resolve 当作一次新的 trigger。

### 3.3 本质原因

- 持久化层以 `Checksum()` 作为标识，而 `Checksum` 包含了过多易变字段（`Description`、`SuccessThreshold`、`FailureThreshold` 等），任何微调都会导致 checksum 变化，使旧 `ResolveKey` 被当作"已从配置删除"的条目删除。
- 没有独立于配置内容的稳定标识（如按 EndpointKey + 告警序号或显式 `id` 字段）来跨重载关联持久化条目与运行时告警。
- 热重载是"停 → 保存 → 重载 → 回填"的全量替换，任何一条持久化条目在回填阶段无法匹配当前配置 checksum 就会被清理，恢复链路从此失联。

---

## 4. 综合结论

| 维度 | 触发点 | 表现 |
| --- | --- | --- |
| 轮询节拍 | `HandleAlerting` 在端点主循环中同步调用 `alertProvider.Send` | 当前 Endpoint 及受限于 semaphore 的其他 Endpoint 全部停摆 |
| CPU/内存 | `jsonpath.Eval` 对超大/超深 JSON 无保护 | OOM 或 goroutine 栈溢出 |
| 恢复链路 | `Checksum()` 对配置字段过于敏感，热重载会删持久化条目 | `Triggered` 丢失，`ResolveKey` 失效，对端告警悬挂 |

三类问题的共同根源在于：**watchdog 与告警派发、告警配置、告警持久化之间存在紧耦合，缺乏对外部故障、输入规模、配置变更的隔离与容错**。
