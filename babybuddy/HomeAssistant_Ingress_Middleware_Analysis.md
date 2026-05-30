# BabyBuddy HomeAssistant Ingress 中间件深度分析

本文档基于 [middleware.py](file:///e:/solo-code-2/babybuddy/babybuddy/middleware.py) 中 `HomeAssistant` 类中间件的源码，对三个核心问题进行深入剖析。

---

## 一、`set_script_prefix` 与 `urlunsplit` 协同改写重定向 Location 头部

### 1.1 问题背景

Home Assistant 的 Ingress 服务充当反向代理，将外部客户端的请求通过子路径（如 `/hassio/ingress/baby_buddy/`）转发至内部运行的 BabyBuddy 实例。BabyBuddy 自身并不知道它运行在子路径之下，因此其生成的重定向 URL（如 `/settings/`）缺少 Ingress 前缀，外部客户端直接访问将会 404。

### 1.2 `set_script_prefix` 的前置作用

在 [middleware.py#L157-L160](file:///e:/solo-code-2/babybuddy/babybuddy/middleware.py#L157-L160) 中，中间件在调用 `self.get_response(request)` **之前**设置了 Django 的脚本前缀：

```python
if apply_x_ingress_path:
    set_script_prefix("/" + x_ingress_path.lstrip("/"))
else:
    set_script_prefix(self.original_script_prefix)
```

`set_script_prefix` 的作用是修改 Django 全局的 URL 前缀（存储在线程本地变量 `_prefixes` 中）。此后，整个请求生命周期中 Django 的 `reverse()`、`{% url %}` 模板标签、`request.build_absolute_uri()` 等所有 URL 生成函数都会自动将此前缀拼接到生成的 URL 路径之前。例如，当 `X-Ingress-Path` 为 `/hassio/ingress/baby_buddy` 时：

- `reverse("settings")` 原本返回 `/settings/`，现在返回 `/hassio/ingress/baby_buddy/settings/`
- 模板中 `{% static 'css/app.css' %}` 原本输出 `/static/css/app.css`，现在输出 `/hassio/ingress/baby_buddy/static/css/app.css`

这保证了视图函数和模板在生成 URL 时已经包含了 Ingress 前缀，大部分场景下不需要后续修正。

### 1.3 `urlunsplit` 对 Location 头部的后置修正

然而，并非所有重定向都能被 `set_script_prefix` 覆盖。某些视图可能使用硬编码路径、第三方库可能绕过 Django 的 URL 路由、或 Django 框架本身在某些边界情况下生成的重定向 URL 仍缺少前缀。因此，中间件在获取响应后对重定向响应进行**后置检查和修正**，逻辑位于 [middleware.py#L164-L181](file:///e:/solo-code-2/babybuddy/babybuddy/middleware.py#L164-L181)：

```python
if is_redirect_response:
    split_url = urlsplit(response["Location"])
    path_prefix = "/" + x_ingress_path.lstrip("/")
    if not split_url.path.startswith(path_prefix):
        new_url = urlunsplit(
            (
                split_url.scheme,
                split_url.netloc,
                "/" + x_ingress_path.lstrip("/") + split_url.path,
                split_url.query,
                split_url.fragment,
            )
        )
        response["Location"] = new_url
```

**执行流程**：

1. **识别重定向响应**：判断响应是否为 `HttpResponseRedirect` 实例，或状态码为 301/307/308。
2. **解析 Location URL**：使用 `urlsplit()` 将 Location 头部拆分为五元组 `(scheme, netloc, path, query, fragment)`。
3. **前缀检查**：检查 `path` 组件是否已经以 Ingress 前缀开头。如果是，说明 `set_script_prefix` 已生效，无需二次处理。
4. **重建 URL**：如果 path 缺少前缀，则用 `urlunsplit()` 将五元组重新组装，其中 `path` 被替换为 `"/" + x_ingress_path.lstrip("/") + split_url.path`，即在原始路径前插入 Ingress 子路径前缀。

**具体示例**：

假设 `X-Ingress-Path` 为 `/hassio/ingress/baby_buddy`，原始 Location 为 `/settings/`：

| 阶段 | 值 |
|------|-----|
| 原始 Location | `/settings/` |
| `urlsplit` 解析 | `(scheme='', netloc='', path='/settings/', query='', fragment='')` |
| 前缀检查 | `'/settings/'` 不以 `'/hassio/ingress/baby_buddy'` 开头 |
| 重建 path | `/hassio/ingress/baby_buddy/settings/` |
| `urlunsplit` 组装 | `/hassio/ingress/baby_buddy/settings/` |

**双重保障的设计思想**：`set_script_prefix` 是预防性的，在 URL 生成阶段就注入前缀；`urlunsplit` 是纠正性的，对已生成但不正确的 Location 进行修补。两者互为补充，确保任何情况下外部客户端都能获得正确的子路径 URL。

---

## 二、text/html 响应的 static/media URL 替换与 StreamingHttpResponse 的失效

### 2.1 为什么需要对 text/html 响应做 URL 替换

虽然 `set_script_prefix` 能让 Django 的模板标签（如 `{% static %}`）生成正确的带前缀 URL，但 HTML 页面中仍可能存在未经过 Django 模板系统的静态资源引用：

1. **第三方 Django 应用**：某些第三方 app 可能不使用 `{% static %}` 标签，而是在 JavaScript 或 HTML 中硬编码 `/static/...` 路径。
2. **前端框架**：Vue/React 等前端框架编译后的 HTML 中可能包含对静态资源的直接引用。
3. **动态生成的 HTML**：JavaScript 代码动态拼接的 URL 不会被服务端模板系统处理。

正因如此，中间件在 [middleware.py#L189-L214](file:///e:/solo-code-2/babybuddy/babybuddy/middleware.py#L189-L214) 对 `text/html` 响应体进行了暴力替换：

```python
if response["Content-Type"].lower().startswith("text/html"):
    content = response.content.decode()
    static_trunc = settings.STATIC_URL.rstrip("/")
    media_trunc = settings.MEDIA_URL.rstrip("/")

    content = (
        content.replace(
            f'"{static_trunc}',
            f'"{x_ingress_path}{static_trunc}',
        )
        .replace(
            f"'{static_trunc}",
            f"'{x_ingress_path}{static_trunc}",
        )
        .replace(
            f'"{media_trunc}',
            f'"{x_ingress_path}{media_trunc}",
        )
        .replace(
            f"'{media_trunc}",
            f"'{x_ingress_path}{media_trunc}",
        )
    )
```

**替换策略**：同时匹配双引号 `" ` 和单引号 `'` 作为 URL 的定界符，确保 HTML 属性中的 `/static/...` 和 `/media/...` 路径都被正确添加 Ingress 前缀。

根据 [base.py#L250](file:///e:/solo-code-2/babybuddy/babybuddy/settings/base.py#L250) 和 [base.py#L262](file:///e:/solo-code-2/babybuddy/babybuddy/settings/base.py#L262) 的配置：

- `STATIC_URL` 默认为 `"static/"`（可能包含 `SUB_PATH` 前缀），截尾后为 `"/static"` 或 `"static"`
- `MEDIA_URL` 默认为 `"media/"`，截尾后为 `"media"`

替换效果示例（假设 `x_ingress_path = "/hassio/ingress/baby_buddy"`）：

| 原始内容 | 替换后 |
|---------|--------|
| `href="/static/css/app.css"` | `href="/hassio/ingress/baby_buddy/static/css/app.css"` |
| `src='media/photo.jpg'` | `src='/hassio/ingress/baby_buddy/media/photo.jpg'` |

### 2.2 StreamingHttpResponse 为何失效

在 [middleware.py#L182-L188](file:///e:/solo-code-2/babybuddy/babybuddy/middleware.py#L182-L188) 中，中间件对 `StreamingHttpResponse` 仅记录了错误日志：

```python
elif isinstance(response, StreamingHttpResponse):
    logging.error(
        "HomeAssistant middleware: StreamingHttpResponse is not "
        "supported. Resulting URLs to home assistant ingress might "
        "be incorrect."
    )
```

**根本原因有三层**：

1. **`response.content` 不可用**：`StreamingHttpResponse` 不提供 `.content` 属性来获取完整的响应体。它的数据通过 `.streaming_content` 迭代器逐块（chunk）生成，无法像普通 `HttpResponse` 那样一次性 `decode()` 整个响应体进行字符串替换。

2. **分块边界切割 URL**：流式响应的数据块边界是随机的。一个 `/static/css/app.css` 的 URL 可能被拆分为两个 chunk：`...href="/stat` 和 `ic/css/app.css"...`。逐块进行字符串替换无法匹配到跨块的 URL 模式，导致替换不完整或产生错误拼接。

3. **流式响应不可重构**：即使能逐块处理，对修改后的内容还需要重新构建 `StreamingHttpResponse`，但原始的迭代器已经（部分）消费，且缺乏通用的方式将修改后的字符串重新包装为兼容的流式迭代器。

因此中间件选择了最安全的策略——**不做任何修改并记录错误**，避免产生错误的半成品替换，让运维人员知悉此限制。代码注释 `# Pray that the response works`（[middleware.py#L183](file:///e:/solo-code-2/babybuddy/babybuddy/middleware.py#L183)）也幽默地表达了这种无奈。

---

## 三、HttpResponse 重建时 Cookie 保留的必要性与安全影响

### 3.1 为什么需要重建 HttpResponse

当中间件对 HTML 内容完成 URL 替换后，响应体已经发生变化。Django 的 `HttpResponse.content` 是只读属性（内部由 `content` property 管理，赋值时需要通过 `HttpResponse()` 构造器或修改内部 `_container`），因此中间件选择**创建新的 `HttpResponse` 对象**来承载修改后的内容，位于 [middleware.py#L215-L232](file:///e:/solo-code-2/babybuddy/babybuddy/middleware.py#L215-L232)：

```python
filtered_headers = {
    key: value
    for key, value in response.headers.items()
    if not key.lower().startswith("content-")
}
preserved_cookies = copy.copy(response.cookies)
response = HttpResponse(
    content.encode(),
    status=response.status_code,
    content_type=response["Content-Type"],
    charset=response.charset,
    headers=filtered_headers,
)
response.cookies = preserved_cookies
```

### 3.2 Cookie 丢失的技术原因

在 Django 中，`Set-Cookie` 头部**不存储在 `response.headers` 中**，而是存储在 `response.cookies`（一个 `http.cookies.SimpleCookie` 对象）中。Django 在发送响应时，会从 `response.cookies` 对象自动生成 `Set-Cookie` 头部。

因此，`filtered_headers` 字典虽然过滤了 `content-*` 开头的头部并保留了其余头部，但 `Set-Cookie` 本身就不在 `response.headers.items()` 中——它只存在于 `response.cookies` 里。如果创建新的 `HttpResponse` 时不显式复制 `cookies`，新的响应对象将拥有一个空的 `cookies` 容器，所有 `Set-Cookie` 信息都会丢失。

### 3.3 Cookie 丢失的严重后果

#### CSRF 验证失效

Django 的 CSRF 防护机制要求：
1. 服务器在响应中通过 `Set-Cookie: csrftoken=<token>` 向客户端下发 CSRF 令牌。
2. 客户端在后续的 POST/PUT/DELETE 请求中必须携带该 Cookie，并在请求体或 `X-CSRFToken` 头部中提供相同的令牌值。

如果 `csrftoken` Cookie 在 Ingress 重建响应时丢失：
- 客户端浏览器不会存储 CSRF 令牌。
- 后续所有状态修改请求（表单提交、AJAX POST 等）都将因 CSRF 验证失败而被 Django 拦截，返回 **403 Forbidden**。
- 整个应用的写操作将完全瘫痪——用户无法修改设置、添加记录、上传文件等。

测试用例 [tests_home_assistant.py#L71-L90](file:///e:/solo-code-2/babybuddy/babybuddy/tests/tests_home_assistant.py#L71-L90) 明确验证了这一点：

```python
def test_ingress_html_preserves_response_cookies(self):
    response = self.c.get(
        "/login/",
        headers={
            "X-Hass-Source": "core.ingress",
            "X-Ingress-Path": "/hassio/ingress/baby_buddy",
        },
    )
    self.assertIn("text/html", response.get("Content-Type", ""))
    self.assertIn(
        "csrftoken",
        response.cookies,
        "Ingress HTML rewrite must preserve CSRF Set-Cookie",
    )
```

#### 会话保持失效

Django 的会话中间件通过 `Set-Cookie: sessionid=<session_key>` 维持用户登录状态。如果该 Cookie 丢失：
- 用户每次请求都会被视为未认证用户。
- 即使通过 Ingress 成功提交了登录表单，响应中不含 `sessionid` Cookie，浏览器不会存储会话标识。
- 用户的登录状态无法跨请求保持，实质上等同于**无法登录**。

#### Home Assistant Ingress 会话丢失

如 [homeassistant.md](file:///e:/solo-code-2/babybuddy/docs/configuration/homeassistant.md) 文档所述，通过 Ingress 访问时存在 `ingress_session` Cookie，该 Cookie 用于与 Home Assistant 的 Ingress 服务认证。如果丢失：
- 后续请求可能无法通过 Ingress 服务的认证检查。
- BabyBuddy 与外部应用（如 QR 码配对设备）的集成将失败。

### 3.4 `copy.copy` 的选择

注意中间件使用了 `copy.copy(response.cookies)`（浅拷贝）而非 `copy.deepcopy`。这是合理的，因为：
- `response.cookies` 是一个 `SimpleCookie` 对象，本质上是 `dict` 的子类。
- 浅拷贝会创建一个新的 `SimpleCookie` 实例，但内部的 Morsel 对象仍然是引用。
- 这足够保证原始响应被垃圾回收后 Cookie 信息不丢失，同时避免深拷贝带来的不必要性能开销。

### 3.5 安全隐患总结

| Cookie 类型 | 丢失后果 | 影响等级 |
|------------|---------|---------|
| `csrftoken` | 所有写操作 403，CSRF 防护机制完全失效 | **严重** |
| `sessionid` | 用户无法维持登录态，会话管理崩溃 | **严重** |
| `ingress_session` | Ingress 认证断裂，外部集成失败 | **高** |

若忽略 Cookie 复制，在 Home Assistant Ingress 场景下，BabyBuddy 将变成一个"只读且无法登录"的废应用——用户能看但无法操作，这是功能性故障而非安全隐患。但如果从安全角度审视，CSRF Cookie 丢失后，攻击者可能通过其他方式（如直接构造不带 CSRF 验证的请求）绕过防护，因此也构成潜在的安全风险。

---

## 总结

BabyBuddy 的 `HomeAssistant` 中间件通过 **三层防御** 确保 Ingress 子路径下的 URL 正确性：

1. **预防层**：`set_script_prefix` 在请求处理前注入全局前缀，使 Django 的 URL 生成自动包含子路径。
2. **纠正层**：`urlunsplit` 对重定向的 Location 头部进行后置修正，兜底处理未被子路径化的 URL。
3. **内容层**：对 HTML 响应体中的 `/static/` 和 `/media/` 路径进行字符串级替换，覆盖第三方应用和硬编码的引用。

同时，Cookie 保留机制确保了在响应重建过程中不会丢失关键的安全凭证（CSRF 令牌、会话 ID），这是维持 Ingress 场景下应用功能完整性和安全性的关键一环。
