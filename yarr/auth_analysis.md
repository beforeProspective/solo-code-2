# 后台访问控制认证逻辑分析

基于 [auth.go](file:///e:/solo-code-2/yarr/src/server/auth/auth.go) 源码的安全机制分析。

---

## 问题1：IsAuthenticated 的校验流程与签名计算

### 校验流程

`IsAuthenticated` 函数定义在 [auth.go#L12-L22](file:///e:/solo-code-2/yarr/src/server/auth/auth.go#L12-L22)，其校验流程如下：

```go
func IsAuthenticated(req *http.Request, username, password string) bool {
    cookie, _ := req.Cookie("auth")
    if cookie == nil {
        return false
    }
    parts := strings.Split(cookie.Value, ":")
    if len(parts) != 2 || !StringsEqual(parts[0], username) {
        return false
    }
    return StringsEqual(parts[1], secret(username, password))
}
```

**校验步骤：**
1. 从 HTTP 请求中读取名为 `auth` 的 Cookie
2. 若 Cookie 不存在，直接返回 `false`（未认证）
3. 将 Cookie 值按 `:` 分割为两部分，格式为 `username:signature`
4. 校验第一部分是否与预期用户名一致
5. 校验第二部分签名是否与服务端重新计算的签名一致

### 签名计算过程

签名由 `secret` 函数计算，定义在 [auth.go#L48-L53](file:///e:/solo-code-2/yarr/src/server/auth/auth.go#L48-L53)：

```go
func secret(msg, key string) string {
    mac := hmac.New(sha256.New, []byte(key))
    mac.Write([]byte(msg))
    src := mac.Sum(nil)
    return hex.EncodeToString(src)
}
```

**计算过程：**
1. 使用 **HMAC-SHA256** 算法创建消息认证码
2. 以用户 `password` 作为 HMAC 的密钥（key）
3. 以 `username` 作为待认证的消息（msg）
4. 计算出 32 字节的 SHA256 哈希摘要
5. 将摘要进行十六进制编码，得到 64 字符的签名字符串

**设计意图：** 只有知道正确密码的用户才能生成有效的签名，确保 Cookie 无法被伪造。

---

## 问题2：subtle.ConstantTimeCompare 的安全作用

### 源码位置

安全比较由 `StringsEqual` 函数封装，定义在 [auth.go#L44-L46](file:///e:/solo-code-2/yarr/src/server/auth/auth.go#L44-L46)：

```go
func StringsEqual(p1, p2 string) bool {
    return subtle.ConstantTimeCompare([]byte(p1), []byte(p2)) == 1
}
```

在 `IsAuthenticated` 中用于比较：
- 用户名：`StringsEqual(parts[0], username)`
- 签名值：`StringsEqual(parts[1], secret(username, password))`

### 为什么不使用普通 `==` 比较

普通字符串比较（`==`）采用**短路优化**：逐个字节对比，遇到第一个不相等的字节就立即返回结果。这导致：
- 两个字符串越相似，比较耗时越长
- 攻击者可以通过精确测量响应时间差异，逐字节推断出正确值

### 防御的攻击类型：时序攻击（Timing Attack）

**时序攻击原理：**
- 攻击者发送大量不同的尝试值
- 通过统计响应时间的微小差异，判断哪一位字符是正确的
- 逐字节推导出完整的正确值（如密码、签名）

**ConstantTimeCompare 的保障：**
- 无论两个字符串是否相等，比较所花费的时间**始终相同**
- 消除了时间侧信道泄露的可能性
- 属于 `crypto/subtle` 包提供的恒定时间原语，专门设计用于密码学场景

---

## 问题3：Cookie 配置差异与 MaxAge 语义

### Authenticate 的 Cookie 配置

定义在 [auth.go#L24-L33](file:///e:/solo-code-2/yarr/src/server/auth/auth.go#L24-L33)：

```go
func Authenticate(rw http.ResponseWriter, username, password, basepath string) {
    http.SetCookie(rw, &http.Cookie{
        Name:     "auth",
        Value:    username + ":" + secret(username, password),
        MaxAge:   604800, // 1 week
        Path:     basepath,
        Secure:   true,
        SameSite: http.SameSiteLaxMode,
    })
}
```

### Logout 的 Cookie 配置

定义在 [auth.go#L35-L42](file:///e:/solo-code-2/yarr/src/server/auth/auth.go#L35-L42)：

```go
func Logout(rw http.ResponseWriter, basepath string) {
    http.SetCookie(rw, &http.Cookie{
        Name:   "auth",
        Value:  "",
        MaxAge: -1,
        Path:   basepath,
    })
}
```

### 配置对比

| 配置项 | Authenticate | Logout |
|--------|-------------|--------|
| `Value` | `username:signature` | 空字符串 `""` |
| `MaxAge` | `604800`（1周） | `-1` |
| `Path` | `basepath` | `basepath` |
| `Secure` | `true` | 未设置 |
| `SameSite` | `LaxMode` | 未设置 |

### MaxAge 负数的含义

在 HTTP Cookie 规范中，`MaxAge` 设为**负数**（如 `-1`）表示：

- **立即删除该 Cookie**
- 浏览器收到 `MaxAge < 0` 的 Set-Cookie 时，会立即清除同名 Cookie
- 这是 Web 应用实现"登出"功能的标准做法

**注意：** `MaxAge = 0` 也会立即删除 Cookie，而 `MaxAge = -1` 表示 Cookie 会在浏览器会话结束时删除（但多数浏览器实现为立即删除）。

---

## 总结

该认证机制具备以下安全特性：

1. **完整性保护**：使用 HMAC-SHA256 签名防止 Cookie 篡改
2. **侧信道防护**：恒定时间比较抵御时序攻击
3. **安全属性**：`Secure` 和 `SameSite` 标识增强传输安全
4. **会话管理**：通过设置和删除 Cookie 控制登录状态
