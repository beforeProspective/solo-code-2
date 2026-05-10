# Todo ID 篡改攻击分析

基于 `server/api/todos/[id].patch.ts`、`app/pages/todos.vue` 和 `app/pages/optimistic-todos.vue` 的分析

---

## 场景设定

- **攻击者**：用户 A（已认证）
- **受害者**：用户 B
- **攻击方式**：用户 A 拦截 HTTP 请求，将 URL 路径中的 `:id` 从自己的 Todo ID 篡改为用户 B 的有效 Todo ID
- **前提条件**：用户 A 的前端缓存中碰巧有用户 B 的该 Todo 条目（例如通过之前的信息泄露、共享缓存等）

---

## 一、Drizzle ORM 数据库层的确切执行结果与返回值

### 关键代码分析

**后端更新逻辑** `server/api/todos/[id].patch.ts:13-34`：

```typescript
export default eventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse)
  const { completed } = await readValidatedBody(event, BodySchema.parse)
  const { user } = await requireUserSession(event)

  // Update todo for the current user
  const updatedTodos = await db.update(schema.todos).set({
    completed: completed ? 1 : 0
  }).where(and(
    eq(schema.todos.id, id),           // 条件1: ID 匹配
    eq(schema.todos.userId, user.id)   // 条件2: 当前用户 ID 匹配
  )).returning()

  const todo = updatedTodos[0]
  if (!todo) {
    throw createError({
      statusCode: 404,
      message: 'Todo not found'
    })
  }
  return todo
})
```

**数据库模式** `server/db/schema.ts:3-9`：

```typescript
export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey(),
  userId: integer('user_id').notNull(), // GitHub Id
  title: text('title').notNull(),
  completed: integer('completed').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})
```

### Drizzle ORM 执行过程

#### 步骤 1：SQL 语句生成

Drizzle ORM 会生成类似以下的 SQL：

```sql
UPDATE todos
SET completed = ?
WHERE (id = ? AND user_id = ?)
RETURNING *;
```

绑定参数：
- `completed` = 请求体中的值（true → 1 或 false → 0）
- `id` = 被篡改后的 Todo ID（用户 B 的 ID）
- `user_id` = 当前认证用户 A 的 ID

#### 步骤 2：数据库匹配逻辑

数据库尝试查找同时满足两个条件的记录：
1. `todos.id = [被篡改的 ID]` ✅ Todo 存在，ID 是有效的
2. `todos.user_id = [用户 A 的 ID]` ❌ 这个 Todo 属于用户 B，不是用户 A

**两个条件使用 AND 连接，必须同时满足**。

#### 步骤 3：执行结果

由于 `AND` 条件的存在，**没有任何记录会被匹配到**。

**精确的执行结果：**
- **匹配行数**：`0` 行
- **更新操作**：未执行任何更新（因为没有匹配的记录）
- **`returning()` 返回值**：空数组 `[]`

**Drizzle ORM 的返回值细节：**
- `updatedTodos` = `[]`（空数组）
- `updatedTodos[0]` = `undefined`
- 数据库中用户 B 的 Todo 状态 **保持不变**

#### 为什么不会更新？

这是一个 **"双重验证"** 的安全设计：

```
WHERE (id = ? AND user_id = ?)
       └─ ID 存在          └─ 属于当前用户
```

即使攻击者知道目标 Todo 的 ID，由于该 Todo 的 `user_id` 与当前认证用户不匹配，`AND` 条件导致没有记录被选中，因此不会执行更新。

---

## 二、后端接口抛出的 HTTP 状态码及底层原因

### 代码执行流程

```typescript
const updatedTodos = await db.update(...)...returning()  // 返回 []
const todo = updatedTodos[0]  // todo = undefined

if (!todo) {  // true
  throw createError({
    statusCode: 404,
    message: 'Todo not found'
  })
}
```

### 确切的 HTTP 响应

| 字段 | 值 |
|------|-----|
| **HTTP 状态码** | `404 Not Found` |
| **响应消息** | `Todo not found` |

### 底层原因分析

#### 为什么返回 404 而不是 403 Forbidden？

从代码逻辑来看，后端无法区分以下两种情况：

| 情况 | id 条件 | user_id 条件 | 实际含义 |
|------|---------|-------------|----------|
| **情况 1** | Todo 不存在（无效 ID） | - | 资源不存在 |
| **情况 2** | Todo 存在 | 但属于其他用户 | 无权限访问 |

由于后端使用了 `AND` 条件查询，这两种情况都会导致 `updatedTodos` 为空数组，代码无法区分：

```typescript
// 这个判断同时处理了两种情况
if (!todo) {
  throw createError({
    statusCode: 404,
    message: 'Todo not found'  // 模糊处理，不暴露是否存在
  })
}
```

#### 这是有意的安全设计吗？

**是的，这是一种"信息隐藏"的安全策略**：

- **优点**：不向攻击者透露目标 Todo 是否存在。攻击者无法通过 403/404 的差异来"扫描"有效的 Todo ID。
- **代价**：合法用户（例如不小心删除了 Todo 后尝试更新）也会收到 404，而不是更精确的错误信息。

---

## 三、前端 queryCache 状态演变过程

需要分别分析两个前端页面的行为，因为它们采用了不同的策略：

---

### 3.1 `app/pages/todos.vue` — 无乐观更新版本

#### 关键代码

```typescript
const { mutate: toggleTodo } = useMutation({
  mutation: (todo: Todo) =>
    $fetch(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      body: {
        completed: !todo.completed
      }
    }),

  async onSuccess() {
    await queryCache.invalidateQueries(todosQuery)
  }
  // 注意：没有 onMutate、onError、onSettled
})
```

#### 完整时间线

**初始状态：**
- Cache 中有用户 A 的 Todo（ID=1，completed=0）和碰巧缓存的用户 B 的 Todo（ID=99，completed=0）
- UI 显示 ID=99 的 Todo 开关为 **⬜ 关**

| 时间点 | 事件 | Cache 中 ID=99 的状态 | UI 显示 | 说明 |
|--------|------|----------------------|---------|------|
| T0 | 初始状态 | completed=0 | ⬜ 关 | - |
| T1 | 用户点击 toggleTodo(todo_99) | completed=0 | ⬜ 关 | 调用 mutation |
| T2 | onMutate 执行 | completed=0 | ⬜ 关 | **无乐观更新**，cache 不变 |
| T3 | 发送请求（ID 被篡改为 99） | completed=0 | ⬜ 关 | 网络请求中 |
| T4 | 收到 404 响应 | completed=0 | ⬜ 关 | 请求失败 |
| T5 | onError 触发 | completed=0 | ⬜ 关 | **无自定义 onError** |
| T6 | onSettled 触发 | completed=0 | ⬜ 关 | **无自定义 onSettled** |

#### 状态演变结论

**`todos.vue` 的行为：**
- **无乐观更新**：`onMutate` 钩子不存在，Cache 在请求期间保持不变
- **无状态闪烁**：UI 不会先变成"开"再变"关"
- **无永久错乱**：Cache 始终保持原始状态（completed=0）
- **无错误提示**：没有定义 `onError`，用户看不到任何反馈

---

### 3.2 `app/pages/optimistic-todos.vue` — 有乐观更新版本

#### 关键代码

```typescript
const { mutate: toggleTodo } = useMutation({
  mutation: (todo: Todo) =>
    $fetch(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      body: {
        completed: !todo.completed
      }
    }),

  onMutate(todo) {
    const oldTodos = queryCache.getQueryData(todosQuery.key) || []
    const todoIndex = oldTodos.findIndex(t => t.id === todo.id)
    let newTodos = oldTodos
    if (todoIndex >= 0) {
      newTodos = oldTodos.toSpliced(todoIndex, 1, {
        ...todo,
        completed: todo.completed ? 0 : 1  // 乐观翻转
      })
      queryCache.setQueryData(todosQuery.key, newTodos)  // 更新 cache
    }
    queryCache.cancelQueries({ key: todosQuery.key, exact: true })
    return { oldTodos, newTodos }
  },

  onSettled() {
    queryCache.invalidateQueries({ key: todosQuery.key, exact: true })
  },

  onError(err, todo, { oldTodos, newTodos }) {
    if (
      newTodos != null
      && newTodos === queryCache.getQueryData(todosQuery.key)
    ) {
      queryCache.setQueryData(todosQuery.key, oldTodos)  // 回滚
    }
    console.error(err)
    toast.add({ title: 'Unexpected Error', color: 'error' })
  }
})
```

#### 完整时间线

**初始状态：**
- Cache 中有用户 A 的 Todo（ID=1，completed=0）和碰巧缓存的用户 B 的 Todo（ID=99，completed=0）
- UI 显示 ID=99 的 Todo 开关为 **⬜ 关**

| 时间点 | 事件 | Cache 中 ID=99 的状态 | UI 显示 | 说明 |
|--------|------|----------------------|---------|------|
| T0 | 初始状态 | completed=0 | ⬜ 关 | - |
| T1 | 用户点击 toggleTodo(todo_99) | completed=0 | ⬜ 关 | 调用 mutation |
| T2 | **onMutate 执行** | **completed=1** | **✅ 开** | 乐观更新：先翻转状态 |
| T3 | 保存 oldTodos 和 newTodos | completed=1 | ✅ 开 | 用于后续回滚 |
| T4 | 发送请求（ID 被篡改为 99） | completed=1 | ✅ 开 | 网络请求中 |
| T5 | 收到 404 响应 | completed=1 | ✅ 开 | 请求失败 |
| T6 | **onError 触发** | **completed=0** | **⬜ 关** | 回滚到 oldTodos |
| T7 | **onSettled 触发** | 触发 refetch | ⬜ 关 | 调用 invalidateQueries |
| T8 | refetch 完成（获取用户 A 的 todos） | 仍为 completed=0 | ⬜ 关 | refetch 不会包含用户 B 的 todo |

#### 状态演变细节

##### 阶段 1：乐观更新（onMutate）

```typescript
onMutate(todo) {
  const oldTodos = [..., {id:99, completed:0}, ...]  // 保存原始状态
  const newTodos = [..., {id:99, completed:1}, ...]  // 乐观翻转
  queryCache.setQueryData(todosQuery.key, newTodos)  // ✅ UI 立即变成"开"
  return { oldTodos, newTodos }
}
```

**结果**：UI 显示 ✅ 开（瞬时的）

##### 阶段 2：请求失败 + onError 回滚

```typescript
onError(err, todo, { oldTodos, newTodos }) {
  // 条件检查：newTodos === 当前 cache 状态？
  // 假设期间没有其他修改，条件成立
  if (newTodos === queryCache.getQueryData(todosQuery.key)) {
    queryCache.setQueryData(todosQuery.key, oldTodos)  // ⬜ 回滚到"关"
  }
  toast.add({ title: 'Unexpected Error', color: 'error' })
}
```

**结果**：UI 从 ✅ 开 → ⬜ 关

##### 阶段 3：onSettled 触发 refetch

```typescript
onSettled() {
  queryCache.invalidateQueries({ key: todosQuery.key, exact: true })
}
```

`invalidateQueries` 会：
1. 标记查询为"陈旧"
2. 触发 `/api/todos` 重新获取
3. 后端返回**用户 A 自己的 Todos**（不包含用户 B 的 ID=99）

**关键问题**：用户 B 的 Todo（ID=99）**不在 refetch 的结果中**，因为：

```typescript
// server/api/todos/index.get.ts
const todos = await db.select().from(schema.todos)
  .where(eq(schema.todos.userId, user.id))  // 只返回当前用户的
```

#### 状态演变结论

**`optimistic-todos.vue` 的行为：**

| 问题 | 答案 |
|------|------|
| **状态闪烁** | ✅ **会发生**。UI 顺序：⬜ → ✅ → ⬜（快速闪烁） |
| **永久错乱** | ❌ **不会**。onError 的回滚逻辑会恢复原始状态 |
| **最终状态** | 最终取决于 refetch 结果 |

**refetch 后的特殊情况**：

用户 B 的 Todo（ID=99）**会从 Cache 中消失**，因为：
1. 它只存在于初始的"碰巧缓存"中
2. refetch 只获取用户 A 自己的 Todos
3. 用户 A 看不到用户 B 的 Todo，这是**正确的行为**

---

## 四、完整攻击流程总结

```
┌─────────────────────────────────────────────────────────────────┐
│                        攻击场景完整流程                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 用户 A（攻击者）的前端                                   │
│     └─ 碰巧缓存了用户 B 的 Todo（ID=99）                        │
│                                                                 │
│  2. 用户 A 点击 ID=99 的 Todo 开关                              │
│     └─ optimistic-todos.vue: onMutate → Cache 翻转 ✅           │
│        todos.vue: 无乐观更新，Cache 不变 ⬜                     │
│                                                                 │
│  3. 拦截请求，篡改 URL: /api/todos/[99]                         │
│                                                                 │
│  4. 后端处理                                                    │
│     └─ UPDATE todos SET completed=?                            │
│        WHERE id=99 AND user_id=[用户A的ID]                      │
│        └─ 匹配 0 条记录（因为 user_id 不匹配）                   │
│        └─ returning() → []                                      │
│        └─ throw 404 "Todo not found"                            │
│                                                                 │
│  5. 用户 B 的数据库状态                                         │
│     └─ 🔒 保持不变，未被篡改                                    │
│                                                                 │
│  6. 前端响应处理                                                │
│     ├─ optimistic-todos.vue:                                    │
│     │   ├─ onError → 回滚 Cache ⬜                             │
│     │   ├─ onSettled → invalidate → refetch                    │
│     │   └─ refetch 结果: 只含用户 A 的 Todos                    │
│     │                                                           │
│     └─ todos.vue:                                               │
│         └─ 无任何 Cache 操作，保持原状                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 五、安全评估

### 后端安全性

| 评估项 | 结果 | 说明 |
|--------|------|------|
| **权限验证** | ✅ 安全 | 使用 `AND` 条件同时验证 ID 和 user_id |
| **信息泄露防护** | ✅ 较好 | 返回 404 而非 403，隐藏资源存在性 |
| **数据库状态** | ✅ 安全 | 用户 B 的 Todo 未被修改 |

### 前端缓存风险

| 评估项 | 结果 | 说明 |
|--------|------|------|
| **用户 A 能否看到用户 B 的数据** | ⚠️ 可能 | 取决于"碰巧缓存"是如何发生的 |
| **用户 A 能否修改用户 B 的数据** | ❌ 不能 | 后端权限验证阻止了 |
| **UI 状态闪烁** | ⚠️ 体验问题 | optimistic-todos.vue 会闪烁，todos.vue 不会 |

### 根本的安全问题

本次攻击场景中最需要关注的是：
**"前端缓存中碰巧有该条目"** 这个前提条件本身就是一个安全隐患。

正常情况下，用户 A 的前端不应该能获取到用户 B 的 Todo 数据。如果这种"碰巧缓存"可能发生，说明存在以下问题之一：
1. 之前的 API 漏洞（如越权访问）
2. 缓存配置不当（共享缓存）
3. 其他信息泄露渠道

---

## 六、攻击失败的核心原因

**一句话总结**：

> 后端采用了 `WHERE id = ? AND user_id = ?` 的双重验证，即使攻击者篡改了 ID，由于 `user_id` 不匹配，SQL 的 `AND` 条件导致零条记录被更新，最终返回 404。前端的乐观更新会因 onError 回滚，不会造成持久影响。
