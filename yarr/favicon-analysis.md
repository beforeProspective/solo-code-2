# Yarr 订阅源图标拉取机制分析

## 一、FindFavicons 无限制并发问题

### 问题定位

[FindFavicons](file:///e:/solo-code-2/yarr/src/worker/worker.go#L42-L48) 的实现如下：

```go
func (w *Worker) FindFavicons() {
	go func() {
		for _, feed := range w.db.ListFeedsMissingIcons() {
			w.FindFeedFavicon(feed)
		}
	}()
}
```

该函数仅启动了一个匿名 goroutine，然后在其中以 **串行 for 循环** 逐个调用 `FindFeedFavicon`。因此**不存在并发拉取的问题**——它本身就是顺序执行的。

### 但真正的风险在于：与主更新队列的资源竞争

虽然 `FindFavicons` 内部是串行的，但它运行在一个独立的 goroutine 中，且与 `RefreshFeeds` 之间**没有任何协调机制**。具体表现：

1. **HTTP 客户端共享**：[client.go](file:///e:/solo-code-2/yarr/src/worker/client.go#L33) 中定义的全局 `client` 变量被 `FindFavicons` 和 `RefreshFeeds` 共同使用。当 `FindFavicons` 正在逐个请求图标时，`RefreshFeeds` 的 `NUM_WORKERS=4` 个 worker 也在使用同一个 `http.Client` 发起请求，两者会在传输层竞争 TCP 连接资源。

2. **调用时机紧密**：在 [server.go#L52](file:///e:/solo-code-2/yarr/src/server/server.go#L52) 中，服务启动时 `FindFavicons()` 紧挨着 `RefreshFeeds()` 被调用；在 [routes.go#L460-L461](file:///e:/solo-code-2/yarr/src/server/routes.go#L460-L461) 中，OPML 导入后也是先 `FindFavicons()` 再 `RefreshFeeds()`。两者几乎同时触发。

3. **无背压控制**：`FindFavicons` 通过 [ListFeedsMissingIcons](file:///e:/solo-code-2/yarr/src/storage/feed.go#L130) 一次性获取所有缺失图标的 feed 列表，然后无休止地逐个探测。如果缺失图标的 feed 数量很大（例如首次导入 OPML 后可能数百个），该 goroutine 会长时间占用网络 I/O。

4. **`reflock` 未覆盖图标拉取**：[RefreshFeeds](file:///e:/solo-code-2/yarr/src/worker/worker.go#L90-L108) 使用 `reflock` 互斥锁来防止重复刷新，但 `FindFavicons` 完全不参与此锁机制，因此两者可以完全并行执行。

### 潜在的阻塞场景

如果用户导入了包含 500 个订阅源的 OPML 文件，`FindFavicons` 会在后台启动一个 goroutine 串行请求 500 个站点的主页来解析图标，每次请求超时上限为 30 秒（[client.go#L49](file:///e:/solo-code-2/yarr/src/worker/client.go#L49)），最坏情况下该 goroutine 会运行数小时。在此期间，`RefreshFeeds` 的 4 个 worker 需要争抢同一 HTTP 传输层的连接池，导致 feed 更新延迟。

### 改进建议

- 引入 `semaphore` 或带缓冲的 `channel` 限制并发数（虽然当前是串行，但若未来改为并行则必须）
- 让 `FindFavicons` 与 `RefreshFeeds` 共享 `reflock` 或引入优先级调度，确保 feed 内容更新优先于图标拉取
- 在 `FindFavicons` 中加入总超时或最大探测数量限制
- 使用独立的 `http.Client` 实例或在 Transport 层设置 `MaxConnsPerHost` 限制

---

## 二、findFavicon 的图标链接候选搜集逻辑

[findFavicon](file:///e:/solo-code-2/yarr/src/worker/crawler.go#L91-L139) 函数接收 `siteUrl`（站点主页 URL）和 `feedUrl`（订阅源 URL）两个参数，构建候选图标链接列表 `urls`。

### 第一步：解析 siteUrl 的 HTML 内容

```go
if siteUrl != "" {
    if res, err := client.get(siteUrl); err == nil {
        defer res.Body.Close()
        if body, err := io.ReadAll(res.Body); err == nil {
            urls = append(urls, scraper.FindIcons(string(body), siteUrl)...)
            if c := favicon(siteUrl); c != "" {
                urls = append(urls, c)
            }
        }
    }
}
```

当 `siteUrl` 非空时：

1. **请求站点主页**：通过 `client.get(siteUrl)` 获取主页 HTML。
2. **解析 `<link>` 标签**：调用 [scraper.FindIcons](file:///e:/solo-code-2/yarr/src/content/scraper/finder.go#L88-L109)，该函数的逻辑为：
   - 使用 `golang.org/x/net/html` 解析 HTML 为 DOM 树
   - 遍历所有 `<link>` 元素，检查其 `rel` 属性值中是否包含 `"icon"`（不区分大小写）
   - 对匹配的节点提取 `href` 属性，通过 `htmlutil.AbsoluteUrl` 转为绝对 URL
   - 典型匹配：`<link rel="icon" href="/assets/img/favicon.png">` 或 `<link rel="shortcut icon" href="/favicon.ico">`
3. **拼接根路径默认图标**：内部函数 `favicon` 将 siteUrl 解析后拼接为 `{scheme}://{host}/favicon.ico`，作为兜底候选追加到列表末尾

### 第二步：以 feedUrl 为兜底

```go
if c := favicon(feedUrl); c != "" {
    urls = append(urls, c)
}
```

即使 `siteUrl` 为空或请求失败，仍然基于 `feedUrl` 的 scheme 和 host 拼接 `/favicon.ico`，确保至少有一个候选。

### 候选列表的优先级顺序

| 优先级 | 来源 | 示例 |
|--------|------|------|
| 1 | siteUrl 主页中 `<link rel="icon">` 标签的 href | `https://example.com/assets/icon.png` |
| 2 | siteUrl 对应域名的 `/favicon.ico` | `https://example.com/favicon.ico` |
| 3 | feedUrl 对应域名的 `/favicon.ico` | `https://feeds.example.com/favicon.ico` |

### 第三步：逐个验证候选链接

```go
for _, u := range urls {
    res, err := client.get(u)
    // ... 状态码检查 ...
    content, err := io.ReadAll(res.Body)
    ctype := http.DetectContentType(content)
    if imageTypes[ctype] {
        return &content, nil
    }
}
```

按优先级依次请求每个候选 URL，第一个通过 MIME 检测的即被返回。

---

## 三、MIME 嗅探与 io.ReadAll 的内存安全风险

### MIME 嗅探机制

在 [crawler.go#L133-L136](file:///e:/solo-code-2/yarr/src/worker/crawler.go#L133-L136)：

```go
ctype := http.DetectContentType(content)
if imageTypes[ctype] {
    return &content, nil
}
```

- `http.DetectContentType` 遵循 [RFC 2046](https://tools.ietf.org/html/rfc2046) 的 MIME 嗅探规则，仅需读取内容的前 512 字节即可判定类型
- 合法的图像 MIME 类型白名单定义在 [crawler.go#L84-L89](file:///e:/solo-code-2/yarr/src/worker/crawler.go#L84-L89)：

```go
var imageTypes = map[string]bool{
    "image/x-icon": true,
    "image/png":    true,
    "image/jpeg":   true,
    "image/gif":    true,
}
```

- 非 `image/*` 类型的响应（如 `text/html`、`application/json`）会被自动跳过，这能有效过滤掉返回 HTML 错误页面、重定向页面等情况

### io.ReadAll 无大小限制的内存安全风险

问题出在 [crawler.go#L128](file:///e:/solo-code-2/yarr/src/worker/crawler.go#L128) 和 [crawler.go#L105](file:///e:/solo-code-2/yarr/src/worker/crawler.go#L105)：

```go
content, err := io.ReadAll(res.Body)
```

`io.ReadAll` 会将整个响应体读入内存，**没有任何大小上限**。这会导致以下风险：

#### 1. 超大虚假文件导致 OOM

恶意服务器可以返回一个声称是 `/favicon.ico` 但实际大小为数 GB 的响应。`io.ReadAll` 会持续分配内存直到进程被 OOM Killer 杀死或系统耗尽内存。由于 HTTP Client 的超时为 30 秒，攻击者只需在 30 秒内尽可能多地传输数据即可。

#### 2. 多个并发请求叠加

虽然在 `FindFavicons` 中是串行调用，但在 `findFavicon` 函数内部，当 `siteUrl` 非空时：
- 第一次 `io.ReadAll`（第 105 行）读取站点主页 HTML
- 第二次 `io.ReadAll`（第 128 行）读取候选图标内容

两次均无大小限制。此外，如果 `urls` 列表中有多个候选，循环中每次迭代都会执行一次无限制的 `io.ReadAll`。

#### 3. 重复的 defer 泄漏

在 [crawler.go#L123](file:///e:/solo-code-2/yarr/src/worker/crawler.go#L123) 中：

```go
for _, u := range urls {
    res, err := client.get(u)
    // ...
    defer res.Body.Close()
    // ...
}
```

`defer` 在 for 循环内使用，意味着所有响应体的 `Close()` 都会延迟到**函数返回时**才执行。如果 `urls` 有 N 个候选，前 N-1 个响应体会一直占用内存（包括已通过 `io.ReadAll` 读取的全部内容）直到函数结束。

#### 4. 风险量化

假设一个场景：
- 用户导入了 100 个 OPML 订阅源
- 其中 20 个站点的 `/favicon.ico` 返回 100MB 的虚假数据
- 20 × 100MB = 2GB 的内存占用
- 加上主页 HTML 的 `io.ReadAll`（同样无限制），总内存可能远超服务器容量

### 改进建议

1. **使用 `io.LimitReader`**：
   ```go
   content, err := io.ReadAll(io.LimitReader(res.Body, 1<<20)) // 限制 1MB
   ```

2. **检查 Content-Length 响应头**：在读取前先判断 `res.ContentLength`，若超过阈值则跳过

3. **在循环内手动关闭响应体**：将 `defer res.Body.Close()` 改为在每次迭代结束时显式调用 `res.Body.Close()`

4. **引入 `io.CopyN` 流式检测**：先读取前 512 字节进行 MIME 嗅探，再决定是否继续读取完整内容
