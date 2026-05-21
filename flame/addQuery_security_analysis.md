# addQuery.js 自定义搜索引擎快捷查询模块 - 代码安全分析报告

---

## 一、异常捕获链条断裂分析

### 1.1 相关代码结构

**addQuery.js 第10行核心代码：**

```javascript
let content = JSON.parse(file.read());
```

**File.js read() 方法实现：**

```javascript
read() {
  try {
    const content = fs.readFileSync(this.path, { encoding: 'utf-8' });
    this.content = content;
    return this.content;
  } catch (err) {
    return err.message;
  }
}
```

**asyncWrapper.js 异常包装：**

```javascript
function asyncWrapper(foo) {
  return function (req, res, next) {
    return Promise.resolve(foo(req, res, next)).catch(next);
  };
}
```

### 1.2 三种异常场景的断裂分析

#### 场景一：文件被意外删除

| 步骤 | 执行路径 | 结果 |
|------|----------|------|
| 1 | `fs.readFileSync('data/customQueries.json')` | 抛出 `ENOENT: no such file or directory` |
| 2 | File.read() 的 catch 块捕获 | 返回错误消息字符串 |
| 3 | `JSON.parse("ENOENT: no such file...")` | 抛出 `SyntaxError` |
| 4 | asyncWrapper 的 `.catch(next)` | 捕获异常并传递给 errorHandler |
| 5 | errorHandler 处理 | 由于 SyntaxError 无 statusCode，返回 500 |

**断裂点：File.read() 在捕获文件系统异常后，返回了 `err.message` 这个普通字符串，而非抛出异常或返回可识别的空值。调用方无法区分这是正常的JSON内容还是错误消息。

#### 场景二：权限不足

| 步骤 | 执行路径 | 结果 |
|------|----------|------|
| 1 | `fs.readFileSync()` | 抛出 `EACCES: permission denied` |
| 2 | File.read() 捕获 | 返回权限错误消息字符串 |
| 3 | `JSON.parse("EACCES: permission denied")` | 抛出 `SyntaxError` |
| 4 | 同上 | 返回 500 |

#### 场景三：文件内容损坏为空白

| 步骤 | 执行路径 | 结果 |
|------|----------|------|
| 1 | `fs.readFileSync()` | 成功读取空字符串 `""` |
| 2 | File.read() 返回 | `""` |
| 3 | `JSON.parse("")` | 抛出 `SyntaxError: Unexpected end of JSON input` |
| 4 | asyncWrapper 捕获 | 返回 500 |

### 1.3 异常链条的根本原因

```
正常预期链条：
fs.readFileSync 异常 → File.read() 重新抛出 → asyncWrapper.catch() → errorHandler → 友好错误响应

实际断裂链条：
fs.readFileSync 异常 → File.read() 返回 err.message → JSON.parse() 抛出 SyntaxError → asyncWrapper.catch() → errorHandler → 500 未捕获异常
```

**核心问题**：File.read() 的异常处理策略有误。它将异常吞掉并转为字符串返回，导致：

1. 调用方无法通过 `try-catch` 检测文件读取失败
2. JSON.parse() 得到意外的输入，产生语义不相关的 SyntaxError
3. 原始的文件系统错误信息被掩盖，开发者难以定位真正的问题原因
4. 服务器返回 500，而非预期的业务错误响应

---

## 二、相对路径定位偏差与数据丢失风险

### 2.1 问题代码

```javascript
const file = new File('data/customQueries.json');
```

### 2.2 风险场景分析

#### 场景一：多服务集群部署

```
Server A (CWD: /opt/flame-service)
  → 解析路径: /opt/flame-service/data/customQueries.json ✓

Server B (CWD: /opt/flame-service-2)
  → 解析路径: /opt/flame-service-2/data/customQueries.json ✓

问题：
- 两台服务器读取/写入的是完全不同的文件
- 数据无法同步，导致集群状态不一致
```

#### 场景二：多实例进程守护

```
实例1: pm2 start server.js --cwd /opt/flame
  → 读取: /opt/flame/data/customQueries.json

实例2: pm2 start server.js --cwd /opt/flame-backup
  → 读取: /opt/flame-backup/data/customQueries.json

问题：
- 不同实例操作不同的文件副本
- 负载均衡下用户请求落到不同实例时数据不一致
```

#### 场景三：不同工作目录启动

```
方式1: cd /opt/flame && node server.js
  → 路径: /opt/flame/data/customQueries.json

方式2: node /opt/flame/server.js
  → 路径: $PWD/data/customQueries.json (取决于 $PWD 可能是 /root)

问题：
- 同一台机器上，不同启动方式产生不同的文件位置
- 可能创建多个孤立的 customQueries.json 文件
- 旧数据与新数据分散
```

### 2.3 风险总结

| 风险类型 | 影响 | 严重程度 |
|----------|------|----------|
| 数据不一致 | 集群中不同节点数据不同步 | 高 |
| 数据丢失 | 新实例启动后读取不到历史数据 | 高 |
| 数据混乱 | 多个文件副本产生数据冲突 | 中 |
| 部署失败 | 目标目录不存在时写入失败 | 中 |

---

## 三、同步文件读写的并发竞态问题

### 3.1 问题代码

```javascript
const file = new File('data/customQueries.json');
let content = JSON.parse(file.read());
// ... 修改 content ...
file.write(content, true);
```

### 3.2 单进程环境下的执行分析（修正）

**重要修正：** 在单进程、单线程 Node.js 环境中，以下场景 **不可能** 发生：

```
时间线：
─────────────────────────────────────────────────────►

请求A:  [读取文件] → [修改数据] → [写入文件]
请求B:         [读取文件] → [修改数据] → [写入文件]
```

**原因：**

1. **同步代码不会被中断：** Node.js 的同步操作（`fs.readFileSync`、`fs.writeFileSync`）会完全阻塞主线程，从发起 `file.read()` 到 `file.write()` 完成的整段同步代码在调用栈上连续执行，期间调用栈不会清空。

2. **事件循环暂停：** 只要调用栈上有同步代码在执行，事件循环就处于暂停状态，无法调度任何其他请求或回调。

3. **无并发插入机会：** 在没有 `await` 等异步占位符的情况下，两个请求**不可能**在同步代码块中间交错执行。

**单进程同步代码执行的原子性：**

```
┌──────────────────────────────────────────────────────┐
│  调用栈 (Call Stack)                                  │
│  ┌───────────────────────────────────────────────┐   │
│  │ file.read()                                   │   │
│  │ JSON.parse()                                  │   │
│  │ content.queries.push()                        │   │  ← 整个同步块原子执行
│  │ file.write()                                  │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
         ↑
    期间事件循环暂停
    其他请求无法插入
```

### 3.3 真正的竞态风险场景

虽然单进程内同步代码不会交错，但以下场景仍存在并发竞态风险：

#### 场景一：多进程集群部署

```
进程1 (Node.js):
  请求A: [file.read()] → [修改] → [file.write()]
进程2 (Node.js):
          请求B: [file.read()] → [修改] → [file.write()]

操作系统层面：
  进程1: [读取文件] → 数据 [q1, q2]
  进程2:         [读取文件] → 数据 [q1, q2]
  进程1: [写入 qA]
  进程2:         [写入 qB]

结果：qA 数据丢失！
```

#### 场景二：pm2 Cluster 模式

```
PM2 Master
  ├── Worker 1 (Process 1)
  ├── Worker 2 (Process 2)
  └── Worker 3 (Process 3)

不同 Worker 是独立进程，共享同一个文件
请求可能被负载均衡到不同的 Worker
```

#### 场景三：文件系统层面的写入截断

即使在单进程内，如果写入过程中系统崩溃或断电：

```
fs.writeFileSync 内部流程：
1. 打开文件 (截断为 0 字节)
2. 写入数据
3. 关闭文件

如果系统在步骤1和步骤2之间崩溃：
- 文件被截断为空
- 原有数据永久丢失
```

### 3.4 风险总结

| 场景 | 并发风险 | 说明 |
|------|----------|------|
| 单进程部署 | **无** | 同步代码原子执行，无交错可能 |
| 多进程/集群 | **有** | 不同进程操作同一文件 |
| pm2 cluster | **有** | Worker 进程独立运行 |
| 系统崩溃 | **有** | 写入截断导致数据丢失 |

---

## 四、修复建议

### 4.1 修复 File.read() 异常处理

```javascript
read() {
  try {
    const content = fs.readFileSync(this.path, { encoding: 'utf-8' });
    this.content = content;
    return this.content;
  } catch (err) {
    throw new Error(`Failed to read file: ${err.message}`);
  }
}
```

### 4.2 使用绝对路径

```javascript
const path = require('path');
const file = new File(path.join(__dirname, '../../data/customQueries.json'));
```

### 4.3 并发控制方案

```javascript
// 方案1：使用简单的锁机制
const lockFile = require('proper-lockfile');

// 方案2：使用数据库替代文件存储
// 方案3：使用原子写入
```

---

## 五、总结

| 问题编号 | 问题类型 | 严重程度 | 修复优先级 | 适用场景 |
|----------|----------|----------|----------|----------|
| 1 | 异常处理链断裂 | 高 | P0 | 所有场景 |
| 2 | 相对路径风险 | 高 | P1 | 多服务/多实例部署 |
| 3 | 并发竞态 | 中 | P2 | 仅多进程部署 |

**核心问题**：当前实现将文件系统异常转化为无法识别的字符串，导致异常链断裂，服务器返回 500 错误。建议优先修复 File.read() 的异常处理策略。

**重要修正说明**：在单进程部署环境中，同步代码块具有原子性，不会发生请求间的并发竞态。并发竞态风险仅存在于多进程/集群部署场景。
