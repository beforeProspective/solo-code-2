# 乐观更新双重状态生命周期分析

## 1. 双重状态生命周期概览

在 `app/pages/optimistic-todos.vue` 中，新建待办事项的完整生命周期包含三个关键阶段：

### 1.1 乐观更新阶段（onMutate）

**代码位置**：`app/pages/optimistic-todos.vue:28-49`

```typescript
onMutate(title) {
  const newTodoItem = {
    title,
    completed: 0,
    id: -Date.now(),  // ⚠️ 临时 ID：负的时间戳
    createdAt: new Date(),
    userId: user.value!.id
  }
  queryCache.setQueryData(todosQuery.key, [...oldTodos, newTodoItem])
  queryCache.cancelQueries({ key: todosQuery.key, exact: true })
  return { oldTodos, newTodos, newTodoItem }
}
```

**核心特征**：
- 使用 **`-Date.now()`** 生成临时负 ID
- 立即更新本地缓存，实现"瞬时显示"
- 取消正在进行的查询请求

### 1.2 成功替换阶段（onSuccess）

**代码位置**：`app/pages/optimistic-todos.vue:51-63`

```typescript
onSuccess(todo, _, { newTodoItem }) {
  const todoList = queryCache.getQueryData(todosQuery.key) || []
  const todoIndex = todoList.findIndex(t => t.id === newTodoItem.id)
  if (todoIndex >= 0) {
    queryCache.setQueryData(
      todosQuery.key,
      todoList.toSpliced(todoIndex, 1, todo)
    )
  }
}
```

**核心特征**：
- 用服务器返回的真实 Todo（包含真实正整数 ID）替换临时项
- 执行时机在 `onSettled` 之前

### 1.3 最终同步阶段（onSettled）

**代码位置**：`app/pages/optimistic-todos.vue:65-68`

```typescript
onSettled() {
  queryCache.invalidateQueries({ key: todosQuery.key })
}
```

**核心特征**：
- 强制废弃当前缓存
- 触发服务器数据全量刷新
- 实现最终一致性

---

## 2. 为什么需要 onSuccess 阶段的局部替换？

### 2.1 交互按钮的禁用规则

**代码位置**：`app/pages/optimistic-todos.vue:213, 222`

```vue
<USwitch :disabled="todo.id < 0" ... />
<UButton :disabled="todo.id < 0" ... />
```

**关键逻辑**：
- 当 `todo.id < 0` 时（即负 ID 的临时项），按钮处于禁用状态
- 只有当 ID 变为正整数（真实 ID）时，按钮才可用

### 2.2 onSuccess 的作用

如果没有 `onSuccess` 阶段的局部替换：

| 时间点 | 有 onSuccess | 无 onSuccess |
|--------|-------------|-------------|
| 用户提交 | 显示临时项（按钮禁用） | 显示临时项（按钮禁用） |
| 服务器返回 | 立即替换为真实 ID（按钮可用 ✅） | 仍为临时 ID（按钮禁用 ❌） |
| 全量刷新完成 | 数据最终一致 | 才替换为真实 ID（按钮可用） |

**onSuccess 的核心价值**：让每个待办事项在"自己的请求成功后"立即变得可交互，而无需等待所有请求和全量刷新完成。

---

## 3. 移除 onSuccess 后连续新建 5 个待办事项的冻结问题

### 3.1 问题场景

假设用户在 **100ms** 内连续点击"添加"按钮 5 次，网络请求耗时约 **300ms**。

### 3.2 时间线分析

#### 有 onSuccess 时的正常流程

```
时间轴 (ms)
│
├─ 0ms    提交 Todo 1
│        ├─ onMutate: 缓存=[..., Todo1(-1715300000001)]
│        ├─ 发起 POST 请求 #1
│        └─ cancelQueries: 取消正在进行的查询
│
├─ 20ms   提交 Todo 2
│        ├─ onMutate: 缓存=[..., Todo1, Todo2(-1715300000021)]
│        ├─ 发起 POST 请求 #2
│        └─ cancelQueries: 取消查询（如果有）
│
├─ 40ms   提交 Todo 3, 4, 5（类似）
│
├─ 300ms  请求 #1 返回
│        ├─ onSuccess: Todo1 的负 ID → 真实 ID=1 ✅
│        │           缓存=[...(id=1), Todo2, Todo3, Todo4, Todo5]
│        │           Todo1 的按钮变为可用！
│        └─ onSettled: invalidateQueries → 触发全量刷新
│
├─ 320ms  请求 #2 返回
│        ├─ onSuccess: Todo2 的负 ID → 真实 ID=2 ✅
│        │           Todo2 的按钮变为可用！
│        └─ onSettled: invalidateQueries → 触发全量刷新
│                      (但会被后续请求取消)
│
├─ 340ms  请求 #3, 4, 5 依次返回
│        └─ 各自的 onSuccess 使对应 Todo 按钮可用
│
├─ 500ms  最后一次全量刷新完成
         └─ 最终数据一致性
```

**体验**：每个 Todo 在约 300ms 后即可交互，用户几乎无感知延迟。

#### 无 onSuccess 时的冻结流程

```
时间轴 (ms)
│
├─ 0ms    提交 Todo 1
│        ├─ onMutate: 缓存=[..., Todo1(-1715300000001)] ⚠️ 按钮禁用
│        ├─ 发起 POST 请求 #1
│        └─ cancelQueries: 取消正在进行的查询
│
├─ 20ms   提交 Todo 2
│        ├─ onMutate: 缓存=[..., Todo1, Todo2(-1715300000021)] ⚠️ 都禁用
│        ├─ 发起 POST 请求 #2
│        └─ cancelQueries: 取消查询（包括 Todo1 触发的刷新！）
│
├─ 40ms   提交 Todo 3, 4, 5（类似）
│        └─ cache 中有 5 个负 ID 的 Todo，全部按钮禁用
│
├─ 300ms  请求 #1 返回
│        ├─ onSuccess: 无（已移除）❌
│        │           Todo1 仍为负 ID，按钮仍禁用
│        └─ onSettled: invalidateQueries → 触发全量刷新 A
│
├─ 305ms  刷新 A 刚发起，被 Todo2 的 cancelQueries 取消！
│        └─ Todo1 仍然是负 ID ❌
│
├─ 320ms  请求 #2 返回
│        ├─ onSuccess: 无 ❌
│        │           Todo2 仍为负 ID
│        └─ onSettled: invalidateQueries → 触发全量刷新 B
│
├─ 325ms  刷新 B 刚发起，被 Todo3 的 cancelQueries 取消！
│        └─ Todo1, Todo2 仍为负 ID ❌
│
├─ 340ms  请求 #3, 4 返回，各自触发刷新，但都被后续请求取消
│
├─ 360ms  请求 #5 返回（最后一个）
│        ├─ onSuccess: 无 ❌
│        │           所有 Todo 仍为负 ID
│        └─ onSettled: invalidateQueries → 触发全量刷新 E
│
├─ 360ms~ 刷新 E 进行中（没有后续请求取消它）
│        │   期间：所有 5 个 Todo 都是负 ID，全部按钮禁用 ❌
│        │   用户看到 5 个待办，但一个都不能切换状态或删除
│        │   这就是"不可用冻结期"！
│
├─ 500ms  刷新 E 完成
         └─ 所有 Todo 获得真实 ID，按钮才变为可用 ✅
```

### 3.3 核心问题原理

#### 问题一：`cancelQueries` 的连锁取消效应

**代码位置**：`app/pages/optimistic-todos.vue:46`

```typescript
queryCache.cancelQueries({ key: todosQuery.key, exact: true })
```

每次新建待办时都会调用 `cancelQueries`，这会：
1. 取消上一个待办在 `onSettled` 中触发的全量刷新
2. 导致上一个待办的负 ID 无法被全量刷新替换
3. 只有**最后一个**请求触发的全量刷新不会被取消

#### 问题二：临时 ID 的生命周期被拉长

没有 `onSuccess` 的局部替换时：
- 负 ID 的 Todo 必须等到**全量刷新**完成才能获得真实 ID
- 但全量刷新被连续的 `cancelQueries` 一再推迟
- 导致所有 Todo 的按钮一直保持禁用状态

#### 问题三：累积效应

当用户快速创建 N 个待办时：
- 前 N-1 个请求触发的全量刷新都会被第 N 个请求取消
- 只有第 N 个请求触发的全量刷新能真正完成
- 冻结期 = 最后一个请求的网络时间 + 全量刷新的网络时间
- 对于 5 个请求，冻结期约为 **500ms+**，用户能明显感知

### 3.4 数学化的冻结时长估算

假设：
- 用户点击间隔：20ms
- 单个 POST 请求耗时：300ms
- GET 全量刷新耗时：200ms

**冻结期公式**：
```
冻结期 = (最后一个请求的开始时间 - 第一个请求的开始时间) 
        + 最后一个请求的响应时间 
        + 全量刷新时间
       = (4 × 20ms) + 300ms + 200ms
       = 80ms + 300ms + 200ms
       = 580ms
```

**有 onSuccess 时**：每个 Todo 在约 300ms 后即可用，无累积延迟。
**无 onSuccess 时**：所有 Todo 需要等待 580ms 后才能同时可用。

---

## 4. 总结

### 4.1 onSuccess 局部替换的必要性

`onSuccess` 阶段的局部替换解决了以下问题：

| 问题 | 有 onSuccess | 无 onSuccess |
|------|-------------|-------------|
| 单请求场景 | 300ms 后可用 | 500ms 后可用 |
| 多请求场景 | 每个请求独立解锁 | 所有请求完成后才解锁 |
| 取消竞争 | 不受影响 | 刷新被取消导致 ID 无法更新 |
| 用户体验 | 渐进式解锁 | 长时间冻结期 |

### 4.2 设计洞察

这是一种 **"双重保障"** 的状态同步策略：

1. **乐观更新**（onMutate）：实现瞬时 UI 反馈
2. **增量替换**（onSuccess）：保证单个请求成功后的即时可用性
3. **全量刷新**（onSettled）：保证最终数据一致性

移除其中任何一环都会破坏用户体验的完整性。
