# Results API 行为分析

基于当前实现对 `api/v1/results/latest`、`api/v1/results`、`api/v1/results/{id}` 三条路径在资源序列化、排序稳定性、权限与业务语义方面的表现做一梳理。

相关代码位置：

- 控制器：[ResultsController.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php)
- 资源：[ResultResource.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Resources/V1/ResultResource.php)
- 模型：[Result.php](file:///e:/solo-code-2/speedtest-tracker/app/Models/Result.php)
- 建表迁移：[2022_08_31_202106_create_results_table.php](file:///e:/solo-code-2/speedtest-tracker/database/migrations/2022_08_31_202106_create_results_table.php)
- `healthy` 字段迁移：[2024_11_23_021744_add_healthy_to_results_table.php](file:///e:/solo-code-2/speedtest-tracker/database/migrations/2024_11_23_021744_add_healthy_to_results_table.php)
- 路由入口：[api.php](file:///e:/solo-code-2/speedtest-tracker/routes/api.php)
- 中间件：[AcceptJsonMiddleware.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/AcceptJsonMiddleware.php)
- 异常引导：[bootstrap/app.php](file:///e:/solo-code-2/speedtest-tracker/bootstrap/app.php)

---

## 1. `healthy` 字段未写入时，资源层如何表现，与数据库默认值的关系

### 数据库侧

建表迁移对 `results` 表的关键字段是这样定义的：

- `created_at` / `updated_at`：由 `$table->timestamps()` 生成。从 Laravel 8 起，`timestamps()` 方法内部直接调用 `nullableTimestamps()`，因此这两个时间列在 schema 层面是**可空**的；但 Eloquent 模型在 `create()` / `save()` 时会自动填充，实践中几乎不会为 `NULL`。
- `healthy`：由后续迁移以 `$table->boolean('healthy')->nullable()` 追加，**可空、无默认值**。

也就是说：一行结果在刚 `insert` 时就会带上 `created_at`（由 Eloquent 自动填充），但 `healthy` 要等异步处理链路（例如 `ProcessCompletedSpeedtest`、`ProcessUnhealthySpeedtest` 等监听器或 Job）执行后才会被 `update` 为 `true`/`false`。在这之前数据库里的值是 `NULL`。

### 模型侧

`Result` 模型的 `casts()` 里声明了 `'healthy' => 'boolean'`。Laravel 的 boolean cast 会把 `null` 原样返回 `null`（并不会强转成 `false`），所以 `$result->healthy` 可能是三种状态：`true`、`false`、`null`。

### 资源侧

[ResultResource::toArray](file:///e:/solo-code-2/speedtest-tracker/app/Http/Resources/V1/ResultResource.php#L17-L43) 里：

- `'healthy' => $this->healthy` —— 原样输出，为 `null` 时 JSON 里就是 `null`；
- `'created_at' => $this->created_at->toDateTimestring()` —— 正常情况下总有值（Eloquent 自动填充），但如果手动 insert 绕过 Eloquent 或模型事件被跳过，也可能为 `null`；
- `'scheduled' => $this->scheduled`、`'dispatched_by' => $this->dispatched_by`、`'comments' => $this->comments` 同理按模型属性透传。

因此：

- `api/v1/results/latest` 会返回 `{ healthy: null, created_at: "2026-05-24 ...", ... }`，前端看到的是"有时间但健康状态未知"的一条最新记录；
- `api/v1/results` 列表接口返回的集合里，同样会把那些尚未处理完 `healthy` 的行带着 `null` 一起返回，与列表里其它已完成的行混在一起；
- `api/v1/results/{id}` 只要被查询的那条行 `healthy` 仍为 `NULL`，表现一致。

### 与数据库默认值的关系

核心结论：**数据库层面没有为 `healthy` 提供默认值**（迁移里只有 `nullable`，没有 `default(false)` 或生成列），所以"未写入 = NULL"完全由 schema 决定；资源层并不做兜底，于是把这种"未知"状态原封不动透出给 API 消费者。这意味着：

1. 调用方必须把 `healthy` 当成**三态**（true / false / null）处理，不能假设布尔；
2. `latest` 接口很容易返回一条业务上"尚未完成健康判定"的记录，前端如果把 `null` 当成 `false` 就会把"未知"误判为"不健康"；
3. 与 `scheduled`（在迁移里显式 `default(false)`）形成对比：`scheduled` 不会出现 `null`，而 `healthy` 必然会出现一个窗口期。

---

## 2. `Result::latest()` 依赖的时间列、相同时序下的稳定性及其对前端的影响

### 依赖的时间列

Laravel Eloquent 的 `latest()` scope 定义为 `$this->orderBy($column ?? $this->model->getCreatedAtColumn(), 'desc')`。`Result` 模型没有覆写 `CREATED_AT`，所以默认就是 `created_at`。

- 控制器 `latest()` 方法：`Result::latest()->firstOrFail()`，直接以 `created_at DESC` 取第一行；
- 控制器 `list()` 方法：使用 `spatie/laravel-query-builder` 的 `QueryBuilder`，只通过 `allowedSorts` 暴露了 `ping`、`download`、`upload`、`created_at`、`updated_at`；**在未传 `?sort=` 参数时不会主动追加任何 `ORDER BY`**，结果顺序完全由数据库引擎决定，没有任何保证。

也就是说："列表第一行"和"`latest()` 返回行"在排序规则上并不对称，本身就可能不一致。

### 两条结果 `created_at` 相同时的稳定性

当多条记录拥有相同的 `created_at`（例如同一秒内并发触发、或者 `created_at` 精度只有秒级、或者应用层显式写死同一时间戳）时：

- `ORDER BY created_at DESC` 只决定了"组"的顺序，组内顺序交给数据库引擎；
- MySQL InnoDB 通常会退回到**聚簇索引顺序**（近似主键 `id` 升序），因为 InnoDB 按聚簇索引存储行数据；但这是引擎的实现细节，不是 SQL 标准，也不被框架保证；
- PostgreSQL、SQLite 或带查询缓存/并行扫描的情况下，组内行顺序是**未定义**的，可能被执行计划、VACUUM、索引选择等因素影响；
- Laravel 自身也不会在 `latest()` 后追加任何二级排序列（如 `id desc`）。

因此：相同 `created_at` 的多行里，`latest()->first()` 取到哪一条**在跨数据库、跨版本、跨执行计划下并不稳定**。

### 对前端的影响

1. **刷新抖动**：前端轮询 `latest` 时，在相同时刻窗口内可能 A 次拿到 id=100、B 次拿到 id=101，表现为"最新一条结果在两条之间来回跳"；
2. **E-Tag / 缓存失效**：如果前端用 `id` 或 `created_at` 做去重，会把两条本应等价的结果当成新数据，引起重复渲染或误触发通知；
3. **列表与 latest 不一致**：`list` 未显式排序时顺序未定义（不保证是 `id ASC`），第一行可能是任何一条；而 `latest()` 按时间取。即便都按时间排序，相同时刻下也可能不一致，前端在"最新结果"组件和"结果列表第一行"之间会看到错位；
4. **可观测性差**：如果前端把 `latest` 当作"业务最新完成的测速"，由于无法保证 `healthy` 已写入且无法保证相同时序下的稳定行，UI 容易出现短暂的 `healthy: null` 或错误的那条结果。

更稳妥的写法一般是 `Result::latest('id')->first()` 或 `Result::orderByDesc('created_at')->orderByDesc('id')->first()`，以 `id` 作为二级排序使结果稳定。

---

## 3. 为什么"能读列表"不等于"能稳定拿到最新一条业务上最重要的结果"

综合控制器、资源层和数据生命周期来看，至少存在四层不等价：

### 3.1 权限粒度相同，但"成功返回"的语义不同

三个方法都使用 `$request->user()->tokenCant('results:read')` 做相同的 token ability 校验，所以**权限上确实同一级别**。但在空数据和错误场景下，三者的响应语义差异显著：

- `list`：无数据时返回 `data: []`（200），语义是"查询成功、集合为空"；
- `latest`：使用 `firstOrFail()`，无数据时抛出 `ModelNotFoundException`，被 Laravel 默认异常处理渲染为 404 JSON（因为 `accept-json` 中间件确保了 `Accept: application/json`）；
- `show`：使用 `findOr` + 自抛 `NotFoundException`，查不到时返回 404。

详见下方"三者空结果语义对比表"。

### 3.2 排序规则不对称，语义不一致

- `list` 默认不显式排序（无 ORDER BY，顺序由数据库引擎决定，未定义），所以"列表里的第一条"没有确定含义；
- `latest` 明确 `created_at DESC`，取的是**时间上最新**的结果。

即便两者都"能读"，取到的行在语义上就不是同一条，更遑论"最新一条业务上最重要的结果"。

### 3.3 `latest` 返回的不一定是"业务上完成的那条"

对比 V0 的 [GetLatestController](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V0/GetLatestController.php)，它会加一层 `whereIn('status', [Completed, Failed])`，保证返回的是至少"终态"的结果。V1 的 `latest` 没有这层过滤，意味着它可能返回：

- `status = running / checking / benchmarking / waiting` 的中间态行；
- `healthy = null` 的未决行（见第 1 节）；
- 因为并发或时序并列导致"相同时刻组内不稳定"的行（见第 2 节）。

而 `list` 允许按 `status`、`healthy` 过滤（`AllowedFilter::exact('healthy')->nullable()`、`AllowedFilter::exact('status')`），调用方能够主动筛掉中间态；`latest` 则没有类似的过滤能力，只能接受"当前时间戳最大的那一行"。

### 3.4 资源层暴露的字段同样会放大差异

`ResultResource` 输出里包含 `healthy`、`status`、`scheduled`、`dispatched_by`、`comments`、`created_at` 等字段：

- 对 `list`：调用方可以自行在前端按 `status` / `healthy` 二次筛选，挑出"业务上最重要"的那条；
- 对 `latest`：只有一条数据，一旦这条是中间态或 `healthy` 未写，前端没有选择空间；
- 如果前端用 `latest` 作为"当前网络状态"的单一数据源，会出现"能看列表时列表里已经有完成的结果，但 latest 仍返回未完成的那条"的认知错位。

### 小结

"能读列表" ≠ "能稳定拿到最新一条业务上最重要的结果"，原因可以归纳为：

1. **错误语义不同**：`list` 空集 200 vs `latest` 无数据 404 vs `show` 查不到 404；
2. **排序语义不同**：`list` 无默认排序（未定义顺序） vs `latest` 按时间倒序；
3. **过滤能力不同**：`list` 可按 `status` / `healthy` 筛选，`latest` 不过滤；
4. **数据窗口期不同**：`latest` 可能拿到 `healthy = null` 的未决记录，而 `list` 可由调用方避开；
5. **时序稳定性不同**：相同 `created_at` 下 `latest` 的选择不稳定，`list` 至少让调用方能看到全部候选。

如果业务希望"latest"语义等价于"最新一条已完成且已完成健康判定的结果"，通常需要在 `latest()` 里追加：

- `status` 终态过滤（对齐 V0）；
- `orderByDesc('created_at')->orderByDesc('id')` 保证相同时序下的稳定；
- 对 `healthy = null` 做兜底（继续找下一条、或在资源层明确三态语义）；
- 用 `firstOr(fn () => ...)` 或自定义异常统一为 404（当前 `firstOrFail()` 在 API 路由下已经是 404，无需额外处理）。

---

## 4. `latest`、`list`、`show` 三者空结果语义对比表

| 场景 | `latest` | `list` | `show` |
|------|----------|--------|--------|
| **权限不足** (`tokenCant('results:read')`) | 403 `{message: "You do not have permission to view results."}` | 403 同左 | 403 同左 |
| **无任何结果 / 集合为空** | 404 `ModelNotFoundException`（Laravel 默认渲染为 JSON 404） | 200 `{data: [], ...}`（分页空集合） | N/A（必须传 id） |
| **指定 id 不存在** | N/A（按时间取，不涉及 id） | N/A（列表返回全部匹配行） | 404 `{message: "Result not found."}` |
| **Accept 头不含 application/json** | 406（`accept-json` 中间件拦截） | 406 同左 | 406 同左 |

关键对比说明：

- **查询为空 vs 查不到记录**：`list` 的"空"是正常业务状态（200 + 空数组），而 `latest` 和 `show` 的"空"是异常状态（404）。调用方对 `list` 可以安全地 `data.length === 0` 判断，对 `latest` 则需要捕获 404。
- **权限不足**：三者统一返回 403，由相同的 token ability 检查控制。
- **中间态可见性**：`latest` 返回的"最新"行可能是 `running` 状态或 `healthy = null` 的未决行，而 `list` 允许通过 `?filter[status]=completed&filter[healthy]=true` 等参数筛掉这些行。这是"能读列表"不等于"能拿到最新一条业务结果"的核心原因之一。
- **排序确定性**：`latest` 以 `created_at DESC` 排序但相同时刻下不稳定；`list` 无默认排序，顺序完全取决于数据库引擎。
