# watchdog.Shutdown 关闭策略深度分析

本文围绕 `watchdog` 包在系统退出信号或配置文件变更时的关闭行为，结合 Gatus 代码现状与 Go 标准库 `net/http` 的实现细节，对三个问题逐一分析。

涉及的关键代码位置：

- [watchdog.go](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L27-L73) —— `Monitor` 与 `Shutdown`
- [endpoint.go](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L15-L32) —— `monitorEndpoint`
- [endpoint.go (config)](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L279-L286) —— `Endpoint.Close`
- [client.go](file:///e:/solo-code-2/gatus/client/client.go#L47-L55) —— `GetHTTPClient`
- [config.go (client)](file:///e:/solo-code-2/gatus/client/config.go#L213-L285) —— `getHTTPClient`（复用单例 `http.Client`）

---

## 问题一：TCP 握手阻塞时的连接句柄行为

### 1.1 代码实际行为

`Endpoint.Close` 的实现非常克制：

```go
// config/endpoint/endpoint.go
func (e *Endpoint) Close() {
    if e.Type() == TypeHTTP {
        client.GetHTTPClient(e.ClientConfig).CloseIdleConnections()
    }
}
```

它**只调用了 `http.Transport.CloseIdleConnections()`**，并没有粗暴地 `Close()` 整个 `Transport` 或 `Dialer`。更不会触及正在握手中的 `net.Conn`。

对应 Go 标准库 `net/http/transport.go`：

```go
// transport.go (go 1.x)
func (t *Transport) CloseIdleConnections() {
    t.closeIdleConnections(true)
}
```

`closeIdleConnections` 会持有 `Transport.connMu` 并遍历 `idleConn`，对每个 idleConn 调用 `conn.Close()`；**正在被 `dialConn`/`persistConn` 使用中的连接根本不会出现在 idle 列表里**。

### 1.2 "请求正阻塞在 TCP 三次握手阶段" 的场景

发起一个 HTTP 请求时，连接建立大致分这几步（简化）：

1. `Transport.roundTrip` 从 `idleConn` 取连接
2. 若没有空闲连接 → 调用 `Transport.dialConn`
3. `dialConn` → `Dialer.DialContext(ctx, network, addr)`  → 内核 `connect()` 系统调用阻塞直到 SYN/SYN-ACK/ACK 完成
4. 握手完成后，返回一个 `net.Conn`，包装成 `persistConn` 进入 pool

**在第 3 步阻塞时**，这个连接对象尚未被放入 `idleConn`，所以 `CloseIdleConnections()` 对它**无效**；同样地，`ep.Close()` 对它也无效。连接会继续直到：

- 握手成功 → 正常走 `roundTrip`
- 超时 / 被取消 → `DialContext` 返回错误（如 `context deadline exceeded`、`i/o timeout`）

### 1.3 结论：是否泄漏句柄？是否抛特定错误？

- **不会泄漏连接句柄**。Go 的 `net.Dialer` 把 fd 放进了 runtime 的网络 poller（`epoll/kqueue/IOCP`），即便用户层未显式 `Close`，只要 `DialContext` 返回 error（超时/取消），内部会确保把已经 `socket()` 出来但未完成握手的 fd 关闭（见 `net/fd_unix.go` 的 `newFD`/`connect` 错误处理）。
- **不会由 `ep.Close()` 主动抛出任何错误**。`CloseIdleConnections` 只关空闲连接，不会把"正在握手"的连接打掉；正在握手的连接要么自己超时返回 `net.OpError`（超时或 `context.DeadlineExceeded`，取决于是否带超时的 context），要么成功。
- **唯一相关的"错误"副作用**：若该 HTTP 客户端的底层 `Transport` 仍被复用，`CloseIdleConnections` 只是让缓存的 keep-alive 连接失效，下次请求会重新建连，可能导致**第一次重建时的额外延迟**，而不是错误。

> 小结：`ep.Close()` 的语义是"释放空闲连接"，对正在握手的连接既不打扰、也不泄漏，更不会抛特定错误。

---

## 问题二：遍历休眠期间收到 Shutdown 指令，未启动的监控协程是否成"僵尸"

### 2.1 背景

`Monitor` 的启动逻辑（[watchdog.go](file:///e:/solo-code-2/gatus/watchdog/watchdog.go#L27-L59)）：

```go
func Monitor(cfg *config.Config) {
    ctx, cancelFunc = context.WithCancel(context.Background())
    ...
    for _, endpoint := range cfg.Endpoints {
        if endpoint.IsEnabled() {
            time.Sleep(222 * time.Millisecond)     // 防请求风暴
            go monitorEndpoint(endpoint, cfg, extraLabels, ctx)
        }
    }
    // suites 同样
}
```

关键点：

- `ctx, cancelFunc` 是 `Monitor` 内部包级变量，**先于任何协程被创建**。
- 每条 endpoint 启动前有 `222ms` 的 sleep。当 endpoint 数量巨大时，`Monitor` 可能在 sleep 中被打断。

### 2.2 时序分析

场景：`Monitor` 正在遍历第 K 个 endpoint 时，外部触发 `Shutdown`，执行顺序为：

1. `Shutdown` 中先调用所有 `ep.Close()`（不涉及 ctx）
2. 然后执行 `cancelFunc()`，`ctx.Done()` 被触发
3. 回到 `Monitor` 的循环：`time.Sleep` 结束 → `go monitorEndpoint(..., ctx)` 启动协程
4. 新协程进入循环时，第一次 `select` 立刻命中 `<-ctx.Done()`，打印 `Canceling current execution...` 后 `return`

### 2.3 结论

- **未启动的监控协程不会成为"僵尸"**。理由：
  1. `ctx` 在进入循环前已构造完成，后续任何时间被 cancel，所有"在 cancelFunc 之后启动的协程"都会在进入 `select` 的第一拍就感知到 `ctx.Done()` 并立即返回，不会挂起。
  2. `go monitorEndpoint` 启动时，`ctx` 是同一个已被 cancel 的 context，不会形成"泄漏的工作单元"。
  3. Go 协程本身只是 runtime 调度对象，没有操作系统级线程资源，一旦函数返回即被 GC。

- **不会产生请求风暴**：`monitorEndpoint` 虽然首行就调用了 `executeEndpoint(...)`，但 `executeEndpoint` 内部第一行就是 `monitoringSemaphore.Acquire(ctx, 1)`（[endpoint.go](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L37)），而这里使用的 `ctx` 就是包级的已被 cancel 的 context。因此 `Acquire` 会立即失败返回 error，函数直接 `return`，**不会执行到 `EvaluateHealth()`，不会发任何请求**。这与第110行的分析一致，不存在矛盾。

- **`ctx` 生命周期说明**：包级 `ctx` 只有在下次调用 `Monitor` 时才会被重新赋值。若 `Shutdown` 发生在 `Monitor` 运行期间，`ctx` 被取消，后续所有 acquire 都会失败；若在 `Monitor` 返回后又一次调用 `Monitor`（配置热重载），新 `ctx` 会替换旧的，此时新老协程的 ctx 不同。

- **真正的风险点**：若配置中 endpoint 数量极大，`Monitor` 本身的总 sleep 时长（≈ `0.222 * N` 秒）可能非常长；在 Shutdown 之后 `Monitor` 仍需等待所有剩余 `time.Sleep` 完成，整体关闭时间 ≈ `0.222 * N` 秒。这会导致 Shutdown 看起来"不立即"，但不是资源泄漏。

> 小结：**不会产生僵尸协程，也不会产生收尾请求风暴**。唯一副作用是海量 endpoint 时关闭耗时较长（由 222ms sleep 累积），但无资源泄漏。

---

## 问题三：为什么既要 `cancelFunc` 又要 `ep.Close`？职责划分

### 3.1 两者在网络层面的职责

| 动作 | 作用对象 | 触发层 | 网络层面效果 |
| --- | --- | --- | --- |
| `cancelFunc()` | 共享的 `context.Context`（包级 `ctx`） | 应用层（Go context 机制） | **仅取消显式使用了该 `ctx` 的操作**：① `monitoringSemaphore.Acquire(ctx, 1)` 立即失败；② `monitorEndpoint` 的 `select { case <-ctx.Done(): }` 退出循环。**不能中断正在进行的底层网络调用** |
| `ep.Close()` → `CloseIdleConnections()` | `http.Transport` 持有的 `idleConn` 池 | `net/http` 库内部 | 立即 **close() 所有 idle 状态的 `net.Conn`**，释放内核 fd 与 keep-alive 连接 |

### 3.2 为什么两者都必须有——以及 `cancelFunc` 无法中断网络调用的证据

首先核查：watchdog 包级的 `ctx` 是否被传入了底层 HTTP 请求构建和网络拨号？

追踪完整调用链：

1. `executeEndpoint` → `ep.EvaluateHealth()`（[endpoint.go:49](file:///e:/solo-code-2/gatus/watchdog/endpoint.go#L49)）
2. `EvaluateHealth()` → `EvaluateHealthWithContext(nil)`（[endpoint.go (config):290](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L290)）
3. `EvaluateHealthWithContext` → `processedEndpoint.call(result)`（[endpoint.go (config):330](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L330)）
4. `call` 方法中 HTTP 分支：
   - `request = e.buildHTTPRequest()`（[endpoint.go (config):457](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L457)）
   - `buildHTTPRequest` 内部使用 `http.NewRequest(e.Method, e.URL, bodyBuffer)`（[endpoint.go (config):581](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L581)）——**没有使用 `NewRequestWithContext`，也没有传入任何 ctx**
   - `client.GetHTTPClient(e.ClientConfig).Do(request)`（[endpoint.go (config):547](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L547)）——`Do` 依赖 request 上的 context，但 request 上没有设置
5. 对于其他类型（TCP/UDP/TLS/SSH 等），调用的 `client.CanCreateNetworkConnection`、`client.CanPerformTLS`、`client.QueryWebSocket` 等函数也**都没有接收或传递 watchdog 的包级 ctx**

**结论：`cancelFunc` 完全无法中断正在进行的底层网络调用。** 正在 `Do()` 中等待响应的 HTTP 请求、正在 `DialTimeout` 中等待握手的 TCP 连接，都必须等到自身超时或正常完成，不会因为 `cancelFunc` 而提前返回。

**只调 `cancelFunc`，不调 `ep.Close` 会怎样？**

- 所有 `monitorEndpoint` 协程在 `select` 中退出，不再发起新请求。
- 正在进行中的请求**不会被中断**，会继续运行直到自身超时/完成。
- 但 Transport 内部的 `idleConn` **仍然保活**（keep-alive 连接在 `IdleConnTimeout` 之前都不会被主动关闭），这些 TCP 连接的 fd 会继续占用内核资源，直到超时或进程退出。在"配置热重载"这种进程**并不退出**的场景下，这就是实际的连接泄漏——也是 [issue #536](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L279-L281) 注释所指出的问题：
  > Close HTTP connections between watchdog and endpoints to avoid dangling socket file descriptors on configuration reload.

**只调 `ep.Close`，不调 `cancelFunc` 会怎样？**

- idle 连接会被释放，但**正在进行中的请求**（`executeEndpoint` 里的 `EvaluateHealth`）以及**正在 sleep 的 `monitorEndpoint` 循环**都不会被中断。
- 协程还会继续发请求、写存储、发告警，直到自己的 ticker/超时结束；应用无法真正"停止监控"。

### 3.3 职责划分总结

- **`cancelFunc`（应用层逻辑取消）**：停止"逻辑行为"——让协程循环退出、让 `semaphore.Acquire` 失败。它**不直接**操作 socket，也**不能**中断已经发起的底层网络 I/O。
- **`ep.Close`（传输层资源释放）**：停止"底层资源"——把已经空闲、没有任何请求在使用的 keep-alive 连接真正 `close()` 掉，释放 fd。它**不影响**正在进行的请求。

两者互补，缺一不可：

1. `cancelFunc` 先触发（或者实际上在 `Shutdown` 里是 `ep.Close` 先于 `cancelFunc`），语义上"停止工作"；
2. `ep.Close` 释放已 idle 的 fd；
3. 正在使用的连接会在请求完成后回到 idle 状态，由 Transport 的 `IdleConnTimeout` 机制在稍后自动关闭；由于 Gatus 的 `Transport` 没有显式设置 `IdleConnTimeout`（使用 Go 默认的 90s），进程若立即退出则由 OS 回收，若热重载则依赖 `CloseIdleConnections` 主动关闭。

> 小结：`cancelFunc` 负责"让协程停止工作"（但无法中断在途网络请求），`ep.Close` 负责"让空闲 socket 释放 fd"。在热重载场景下尤其必须同时存在，否则会残留 keep-alive 连接形成 fd 泄漏。

---

## 总结

| 问题 | 结论 |
| --- | --- |
| 1. TCP 握手阶段关闭的影响 | `CloseIdleConnections` 只关闭空闲连接；正在握手的连接既不受影响也不泄漏，最终要么握手成功、要么超时返回 `net.OpError`（底层网络调用未传入 watchdog 的 ctx，因此不会因 cancel 而提前中断） |
| 2. 休眠期间 Shutdown 未启动协程 | 不会成为僵尸，也不会产生请求风暴；ctx 已 cancel，`executeEndpoint` 首行的 `Acquire` 立即失败，直接 return 不会发请求 |
| 3. 为何既要 `cancelFunc` 又要 `ep.Close` | 两者职责互补：`cancelFunc` 取消应用层逻辑（协程循环退出、semaphore Acquire 失败），但**无法中断在途网络请求**；`ep.Close` 释放 `http.Transport` 的 idle keep-alive 连接 fd。热重载场景下两者缺一不可 |
