# Speedtest Tracker API 路由与鉴权分析

本文针对 `routes/api.php`、`AcceptJsonMiddleware`、`ResultsController`、`SpeedtestController` 与 `OoklaController` 的现状进行代码走读，并回答题目中的三个问题。

相关源码位置：

- [api.php](file:///E:/solo-code-2/speedtest-tracker/routes/api.php)
- [AcceptJsonMiddleware.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Middleware/AcceptJsonMiddleware.php)
- [GetLatestController.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V0/GetLatestController.php)
- [v1/routes.php](file:///E:/solo-code-2/speedtest-tracker/routes/api/v1/routes.php)
- [ResultsController.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php)
- [SpeedtestController.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/SpeedtestController.php)
- [OoklaController.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/OoklaController.php)

---

## 1. AcceptJsonMiddleware 对未设置 Accept: application/json 的合法 Sanctum 请求返回什么？与检查 Accept 而非 Content-Type 有什么关系？

### 返回的状态码

查看 [AcceptJsonMiddleware.php#L20-L25](file:///E:/solo-code-2/speedtest-tracker/app/Http/Middleware/AcceptJsonMiddleware.php#L20-L25)：

```php
if (! $request->acceptsJson()) {
    return response()->json([
        'message' => 'This endpoint only accepts JSON. Please include "Accept: application/json" in your request headers.',
        'error' => 'Unsupported Media Type',
    ], Response::HTTP_NOT_ACCEPTABLE);
}
```

- 使用的判断方法是 `$request->acceptsJson()`，它内部会解析 `Accept` 头并判断客户端是否声明接受 `application/json`。
- 当客户端未在 `Accept` 中声明可接收 JSON 时，中间件直接返回 **`406 Not Acceptable`**。
- 注意 `error` 字段写的是 `"Unsupported Media Type"`（对应 415），这只是一个文案瑕疵，实际响应的状态码仍是 **406**。

### 它与检查 Accept 而非 Content-Type 的关系

中间件选择的是 `Accept` 语义，而不是 `Content-Type` 语义。这两者在 HTTP 协议中有明确分工：

| 头 | 含义 | 常见用途 |
| --- | --- | --- |
| `Content-Type` | 描述 **请求体/响应体** 的媒体类型（我发给你的是什么） | `POST/PUT` 请求体的解析、`415 Unsupported Media Type` |
| `Accept` | 描述 **客户端能接受的响应媒体类型**（你可以返回给我什么） | 内容协商、`406 Not Acceptable` |

- 本中间件的职责是**约束响应格式必须是 JSON**（并在后面强制给响应设置 `Content-Type: application/json`，见 [AcceptJsonMiddleware.php#L31-L34](file:///E:/solo-code-2/speedtest-tracker/app/Http/Middleware/AcceptJsonMiddleware.php#L31-L34)），所以按协议它应当检查的是 `Accept`——"客户端明确愿意接受 JSON 吗？"
- 若改为检查 `Content-Type`，语义就变成"请求体必须是 JSON"，这会导致：
  1. `GET` 请求（没有 body）时 `Content-Type` 本来就没有必要存在，检查会误伤合法调用；
  2. `POST /api/v1/speedtests/run` 这类请求即使 body 是 JSON，也可能因客户端没显式带 `Content-Type` 被拒——与本项目要表达的意图（"只返回 JSON"）不符。
- 因此：中间件选择返回 **406**，并配合 `Accept` 检查，在协议上是自洽的；若当初选择检查 `Content-Type`，更合理的状态码应是 **415**，那就属于另一种语义（只接受 JSON 作为请求体）。
- 携带合法 Sanctum Token 但 `Accept` 不包含 JSON 的请求，会在 `AcceptJsonMiddleware` 被拦截并返回 406，根本不会进入 Controller 中的 `tokenCant` 细粒度校验。

---

## 2. 为什么 `/speedtest/latest` 可以不走 `auth:sanctum` 仍只返回 JSON，而 v1 路由必须依赖 Token 能力才能继续执行？两条线路的兼容目标是什么？

### `/speedtest/latest` 的定位

在 [api.php#L15-L24](file:///E:/solo-code-2/speedtest-tracker/routes/api.php#L15-L24) 的注释中，已明确声明：

```
This route provides backwards compatibility from
https://github.com/henrywhitaker3/Speedtest-Tracker
for Homepage and Organizr dashboards which expects
the returned download and upload values in mbits.

@deprecated
```

这是一条**遗留兼容入口**（V0 层），对应的控制器是 [GetLatestController.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V0/GetLatestController.php)，其特点：

- 只允许返回 JSON（所以挂了 `accept-json`），但**不做认证**。
- 服务对象是老生态的 Homepage/Organizr 仪表盘，这些工具往往通过公共 URL 抓取最新的一条测速数据展示，并不持有用户令牌。
- 输出字段经过"mbits 归一化"（`download`/`upload` 统一转换为 mb/s），正是旧版本仪表盘约定的数据格式。

它的兼容目标是：**让老的无 Token 调用方式继续工作，同时用 `accept-json` 保证响应格式永远是 JSON，避免被浏览器/HTML 页面错误解释。**

### v1 路由的定位

[v1/routes.php](file:///E:/solo-code-2/speedtest-tracker/routes/api/v1/routes.php) 被包裹在：

```php
Route::middleware(['auth:sanctum', 'throttle:api', 'accept-json'])->group(...)
```

这意味着 v1 组下所有接口必须同时满足：

1. `auth:sanctum`：必须是通过 Sanctum 认证的用户；
2. `throttle:api`：启用速率限制；
3. `accept-json`：请求方必须声明接受 JSON。

更进一步，每个 Controller 方法还会用 `tokenCant('...')` 检查 token 被授予的**能力（ability）**：

- `ResultsController`：`results:read`（[list](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L21-L29)、[show](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L77-L85)、[latest](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L102-L110)）
- `SpeedtestController`：`speedtests:run`（[__invoke](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/SpeedtestController.php#L17-L25)）
- `OoklaController`：`ookla:list-servers`（[__invoke](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/OoklaController.php#L15-L23)）

其兼容目标是：**作为新的版本化 API，提供细粒度的授权能力（read / run / list-servers），让管理员可以按最小权限原则签发 Token**。例如：

- 仪表盘集成只需要 `results:read`；
- 调度器/自动化任务可能只需要 `speedtests:run`；
- 前端页面可能只需要 `ookla:list-servers` 用于选择服务器。

### 两者并存的必要性

- `/speedtest/latest` 是公共只读入口，承担对外兼容；
- `/api/v1/...` 是受保护的能力化入口，承担对内、对未来扩展的正式接口。

如果把 `/speedtest/latest` 也塞进 `auth:sanctum`，旧的仪表盘集成会立即失效；反之如果把 v1 路由的认证拿掉，任何拿到 URL 的人都能触发测速或列服务器，造成资源滥用。两条线路在"对外兼容"与"对内安全"之间做了清晰的切分。

---

## 3. 两种简化方案下会出现什么能力混用？

题目提出两种假想的简化方案，分别分析其影响。

### 方案 A：路由层保留 `auth:sanctum`，但删除 Controller 内的 `tokenCant` 判断

由于 v1 组被统一包裹在 `auth:sanctum` 之下，任何已认证用户（只要 token 存在且有效）都能访问所有 v1 路由。原先 Controller 内的 `tokenCant` 是用来在认证之上再做**能力区分**的，去掉后：

- 持有 `results:read` 的 token 也能调用 `POST /api/v1/speedtests/run` → 把**只读**与**运行**能力混用；
- 持有 `speedtests:run` 的 token 也能调用 `GET /api/v1/results`、`/results/latest`、`/results/{id}` → 把**运行**与**只读**能力混用；
- 持有 `ookla:list-servers` 的 token 也能访问 results 和 speedtests → 把**列出服务器**与另外两类能力混用；
- 任何仅被授予其中一类能力的 token，事实上都拥有了三类能力的全集。

换言之，原本设计的"最小权限原则"退化成了"只要登录就能干一切"。

### 方案 B：Controller 内保留 `tokenCant`，但让旧兼容路由（`/speedtest/latest`）绕过认证

目前 `/speedtest/latest` 已经是"绕过认证"的状态（无 `auth:sanctum`），这是**有意为之**的兼容设计。它指向的是独立的 V0 Controller，并不调用 `ResultsController`，因此不会触及 `results:read` 的 `tokenCant`。

但如果在假设的改动下：把 `/speedtest/latest` 改为直接调用 `ResultsController@latest` 且同时去掉 `auth:sanctum`，那么：

- 无 token 的匿名请求到达 `ResultsController@latest` 时，`$request->user()` 为 `null`；
- 调用 `$request->user()->tokenCant('results:read')` 会直接抛出 `Error: Call to a member function tokenCant() on null`，请求直接 500。
- 即便对 `user()` 做空值兼容，匿名请求实际上也无法通过 `tokenCant`，等价于接口彻底不可用，失去了兼容意义。

更现实的风险是：**如果未来有人把 `/speedtest/latest` 指向 `ResultsController@latest` 或其他 v1 方法，而忘记在路由上加 `auth:sanctum`**，就会导致"所有匿名请求统一 500 或统一 403"的混乱——这就是为什么当前架构中把 V0 与 V1 路由/Controller 分开的原因：**物理上隔离兼容入口与受保护入口，避免意外串线。**

### 小结：两种简化方案下被混用的接口

| 方案 | 被混在一起的能力 | 受影响接口 |
| --- | --- | --- |
| A：去掉 `tokenCant` | 只读 ∪ 运行 ∪ 列出服务器 | `GET /api/v1/results`、`GET /api/v1/results/latest`、`GET /api/v1/results/{id}`、`POST /api/v1/speedtests/run`、`GET /api/v1/ookla/list-servers` 全部对任何认证用户开放 |
| B：让旧兼容路由绕过认证却复用 v1 Controller | 匿名访问直接抛错或 403，导致 `results:read` 能力对公开入口不可用 | `/speedtest/latest` 在复用 `ResultsController@latest` 时将无法为匿名客户端服务，破坏 Homepage/Organizr 兼容目标 |

因此：

- **路由层的 `auth:sanctum`** 负责"你是谁"（认证）；
- **Controller 层的 `tokenCant`** 负责"你能做什么"（授权）；
- **`accept-json`** 负责"你能接收什么格式"（内容协商）。

三者各司其职。简化任何一层都会要么扩大权限范围（方案 A），要么让兼容目标失效（方案 B）。

---

## 总结

1. `AcceptJsonMiddleware` 返回 `406 Not Acceptable`，与它检查的是 `Accept` 头而非 `Content-Type` 头是相互一致的：`Accept` 描述的是客户端愿意接收的媒体类型，`406` 正是"我不能给你你能接受的格式"；若检查 `Content-Type` 则应返回 `415`，语义是"我不理解你发来的格式"。
2. `/speedtest/latest` 是为 Homepage/Organizr 老仪表盘保留的**公共只读兼容入口**，所以不需要 Sanctum；而 v1 路由承担新版能力化 API，必须同时经过 `auth:sanctum`、`throttle:api`、`accept-json` 三道关卡，并在 Controller 内以 `tokenCant` 区分细粒度能力。两条线路分别对应"对外兼容"和"对内安全"的目标。
3. 去掉 `tokenCant` 会让 `results:read`、`speedtests:run`、`ookla:list-servers` 三类能力在 v1 全部 5 个接口上合并成一个大权限；反过来让旧兼容路由绕过认证却复用 v1 Controller 则会让 `results:read` 对匿名请求不可用，破坏兼容目标，甚至导致 500。两者皆不可取。
