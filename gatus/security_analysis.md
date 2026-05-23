# security 包认证机制深度分析

本文档针对 Gatus `security` 包中 OIDC / BasicAuth 两种认证方式的三处关键实现细节进行深度分析。

---

## 1. BasicAuth `Authorizer` 的无条件返回 true 漏洞

### 1.1 代码位置

- [security/config.go:68-90](file:///e:/solo-code-2/gatus/security/config.go#L68-L90)（`ApplySecurityMiddleware` 中的 `basicauth.New` 调用）
- [security/basic.go](file:///e:/solo-code-2/gatus/security/basic.go)（`BasicConfig` 及其 `isValid`）
- [config/config.go:577-581](file:///e:/solo-code-2/gatus/config/config.go#L577-L581)（`ValidateSecurityConfig`）

### 1.2 漏洞的具体形态

```go
router.Use(basicauth.New(basicauth.Config{
    Authorizer: func(username, password string) bool {
        if len(c.Basic.PasswordBcryptHashBase64Encoded) > 0 {
            if username != c.Basic.Username ||
                bcrypt.CompareHashAndPassword(decodedBcryptHash, []byte(password)) != nil {
                return false
            }
        }
        return true   // ← 当 PasswordBcryptHashBase64Encoded 为空时直接走这里
    },
    ...
}))
```

逻辑结构呈"**否定即拒绝，否则放行**"的反模式：只有在 `PasswordBcryptHashBase64Encoded` 非空时才会真正校验用户名与 bcrypt 哈希；一旦字符串为空（无论原因），整个函数退化为 `return true`，任何用户名 + 任何密码（甚至空密码）都会通过认证。

### 1.3 对 `isValid()` 保护范围的重新审视

之前的分析中提到"`isValid()` 的保护只覆盖了标准启动路径"，并列举了"反射热重载置空""测试代码直接构造"等绕过路径。经过对 Gatus 完整启动链路和热重载链路的逐行追溯，**这一论断需要修正**。

#### 1.3.1 标准启动链路中的完整保护

调用链如下：

1. [main.go:30](file:///e:/solo-code-2/gatus/main.go#L30) → `loadConfiguration()` → `config.LoadConfiguration(configPath)`
2. [config/config.go:305](file:///e:/solo-code-2/gatus/config/config.go#L305) → `ValidateSecurityConfig(config)`
3. [config/config.go:577-581](file:///e:/solo-code-2/gatus/config/config.go#L577-L581) → `config.Security.ValidateAndSetDefaults()`
4. [security/config.go:30-32](file:///e:/solo-code-2/gatus/security/config.go#L30-L32) → `c.Basic.isValid()`
5. [security/basic.go:14-16](file:///e:/solo-code-2/gatus/security/basic.go#L14-L16) → 检查 `len(c.Username) > 0 && len(c.PasswordBcryptHashBase64Encoded) > 0`

当 `PasswordBcryptHashBase64Encoded` 为空时，`isValid()` 返回 `false` → `ValidateAndSetDefaults()` 返回 `false` → `ValidateSecurityConfig` 返回 `ErrInvalidSecurityConfig` → `LoadConfiguration` 返回 `nil, err` → [main.go:32](file:///e:/solo-code-2/gatus/main.go#L32) 处 `panic(err)`。

**在标准启动链路中，`PasswordBcryptHashBase64Encoded` 为空时，流程一定会在 `ValidateSecurityConfig` 处被中止，不会走到 `ApplySecurityMiddleware`。**

#### 1.3.2 热重载链路中的完整保护

[main.go:226-251](file:///e:/solo-code-2/gatus/main.go#L226-L251) 的 `listenToConfigurationFileChanges`：

1. 检测到配置文件修改 → 调用 `stop(cfg)` 关闭旧服务
2. 调用 `loadConfiguration()` 加载新配置 → 同样经过 `ValidateSecurityConfig`
3. 如果新配置无效：`SkipInvalidConfigUpdate=true` 时记录错误并继续使用旧配置（[main.go:236-241](file:///e:/solo-code-2/gatus/main.go#L236-L241)）；否则 panic

**在热重载链路中，`PasswordBcryptHashBase64Encoded` 为空的新配置同样会被 `ValidateSecurityConfig` 拦截，旧配置继续生效。**

#### 1.3.3 关于"绕过路径"的澄清

之前列举的绕过路径中：

- **"反射热重载置空"**：Gatus 的热重载实现是直接调用 `loadConfiguration()` 重新解析 YAML 文件，不存在通过反射修改已加载配置字段的路径。此路径为**臆造**，在 Gatus 代码中不存在。
- **"测试代码直接构造"**：测试代码（如 [security/config_test.go:98-101](file:///e:/solo-code-2/gatus/security/config_test.go#L98-L101)）确实可以直接构造 `Config{Basic: &BasicConfig{...}}` 并调用 `ApplySecurityMiddleware`，完全绕过 `ValidateSecurityConfig`。但这**不属于 Gatus 生产启动/热重载链路**，仅在测试场景中存在。
- **"其他调用方绕开 ValidateAndSetDefaults"**：在 Gatus 代码库中，所有对 `ApplySecurityMiddleware` 的调用都经由 [api/api.go:127](file:///e:/solo-code-2/gatus/api/api.go#L127)，而该处的 `cfg` 来自 `config.LoadConfiguration`，已经过 `ValidateSecurityConfig` 校验。不存在绕过路径。

**结论：在 Gatus 生产启动和热重载链路中，`isValid()` 的保护是完整的，不会出现 `PasswordBcryptHashBase64Encoded` 为空却到达 `ApplySecurityMiddleware` 的情况。** 但 `Authorizer` 闭包本身的防御缺失仍然是一个**代码质量隐患**——它将安全性依赖于外部调用者的前置校验，而非自包含的防御。如果未来有人在新的代码路径中直接调用 `ApplySecurityMiddleware`（不经过 `ValidateSecurityConfig`），漏洞就会暴露。

### 1.4 漏洞根源的重新归纳

排除之前的臆造路径后，漏洞的真正根源是**两层代码的语义错位**：

1. **`Authorizer` 的反模式实现**
   采用"**否定即拒绝，否则放行**"模式（`if ... { return false }; return true`），而非"**通过才 true**"模式。这使得 `Authorizer` 本身不具备自验证能力，必须依赖外部保证 `PasswordBcryptHashBase64Encoded` 非空。

2. **`PasswordBcryptHashBase64Encoded` 的双重语义**
   `if len(c.Basic.PasswordBcryptHashBase64Encoded) > 0` 在 `Authorizer` 内部同时承担了"是否需要执行校验"和"校验是否通过"的开关角色。外层 `isValid()` 已保证了非空，但内层又重复判断，形成了冗余且脆弱的双重语义。

3. **配置与运行时耦合的脆弱性**
   `ApplySecurityMiddleware` 外层已经做了 base64 解码（[config.go:69-76](file:///e:/solo-code-2/gatus/security/config.go#L69-L76)），但 `Authorizer` 闭包又重复读取了 `c.Basic.PasswordBcryptHashBase64Encoded` 的长度，而非直接依赖已解码的 `decodedBcryptHash`。这种"双源读取"使得未来若外层解码失败被静默吞掉，内层可能产生意外的放行行为。

### 1.5 建议的修复

```go
Authorizer: func(username, password string) bool {
    if len(c.Basic.PasswordBcryptHashBase64Encoded) == 0 {
        return false // 没有配置哈希 = 不允许任何认证
    }
    return username == c.Basic.Username &&
        bcrypt.CompareHashAndPassword(decodedBcryptHash, []byte(password)) == nil
}
```

同时建议在 `ApplySecurityMiddleware` 入口处对 `c.Basic.PasswordBcryptHashBase64Encoded` 做硬性断言，将防御从"依赖外部前置校验"提升为"自包含防御"。

---

## 2. OIDC 回调与登录处理使用不同 HTTP 抽象层的 Cookie 兼容性风险

### 2.1 代码位置

- OIDC 登录处理（fiber 原生）：[security/oidc.go:59-78](file:///e:/solo-code-2/gatus/security/oidc.go#L59-L78) `loginHandler(ctx *fiber.Ctx)`
- OIDC 回调处理（net/http，通过 adaptor 桥接）：[security/oidc.go:80-137](file:///e:/solo-code-2/gatus/security/oidc.go#L80-L137) `callbackHandler(w http.ResponseWriter, r *http.Request)`
- 中间件注册：[security/config.go:41](file:///e:/solo-code-2/gatus/security/config.go#L41) `router.All("/authorization-code/callback", adaptor.HTTPHandlerFunc(c.OIDC.callbackHandler))`
- 会话 Cookie 写入：[security/oidc.go:139-149](file:///e:/solo-code-2/gatus/security/oidc.go#L139-L149) `setSessionCookie(w http.ResponseWriter, ...)`

### 2.2 两套抽象层的结构差异

| 维度 | `fiber.Ctx`（fasthttp 原生） | `http.ResponseWriter` / `*http.Request`（net/http，经 adaptor 转换） |
|------|------------------------------|----------------------------------------------------------------------|
| 请求头存储 | `fasthttp.Request.Header`（扁平字节切片 `[]byte`） | `http.Header`（`map[string][]string`） |
| Cookie 读取 | `ctx.Cookies("name")` — 基于 fasthttp 的 `Request.Header.Cookie()` | `r.Cookie("name")` — 基于 `http.Request` 的 Header.Cookies() 解析 |
| Cookie 写入 | `ctx.Cookie(&fiber.Cookie{Name, Value, SameSite: "lax", ...})` | `http.SetCookie(w, &http.Cookie{Name, Value, SameSite: http.SameSiteStrictMode, ...})` |
| `SameSite` 类型 | `string`（自定义 `"lax"` / `"strict"` / `"none"`） | `http.SameSiteMode` 枚举（`SameSiteLaxMode = 2`、`SameSiteStrictMode = 3`） |
| 响应头写入 | `fasthttp.Response.Header.Add("Set-Cookie", ...)` | `http.ResponseWriter.Header().Add("Set-Cookie", ...)` |

### 2.3 Cookie 读写路径上的不兼容风险

#### 2.3.1 `loginHandler`（fiber）写 Cookie vs `callbackHandler`（net/http）读 Cookie

这是**最核心的不一致**，存在真实的兼容性风险：

1. **`SameSite` 语义漂移**
   - `loginHandler` 中 `SameSite: "lax"` 使用 fiber 字符串形式；
   - `setSessionCookie`（在 callback 内调用）使用 `http.SameSiteStrictMode` 枚举值（`Strict`）。
   两套 Cookie 对 `SameSite` 采用了不同的级别。若 callback 依赖 login 阶段种下的 state/nonce Cookie 的 `SameSite` 属性，浏览器的第三方上下文策略差异会导致不同浏览器下的不同结果。

2. **Cookie 解析方式的字节序列差异（分隔符层面的修正）**
   之前的论断声称"fasthttp 支持 `;` 与 `; `，net/http 强制 `; `"——这一描述需要**修正**。

   通过直接查阅 fasthttp v1.71.0 与 Go 1.26.3 net/http 的 Cookie 解析源码：

   - **fasthttp**（[cookie.go:568-604](file:///C:/Users/90821/go/pkg/mod/github.com/valyala/fasthttp@v1.71.0/cookie.go#L568-L604) `cookieScanner.next`）：逐字节扫描，以 `;` 作为分隔符，分隔后**显式跳过恰好一个尾随空格**（`if j < len(b) && b[j] == ' ' { j++ }`）。这意味着 `;`（无空格）和 `; `（一个空格）都能被正确解析，但如果有两个或更多空格，fasthttp 只跳过第一个，其余空格会残留到下一个 cookie-pair 的名称前。

   - **net/http**（[cookie.go:95](file:///C:/Users/90821/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.3.windows-amd64/src/net/http/cookie.go#L95) `ParseCookie` 使用 `strings.Split` + `textproto.TrimString`；[cookie.go:393-395](file:///C:/Users/90821/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.3.windows-amd64/src/net/http/cookie.go#L393-L395) `readCookies` 使用 `strings.Cut` + `textproto.TrimString`）：以 `;` 作为分隔符，分隔后对每个部分调用 `textproto.TrimString`，这会**去除两端的所有空白字符**（空格、制表符等）。因此 `;`、`; `、`;  `（两个空格）、`;\t`（制表符）都能被正确解析。

   **结论：在分隔符层面，两者对 `;`（无空格）和 `; `（一个空格）都能正确解析，不存在"一方能解析而另一方解析失败"的确定性差异。** 两者在分隔符处理上的细微差异是：fasthttp 对分号后恰好一个空格做了显式跳过，但多个空格会残留；net/http 则用 `TrimString` 去除了所有前导/尾随空白，容错性更强。但这个差异不会导致"找不到 Cookie"的确定性失败，最多在极端情况下（反向代理注入多个空格）导致 fasthttp 侧的 cookie 名称包含前导空格，从而匹配失败。

   当反向代理（Nginx / Envoy / Cloudflare）**合并、重写或注入 Cookie 请求头**（例如添加 `__Secure-` 前缀、重写 `Path`、将多个 `Cookie:` 头合并成一个）时，真正的风险在于：
   - 反向代理若对 Cookie 值做了 URL 解码/转义，两边的解码行为不同会导致 `state` / `nonce` 值不匹配，进而在 [oidc.go:92-95](file:///e:/solo-code-2/gatus/security/oidc.go#L92-L95) 与 [oidc.go:118-121](file:///e:/solo-code-2/gatus/security/oidc.go#L118-L121) 校验失败；
   - 反向代理若将多个 `Cookie:` 头合并为一个，fasthttp 的 `cookieScanner` 是逐字节流式解析，合并后的长字符串仍能正确解析（因为分隔符 `;` 始终存在）。

#### 2.3.2 `Protect` 中间件 vs `IsAuthenticated`：对"两套解析器"论断的修正

之前的分析中提到"`IsAuthenticated` 与中间件 `Protect` 对同一个 `gatus_session` Cookie 的读取走了两套解析器"，**这一论断是错误的，需要修正**。

让我们追溯两条路径的完整调用链：

**`Protect` 中间件路径**（[security/config.go:67](file:///e:/solo-code-2/gatus/security/config.go#L67)）：
```
adaptor.HTTPMiddleware(c.gate.Protect)
  → c.gate.Protect(http.Handler) http.Handler        // g8 的 HTTP 中间件
    → c.gate.ExtractTokenFromRequest(*http.Request) // g8 内部方法
      → customTokenExtractorFunc(*http.Request)     // 我们注入的提取器
        → request.Cookie(cookieNameSession)         // net/http 标准库
```

**`IsAuthenticated` 路径**（[security/config.go:97-110](file:///e:/solo-code-2/gatus/security/config.go#L97-L110)）：
```
IsAuthenticated(ctx *fiber.Ctx)
  → adaptor.ConvertRequest(ctx, false)               // fiber.Ctx → *http.Request
  → c.gate.ExtractTokenFromRequest(*http.Request)   // g8 内部方法（与上面同一个）
    → customTokenExtractorFunc(*http.Request)       // 我们注入的同一个提取器
      → request.Cookie(cookieNameSession)           // net/http 标准库
```

两条路径都通过 `c.gate.ExtractTokenFromRequest()` → `customTokenExtractorFunc` → `*http.Request.Cookie()` 解析 Cookie，**使用的是完全相同的解析器**（net/http 标准库的 `*http.Request.Cookie()`）。`IsAuthenticated` 并没有直接使用 fasthttp 的 `ctx.Cookies()` 方法，而是先通过 adaptor 转换为 `*http.Request` 后再走与 g8 中间件完全相同的路径。

**结论：`Protect` 中间件与 `IsAuthenticated` 在读取 `gatus_session` Cookie 时走的是同一套解析器，不存在"两套解析器"的不一致问题。** 这意味着之前提到的"中间件说已登录，`IsAuthenticated` 说未登录"的不一致状态在这两条路径之间不会发生。

#### 2.3.3 `Set-Cookie` 响应头在 adaptor 层的传递方式

adaptor 将 `http.ResponseWriter.Header()` 的改动写回到 fasthttp 的 `Response.Header`，其实现依赖于 header key 的规范化（大小写）。若反向代理或者上游中间件对 `Set-Cookie` 做了 case-sensitive 的扫描（例如 WAF 规则只匹配 `Set-cookie`），就可能丢失 callback 阶段写入的 session Cookie。

#### 2.3.4 多值 `Set-Cookie` 头被合并的风险

HTTP/1.1 中 `Set-Cookie` 必须每条 Cookie 独占一行，不能合并；而 HTTP/2 / HTTP/3 要求合并。fasthttp 默认按行输出，net/http 也按行输出。但 adaptor 在做转换时会调用 `http.ResponseWriter.Header().Add`，如果回调阶段同时写入了多条 Cookie（本代码当前只写一条，但未来可能扩展），fasthttp 与 net/http 的 Header 合并方式可能产生"多个值被拼接到同一行"的中间态，被反向代理或浏览器错误解析。

#### 2.3.5 TODO 暴露的设计意图

`callbackHandler(w http.ResponseWriter, r *http.Request) // TODO: Migrate to a native fiber handler` 说明作者已经意识到这一不一致。只要 TODO 未落地，上述"登录写 Cookie 走 fiber、回调读 Cookie 走 net/http"的不对称风险就持续存在。

### 2.4 建议

- 将 `callbackHandler` 重写为原生 fiber handler，消除 adaptor 引入的 Header 规范化差异；
- 统一 `SameSite` 语义（建议均使用 `http.SameSiteLaxMode` 或 `fiber.Cookie{SameSite:"lax"}`），并配合反向代理的 Cookie 策略；
- 在反向代理侧明确不对 `gatus_state` / `gatus_nonce` / `gatus_session` 做重写，或至少保证分隔符、大小写与转义保持一致。

---

## 3. OIDC 会话 TTL 热重载对旧会话的影响

### 3.1 代码位置

- 全局缓存：[security/sessions.go](file:///e:/solo-code-2/gatus/security/sessions.go)
  ```go
  var sessions = gocache.NewCache().WithEvictionPolicy(gocache.LeastRecentlyUsed) // TODO: Move this to storage
  ```
- 会话创建：[security/oidc.go:139-149](file:///e:/solo-code-2/gatus/security/oidc.go#L139-L149)
  ```go
  sessions.SetWithTTL(sessionID, idToken.Subject, c.SessionTTL)
  ```
- TTL 默认值与热重载：[security/oidc.go:35-40](file:///e:/solo-code-2/gatus/security/oidc.go#L35-L40) `ValidateAndSetDefaults`

### 3.2 gocache 的 `SetWithTTL` 语义（基于 `github.com/TwiN/gocache/v2`）

`gocache` 的 `SetWithTTL(key, value, ttl)` 在条目内部保存的是"**创建时的 TTL 快照**"（即一个绝对过期时间 `time.Now() + ttl` 或 TTL 常量 + 写入时间戳），而**不是**"延迟到 `Get` 时再去读取某个全局配置值"。后续对 `c.SessionTTL` 的修改只影响**新写入**的条目，不会回溯性地改变已写入条目的过期时间。

因此问题 3 的结论是：**已经存在的旧会话会按创建时的原始 TTL 继续存活，不会按新的 TTL 被提前驱逐**。

### 3.3 进一步分析：为什么"缩短 TTL"也不会影响旧会话

1. **LRU 驱逐与 TTL 是两条独立的路径**
   gocache 内部对每个条目同时维护：
   - LRU 链表顺序（反映访问热度）；
   - 过期时间戳（由 `SetWithTTL` 写入 TTL 时计算）。
   热重载只会改变 `c.SessionTTL` 这个"写入新条目时传入的参数"，不会修改缓存内已有条目的过期时间戳或 LRU 链表位置。

2. **LRU 没有容量上限（`sessions` 未调用 `WithMaxSize`）**
   代码中仅调用了 `WithEvictionPolicy(gocache.LeastRecentlyUsed)`，未调用 `WithMaxSize`。这意味着 LRU **永远不会因为容量被占满而驱逐任何条目**——LRU 只有"容量上限被触发"时才会工作。所以旧会话的生存周期**完全由各自的 TTL 决定**，短 TTL 的新会话不会把长 TTL 的旧会话挤走。

3. **热重载路径并不会重建 `sessions`**
   `sessions` 是包级 `var`，没有任何代码对它重新赋值。热重载即使销毁并重建 `security.Config`，也不会触发 `sessions = gocache.NewCache()...`，旧条目得以保留并按原始 TTL 继续计时。

4. **潜在的反向风险：旧的长 TTL 会话在安全策略收紧后依然有效**
   管理员把 `SessionTTL` 从 8 小时缩短到 10 秒，希望快速收回会话，但已登录的 8 小时会话仍然会再存活数小时。如果缩短 TTL 的意图是"紧急失效"，该机制无法达到目的。反之，若把 TTL 拉长，旧会话同样不会被自动延长，而是按原 TTL 到期后让用户重新登录。

### 3.4 建议

- 若业务需要"收紧 TTL 立即生效"，应在热重载后显式遍历 `sessions` 并对 TTL 超过新值的条目进行 `Delete` 或重新写入；
- 给 `sessions` 加上合理的 `WithMaxSize`，避免 LRU 无上限带来的内存泄漏风险（当前仅靠 TTL 兜底）；
- 若需要动态 TTL，可在 `clientProvider`（[config.go:51-56](file:///e:/solo-code-2/gatus/security/config.go#L51-L56)）命中时主动校验过期时间并按新 TTL 重新 `SetWithTTL`，实现滑动续期 + 立即收紧的双重效果。

---

## 小结

| 问题 | 关键结论 |
|------|----------|
| BasicAuth 无条件放行 | 在 Gatus 生产启动/热重载链路中，`isValid()` 的保护是完整的，`PasswordBcryptHashBase64Encoded` 为空时流程不会到达 `ApplySecurityMiddleware`。但 `Authorizer` 闭包的"否定即拒绝，否则放行"反模式构成代码质量隐患，建议改为"通过才 true"并做硬性断言。 |
| Cookie 跨抽象层兼容性 | 核心风险在于 `loginHandler`（fiber）写 Cookie 与 `callbackHandler`（net/http）读 Cookie 之间的不对称，以及 `SameSite` 语义不一致。分隔符层面，fasthttp 与 net/http 对 `;` 和 `; ` 都能正确解析，不存在确定性差异。`Protect` 中间件与 `IsAuthenticated` 在读取 `gatus_session` Cookie 时走的是**同一套解析器**（均为 net/http 标准库），不存在两套解析器的不一致。 |
| 热重载 TTL 对旧会话的影响 | 旧会话按创建时的原始 TTL 继续存活，LRU 未设 `WithMaxSize` 也不会因新写入驱逐旧会话；收紧 TTL 时需额外主动清理。 |
