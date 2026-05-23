# AcceptJsonMiddleware 与 Results 接口的行为分析

本文档围绕以下三个问题进行分析，涉及的核心文件：

- [AcceptJsonMiddleware.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/AcceptJsonMiddleware.php)
- [ResultsController.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php)
- [ResultResource.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Resources/V1/ResultResource.php)
- [ApiController.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ApiController.php)
- [routes/api.php](file:///e:/solo-code-2/speedtest-tracker/routes/api.php)
- [AcceptJsonMiddlewareTest.php](file:///e:/solo-code-2/speedtest-tracker/tests/Unit/AcceptJsonMiddlewareTest.php)

---

## 1. 客户端同时携带 `Accept: text/html` 与 `Accept: application/json` 访问 `GET /api/v1/results` 的行为

### 1.1 路由链路上的中间件顺序

在 [routes/api.php#L26-L28](file:///e:/solo-code-2/speedtest-tracker/routes/api.php#L26-L28) 中，`v1` 路由组绑定了三个中间件：

```php
Route::middleware(['auth:sanctum', 'throttle:api', 'accept-json'])->group(function () {
    require __DIR__.'/api/v1/routes.php';
});
```

也就是说请求在到达 [ResultsController::list](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L21-L71) 之前，会依次经过 Sanctum 认证、限流，最后是 `accept-json`（即 `AcceptJsonMiddleware`）。

### 1.2 `AcceptJsonMiddleware` 如何判断 Accept 头

关键判断代码位于 [AcceptJsonMiddleware.php#L20-L25](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/AcceptJsonMiddleware.php#L20-L25)：

```php
if (! $request->acceptsJson()) {
    return response()->json([
        'message' => 'This endpoint only accepts JSON. Please include "Accept: application/json" in your request headers.',
        'error' => 'Unsupported Media Type',
    ], Response::HTTP_NOT_ACCEPTABLE);
}
```

根据 Laravel 13 源码 [`InteractsWithContentTypes.php`](https://raw.githubusercontent.com/laravel/framework/13.x/src/Illuminate/Http/Concerns/InteractsWithContentTypes.php)，`acceptsJson()` 的实现是：

```php
public function acceptsJson()
{
    return $this->accepts('application/json');
}
```

**它只检查 `application/json`，不包含 `application/x-json`**（这是早期文档描述中的错误）。

而 `accepts()` 方法基于 Symfony `Request::getAcceptableContentTypes()` 解析 **全部** `Accept` 头——支持同一客户端在一次请求中通过多个 `Accept` 头或逗号分隔的单个头声明可接受的 MIME 类型。

当客户端发送：

```
Accept: text/html
Accept: application/json
```

Symfony 会把二者合并成一个列表：`['text/html', 'application/json']`。`acceptsJson()` 会遍历这个列表，只要包含 `application/json` 就返回 `true`。因此：

- **判断结果**：`acceptsJson()` 返回 `true`，不会被拒绝。
- 如果客户端只发送 `Accept: text/html`（不包含 `application/json`），则会被拒绝并返回 406。

### 1.3 最终的响应头与状态码

在 `acceptsJson()` 通过后，中间件执行 `$response = $next($request);` 进入控制器。`ResultsController::list` 返回 `ResultResource::collection($results)`，Laravel 会把它转换为 `JsonResponse`，并默认带 `Content-Type: application/json`。

随后的逻辑位于 [AcceptJsonMiddleware.php#L30-L34](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/AcceptJsonMiddleware.php#L30-L34)：

```php
if (! $response->headers->has('Content-Type') ||
    ! str_contains($response->headers->get('Content-Type'), 'application/json')) {
    $response->headers->set('Content-Type', 'application/json');
}
```

由于响应已经是 JSON，`Content-Type` 保持 `application/json`。

综合结论：

| 项目 | 值 |
| --- | --- |
| `acceptsJson()` 判断 | `true`（放行） |
| 状态码 | `200 OK`（若一切正常） |
| `Content-Type` | `application/json` |
| 响应体 | `ResultResource::collection` 序列化后的 JSON |

> 相关的单元测试可以参考 [AcceptJsonMiddlewareTest.php#L69-L81](file:///e:/solo-code-2/speedtest-tracker/tests/Unit/AcceptJsonMiddlewareTest.php#L69-L81) 中"接受多个 Accept 头，其中包含 `application/json`"的用例。

---

## 2. 中间件在 `$next` 之后再次检查 `Content-Type` 的意义

### 2.1 该检查的代码意图

检查逻辑（[AcceptJsonMiddleware.php#L30-L34](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/AcceptJsonMiddleware.php#L30-L34)）：

```php
if (! $response->headers->has('Content-Type') ||
    ! str_contains($response->headers->get('Content-Type'), 'application/json')) {
    $response->headers->set('Content-Type', 'application/json');
}
```

这段代码的作用不是"强制把任意响应变成合法 JSON"，而是"在响应已经被 Laravel 以 JSON 方式准备好之后，确保响应头与实际负载一致"。它只改头，不改 body。

### 2.2 为什么要在控制器返回后再做一次

Laravel 的路由分发会把控制器返回值做一次统一的"响应化"处理：

- 返回 `JsonResponse` 或 `ResourceCollection` 时，本身已经设置好 `Content-Type: application/json`。
- 返回普通 `array` 时，Laravel 会构造一个 `JsonResponse`（并仍然设置 JSON 头）。
- 返回 `response()` 默认情况下（不传 view）时，会得到 `Response` 对象，头可能是 `text/html` 或空。

中间件做这个二次检查，主要是为了兜底下面几种情况：

1. **控制器里不小心用了 `response($array)` 或原生 `Response`**：这种写法 Laravel 不会自动替换头为 `application/json`，但中间件会补一下。
2. **下游中间件修改了响应头**：例如某层中间件把 JSON 头意外覆盖，本中间件会把它改回来。
3. **自定义的 `Responsable` 实现**：返回了 JSON body 但忘记设置头。

**重要澄清**：关于"全局异常处理器默认返回 HTML 500 再经过本中间件时会被强制改回 JSON"的描述是**错误的**。当 `$next($request)` 抛出异常时，PHP 的异常传播机制会导致 `$next()` 调用后面的代码（即第 30-34 行）**不会执行**。异常会沿着中间件栈向上传播，最终被 Laravel 的异常处理器捕获。如果异常处理器返回的是 HTML 响应，这个响应**不会再经过 `AcceptJsonMiddleware` 的后半段**。因此，该中间件无法兜底异常场景下的响应头。

### 2.3 对资源转换和前端消费的影响

**对资源转换（`ResultResource`）几乎没有直接影响**：资源序列化是在响应生成阶段完成的，中间件只是事后补写一个头。只要响应体已经是 JSON 字符串，不会重新编码。

**对前端消费（或 SDK）有现实意义**：

- **关于 fetch**：`fetch` API **不存在**依据 `Content-Type` 自动解析 JSON 的行为。`response.json()` 是一个显式调用的方法，它直接尝试 `JSON.parse()` 响应体，**不依赖** `Content-Type` 头。无论 `Content-Type` 是 `application/json` 还是 `text/html`，只要 body 是合法 JSON，`response.json()` 都能成功解析。
- **关于 axios**：根据 axios v1.x 源码（[lib/defaults/index.js](https://github.com/axios/axios/blob/v1.x/lib/defaults/index.js)），默认的 `transformResponse` **不依赖 `Content-Type` 头**。它的逻辑是：当 `forcedJSONParsing` 为 `true`（默认值）且响应数据是非空字符串时，就会尝试 `JSON.parse()`，无论 `Content-Type` 是什么。只有当 `responseType` 显式设置为 `'json'` 且 `silentJSONParsing` 为 `false` 时，解析失败才会抛出错误。因此，即使 `Content-Type` 是 `text/html`，只要 body 是合法 JSON，axios 默认也会自动解析。
- 基于 `Content-Type` 做响应路由的网关/代理（如 Nginx 子请求缓存、WAF、CDN）会错误地把 JSON 响应当作 HTML，导致缓存键不匹配或压缩策略出错。
- OpenAPI 客户端生成器通常根据 `Content-Type` 选择反序列化器，头错误会导致解析失败。

**关于测试断言的重要澄清**：Laravel 的 `assertJson()` 方法**不依赖** `Content-Type` 头。它直接对响应内容调用 `json_decode()` 进行解码。因此，即使 `Content-Type` 是 `text/html`，只要 body 是合法的 JSON，`assertJson()` 仍然可以正常工作。之前文档中关于"它们依赖 `Response::isJson()`"的描述是**不准确的**。

### 2.4 一个值得注意的边界情况

**该中间件并不会把 HTML body 转成 JSON**。如果上游某层返回了一段 HTML 字符串，但被中间件强行改成 `application/json`，前端拿到的是"声明为 JSON、实际是 HTML"的响应，会直接在解析阶段报错。这既是兜底，也是一个潜在的"头体不一致"风险，需要靠下游控制器/异常处理器确保 body 真的是 JSON。

单元测试 [AcceptJsonMiddlewareTest.php#L101-L113](file:///e:/solo-code-2/speedtest-tracker/tests/Unit/AcceptJsonMiddlewareTest.php#L101-L113) 覆盖了"原本没有设置 JSON 头时，中间件补写头"的场景。

---

## 3. `ResultsController` 中 page.size 校验、token 权限、QueryBuilder 过滤、资源序列化的执行顺序

以 [ResultsController::list](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L21-L71) 为主线梳理：

```
请求进入
  │
  ▼
① Laravel 路由匹配 + 中间件栈（auth:sanctum → throttle:api → accept-json）
  │  accept-json 先做 Accept 头检查
  ▼
② token 权限判断（[ResultsController.php#L23-L29](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L23-L29)）
  │  if ($request->user()->tokenCant('results:read')) { return 403; }
  ▼
③ page.size 校验（[ResultsController.php#L30-L40](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L30-L40)）
  │  Validator::make(..., ['page.size' => 'integer|min:1|max:...'])
  │  失败 → 422
  ▼
④ QueryBuilder 过滤 + 分页（[ResultsController.php#L42-L68](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L42-L68)）
  │  QueryBuilder::for(Result::class)
  │      ->allowedFilters([...])
  │      ->allowedSorts([...])
  │      ->jsonPaginate();
  │  注意：jsonPaginate() 调用时**已经执行了分页查询**
  ▼
⑤ 资源序列化（[ResultsController.php#L70](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L70)）
  │  ResultResource::collection($results)
  │  注意：此方法**不负责查询**，只负责资源包装和序列化
  ▼
⑥ 再次经过 AcceptJsonMiddleware 的后半段 → 补写 Content-Type → 返回响应
```

顺序总结：

1. 中间件层（Accept 头、认证、限流）
2. token 权限
3. `page.size` 校验
4. QueryBuilder 过滤与分页（`jsonPaginate()` 调用时**已执行 SQL 查询**，返回 Paginator 实例）
5. `ResultResource::collection()` → 将 Paginator 包装为资源集合，在响应发送时触发 `jsonSerialize` 进行序列化

**重要澄清**：之前文档中"构造查询但还未真正执行 SQL"的描述是**不准确的**。Spatie QueryBuilder 的 `jsonPaginate()` 方法在调用时就会执行分页查询（调用底层的 `paginate()` 方法），返回一个包含查询结果的 Paginator 实例。而 `ResultResource::collection()` 不负责查询，它只是将已有的 Paginator 包装成资源集合，在 Laravel 发送响应时负责序列化。

### 3.1 最容易出现"请求被允许但最终拿不到数据"错觉的位置

按"看似成功、其实空"的风险从高到低排序：

#### 场景 A：合法 filter 但无匹配结果（最常见）

- 触发位置：第 4 步 `QueryBuilder`。
- 行为：`allowedFilters` 里声明的字段都是白名单式的——客户端传了合法 filter 但值没有匹配，SQL 返回空集。
- 结果：`ResultResource::collection(...)` 返回一个空数组，整个响应是 `200 OK`，body 形如 `{"data": [], "links": {...}, "meta": {...}}`。
- 错觉：客户端看到"HTTP 200、格式完全正确"，很难立刻意识到是过滤条件过严。

**关于未允许 filter 的重要澄清**：之前文档中"客户端传了不被允许的 filter，会被静默忽略"的描述是**不准确的**。根据 Spatie QueryBuilder 的默认配置（`disable_invalid_filter_query_exception` 默认为 `false`），传入未在 `allowedFilters()` 中声明的 filter 会**抛出 `InvalidFilterQuery` 异常**，返回 400 Bad Request，而不是静默忽略。只有当配置 `query-builder.disable_invalid_filter_query_exception` 为 `true` 时，才会静默忽略未允许的 filter。

#### 场景 B：`page.size` 超限但 `max_results` 非常大，或页号过大

- 触发位置：第 3 步的 `Validator`。
- 行为：`page.size` 只在超过 `config('json-api-paginate.max_results')` 或小于 1 时才失败；否则正常继续。而 `page.number` 没有显式校验，当 `page.number` 超过总页数时，Spatie jsonApiPaginate 依然会返回一个 `data: []`，不会抛错。
- 错觉：请求者翻到一个不存在的页码，看到空列表，以为"没有数据"，而不是"页码超出范围"。

#### 场景 C：token 权限判断的"伪放行"

- 触发位置：第 2 步 `tokenCant('results:read')`。
- 行为：这一步 **不会** 在没有权限时抛异常，而是通过 `sendResponse(..., code: 403)` 返回。见 [ApiController::sendResponse](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ApiController.php#L21-L37)：
  ```php
  $response = array_filter([
      'data' => $data,
      'filters' => $filters,
      'message' => $message,
  ]);
  ```
  当 `$data = null` 时，`array_filter` 会把 `data` 键整个删掉。最终返回体是：
  ```json
  {"message": "You do not have permission to view results."}
  ```
  并且 **status 是 403**，所以这个本身不会误导。
- 潜在错觉点：如果前端只根据 `data` 是否存在来判断成功与否，就可能把 403 当成"无数据"。正确做法应当以 HTTP 状态码为准。

#### 场景 D：`latest` / `show` 在没有数据时的行为

- [ResultsController::latest](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L103-L118) 使用 `firstOrFail()`，没有结果会抛 `ModelNotFoundException`，被 Laravel 转成 404，不会给 200。
- [ResultsController::show](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/Api/V1/ResultsController.php#L77-L96) 使用 `Result::findOr(..., function () { ... HttpResponseException(404) })`，也是明确的 404。
- 这两条路径不会产生"假 200"，但如果前端对 404 统一按"无数据"处理，仍会有认知偏差。

#### 场景 E：`AcceptJsonMiddleware` 放行 + 权限 403 的组合

- 浏览器/前端库请求时通常会带 `*/*` 或 `application/json`，中间件必然放行。
- 但是 token 权限 403 的响应体里没有 `data` 字段（因为被 `array_filter` 过滤掉）。
- 如果前端把"没有 `data` 字段"当成"空集合"，而不是看状态码，就会产生"请求允许但拿不到数据"的错觉。

### 3.2 小结：最容易出错的是哪一步

**最容易出现"请求被允许但最终拿不到数据"错觉的位置是第 4 步 QueryBuilder 过滤与分页**。原因是：

1. 对于合法但无匹配的 filter，这一步的失败是"静默"的——既不抛异常，也不改状态码，只是让 SQL 结果变空。
2. 结果会被 `ResultResource` 正常序列化，HTTP 状态码仍然是 200，返回结构完全合法，难以在客户端用"结构检查"来识别。
3. `page.number` 超过总页数时，Spatie 库会返回空集合但不报错，和"真的没有数据"无法从响应结构上区分（注意：`page.size` 的边界已在第 3 步被 Validator 拦截，不会到达此步骤）。

建议在排障时，优先从以下角度验证：

- 打开数据库查询日志，确认实际执行的 SQL 与 `WHERE` 条件。
- 在响应里检查 `meta.total` / `meta.per_page` / `meta.current_page`，判断是"真无数据"还是"分页越界/过滤过严"。
- 前端不要仅凭 `data` 是否为空数组判断请求是否成功，要结合状态码、错误消息、`meta.total` 综合判断。
- 如果遇到 400 错误，检查是否传入了未允许的 filter 参数。
