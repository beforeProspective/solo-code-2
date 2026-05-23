# weatherCleanerJob 代码分析与重构

## 1. `jobs.js` 第 31-37 行代码分析

原代码如下：

```js
const weatherCleanerJob = schedule.scheduleJob(
  'clearWeather',
  '0 5 */4 * * *',
  async () => {
    clearWeatherData();
  }
);
```

### 1.1 未被 `await` 的异步调用在 Node.js 中的运行机制

`clearWeatherData()` 是一个 `async` 函数，调用它会立即返回一个 **Promise** 对象，而真正的异步操作（`Weather.findOne` → `Weather.destroy`）则被排入微任务队列（microtask queue）。

当定时任务触发时，整个调用链的执行流程如下：

1. `node-schedule` 在定时器到期时同步调用回调函数（该回调是 `async`，因此返回 Promise）。
2. 回调内执行 `clearWeatherData()`，该函数立即返回一个 **处于 pending 状态的 Promise**。
3. 由于调用者没有 `await` 该 Promise，回调函数**立即返回**（返回的 Promise 也被 `node-schedule` 忽略），事件循环把这次触发视为"完成"。
4. 此时 `clearWeatherData` 内部真正的 IO 操作（Sequelize → SQLite）**脱离了原定时任务的同步执行流**，在 V8 的微任务队列中继续运行。
5. 该 Promise 的状态变化（resolve / reject）与调用者完全**解耦**：
   - 如果 resolve，结果被丢弃。
   - 如果 reject，由于没有 `.catch()` 或 `await`，该异常会升级为 **Unhandled Promise Rejection**。

> 关键点：**"fire and forget"（发射即忘）式调用**。回调函数本身虽然是 `async`，但因为没有 `await`，它不会等待数据库操作完成，也不会捕获该操作抛出的异常。这种模式使得错误处理、日志记录、任务串行化全部失效。

---

## 2. `clearWeatherData` 中 Promise 被 reject 时的严重后果

`clearWeatherData` 内部的关键代码（[clearWeatherData.js](file:///e:/solo-code-2/flame/utils/clearWeatherData.js#L4-L18)）：

```js
const weather = await Weather.findOne({ order: [['createdAt', 'DESC']] });

if (weather) {
  await Weather.destroy({
    where: { id: { [Op.lt]: weather.id } },
  });
}
```

当 `findOne` 或 `destroy` 因 **SQLITE_BUSY**、网络异常、磁盘 IO 错误等原因被 reject 时：

- `clearWeatherData` 内部的 `await` 会直接把异常向上抛，使它返回的 Promise 进入 **rejected** 状态。
- 由于调用者（`jobs.js` 第 35 行）**既没有 `await`，也没有 `.catch()`**，这个被 reject 的 Promise 变成了一个 **未处理的 Promise 拒绝（Unhandled Promise Rejection）**。

### 2.1 不同 Node.js 版本下的行为差异

| Node.js 版本 | 行为 |
|--------------|------|
| **v6 ~ v14** | 默认仅输出警告（stderr），进程**不会退出**。但从 v12 开始官方文档已声明未来版本将终止进程。 |
| **v15.x 及之后** | 默认策略为 `--unhandled-rejections=strict`：**一旦出现未处理的 Promise Rejection，进程将以退出码 `1` 直接崩溃**。 |
| **可通过 `--unhandled-rejections` 控制** | `strict` → 崩溃；`throw` → 抛出未捕获异常；`warn` → 仅警告；`none` → 静默忽略。 |

### 2.2 实际影响

- **服务中断**：在 Node.js v15+ 环境下，`weatherCleanerJob` 每 4 小时触发一次，只要 SQLite 出现任何锁竞争或 IO 异常，**整个 Flame 后端进程就会被强制杀死**，所有正在进行的 WebSocket、HTTP 请求瞬间断开。
- **错误无法被日志系统捕获**：该异常发生在 V8 的微任务里，不会经过 `try/catch`，也不会被 `logger.log` 记录，导致运维人员无从排查。
- **资源泄漏风险**：如果进程被 PM2 / systemd 重启，可能出现定时任务在锁尚未释放时再次触发，形成**雪崩式**连续崩溃。

---

## 3. 重构建议

### 3.1 重构目标

1. 使用 `await` 等待 `clearWeatherData()` 完成，使定时任务回调与数据库操作保持同步语义。
2. 使用 `try/catch` 捕获所有可能的异常（包括 `SQLITE_BUSY`、Sequelize 连接错误等）。
3. 通过 `logger.log` 将异常写入日志，便于排查。
4. 在异常路径中保留必要的上下文信息（如任务名、时间戳）。

### 3.2 重构后的代码（[jobs.js](file:///e:/solo-code-2/flame/utils/jobs.js#L31-L43)）

```js
// Clear old weather data every 4 hours
const weatherCleanerJob = schedule.scheduleJob(
  'clearWeather',
  '0 5 */4 * * *',
  async () => {
    try {
      await clearWeatherData();
    } catch (err) {
      logger.log(
        `[weatherCleanerJob] Failed to clear weather data: ${err.message}`,
        'ERROR'
      );
    }
  }
);
```

### 3.3 重构要点说明

1. **`await clearWeatherData()`**：
   - 回调现在会真正等待数据库的 `findOne` 与 `destroy` 完成。
   - 即使定时任务的回调返回的 Promise 仍然被 `node-schedule` 忽略，但异常已在回调内部被捕获，不会升级为 Unhandled Promise Rejection。

2. **`try/catch` 包裹**：
   - 任何由 Sequelize/SQLite 抛出的错误（`SQLITE_BUSY`、连接超时、语法错误等）都会进入 `catch` 分支。
   - 进程不会再因为该任务而崩溃。

3. **日志记录**：
   - 统一使用项目已有的 `Logger` 实例 `logger`，保持与其他任务（如 `weatherJob`）一致的日志风格。
   - 日志消息中包含任务名 `[weatherCleanerJob]`，便于过滤与检索。

4. **可扩展**（可选增强）：
   - 如需进一步保障，可在 `catch` 中增加简单的**指数退避重试**逻辑，或在特定错误码（如 `SQLITE_BUSY`）时自动重试。
   - 例如：
     ```js
     async () => {
       const MAX_RETRY = 3;
       for (let i = 0; i < MAX_RETRY; i++) {
         try {
           await clearWeatherData();
           return;
         } catch (err) {
           logger.log(
             `[weatherCleanerJob] Attempt ${i + 1}/${MAX_RETRY} failed: ${err.message}`,
             'ERROR'
           );
           if (i < MAX_RETRY - 1) {
             await new Promise((r) => setTimeout(r, 2 ** i * 1000));
           }
         }
       }
     }
     ```

---

## 4. 总结

| 项 | 现状 | 重构后 |
|----|------|--------|
| 异步等待 | 未 `await`，fire-and-forget | `await`，同步语义 |
| 异常处理 | 无，产生 Unhandled Promise Rejection | `try/catch` 完全捕获 |
| 日志 | 无 | 通过 `logger.log('ERROR')` 记录 |
| 进程稳定性 | Node.js v15+ 下可能崩溃 | 不再因该任务崩溃 |
| 可观测性 | 几乎为零 | 可通过日志排查数据库异常 |

**结论**：只需将 `clearWeatherData()` 改为 `await clearWeatherData()` 并用 `try/catch` 包裹，即可从根本上消除未处理 Promise Rejection 带来的进程崩溃风险，同时获得可追踪的错误日志。
