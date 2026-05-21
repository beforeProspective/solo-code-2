# Kubernetes Ingress 同步机制深度分析

## 一、`kc.loadFromCluster()` 的凭证依赖与异常行为

### 1.1 容器环境内的凭证依赖

当应用运行于 Kubernetes 集群内部的 Pod 中时，`kc.loadFromCluster()` 依赖以下自动注入的凭证：

| 凭证类型 | 挂载路径 | 用途 |
|---------|---------|------|
| **ServiceAccount Token** | `/var/run/secrets/kubernetes.io/serviceaccount/token` | 作为 Bearer Token 用于 API Server 的身份认证 |
| **CA 证书** | `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt` | 验证 API Server 的 TLS 证书，防止中间人攻击 |
| **Namespace 文件** | `/var/run/secrets/kubernetes.io/serviceaccount/namespace` | 确定当前 Pod 所属的命名空间 |

这些文件由 kubelet 在 Pod 启动时自动挂载，前提是 Pod 绑定了一个有效的 ServiceAccount，且该 ServiceAccount 拥有 `list` 和 `watch` Ingress 资源的 RBAC 权限。

### 1.2 本地开发环境中的凭证依赖

在本地开发环境中，`loadFromCluster()` 会按以下顺序尝试加载配置：

1. 首先尝试读取上述 ServiceAccount 挂载路径（必然失败，因为本地没有这些文件）。
2. 然后回退到查找 kubeconfig 文件，默认路径为 `~/.kube/config`。
3. 若 `KUBECONFIG` 环境变量已设置，则读取该变量指定的路径。

因此，在本地能够成功运行的前提是开发者的机器上配置了有效的 kubeconfig 文件，且其中包含目标集群的认证信息（token、客户端证书等）。

### 1.3 非 Kubernetes 环境下的异常路径

当系统部署在非 Kubernetes 环境（如裸金属服务器、VMware 虚拟机、或普通 Docker 容器）且未提供任何 kubeconfig 文件时：

```
loadFromCluster() 执行流程：
  ├─ 尝试读取 /var/run/secrets/kubernetes.io/serviceaccount/token → ENOENT
  ├─ 尝试读取 ~/.kube/config → ENOENT  
  └─ 抛出异常
```

该异常会被 [useKubernetes.js](file:///e:/solo-code-2/flame/controllers/apps/docker/useKubernetes.js#L19-L21) 中的 `catch` 块捕获，仅通过 `logger.log("Can't connect to the Kubernetes API", 'ERROR')` 记录日志，然后函数继续执行。由于 `ingresses` 变量保持 `null`，后续所有数据同步逻辑（第 23-67 行）都被跳过，函数静默返回。

**关键隐患**：配置项 `kubernetesApps: useKubernetesAPI` 如果在非 K8s 环境中被误开启为 `true`，系统不会在启动阶段报错或拒绝服务，而是在每次请求时产生一条错误日志并跳过同步，导致应用列表缺失 Kubernetes 中的 Ingress 应用，且难以排查。

---

## 二、错误吞没对响应效率与事件循环的影响

### 2.1 对 getAllApps.js 响应效率的影响

在 [getAllApps.js](file:///e:/solo-code-2/flame/controllers/apps/getAllApps.js#L24-L26) 中，`useKubernetes()` 是通过 `await` 同步调用的：

```javascript
if (useKubernetesAPI) {
    await useKubernetes(apps);
}
```

当前的错误处理设计（catch 后不抛出异常）意味着：

- **连接正常时**：`useKubernetes()` 执行完 API 调用和数据库读写后返回，整个过程耗时取决于 Kubernetes API 响应时间 + 数据库 I/O 时间。
- **连接异常时**：`catch` 块捕获异常后，函数立即以 `ingresses = null` 继续，跳过第 23-67 行的全部逻辑。此时函数返回耗时仅为 `loadFromCluster()` 抛出异常的时间（通常在毫秒级），理论上响应更快。

**但真正的问题在于连接超时场景**。

### 2.2 连接超时（ConnectionTimeout）对事件循环的阻塞

当 Kubernetes API 响应极慢或连接超时时，分析如下：

**阻塞机制**：

```
HTTP 请求到达 → getAllApps() → await useKubernetes(apps)
  │
  └─ await k8sNetworkingV1Api.listIngressForAllNamespaces()
       │
       └─ 底层 TCP 连接建立 → 发送 HTTP 请求 → 等待响应
           │
           └─ 若 API Server 无响应 → TCP 重传 → 操作系统级超时（默认 127s Linux / 可配置）
               │
               └─ Promise 处于 pending 状态
```

由于 `listIngressForAllNamespaces()` 返回的是一个 **Promise**，该 Promise 内部封装了一个底层的 HTTP 请求（通过 `request`/`got`/`undici` 等库）。在超时发生之前：

1. **该 Promise 不会 resolve 也不会 reject**，`await` 会一直挂起。
2. Node.js 事件循环本身不会被阻塞（因为异步 I/O 在 libuv 线程池中处理），但**当前请求的响应会被无限期延迟**。
3. 每次 `GET /api/apps` 请求都会创建一个新的 `KubeConfig` 实例和一个新的 API 调用，导致**多个并发的 HTTP 请求同时挂起**。

**累积效应**：

| 请求数 | 每个请求挂起时间 | 占用的底层 Socket | 内存占用 |
|--------|-----------------|-----------------|---------|
| 1 | 30s (假设 timeout 配置) | 1 | 可忽略 |
| 100 | 30s | 100 | 每个请求上下文 ~10-50KB，总计数 MB |
| 1000+ | 30s | 1000+ | 可能导致文件描述符耗尽（ulimit -n） |

此外，如果操作系统或 Node.js 没有显式配置 TCP 超时，默认超时可能长达 2 分钟以上，在此期间所有请求都将挂起，用户看到的是页面一直加载中。

**关于"catch 块中 re-throw 异常"的误区澄清**：

```javascript
catch (e) {
    logger.log("Can't connect to the Kubernetes API", 'ERROR');
    throw e; // 此做法无法缩短超时前的等待时间！
}
```

**为什么 re-throw 不能解决超时问题？** 这是一个关键的认知误区——`catch` 块中的代码只有在 `await` 的 Promise 被 **reject** 之后才会执行。如果 Kubernetes API Server 无响应，底层的 TCP 连接会持续重传，Promise 处于 **pending 状态**，代码根本不会进入 `catch` 块。re-throw 仅仅是在异常**已经发生后**改变错误传播路径，对缩短超时等待时间毫无帮助。

**`await` 何时让出执行流并进入 catch 块？**

`await` 仅在以下情形下进入 catch 块：

| 触发条件 | Promise 状态 | 典型耗时 |
|---------|-------------|---------|
| DNS 解析失败 | rejected | 毫秒级 |
| TCP 连接被拒绝（目标端口未监听） | rejected | 毫秒级（RST 包立即返回） |
| TLS 握手失败 | rejected | 秒级 |
| API Server 返回 4xx/5xx HTTP 状态码 | rejected | 取决于网络往返时间（RTT） |
| 显式设置的超时（如 `AbortSignal.timeout()`） | rejected | 等于配置的超时值 |
| TCP 连接静默丢失（无响应、无 RST） | **仍 pending** | 取决于操作系统内核参数，可能长达**13-30 分钟** |

**无显式超时时的挂起时长**：

当 Kubernetes API Server 所在节点网络不可达（如防火墙丢弃 SYN 包、节点宕机但网卡仍在）时，TCP 协议栈会进行重传：

- Linux 内核参数 `tcp_retries2` 默认值为 **15**，对应的总重传时间约为 **13-30 分钟**（指数退避：1s → 3s → 7s → 15s → 31s → ...）。
- 在 Node.js 层面，`@kubernetes/client-node` 底层使用 `request`/`got` 库，若未显式配置 `timeout`，则依赖操作系统 TCP 超时。
- 这意味着一个 `await listIngressForAllNamespaces()` 调用可能挂起 **十几分钟** 才会触发 `ETIMEDOUT` 或 `ECONNRESET` 错误，届时 catch 块才会被执行。

**真正有效的解决方案**：必须在 API 客户端初始化时显式配置超时，例如通过 `AbortSignal` 或在 KubeConfig 中设置请求超时，从根源上切断长时间挂起的可能性：

```javascript
const controller = new AbortController();
controller.signal.addEventListener('abort', () => {
    // 超时处理
});
setTimeout(() => controller.abort(), 10000); // 10 秒超时
await k8sNetworkingV1Api.listIngressForAllNamespaces({
    signal: controller.signal
});
```

---

## 三、并发写入完整性分析

### 3.1 当前的合并逻辑

[useKubernetes.js](file:///e:/solo-code-2/flame/controllers/apps/docker/useKubernetes.js#L56-L66) 中的合并逻辑如下：

```javascript
for (const item of kubernetesApps) {
    if (apps.some((app) => app.name === item.name)) {
        const app = apps.find((a) => a.name === item.name);
        await app.update({ ...item, isPinned: true });
    } else {
        await App.create({ ...item, isPinned: true });
    }
}
```

**识别键**：`metadata.annotations['flame.pawelmalak/name']` 被用作唯一标识符，与数据库中 `app.name` 字段进行匹配。

### 3.2 并发场景下的竞态条件

假设存在两个并发的 `useKubernetes()` 调用（如两个用户同时请求 `/api/apps`），且此时一个 Ingress 资源刚被更新：

```
时间线：
  T0: 请求 A 读取 apps = [App1(name="flame", isPinned=false)]
  T1: 请求 B 读取 apps = [App1(name="flame", isPinned=false)]
  T2: 请求 A 发现 "flame" 存在，执行 update({ url: "new-url-v2", isPinned: true })
  T3: 请求 B 发现 "flame" 存在，执行 update({ url: "new-url-v1", isPinned: true })
  T4: 数据库中 App1 的 url = "new-url-v1"（旧值覆盖新值！）
```

这是一个典型的 **Lost Update（丢失更新）** 问题。

### 3.3 连续 Ingress 变更的威胁放大

当 Kubernetes 集群中的 Ingress 配置频繁更新（如 CI/CD 流水线部署新应用、节点漂移导致 Pod 重建）时：

1. **快速连续的同步请求**：每次 `GET /api/apps` 都会触发一次全量 Ingress 扫描和数据库 upsert。
2. **无乐观锁**：代码中没有使用 `version` 字段、`updatedAt` 比较、或数据库层面的 `INSERT ... ON CONFLICT UPDATE`（upsert）来防止竞争。
3. **无同步队列**：没有使用 `Mutex`、`Lock`、或串行队列来保证同一时刻只有一个同步操作在执行。
4. **潜在的数据库死锁**：如果数据库层面对 `App` 表的多行更新操作顺序不一致（例如请求 A 按字母序更新，请求 B 按时间序更新），可能导致死锁。

### 3.4 潜在的数据完整性问题汇总

| 问题类型 | 触条件 | 后果 |
|---------|---------|------|
| 丢失更新 | 两个并发请求使用同一份旧快照 | Ingress 的最新 URL/icon 被旧值覆盖 |
| 重复创建 | 在 `find` 和 `create` 之间，另一个请求已创建同名记录 | 数据库若有唯一约束则抛异常，否则产生重复记录 |
| 中间状态可见 | 请求 A 更新了一半应用，请求 B 开始读取 | 用户看到不一致的应用列表（部分新、部分旧） |
| 无限循环 | Ingress 持续变化 + 频繁轮询 | 数据库 I/O 飙升，CPU 占用过高 |

### 3.5 改进建议

- **使用数据库 upsert**：`App.upsert()` 或原生 SQL 的 `INSERT ... ON CONFLICT (name) DO UPDATE`，将查找和写入合并为原子操作。
- **引入分布式锁**：使用 Redis `SETNX` 或数据库锁（如 `SELECT ... FOR UPDATE`）保证同一时间只有一个同步流程。
- **配置请求超时**：为 `listIngressForAllNamespaces()` 设置合理的超时（如 5-10 秒），避免请求无限挂起。
- **错误传播**：在 `catch` 块中重新抛出异常或返回错误标记，使调用方能感知失败。
