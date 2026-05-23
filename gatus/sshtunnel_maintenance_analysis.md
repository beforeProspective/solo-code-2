# SSH 隧道与维护窗口代码分析

## 问题 1：`Dial` 懒连接的双重检查锁定导致重复连接与连接泄漏

### 相关代码位置
[sshtunnel.go: Dial 方法](file:///e:/solo-code-2/gatus/config/tunneling/sshtunnel/sshtunnel.go#L114-L131)

### 场景复现
当两个并发监控协程几乎同时调用同一 `SSHTunnel` 实例的 `Dial` 方法，且此时 `t.client == nil` 时：

1. 协程 A 获取 `RLock`，读取到 `client == nil`，释放 `RLock`。
2. 协程 B 获取 `RLock`，同样读取到 `client == nil`，释放 `RLock`。
3. 协程 A 获得 `Lock`，执行 `connectUnsafe` 建立 SSH 连接 `C1`，把 `t.client = C1`，释放 `Lock`。
4. 协程 B 获得 `Lock`，由于双重检查中再次读取 `t.client`（第 123 行），此时 `t.client != nil`，因此不会再调用 `connectUnsafe`。

### 分析结论
**用户描述的"两条重复连接"场景在当前代码下不会发生。**

原因在于双重检查中写锁内对 `t.client` 进行了二次判断（第 123 行 `if t.client == nil`），这是标准的 double-checked locking 模式：先释放读锁、再获取写锁、再判断一次状态。只要写锁内读取的是 `t.client` 字段本身（而非前一次读锁时捕获的局部变量 `client`），就能避免重复执行 `connectUnsafe`。代码正是这样实现的，所以该窗口期不会造成连接泄漏。

### 仍需注意的隐患（延伸）
- 在 `Dial` 的重试循环中（第 136–160 行），每次重试前会 `t.client.Close()` 并置 `nil`，然后重新 `connectUnsafe`。这个过程确实会新建连接，但这是主动重连，属于预期行为。
- 真正的并发风险反而是：**`client.Dial` 调用（第 155 行）并未持有写锁**，只是在第 117 行用 `RLock` 读取了 `t.client` 到局部变量 `client`。但由于重试循环内部会在获取 `Lock` 时把 `t.client` 关掉并替换，读者可能担心读到"正在被关闭的旧 client"。详见问题 2。

---

## 问题 2：`Dial` 重试循环关闭旧 `client` 对其他协程的影响

### 相关代码位置
- [sshtunnel.go: Dial 重试循环](file:///e:/solo-code-2/gatus/config/tunneling/sshtunnel/sshtunnel.go#L136-L160)

### 场景复现
假设协程 A 由于自身 `client.Dial` 失败进入重试：
1. 协程 A 获取 `Lock`，调用 `t.client.Close()` 关闭底层 SSH 连接（连接对象 `C`），`t.client = nil`，然后 `connectUnsafe` 建立新连接 `C'`，释放 `Lock`。
2. 协程 B 在协程 A 关闭 `C` 之前，已经通过第 117 行用 `RLock` 读到了 `t.client == C`，并在稍后（此时 `C` 已被 A 关闭）执行 `C.Dial(network, addr)`。

### 分析结论
**用户描述的现象是成立的：**

- 协程 B 持有的是局部变量 `client`（即 `C`），即使 `t.client` 已被替换为 `C'`，B 仍会在旧的 `C` 上执行 `Dial`。
- `C` 的底层 SSH 连接已被 `Close`，`golang.org/x/crypto/ssh` 的 `Client.Dial` 会立即返回一个错误（典型为 `use of closed network connection` 或 `connection closed`）。
- 协程 B 的 `Dial` 调用失败后，**该错误被直接作为 `lastErr` 返回**，`Dial` 的 `maxRetries` 循环里只会在"重连后再试一次 `client.Dial`"，但如果 B 的 `client.Dial` 调用发生在 A 已经关闭连接之后（此时 B 还没进入重试），B 会在第一次 `client.Dial` 得到错误、然后进入自己的重试循环，在自己的重试里也会关闭并重建连接——这看似没问题，但实际上：
  - 只要 B 的 `client.Dial` 发生在 A 尚未完成重连（或 A 已完成重连但 B 仍持有旧 `C`）时，B 就会得到一次真实失败；
  - B 的调用方（Endpoint 健康检查）拿到的错误会被当作"目标服务不可达"，而不是"SSH 通道临时抖动"，因此会被记入健康检查失败。

### 进一步的结构性问题
这里还有一个更深层的缺陷：**所有使用同一 `SSHTunnel` 的 Endpoint 共享同一个 `ssh.Client`**，单个 Endpoint 的 `client.Dial` 失败会触发 `Close()` 并重建，这会**连带打断其他 Endpoint 正在进行中的 SSH 转发**。这意味着：
- 某个 Endpoint 目标服务短暂不可达（或 DNS 解析失败）导致的一次 `client.Dial` 失败，会连累其他完全健康的 Endpoint 被判定为失败。
- 这是典型的"故障隔离缺失"问题，严重时可形成抖动放大。

### 建议方向（仅分析，非本次修复要求）
- 将"连接已关闭"类型的错误与真正的目标服务不可达错误区分开；
- 避免 `Dial` 的使用者在重试时把共享的 `t.client` 直接 `Close`，改用独立的重入或引用计数机制；
- 或让每个健康检查使用独立的 `ssh.Client`（代价是连接数增加）。

---

## 问题 3：`IsUnderMaintenance` 跨月回溯时 `Every` 判定缺陷

### 相关代码位置
- [maintenance.go: IsUnderMaintenance](file:///e:/solo-code-2/gatus/config/maintenance/maintenance.go#L99-L125)

### 用户描述场景
- 当前时间：某月 1 日 00:30（凌晨）。
- 维护配置：`Start: "23:00"`、`Duration: 2h`、`Every: [<本月1号对应的星期几>]`（例如 2026-05-01 是星期五，`Every: ["Friday"]`）。

### 执行路径
1. `now.Hour() == 0 < 23`，进入 `adjustedDate--` 分支，`adjustedDate = 0`。
2. `dayWhereMaintenancePeriodWouldStart = time.Date(now.Year(), now.Month(), 0, 0, 0, 0, 0, loc)`。
   - Go 的 `time.Date` 会把 `day=0` 规范化为上月最后一天（对 5 月来说是 4 月 30 日星期四）。
3. `dayWhereMaintenancePeriodWouldStart.Weekday().String() == "Thursday"`。
4. `hasMaintenanceEveryDay == false`（因为 `Every` 非空）；`hasMaintenancePeriodScheduledToStartOnThatWeekday` 检查 `"Thursday" in Every`，但 `Every` 只有 `"Friday"`，所以为 `false`。
5. 函数直接 `return false`。
6. 但实际此刻（5 月 1 日 00:30）正处于"周四 23:00 开始、持续 2 小时"的维护窗口中——本应返回 `true`。

### 分析结论
**用户指出的缺陷确实存在。**

根本原因是：
- 代码只回溯了一天（`adjustedDate--`）来找到"维护开始那一天"，但这一天的星期几与"当前星期几"可能并不一致（特别是跨月或夏令时切换时更明显）。
- `Every` 本意是"在每周哪些天应用该维护窗口"，但实现里却用"维护开始那一天"的星期去匹配，而不是用"当前时间所归属的维护周期所覆盖的那些天"去匹配。
- 当维护开始时间 `Start` 比当前时刻小时数更晚（即维护窗口在"昨天"开始并延续到"今天"）且"昨天"与"今天"跨月边界时，"昨天"的星期不在 `Every` 中就会被错误地排除。

### 更一般的表现
不仅仅是"凌晨 0 点跨月"，只要：
- `Every` 只包含"今天"的星期、不包含"昨天"的星期；
- 且 `Start.Hour > now.Hour`（维护窗口跨自然日）；
就会触发这个错误，例如：
- 今天是周日、昨天是周六，`Every: ["Sunday"]`、`Start: "23:00"`，任何周日凌晨都会被判定为"不在维护窗口中"。

### 建议方向（仅分析）
可以采取以下任一思路修复：
- **匹配当前日的星期**：直接用 `now.Weekday()` 去匹配 `Every`，而不是用"维护开始那一天"的星期；维护窗口只需判断"now 是否落在某个 Start+Duration 区间"，与"开始那天属于哪个星期"无关。
- **考虑跨日周期**：由于维护窗口可能跨自然日，判断时应同时允许"今天"或"昨天"的星期落在 `Every` 里（仅当 `now < Start` 时需要回溯到昨天）。
- **使用周期覆盖判定**：按 `Start` 与 `Duration` 计算最近一次维护开始时间，再判断 `now` 是否在 `[start, start+Duration)` 内；至于"是否该执行这次维护"，则用 `start` 或 `start + Duration/2` 的星期去匹配 `Every`。这样跨月不再影响判定结果。

---

## 三个问题的总体严重度排序

| 问题 | 严重度 | 触发条件 | 影响 |
| ---- | ------ | -------- | ---- |
| 问题 1（重复连接） | 低（实际无缺陷） | 并发首次 Dial | 不会重复连接 |
| 问题 2（共享 client 被关闭） | 高 | 任一 Endpoint 转发失败 | 其他健康 Endpoint 被误判失败 |
| 问题 3（跨月 Every 判定） | 中 | 维护窗口跨自然日且 Every 非空 | 告警未被正确静默 |
