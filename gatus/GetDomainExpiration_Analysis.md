# GetDomainExpiration 并发与解析缺陷分析

针对 [client.go](file:///e:/solo-code-2/gatus/client/client.go#L58-L89) 中 `GetDomainExpiration` 的三个问题进行深入分析。

---

## 问题一：热点域名缓存失效时的并发击穿

### 1.1 是否会同时触发数十次 RDAP/WHOIS 查询？

**答案：会。**

`GetDomainExpiration` 第 60~70 行的缓存检查逻辑如下：

```go
if v, exists := whoisExpirationDateCache.Get(hostname); exists {
    domainExpiration = time.Until(v.(time.Time))
    retrievedCachedValue = true
    cacheEntryTTL, _ := whoisExpirationDateCache.TTL(hostname)
    if cacheEntryTTL > 24*time.Hour && domainExpiration > 24*time.Hour {
        return domainExpiration, nil
    }
}
// 一旦 TTL ≤ 24h 或域名 ≤ 24h，所有协程都会穿透到下面的 RDAP/WHOIS 查询
whoisResponse, err := rdapQuery(hostname)
if err != nil {
    whoisResponse, err = whoisClient.QueryAndParse(hostname)
}
```

当一个热点域名的缓存 TTL 临近或已经失效，而同一时刻有数十个监控任务并发调用 `GetDomainExpiration(hostname)` 时：

1. 第 60 行的 `whoisExpirationDateCache.Get(hostname)` 对所有协程返回 `exists=false` 或 TTL 已经不足；
2. 所有协程都会越过缓存检查的"早退"分支，进入第 71 行的 `rdapQuery`；
3. 每个协程都会各自独立地发起一次 RDAP HTTP 请求，失败后再各自独立地发起一次 WHOIS TCP 请求；
4. 只有第一个查询成功的协程会在第 83/85 行重新 `SetWithTTL` 写入缓存；其他协程在这期间仍然会不断撞到远端服务。

结果就是：在缓存失效那一瞬间，并发的探测会像潮水一样直接打到 RDAP/WHOIS 服务端，**完全没有合并、没有请求去重**。

### 1.2 缺失哪种 Go 常用并发防击穿机制？

**缺失的是 `singleflight`（请求合并 / singleflight 模式）。**

Go 生态中应对"热点 key 缓存失效并发击穿"的常见、标准做法是使用 `golang.org/x/sync/singleflight`（或在 `x/sync` 中实现一个类似的 Group）。它的核心思想：

- 对同一个 key 的并发请求，只让 **第一个** 请求真正去执行昂贵的 I/O；
- 其他并发请求阻塞等待第一个请求的结果返回，然后共享结果；
- 这正是 `Do(key string, fn func() (interface{}, error))` 的语义。

结合本场景，合理的改法应当是：

```go
var expirationQueryGroup singleflight.Group

func GetDomainExpiration(hostname string) (time.Duration, error) {
    // ... 缓存检查 ...
    if needRefresh {
        v, err, _ := expirationQueryGroup.Do(hostname, func() (interface{}, error) {
            return queryExpiration(hostname) // 内部封装 RDAP + WHOIS 回退 + 写缓存
        })
        // 使用 v
    }
    return domainExpiration, nil
}
```

除此之外，还可以辅以「**提前异步刷新**」（stale-while-revalidate：即使 TTL 到期，在后台异步刷新期间仍然先返回旧值）以及「**负缓存**」（查询失败时也写入一个短 TTL 的失败占位）等策略。但 `singleflight` 是解决本题所述"数十次同时穿透"问题最直接、最对口的机制，也是 Go 语言中处理这类问题的"标配"。

本代码既没有 `singleflight`，也没有互斥锁/Mutex、也没有单飞语义的等价实现，因此缺失的就是 **singleflight 并发请求合并机制**。

---

## 问题二：刷新失败下是否会形成永不自熔断的重试风暴？

**答案：会。** 这是一个典型的"无负缓存 / 无断路器"导致的重试风暴。

### 2.1 逻辑推演

关键代码路径：

```go
if err != nil {
    if !retrievedCachedValue { // 命中缓存则静默吞掉错误
        return 0, fmt.Errorf("error querying and parsing hostname using whois client: %w", err)
    }
    // 如果 retrievedCachedValue=true，则函数以非 0 的 domainExpiration 返回（使用旧值）
} else {
    // 查询成功才会写回缓存
    whoisExpirationDateCache.SetWithTTL(hostname, ...)
}
```

考虑两种场景：

**场景 A：缓存彻底过期（`exists=false`，`retrievedCachedValue=false`）**

- RDAP 失败 → WHOIS 也失败（如被防火墙拦截）；
- `retrievedCachedValue` 为 false，函数返回 error；
- 缓存中依然没有该 key；
- 下一轮监控（数秒后）再次调用 `GetDomainExpiration`，再次走到 `exists=false`，再次穿透到 RDAP/WHOIS；
- 如此反复，每一轮都会触发一次 RDAP + 一次 WHOIS 请求，**无限循环，永远不会自熔断**。

**场景 B：缓存存在但 TTL 接近过期（`retrievedCachedValue=true`）**

- 函数会继续尝试 RDAP/WHOIS 以刷新；
- 若刷新失败，代码不会写入任何新缓存，也不会将 `retrievedCachedValue` 设为 false；
- 函数以"旧值"返回，但**不会重新 SetWithTTL**，缓存 TTL 持续倒数；
- 当缓存 TTL 最终跌到 0、`Get` 返回 `exists=false` 时，退化为场景 A，进入无限重试风暴。

### 2.2 为什么无法自熔断？

当前代码的写缓存行为被**严格限定在"查询成功"的分支**（第 80 行的 `else`），一旦 RDAP 和 WHOIS **都失败**，就不会：

1. 写入一个"失败占位"或"负缓存"条目（例如对该 hostname 缓存 5 分钟内不要再查）；
2. 也没有熔断器（circuit breaker，如 `sony/gobreaker`、`afex/hystrix-go`）在连续失败 N 次后进入"打开"状态、在一段时间内直接短路、不再触发远端查询；
3. 也没有在刷新失败时**沿用旧值并延长 TTL**（graceful degradation）。

因此当网络/防火墙/服务商故障时，代码既不会"背压"也不会"退避"，而是**每一轮监控周期都坚持尝试**，构成经典的重试风暴：

- 监控周期越短，重试频率越高；
- 监控任务越多，流量压力越大；
- 服务端被打崩的概率越高，反过来又进一步加剧重试；
- 形成正反馈循环，**无法自我收敛**。

### 2.3 建议的防御手段

1. **负缓存**：查询失败时也 `SetWithTTL(hostname, sentinel, 5*time.Minute)`，命中 sentinel 直接返回错误，避免立刻重试；
2. **断路器**：对 RDAP/WHOIS 的远端调用套一层 circuit breaker，达到失败阈值后进入 open 状态，在窗口期内直接失败返回；
3. **指数退避 + 抖动**：配合 `time.AfterFunc` 或轮询间隔自适应，避免周期性同步冲击；
4. **stale-while-revalidate**：刷新失败时保留旧值并适度延长 TTL，让缓存条目不至于迅速"裸奔"。

---

## 问题三：RDAP 事件顺序导致的过期时间误判

### 3.1 代码行为

[rdapQuery](file:///e:/solo-code-2/gatus/client/client.go#L515-L535) 第 525~530 行：

```go
for _, e := range domain.Events {
    if e.Action == "expiration" {
        response.ExpirationDate = e.Date.Time
        break
    }
}
```

它的语义是：**按 `domain.Events` 切片的原始顺序遍历，取第一个 `Action == "expiration"` 的事件就 break**。

### 3.2 RFC 规范与实际情况

根据 [RFC 9082 §4.5](https://www.rfc-editor.org/rfc/rfc9082#section-4.5)，RDAP 响应中 `events` 数组**没有强制的排序规则**，不同注册局实现差异很大：

- 有的注册局按事件发生时间**升序**排列（最早的在前）；
- 有的按事件发生时间**降序**排列（最新的在前）；
- 有的按事件类型分组；
- 部分注册局还会把**历史续费记录**作为 `expiration` 事件多次写入（例如注册时设一个过期日期，后续每次续费又追加一个新的 `expiration` 事件）。

### 3.3 会导致的荒谬后果

当注册局按 **时间升序** 返回 `expiration` 事件（最常见的"自然顺序"，即"先发生的在前面"）时：

- `domain.Events` 中**第一个** `expiration` 事件对应的是**域名注册时最初设置的过期日期**，而不是最后一次续费后得到的最新过期日期；
- 代码取到的 `ExpirationDate` 可能是一个**好几年以前**、甚至早已过期的时间点；
- `time.Until(thatDate)` 会返回一个**负数**；
- 后续任何以 `domainExpiration > 24*time.Hour` 为条件的判断（例如缓存 TTL 决策、告警阈值等）将全部失效；
- 更糟糕的是，如果上层逻辑把负值当作"已过期"处理，系统会反复告警"域名即将过期"，即便该域名实际上已经续费到很远的未来。

举个例子：

- 域名 `example.com`，注册于 2020-01-01，初始过期日 2021-01-01；
- 2020-12-01 续费到 2022-01-01；
- 2021-12-01 续费到 2023-01-01；
- RDAP 返回 `events` 中包含三个 `expiration` 事件，按升序分别是 2021、2022、2023；
- 代码取第一个 → `ExpirationDate = 2021-01-01`；
- 在 2026 年调用 `GetDomainExpiration("example.com")` 会得到一个约 **-5 年** 的负值。

### 3.4 正确做法

应当从所有 `Action == "expiration"` 的事件中**取最晚的那个日期**（而不是第一个）：

```go
var latestExpiration time.Time
for _, e := range domain.Events {
    if e.Action == "expiration" && e.Date.Time.After(latestExpiration) {
        latestExpiration = e.Date.Time
    }
}
if latestExpiration.IsZero() {
    return nil, fmt.Errorf("no expiration event found in RDAP response for %s", hostname)
}
response.ExpirationDate = latestExpiration
```

这样无论注册局按升序、降序或乱序返回事件数组，都能正确取到"最新一次续费后的过期日期"。

---

## 总结

| # | 问题 | 根因 | 影响 | 推荐修复 |
|---|------|------|------|----------|
| 1 | 热点域名缓存失效时数十次并发穿透 | 缺少 singleflight 合并 | RDAP/WHOIS 被瞬时打爆，可能触发限流封禁 | 引入 `golang.org/x/sync/singleflight`，按 hostname 合并请求 |
| 2 | 刷新失败后无法自熔断的重试风暴 | 无负缓存、无断路器、失败不写入缓存 | 每轮监控周期都触发远端查询，形成正反馈 | 增加负缓存 + circuit breaker + 指数退避 |
| 3 | RDAP 事件按升序导致过期时间误判 | 只取第一个 `expiration` 事件并 `break` | 拿到历史续费的旧日期，`Until` 返回负值，告警失真 | 遍历所有 `expiration` 事件，取 `time.Time` 最大的那个 |
