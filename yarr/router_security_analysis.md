# Router 系统代码安全与设计分析

## 1. routeRegexp 正则转换的安全隐患分析

### 问题描述
在 [match.go](file:///e:/solo-code-2/yarr/src/server/router/match.go#L14-L24) 的 `routeRegexp` 函数中，路径通配符的正则转换逻辑存在安全隐患：

```go
func routeRegexp(route string) *regexp.Regexp {
    chunks := regexp.MustCompile(`[\*\:]\w+`)
    output := chunks.ReplaceAllStringFunc(route, func(m string) string {
        if m[0:1] == `*` {
            return "(?P<" + m[1:] + ">.+)"  // *path -> .+
        }
        return "(?P<" + m[1:] + ">[^/]+)"   // :id -> [^/]+
    })
    output = "^" + output + "$"
    return regexp.MustCompile(output)
}
```

### 安全隐患分析

#### 1.1 `*path` 通配符使用 `.+` 的风险

- **路径遍历攻击（Path Traversal）**：`.+` 匹配任意字符（包括 `.` 和 `/`），攻击者可构造恶意路径绕过访问控制
  - 示例：路由 `/files/*filepath` 可被 `/files/../../etc/passwd` 匹配
  - 后果：可能导致未授权访问系统敏感文件

- **点号特殊字符问题**：
  - 匹配 `.` 可能导致意外的文件扩展名处理
  - 可绕过基于文件扩展名的安全过滤

#### 1.2 `:id` 使用 `[^/]+` 的潜在问题

虽然 `[^/]+` 排除了斜杠，但仍存在问题：
- 匹配点号（`.`）可能导致：
  - 意外匹配文件扩展名
  - 可能绕过某些安全检查
- 匹配空字节等特殊字符

#### 1.3 正则表达式自身问题

- 缺少对输入路径的转义处理：如果 `route` 参数本身包含正则特殊字符（如 `.`, `+`, `*`），会被当作正则元字符解析
- 示例：路由路径 `/api/v1.0/users` 中的 `.` 会匹配任意字符

### 修复建议

```go
func routeRegexp(route string) *regexp.Regexp {
    // 先转义正则特殊字符，再处理占位符
    chunks := regexp.MustCompile(`[\*\:]\w+`)
    
    // 提取所有占位符，转义其余部分
    var output strings.Builder
    lastIndex := 0
    
    for _, match := range chunks.FindAllStringIndex(route, -1) {
        // 转义占位符之前的普通文本
        output.WriteString(regexp.QuoteMeta(route[lastIndex:match[0]]))
        
        m := route[match[0]:match[1]]
        if m[0:1] == `*` {
            // 通配符路径不应匹配上级目录
            output.WriteString("(?P<" + m[1:] + ">(?:[^/]+/)*[^/]+)")
        } else {
            // 命名参数更严格限制，排除点号等特殊字符
            output.WriteString("(?P<" + m[1:] + ">[^./]+)")
        }
        lastIndex = match[1]
    }
    output.WriteString(regexp.QuoteMeta(route[lastIndex:]))
    
    return regexp.MustCompile("^" + output.String() + "$")
}
```

---

## 2. 中间件注册顺序问题分析

### 问题描述
在 [router.go](file:///e:/solo-code-2/yarr/src/server/router/router.go#L34-L43) 的 `For` 方法中，路由 Handler 与中间件的合并时机决定了中间件必须先注册：

```go
func (r *Router) For(path string, handler Handler) {
    chain := make([]Handler, 0)
    chain = append(chain, r.middle...)  // 复制当前中间件
    chain = append(chain, handler)      // 添加终点处理函数

    x := Route{}
    x.regex = routeRegexp(path)
    x.chain = chain                     // 保存到 Route 结构体
    r.routes = append(r.routes, x)
}

func (r *Router) Use(h Handler) {
    r.middle = append(r.middle, h)
}
```

### 根本原因

#### 2.1 快照机制

- **值复制**：`chain = append(chain, r.middle...)` 创建的是 `r.middle` 当前状态的**副本**
- **独立存储**：每个 `Route` 结构体保存独立的 `chain` 切片，与 `r.middle` 脱离引用关系
- **无动态关联**：后续对 `r.middle` 的修改（通过 `Use`）不会影响已创建的路由链

#### 2.2 时序依赖

执行顺序决定结果：

```go
// 正确顺序：中间件生效
router.Use(authMiddleware)
router.For("/api/users", usersHandler)  // chain 包含 authMiddleware

// 错误顺序：中间件不生效
router.For("/api/users", usersHandler)  // chain 为空
router.Use(authMiddleware)              // 仅更新 r.middle，不影响已注册路由
```

### 设计权衡

| 设计方式 | 优点 | 缺点 |
|---------|------|------|
| 快照式（当前实现） | 路由注册后行为确定，性能高 | 中间件顺序严格，易出错 |
| 动态查找 | 中间件可随时添加 | 每次请求需动态构建chain，性能开销 |

### 改进建议

添加运行时检查或文档约束：

```go
func (r *Router) For(path string, handler Handler) {
    if len(r.routes) > 0 && len(r.middle) == 0 {
        log.Println("warning: no middleware registered before route registration")
    }
    // ... 原有逻辑
}
```

---

## 3. Context.Next 越界问题分析与修复

### 问题描述
在 [context.go](file:///e:/solo-code-2/yarr/src/server/router/context.go#L22-L25) 的 `Next` 方法中缺乏边界检查：

```go
func (c *Context) Next() {
    c.index++
    c.chain[c.index](c)  // 无越界检查！
}
```

### 可能引发的运行时错误

#### 3.1 数组越界 Panic

**触发场景**：

1. **终点 Handler 错误调用 Next**
```go
func finalHandler(c *Context) {
    c.Next()  // 最后一个 handler 调用 Next
}
// index 变为 len(chain)，超出切片范围 → panic: index out of range
```

2. **中间件多次调用 Next**
```go
func badMiddleware(c *Context) {
    c.Next()  // 正常调用
    c.Next()  // 重复调用，index 继续递增
}
```

3. **控制流错误**：中间件在 Next 后继续执行其他逻辑，导致重复执行

#### 3.2 错误表现

```
panic: runtime error: index out of range [3] with length 3

goroutine 1 [running]:
router.(*Context).Next(...)
    /src/server/router/context.go:24
```

### 底层修复方案

#### 方案 A：添加边界检查（推荐）

```go
func (c *Context) Next() {
    c.index++
    if c.index < len(c.chain) {
        c.chain[c.index](c)
    }
}
```

**优点**：
- 静默处理，不中断请求
- 兼容现有代码
- 性能开销极小

#### 方案 B：边界检查 + 日志警告

```go
func (c *Context) Next() {
    c.index++
    if c.index >= len(c.chain) {
        log.Printf("warning: Next() called at end of chain, index=%d, len=%d", 
                   c.index, len(c.chain))
        return
    }
    c.chain[c.index](c)
}
```

**优点**：
- 帮助开发者发现控制流错误
- 生产环境安全

#### 方案 C：严格模式（调试用）

```go
func (c *Context) Next() {
    c.index++
    if c.index >= len(c.chain) {
        panic("Next() called beyond chain length")
    }
    c.chain[c.index](c)
}
```

**适用场景**：开发/测试环境，便于尽早发现问题

### 推荐的最终修复

结合安全性与可调试性：

```go
func (c *Context) Next() {
    c.index++
    if c.index >= len(c.chain) {
        return
    }
    c.chain[c.index](c)
}
```

同时在 [router.go](file:///e:/solo-code-2/yarr/src/server/router/router.go#L75-L81) 的 `ServeHTTP` 中确保正确初始化：

```go
context := &Context{}
context.index = -1  // 确保第一次 Next() 从 0 开始
context.chain = route.chain
context.Next()
```

---

## 总结

| 问题 | 严重程度 | 影响 | 修复成本 |
|-----|---------|------|---------|
| 正则转换安全隐患 | 高 | 路径遍历攻击 | 中 |
| 中间件注册时序问题 | 中 | 功能异常、安全绕过 | 低 |
| Next 越界 panic | 高 | 服务崩溃 | 低 |

建议优先修复 `Context.Next()` 的越界问题和正则表达式安全隐患，中间件问题可通过文档约束或运行时警告缓解。
