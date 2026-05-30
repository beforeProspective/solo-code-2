# Gzip 中间件深度分析

> 分析对象：[middleware.go](file:///e:/solo-code-2/yarr/src/server/gzip/middleware.go)

---

## 一、匿名嵌入 `http.ResponseWriter` 导致接口丢失问题

### 1.1 问题根因

在 [middleware.go#L11-L16](file:///e:/solo-code-2/yarr/src/server/gzip/middleware.go#L11-L16) 中，`gzipResponseWriter` 的定义如下：

```go
type gzipResponseWriter struct {
	http.ResponseWriter

	out *gzip.Writer
	src http.ResponseWriter
}
```

该结构体同时使用了两种方式引用底层 `http.ResponseWriter`：

- **匿名嵌入** `http.ResponseWriter`——Go 编译器会自动为外层结构体生成委托方法，但仅限于接口自身声明的方法（`Header()`、`Write()`、`WriteHeader()`）。
- **命名字段** `src`——保留了对原始 `ResponseWriter` 的直接引用。

关键问题在于：Go 语言的接口组合是**纯静态的**。`http.ResponseWriter` 接口本身只包含三个方法，但 Go 标准库 `net/http` 的实际实现（如 `*http.response`）同时满足 `http.Flusher`、`http.Hijacker`、`http.Pusher` 等扩展接口。这些扩展接口是通过**运行时类型断言**来发现的，并非 `http.ResponseWriter` 接口契约的一部分。

当 `c.Out` 被替换为 `*gzipResponseWriter` 后，下游代码或 `net/http` 框架本身执行如下断言时：

```go
if flusher, ok := c.Out.(http.Flusher); ok {
    flusher.Flush()
}
```

断言将**失败**——因为 `*gzipResponseWriter` 并未实现 `http.Flusher` 接口。匿名嵌入只能向上委托嵌入接口自身声明的方法，无法自动传递嵌入值所满足的其他接口。

### 1.2 对 SSE / 服务端推送的影响

在 [routes.go#L30](file:///e:/solo-code-2/yarr/src/server/routes.go#L30) 中，gzip 中间件被全局注册：

```go
r.Use(gzip.Middleware)
```

这意味着所有路由的 Handler 都将经过 gzip 包装。对于需要实时流传输的场景（如 Server-Sent Events、分块传输编码），影响如下：

| 影响维度 | 具体表现 |
|---------|---------|
| **Flush 失效** | 数据写入 `gzip.Writer` 后被内部缓冲，`http.Flusher` 断言失败导致无法主动刷送到客户端，事件推送延迟至缓冲区满或连接关闭 |
| **Hijack 失效** | WebSocket 升级依赖 `http.Hijacker` 接口夺取底层 TCP 连接，断言失败后握手无法完成 |
| **数据完整性** | gzip 格式要求以特定尾部标记结束流，SSE 长连接无法发出 gzip 结束标记，客户端持续等待解压产生挂起 |

### 1.3 修复方案

在 `gzipResponseWriter` 上显式实现扩展接口，将调用委托给底层 `src`：

```go
func (rw *gzipResponseWriter) Flush() {
	if f, ok := rw.src.(http.Flusher); ok {
		rw.out.Flush()
		f.Flush()
	}
}

func (rw *gzipResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := rw.src.(http.Hijacker); ok {
		rw.out.Close()
		rw.out = nil
		return h.Hijack()
	}
	return nil, nil, http.ErrNotSupported
}
```

在 `Write` 方法中应判断 `rw.out` 是否为 `nil`（Hijack 后），若为 `nil` 则直接写 `src`，避免空指针崩溃。

---

## 二、`defer gz.out.Close()` 的生命周期与 Panic 安全性

### 2.1 执行时序分析

在 [middleware.go#L30-L43](file:///e:/solo-code-2/yarr/src/server/gzip/middleware.go#L30-L43) 中：

```go
func Middleware(c *router.Context) {
	if !strings.Contains(c.Req.Header.Get("Accept-Encoding"), "gzip") {
		c.Next()
		return
	}

	gz := &gzipResponseWriter{out: gzip.NewWriter(c.Out), src: c.Out}
	defer gz.out.Close()

	c.Out.Header().Set("Content-Encoding", "gzip")
	c.Out = gz

	c.Next()
}
```

结合 [context.go#L22-L25](file:///e:/solo-code-2/yarr/src/server/router/context.go#L22-L25) 和 [router.go#L75-L81](file:///e:/solo-code-2/yarr/src/server/router/router.go#L75-L81) 的调用链，执行时序如下：

```
ServeHTTP()
  └─ context.Next()                    // index: -1 → 0
       └─ gzip.Middleware(c)            // chain[0]
            ├─ gz = new gzipResponseWriter
            ├─ defer gz.out.Close()      ← 注册延迟调用
            ├─ c.Out = gz
            └─ c.Next()                 // index: 0 → 1
                 └─ actualHandler(c)    // chain[1]
            └─ [defer 执行] gz.out.Close()  ← 刷写 gzip 尾部标记并释放资源
```

`defer` 在 `Middleware` 函数返回时执行，而 `Middleware` 的返回发生在 `c.Next()`（即后续 Handler 链）执行完毕之后。因此正常流程下 `gz.out.Close()` 会在所有 Handler 写入完成后执行，时序是正确的。

### 2.2 Panic 安全性分析

Go 语言规范规定：**`defer` 语句在所在函数返回时执行，无论返回原因是正常返回还是 panic 导致的栈展开。** 因此：

| 场景 | `gz.out.Close()` 是否执行 | 说明 |
|------|---------------------------|------|
| Handler 正常返回 | ✅ 是 | `c.Next()` 正常返回 → `defer` 触发 |
| Handler 发生 panic | ✅ 是 | 栈展开经过 `Middleware` 栈帧 → `defer` 触发 |
| Handler panic 且被上层 recover | ✅ 是 | `net/http` 默认在 `ServeHTTP` 中 recover → 栈展开中 `defer` 执行 |

`net/http` 标准库内置了 panic 恢复机制（见 `http/server.go` 中 `(*conn).serve` 方法），它会 `recover()` 并断开连接。栈展开过程中 `Middleware` 的 `defer` 一定会被调用，因此 **`gz.out.Close()` 是 panic 安全的**。

### 2.3 潜在风险

尽管 `Close()` 一定会被调用，但仍存在隐患：

1. **写入不完整的 gzip 流**：若 Handler 在写入部分数据后 panic，`Close()` 会尝试写入 gzip 流尾部标记（GZIP footer），但客户端收到的将是一个不完整的 gzip 文件——头部和数据有，但中间可能断裂，解压时会产生 `io.ErrUnexpectedEOF`。
2. **`Close()` 返回值被忽略**：`defer gz.out.Close()` 丢弃了返回的 error，若底层连接已断开则错误被静默吞没。
3. **无自定义 recover 机制**：当前代码库（[router.go](file:///e:/solo-code-2/yarr/src/server/router/router.go)）中未实现 panic recovery 中间件，完全依赖 `net/http` 的默认行为，无法在框架层做结构化错误日志或响应。

### 2.4 改进建议

```go
func Middleware(c *router.Context) {
	if !strings.Contains(c.Req.Header.Get("Accept-Encoding"), "gzip") {
		c.Next()
		return
	}

	gz := &gzipResponseWriter{out: gzip.NewWriter(c.Out), src: c.Out}
	c.Out.Header().Set("Content-Encoding", "gzip")
	c.Out = gz

	c.Next()

	if err := gz.out.Close(); err != nil {
		log.Printf("gzip close error: %v", err)
	}
}
```

将 `defer` 改为显式调用，并处理错误。若仍需 panic 安全性，可在其外层包装 recovery 中间件：

```go
func Recovery(c *router.Context) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("panic recovered: %v\n%s", r, debug.Stack())
			http.Error(c.Out, "Internal Server Error", 500)
		}
	}()
	c.Next()
}
```

---

## 三、空响应状态码（204/304）下的 Content-Encoding 缺陷

### 3.1 问题复现

在 [middleware.go#L39](file:///e:/solo-code-2/yarr/src/server/gzip/middleware.go#L39) 中：

```go
c.Out.Header().Set("Content-Encoding", "gzip")
```

此行在 `c.Next()` **之前**无条件执行，即所有经 gzip 包装的响应都会带上 `Content-Encoding: gzip` 头。

在 [routes.go](file:///e:/solo-code-2/yarr/src/server/routes.go) 中，存在多处返回空响应体状态码的代码：

- [routes.go#L153](file:///e:/solo-code-2/yarr/src/server/routes.go#L153)：`c.Out.WriteHeader(http.StatusNoContent)` — DELETE 文件夹
- [routes.go#L213](file:///e:/solo-code-2/yarr/src/server/routes.go#L213)：`c.Out.WriteHeader(http.StatusNotModified)` — 图标缓存协商
- [routes.go#L312](file:///e:/solo-code-2/yarr/src/server/routes.go#L312)：`c.Out.WriteHeader(http.StatusNoContent)` — DELETE Feed
- [routes.go#L548](file:///e:/solo-code-2/yarr/src/server/routes.go#L548)：`c.Out.WriteHeader(http.StatusNoContent)` — 登出

### 3.2 为什么导致客户端解析失败

根据 HTTP 语义（RFC 7230 / RFC 9110）：

- **204 No Content**：响应**必须不**包含消息体（MUST NOT include a message body）。
- **304 Not Modified**：响应**必须不**包含消息体。

`Content-Encoding: gzip` 的语义是"响应体使用 gzip 编码"。当客户端收到 `204` + `Content-Encoding: gzip` 时：

1. 客户端（如浏览器、curl）会认为存在一个 gzip 编码的消息体，尝试从空响应体中读取并解压。
2. 由于实际没有消息体（或仅有 gzip writer 的空头部），解压时遇到 `io.ErrUnexpectedEOF` 或 `gzip: invalid header` 错误。
3. 某些 HTTP 客户端库会严格按 RFC 校验，发现 `Content-Encoding` 与空 body 矛盾直接报错。

### 3.3 完整的修复方案

核心思路：在 `WriteHeader` 中拦截"无消息体"的状态码，绕过 gzip 包装，直接操作底层 `src`：

```go
type gzipResponseWriter struct {
	http.ResponseWriter

	out    *gzip.Writer
	src    http.ResponseWriter
	bypass bool
}

func (rw *gzipResponseWriter) WriteHeader(statusCode int) {
	if statusCode == http.StatusNoContent || statusCode == http.StatusNotModified ||
		statusCode >= 100 && statusCode < 200 {
		rw.bypass = true
		rw.src.Header().Del("Content-Encoding")
	}
	rw.src.WriteHeader(statusCode)
}

func (rw *gzipResponseWriter) Write(x []byte) (int, error) {
	if rw.bypass {
		return rw.src.Write(x)
	}
	return rw.out.Write(x)
}
```

同时在 `Middleware` 中将 `Content-Encoding` 的设置推迟到确认不是空响应之后，或者在 `WriteHeader` 的 bypass 分支中主动删除：

```go
func Middleware(c *router.Context) {
	if !strings.Contains(c.Req.Header.Get("Accept-Encoding"), "gzip") {
		c.Next()
		return
	}

	gz := &gzipResponseWriter{out: gzip.NewWriter(c.Out), src: c.Out}
	c.Out.Header().Set("Content-Encoding", "gzip")
	c.Out = gz
	c.Next()

	if !gz.bypass {
		gz.out.Close()
	}
}
```

当 `bypass` 为 `true` 时，跳过 `gz.out.Close()` 以避免向空响应写入 gzip 尾部标记。

### 3.4 更彻底的方案：延迟 Content-Encoding 设置

将 `Content-Encoding` 的设置也延迟到首次 `Write` 调用时，确保只有在实际写入消息体时才声明编码：

```go
type gzipResponseWriter struct {
	http.ResponseWriter

	out       *gzip.Writer
	src       http.ResponseWriter
	bypass    bool
	headerSet bool
}

func (rw *gzipResponseWriter) Header() http.Header {
	return rw.src.Header()
}

func (rw *gzipResponseWriter) WriteHeader(statusCode int) {
	if statusCode == http.StatusNoContent || statusCode == http.StatusNotModified ||
		statusCode >= 100 && statusCode < 200 {
		rw.bypass = true
	}
	rw.src.WriteHeader(statusCode)
}

func (rw *gzipResponseWriter) Write(x []byte) (int, error) {
	if rw.bypass {
		rw.src.Header().Del("Content-Encoding")
		return rw.src.Write(x)
	}
	if !rw.headerSet {
		rw.src.Header().Set("Content-Encoding", "gzip")
		rw.headerSet = true
	}
	return rw.out.Write(x)
}
```

这种方案遵循了 Go 标准库的惯例（如 `httputil.ReverseProxy`），仅在确认有消息体写入时才设置传输编码头。

---

## 总结

| 问题 | 根因 | 影响 | 修复核心 |
|------|------|------|----------|
| 接口丢失 | 匿名嵌入只能委托接口声明的方法 | SSE/WebSocket 等实时推送失效 | 显式实现 `http.Flusher`/`http.Hijacker` 并委托 |
| Panic 安全性 | `defer` 可保证执行，但忽略错误 | gzip 流可能不完整，错误静默 | 显式调用 `Close()` + recovery 中间件 |
| 空响应码缺陷 | 无条件设置 `Content-Encoding` | 204/304 响应导致客户端解压失败 | `WriteHeader` 拦截空状态码，bypass gzip |
