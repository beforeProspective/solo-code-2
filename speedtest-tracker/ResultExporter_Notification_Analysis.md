# ResultExporter 与 UserNotificationSubscriber 深度分析

---

## 1. generateDataColumns 的列决策机制与空列风险

### 核心机制

[ResultExporter.php#L40-L60](file:///E:/solo-code-2/speedtest-tracker/app/Filament/Exports/ResultExporter.php#L40-L60) 中 `generateDataColumns()` 的执行流程：

```php
$sample = Result::query()->whereNotNull('data')->first()?->data ?? [];
$flattened = self::flatten($sample);
```

**列清单的唯一依据是数据库中第一条 `data` 不为 null 的结果。** 具体来说：

1. 通过 `whereNotNull('data')->first()` 获取第一条有数据的结果行，取其 `data` JSON 字段作为"模板"。
2. 调用 `flatten()` 将该模板递归拍平，生成所有列名（如 `download_latency_jitter`、`server_name` 等）。
3. 遍历这些列名，为每个列创建 `ExportColumn`，其 `state` 回调在导出每一行时，再次对该行的 `data` 做 `flatten()`，然后用 `$flattened[$key] ?? null` 取值。

### 当结构不一致时的后果

| 场景 | 第一条有 data 的结果 | 后续某条结果 | 导出行为 |
|---|---|---|---|
| 第一条数据结构更完整 | `{a: 1, b: {c: 2, d: 3}}` → 列: `a`, `b_c`, `b_d` | `{a: 4, b: {c: 5}}` | `b_d` 列为空 |
| 第一条数据结构不完整 | `{a: 1, b: {c: 2}}` → 列: `a`, `b_c` | `{a: 4, b: {c: 5, d: 6}}` | `b_d` 列**不会被导出**，该数据丢失 |
| 第一条是失败结果（结构极简） | `{message: "timeout"}` → 列: `message` | `{download: ..., upload: ..., ping: ...}` | 所有测速指标列全部丢失，仅导出 `message` |

**可能为空的列：凡是第一条模板中存在、但后续行的 `data` 中不存在（或路径结构不同）的字段，对应的导出列均为空。** 典型例子包括：

- 第一条结果包含完整的 `download.latency.jitter/high/low/iqm`，后续某条结果的 `download` 对象缺少 `iqm` 字段 → `download_latency_iqm` 列为空
- 第一条结果的 `server` 包含 `country`，后续结果的 `server` 中没有 `country` → `server_country` 列为空
- 第一条结果是 Ookla 测速（含 `interface.externalIp`），后续是 iPerf3 测速（结构完全不同）→ 大量列错位为空

### 设计缺陷

此机制本质上是"**第一条先行**（first-wins schema）"模式，存在两个问题：

1. **脆弱性**：第一条记录的偶然结构决定了所有后续行的导出格式。如果该第一条是异常数据（如失败结果、部分写入的结果），整个导出就会丢失关键字段。
2. **单向性**：只能"列有余而行不足"（空列），无法"行有余而列不足"（新字段无法体现）。后续行多出的字段无法被纳入导出。

---

## 2. 三种事件的通知业务边界

### 三种事件的过滤条件对比

| 事件 | 处理方法 | `dispatched_by` 检查 | `unscheduled` 检查 |
|---|---|---|---|
| `SpeedtestCompleted` | `handleCompleted` | ✅ 有（为空则跳过） | ❌ 无 |
| `SpeedtestFailed` | `handleFailed` | ✅ 有（为空则跳过） | ❌ 无 |
| `SpeedtestBenchmarkUnhealthy` | `handleBenchmarkFailed` | ✅ 有（为空则跳过） | ✅ 有（unscheduled 则跳过） |

### 为什么 `handleBenchmarkFailed` 多了一层 `unscheduled` 过滤

三种事件的业务语义完全不同：

- **`SpeedtestCompleted`** — 测速**成功完成**。这是一次操作的自然终点。无论这次操作是用户手动触发（unscheduled）还是系统定时调度（scheduled），触发者都有权收到结果通知。手动触发的用户尤其期待这个通知，因为他们主动发起了操作。
- **`SpeedtestFailed`** — 测速**执行失败**（如网络断开、超时）。与 Completed 同理，失败也是操作的终点，触发者需要被通知。手动触发的用户尤其需要知道"我发起的测试失败了"。
- **`SpeedtestBenchmarkUnhealthy`** — 测速**成功完成但指标不健康**（如下载速度低于阈值、ping 过高）。这不是"操作完成"事件，而是"质量告警"事件。**手动触发的测速通常由用户在现场观察**，他们能直接看到结果，不需要一条数据库通知来提醒自己"测速不健康"——他们自己就能判断。而**定时调度的测速是后台静默执行的**，用户不在场，需要通过通知来关注异常。

### 三种事件的业务边界

| 边界维度 | Completed | Failed | Benchmark Unhealthy |
|---|---|---|---|
| 业务语义 | 操作完成 | 操作失败 | 质量告警 |
| 触发时机 | 测速成功 | 测速失败 | 测速成功但不达标 |
| 通知对象 | 发起操作的用户 | 发起操作的用户 | **仅发起定时任务的用户** |
| 手动测速是否通知 | ✅ 是 | ✅ 是 | ❌ 否 |
| 定时测速是否通知 | ✅ 是 | ✅ 是 | ✅ 是 |

**`dispatched_by` 是所有通知的前置门控**：防止对没有明确用户归属的结果（如系统级 cron 任务的最早记录）发送空通知。`unscheduled` 则是 Benchmark 事件的**二级门控**，它定义了"质量告警"的业务边界——只有定时任务的异常才需要推送告警，手动操作的异常由用户自行发现。

---

## 3. ResultDataAttributes 访问器与 flatten 列名的对应关系

### 两套并行的数据访问路径

`Result` 模型上存在两套完全独立的数据访问机制：

1. **Eloquent Attribute Accessors**（`ResultDataAttributes` trait）：通过 `$result->downloadBits`、`$result->serverName` 等方法名访问，使用 `Arr::get($this->data, '路径')` 从 JSON `data` 字段提取值。
2. **ResultExporter::flatten()**：递归遍历 `data` 数组，将嵌套键用 `_` 连接成扁平字符串（如 `server.name` → `server_name`）。

**ResultExporter 完全不使用访问器**，它只调用 `flatten($r->data)`。因此导出列名由 JSON 结构决定，与访问器名称无直接关联。

### 逐字段对照

| 访问器 | JSON 路径 (Arr::get) | flatten 后列名 | 列名是否一致 |
|---|---|---|---|
| `downloadBits` | `$this->download`（模型列，非 data） | 无对应列 ⚠️ | ❌ |
| `uploadBits` | `$this->upload`（模型列，非 data） | 无对应列 ⚠️ | ❌ |
| `serverName` | `server.name` | `server_name` | ✅ |
| `serverHost` | `server.host` | `server_host` | ✅ |
| `serverId` | `server.id` | `server_id` | ✅ |
| `serverLocation` | `server.location` | `server_location` | ✅ |
| `serverPort` | `server.port` | `server_port` | ✅ |
| `serverIp` | `server.ip` | `server_ip` | ✅ |
| `serverCountry` | `server.country` | `server_country` | ✅ |
| `resultUrl` | `result.url` | `result_url` | ✅ |
| `isp` | `isp` | `isp` | ✅ |
| `packetLoss` | `packetLoss` | `packet_loss` ⚠️ | ⚠️ 大小写/命名差异 |
| `pingJitter` | `ping.jitter` | `ping_jitter` | ✅ |
| `pingLow` | `ping.low` | `ping_low` | ✅ |
| `pingHigh` | `ping.high` | `ping_high` | ✅ |
| `downloadJitter` | `download.latency.jitter` | `download_latency_jitter` | ✅ |
| `downloadlatencyHigh` | `download.latency.high` | `download_latency_high` | ✅ |
| `downloadlatencyLow` | `download.latency.low` | `download_latency_low` | ✅ |
| `downloadlatencyiqm` | `download.latency.iqm` | `download_latency_iqm` | ✅ |
| `downloadElapsed` | `download.elapsed` | `download_elapsed` | ✅ |
| `downloadedBytes` | `download.bytes` | `download_bytes` | ✅ |
| `uploadJitter` | `upload.latency.jitter` | `upload_latency_jitter` | ✅ |
| `uploadlatencyHigh` | `upload.latency.high` | `upload_latency_high` | ✅ |
| `uploadlatencyLow` | `upload.latency.low` | `upload_latency_low` | ✅ |
| `uploadlatencyiqm` | `upload.latency.iqm` | `upload_latency_iqm` | ✅ |
| `uploadElapsed` | `upload.elapsed` | `upload_elapsed` | ✅ |
| `uploadedBytes` | `upload.bytes` | `upload_bytes` | ✅ |
| `ipAddress` | `interface.externalIp` | `interface_externalIp` ⚠️ | ⚠️ 驼峰保留 |
| `errorMessage` | `message` | `message` | ✅ |

### 混淆理解导致的问题

#### (a) `downloadBits` / `uploadBits` — 根本性错列

这两个访问器的数据源是模型的 `download` 和 `upload` **列**（`$this->download`、`$this->upload`），而非 `data` JSON。但 `data` JSON 中通常也包含 `download` 和 `upload` 键（Ookla 测速原始数据），所以 flatten 会生成 `download` 和 `upload` 列，值来自 `data` 中的原始字段，**语义上与访问器同名但值可能不同**（访问器做了 `Bitrate::bytesToBits()` 转换，flatten 的值是原始字节值）。

如果把"访问器 `downloadBits`"理解为"导出列 `download_bits`"，会出现：
- 导出文件中根本不存在 `download_bits` 列（因为 flatten 不会产生此名称）
- 实际存在的是 `download` 列（来自 `data.download`），但值是**字节**而非**比特**

#### (b) `packetLoss` — 命名风格冲突

访问器用 `Arr::get($this->data, 'packetLoss')`（驼峰），flatten 将 `data.packetLoss` 生成 `packet_loss` 列（蛇形，因为 flatten 用 `_` 连接键，但键本身保留 `packetLoss` 的驼峰——实际是 `packetLoss` → `packetLoss`，不，等一下）。

重新看 flatten 逻辑：
```php
$newKey = $prefix ? "{$prefix}_{$key}" : $key;
```
`$key` 直接使用原始数组键，不做转换。所以如果 JSON 键是 `packetLoss`，flatten 后是 `packetLoss`（顶层，无前缀），label 是 `PacketLoss`（`ucfirst('packetLoss')`）。但访问器名是 `packetLoss`，两者在命名上一致，但如果有人期望 flatten 输出 `packet_loss`（蛇形），就会困惑。

#### (c) `ipAddress` — 路径理解偏差

访问器 `ipAddress` → JSON 路径 `interface.externalIp` → flatten 列名 `interface_externalIp`。

如果有人从访问器名 `ipAddress` 推断 flatten 列名是 `ip_address` 或 `ipAddress`，就会找错列。正确的列名是 `interface_externalIp`——必须从 JSON 路径出发，而非从访问器名出发。

#### (d) `ping` 访问器 vs `data.ping` — 来源混淆

`ResultDataAttributes` 中还有 `ping()` 访问器：
```php
protected function ping(): Attribute
{
    return Attribute::make(
        get: fn (mixed $value, array $attributes) => $attributes['ping'],
    );
}
```
这个访问器取的是 `$attributes['ping']`（模型列），而非 `data.ping`。但 flatten 会从 `data.ping` 生成 `ping` 列（顶层），以及 `ping_jitter`、`ping_low`、`ping_high` 列。如果把访问器 `ping` 和 flatten 的 `ping` 列等同看待，会忽略掉 `data.ping` 中嵌套的 jitter/high/low 信息。

### 总结：混淆风险矩阵

| 混淆类型 | 表现 | 受影响字段 |
|---|---|---|
| 数据源混淆（模型列 vs data JSON） | 访问器取模型列，flatten 取 data，值不同或列不存在 | `downloadBits`、`uploadBits`、`ping` |
| 命名风格混淆（驼峰 vs 蛇形） | 访问器是驼峰，flatten 保留原始 JSON 键名 | `packetLoss`（访问器驼峰，flatten 也驼峰，但易被误读为蛇形） |
| 路径推断混淆（从访问器名推 JSON 路径） | 访问器名 ≠ JSON 路径的 flatten 结果 | `ipAddress` → `interface_externalIp`，`errorMessage` → `message` |
| 值转换混淆（原始值 vs 转换值） | 访问器做了转换（如 bytesToBits），flatten 输出原始值 | `downloadBits` vs `download` 列，`uploadBits` vs `upload` 列 |
