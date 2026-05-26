# Scheduled Speedtest 行为分析

本文针对三个问题对项目中的调度入口、时区影响以及 `scheduled` 标记的连锁反应进行源码级分析。

## 问题 1：当 `SPEEDTEST_SCHEDULE` 为空或 `false` 时两个入口的返回值

涉及两处调用链：

- 前台展示：`App\Livewire\NextSpeedtestBanner` → `App\Services\ScheduledSpeedtestService::getNextScheduledTest()`
- 定时触发：`routes/console.php` → `App\Actions\CheckForScheduledSpeedtests::handle()`

### 1.1 NextSpeedtestBanner 返回 `null`

`ScheduledSpeedtestService::getNextScheduledTest()` 实现（见 [ScheduledSpeedtestService.php](file:///E:/solo-code-2/speedtest-tracker/app/Services/ScheduledSpeedtestService.php#L15-L28)）：

```php
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

方法签名就是 `?Carbon`，当 `blank($schedule) || $schedule === false` 为真时直接 `return null`。这是一个“读”服务，用于 Banner 组件渲染，没有副作用，用 `null` 告诉上层“下一次没有计划”，是合理的返回值语义。Banner 视图在拿到 `null` 时会隐藏或展示“未配置调度”的文案。

### 1.2 CheckForScheduledSpeedtests 直接 `return`（不抛异常）

`CheckForScheduledSpeedtests::handle()` 实现（见 [CheckForScheduledSpeedtests.php](file:///E:/solo-code-2/speedtest-tracker/app/Actions/CheckForScheduledSpeedtests.php#L13-L25)）：

```php
public function handle(): void
{
    $schedule = config('speedtest.schedule');

    if (blank($schedule) || $schedule === false) {
        return;
    }

    RunSpeedtest::runIf(
        $this->isSpeedtestDue(schedule: $schedule),
        scheduled: true,
    );
}
```

它被注册在 [console.php](file:///E:/solo-code-2/speedtest-tracker/routes/console.php#L28-L31)：

```php
Schedule::everyMinute()
    ->group(function () {
        Schedule::call(fn () => CheckForScheduledSpeedtests::run());
    });
```

这个 Action 是一个“每一分钟都会被调度器执行一次”的后台作业，它的职责是：**如果配置了 cron 并且到点就触发测速，否则什么都不做**。配置为空或 `false` 在本项目的语义里是“用户不想使用定时测速”，属于一个合法的、预期内的状态，不是错误。

如果把它改成抛异常：

1. 每次调度器运行都会在日志里留一个异常记录，污染告警通道。
2. Laravel 的 `Schedule::call` 在闭包内抛异常只会结束当前这次调用，但会导致整条链路被视为“执行失败”，影响运维判断。
3. 新用户未配置 `SPEEDTEST_SCHEDULE` 会立即进入错误状态，破坏“开箱即用”的体验。

因此：**Banner 侧用 `null` 表示“没有下一次计划”，Action 侧用 `return` 表示“本次无需执行”，两者在语义上是对称的**——都把“未配置调度”视为正常情况，而不是异常。二者的差异只体现在返回值的形态上：一个有调用方（Livewire 组件）需要消费数据，所以返回 `null`；另一个是“一次性命令”，没有返回值被使用，所以直接结束。

---

## 问题 2：`display_timezone` 与服务器默认时区不一致的影响

### 2.1 下一次执行时间的时区归属

`ScheduledSpeedtestService::getNextScheduledTest()` 使用：

```php
$cronExpression->getNextRunDate(timeZone: config('app.display_timezone'))
```

所以 Banner 上展示的“下次测速时间”**完全由 `config('app.display_timezone')` 决定**。服务器自身的 `date.timezone` 或 `config('app.timezone')` 在这里不参与计算。

### 2.2 `isDue` 判断的时区归属

`CheckForScheduledSpeedtests::isSpeedtestDue()` 实现（见 [CheckForScheduledSpeedtests.php](file:///E:/solo-code-2/speedtest-tracker/app/Actions/CheckForScheduledSpeedtests.php#L30-L38)）：

```php
private function isSpeedtestDue(string $schedule): bool
{
    $cron = new CronExpression($schedule);

    return $cron->isDue(
        currentTime: now(),
        timeZone: config('app.display_timezone')
    );
}
```

`CronExpression::isDue()` 的签名为：

```php
public function isDue($currentTime = 'now', $timeZone = null): bool
```

- `currentTime: now()` —— `now()` 在 Laravel 里使用 `config('app.timezone')` 生成 `Carbon` 实例（注意是 `app.timezone`，不是 `app.display_timezone`）。
- `timeZone: config('app.display_timezone')` —— 传给 `CronExpression`，它会把 cron 表达式的“下一次运行时间”解读为这个时区，然后再与 `currentTime` 比较。

`dragonmantank/cron-expression` 内部会把 `currentTime` 转换到 `timeZone` 再比较。所以：

- **实际生效的时区 = `config('app.display_timezone')`**
- `config('app.timezone')` 只影响 `now()` 的构造，比较时会被转换，不会改变结果。
- 服务器系统时区仅通过 PHP 的 `date.timezone` 间接影响 `now()`，同样在比较时会被转换。

因此 `isDue` 的判断逻辑最终只受 `display_timezone` 决定，与 Banner 计算使用同一时区，二者是一致的。

### 2.3 不一致时 Banner 展示与实际触发的感知差异

Banner 的“下一次执行时间”和“是否到点”判断都使用 `display_timezone`，所以在这个层面二者永远一致。真正的感知差异发生在：

1. **用户界面展示**：用户看到的时间是 `display_timezone` 下的绝对时间（例如 `2026-05-25 14:00:00 Asia/Shanghai`），用户会以为“服务器会在本地时间 14:00 跑”。这一点是符合预期的。

2. **调度器层面**：`Schedule::everyMinute()` 在 Laravel 调度器内部使用的是 `app.timezone`。即使 `isDue` 判断用的是 `display_timezone`，**调度器本身每分钟触发一次的“那一分钟”是按 `app.timezone` 在走**。如果两个时区相差几个小时，而 `app.timezone` 比 `display_timezone` 晚，那么当 `display_timezone` 到点时，`app.timezone` 可能还没到“那一分钟”，导致这次执行被推迟到下一个调度循环。反之可能提前。所以：

   - Banner 显示的“下一次”时间是按 `display_timezone` 计算的理想时间。
   - 实际任务被触发的那一刻是“调度器下一次每分钟 tick 的时刻 + isDue 在该时刻为真”，这两个时间在跨时区情况下可能出现最多约 1 分钟的漂移。

3. **Result 的时间戳**：`Result::create()` 后 `created_at` 使用 Laravel 默认时区（`app.timezone`）入库，再被 `Carbon::parse` 时会被转换。最终用户看界面时，`display_timezone` 会被用于展示，但数据库里存的是 UTC 或 `app.timezone`。这会出现“显示是 14:00，但按服务器视角其实是 06:00”的错位。

结论：**展示与实际判断使用同一时区，保证了“应触发时一定触发”；但调度器的 tick 频率和入库时间戳由 `app.timezone` 决定，这是唯一可能产生漂移的地方**。建议部署时让 `app.timezone` 与 `app.display_timezone` 保持一致，或者都设为 UTC，统一由前端进行时区展示。

---

## 问题 3：`scheduled = true` 对后续监听器与数据管道的影响

### 3.1 创建 Result 时 `scheduled` 的写入

在 [RunSpeedtest.php (Ookla)](file:///E:/solo-code-2/speedtest-tracker/app/Actions/Ookla/RunSpeedtest.php#L26-L34)：

```php
public function handle(bool $scheduled = false, ?int $serverId = null, ?int $dispatchedBy = null): mixed
{
    $result = Result::create([
        'data->server->id' => $serverId,
        'service' => ResultService::Ookla,
        'status' => ResultStatus::Waiting,
        'scheduled' => $scheduled,
        'dispatched_by' => $dispatchedBy,
    ]);
    ...
}
```

Librespeed 版本同理（见 [Librespeed/RunSpeedtest.php](file:///E:/solo-code-2/speedtest-tracker/app/Actions/Librespeed/RunSpeedtest.php#L16-L24)），参数名是 `$isScheduled`，落库字段也是 `scheduled`。

### 3.2 监听器如何消费 `scheduled`

Result 模型通过 `unscheduled` 访问器（[Result.php](file:///E:/solo-code-2/speedtest-tracker/app/Models/Result.php#L60-L65)）暴露反向语义：

```php
protected function unscheduled(): Attribute
{
    get: fn (): bool => ! $this->scheduled,
}
```

所有相关监听器都基于 `$result->unscheduled` 进行短路：

| 监听器 | 判断位置 | 影响 |
| --- | --- | --- |
| [ProcessCompletedSpeedtest](file:///E:/solo-code-2/speedtest-tracker/app/Listeners/ProcessCompletedSpeedtest.php#L38-L41) | `if ($result->unscheduled) return;` | 未触发则不会发送 Apprise / 数据库通知 / 邮件 / Webhook 完成通知 |
| [ProcessUnhealthySpeedtest](file:///E:/solo-code-2/speedtest-tracker/app/Listeners/ProcessUnhealthySpeedtest.php#L36-L39) | `if ($result->unscheduled) return;` | 阈值告警通知被抑制 |
| [ProcessFailedSpeedtest](file:///E:/solo-code-2/speedtest-tracker/app/Listeners/ProcessFailedSpeedtest.php#L17-L20) | `if ($result->unscheduled) return;` | 失败通知预留逻辑被抑制 |
| [UserNotificationSubscriber::handleBenchmarkFailed](file:///E:/solo-code-2/speedtest-tracker/app/Listeners/UserNotificationSubscriber.php#L49-L52) | `if ($result->unscheduled) return;` | 针对 `dispatched_by` 用户的阈值告警被抑制 |

此外在 Job 里还有两处业务分支：

- [SkipSpeedtestJob](file:///E:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/SkipSpeedtestJob.php#L43-L45)：`if ($this->result->scheduled === false || empty(config('speedtest.preflight.skip_ips'))) { return; }` —— 非定时测速不做 skip IP 预检。
- [SelectSpeedtestServerJob](file:///E:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/SelectSpeedtestServerJob.php#L47-L48)：只有 `scheduled && servers 非空` 时才按配置的服务器列表筛选。

### 3.3 数据管道里的 `scheduled` 标签

- Prometheus：[PrometheusMetricsService::buildLabels](file:///E:/solo-code-2/speedtest-tracker/app/Services/PrometheusMetricsService.php#L139-L152) 将 `scheduled` 作为 label 输出（`'scheduled' => $result->scheduled ? 'true' : 'false'`）。
- InfluxDB：[BuildPointData](file:///E:/solo-code-2/speedtest-tracker/app/Actions/Influxdb/v2/BuildPointData.php#L34) 以 tag 形式写入 `scheduled`。
- REST API：[ResultResource](file:///E:/solo-code-2/speedtest-tracker/app/Http/Resources/V1/ResultResource.php#L36)、[V0 GetLatestController](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V0/GetLatestController.php#L40) 都会返回 `scheduled` 字段；[ResultsController](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L49) 提供 `filter[scheduled]` 精确过滤。
- 管理界面：[ResultTable](file:///E:/solo-code-2/speedtest-tracker/app/Filament/Resources/Results/Tables/ResultTable.php#L115-L116) 的 `IconColumn` 展示定时标记，[ResultForm](file:///E:/solo-code-2/speedtest-tracker/app/Filament/Resources/Results/Schemas/ResultForm.php#L124-L125) 允许修改，[ResultExporter](file:///E:/solo-code-2/speedtest-tracker/app/Filament/Exports/ResultExporter.php#L28) 导出为 "Yes/No"。

### 3.4 如果把默认值改掉的连锁偏差

当前 `CheckForScheduledSpeedtests` 里明确写了 `scheduled: true`，这是“定时任务生成的 Result”唯一被标记为 scheduled 的关键入口。假设把它改成 `false` 或完全删掉（即让 `RunSpeedtest::handle` 的默认值 `false` 生效），会出现如下偏差：

1. **通知链路完全失效**
   - `ProcessCompletedSpeedtest` 等监听器因 `unscheduled === true` 直接 `return`。定时测速完成后用户将收不到任何 Apprise / 邮件 / Webhook 通知，告警静默。阈值突破也不会触发告警。
   - 手动点击触发的测速本就应该走 `scheduled: false`，用来和定时测速做区分。把默认值改掉会让两类测速在监听器里表现一致，无法再“只在定时测速时通知”。

2. **Prometheus 指标语义污染**
   - 所有 Result 的 `scheduled` label 都会是 `"false"`。如果监控大盘里有按 `scheduled="true"` 聚合的面板（比如专门统计定时测速的成功率、平均延迟），曲线会归零或消失。
   - 告警规则里如果用 `scheduled="true"` 作为“仅对定时任务报警”的过滤条件，也会随之沉默。

3. **InfluxDB 数据无法区分**
   - 定时测速与手动测速的 tag 无法区分，历史查询、仪表盘、长期趋势分析都失去“按触发来源分组”的能力。
   - 如果已有历史数据里有 `scheduled=true`，修改后变成 `false`，会在图表上出现断崖式的系列切换。

4. **REST API / 管理界面统计错误**
   - 用户用 `filter[scheduled]=true` 查不到任何数据，`filter[scheduled]=false` 查出全部数据，分页与统计口径会被颠覆。
   - 管理界面的 `TernaryFilter::make('scheduled')` 在切换到“只看定时测速”时显示 0 条结果，运维与产品侧会误认为调度器失效。
   - `LatestResultStats` / 各类 Widget 若依赖 `scheduled` 筛选，展示也会出现偏差。

5. **Job 内部逻辑被绕过**
   - `SkipSpeedtestJob` 在 `scheduled === false` 时直接跳过预检，不再按 `speedtest.preflight.skip_ips` 做白名单校验。
   - `SelectSpeedtestServerJob` 不再按 `speedtest.servers` 从固定列表选择服务器，测速目标变得随机，对比同服务器跨时间的性能数据时会失准。

6. **反向影响：把默认值改成 `true`**
   - 手动点击触发的测速会被当成 scheduled，导致通知泛滥；原本只在“自动任务”时通知的规则也会在“手动测试”时触发，邮件/Webhook 风暴。
   - Prometheus / InfluxDB 里 `scheduled=true` 的占比异常升高，下游报表误导为“自动化覆盖率 100%”。

### 3.5 小结

`scheduled` 标记是整个“定时测速 vs 手动测速”语义分界线的单一数据源：监听器、通知、Prometheus、InfluxDB、API 过滤、管理界面、甚至 Job 内部分支都依赖它。把默认值改掉相当于切断了这条语义链，造成：

- 通知层面：要么静默（改 `false`）要么风暴（改 `true`）。
- 指标层面：聚合口径错乱，历史可比性丧失。
- 运维层面：过滤与统计失效，排障链路被误导。
- Job 层面：预检与服务器选择的行为翻转。

因此 `CheckForScheduledSpeedtests` 必须显式传 `scheduled: true`，而 `RunSpeedtest::handle` 的默认值 `false` 保留给 API/前端手动触发的路径，二者缺一不可。

---

## 附录：关键文件索引

- 调度入口：[CheckForScheduledSpeedtests.php](file:///E:/solo-code-2/speedtest-tracker/app/Actions/CheckForScheduledSpeedtests.php)
- 定时调度：[console.php](file:///E:/solo-code-2/speedtest-tracker/routes/console.php)
- Banner 服务：[ScheduledSpeedtestService.php](file:///E:/solo-code-2/speedtest-tracker/app/Services/ScheduledSpeedtestService.php)
- Banner 组件：[NextSpeedtestBanner.php](file:///E:/solo-code-2/speedtest-tracker/app/Livewire/NextSpeedtestBanner.php)
- 测速执行（Ookla）：[RunSpeedtest.php](file:///E:/solo-code-2/speedtest-tracker/app/Actions/Ookla/RunSpeedtest.php)
- 测速执行（Librespeed）：[RunSpeedtest.php](file:///E:/solo-code-2/speedtest-tracker/app/Actions/Librespeed/RunSpeedtest.php)
- Result 模型：[Result.php](file:///E:/solo-code-2/speedtest-tracker/app/Models/Result.php)
- 通知监听器：[ProcessCompletedSpeedtest.php](file:///E:/solo-code-2/speedtest-tracker/app/Listeners/ProcessCompletedSpeedtest.php)、[ProcessUnhealthySpeedtest.php](file:///E:/solo-code-2/speedtest-tracker/app/Listeners/ProcessUnhealthySpeedtest.php)、[ProcessFailedSpeedtest.php](file:///E:/solo-code-2/speedtest-tracker/app/Listeners/ProcessFailedSpeedtest.php)、[UserNotificationSubscriber.php](file:///E:/solo-code-2/speedtest-tracker/app/Listeners/UserNotificationSubscriber.php)
- Prometheus：[PrometheusMetricsService.php](file:///E:/solo-code-2/speedtest-tracker/app/Services/PrometheusMetricsService.php)
- InfluxDB：[BuildPointData.php](file:///E:/solo-code-2/speedtest-tracker/app/Actions/Influxdb/v2/BuildPointData.php)
- 配置文件：[speedtest.php](file:///E:/solo-code-2/speedtest-tracker/config/speedtest.php)
