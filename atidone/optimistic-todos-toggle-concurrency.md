# Optimistic Todos Switch 并发请求乱序分析

基于 `app/pages/optimistic-todos.vue` 和 `server/api/todos/[id].patch.ts` 的分析

---

## 问题1：3次快速点击的HTTP请求Body

### 关键代码分析

**前端逻辑** `app/pages/optimistic-todos.vue:95-119`：
```typescript
const { mutate: toggleTodo } = useMutation({
  mutation: (todo: Todo) =>
    $fetch(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      body: {
        completed: !todo.completed  // 基于传入的todo参数计算
      }
    }),

  onMutate(todo) {
    // ...
    if (todoIndex >= 0) {
      newTodos = oldTodos.toSpliced(todoIndex, 1, {
        ...todo,
        completed: todo.completed ? 0 : 1  // 乐观更新：翻转状态
      })
      queryCache.setQueryData(todosQuery.key, newTodos)
    }
    // ...
  }
})
```

**后端逻辑** `server/api/todos/[id].patch.ts:9-24`：
```typescript
const BodySchema = z.object({
  completed: z.boolean()  // 直接接收布尔值
})

// 绝对赋值，不是翻转
const updatedTodos = await db.update(schema.todos).set({
  completed: completed ? 1 : 0  // 直接覆盖
})
```

### 核心原理
- `onMutate` **同步执行**，乐观更新立即修改 cache
- Cache 更新触发 Vue 响应式渲染，`todos` 数组中的 todo 对象状态改变
- 后续点击事件触发时，`toggleTodo(todo)` 接收的是**更新后的 todo**

### 场景推演

**初始条件**：Todo 当前 `completed = 0`（未完成）

| 时间点 | 事件 | 传入 todo.completed | 乐观更新后 cache | HTTP 请求 Body |
|--------|------|---------------------|------------------|----------------|
| T0 | 初始状态 | 0 | 0 | - |
| T1 | 第1次点击 | 0 | 1 | `{ completed: true }` |
| T2 | 第2次点击 | 1 | 0 | `{ completed: false }` |
| T3 | 第3次点击 | 0 | 1 | `{ completed: true }` |

### 答案
- **请求1** Body: `{ completed: true }`
- **请求2** Body: `{ completed: false }`
- **请求3** Body: `{ completed: true }`

---

## 问题2：乱序执行后数据库最终状态

### 场景设定
- 服务器按照 **请求1 → 请求3 → 请求2** 的顺序接收并处理
- 后端采用**绝对赋值**（直接覆盖），不是翻转

### 数据库状态变化推演

| 处理顺序 | 请求 | Body | 操作 | 数据库状态 |
|----------|------|------|------|------------|
| 初始 | - | - | - | **0** |
| 第1步 | 请求1 | `{ completed: true }` | `SET completed = 1` | **1** |
| 第2步 | 请求3 | `{ completed: true }` | `SET completed = 1` | **1**（不变） |
| 第3步 | 请求2 | `{ completed: false }` | `SET completed = 0` | **0** |

### 答案
数据库最终落盘的 completed 状态是 **0**。

### 为什么会这样？
后端接口使用的是 **绝对状态覆盖** 而非 **相对翻转**：
```typescript
.set({ completed: completed ? 1 : 0 })  // 直接设置，不是 +=1 或 !value
```

这意味着每个请求都是独立的，不依赖当前数据库状态。请求2最后执行，它的 `false` 值覆盖了前面的结果。

---

## 问题3：UI闪烁和状态跳变现象

### 关键机制：onSettled + invalidateQueries

**代码位置** `app/pages/optimistic-todos.vue:121-124`：
```typescript
onSettled() {
  queryCache.invalidateQueries({ key: todosQuery.key, exact: true })
}
```

`invalidateQueries` 的作用：
1. 标记查询为"失效"
2. 立即从服务器重新拉取数据（refetch）
3. **每个请求完成都会触发一次**

### 完整时间线推演

#### 阶段1：乐观更新（本地快速跳变）

| 时间 | 事件 | UI 显示（Switch） | Cache 状态 |
|------|------|-------------------|------------|
| T0 | 初始 | ⬜ 关 | 0 |
| T1 | 点击1 → onMutate | ✅ 开 | 1 |
| T2 | 点击2 → onMutate | ⬜ 关 | 0 |
| T3 | 点击3 → onMutate | ✅ 开 | 1 |

**用户此时看到**：Switch 在 50ms 内快速闪烁 3 次，最终停在 ✅ 开

#### 阶段2：网络请求响应乱序

假设网络延迟导致响应返回顺序：**请求2 → 请求1 → 请求3**

| 时间 | 事件 | 触发 invalidate | refetch 时服务器状态 | UI 变化 |
|------|------|-----------------|----------------------|---------|
| T100 | 请求2返回 | ✅ | 请求2已处理，状态=0 | ✅ 开 → ⬜ 关 |
| T150 | 请求1返回 | ✅ | 请求1已处理，状态=1 | ⬜ 关 → ✅ 开 |
| T200 | 请求3返回 | ✅ | 所有请求处理完，状态=0 | ✅ 开 → ⬜ 关 |

### 用户观察到的诡异现象

#### 现象1：乐观更新阶段的快速跳变
- Switch 在极短时间内 **"关→开→关→开"** 连续跳变 3 次
- 用户感觉像是"疯狂点击的反馈"，但没有意识到这会发送 3 个并发请求

#### 现象2：网络响应阶段的多次闪烁
- 请求2先返回 → invalidate → refetch 拿到 0 → UI 从 ✅ 变 ⬜
- 请求1后返回 → invalidate → refetch 拿到 1 → UI 从 ⬜ 变 ✅
- 请求3最后返回 → invalidate → refetch 拿到 0 → UI 从 ✅ 变 ⬜

**用户看到**：Switch 像"抽风"一样来回跳动

#### 现象3：最终状态与用户预期不符
- 用户**最后一次点击是想开**（第3次点击后乐观更新显示 ✅）
- 但由于乱序，服务器最终状态是 **0（关）**
- 最终 UI 稳定在 ⬜ 关
- 用户困惑：**"我最后明明点开了，怎么又关了？"**

### 为什么会如此诡异？

| 根本原因 | 说明 |
|----------|------|
| **客户端翻转 + 服务端绝对赋值** | 3次请求的意图是"翻转3次"，但服务端按"绝对状态"处理 |
| **乱序执行** | 最后一个"意图"（请求3）不是最后一个被处理的 |
| **每次 onSettled 都 invalidate** | 3次请求 → 3次 refetch → 3次 UI 更新 |
| **乐观更新与服务端状态脱节** | 用户看到的是本地翻转结果，服务端却是绝对覆盖逻辑 |

---

## 问题根源总结

```
前端逻辑：翻转 (completed = !completed)
后端逻辑：覆盖 (SET completed = value)
```

这两种语义在**单请求**场景下等价，但在**并发乱序**场景下产生语义错位：

| 场景 | 前端意图（翻转） | 后端实际（覆盖） |
|------|------------------|------------------|
| 单请求 | ✅ 一致 | ✅ 一致 |
| 并发有序 | ✅ 3次翻转=不变 | ✅ true→false→true=true |
| **并发乱序** | ❌ 意图丢失 | ❌ 取决于最后一个请求 |

### 正确的并发安全设计

方案1：**后端改为递增/递减的相对操作**
```typescript
// 但 completed 是布尔值，不适合
```

方案2：**使用版本号/乐观锁**
```typescript
// 请求携带版本号
PATCH /api/todos/:id { completed: true, version: 5 }
// 后端仅当 version 匹配时更新
```

方案3：**客户端禁用快速连续点击**
```vue
<USwitch :disabled="isLoading" @update:model-value="toggleTodo" />
```

方案4：**请求合并/防抖**
```typescript
// 使用 debounce 或取消前一个请求
const toggleTodo = useMutation({
  // ...
  onMutate() {
    // 取消正在进行的同类型请求
  }
})
```
