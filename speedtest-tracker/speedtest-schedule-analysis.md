# ScheduledSpeedtestService 与测速 Job 调度分析

本文档基于以下代码文件进行分析：

- [ScheduledSpeedtestService.php](file:///e:/solo-code-2/speedtest-tracker/app/Services/ScheduledSpeedtestService.php)
- [CheckForScheduledSpeedtests.php](file:///e:/solo-code-2/speedtest-tracker/app/Actions/CheckForScheduledSpeedtests.php)
- [RunSpeedtest.php](file:///e:/solo-code-2/speedtest-tracker/app/Actions/Ookla/RunSpeedtest.php)
- [StartSpeedtestJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/StartSpeedtestJob.php)
- [SelectSpeedtestServerJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/SelectSpeedtestServerJob.php)
- [RunSpeedtestJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/RunSpeedtestJob.php)
- [CompleteSpeedtestJob.php](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/CompleteSpeedtestJob.php)
- [console.php](file:///e:/solo-code-2/speedtest-tracker/routes/console.php)
- [NextSpeedtestBanner.php](file:///e:/solo-code-2/speedtest-tracker/app/Livewire/NextSpeedtestBanner.php)
- [next-speedtest-banner.blade.php](file:///e:/solo-code-2/speedtest-tracker/resources/views/livewire/next-speedtest-banner.blade.php)

---

## 1. `getNextScheduledTest()` 在不同 `schedule` 配置下的返回值

```php
// app/Services/ScheduledSpeedtestService.php
public static function getNextScheduledTest(): ?Carbon
{
    $schedule = config('speedtest.schedule');

    if (blank($schedule) || $schedule === false) {
        return null;
    }

    $cronExpression = new CronExpression($schedule);

    return Carbon::parse(
        time: $cronExpression->getNextRunDate(timeZone: config('app.display_timezone'))
    );
}
```

三种场景下的返回：

| `speedtest.schedule` 配置 | 返回值 | 原因 |
|---|---|---|
| `''`（空字符串） | `null` | `blank('') === true`，命中早返回 |
| `false` | `null` | `$schedule === false` 命中，早返回 |
| 合法 cron 表达式（如 `*/5 * * * *`） | `Carbon` 实例（`display_timezone` 时区） | 通过 `CronExpression::getNextRunDate()` 计算下次运行时间 |

### 为什么这里没有直接抛异常？

`getNextScheduledTest()` 是一个 **纯查询方法**，承担的是"告诉调用方下次测速时间"的信息展示职责，而非调度职责。如果它对无效 cron 抛异常，会连带导致以下调用方在 UI 渲染时崩溃：

1. [NextSpeedtestBanner](file:///e:/solo-code-2/speedtest-tracker/app/Livewire/NextSpeedtestBanner.php#L12-L16) 组件会在每次页面渲染时通过 `#[Computed]` 调用它；
2. Blade 模板 `next-speedtest-banner.blade.php` 里通过 `$this->nextSpeedtest->timezone(...)` 继续读取结果。

一旦抛异常，整个 Dashboard Banner 会崩溃，即便用户只是没配置调度——这不符合"未配置 → 不显示 Banner"的产品语义（Blade 里已经用 `@if ($this->nextSpeedtest)` 做了空值守卫）。正确的防御性做法就是 `null` 表示"没有计划中的测速"，这和 `config/speedtest.php` 里 `'schedule' => env('SPEEDTEST_SCHEDULE', false)` 的默认值也对齐。

而真正对 cron 字符串合法性敏感的代码是调度侧的 [CheckForScheduledSpeedtests](file:///e:/solo-code-2/speedtest-tracker/app/Actions/CheckForScheduledSpeedtests.php#L30-L38)：如果 cron 不合法，`new CronExpression($schedule)` 会在构造函数阶段抛 `InvalidArgumentException`，届时 Laravel 的 schedule worker 会把异常写入日志（但不会拖垮 UI）。两处都不做 try/catch，实际上是在不同的失败级别承担不同的崩溃后果——UI 侧用 `null` 短路，调度侧用异常打断单次执行。

---

## 2. `display_timezone` 与数据库时区不一致时的差异

项目里有两个时区来源：

- `config('app.timezone')`（默认 `UTC`）：Laravel `now()`、数据库 `created_at` / `updated_at`、Queue `available_at` 用的时区。
- `config('app.display_timezone')`（默认 `UTC`）：UI 展示、Banner、`getNextScheduledTest()`、`isDue()` 用的时区。

### 2.1 UI 侧（`getNextScheduledTest`）

```php
$cronExpression->getNextRunDate(timeZone: config('app.display_timezone'))
```

得到的 `Carbon` 实例底层仍然是**同一个绝对时间戳**，只是"被解释"为 `display_timezone` 的本地时间。Blade 里又调用了一次 `->timezone(config('app.display_timezone'))->format(...)`，所以 **UI 上展示的时间在用户时区下是正确的**。

### 2.2 调度侧（`CheckForScheduledSpeedtests`）

```php
$cron->isDue(
    currentTime: now(),                              // 参数①：绝对时刻
    timeZone: config('app.display_timezone')         // 参数②：匹配基准时区
);
```

`CronExpression::isDue(currentTime, timeZone)` 的核心语义，用三句话说透：

1. **`currentTime` 是一个绝对时刻**——它描述的是"时间长河中的某一个点"，与用哪个时区字符串来描述它无关。就像"2026-05-24 10:00 UTC"和"2026-05-24 18:00 Asia/Shanghai"是同一个瞬间。
2. **`timeZone` 决定了用哪个时区的日历来观察这个绝对时刻**——把这个绝对时刻换算到 `timeZone` 时区下，得到"本地是几年几月几日几点几分"。
3. **用这组日历数字与 cron 表达式的字段逐一比对**，匹配则返回 `true`。

关键点：**`isDue` 不看 `currentTime` 内部携带的时区字符串，只看它表达的绝对时刻，然后换算到 `timeZone` 下做比对。**

#### 逐步推演：为什么 `app.timezone` 改动不影响命中点

假设当前真实时间是 **2026-05-24 10:00:00 UTC**（即 2026-05-24 18:00:00 Asia/Shanghai），cron = `0 18 * * *`（每天 18:00 上海时间），`display_timezone = Asia/Shanghai`：

```
┌─────────────────────────────────────────────────────────────────────┐
│ 场景 A：app.timezone = UTC                                          │
│   now() = Carbon("2026-05-24 10:00:00", "UTC")                      │
│       → 表达的绝对时刻：2026-05-24 10:00:00 UTC                     │
│       → 换算到 display_timezone (Asia/Shanghai)：2026-05-24 18:00:00 │
│       → 匹配 cron "0 18 * * *" → true                               │
├─────────────────────────────────────────────────────────────────────┤
│ 场景 B：app.timezone = Asia/Shanghai                                │
│   now() = Carbon("2026-05-24 18:00:00", "Asia/Shanghai")            │
│       → 表达的绝对时刻：2026-05-24 10:00:00 UTC（同一个瞬间）        │
│       → 换算到 display_timezone (Asia/Shanghai)：2026-05-24 18:00:00 │
│       → 匹配 cron "0 18 * * *" → true（同一个结果）                  │
└─────────────────────────────────────────────────────────────────────┘
```

两个场景下 `now()` 返回的 Carbon 对象内部时区字符串不同，但它们表达的**绝对时刻完全相同**，`isDue` 做的换算和比对也完全相同，返回值相同。**`app.timezone` 的改动不会让命中点偏移。**

#### 举例说明（cron = `0 2 * * *`，即"每天凌晨 2 点"）：

| `display_timezone` | 匹配的绝对时刻（UTC） | 匹配的本地时间 |
|---|---|---|
| `Asia/Shanghai` (UTC+8) | 前一天 `18:00 UTC` | `02:00 Asia/Shanghai` |
| `UTC` | 当天 `02:00 UTC` | `02:00 UTC` |

### 2.3 真正的差异点在哪里

UI 与调度**都使用 `display_timezone` 解析 cron**，所以在一般情况下"计划执行点"是一致的。差异只发生在以下场景：

**场景 A：`display_timezone` 被修改**

如果运维人员修改了 `display_timezone`（例如从 `UTC` 改成 `Asia/Shanghai`），那么：
- `isDue` 的匹配基准时区变了，cron `0 2 * * *` 从匹配"UTC 的 02:00"变成匹配"上海的 02:00"，实际触发的绝对时刻偏移了 8 小时；
- `getNextScheduledTest()` 也用同一个 `display_timezone` 计算下次运行时间，所以 **UI 显示和实际触发仍然对齐**；
- 但数据库 `results.created_at` 仍然按 `app.timezone`（UTC）写入，**这条记录相对 cron 语义上的"2:00"会差 8 小时**——这是存储时区和展示时区不一致的常见现象，不影响调度正确性。

**场景 B：`app.timezone` 被修改，`display_timezone` 不变**

如果运维人员修改了 `app.timezone`（例如从 `UTC` 改成 `Asia/Shanghai`）但保留 `display_timezone = UTC`：
- **`isDue` 的匹配完全不受影响**——见 2.2 节的逐步推演；
- **`getNextScheduledTest()` 的结果也不受影响**——`display_timezone` 没变；
- **数据库 `created_at` 的存储值变了**——Laravel 按 `app.timezone` 写入数据库。如果你用数据库里的 `created_at` 和 UI 展示的时间做比较，会出现"数据库里存的是上海时间、UI 显示成 UTC 时间"的困惑，但底层时间戳一致。

**结论**：`app.timezone` 的改动不会导致 `isDue` 匹配偏移，也不会导致 UI 和调度之间出现偏差。真正会产生偏差的是 **`display_timezone` 本身被修改**——此时 UI 显示和实际触发仍然对齐（因为两边都用 `display_timezone`），但相对旧配置的"计划时间"语义上偏移了。DST（夏令时）切换也只影响 `display_timezone` 那一侧，如果 `display_timezone` 所在时区有夏令时，cron `0 2 * * *` 在某一天可能匹配两次或一次都不匹配——这是 cron 语义本身的特性，不是配置漂移的问题。

---

## 3. "计划执行时间"与"真正执行时间"的拆分与风险

整体调度链路如下：

```
cron 表达式
   │
   ├── getNextScheduledTest() ──► UI 显示"计划执行时间"（display_timezone）
   │
   └── CheckForScheduledSpeedtests（每分钟一次，见 console.php）
            │
            │ isDue(currentTime=now(), timeZone=display_timezone)
            ▼
        RunSpeedtest::runIf(true, scheduled: true)
            │
            ▼
        Result::create(['status' => Waiting, 'scheduled' => true])
            │
            ▼
        Bus::batch([
            StartSpeedtestJob,          // 将 Result 状态置为 Started
            CheckForInternetConnectionJob,
            SkipSpeedtestJob,
            SelectSpeedtestServerJob,   // 选择 server id
            RunSpeedtestJob,            // 真正调用 speedtest CLI（timeout 120s）
            BenchmarkSpeedtestJob,
            CompleteSpeedtestJob,       // 将 Result 状态置为 Completed
        ])->dispatch();
```

### 3.1 两个时间的定义与拆分

- **计划执行时间（Planned）**：由 `CronExpression::getNextRunDate(timeZone=display_timezone)` 计算得到的**理论命中时刻**，只用于 UI 展示（[NextSpeedtestBanner](file:///e:/solo-code-2/speedtest-tracker/app/Livewire/NextSpeedtestBanner.php)）。
- **真正执行时间（Actual）**：
  1. `console.php` 的 `Schedule::everyMinute()` 触发 `CheckForScheduledSpeedtests`（这是"每分钟被问到一次"的轮询点，由 **Laravel scheduler 进程**负责）；
  2. `isDue()` 返回 `true` 的那个 minute 内，`RunSpeedtest::runIf` 被调用；
  3. `Bus::batch(...)->dispatch()` 把 7 个 Job 丢进队列，由 **queue worker 进程**消费；
  4. 其中 `RunSpeedtestJob` 有 `$timeout = 120`，是整个 batch 里最耗时的环节。

**两者的差值** ≈ 轮询粒度（≤1 分钟） + 队列积压（队列忙时可能更大） + `RunSpeedtestJob` 本身的耗时（数秒到 120 秒）。

### 3.2 重复触发与跳过触发的风险点

先把四个需要拆开的概念明确归类，避免混淆：

| 概念 | 归属层级 | 影响对象 |
|---|---|---|
| Scheduler 一分钟窗口 | Scheduler 进程 | 是否触发 batch 创建 |
| 缺失 `onOneServer()` | Scheduler 进程 | 是否创建重复 batch |
| Batch 由 `CheckForScheduledSpeedtests` 创建 | Scheduler 进程 → 队列 | batch 数量 |
| `Carbon::timezone()` 格式化 | UI 展示层 | 仅影响用户看到的时间字符串 |

以下按**责任层级**逐一展开，每个风险点只讨论一个层级的问题：

---

#### 风险点 1：Scheduler 侧缺失 `onOneServer()` → 创建重复 batch

- **责任方**：Laravel scheduler 进程
- **位置**：[console.php 第 28-31 行](file:///e:/solo-code-2/speedtest-tracker/routes/console.php#L28-L31)
- **问题**：`Schedule::everyMinute()` 每分钟触发一次 `CheckForScheduledSpeedtests::run()`，但没有加 `onOneServer()`。如果部署了多个 app 实例或多个 scheduler worker，**同一分钟内 `CheckForScheduledSpeedtests` 会被并发调用多次**。
- **后果**：每次调用都会创建一个新的 `Result` 记录 + `Bus::batch()` 一个新的 batch。同一分钟内出现多个独立的 batch，每个 batch 都会完整执行 7 个 Job，**并发跑多个 speedtest CLI 占满带宽**，测量结果被污染。
- **对比**：同一文件里的 `sqlite-vacuum` 条目加了 `onOneServer()`，说明开发者知道这个保护机制，但在测速调度上遗漏了。

---

#### 风险点 2：Scheduler 分钟窗口 + 无补偿 → 跳过触发

- **责任方**：Laravel scheduler 进程
- **位置**：[CheckForScheduledSpeedtests.php 第 30-38 行](file:///e:/solo-code-2/speedtest-tracker/app/Actions/CheckForScheduledSpeedtests.php#L30-L38)
- **问题**：`CronExpression::isDue()` 只在匹配字段的那一分钟内返回 `true`。如果 Laravel scheduler 在该分钟内没有运行（进程挂起、宿主机休眠、容器冷启动、该分钟内恰好被跳过），`isDue()` 就没被调用；下一分钟再调用时已经返回 `false` 了。**没有任何补偿或重试机制**来补跑这一次。
- **后果**：该计划周期的测速被直接跳过，UI 上 `getNextScheduledTest()` 会直接显示下一个周期的时间，用户无法察觉这次跳过。

---

#### 风险点 3：队列积压 → 执行延迟

- **责任方**：queue worker 消费能力不足
- **问题**：batch 已经被 `Bus::batch()->dispatch()` 提交到队列了，只是排在队列里等待消费。积压会导致"实际执行时间"远晚于"计划执行时间"，但 batch 最终会被消费。
- **后果**：测速执行在计划时刻之后数分钟甚至数小时才真正跑 CLI，测量数据代表的是"延迟后的时刻"的带宽，而非"计划时刻"的带宽。对于长时间队列积压，同一 cron 周期的下一次调度可能已经到了，但上一次的 batch 还在队列里——两者会顺序执行，不会并发（除非有多个 worker）。

---

#### 风险点 4：`RunSpeedtestJob` 失败后 batch cancel → 该周期测速丢失

- **责任方**：[RunSpeedtestJob.php 第 73-86 行](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/RunSpeedtestJob.php#L73-L86) 的错误处理
- **问题**：`RunSpeedtestJob` 捕获 `ProcessFailedException` 后，将 Result 标记为 `Failed`，然后调用 `$this->batch()->cancel()`。后续的 `CompleteSpeedtestJob` 因为有 `SkipIfBatchCancelled` 中间件会被直接跳过。**整个 batch 没有 retry/requeue 流程**。
- **后果**：一次网络抖动或 CLI 异常就会让该计划周期的测速停在 `Failed` 状态，不会自动重试。如果运维需要补跑，必须手动触发。

---

#### 风险点 5：DST 切换日的 cron 语义

- **责任方**：`CronExpression` 库的 `isDue()` 行为 + `display_timezone` 选择
- **问题**：如果 `display_timezone` 所在时区有夏令时（DST），cron `0 2 * * *` 在 DST 开始日可能匹配两次（本地时钟从 2:00 拨到 3:00 后又回到 2:00），或在 DST 结束日一次都不匹配。这是 cron 语义的已知特性，不是 bug。
- **后果**：一年两天的匹配异常，极少被注意到。

---

#### 风险点 6：`Carbon::timezone()` 仅影响展示

- **责任方**：[next-speedtest-banner.blade.php 第 11 行](file:///e:/solo-code-2/speedtest-tracker/resources/views/livewire/next-speedtest-banner.blade.php#L11)
- **问题**：`$this->nextSpeedtest->timezone(config('app.display_timezone'))` 只是把 Carbon 对象切换到另一个时区做字符串格式化。
- **后果**：**不影响任何调度逻辑**。如果 `display_timezone` 在 `getNextScheduledTest()` 执行完之后被动态修改（不太可能，但理论上），展示的时间字符串会和实际计算用的时区不一致。但在正常运行中，配置是静态的，这里无风险。

### 3.3 小结

- **计划时间**（CronExpression 算出来的那一刻）和**真正执行时间**（worker 实际消费 Job 的时刻）被拆在两个层：前者是"日历意义上的命中点"，后者是"scheduler 轮询 + queue worker 消费 + 批处理"的实现细节。两层分别由 **scheduler 进程**和 **queue worker 进程**负责。

- **最容易出问题的两处**：
  1. `console.php` 的 `Schedule::everyMinute()` 缺少 `onOneServer()` → **同一分钟内被多实例并发触发，创建多个重复 batch**；
  2. `isDue()` 的分钟级窗口 + 没有补偿重试 → **scheduler 一旦错过该分钟，这次测速就永久跳过**。

- **跨层级澄清（容易混淆的问题）**：
  - **queue worker 重启** → 不会导致漏触发。batch 已经由 scheduler 创建并 dispatch 到队列了，worker 重启只影响正在消费的 Job（可能中断、重试、或标记失败），不影响"是否创建了 batch"这个问题。
  - **队列积压** → 不会导致漏触发，也不会导致重复。只会导致执行延迟——batch 最终会被消费，只是"实际执行时间"远晚于"计划执行时间"。
  - **重复 batch** → 是 scheduler 侧 `CheckForScheduledSpeedtests` 被并发调用多次创建的（风险点 1），不是 queue worker 创建的。queue worker 只负责消费，不负责创建。
  - **`Carbon::timezone()` 在 Blade 中的调用** → 仅影响展示层的字符串格式化，不影响任何调度逻辑。它和风险点 1、2 完全不在同一个层级。
  - **`app.timezone` 改动** → 不影响 `isDue` 的匹配，也不影响 UI 与调度的对齐（见 2.2 节逐步推演）。
