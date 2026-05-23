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

`getNextScheduledTest()` 是一个 **纯查询方法**，承担的是“告诉调用方下次测速时间”的信息展示职责，而非调度职责。如果它对无效 cron 抛异常，会连带导致以下调用方在 UI 渲染时崩溃：

1. [NextSpeedtestBanner](file:///e:/solo-code-2/speedtest-tracker/app/Livewire/NextSpeedtestBanner.php#L12-L16) 组件会在每次页面渲染时通过 `#[Computed]` 调用它；
2. Blade 模板 `next-speedtest-banner.blade.php` 里通过 `$this->nextSpeedtest->timezone(...)` 继续读取结果。

一旦抛异常，整个 Dashboard Banner 会崩溃，即便用户只是没配置调度——这不符合“未配置 → 不显示 Banner”的产品语义（Blade 里已经用 `@if ($this->nextSpeedtest)` 做了空值守卫）。正确的防御性做法就是 `null` 表示“没有计划中的测速”，这和 `config/speedtest.php` 里 `'schedule' => env('SPEEDTEST_SCHEDULE', false)` 的默认值也对齐。

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

得到的 `Carbon` 实例底层仍然是**同一个绝对时间戳**，只是“被解释”为 `display_timezone` 的本地时间。Blade 里又调用了一次 `->timezone(config('app.display_timezone'))->format(...)`，所以 **UI 上展示的时间在用户时区下是正确的**。

### 2.2 调度侧（`CheckForScheduledSpeedtests`）

```php
$cron->isDue(
    currentTime: now(),           // 用的是 app.timezone，一般是 UTC
    timeZone: config('app.display_timezone')
);
```

`CronExpression::isDue()` 的语义是：把 `currentTime`（一个带时区的时间点）转换到 `timeZone` 参数指定的时区下，再判断是否匹配 cron 的“字段”。所以**实际匹配使用的是 `display_timezone` 的本地日历时间**，并非 UTC。

例如 cron 是 `0 2 * * *`（凌晨 2 点）：

- 若 `display_timezone = Asia/Shanghai`（UTC+8），那么 `isDue` 会在 UTC 的 `18:00` 前一分钟内返回 `true`；
- 若 `display_timezone = UTC`，则会在 UTC 的 `02:00` 前一分钟内返回 `true`。

### 2.3 真正的差异点在哪里

UI 与调度**都使用 `display_timezone` 解析 cron**，所以在一般情况下“计划执行点”是一致的。差异发生在**存储与展示**这一对：

- 数据库 `results.created_at` 使用 `app.timezone`（通常 UTC）写入；
- UI 展示时按 `display_timezone` 格式化。

这本身是 Laravel 的常规做法，不会触发错跑。但一旦出现 **配置漂移**（如 `app.timezone` 被改成非 UTC、`display_timezone` 却没同步修改）：

1. `now()` 返回的时间点不变，但相对 `display_timezone` 的偏移变了，`isDue` 的计算会整体偏移 `Δ(offset)` 小时；
2. UI 看到的“下次运行时间”仍然按 `display_timezone` 显示本地时间，**但调度器命中的实际时间和 UI 显示之间会相差 `Δ(offset)` 小时**；
3. 数据库保存的 `created_at` 也会与 UI 上格式化的值相差 `Δ(offset)` 小时（只要你比较的是同一时刻的不同时区字符串，底层时间戳还是同一个）。

**结论**：只要 `display_timezone` 在 UI 与调度侧保持一致、`app.timezone` 保持 UTC 不动，UI 和调度不会出现偏差。**真正会出现偏差的场景是运维人员修改了 `app.timezone` 而忘了 `display_timezone`，或者反过来**。此时 UI 显示“2:00 AM 上海时间”但任务会在“10:00 AM 上海时间”执行，或者干脆连续触发/漏触发。

---

## 3. “计划执行时间”与“真正执行时间”的拆分与风险

整体调度链路如下：

```
cron 表达式
   │
   ├── getNextScheduledTest() ──► UI 显示“计划执行时间”（display_timezone）
   │
   └── CheckForScheduledSpeedtests（每分钟一次，见 console.php）
            │
            │ isDue(currentTime=now(app.timezone), timeZone=display_timezone)
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

- **计划执行时间（Planned）**：由 `CronExpression::getNextRunDate(timeZone=display_timezone)` 计算得到的**理论命中时刻**，只用于 UI 展示（[NextSpeedtestBanner](file:///e:/solo-code-2/speedtest-tracker/app/Livewire/NextSpeedtestBanner.php)）和后续人类可读的 `isDue()` 判断。
- **真正执行时间（Actual）**：
  1. `console.php` 的 `Schedule::everyMinute()` 触发 `CheckForScheduledSpeedtests`（这是“每分钟被问到一次”的轮询点）；
  2. `isDue()` 返回 `true` 的那个 minute 内，`RunSpeedtest::runIf` 被调用；
  3. `Bus::batch(...)->dispatch()` 把 7 个 Job 丢进队列，Job 按队列顺序串行推进；
  4. 其中 `RunSpeedtestJob` 有 `$timeout = 120`，是整个 batch 里最耗时的环节。

**两者的差值** ≈ 轮询粒度（≤1 分钟） + 队列积压（队列忙时可能更大） + `RunSpeedtestJob` 本身的耗时（数秒到 120 秒）。

### 3.2 重复触发与跳过触发的风险点

| 风险点 | 类型 | 说明 |
|---|---|---|
| `CheckForScheduledSpeedtests` 每分钟被调度一次 | 跳过/重复 | `Schedule::everyMinute()` **没有加 `onOneServer()`**，如果跑了多个 scheduler worker / 多个 app 实例，**同一分钟内 `isDue()` 会被执行多次**，`RunSpeedtest` 可能被重复 `runIf`，每次都会 `Result::create()` 一个新记录，造成并发重复触发。而其他条目（`sqlite-vacuum`）是有 `onOneServer()` 保护的，这里缺失了。 |
| `isDue()` 的判定粒度是 minute | 跳过 | `CronExpression::isDue()` 只在匹配字段的那一分钟内返回 `true`。如果 Laravel scheduler 在某一分钟因为进程挂起、宿主机休眠、队列 worker 重启而没执行，那么**这个时间窗口内的测速就被直接跳过**，不会补偿。这是 cron 语义本身的局限，也是“拆开计划和执行”必然要接受的代价。 |
| `isDue()` 使用“now + display_timezone”匹配 | 重复/跳过 | 若 `app.timezone` 与 `display_timezone` 不一致，且 cron 字段用的是本地时间（如 `0 2 * * *`），那么 `now()`（UTC）被解释到 `display_timezone` 的本地日期上时，可能跨 DST 导致**某个小时内 `isDue()` 返回两次**（重复）或**一次都不返回**（跳过）。 |
| Batch cancel 之后未重试 | 跳过 | `RunSpeedtestJob` 失败后会 `$this->batch()->cancel()`，后续 `CompleteSpeedtestJob` 的 `SkipIfBatchCancelled` 中间件会直接跳过它，结果状态停在 `Failed`，**不会进入任何 retry/requeue 流程**。一次网络抖动就可能让该计划周期的测速“丢失”。 |
| `RunSpeedtest::handle()` 没有去重锁 | 重复 | 即便 `isDue()` 只返回 true 一次，但若队列里存在积压，多个同名 batch 可能在短时间内被连续消费，彼此独立地跑 `speedtest` CLI，**带宽被并发占满**，测量结果也会被污染。代码里并未在 `results` 表上用 `scheduled=true + status in (Waiting, Started, Running)` 做互斥检查。 |
| `getNextScheduledTest()` 返回的 `Carbon` 在 Blade 里再次 `->timezone(...)` | 展示差异 | 如果 Banner 里 `->timezone(config('app.display_timezone'))` 传入的时区字符串和 `getNextScheduledTest()` 里传入的不是同一个配置 key（或运行中被改过），展示时间会再偏移一次。当前代码一致使用 `app.display_timezone`，风险较低。 |

### 3.3 小结

- **计划时间**（CronExpression 算出来的那一刻）和**真正执行时间**（worker 实际消费 Job 的时刻）被拆在两个层：前者是“日历意义上的命中点”，后者是“轮询 + 队列 + 批处理”的实现细节。
- 最容易出问题的两处是：
  1. `console.php` 的 `Schedule::everyMinute()` 缺少 `onOneServer()`（**重复触发**）；
  2. `isDue()` 的分钟级窗口 + 没有补偿重试（**跳过触发**）。
- 时区不一致的风险不是“算错时间”，而是**偏移导致的多算/漏算一次**；这在夏令时切换日或跨时区部署时最隐蔽。
