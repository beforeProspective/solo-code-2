# CheckForInternetConnectionJob 行为深度分析

针对 `CheckForInternetConnectionJob` 在测速流水线中的三个关键问题，结合源码逐项剖析。

相关代码位置：

- 核心 Job：[CheckForInternetConnectionJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/CheckForInternetConnectionJob.php)
- Ping 动作：[PingHostname.php](file:///e:/solo-code-2/speedtest-tracker/app/Actions/PingHostname.php)
- 状态枚举：[ResultStatus.php](file:///e:/solo-code-2/speedtest-tracker/app/Enums/ResultStatus.php)
- SpeedtestChecking 事件：[SpeedtestChecking.php](file:///e:/solo-code-2/speedtest-tracker/app/Events/SpeedtestChecking.php)
- SpeedtestFailed 事件：[SpeedtestFailed.php](file:///e:/solo-code-2/speedtest-tracker/app/Events/SpeedtestFailed.php)
- 流水线入口（Ookla）：[RunSpeedtest.php](file:///e:/solo-code-2/speedtest-tracker/app/Actions/Ookla/RunSpeedtest.php)
- 流水线全部 Job 链路：
  - [StartSpeedtestJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/StartSpeedtestJob.php)
  - [SkipSpeedtestJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/SkipSpeedtestJob.php)
  - [SelectSpeedtestServerJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/SelectSpeedtestServerJob.php)
  - [RunSpeedtestJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/RunSpeedtestJob.php)
  - [BenchmarkSpeedtestJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/BenchmarkSpeedtestJob.php)
  - [CompleteSpeedtestJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/CompleteSpeedtestJob.php)
- 测试用例：[CheckForInternetConnectionJobTest.php](file:///e:/solo-code-2/speedtest-tracker/tests/Feature/CheckForInternetConnectionJobTest.php)

---

## 0. Job 执行流程总览

先把 `handle()` 的完整执行顺序摊开，方便后文引用：

```
① $result->update(['status' => Checking])
   ↓
② SpeedtestChecking::dispatch($result)
   ↓
③ $ping = PingHostname::run()
   ↓
④ if ($ping?->isSuccess()) → return（早返回：连通性已确认）
   ↓ （ping 失败或不可用）
⑤ 日志 "Pinged failed, falling back to HTTP connectivity check"
   ↓
⑥ if ($this->httpFallbackSucceeds()) → return（早返回：HTTP 兜底成功）
   ↓ （HTTP 兜底也失败）
⑦ $result->update(['data->type' => 'log', 'data->level' => 'error',
                    'data->message' => $message, 'status' => Failed])
   ↓
⑧ SpeedtestFailed::dispatch($result)
   ↓
⑨ $this->batch()->cancel()
```

流水线中该 Job 的上下文（Ookla）——见 [RunSpeedtest.php](file:///e:/solo-code-2/speedtest-tracker/app/Actions/Ookla/RunSpeedtest.php#L38-L50)：

```php
Bus::batch([
    [
        new StartSpeedtestJob($result),          // 第 1 个：状态 → Started
        new CheckForInternetConnectionJob($result), // 第 2 个：状态 → Checking
        new SkipSpeedtestJob($result),             // 第 3 个
        new SelectSpeedtestServerJob($result),     // 第 4 个
        new RunSpeedtestJob($result),              // 第 5 个
        new BenchmarkSpeedtestJob($result),        // 第 6 个
        new CompleteSpeedtestJob($result),         // 第 7 个
    ],
])->name('Ookla Speedtest')->dispatch();
```

全部 7 个 Job 都挂载了 `SkipIfBatchCancelled` 中间件，意味着一旦 batch 被 `cancel()`，**尚未执行的后续 Job 会被中间件拦截并静默丢弃**。

---

## 1. 当 ping 成功时，Job 会不会继续走 HTTP 回退？为什么中途 return 不会导致状态回滚？

### 1.1 会不会走 HTTP 回退？

**不会。** 看 [CheckForInternetConnectionJob.php#L52-L54](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/CheckForInternetConnectionJob.php#L52-L54)：

```php
if ($ping?->isSuccess()) {
    return;
}
```

`$ping?->isSuccess()` 为 `true` 时，`handle()` 直接 `return`，后续的 `httpFallbackSucceeds()` 调用不可达。HTTP 回退只在 ping **失败**（`isSuccess() === false`）或 **不可用**（`$ping === null`）两条分支上触发。

测试用例 [CheckForInternetConnectionJobTest.php#L17-L38](file:///e:/solo-code-2/speedtest-tracker/tests/Feature/CheckForInternetConnectionJobTest.php#L17-L38) 也验证了这一点："batch continues when ping succeeds" 断言 `SpeedtestFailed` 未被派发、batch 未被取消。

### 1.2 为什么 return 不导致状态回滚？

这里的关键在于理解 `Checking` 状态的语义。[ResultStatus.php#L12](file:///e:/solo-code-2/speedtest-tracker/app/Enums/ResultStatus.php#L12) 把 `Checking` 定义为"正在检查连通性"：

```php
case Checking = 'checking';
```

执行流程：

1. 第 ① 步把状态改为 `Checking`，这是一个**中间态**，表示"连通性检查已经启动、正在进行中"。
2. 第 ④ 步 ping 成功后 `return`，状态**保持为 `Checking`，没有被回滚**。

为什么不需要回滚？因为：

- **`Checking` 不是这个 Job 的"失败态"，而是它的"完成态"**。`CheckForInternetConnectionJob` 的职责就是"检查连通性"。连通性确认成功 = 这个 Job 正常完成，`Checking` 作为状态语义上完全合理——它告诉外部"连通性已经检查过了，检查结果是 OK"。
- **流水线设计中各 Job 各司其职，状态由下一个 Job 推进**。在 batch 里，`CheckForInternetConnectionJob` 之后是 `SkipSpeedtestJob`，它会把状态推进到 `Skipped` 或直接 `return` 让后续 Job 继续推进到 `Running`、`Benchmarking`、`Completed`。所以 `Checking` 只是整条链路里的一个过渡标记，不是终态。
- **没有"回滚"的需求**。如果设计上要求"连通性检查成功后状态应恢复到 Started"，那才需要回滚，但当前设计选择了"保持 Checking"，这反映了设计者的意图：把"连通性已验证"作为一个显式的状态节点，方便前端和日志系统追踪。

对比：如果连通性检查**失败**，状态会被明确改为 `Failed`（第 ⑦ 步），这才是回滚式的状态变化——把之前的 `Checking` 覆盖为终态 `Failed`，表示整条流水线在此终结。

---

## 2. 如果 ping 失败但 HTTP 回退成功，Result 最终会保留什么状态？SpeedtestFailed 是否还会被派发？

### 2.1 Result 最终状态

当 ping 失败但 HTTP 回退成功时，执行路径为：

```
③ $ping = PingHostname::run()   → isSuccess() === false
   ↓
④ 跳过（条件不满足）
   ↓
⑤ 日志
   ↓
⑥ httpFallbackSucceeds() → true → return
```

状态只在第 ① 步被设置为 `Checking`，之后再也没有 `update` 调用。所以 **Result 最终保留 `Checking` 状态**，与 ping 成功时的表现完全一致。

测试用例 [CheckForInternetConnectionJobTest.php#L40-L69](file:///e:/solo-code-2/speedtest-tracker/tests/Feature/CheckForInternetConnectionJobTest.php#L40-L69)（"batch continues when ping fails but HTTP fallback succeeds"）也明确断言：

```php
expect($result->status)->toBe(ResultStatus::Checking);
```

### 2.2 SpeedtestFailed 是否派发？

**不会派发。** `SpeedtestFailed` 只在第 ⑧ 步触发，而第 ⑧ 步位于 `httpFallbackSucceeds() === false` 的分支之后。HTTP 回退成功时在第 ⑥ 步已经 `return`，第 ⑦ ⑧ ⑨ 步均不可达。

测试用例同样验证了这一点：

```php
Event::assertNotDispatched(SpeedtestFailed::class);
```

### 2.3 小结：HTTP 回退成功的语义

HTTP 回退成功意味着"虽然 ping 不通目标主机，但 HTTP 层能访问外部 URL"——这在某些网络环境（如 ICMP 被防火墙屏蔽但 HTTP/HTTPS 放行）下是常见情况。此时连通性检查的结论仍然是"网络可达"，流水线继续执行，状态停留在 `Checking`，与 ping 成功路径完全等价。

---

## 3. 结合 batch 取消和 `$this->batch()->cancel()` 解释：当网络彻底不可达时，后续同批 Job 为什么会被连带终止？这种设计对整条测速流水线意味着什么？

### 3.1 触发条件：网络彻底不可达

执行路径走到第 ⑦ ⑧ ⑨ 步的条件是：

- ping **失败**（`isSuccess() === false`）或 **不可用**（`$ping === null`），**并且**
- HTTP 回退 **失败**（`httpFallbackSucceeds() === false`）

此时第 ⑦ 步把状态改为 `Failed`，第 ⑧ 步派发 `SpeedtestFailed` 事件，第 ⑨ 步调用：

```php
$this->batch()->cancel();
```

### 3.2 `cancel()` 和 `SkipIfBatchCancelled` 的联动机制

Laravel 的 `Bus::batch()` 将一组 Job 打包成一个有状态的 batch。`$this->batch()->cancel()` 做两件事：

1. 将 batch 记录的 `cancelled_at` 字段写入当前时间戳（数据库持久化）；
2. **对尚未开始执行的后续 Job**，在它们从队列取出并准备执行时，`SkipIfBatchCancelled` 中间件会先检查 `$this->batch()->cancelled()`，若为 `true` 则直接**跳过**该 Job 的 `handle()` 方法，Job 被标记为"已取消"，不会真正执行。

这就是"连带终止"的机制：`cancel()` 不主动杀死已在运行中的 Job，但它给 batch 打上"已取消"标记，所有排队中尚未执行的 Job 在启动前会被中间件拦截并静默丢弃。

对应到流水线 [RunSpeedtest.php#L38-L50](file:///e:/solo-code-2/speedtest-tracker/app/Actions/Ookla/RunSpeedtest.php#L38-L50)，当 `CheckForInternetConnectionJob`（第 2 个）调用 `cancel()` 后：

| 位置 | Job | 会被取消吗 | 原因 |
|------|-----|-----------|------|
| 1 | `StartSpeedtestJob` | 否 | 已经执行完（状态已改为 `Started`） |
| 2 | `CheckForInternetConnectionJob` | 否 | 当前正在执行，`cancel()` 在末尾调用 |
| 3 | `SkipSpeedtestJob` | **是** | 尚未执行，中间件拦截 |
| 4 | `SelectSpeedtestServerJob` | **是** | 同上 |
| 5 | `RunSpeedtestJob` | **是** | 同上 |
| 6 | `BenchmarkSpeedtestJob` | **是** | 同上 |
| 7 | `CompleteSpeedtestJob` | **是** | 同上 |

### 3.3 这种设计的含义

**核心思路是"前置守卫 + 快速失败"（fail-fast）**。具体含义如下：

#### 3.3.1 避免无意义的资源消耗

如果网络彻底不可达：

- `SelectSpeedtestServerJob` 列出服务器需要执行 `speedtest --servers`，这依赖网络；
- `RunSpeedtestJob` 执行实际测速，完全依赖网络；
- `BenchmarkSpeedtestJob` 依赖测速结果数据；
- `CompleteSpeedtestJob` 依赖测速完成状态。

所有这些 Job 在网络断开时执行不仅没有任何产出，反而会浪费 CPU、阻塞队列、产生误导性的错误日志。`cancel()` 一次性截断整条链路，干净利落。

#### 3.3.2 状态一致性

如果不取消 batch，后续 Job 可能会：

- 在 `RunSpeedtestJob` 中各自独立地发现网络不可用，再各自把状态改成 `Failed`，导致状态被覆盖多次；
- 或者某些 Job 超时、某些 Job 抛异常，batch 的最终状态变得不可预测。

通过在连通性检查这一"守卫"节点集中决策，可以保证：

- Result 状态只被设置一次 `Failed`（第 ⑦ 步）；
- `SpeedtestFailed` 事件只派发一次（第 ⑧ 步）；
- 后续 Job 不会再对 Result 做任何修改，避免数据竞争。

#### 3.3.3 与 `SkipSpeedtestJob` 的对称设计

在流水线中，`SkipSpeedtestJob`（第 3 个）同样会在条件满足时调用 `$this->batch()->cancel()` 来终止后续 Job。这说明整条流水线的设计哲学是一致的：**每个前置节点都有权在自身职责范围内判定"后续工作无意义"，并通过 `cancel()` 统一截断**。这避免了"每个 Job 都要自己检查一遍前置条件"的重复代码。

#### 3.3.4 对流水线的整体影响

| 维度 | 影响 |
|------|------|
| **可靠性** | 网络不可达时流水线确定性地终止于 `Failed`，不会出现半执行半未执行的中间状态 |
| **效率** | 后续 5 个 Job 不会被推入执行，节省队列资源和处理时间 |
| **可观测性** | `SpeedtestFailed` 事件的订阅者（如 [ProcessFailedSpeedtest.php](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/ProcessFailedSpeedtest.php)、[UserNotificationSubscriber.php](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/UserNotificationSubscriber.php)）能收到一次明确的失败通知，不会被后续 Job 的二次失败所干扰 |
| **扩展性** | 如果未来在 `CheckForInternetConnectionJob` 之后新增其他前置检查 Job（如 DNS 检查、代理可用性检查等），只需挂载 `SkipIfBatchCancelled` 中间件，就能自动继承"被前置节点取消"的行为 |

#### 3.3.5 潜在的代价

这种设计也有需要注意的地方：

- **batch 取消是不可逆的**。一旦 `cancel()` 被调用，没有机制可以"恢复"被跳过的 Job。如果后续希望重试，必须重新创建整个 batch。
- **已执行 Job 的副作用不会回滚**。例如 `StartSpeedtestJob` 已经把状态改为 `Started`，这个状态会保留在数据库中直到被 `CheckForInternetConnectionJob` 的 `Failed` 覆盖——在此窗口期内，如果有外部消费者查询 Result，可能看到短暂的 `Started` 状态。
- **`SkipIfBatchCancelled` 只影响挂载了它的 Job**。如果未来新增了一个忘了挂该中间件的 Job，它在 batch 被取消后仍会执行，可能导致数据不一致。

---

## 4. 三种场景汇总对比表

| 场景 | Result 最终状态 | `SpeedtestFailed` 派发 | batch 是否取消 | 后续 Job |
|------|----------------|----------------------|---------------|---------|
| ping 成功 | `Checking` | 否 | 否 | 正常执行 |
| ping 失败 + HTTP 回退成功 | `Checking` | 否 | 否 | 正常执行 |
| ping 不可用 + HTTP 回退成功 | `Checking` | 否 | 否 | 正常执行 |
| ping 失败 + HTTP 回退失败 | `Failed` | 是 | 是 | 全部被跳过 |
| ping 不可用 + HTTP 回退失败 | `Failed` | 是 | 是 | 全部被跳过 |

从这个表格可以看出，`CheckForInternetConnectionJob` 的设计将所有"网络可达"的情况收敛到同一个出口（状态 = `Checking`，流水线继续），将所有"网络不可达"的情况收敛到另一个出口（状态 = `Failed`，流水线截断），没有留下任何模棱两可的中间态。
