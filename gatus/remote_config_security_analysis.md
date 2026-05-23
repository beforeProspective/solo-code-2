# Gatus Remote 配置下的性能与安全风险分析

分析目标函数：[getEndpointStatusesFromRemoteInstances](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L54-L84)，调用入口：[EndpointStatuses](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L22-L52)，配置结构：[remote.Config](file:///e:/solo-code-2/gatus/config/remote/remote.go#L9-L21)。

---

## 1. 串行阻塞调用的性能灾难

### 1.1 代码形态

```go
for _, instance := range remoteConfig.Instances {
    response, err := httpClient.Get(instance.URL)   // 阻塞等待
    ...
    if err = json.NewDecoder(response.Body).Decode(&endpointStatuses); err != nil {
        ...
        continue
    }
    ...
}
```

在 [endpoint_status.go#L60-L78](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L60-L78) 中，对 `remoteConfig.Instances` 的遍历是一个纯 `for range` 的同步串行循环，每一次 `httpClient.Get` 都会阻塞当前 Fiber 处理 goroutine，直到远端响应返回或超时才进入下一次迭代。该 HTTP 客户端由 [client.GetHTTPClient](file:///e:/solo-code-2/gatus/client) 构造，其默认超时（参考 `client.Config` 的默认值及测试断言）为 **10 秒**。

### 1.2 最坏情况下的端到端延迟

- 远端实例数量：`N = 10`
- 每个实例网络响应上限：`T = 10s`（超时阈值）
- 串行总阻塞时间：`N × T = 10 × 10s = 100s`

也就是说，**一次来自前端的状态 API 请求在最坏情况下会被阻塞约 100 秒**才能返回。

### 1.3 引发的性能灾难

1. **前端长挂与用户体验恶化**
   前端状态页的 AJAX 请求需要等待 100 秒才能返回，浏览器通常会在 30–120 秒之间主动中断连接（取决于浏览器与代理设置），导致状态面板出现大片"加载失败"，同时用户多次刷新会叠加成更多的并发请求。

2. **Fiber worker goroutine 耗尽**
   Gatus 使用 `gofiber/fiber`，默认会在每个请求上占用一个 goroutine。当若干个 `/api/v1/endpoints/statuses` 请求同时涌入，每一个都会被同步循环阻塞 100 秒，goroutine 数与相关的文件描述符会快速堆积：
   - 每个阻塞中的请求持一个 `response.Body` 的 TCP 连接；
   - `store.Get().GetAllEndpointStatuses` 还会占用存储层的读事务；
   - 形成"请求 → 等待 → 新请求"的雪崩，最终压垮服务。

3. **缓存被穿透与放大效应**
   在 [endpoint_status.go#L25](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L25) 处虽然存在 `cache.Get`，但缓存 key 只与 `page`、`pageSize` 绑定，TTL 由 `cacheTTL` 决定。一旦缓存过期，首笔请求必须跑完 100 秒的同步循环才能写回缓存，而这 100 秒窗口内的所有其他请求都会"缓存未命中"，再次进入串行循环，进一步放大阻塞。

4. **上游反向代理/负载均衡器的连接占用**
   反向代理（Nginx / ALB / Cloudflare 等）通常为每个上游连接维护一个独立的工作线程或事件。持续 100 秒的慢响应会把代理的可用连接池耗尽，进一步演变成"502/504 风暴"，甚至被 CDN 判定为源站离线。

5. **对其他 API 的连带阻塞**
   Gatus 对外暴露的 API 共用同一个 Fiber 服务。大量被串行循环卡住的 goroutine 会加剧调度开销、GC 压力与内存水位，导致其他 API（如外部端点推送、健康检查接口）的 P99 延迟显著抬高。

---

## 2. SSRF 漏洞利用链分析

### 2.1 可控输入的来源

- 配置结构：[remote.Instance](file:///e:/solo-code-2/gatus/config/remote/remote.go#L17-L20) 中 `URL` 字段直接来自 YAML 配置，未做任何白名单校验。
- 校验函数：[ValidateAndSetDefaults](file:///e:/solo-code-2/gatus/config/remote/remote.go#L22-L37) 仅对 `ClientConfig` 做校验，**完全没有校验 `Instances[*].URL` 的协议、主机、端口或网段**。

### 2.2 典型 SSRF 利用链

**前提**：攻击者能够修改部署配置（通过 CI/CD 泄漏、配置中心越权、热更新接口暴露、弱口令等），把 `remote.instances[].url` 指向任意目标。

**利用步骤**：

1. **信息探测**：将 `url` 指向内网敏感地址，例如：
   - `http://169.254.169.254/latest/meta-data/`（AWS 元数据）
   - `http://10.0.0.1:6379/`（Redis 未授权访问）
   - `http://kubernetes.default.svc/api/v1/namespaces/default/secrets`
   - `file:///etc/passwd`（如果底层 HTTP 客户端支持 `file://` 协议，Go `net/http` 默认不支持，但自定义 Transport 可能引入）

2. **触发调用**：前端正常访问 `/api/v1/endpoints/statuses` 即会触发一次同步 `httpClient.Get`，等价于让 Gatus 服务端主动对内网发起 GET 请求。

3. **响应回显**：远端返回的数据会通过 [json.NewDecoder(response.Body).Decode](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L68) 解析成 `[]*endpoint.Status`，成功时被 `append` 到最终响应并回显给前端，失败时错误信息也会通过 [logr.Errorf](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L64) 写入日志形成侧信道。攻击者可根据 HTTP 状态、响应体或错误描述判断内网端口/服务的存活情况。

4. **横向移动跳板**：
   - Gatus 服务端通常拥有比外部用户更高的网络权限（VPC 内可达、NAT 出口、Service Account）；
   - 若被探测目标本身支持 `GET` 写入（如某些 REST 管理接口、K8s API 在挂载了 service-account token 的前提下），SSRF 可升级为"远程写操作"，进一步造成数据泄漏或权限提升。

### 2.3 为什么这是"典型 SSRF"

- **服务端主动发起**：请求完全由 Gatus 发起，绕过了客户端侧的 CORS 与防火墙。
- **目标可被攻击者间接控制**：`instance.URL` 完全未过滤。
- **响应被回显或形成可观察的行为差异**：成功时数据进入合并结果返回，失败时错误日志暴露连通性与协议差异。
- **具备进入内网的能力**：Gatus 作为监控服务几乎总是部署在可访问内部元数据、内部数据库、相邻微服务的网络位置。

### 2.4 缓解建议

1. 在 `remote.Config.ValidateAndSetDefaults` 中增加对 `Instances[*].URL` 的校验：
   - 强制协议 `https://`；
   - 禁止私有地址段（RFC1918）、链路本地地址（`169.254.0.0/16`）、回环地址；
   - 可选：白名单域名列表。
2. 使用独立的、具备更小权限网络策略的专用 HTTP Transport（独立出口、独立 Service Account）。
3. 禁止把远程响应的原始错误详细回显到客户端（当前仅写日志尚可，但若未来变更为直接返回会进一步恶化）。

---

## 3. 无限空格流对内存与 CPU 的消耗

### 3.1 解码代码

```go
if err = json.NewDecoder(response.Body).Decode(&endpointStatuses); err != nil {
    _ = response.Body.Close()
    ...
    continue
}
```

见 [endpoint_status.go#L67-L73](file:///e:/solo-code-2/gatus/api/endpoint_status.go#L67-L73)。

### 3.2 `json.Decoder.Decode` 的行为

`encoding/json` 的 `Decoder` 基于 `io.Reader`（这里是 `response.Body`）进行流式读取。其关键特征：

1. **前导空白被跳过**：按照 [RFC 7159](https://datatracker.ietf.org/doc/html/rfc7159#section-2)，JSON 允许在值之前出现空白（`space`、`\t`、`\n`、`\r`）。`Decoder.Decode` 会循环读取字节直到遇到非空白字符或 EOF。
2. **没有显式最大令牌长度**：Go 的 `json.Decoder` 虽然有缓冲，但缓冲大小是动态扩展的（内部 `scan.reset()` 会在需要时分配更多内存），且没有 `MaxBytes` 上限。
3. **没有读取超时**：该函数使用的 `httpClient` 只有"整请求超时"（从 `httpClient.Get` 返回后到 `Decode` 完成，不受超时限制），而 **`response.Body` 的读取没有独立的 deadline**。

### 3.3 "无限空格流"场景下的资源消耗

若远端被攻陷或攻击者通过 SSRF 控制了一个"慢速发送空格"的 HTTP 服务（例如 1 字节/秒），会出现以下后果：

1. **CPU：长时间忙碌**
   - `Decoder` 持续从 `io.Reader` 读取并调用 `scan.step`（状态机）跳过空白，每个字节都经过一次状态转移；
   - 循环 goroutine 长时间占用 CPU 调度，干扰其他监控与告警 goroutine 的实时性。

2. **内存：渐进式增长直至 OOM**
   - `json.Decoder` 内部使用 `bufio.Reader` 缓冲网络数据；
   - 当读取速度持续高于处理速度时，缓冲持续增长；
   - 更糟糕的是：一旦空格终于结束，若紧随其后的是一个合法的 JSON 数组（哪怕元素少），`Decode` 会把整个数组分配到 `endpointStatuses` 中；如果攻击者同时发送一个巨量 JSON（数 GB），内存会直接被撑到 OOM，触发容器被 OOMKilled。

3. **goroutine 泄漏风险**
   - 由于 `Decode` 阻塞且无超时，处理该请求的 Fiber goroutine 长时间不退出；
   - 多个并发请求下，goroutine 数量线性上升，最终达到 Go runtime 的调度上限或宿主机的 `ulimit -u` 上限。

4. **TCP 连接耗尽**
   - 每一个"慢速空格流"都会持有一个 TCP 连接；
   - Gatus 同时还承担主动监控任务，需要额外的连接来执行健康检查，两者竞争文件描述符时可能导致健康检查整体失败，出现"假阳性告警"。

### 3.4 缓解建议

1. 使用 `http.MaxBytesReader(w, response.Body, maxBytes)` 或在自定义 `http.Transport` 上设置响应大小上限。
2. 给 `Decode` 加一个超时：用 `time.AfterFunc` 配合 `context.WithTimeout`，并在读取层用支持 deadline 的 reader（或把 `Decode` 包在一个带超时的 goroutine 中，超时后主动关闭 `response.Body` 使 `Decode` 尽快返回 `io.ErrUnexpectedEOF`）。
3. 限制 JSON 深度与数组长度（可使用 `json.Decoder.Token` 做流式计数，或在 `endpoint.Status` 上做总量校验后再 `append`）。
4. 对 `endpointStatuses` 追加一个 `MaxRemoteEndpoints` 上限，防止单个远端返回的列表过大造成内存爆炸。

---

## 4. 总结：问题根源与修复优先级

| 问题 | 根因 | 风险等级 | 修复优先级 |
|------|------|----------|------------|
| 串行阻塞 100s | 对 `Instances` 同步 `for` 循环，无并发、无整体超时 | 高（可用性） | P0 |
| SSRF 利用链 | `instance.URL` 无任何白名单/网段校验 | 高（安全） | P0 |
| 无限空格/巨量响应 | `json.NewDecoder(response.Body).Decode` 缺少 `MaxBytes` 与读取超时 | 中—高 | P0 |

建议的修复组合：

1. **并发 + 整体超时**：用 `errgroup.WithContext(ctx, timeout)` 并发访问全部远端实例，`ctx` 携带一个"总时间预算"（例如 2 秒），任何单实例超时立即取消。
2. **URL 校验**：在 `remote.Config.ValidateAndSetDefaults` 中对协议、域名、IP 段严格过滤。
3. **响应体上限**：用 `http.MaxBytesReader` 或手动 `io.LimitReader` 包裹 `response.Body`，并为 `Decode` 加上 deadline。
4. **缓存优化**：把远端数据的合并缓存与本地存储缓存解耦，避免本地存储缓存失效时远端拉取阻塞主路径。
