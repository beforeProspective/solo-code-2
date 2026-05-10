# Pinia Colada 乐观更新并发安全分析

基于 `app/pages/optimistic-todos.vue` 实现的分析

---

## 问题1：不做一致性校验会破坏并发安全的场景

### 关键代码位置
`app/pages/optimistic-todos.vue:70-79`

```typescript
onError(err, _title, { oldTodos, newTodos }) {
  if (
    newTodos != null
    && newTodos === queryCache.getQueryData(todosQuery.key)  // 引用一致性校验
  ) {
    queryCache.setQueryData(todosQuery.key, oldTodos)
  }
}
```

### 核心原理
代码使用 **引用比较** `newTodos === queryCache.getQueryData(...)`，目的是判断：**当前缓存是否还是本 mutation 操作后设置的那一份？**

### 具体破坏场景：快速连续添加任务

假设用户快速连续提交任务A和任务B：

| 时间点 | 操作 | 缓存状态 | 保存的上下文 |
|--------|------|----------|--------------|
| T0 | 初始状态 | [todo1, todo2] | - |
| T1 | 执行 addTodo(A) 的 onMutate | [todo1, todo2, A] | oldTodosA=[todo1,todo2], newTodosA=[todo1,todo2,A] |
| T2 | 发起请求A，网络请求中... | [todo1, todo2, A] | - |
| T3 | 执行 addTodo(B) 的 onMutate | [todo1, todo2, A, B] | oldTodosB=[todo1,todo2,A], newTodosB=[todo1,todo2,A,B] |
| T4 | 发起请求B，网络请求中... | [todo1, todo2, A, B] | - |
| T5 | 请求A返回失败，触发 onError(A) | [todo1, todo2, A, B] | - |
| T6 (无校验) | 直接设置缓存 = oldTodosA | **[todo1, todo2]** | ❌ 任务B被覆盖丢失！ |
| T6 (有校验) | 检查 `newTodosA === 缓存?` → false，跳过回滚 | [todo1, todo2, A, B] | ✅ 保留B的乐观更新 |

### 为什么会发生？

1. 每个 mutation 的 `onMutate` 都会创建一个**新的数组引用**（使用展开运算符 `[...oldTodos, newTodoItem]`）
2. 当B的 `onMutate` 执行后，缓存指向的是 `newTodosB` 这个新引用
3. 如果A失败时直接用 `oldTodosA` 回滚，会把B的乐观更新完全覆盖掉

### 结论
**一致性校验的作用：防止"早失败"的请求覆盖"晚开始"请求的乐观更新。**

---

## 问题2：弱网环境下并发请求的场景推演

### 场景设定
- 弱网环境（网络延迟高、请求响应慢）
- 用户快速连续提交任务A和任务B
- 请求A优先返回失败
- 请求B仍在等待中

---

### 完整时间线推演

| 时间点 | 事件 | UI显示 | 缓存状态 | 说明 |
|--------|------|--------|----------|------|
| **T0** | 初始状态 | [todo1, todo2] | [todo1, todo2] | - |
| **T1** | 用户输入"A"并提交 | - | - | 触发 addTodo("A") |
| **T2** | A 的 onMutate 执行 | [todo1, todo2, **A**] | newTodosA = [todo1, todo2, A] | A显示为灰色（id<0） |
| **T3** | 发起请求A（POST /api/todos） | [todo1, todo2, A] | [todo1, todo2, A] | 网络请求中... |
| **T4** | 用户输入"B"并提交 | - | - | 请求A仍在等待 |
| **T5** | B 的 onMutate 执行 | [todo1, todo2, A, **B**] | newTodosB = [todo1, todo2, A, B] | B也显示为灰色 |
| **T6** | 发起请求B（POST /api/todos） | [todo1, todo2, A, B] | [todo1, todo2, A, B] | 请求A、B都在等待 |
| **T7** | ⚠️ **请求A返回失败** | [todo1, todo2, A, B] | [todo1, todo2, A, B] | 触发 onError(A) |
| **T8** | onError(A) 检查一致性 | [todo1, todo2, A, B] | [todo1, todo2, A, B] | `newTodosA === 缓存?` → **false** ❌ |
| **T9** | 跳过回滚，显示错误提示 | [todo1, todo2, A, B] | [todo1, todo2, A, B] | **真空期开始！** |
| **T10** | onSettled(A) 执行 | [todo1, todo2, A, B] | [todo1, todo2, A, B] | 调用 `invalidateQueries()` |
| **T11** | refetch 可能被 cancelQueries 影响或延迟 | [todo1, todo2, A, B] | [todo1, todo2, A, B] | 请求B仍在进行中 |
| **T12** | ⏳ 真空期持续...请求B仍在等待 | [todo1, todo2, A, B] | [todo1, todo2, A, B] | A是"幽灵数据" |
| **T13** | 假设请求B返回**成功** | [todo1, todo2, A, B] | [todo1, todo2, A, B] | 触发 onSuccess(B) |
| **T14** | onSuccess(B) 替换B的临时ID | [todo1, todo2, A, B(真实ID)] | [todo1, todo2, A, B(真实ID)] | B正常了，A还在 |
| **T15** | onSettled(B) 执行 | - | - | 再次调用 `invalidateQueries()` |
| **T16** | ✅ refetch 从服务器获取最新数据 | [todo1, todo2, B(真实ID)] | [todo1, todo2, B(真实ID)] | **幽灵数据A消失** |
| **T17** | 真空期结束 | [todo1, todo2, B(真实ID)] | [todo1, todo2, B(真实ID)] | 状态最终一致 |

---

### 分支情况：请求B也失败

| 时间点 | 事件 | UI显示 | 缓存状态 |
|--------|------|--------|----------|
| **T13'** | 请求B返回失败 | [todo1, todo2, A, B] | [todo1, todo2, A, B] |
| **T14'** | onError(B) 检查一致性 | [todo1, todo2, A, B] | [todo1, todo2, A, B] | `newTodosB === 缓存?` → **true** ✅ |
| **T15'** | 回滚到 oldTodosB = [todo1, todo2, A] | [todo1, todo2, A] | [todo1, todo2, A] | B消失了，A还在 |
| **T16'** | onSettled(B) 执行 | - | - | `invalidateQueries()` |
| **T17'** | ✅ refetch 获取服务器数据 | [todo1, todo2] | [todo1, todo2] | **幽灵数据A消失** |

---

### 真空期内的隐患

#### 1. 用户认知混乱
- **视觉欺骗**：UI上显示A正在提交（灰色、未完成），但实际上A已经失败了
- **错误预期**：用户可能等待A完成，或以为A已保存成功，稍后会刷新出来
- **重复操作**：用户可能重新提交相同的任务，造成重复添加

#### 2. 操作限制与可用性问题
从 `app/pages/optimistic-todos.vue:213,222` 可以看到：
```vue
:disabled="todo.id < 0"  // 临时ID（负数）的任务无法切换完成或删除
```

- 临时任务A无法被操作（toggle/delete 按钮都禁用）
- 但A仍占据列表空间，干扰用户视线
- 用户无法主动"取消"这个幽灵数据

#### 3. 状态不同步的风险
- 如果用户在真空期内刷新页面，A不会出现在列表中（因为服务器根本没有A）
- 这会造成"刚才明明添加了，刷新后消失"的困惑体验
- 如果有其他页面/组件依赖这个缓存数据，可能显示不一致

#### 4. 竞态条件的叠加
如果真空期内用户继续操作（比如添加任务C）：
- 任务C的乐观更新会基于 [todo1, todo2, A, B(或B成功后的状态)]
- 最终 refetch 时，A消失，C的位置可能"跳变"

---

### 系统如何最终修复？

核心机制在 `app/pages/optimistic-todos.vue:65-68`：
```typescript
onSettled() {
  queryCache.invalidateQueries({ key: todosQuery.key })
}
```

**修复流程：**
1. 每个 mutation 无论成功失败，都会在 `onSettled` 中调用 `invalidateQueries()`
2. `invalidateQueries` 会触发从服务器重新拉取数据（refetch）
3. 服务器返回的真实数据中不包含失败的A
4. UI 被更新为服务器的真实状态 → 幽灵数据A消失

**为什么 onSettled(A) 没有立即让 A 消失？**

可能的原因：
1. **cancelQueries 的影响**：`onMutate` 中调用了 `queryCache.cancelQueries(...)`，可能取消了正在进行的 refetch
2. **请求优先级**：正在进行的 mutation 请求（请求B）可能有更高优先级
3. **时机问题**：当 `invalidateQueries` 触发时，缓存仍被引用，后续操作继续基于缓存修改

无论如何，**最终兜底机制**是：当所有并发请求都完成后，最新的 refetch 会把 UI 同步到服务器的真实状态。

---

## 设计权衡总结

| 问题 | 根本原因 | 影响 | 兜底方案 |
|------|----------|------|----------|
| 问题1（无校验） | 直接回滚会覆盖后续操作 | 数据丢失（任务B被覆盖） | 一致性校验防止 |
| 问题2（校验导致延迟） | 校验阻止了即时回滚 | 真空期内显示幽灵数据 | `invalidateQueries` 最终同步 |

### 核心设计哲学

**一致性校验 = 牺牲即时性，换取数据完整性**

- 宁可让用户短暂看到幽灵数据，也不能丢失用户的其他有效操作
- 最终依靠 `invalidateQueries` 保证"最终一致性"
- 这是一种典型的 **Optimistic UI + Eventual Consistency** 设计模式

### 可能的改进方向

1. **更精细的回滚策略**：不基于数组引用，而是基于操作本身回滚（如查找并移除特定临时ID的任务）
2. **显式标记失败状态**：给失败的乐观更新添加 `failed: true` 标记，UI上以不同样式显示
3. **重试机制**：对失败的请求自动重试，减少用户感知
4. **事务性乐观更新**：为每个乐观更新分配版本号，回滚时基于版本而非引用
