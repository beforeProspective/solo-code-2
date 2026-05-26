# Webhook 测试通知机制分析（第四版）

本文件对 `SendWebhookTestNotification` 相关的三个问题进行源码层精确分析，
修正了前三版中关于 `download_bits`/`upload_bits` 属性性质、WebhookCallFailedEvent
事件结构、以及"失败与 payload 无关"等多个错误表述。
**本版已通过 GitHub 源码直接核实 spatie/laravel-webhook-server v3.10.0 的事件类结构。**

---

## 1. `download_bits` / `upload_bits` 到底是访问器还是数据库列？

### 1.1 源码定位

数据库迁移 [create_results_table.php](file:///e:/solo-code-2/speedtest-tracker/database/migrations/2022_08_31_202106_create_results_table.php#L18-L19)：

```php
$table->unsignedBigInteger('download')->nullable();
$table->unsignedBigInteger('upload')->nullable();
```

数据库里只有 `download` 和 `upload` 两列，**没有** `download_bits` 或 `upload_bits` 列。

这两个属性在 [ResultDataAttributes.php#L14-L18](file:///e:/solo-code-2/speedtest-tracker/app/Models/Traits/ResultDataAttributes.php#L14-L18) 中定义为 Eloquent 访问器（accessor）：

```php
protected function downloadBits(): Attribute
{
    return Attribute::make(
        get: fn (): null|int|float => ! blank($this->download) ? Bitrate::bytesToBits($this->download) : null,
    );
}

// uploadBits() 同理，见同文件 L164-L168
```

`Bitrate::bytesToBits()` 在 [Bitrate.php#L28-L36](file:///e:/solo-code-2/speedtest-tracker/app/Helpers/Bitrate.php#L28-L36)：

```php
public static function bytesToBits(int|float $bytes): int|float
{
    return round($bytes * 8);  // 1 byte = 8 bits
}
```

**结论：`download_bits` / `upload_bits` 是 Eloquent 访问器（getter），不是数据库列。**
它们的作用是把数据库里存的 bytes/s 乘以 8，转换成 bits/s。

### 1.2 数据库列 `download` / `upload` 存的是什么单位？

从 [RunSpeedtestJob.php#L90-L97](file:///e:/solo-code-2/speedtest-tracker/app/Jobs/Ookla/RunSpeedtestJob.php#L90-L97)：

```php
$this->result->update([
    'ping'     => Arr::get($output, 'ping.latency'),
    'download' => Arr::get($output, 'download.bandwidth'),  // Ookla CLI: bytes/sec
    'upload'   => Arr::get($output, 'upload.bandwidth'),    // Ookla CLI: bytes/sec
    'download_bytes' => Arr::get($output, 'download.bytes'),
    'upload_bytes'   => Arr::get($output, 'upload.bytes'),
    'data' => $output,
]);
```

Ookla speedtest CLI 的 JSON 输出中，`bandwidth` 字段单位是 **bytes per second**。
因此 `download`/`upload` 数据库列存的是 **bytes/s**。

完整的单位换算链路是：

```
数据库列 download (bytes/s)
    → 访问器 download_bits = download × 8 (bits/s)
        → Number::bitsToMagnitude(bits: download_bits, magnitude: 'mbit')
            = bits / 1,000,000 = Mbps
```

### 1.3 fakeResult 中的数值重新换算

fakeResult 在 [SpeedtestFakeResultGenerator.php#L44-L56](file:///e:/solo-code-2/speedtest-tracker/app/Services/SpeedtestFakeResultGenerator.php#L44-L56) 中硬编码了 bandwidth：

```php
'upload' => [
    'bytes'     => 124297377,
    'bandwidth' => 113750000,   // bytes/s
],
'download' => [
    'bytes'     => 230789788,
    'bandwidth' => 115625000,   // bytes/s
],
```

然后在构造函数 [L68-L108](file:///e:/solo-code-2/speedtest-tracker/app/Services/SpeedtestFakeResultGenerator.php#L68-L108) 中赋值给模型：

```php
'download' => $data['download']['bandwidth'],  // 115,625,000 bytes/s
'upload'   => $data['upload']['bandwidth'],    // 113,750,000 bytes/s
```

所以 fakeResult 中：
- `$fakeResult->download` = **115,625,000 bytes/s**
- `$fakeResult->upload` = **113,750,000 bytes/s**
- `$fakeResult->download_bits`（访问器）= 115,625,000 × 8 = **925,000,000 bits/s**
- `$fakeResult->upload_bits`（访问器）= 113,750,000 × 8 = **910,000,000 bits/s**

### 1.4 真实 listener 正确计算的值

[ProcessCompletedSpeedtest.php#L168-L169](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/ProcessCompletedSpeedtest.php#L168-L169)：

```php
'download' => Number::bitsToMagnitude(bits: $result->download_bits, precision: 0, magnitude: 'mbit'),
'upload'   => Number::bitsToMagnitude(bits: $result->upload_bits,   precision: 0, magnitude: 'mbit'),
```

以 faker 数据的数值计算：
- payload `download` = 925,000,000 / 1,000,000 = **925 Mbps**
- payload `upload` = 910,000,000 / 1,000,000 = **910 Mbps**

### 1.5 测试通知实际发送的值

[SendWebhookTestNotification.php#L41-L42](file:///e:/solo-code-2/speedtest-tracker/app/Actions/Notifications/SendWebhookTestNotification.php#L41-L42)：

```php
'download' => Number::bitsToMagnitude(bits: $fakeResult->upload,   precision: 0, magnitude: 'mbit'),
'upload'   => Number::bitsToMagnitude(bits: $fakeResult->download, precision: 0, magnitude: 'mbit'),
```

这里有 **两个独立的 bug**：

**Bug 1 — 单位错误：把 bytes/s 直接当 bits/s 用**
- `Number::bitsToMagnitude(bits: ...)` 参数名是 `bits`，意为传入值单位是 bits/s
- 但传入的 `$fakeResult->upload` = 113,750,000，实际单位是 bytes/s
- 计算：113,750,000 / 1,000,000 = 113.75 → round = **114 Mbps**
- 正确计算应是：113,750,000 × 8 / 1,000,000 = **910 Mbps**

**Bug 2 — 方向对调：download 用 upload 的值，upload 用 download 的值**
- payload `download` ← `$fakeResult->upload`（113,750,000 bytes/s）→ 显示 **114**
- payload `upload` ← `$fakeResult->download`（115,625,000 bytes/s）→ 显示 **116**

### 1.6 为什么 114 和 116 对不上

"对不上"体现在两个维度：

| 维度 | payload 显示值 | 正确值（按真实 listener 逻辑） | 差异原因 |
|------|---------------|-------------------------------|----------|
| payload `download` | 114 Mbps | 925 Mbps | ① bytes 当 bits 用，少乘了 8；② 方向对调，取了 upload 的值 |
| payload `upload` | 116 Mbps | 910 Mbps | ① bytes 当 bits 用，少乘了 8；② 方向对调，取了 download 的值 |

数值上 114 ≠ 925、116 ≠ 910，差了约 8 倍。
方向上 payload `download` 对应的是 faker 的 upload bandwidth（113,750,000），
payload `upload` 对应的是 faker 的 download bandwidth（115,625,000），语义完全相反。

**一句话总结**：测试通知中 `download=114` 实际承载的是"上传速率的 bytes 值直接当 bits 算"的结果，
与真实 listener 发送的"下载速率的 bits 值正确换算"相比，既差了 8 倍单位，又反了方向。

---

## 2. Webhook payload 字段逐项核对

### 2.1 测试通知实际发送的字段

[SendWebhookTestNotification.php#L34-L46](file:///e:/solo-code-2/speedtest-tracker/app/Actions/Notifications/SendWebhookTestNotification.php#L34-L46)：

| # | payload 键 | 值来源 | 说明 |
|---|-----------|--------|------|
| 1 | `result_id` | `Str::uuid()` | 随机 UUID，非数据库真实 ID |
| 2 | `site_name` | `__('settings/notifications.test_notifications.webhook.payload')` | 翻译文本，非 app.name |
| 3 | `server_name` | `$fakeResult->data['server']['name']` | = "Speedtest" |
| 4 | `server_id` | `$fakeResult->data['server']['id']` | = 1234 |
| 5 | `isp` | `$fakeResult->data['isp']` | = "Speedtest Communications" |
| 6 | `ping` | `round($fakeResult->ping)` | ≈ 19 |
| 7 | `download` | `Number::bitsToMagnitude(bits: $fakeResult->upload, ...)` | **取了 upload 值，单位错** |
| 8 | `upload` | `Number::bitsToMagnitude(bits: $fakeResult->download, ...)` | **取了 download 值，单位错** |
| 9 | `packet_loss` | `$fakeResult->data['packetLoss']` | = 11 |
| 10 | `speedtest_url` | `$fakeResult->data['result']['url']` | = "https://docs.speedtest-tracker.dev" |
| 11 | `url` | `url('/admin/results')` | 后台结果页 URL |

**共 11 个字段**。

### 2.2 真实 listener 实际发送的字段

[ProcessCompletedSpeedtest.php#L160-L173](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/ProcessCompletedSpeedtest.php#L160-L173)：

| # | payload 键 | 值来源 | 说明 |
|---|-----------|--------|------|
| 1 | `result_id` | `$result->id` | 数据库真实 ID |
| 2 | `site_name` | `config('app.name')` | 应用名称 |
| 3 | `server_name` | `Arr::get($result->data, 'server.name')` | 真实测速服务器名 |
| 4 | `server_id` | `Arr::get($result->data, 'server.id')` | 真实测速服务器 ID |
| 5 | `status` | `$result->status` | **测试通知没有此字段** |
| 6 | `isp` | `Arr::get($result->data, 'isp')` | 真实 ISP |
| 7 | `ping` | `round($result->ping)` | 真实 ping |
| 8 | `download` | `Number::bitsToMagnitude(bits: $result->download_bits, ...)` | 正确取 download，正确单位 |
| 9 | `upload` | `Number::bitsToMagnitude(bits: $result->upload_bits, ...)` | 正确取 upload，正确单位 |
| 10 | `packet_loss` | `Arr::get($result->data, 'packetLoss')` | 真实丢包率 |
| 11 | `speedtest_url` | `Arr::get($result->data, 'result.url')` | 真实测速结果页 |
| 12 | `url` | `url('/admin/results')` | 后台结果页 URL |

**共 12 个字段**。

### 2.3 差异对照表

| 差异类型 | 具体内容 |
|----------|----------|
| **测试通知缺少的字段** | `status` — 真实 listener 发送了 `$result->status`，测试通知没有这个键 |
| **双方都没有的字段** | `ip_address`、`server_ip`、`interface.*`（含 internal/external IP）、`mac_addr` — **IP 字段在两个实现中均未出现在 payload** |
| **键同值不同** | `result_id`（UUID vs 数字 ID）、`site_name`（翻译文本 vs app.name） |
| **取值逻辑不同** | `download`/`upload`（单位错误 + 方向对调 vs 正确换算） |

### 2.4 关于 IP 字段

虽然 `Result` 模型通过访问器 [ipAddress()](file:///e:/solo-code-2/speedtest-tracker/app/Models/Traits/ResultDataAttributes.php#L74-L78) 可以获取 `interface.externalIp`，且 faker 数据里也硬编码了 `'externalIp' => '127.0.0.1'`，**但两个 Webhook 实现都没有把 IP 地址放进 payload**。

对外 webhook 不发送用户 IP 是有意的安全设计——避免把用户的公网 IP 暴露给第三方 webhook 接收方。

---

## 3. LogWebhookFailure 与 ProcessCompletedSpeedtest 分开解析

### 3.1 两者的角色定位

这是两个完全独立、处在调用链不同位置的代码：

| | ProcessCompletedSpeedtest | LogWebhookFailure |
|---|---|---|
| **角色** | 主动发送方（producer） | 被动监听方（observer） |
| **触发时机** | 测速完成时 | 任意 webhook 派发失败时 |
| **关注点** | 业务数据 → 打包 payload → HTTP 发送 | HTTP 传输层错误 → 写日志 |
| **代码位置** | [ProcessCompletedSpeedtest.php](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/ProcessCompletedSpeedtest.php#L157-L176) | [LogWebhookFailure.php](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/LogWebhookFailure.php#L13-L20) |

ProcessCompletedSpeedtest 负责"把测速结果通过 webhook 发出去"。
LogWebhookFailure 负责"如果发出去失败了，把失败原因记下来"。

### 3.2 WebhookCallFailedEvent 事件对象的实际字段（已从 GitHub 源码核实）

本项目使用 `spatie/laravel-webhook-server` v3.10.0（见 [composer.lock#L6746](file:///e:/solo-code-2/speedtest-tracker/composer.lock#L6746)）。

该包的事件类层级如下：

```
WebhookCallEvent（abstract 基类）—— 定义了全部 12 个属性
    ├── WebhookCallFailedEvent       —— 空类，不新增任何属性
    ├── FinalWebhookCallFailedEvent  —— 空类，不新增任何属性
    └── WebhookCallSucceededEvent    —— 空类，不新增任何属性

DispatchingWebhookCallEvent（独立类，不继承 WebhookCallEvent）
```

**关键事实：`WebhookCallFailedEvent` 本身是空类**（源码：`class WebhookCallFailedEvent extends WebhookCallEvent {}`），没有定义任何新增属性。所有属性都来自抽象基类 `WebhookCallEvent`。

基类 `WebhookCallEvent` 的构造函数定义了以下 12 个公共属性（通过 PHP 8 constructor property promotion）：

| # | 属性 | 类型 | 说明 |
|---|------|------|------|
| 1 | `$httpVerb` | `string` | HTTP 方法 |
| 2 | `$webhookUrl` | `string` | 目标 URL |
| 3 | `$payload` | `array\|string` | **请求 payload（数组或 JSON 字符串）** |
| 4 | `$headers` | `array` | **完整的请求头** |
| 5 | `$meta` | `array` | 元数据（由调用方通过 `meta()` 方法设置） |
| 6 | `$tags` | `array` | 队列标签 |
| 7 | `$attempt` | `int` | 当前是第几次重试 |
| 8 | `$response` | `?Response` | 对方的 HTTP 响应对象（Guzzle Psr7 Response） |
| 9 | `$errorType` | `?string` | 错误类型（异常类名或错误分类） |
| 10 | `$errorMessage` | `?string` | 错误消息文本 |
| 11 | `$uuid` | `string` | 唯一标识 |
| 12 | `$transferStats` | `?TransferStats` | Guzzle 传输统计信息 |

需要纠正的三个错误：

1. **`WebhookCallFailedEvent` 本身没有新增字段**：`response`、`errorType`、`errorMessage` 都定义在抽象基类 `WebhookCallEvent` 中，不是在失败事件子类里。失败事件、成功事件、最终失败事件都继承这同一个基类。
2. **不是 9 个属性，是 12 个**：之前漏掉了 `$meta`、`$tags`、`$transferStats`。
3. **`$payload` 类型是 `array|string`，不是纯 `array`**：构造函数参数声明为 `public array|string $payload`，意味着它可以是数组也可以是 JSON 字符串。

**关键事实：事件对象里确实包含 `$payload` 和 `$headers`，完全可以访问到。**
前两版中"事件对象里就没有这个字段"的说法是错误的。本版已通过 GitHub 源码核实，该说法不仅错误，而且漏了 3 个属性、把继承关系也搞反了。

### 3.3 LogWebhookFailure 只记三字段——"最小化记录"的设计决策

[LogWebhookFailure.php#L13-L20](file:///e:/solo-code-2/speedtest-tracker/app/Listeners/LogWebhookFailure.php#L13-L20)：

```php
public function handle(WebhookCallFailedEvent $event): void
{
    Log::error('Webhook notification failed', [
        'url'           => $event->webhookUrl,
        'error_type'    => $event->errorType,
        'error_message' => $event->errorMessage,
    ]);
}
```

监听器从事件对象的 **12 个属性**中只挑出 **3 个**写入日志。这不是因为"拿不到"，而是**有意识的最小化选择**。

**三字段的覆盖关系：**

| 字段 | 回答的问题 | 典型值示例 |
|------|-----------|-----------|
| `url` | "哪个目标挂了？" | `https://hooks.example.com/abc` |
| `error_type` | "挂在哪一层？" | `ConnectException` / `RequestException` |
| `error_message` | "具体为什么挂？" | `cURL error 28: Operation timed out` / `401 Unauthorized` |

三者组合即可完整定位：**哪个地址、什么类型的错误、具体原因是什么**。

**为什么不记其余字段：**

| 未记录字段 | 不记的原因 |
|------------|-----------|
| `$httpVerb` | 通常都是 POST（见 [webhook-server.php#L18](file:///e:/solo-code-2/speedtest-tracker/config/webhook-server.php#L18)），所有 webhook 都一样，没有区分度 |
| `$attempt` | 对"定位哪次失败有用"，但对"为什么失败"帮助不大；如需可从队列日志另行获取 |
| `$uuid` | 同上，作为关联键有用，但不是排障必需 |
| `$response` | 原始 Response 对象无法直接写入 Laravel 日志（需要序列化），且 `error_type`/`error_message` 已从中提取了关键信息 |
| `$payload` | 见下一节详细分析 |
| `$headers` | 同上，见下一节 |

### 3.4 "失败与 payload 无关"这句话需要拆开看

前两版中写的"失败发生在 HTTP 传输层，与业务 payload 内容无关"过于绝对。实际情况需要按错误类型分层：

**第一层：纯传输/网络层错误（与 payload 确实无关）**

| 错误类型 | 典型场景 | payload 的角色 |
|----------|----------|----------------|
| `ConnectException` | DNS 解析失败、TCP 连接超时、TLS 握手失败、目标主机不可达 | **完全无关**。请求还没到目标服务器，payload 从未被发送出去 |
| `TransferException` | 请求发送后连接被对方 reset、数据传输中断 | **无关**。连接建立后中断，对方可能收到了部分数据也可能没收到，但错误原因是连接问题 |

**第二层：HTTP 协议层错误（可能与 payload 间接相关）**

| 错误类型 | 典型场景 | payload 的角色 |
|----------|----------|----------------|
| `RequestException` → 401/403 | 鉴权失败、API Token 错误 | **无关**。失败原因是权限问题，与 payload 内容无关 |
| `RequestException` → 404 | URL 路径错误 | **无关**。路径写错了，请求没到正确的处理器 |
| `RequestException` → 400 | **payload 格式/内容被对方校验拒绝** | **可能相关**。对方返回 400 的原因可能是"缺少必填字段"、"字段类型错误"、"数据格式不符合 schema"——这些直接与 payload 有关 |
| `RequestException` → 422 | **payload 内容被对方业务逻辑拒绝** | **相关**。比如对方要求 `download > 0`，但 payload 里 `download` 为 0 |
| `RequestException` → 5xx | 对方服务器内部错误 | **通常无关**。5xx 是对方的问题，但极少数情况下可能由 payload 触发对方的 bug |

**修正后的结论：**
- 对于 `ConnectException` 和 `TransferException`，payload 确实与失败原因无关。
- 对于 `RequestException` 中 400/422 这类错误，payload **可能是直接原因**，此时查看 payload 有助于排障。
- 但即使在 400/422 场景下，`error_message` 字段通常也已经包含了对方返回的错误描述（如"field 'ping' is required"），**仅凭三字段仍然可以定位问题**，只是不能说 payload "完全无关"了。

### 3.5 "最小化记录"和"事件对象有没有 payload"是两回事

这是两个独立的概念，前两版中把它们混在了一起，必须拆开：

**概念 A：事件对象有没有 payload？——有。**
- 这是 Spatie 包的类结构决定的，是客观事实。
- `$event->payload` 可以直接访问到完整的请求数据。

**概念 B：LogWebhookFailure 要不要把 payload 写进日志？——不要（默认设计决策）。**
- 这是代码作者的选择，不是被客观限制所迫。
- 选择不写的理由包括：
  1. **大多数失败场景下 payload 不提供额外信息**：对于占多数的网络层错误（DNS、连接超时），payload 无助于定位。
  2. **400/422 场景下 `error_message` 已包含对方的错误描述**：通常足以判断"哪个字段有问题"，不需要看完整 payload。
  3. **payload 可能含敏感信息**：虽然不是决定性理由（因为如果真需要排障，敏感信息也可以脱敏），但确实是一个考量因素。
  4. **日志最小化原则**：默认只记排障必需的字段，避免日志膨胀。需要调试时可以通过其他途径（Guzzle 日志中间件、临时修改监听器）获取完整 payload。

**为什么这两者不能混着讲：**

如果用"事件对象里没有 payload"来解释"为什么不记 payload"，会产生两个误导：
1. 读者会以为 Spatie 包不提供 payload 访问——这是事实错误。
2. 读者会以为"如果有 payload 就该记"——这是逻辑错误。有不等于该记，这是设计决策，不是客观限制。

正确的表述应该是：**事件对象里有 payload，但监听器选择不记它，因为大多数排障场景不需要，且保持日志最小化是更好的实践。**

### 3.6 小结

LogWebhookFailure 的三字段设计是 **"够用就好"** 的最小化策略：
- `url` 定位目标
- `error_type` 归类错误层级
- `error_message` 给出具体原因

三个关键修正：
1. **事件对象确实有 `$payload` 和 `$headers`**，不是拿不到，而是选择不记。
2. **"失败与 payload 无关"不绝对**：纯网络层错误确实无关，但 400/422 这类协议层错误可能直接由 payload 触发。
3. **"最小化记录"和"事件对象有没有某字段"是两个独立概念**，不能混为一谈。

---

## 总结

| 问题 | 核心结论 |
|------|----------|
| `download_bits`/`upload_bits` 是什么 | Eloquent 访问器，不是数据库列。把 `download`/`upload` 列存的 bytes/s × 8 转成 bits/s。测试通知绕过访问器直接用 bytes/s 当 bits/s，再加上方向对调，导致值差 8 倍且语义颠倒。 |
| payload 字段差异 | 测试通知缺少 `status` 字段；两个实现都不发送 IP 地址（安全设计）；`download`/`upload` 取值和单位均不同。 |
| 失败日志为何只记三字段 | 这是有意识的最小化设计决策，不是客观限制。事件对象确实有 `$payload` 和 `$headers`，但监听器选择不记。"失败与 payload 无关"只对纯网络层错误成立；400/422 错误可能直接由 payload 触发，但 `error_message` 通常已包含足够信息。日志最小化是设计选择，与事件对象提供了多少字段是两回事。 |
