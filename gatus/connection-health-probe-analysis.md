# client/client.go 连接健康探测链路分析

本文档围绕 `client/client.go` 中 `QueryWebSocket`、`CanPerformStartTLS`、`CanCreateNetworkConnection` 三个与连接健康探测相关的函数，对用户提出的三个具体问题进行源码级分析。

---

## 问题 1：`QueryWebSocket` 中 `ws.ReadMessage` 是否会遵守 `DialContext` 阶段传入的超时

### 源码定位

- `QueryWebSocket`：[client.go#L395-L444](file:///e:/solo-code-2/gatus/client/client.go#L395-L444)

### 代码片段

```go
ctx := context.Background()
if config != nil {
    if config.Timeout > 0 {
        var cancel context.CancelFunc
        ctx, cancel = context.WithTimeout(ctx, config.Timeout)
        defer cancel()
    }
    ...
}
ws, _, err := dialer.DialContext(ctx, address, wsHeaders)
...
// Write message
if err := ws.WriteMessage(websocket.TextMessage, []byte(body)); err != nil { ... }
// Read message
msgType, msg, err := ws.ReadMessage()
```

### 结论：**不会遵守，会永久阻塞**

### 详细分析

1. **`gorilla/websocket` 的 `DialContext` 只在握手阶段消费 `ctx`。**
   一旦 WebSocket 握手完成、HTTP 升级成功，`dialer.DialContext` 立即返回 `*websocket.Conn`。该连接对象内部不再持有或检查 `ctx`，后续所有 I/O（`ReadMessage`、`WriteMessage`、`NextReader`、`NextWriter` 等）都走底层 `net.Conn` 的 `Read`/`Write`，完全独立于当初传入的 `context.Context`。

2. **`ws.ReadMessage` 内部阻塞点位于 `conn.NextReader()` → 底层 `net.Conn.Read()`。**
   这是一个真正的阻塞系统调用，除非：
   - 远端主动关闭连接；
   - 本地调用 `ws.Close()`；
   - 通过 `ws.SetReadDeadline(...)` 设置了读超时并到期。

   三种机制中本函数都未启用。`defer ws.Close()` 只有在函数返回时才执行，而函数又在等待 `ReadMessage` 返回，形成死锁。

3. **`defer cancel()` 的作用范围仅为函数生命周期。**
   即使 `config.Timeout` 到期后 `ctx.Done()` 被触发，由于 `ws.ReadMessage` 根本不接收 `context`，也不会检查 `ctx.Done()`，因此它不会中断。
   `cancel` 最终也只是在函数返回时由 `defer` 调用，对 `ReadMessage` 的阻塞无任何影响。

### 后果

- **监控协程泄漏**：调用 `QueryWebSocket` 的探测 goroutine 会被永久挂起，占用一个 goroutine 栈（默认 2–8KB 起步，按需扩容）以及一个未关闭的文件描述符。
- **每轮调度重复创建协程**：Gatus 的调度循环会按 `interval` 持续发起新的探测，每一次失败或超时都会残留一个被卡住的协程。
- **goroutine 数量线性增长**：在恶意服务端"挂住不发送任何消息"的场景下，随着时间推移，`runtime.NumGoroutine()` 会不断上升，最终可能导致：
  - 内存（goroutine 栈）持续膨胀；
  - 文件描述符耗尽；
  - 调度器负载升高，影响其他 endpoint 的探测；
  - 进程出现 OOM 或被系统限制杀进程。
- **无法被外部 Context 取消**：即使上层调度器使用 `context.WithTimeout` 包了一层，`gorilla/websocket` 也不支持基于 context 的读取消，唯一的办法是主动调用 `ws.Close()`，但当前代码并未提供任何超时保护通道。

### 建议修复

在 `DialContext` 成功之后、`ReadMessage` 之前，显式设置读截止时间：

```go
ws, _, err := dialer.DialContext(ctx, address, wsHeaders)
if err != nil { ... }
defer ws.Close()
if config != nil && config.Timeout > 0 {
    _ = ws.SetReadDeadline(time.Now().Add(config.Timeout))
}
```

同理，对 `WriteMessage` 也应设置 `SetWriteDeadline`，确保恶意服务端的 TCP 窗口填满时写阻塞同样会被中断。

---

## 问题 2：`CanPerformStartTLS` 在启用自定义 DNS 解析器时使用 `context.Background()` 的毁灭性阻塞

### 源码定位

- `CanPerformStartTLS`：[client.go#L151-L206](file:///e:/solo-code-2/gatus/client/client.go#L151-L206)

### 代码片段

```go
if config.HasCustomDNSResolver() {
    ...
    dialer := &net.Dialer{
        Resolver: &net.Resolver{
            PreferGo: true,
            Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
                d := net.Dialer{}
                return d.DialContext(ctx, dnsResolver.Protocol, dnsResolver.Host+":"+dnsResolver.Port)
            },
        },
    }
    connection, err = dialer.DialContext(context.Background(), "tcp", address)
    ...
} else {
    connection, err = net.DialTimeout("tcp", address, config.Timeout)
    ...
}
```

### 结论：**会导致 DNS 解析与 TCP 握手阶段完全无超时，造成不可恢复的协程与 FD 泄漏**

### 详细分析

1. **`net.Dialer.DialContext` 的 `Context` 是它唯一的超时来源。**
   `net.Dialer` 结构体本身有一个 `Timeout` 字段，但当前代码没有设置；因此 `dialer.DialContext(context.Background(), ...)` 等价于"无限期等待"。

2. **调用时机带来的两级放大效应：**
   - **DNS 解析阶段**：自定义 `Resolver.Dial` 使用了 `d := net.Dialer{}`（未设置 `Timeout`），并传入的 `ctx` 来自上层 `context.Background()` 派生的链。若自定义 DNS 服务端响应极慢或半开连接，`LookupHost` 将会一直阻塞在 `DialContext`，直到内核 TCP 重传超时（通常长达数分钟）或被外部取消。
   - **TCP 握手阶段**：解析出 IP 后，真正的 `DialContext("tcp", address)` 同样在 `context.Background()` 下执行，SYN 重传、对端黑洞、防火墙丢弃等都会让这一步永久阻塞。

3. **对比未启用自定义 DNS 的分支：**
   `net.DialTimeout("tcp", address, config.Timeout)` 底层等价于 `(&net.Dialer{Timeout: config.Timeout}).DialContext(context.Background(), ...)`，它会：
   - 在 `config.Timeout` 到期后立即中断 DNS 解析；
   - 在 `config.Timeout` 到期后立即中断 TCP 握手；
   - 向上层返回 `i/o timeout` 错误。

   两条分支的行为在时间可控性上完全不对称，这本身就是一个隐蔽的配置陷阱。

4. **对后续 STARTTLS 流程的链式影响：**
   - `smtp.NewClient(connection, ...)` 在读取服务端 banner 时会调用 `conn.Read`，同样无 deadline；
   - `smtpClient.StartTLS(...)` 底层会进行 TLS 握手，若服务端在 ClientHello 之后无响应，同样会一直阻塞。
   因此即使 DNS 与 TCP 握手侥幸成功，后续阶段依然没有任何 deadline 保护。

### 后果（毁灭性阻塞）

- **探测协程永久性卡住**：一旦命中慢 DNS 或黑洞主机，协程无法被任何内部机制中断。
- **`context.Background()` 没有取消路径**：没有任何外部信号（如 endpoint 被禁用、进程关闭信号）能够打断这次 `DialContext`。
- **FD 与 goroutine 累积**：每一次探测周期都会新增一个挂起的协程和一个半开/已建的连接 FD。
- **雪崩效应**：文件描述符耗尽会影响进程内所有其他网络组件（包括 HTTP server、其他 endpoint 的探测、指标暴露等），最终表现为 Gatus 看起来"还活着"但不再响应或持续报警。

### 建议修复

1. **统一使用带超时的 Context**：

   ```go
   ctx, cancel := context.WithTimeout(context.Background(), config.Timeout)
   defer cancel()
   connection, err = dialer.DialContext(ctx, "tcp", address)
   ```

2. **给 `Resolver.Dial` 内部的二级 dialer 也加上 Timeout**：

   ```go
   Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
       d := net.Dialer{Timeout: config.Timeout}
       return d.DialContext(ctx, dnsResolver.Protocol, dnsResolver.Host+":"+dnsResolver.Port)
   },
   ```

3. **建连成功后继续设置 deadline**：

   ```go
   _ = connection.SetDeadline(time.Now().Add(config.Timeout))
   ```

   以便后续 `smtp.NewClient`、`StartTLS` 在 I/O 层面也能按时返回。

---

## 问题 3：`CanCreateNetworkConnection` 中 `connection.LocalAddr()` 在连接被对端 RST 后的空指针风险

### 源码定位

- `CanCreateNetworkConnection`：[client.go#L98-L122](file:///e:/solo-code-2/gatus/client/client.go#L98-L122)
- `parseLocalAddressPlaceholder`：[client.go#L92-L95](file:///e:/solo-code-2/gatus/client/client.go#L92-L95)

### 代码片段

```go
connection, err := net.DialTimeout(netType, address, config.Timeout)
if err != nil {
    return false, nil
}
defer connection.Close()
if body != "" {
    body = parseLocalAddressPlaceholder(body, connection.LocalAddr())
    connection.SetDeadline(time.Now().Add(config.Timeout))
    _, err = connection.Write([]byte(body))
    ...
}
```

### 结论：**不会抛空指针异常（panic），但可能出现 `nil` 字符串化导致的占位符失效**

### 详细分析

1. **`net.DialTimeout` 成功返回的前提是 TCP 三次握手完成。**
   内核会在握手期间选择本地地址，`struct socket` 上的 `local_addr` 在 `accept`/`connect` 返回前就已被赋值。因此只要 `net.DialTimeout` 返回 `(conn, nil)`，`conn.LocalAddr()` 就一定能返回一个非 nil 的 `net.Addr`。

2. **对端 RST 发生在握手完成之后。**
   某些网络设备（如某些负载均衡、SYN proxy、防火墙）可能在三次握手完成后立即发送 RST。在这种情况下：
   - 本地 socket 仍处于 `ESTABLISHED`（或已转为 `CLOSE_WAIT`/`CLOSED`）；
   - 本地地址已经被内核固定，不会因为对端 RST 而丢失；
   - 因此 `connection.LocalAddr()` 仍会返回一个合法的 `*net.TCPAddr`。

3. **`LocalAddr()` 的语义**：它是 `net.Conn` 接口方法，返回的是"本地绑定的地址"，而不是"对端地址"。只要连接对象本身不为 nil，`LocalAddr()` 的实现就不会返回 nil（参考 `net.TCPConn.LocalAddr`、`net.UDPConn.LocalAddr`）。

4. **但是存在一条潜在的 nil 路径**：如果未来调用者传入一个自定义的（或 mock 的）`net.Conn` 实现，其 `LocalAddr()` 可能返回 nil。当前 `parseLocalAddressPlaceholder` 未做 nil 检查：

   ```go
   func parseLocalAddressPlaceholder(item string, localAddr net.Addr) string {
       item = strings.ReplaceAll(item, "[LOCAL_ADDRESS]", localAddr.String())
       return item
   }
   ```

   当 `localAddr == nil` 时，`localAddr.String()` 会 **panic**：
   ```
   panic: runtime error: invalid memory address or nil pointer dereference
   ```

   虽然 `net.DialTimeout` 正常路径下不会触发，但对其他调用方（例如测试中注入的 mock、或者未来扩展引入的包装 Conn）是一个真实的风险点。

5. **同类风险在其他函数中也存在**：
   - `CanPerformTLS`：[client.go#L209-L247](file:///e:/solo-code-2/gatus/client/client.go#L209-L247)（第 232 行）
   - `QueryWebSocket`：[client.go#L395-L444](file:///e:/solo-code-2/gatus/client/client.go#L395-L444)（第 431 行）
   - `ExecuteSSHCommand`：[client.go#L318-L350](file:///e:/solo-code-2/gatus/client/client.go#L318-L350)（第 324 行）

   它们都无条件调用 `parseLocalAddressPlaceholder(body, xxx.LocalAddr())`，同样依赖底层实现保证 `LocalAddr()` 非 nil。

### 后果

- **在真实 `net.TCPConn` 场景下：不会发生空指针 panic**，因为内核在握手完成时已经分配了本地地址。
- **在 mock / 自定义 Conn 场景下：会触发 panic**，导致整个探测协程崩溃，进而影响调度器对该 endpoint 的后续处理（取决于上层是否 recover）。
- **即便不 panic**，如果未来某些实现返回一个空的 `Addr`（例如 `&net.TCPAddr{}`），`localAddr.String()` 会得到 `":0"` 或 `"<nil>"` 等异常字符串，用户配置中的 `[LOCAL_ADDRESS]` 替换结果将不符合预期，产生难以排查的报文错误。

### 建议修复

在 `parseLocalAddressPlaceholder` 中加入 nil 守卫，形成统一的安全防线：

```go
func parseLocalAddressPlaceholder(item string, localAddr net.Addr) string {
    if localAddr == nil {
        return item
    }
    return strings.ReplaceAll(item, "[LOCAL_ADDRESS]", localAddr.String())
}
```

并考虑在 `CanCreateNetworkConnection` 中进一步强化：
- 在使用 `connection.LocalAddr()` 之前若 `body` 不包含 `[LOCAL_ADDRESS]` 占位符，则可以直接跳过调用，避免对未来自定义 Conn 场景的不必要依赖。

---

## 总体结论

| 函数 | 问题 | 严重级别 | 主要后果 |
| --- | --- | --- | --- |
| `QueryWebSocket` | `ws.ReadMessage` 未设置读 deadline，忽略 DialContext 的超时 | 高 | goroutine + FD 线性累积，最终 OOM |
| `CanPerformStartTLS` | 自定义 DNS 分支使用 `context.Background()`，无任何超时 | 高 | 无法中断的阻塞，雪崩式 FD 耗尽 |
| `CanCreateNetworkConnection` | `LocalAddr()` 对 nil 不安全 | 中 | 依赖内核保证；在 mock/自定义 Conn 下会 panic |

三个问题的共同根因是 **`context.Context` 只被用于"建连"阶段，但"建连之后的 I/O 读/写"阶段均未显式设置 deadline**，以及 **部分分支对自定义/异常路径缺乏 nil 守卫**。建议按"统一 deadline + nil 守卫"的思路全面整改，使整条探测链路严格尊重 `config.Timeout`。
