# getAllApps.js 架构设计深度分析

## 1. CQRS 读写分离与 RESTful 规范视角下的设计缺陷

### 1.1 GET 请求违反 RESTful 无状态原则

`GET /api/apps` 作为一个资源获取端点，本应是**幂等（idempotent）**且**无副作用（side-effect free）**的。然而当前实现在每次 GET 请求中触发了以下写操作：

- `useDocker()` 中对 Docker API 发起外部调用，随后对 SQLite 执行 `app.update()` 和 `App.create()`
- `useKubernetes()` 中对 Kubernetes API 发起外部调用，随后对 SQLite 执行 `app.update()` 和 `App.create()`

这使得 GET 请求不再是只读操作，而是**读写混合**，直接违反了 RESTful 架构的核心约束：

> **Safe Methods**: GET/HEAD 不应改变服务器状态。

| RESTful 原则 | 当前实现 | 后果 |
|---|---|---|
| GET 请求无副作用 | 每次 GET 触发 DB 写入 | 缓存、重试、代理行为全部失效 |
| 幂等性 | 相同 GET 请求产生不同 DB 状态 | 响应随时间/调用次数变化 |
| 可缓存性 | 强制 `no-store` 且有副作用 | 无法利用 HTTP 缓存层级 |

### 1.2 CQRS 读写分离原则的违背

CQRS（Command Query Responsibility Segregation）的核心思想是将**读模型（Query）**和**写模型（Command）**分离。当前代码在同一个函数中混合了以下职责：

```
GET /api/apps （本应是纯 Query）
  ├── useDocker()      → Command（同步 Docker 状态 → 写入 DB）
  ├── useKubernetes()  → Command（同步 K8s 状态 → 写入 DB）
  └── App.findAll()    → Query（读取 DB）
```

**问题分析：**

1. **职责耦合**：读操作的延迟和可用性被写操作的延迟/失败所拖累。如果 Docker 或 Kubernetes API 响应缓慢，整个 `App.findAll()` 查询也会被阻塞。

2. **故障传染**：外部系统（Docker/K8s API）的故障会直接导致 GET 接口失败或超时，即使数据库中的数据仍然可用。

3. **语义混乱**：接口名为 `getAllApps`，但实际执行了"同步+获取"两个完全不同的动作，调用方无法从接口命名推断其行为。

4. **缺乏事务边界**：`useDocker()` 和 `useKubernetes()` 的写入操作没有被包装在明确的 Command Handler 中，也没有重试/幂等保护。

### 1.3 具体代码问题点

在 [getAllApps.js](file:///e:/solo-code-2/flame/controllers/apps/getAllApps.js) 中：

- **第 21 行** `await useDocker(apps)` — 传入未定义的 `apps` 变量（第 18 行声明但未赋值），参数传递无意义。
- **第 25 行** `await useKubernetes(apps)` — 同上。
- [useDocker.js](file:///e:/solo-code-2/flame/controllers/apps/docker/useDocker.js) 第 41 行和 [useKubernetes.js](file:///e:/solo-code-2/flame/controllers/apps/docker/useKubernetes.js) 第 24 行各自独立调用 `App.findAll()`，导致一次 GET 请求中数据库被查询 **3 次**（useDocker 一次、useKubernetes 一次、最终返回时再一次）。
- [useDocker.js#L111-L113](file:///e:/solo-code-2/flame/controllers/apps/docker/useDocker.js#L111-L113)：当 `unpinStoppedApps` 启用时，对所有 apps 逐条执行 `app.update({ isPinned: false })`，即 N 条 UPDATE 语句。

---

## 2. SQLite 单写锁环境下的并发写入问题

### 2.1 SQLite 的并发模型

SQLite 使用**库级锁（database-level lock）**机制：

- **读锁（Shared Lock）**：多个连接可同时持有，互不阻塞。
- **写锁（Exclusive Lock）**：同一时刻仅一个连接可持有，持有期间所有其他连接（无论读写）均被阻塞。
- **预留锁（Reserved Lock）**：写操作开始前获取，标志"即将写入"，与读锁共存但不与其他预留锁共存。

关键约束：SQLite **不支持并发写入**。任何写操作（INSERT/UPDATE/DELETE）都会获取排他锁，阻塞所有其他操作。

### 2.2 当前设计的并发写入路径

当 N 个客户端并发轮询 `GET /api/apps` 时，每个请求均会执行：

```
请求 1:  useDocker() → 外部 HTTP → App.findAll() → N×UPDATE → M×INSERT/CREATE
请求 2:  useDocker() → 外部 HTTP → App.findAll() → N×UPDATE → M×INSERT/CREATE
请求 3:  useDocker() → 外部 HTTP → App.findAll() → N×UPDATE → M×INSERT/CREATE
...
请求 N:  useDocker() → 外部 HTTP → App.findAll() → N×UPDATE → M×INSERT/CREATE
```

这意味着：

1. **写入风暴（Write Storm）**：每个并发请求都会独立触发一轮完整的同步写入。如果有 20 个客户端同时 poll，数据库将承受 20 轮相同的写入操作。

2. **无流控（No Rate Limiting）**：没有任何机制限制同步操作的频率。即使 Docker/K8s 状态在上一次同步后 100ms 内未发生变化，每次 GET 仍会执行全量同步。

3. **无去重（No Deduplication）**：多个并发请求对同一条 App 记录执行重复的 UPDATE，产生大量冗余写入。

### 2.3 SQLITE_BUSY 与事务拥堵的形成机制

**时序分析：**

```
T0: 请求1 获取 Reserved Lock → 开始事务
T1: 请求1 执行 App.findAll()（读操作，Shared Lock，不阻塞其他读）
T2: 请求1 执行 app.update() #1 → 尝试获取 Exclusive Lock
T3: 请求2 到达，执行 App.findAll() → Shared Lock，与 Reserved Lock 兼容，继续
T4: 请求1 执行 App.create() #1 → Exclusive Lock 持有中
T5: 请求3 到达，尝试执行 app.update() → 必须等待 Exclusive Lock 释放 → 阻塞
T6: 请求2 尝试执行 app.update() → 必须等待 Exclusive Lock 释放 → 阻塞
T7: 请求1 继续执行 app.update() #2~N, App.create() #1~M → 锁持续持有
T8: 请求1 事务提交，锁释放
T9: 请求2 获取锁，开始写入 → 请求3~N 继续等待
T10: 请求2 完成 → 请求3 获取锁 → ...
```

**问题链条：**

| 问题 | 根因 | 影响 |
|---|---|---|
| 锁持有时间长 | 每次同步包含 N+M 条独立的写操作，串行执行 | 其他请求排队等待 |
| 写操作无批量化 | 每条 UPDATE/CREATE 单独执行，无批量 UPSERT | 锁持有时间随 apps 数量线性增长 |
| 无并发保护 | 多请求同时进入同步逻辑，争用同一批数据 | 重复写入+死锁风险 |
| 写放大（Write Amplification） | N 个并发请求 × M 个 apps = N×M 次写操作 | 远超实际数据变更量 |

当并发请求数量超过 SQLite 的 `busy_timeout` 阈值（默认 0，即立即返回 `SQLITE_BUSY`）时，客户端将直接收到 500 错误。

### 2.4 性能重构方案：后台定时任务

项目已有 `node-schedule` 的使用先例（见 [jobs.js](file:///e:/solo-code-2/flame/utils/jobs.js)），可直接复用。

**重构思路：**

```
重构前（请求驱动）:
  GET /api/apps → useDocker() → 写入DB → App.findAll() → 返回
  GET /api/apps → useK8s()   → 写入DB → App.findAll() → 返回

重构后（事件驱动）:
  后台定时任务（每 30s）:
    ├─ useDocker() → 写入DB
    └─ useK8s()   → 写入DB
  
  GET /api/apps:
    └─ App.findAll() → 返回（纯读操作）
```

**具体实现要点：**

1. **创建同步调度器**：在 `utils/jobs.js` 中新增 `syncAppsJob`，使用 `node-schedule` 每 30 秒执行一次。

2. **加锁去重**：使用 `async-mutex` 或 Redis 分布式锁，确保同一时刻只有一个同步任务在执行，防止任务重入。

3. **批量写入**：将逐条 `app.update()` 替换为 `bulkCreate` + `updateOnDuplicate`，或使用 `INSERT ... ON CONFLICT` 语句，将锁持有时间从 O(N) 降至 O(1)。

4. **GET 端点纯净化**：`getAllApps` 仅保留 `App.findAll()` 逻辑，移除所有同步调用。

5. **增量同步**：记录上次同步时间戳，仅处理新增/变更的容器，而非全量遍历。

---

## 3. Cache-Control: no-store 对性能与后端负载的影响

### 3.1 no-store 的语义与影响

`Cache-Control: no-store` 的 HTTP 语义为：

> 响应不得被任何缓存存储（包括浏览器缓存、中间代理、CDN），每次请求必须返回新鲜数据。

这意味着：

- 浏览器每次刷新页面都会发起完整的 HTTP 请求，而非使用本地缓存副本。
- 任何中间代理（如 Nginx 反向代理缓存、CDN）均无法缓存此响应。
- 即使资源未发生任何变化，也无法利用 `304 Not Modified` 协商缓存。

### 3.2 对前端页面性能的影响

**页面刷新场景分析：**

```
用户刷新页面:
  1. 浏览器请求静态资源 (HTML/JS/CSS) → 通常有缓存 → 快
  2. 浏览器请求 GET /api/apps → no-store → 必须回源 → 慢
  3. 等待 Docker/K8s 同步完成 → 写入 DB → 读取 DB → 返回
```

| 指标 | 有缓存 | no-store |
|---|---|---|
| 页面加载延迟 | ~50ms（缓存命中） | 500ms~2000ms+（依赖 Docker/K8s 响应） |
| 网络往返 | 0（本地缓存） | 1 次完整 RTT + 后端处理时间 |
| 数据传输 | 0 | 完整 JSON 响应体 |
| TTI（可交互时间） | 几乎即时 | 被 API 响应阻塞 |

### 3.3 对 Docker 套接字与 K8s API 服务器的过载影响

**请求链路：**

```
浏览器 (no-store) 
  → 每次刷新都发 HTTP 请求
    → Node.js 后端
      → useDocker() → Docker Unix Socket (/var/run/docker.sock)
      → useK8s()   → Kubernetes API Server
```

**过载放大机制：**

1. **乘数效应**：假设 100 个活跃用户，每人每天刷新 20 次页面 → 2000 次 GET 请求。每次 GET 触发 1 次 Docker API 调用 + 1 次 K8s API 调用 → 4000 次外部 API 调用。

2. **峰值放大**：用户集中在线时段（如上班高峰），并发 GET 请求呈爆发式增长，直接传导至 Docker 套接字和 K8s API Server。

3. **无效请求**：即使容器/ingress 状态 24 小时未变，`no-store` 策略仍强制每次全量同步，产生大量"空跑"请求。

4. **链式故障**：K8s API Server 过载 → 响应变慢 → `getAllApps` 阻塞时间增长 → Node.js 事件循环拥堵 → 其他接口也受影响 → 系统整体降级。

**对比：如果使用合理缓存策略**

```
Cache-Control: public, max-age=30, stale-while-revalidate=60

- 30s 内刷新：浏览器直接使用缓存 → 0 次后端请求 → 0 次 Docker/K8s 调用
- 30s~90s 内刷新：浏览器使用缓存 + 后台静默 revalidate → 1 次同步
- 90s 后刷新：正常请求 → 1 次同步
```

在 2000 次日刷新场景下，实际触发同步的请求量从 2000 次降至约 100 次（30s 间隔内重复请求去重），减少 **95%** 的外部 API 调用。

### 3.4 改进建议

```javascript
// 生产环境：使用合理的缓存策略
res.status(200).set({
  'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
  'ETag': `"${hash(JSON.stringify(apps))}"`,
}).json({
  success: true,
  data: apps,
});
```

结合后台定时任务 + 合理缓存，可以实现：

- **GET 请求纯读**：不再触发任何写入，延迟从秒级降至毫秒级。
- **同步去耦**：Docker/K8s 同步由定时任务驱动，频率可控，不受用户行为影响。
- **降级友好**：Docker/K8s 故障时，GET 接口仍可返回数据库中已缓存的数据，而非直接失败。

---

## 总结

| 维度 | 当前问题 | 改进方向 |
|---|---|---|
| RESTful 合规性 | GET 请求有副作用 | GET 纯读，同步独立为 Command |
| CQRS 分离 | 读写混合在同一函数 | Query 与 Command 分离 |
| SQLite 并发 | 每次 GET 触发写入风暴 | 后台定时任务 + 互斥锁 + 批量 UPSERT |
| 缓存策略 | no-store 强制每次回源 | max-age + stale-while-revalidate + ETag |
| 可观测性 | 同步失败静默吞掉 | 独立任务可单独监控告警 |
| 故障隔离 | Docker/K8s 故障直接阻塞 GET | 读写分离后互不影响 |