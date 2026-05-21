# 后端服务初始化引导与全局配置分析

## 一、initApp() 必须作为第一个异步步骤的原因

### 代码依赖链分析

在 [server.js](file:///e:/solo-code-2/flame/server.js#L22-L26) 中，启动顺序为：

```js
await initApp();      // 第1步
await connectDB();    // 第2步
await associateModels(); // 第3步
await jobs();         // 第4步
```

### initApp() 的核心职责

从 [utils/init/index.js](file:///e:/solo-code-2/flame/utils/init/index.js#L7-L13) 可以看到，`initApp()` 执行了以下关键操作：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | `initDockerSecrets()` | 读取 Docker secrets |
| 2 | `initSecret()` | 初始化密钥 |
| 3 | `await initFiles()` | 创建 `data/` 目录下的必要文件（`flame.css`、`customQueries.json`、`themes.json`） |
| 4 | **`await initConfig()`** | **创建 `data/config.json`** |
| 5 | `await normalizeTheme()` | 规范化主题配置 |

### 为什么必须最先执行

`initApp()` 是整个后端的**基础设施构建器**，它创建了 `data/` 目录下所有必需的文件，其中最为关键的是 **`data/config.json`**。

[utils/loadConfig.js](file:///e:/solo-code-2/flame/utils/loadConfig.js#L5-L16) 是全局配置的读取入口：

```js
const loadConfig = async () => {
  const configExists = await checkFileExists('data/config.json');

  if (!configExists) {
    await initConfig();  // 兜底创建
  }

  const config = await readFile('data/config.json', 'utf-8');
  return JSON.parse(config);
};
```

`loadConfig` 虽然内置了兜底创建逻辑，但这是一种**被动防御机制**，而非主动构建。如果 `initApp()` 不先执行：

1. **后续 `connectDB()`、`associateModels()`、`jobs()` 可能在内部调用 `loadConfig`**，届时 `data/config.json` 尚不存在，需要依赖兜底逻辑——但兜底逻辑本身可能与其他初始化步骤存在竞态。
2. **`initFiles()` 会创建 `data/` 目录结构**，而 `initConfig()` 依赖此目录存在。如果跳过 `initApp()` 直接调用 `loadConfig`，`data/` 目录可能尚未创建，`copyFile` 操作会失败。
3. **主题文件 `themes.json` 也由 `initFiles()` 创建**，与 `config.json` 是配套关系。先初始化所有文件再读取配置，确保了**文件系统状态的一致性**。

### 前置依赖性总结

`initApp()` → 创建 `data/config.json` → `loadConfig()` 才能正常读取配置 → 后续模块依赖配置运行。这是一条严格的**文件系统依赖链**，一旦被打破，后续所有依赖全局配置的代码都会在启动时崩溃。

---

## 二、并发请求下的 initConfig() 竞态风险

### 竞态场景分析

假设两个 HTTP 请求（Request A 和 Request B）同时到达，且此时 `data/config.json` 尚未创建：

```
时间线 ─────────────────────────────────────────────►

Request A: checkFileExists → false → initConfig() → copyFile → readFile → writeFile
Request B: checkFileExists → false → initConfig() → copyFile → readFile → writeFile
          ↑                                                ↑          ↑
          并发窗口1：两者都看到文件不存在                 并发窗口2：两者都在写入
```

### 具体的崩塌路径

#### 路径 1：copyFile 覆盖

在 [initConfig.js](file:///e:/solo-code-2/flame/utils/init/initConfig.js#L5-L23) 中：

```js
const initConfig = async () => {
  const configExists = await checkFileExists('data/config.json');
  if (!configExists) {
    await copyFile('utils/init/initialConfig.json', 'data/config.json'); // 行9
  }
  const existingConfig = await readFile('data/config.json', 'utf-8');    // 行12
  // ... merge logic ...
  await writeFile('data/config.json', JSON.stringify(parsedConfig));     // 行22
};
```

- Request A 和 Request B 都通过了 `checkFileExists` 检查（均为 `false`）。
- Request A 执行 `copyFile` 成功，此时文件已存在。
- Request B 也执行 `copyFile`——虽然文件已存在，但 `copyFile` 会**覆盖**（Node.js `fs.copyFile` 默认行为是覆盖），这不会直接出错，但与后续的 `readFile`/`writeFile` 形成竞态。

#### 路径 2：readFile 读到空文件或半写文件

如果 Request A 正在 `writeFile` 写入过程中，Request B 的 `readFile` 可能读到**不完整或空的 JSON**，导致 `JSON.parse` 抛出 `SyntaxError`，整个请求链崩溃。

#### 路径 3：writeFile 相互覆盖

- Request A 读取了旧内容 → 计算了新内容 → 准备写入
- Request B 也读取了旧内容 → 计算了新内容 → 先写入
- Request A 后写入 → **Request B 的修改被丢失**（lost update）

### 系统性崩塌的表现

1. **配置数据丢失**：如果 Request A 和 Request B 传入的配置项不同（例如一个是用户修改配置、一个是系统初始化配置），后写入的会覆盖先写入的，导致配置丢失。
2. **请求 500 错误**：`JSON.parse` 失败会导致未捕获的异常，Express 返回 500，前端白屏。
3. **配置不一致**：在多次并发触发后，`data/config.json` 的最终状态是不确定的，取决于哪个请求最后完成写入。
4. **级联失败**：如果崩溃发生在 `jobs()` 定时任务启动后，定时任务下次执行时再次触发竞态，形成**反复崩溃循环**。

### 根本原因

`loadConfig` 和 `initConfig` 之间缺乏**互斥锁（mutex）**机制。`checkFileExists` → `initConfig` 不是原子操作，在高并发下存在 TOCTOU（Time-of-check to time-of-use）漏洞。

### 修复思路

可使用 `proper-lockfile` 或 Node.js 原生的 `fs.flock` 实现文件级锁，或在应用层使用 `async-mutex` 包：

```js
const { Mutex } = require('async-mutex');
const configMutex = new Mutex();

const loadConfig = async () => {
  const release = await configMutex.acquire();
  try {
    const configExists = await checkFileExists('data/config.json');
    if (!configExists) {
      await initConfig();
    }
    const config = await readFile('data/config.json', 'utf-8');
    return JSON.parse(config);
  } finally {
    release();
  }
};
```

---

## 三、HTTP 与 WebSocket 共用同一端口的实现原理

### 代码架构

在 [server.js](file:///e:/solo-code-2/flame/server.js#L29-L34) 中：

```js
const server = http.createServer();
server.on('request', api);              // HTTP 路由 → Express

const weatherSocket = new Socket(server); // 传入同一 server 实例
```

在 [Socket.js](file:///e:/solo-code-2/flame/Socket.js#L5-L8) 中：

```js
class Socket {
  constructor(server) {
    this.webSocketServer = new WebSocket.Server({ server });
    // ...
  }
}
```

### 传输层协调分发机制

Node.js 的 `http.Server` 在 TCP 层监听端口，所有连接先到达 TCP 层。分发逻辑如下：

```
客户端请求（TCP 层）
    │
    ▼
http.Server（监听同一端口）
    │
    ├─ 普通 HTTP 请求 ──► 'request' 事件 ──► Express API 处理
    │
    └─ Upgrade 请求 ────► 'upgrade' 事件 ──► WebSocket.Server 处理
                         (Header: Upgrade: websocket)
```

#### 1. HTTP 请求路径

当客户端发送普通 HTTP 请求时，`http.Server` 解析请求行和请求头，确认**没有** `Upgrade: websocket` 头，触发 `request` 事件，将 `req` 和 `res` 交给 Express 的 `api` 处理。这就是 `server.on('request', api)` 的作用。

#### 2. WebSocket 升级路径

当客户端发起 WebSocket 连接时，它先发送一个**特殊的 HTTP GET 请求**，携带如下头：

```
GET /ws HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

`http.Server` 检测到 `Upgrade: websocket` 头后，**不会触发 `request` 事件**，而是触发 `upgrade` 事件，并将底层的 TCP socket 传递给该事件的监听器。

`ws` 库的 `WebSocket.Server({ server })` 在构造时自动注册了 `upgrade` 事件监听器：

```js
// ws 库内部伪代码
server.on('upgrade', (req, socket, head) => {
  this.handleUpgrade(req, socket, head, (ws) => {
    this.emit('connection', ws, req);
  });
});
```

`handleUpgrade` 方法执行 WebSocket 握手（计算 `Sec-WebSocket-Accept` 等），握手成功后 TCP 连接升级为 WebSocket 连接，后续数据帧由 WebSocket 协议解析。

### 为什么可以共用同一端口

- **复用监听 socket**：`ws` 库不自己调用 `server.listen()`，而是依附于已有的 `http.Server`。两者共享同一个 TCP 监听 socket。
- **协议层分发**：分发发生在 HTTP 协议层（通过 `Upgrade` 头判断），而非 TCP 层。这是一种**应用层多路复用（application-layer multiplexing）**。
- **零额外端口开销**：无需为 WebSocket 单独开放端口，简化了部署和防火墙配置。

### 潜在注意事项

1. **Express 中的 WebSocket 路由拦截**：如果 Express 中有匹配 WebSocket 路径的路由，它**不会**被触发（因为 `upgrade` 事件不走 `request` 事件），这是预期行为。
2. **Nginx/反向代理配置**：在生产环境中，反向代理需要额外配置以支持 `Upgrade` 头的转发，否则 WebSocket 连接会失败。
3. **负载均衡粘性会话**：WebSocket 是长连接，负载均衡器需要配置粘性会话（sticky session）以确保同一客户端的请求始终到达同一个后端实例。
