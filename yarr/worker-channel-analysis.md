# Worker 刷新机制分析

## 问题 1：无缓冲 dstqueue 为何不会死锁？

### 核心代码

```go
// refresher — src/worker/worker.go:110-135
func (w *Worker) refresher(feeds []storage.Feed) {
    srcqueue := make(chan storage.Feed, len(feeds))   // 缓冲 = len(feeds)
    dstqueue := make(chan []storage.Item)              // 无缓冲

    for range NUM_WORKERS {
        go w.worker(srcqueue, dstqueue)
    }

    for _, feed := range feeds {
        srcqueue <- feed          // ① 主协程向 srcqueue 发送
    }
    for range feeds {
        items := <-dstqueue       // ② 主协程从 dstqueue 接收
        if len(items) > 0 {
            w.db.CreateItems(items)
        }
        atomic.AddInt32(w.pending, -1)
        w.db.SyncSearch()
    }
    close(srcqueue)
    close(dstqueue)
}
```

### 为什么不会死锁

不会死锁的关键在于 **发送-接收的严格配对** 与 **主协程的执行顺序**：

1. **srcqueue 有足够缓冲**：`srcqueue` 缓冲大小为 `len(feeds)`，因此 ① 处的循环会一次性无阻塞地将所有 feed 写入 `srcqueue`，主协程不会被卡在发送端。

2. **主协程写入完毕后立即进入纯接收模式**：当 ① 循环结束后，主协程不再做任何写入操作，立刻进入 ② 的纯接收循环，始终处于"准备好接收"的状态。

3. **dstqueue 的写入/接收次数严格 1:1**：
   - 每个 worker 从 `srcqueue` 读取一个 feed，处理后向 `dstqueue` 写入 **恰好一个** `[]storage.Item`。
   - 总写入次数 = `len(feeds)`，总接收次数 = `len(feeds)`，严格匹配。
   - 由于 `dstqueue` 无缓冲，每次 worker 写入时主协程已经在 ② 循环中等待接收，因此写入方不会被永久阻塞。

4. **时序对齐**：在极端时序下，可能有多个 worker 同时尝试写入 `dstqueue`，但由于无缓冲通道的特性，只有一个能成功"配对"到主协程的接收操作，其余 worker 短暂阻塞直到主协程下一次接收。因为接收循环迭代次数与总写入次数相等，所以每一个写入最终都会被消费，不会出现循环等待。

**简言之**：无缓冲通道不等于死锁。死锁的充分条件是"循环等待"，而本设计中主协程在发送阶段完毕后始终在接收端等待，不会同时持有对方需要的资源，因此不可能形成循环等待。

---

## 问题 2：listItems 出错时 dstqueue 接收什么数据，主协程是否跳过 CreateItems？

### worker 协程的错误处理

```go
// worker — src/worker/worker.go:137-144
func (w *Worker) worker(srcqueue <-chan storage.Feed, dstqueue chan<- []storage.Item) {
    for feed := range srcqueue {
        items, err := listItems(feed, w.db)
        if err != nil {
            w.db.SetFeedError(feed.Id, err)
        }
        dstqueue <- items    // 无论 err 是否为 nil，都会发送
    }
}
```

### listItems 的错误返回值

查看 [crawler.go](file:///e:/solo-code-2/yarr/src/worker/crawler.go#L162-L197) 中 `listItems` 的实现：

| 错误场景 | 返回值 | items 的值 |
|---------|--------|-----------|
| HTTP 请求失败 | `return nil, err` | `nil` |
| 状态码异常（如 404） | `return nil, fmt.Errorf(...)` | `nil` |
| 304 Not Modified | `return nil, nil` | `nil` |
| 解析失败 | `return nil, err` | `nil` |

在所有错误路径中，`items` 均为 `nil`。

### 主协程如何处理 nil 切片

```go
items := <-dstqueue
if len(items) > 0 {
    w.db.CreateItems(items)
}
```

- 当 `items` 为 `nil` 时，`len(nil)` 在 Go 中返回 `0`，因此 `len(items) > 0` 为 `false`。
- **主协程会跳过 `w.db.CreateItems(items)` 调用**，不会将无效数据写入数据库。
- 但主协程仍会执行 `atomic.AddInt32(w.pending, -1)` 和 `w.db.SyncSearch()`，保证进度计数器正确递减。

**结论**：当 `listItems` 出错时，`dstqueue` 接收到的是 `nil`（一个 nil 切片），主协程通过 `len(items) > 0` 判断自动跳过 `CreateItems`，不会产生数据异常。

---

## 问题 3：通道如何关闭？异常中止时是否会发生协程泄漏？

### 正常关闭流程

在 [refresher](file:///e:/solo-code-2/yarr/src/worker/worker.go#L110-L135) 中，通道的关闭发生在接收循环之后：

```go
for range feeds {
    items := <-dstqueue     // 接收全部 len(feeds) 条结果
    // ...
}
close(srcqueue)             // 关闭源通道
close(dstqueue)             // 关闭目标通道
```

关闭时序分析：

1. **当接收循环结束时**，所有 `len(feeds)` 条 feed 都已被 worker 处理完毕（因为 dstqueue 恰好收到了 `len(feeds)` 条结果）。
2. **worker 协程的状态**：每个 worker 使用 `for feed := range srcqueue` 循环。由于所有 feed 已被消费完毕，此时 worker 们阻塞在 `range srcqueue` 上等待新值或等待通道关闭。
3. **`close(srcqueue)`**：触发所有 worker 的 `range` 循环退出，worker 协程正常结束。
4. **`close(dstqueue)`**：此时已无任何接收方，关闭操作仅为释放资源。

### 异常中止时的协程泄漏风险

当前代码 **没有** 任何异常恢复或上下文取消机制。如果 `refresher` 在执行过程中因未知异常（如 panic）提前退出：

1. **`srcqueue` 和 `dstqueue` 不会被关闭**，因为 `close()` 语句在接收循环之后，异常会跳过它们。

2. **Worker 协程的两种阻塞场景**：

   - **场景 A**：worker 阻塞在 `srcqueue` 的读取上（`for feed := range srcqueue`）。由于 `srcqueue` 不会被关闭，worker 永远不会收到通道关闭信号，导致永久阻塞 → **协程泄漏**。

   - **场景 B**：worker 已从 `srcqueue` 读取到 feed，正在向 `dstqueue` 写入（`dstqueue <- items`）。由于 `dstqueue` 无缓冲且主协程已退出接收循环，没有接收方，worker 永远无法完成写入 → **协程泄漏**。

3. **`reflock` 无法阻止泄漏**：虽然 [RefreshFeeds](file:///e:/solo-code-2/yarr/src/worker/worker.go#L90-L108) 中的 `reflock` 互斥锁可以防止并发刷新，但它无法处理已启动的刷新任务异常终止后的清理工作。

4. **`pending` 计数器残留**：若异常导致 `pending` 未被正确递减至 0，后续的 `RefreshFeeds` 调用将因 `*w.pending > 0` 判断而直接返回 `"Refreshing already in progress"`，导致刷新功能永久失效。

### 潜在改进方向

| 问题 | 改进建议 |
|------|---------|
| 通道未关闭致协程泄漏 | 使用 `context.Context` + `defer close()` 或 `sync.WaitGroup` 管理 worker 生命周期 |
| 异常未恢复致 pending 残留 | 在 `refresher` 中使用 `defer` 确保 `pending` 归零 |
| panic 未处理 | 在 `refresher` 入口使用 `defer recover()` 捕获 panic 并执行清理 |
