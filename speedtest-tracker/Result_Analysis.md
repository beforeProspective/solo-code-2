# Result 模型、ResultDataAttributes 与 ResultResource 深度分析

## 1. 缺失数据时的访问器返回值与连锁影响

### 1.1 当 `data` 字段缺少 `server.port` 时

`serverPort` 访问器定义在 [ResultDataAttributes.php#L274-L279](file:///e:/solo-code-2/speedtest-tracker/app/Models/Traits/ResultDataAttributes.php#L274-L279)：

```php
protected function serverPort(): Attribute
{
    return Attribute::make(
        get: fn () => Arr::get($this->data, 'server.port'),
    );
}
```

**返回值：`null`**

`Arr::get()` 在键不存在时默认返回 `null`（其第三个参数 `$default` 默认为 `null`）。即使 `$this->data` 本身为 `null` 或空数组，`Arr::get` 也会安全地返回 `null`，不会抛出异常。

### 1.2 当 `data` 字段缺少 `upload.latency.iqm` 时

`uploadlatencyiqm` 访问器定义在 [ResultDataAttributes.php#L204-L209](file:///e:/solo-code-2/speedtest-tracker/app/Models/Traits/ResultDataAttributes.php#L204-L209)：

```php
protected function uploadlatencyiqm(): Attribute
{
    return Attribute::make(
        get: fn () => Arr::get($this->data, 'upload.latency.iqm'),
    );
}
```

**返回值：`null`**

同样，`Arr::get` 在嵌套键路径中任何一层缺失时都会返回 `null`。

### 1.3 对 ResultResource 输出的连锁影响

查看 [ResultResource.php#L17-L43](file:///e:/solo-code-2/speedtest-tracker/app/Http/Resources/V1/ResultResource.php#L17-L43)，`serverPort` 和 `uploadlatencyiqm` 这两个访问器 **并未被 ResultResource 直接使用**。

ResultResource 的字段构成分为两类来源：

| 字段 | 来源 | 是否受访问器缺失影响 |
|------|------|---------------------|
| `download_bits` | `$this->when($this->download, ...)` — 依赖 `download` 列 + Bitrate 转换 | 否 |
| `upload_bits` | `$this->when($this->upload, ...)` — 依赖 `upload` 列 + Bitrate 转换 | 否 |
| `download_bytes` | `$this->download_bytes` — 直接取数据库列 | 否 |
| `upload_bytes` | `$this->upload_bytes` — 直接取数据库列 | 否 |
| `download_bytes_human` | `$this->when($this->download_bytes, ...)` | 否 |
| `upload_bytes_human` | `$this->when($this->upload_bytes, ...)` | 否 |
| `data` | `$this->data` — 直接取 JSON 列原始值 | 否 |
| `healthy` | `$this->healthy` — 直接取数据库列 | 否 |
| `status` | `$this->status` — 直接取数据库列 | 否 |

**结论**：由于 ResultResource 不引用 `serverPort`、`uploadlatencyiqm` 等 trait 访问器，所以这些访问器返回 `null` 对 Resource 输出**没有连锁影响**。Resource 输出的是数据库列字段和经 `when()` 条件包装的衍生字段。

> **注意**：trait 中的 `downloadedBytes()` 和 `uploadedBytes()` 访问器（从 `data.download.bytes` / `data.upload.bytes` 读取）与数据库列 `download_bytes` / `upload_bytes` 是**两套独立的数据路径**。ResultResource 使用的是数据库列，而非 trait 访问器。

---

## 2. ResultResource 中的空值处理逻辑

### 2.1 两种字段访问模式对比

| 模式 | 示例字段 | 写法 |
|------|---------|------|
| 直接取属性 | `id`, `ping`, `download`, `upload`, `download_bytes`, `upload_bytes`, `healthy`, `status`, `scheduled`, `comments`, `data`, `created_at`, `updated_at` | `$this->属性名` |
| `when()` 条件包装 | `download_bits`, `upload_bits`, `download_bits_human`, `upload_bits_human`, `download_bytes_human`, `upload_bytes_human` | `$this->when(条件, 回调)` |
| 辅助方法/关系 | `service` (enum cast), `dispatched_by` (关系) | `$this->属性名` (依赖 casts/关系) |

### 2.2 为什么需要 `when()` 包装？

**`when()` 的行为**：Laravel 的 `JsonResource::when()` 方法在条件为 `true` 时执行回调并返回结果，条件为 `false` 时**从最终数组中完全移除该键**（而不是设为 `null`）。

这样设计的原因分析：

1. **派生字段的条件性**：`download_bits`、`upload_bits` 是由 `download`/`upload` 列衍生的值。如果 `download`/`upload` 本身为 `null`（测试未完成或失败），继续输出 `download_bits` 为 `null` 没有意义，直接省略键更简洁。

2. **人类可读格式的数据依赖**：`*_human` 字段（如 `download_bits_human`、`download_bytes_human`）依赖于原始数值存在。当数值为 `null` 时，`Number::fileSize(null)` 或 `Bitrate::formatBits(null)` 会产生不可预期的输出，`when()` 在这里起到了**守卫**作用。

3. **API 契约的语义表达**：省略键（而非输出 `null`）向 API 消费者传递了更明确的语义——"这个数据不存在"，而不是"这个数据的值是空"。

### 2.3 为什么直接取属性的字段不需要 `when()`？

| 字段 | 理由 |
|------|------|
| `id`, `service`, `status`, `healthy`, `scheduled`, `created_at`, `updated_at` | 这些列在数据库层面有 `NOT NULL` 约束或默认值，永远不会为空 |
| `ping`, `download`, `upload`, `comments` | 这些是核心数据列，即使为 `null` 也有语义含义（如"测试未完成"），需要显式传递 |
| `download_bytes`, `upload_bytes` | 2025 年新增列，可能为 `null`，但作为原始数据列需要显式展示 |
| `data` | JSON 列，可能为 `null`，但作为完整原始数据需要暴露给 API |
| `benchmarks` | JSON 列，可能为 `null`，同上 |
| `dispatched_by` | 外键，可能为 `null`，表示非用户触发的测试 |

**总结**：直接取属性的字段要么有数据库层面的非空保障，要么即使为 `null` 也具有语义价值。而 `when()` 包装的都是**派生计算值**，其存在本身就依赖于原始数据的存在。

---

## 3. casts、prunable 与清理任务的影响分析

### 3.1 casts 方法

定义在 [Result.php#L31-L41](file:///e:/solo-code-2/speedtest-tracker/app/Models/Result.php#L31-L41)：

```php
protected function casts(): array
{
    return [
        'benchmarks' => 'array',
        'data' => 'array',
        'healthy' => 'boolean',
        'scheduled' => 'boolean',
        'service' => ResultService::class,
        'status' => ResultStatus::class,
    ];
}
```

casts 的作用：
- `data` 和 `benchmarks`：JSON 列 ↔ PHP 数组的自动序列化/反序列化
- `healthy` 和 `scheduled`：布尔值的自动转换
- `service` 和 `status`：字符串 ↔ Enum 的自动转换

### 3.2 prunable 方法

定义在 [Result.php#L46-L49](file:///e:/solo-code-2/speedtest-tracker/app/Models/Result.php#L46-L49)：

```php
public function prunable(): Builder
{
    return static::where('created_at', '<=', now()->subDays(config('speedtest.prune_results_older_than')));
}
```

这是 Laravel `Prunable` trait 的约定方法。Laravel 的 `model:prune` 命令会调用此方法获取查询构建器，然后对匹配的记录执行 `delete()`。清理阈值由配置 `speedtest.prune_results_older_than` 控制。

### 3.3 清理任务删除记录后的各层面影响

#### 3.3.1 对最新结果接口（`GET /results/latest`）的影响

[ResultsController.php#L102-L116](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L102-L116)：

```php
$result = Result::latest()->firstOrFail();
```

- 如果被删除的记录正好是**最新的一条**，`firstOrFail()` 会抛出 `ModelNotFoundException`，HTTP 返回 **404**。
- 如果被删除的不是最新记录，接口正常返回下一条最新记录，**无感知**。
- 如果数据库中记录被全部清除，同样抛出 404。

#### 3.3.2 对列表接口（`GET /results`）的影响

[ResultsController.php#L21-L71](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L21-L71)：

```php
$results = QueryBuilder::for(Result::class)
    ->allowedFilters([...])
    ->jsonPaginate();
```

- 已删除的记录不会出现在查询结果中，分页总数（`total`）会相应减少。
- 如果用户指定的 `page.size` 超出了剩余记录数，返回的 `data` 数组会变短或为空，**不会报错**。
- 如果某个过滤条件只匹配了被删除的记录，结果集为空。

#### 3.3.3 对模型访问器的影响

访问器的影响取决于**被清理后剩下的记录**：

| 访问器 | 影响 |
|--------|------|
| `downloadBits()` / `uploadBits()` | 如果剩余记录的 `download`/`upload` 列为 `null`，访问器返回 `null`。清理不改变已有记录的属性值。 |
| `downloadJitter()` / `serverHost()` 等 data 访问器 | 清理只删除行，不修改已有行的 `data` JSON。剩余记录的访问器行为与清理前一致。 |
| `unscheduled()` | 基于 `scheduled` 列取反，清理不影响此逻辑。 |

**关键点**：prunable 是**行级删除**，不是字段级修改。已存在记录的所有访问器行为不受清理任务影响。清理只是让某些记录从数据库中消失，对剩余记录的数据完整性没有副作用。

### 3.4 casts 与 prunable 的协同

casts 与 prunable 之间存在一个值得注意的交互：

- prunable 查询中对 `created_at` 的比较不依赖 casts，因为 `created_at` 是 Eloquent 内置自动管理的时间戳列。
- 如果未来清理逻辑需要基于 `data` JSON 中的某个字段（如按 `data.isp` 清理），由于 `data` 已 cast 为数组，需要使用 `whereJsonContains` 或 `where('data->...', ...)` 等 JSON 查询语法，而不是普通的 `where`。

当前 prunable 仅按 `created_at` 过滤，与 casts 没有实际耦合。

---

## 附录：数据流向全景图

```
speedtest 执行
    │
    ▼
写入 results 表
├── download, upload, ping (原始列)
├── download_bytes, upload_bytes (字节列, 2025新增)
├── data (JSON 列, 完整原始数据)
├── healthy, status, scheduled, service
├── benchmarks (JSON 列)
└── created_at, updated_at
    │
    ├──► ResultDataAttributes trait 通过 Arr::get 从 data 提取派生访问器
    │    如: serverHost(), downloadJitter(), uploadedBytes(), downloadedBytes()
    │
    ├──► casts 自动处理类型转换
    │    data → array, status → Enum, healthy → boolean
    │
    └──► ResultResource 组装 API 输出
         ├── 直接取: id, ping, download, upload, download_bytes, upload_bytes, healthy, status, data
         ├── when 条件派生: download_bits, upload_bits, *_human
         └── 时间格式: created_at → toDateTimeString()
```
