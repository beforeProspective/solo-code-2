# flatnotes 登录鉴权流程分析

本文档围绕 `client/api.js`、`client/tokenStorage.js` 与 `server/auth/local/local.py` 三个核心文件，对 flatnotes 本地身份认证流程进行梳理与分析，重点覆盖：TOTP 双因子拼接校验、JWT 令牌载荷与双来源提取、以及退出登录时的 Cookie 与令牌废弃机制。

---

## 1. 双因子动态验证（TOTP）的拼接与防重放

### 1.1 前端：密码与动态验证码的拼接发送

入口函数位于 [api.js#56-66](file:///e:/solo-code-2/flatnotes/client/api.js#L56-L66)：

```js
export async function getToken(username, password, totp) {
  try {
    const response = await api.post("api/token", {
      username: username,
      password: totp ? password + totp : password,
    });
    return response.data.access_token;
  } catch (response) {
    return Promise.reject(response);
  }
}
```

关键要点：

- 当页面触发登录时，若用户启用了双因子（`totp` 参数非空），前端会将**静态密码字符串与 6 位 TOTP 数字直接做字符串拼接**（`password + totp`），并作为 `password` 字段值提交给 `POST api/token`。
- 若未启用 TOTP，则原样发送密码。整个拼接过程发生在浏览器内存中，由 HTTPS 链路保护传输，没有额外加密算法。
- `username` 与 `password` 放在 JSON 请求体里（axios 默认 `application/json`），通过 axios 实例发送；由于拦截器对 `api/token` 路径做了跳过处理，不会附带旧的 `Authorization` 头，避免旧 token 干扰新 token 的签发。

### 1.2 后端：解密（拼接校验）与防重放判定

入口位于 [local.py#43-74](file:///e:/solo-code-2/flatnotes/server/auth/local/local.py#L43-L74)：

```python
def login(self, data: Login) -> Token:
    username_correct = secrets.compare_digest(
        self.username.lower(), data.username.lower()
    )

    expected_password = self.password
    if self.is_totp_enabled:
        current_totp = self.totp.now()
        expected_password += current_totp
    password_correct = secrets.compare_digest(
        expected_password, data.password
    )

    if not (
        username_correct
        and password_correct
        and (
            self.is_totp_enabled is False
            or current_totp != self.last_used_totp
        )
    ):
        raise ValueError("Incorrect login credentials.")
    if self.is_totp_enabled:
        self.last_used_totp = current_totp
```

校验流程拆解：

1. **用户名比对**：使用 `secrets.compare_digest` 做恒定时间比较，防止时序侧信道攻击。
2. **口令/动态码拼接**：
   - 若 `is_totp_enabled` 为 `True`，后端用 `self.totp.now()`（来自 `pyotp.TOTP`）取当前 30 秒窗口内的 TOTP 码；
   - 将服务端保存的 `self.password`（环境变量 `FLATNOTES_PASSWORD`）与 `current_totp` **做字符串拼接**，形成 `expected_password`；
   - 再与请求体中的 `data.password` 用 `compare_digest` 比较。
   - 这里本质上并不是"加密/解密"，而是**协议层的字符串拼接约定**——前端把密码和 TOTP 拼成一个串发送，后端用同样规则重算再做比较。
3. **防重放判定**：
   - 实例字段 `self.last_used_totp` 记录上一次成功登录时使用的 TOTP 值；
   - 条件 `current_totp != self.last_used_totp` 要求本次动态码必须与上次不同，从而阻止同一个 TOTP 值被截获后重放登录；
   - 只有全部条件通过才会更新 `self.last_used_totp = current_totp`，进入签发 token 阶段。

> 注意：该防重放机制仅存在于服务端内存中，进程重启会重置；同时它不做额外的时间窗口校验，完全依赖 `pyotp` 默认的 30 秒窗口。

---

## 2. JWT 令牌载荷与双来源凭证提取

### 2.1 JWT 令牌的过期载荷

令牌签发与校验见 [local.py#92-111](file:///e:/solo-code-2/flatnotes/server/auth/local/local.py#L92-L111)：

```python
def _create_access_token(self, data: dict):
    to_encode = data.copy()
    expiry_datetime = datetime.utcnow() + timedelta(
        days=self.session_expiry_days
    )
    to_encode.update({"exp": expiry_datetime})
    encoded_jwt = jwt.encode(
        to_encode, self.secret_key, algorithm=self.JWT_ALGORITHM
    )
    return encoded_jwt
```

令牌结构分析：

- **算法**：`HS256`（`JWT_ALGORITHM`），对称签名，密钥取自环境变量 `FLATNOTES_SECRET_KEY`。
- **载荷字段**：
  - `sub`：登录用户名（小写），由调用方 `_create_access_token(data={"sub": self.username})` 传入；
  - `exp`：过期时间，`datetime.utcnow() + timedelta(days=self.session_expiry_days)`，默认 30 天（`FLATNOTES_SESSION_EXPIRY_DAYS`）。
- **校验侧**（[local.py#92-100](file:///e:/solo-code-2/flatnotes/server/auth/local/local.py#L92-L100)）：
  - `jwt.decode` 使用 `HS256` 验签并自动拒绝 `exp` 已过期的令牌；
  - 再以 `payload.get("sub")` 与 `self.username` 比对，保证该令牌确属当前配置用户。

### 2.2 LocalAuth.authenticate：Bearer 头与 Cookie 的兼容提取

实现位于 [local.py#76-90](file:///e:/solo-code-2/flatnotes/server/auth/local/local.py#L76-L90)：

```python
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token", auto_error=False)

def authenticate(
    self, request: Request, token: str = Depends(oauth2_scheme)
):
    # If no token is found in the header, check the cookies
    if token is None:
        token = request.cookies.get("token")
    try:
        self._validate_token(token)
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
```

兼容策略：

1. **FastAPI 依赖注入**：`OAuth2PasswordBearer` 默认从 `Authorization: Bearer <token>` 头读取。`auto_error=False` 使得在没有该头时不直接抛 401，而是返回 `None`，给后续 Cookie 回退留出机会。
2. **Cookie 回退**：当 `token is None` 时，尝试从 `request.cookies.get("token")` 读取。该 Cookie 由前端 `tokenStorage.js` 的 `storeToken` 写入（键名为 `token`，见 [tokenStorage.js#1](file:///e:/solo-code-2/flatnotes/client/tokenStorage.js#L1)）。
3. **统一校验**：无论来源是 Header 还是 Cookie，都进入 `_validate_token`，保证两种凭证走同一套签名、过期、用户校验流程。
4. **失败响应**：抛出带 `WWW-Authenticate: Bearer` 的 401，符合 OAuth2 规范，前端 `api.js` 的 `apiErrorHandler` 据此跳转到登录页。

这样设计的原因是：
- **AJAX 请求**：axios 拦截器会在非 `api/token` 请求上自动附加 `Authorization: Bearer <token>` 头（见 [api.js#12-26](file:///e:/solo-code-2/flatnotes/client/api.js#L12-L26)）；
- **静态资源 / 页面刷新**：浏览器会自动带上同源 Cookie，Cookie 回退保证了直接访问页面时仍能完成认证。

---

## 3. 退出登录：Cookie 过期与令牌废弃

### 3.1 前端：将 Cookie 过期时间设置为 1970 年

实现位于 [tokenStorage.js#32-37](file:///e:/solo-code-2/flatnotes/client/tokenStorage.js#L32-L37)：

```js
export function clearStoredToken() {
  sessionStorage.removeItem(tokenStorageKey);
  localStorage.removeItem(tokenStorageKey);
  document.cookie =
    getCookieString() + "; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}
```

工作原理：

1. 同时清理 `sessionStorage` 与 `localStorage` 中的 `token` 键，确保当前会话与持久存储中均无令牌残留。
2. 通过给 `document.cookie` 赋一个与原 Cookie 键名、路径完全匹配，但 `expires` 为 **Unix 纪元（1970-01-01）** 的值，让浏览器**立即删除该 Cookie**。这里的 `getCookieString()` 在未传 token 时返回 `token=; Path=<base>; SameSite=Strict`（`token` 为空），再拼上 `expires`，就等价于"置空并立即过期"。
3. 由于 Cookie 被删除，下一次请求既没有 `Authorization` 头（拦截器从 `sessionStorage` 读不到 token），也没有 `token` Cookie，服务端必然返回 401 并触发跳登录。

### 3.2 服务端：旧令牌状态的废弃与响应

flatnotes 的 JWT 方案是**无状态**的——服务端没有维护一个已签发令牌的黑名单，因此"退出登录"并不主动与服务端通信，而是由前端**在本地销毁凭证**来实现。服务端在后续请求中会做如下响应：

1. **凭证缺失**：`authenticate` 中 `Depends(oauth2_scheme)` 返回 `None`，再查 `request.cookies.get("token")` 同样为 `None`，`_validate_token(None)` 抛出 `ValueError`，最终返回 `401 Invalid authentication credentials`。
2. **若用户抓包重放了旧 token**：仍会通过 `jwt.decode` 的签名与 `exp` 校验——这是 JWT 无状态方案的天然局限。为了规避此风险，实际依赖以下约束共同生效：
   - 令牌本身有 `exp`（默认 30 天），旧 token 会自然过期；
   - 若管理员轮换 `FLATNOTES_SECRET_KEY`，所有历史令牌的签名将立即失效，等于一次**服务端全量废弃**；
   - 若要做到真正的"单 token 退出废弃"，需要引入黑名单（如 Redis 存 `jti`），这在当前实现中并未出现。

3. **HTTP 响应链路**：
   - 前端清理后发起任意 API 请求 → axios 拦截器读不到 token，不再附加 `Authorization`；
   - 后端 `authenticate` 尝试 Header 与 Cookie 均失败，返回 401 + `WWW-Authenticate: Bearer`；
   - 前端 `apiErrorHandler`（[api.js#28-45](file:///e:/solo-code-2/flatnotes/client/api.js#L28-L45)）识别 401，跳转至 `/login` 并带上 `redirect` 查询参数，形成完整的"登出 → 401 → 登录页"闭环。

---

## 4. 流程总览（时序）

```
Browser (api.js / tokenStorage.js)          Server (local.py)
        |                                           |
        |-- POST api/token {username, password+totp} -->
        |                                           |-- compare_digest(username)
        |                                           |-- expected = password + TOTP.now()
        |                                           |-- compare_digest(expected, data.password)
        |                                           |-- current != last_used_totp
        |                                           |-- last_used_totp = current
        |                                           |-- jwt.encode({sub, exp}, secret, HS256)
        |<-- {access_token} ------------------------|
        |                                           |
        |-- storeToken(token)                       |
        |   (sessionStorage + localStorage + Cookie) |
        |                                           |
        |-- GET /api/notes (Authorization: Bearer) ->
        |                                           |-- oauth2_scheme -> token
        |                                           |-- _validate_token -> ok
        |<-- 200 data ------------------------------|
        |                                           |
        |-- clearStoredToken()  (expires=1970)      |
        |-- GET /api/notes (no token) ------------->|
        |                                           |-- token is None, cookie is None
        |                                           |-- _validate_token(None) -> ValueError
        |<-- 401 WWW-Authenticate: Bearer ----------|
        |-- router.push(/login?redirect=...)        |
```

---

## 5. 小结

| 维度 | 实现要点 |
| --- | --- |
| TOTP 拼接 | 前端 `password + totp` 作为 `password` 字段发送；后端 `password + TOTP.now()` 重算比较 |
| TOTP 防重放 | 内存级 `last_used_totp` 拒绝相同码的连续使用 |
| JWT 载荷 | `{sub: username, exp: utcnow + session_expiry_days}`，`HS256` 对称签名 |
| 双来源认证 | `OAuth2PasswordBearer` 先取 Header，失败则回退 `request.cookies["token"]`，统一 `_validate_token` |
| 前端登出 | 清除 sessionStorage / localStorage，并将 Cookie `expires` 置为 1970 触发浏览器删除 |
| 服务端登出 | 无状态设计，不主动作废具体 token；依赖 `exp` 自然过期或密钥轮换实现批量废弃 |
