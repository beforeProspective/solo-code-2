# Todo 删除 API 幂等性与并发边界分析

## 问题 1：并发删除场景分析

### 代码位置
`server/api/todos/[id].delete.ts:14-27`

```typescript
const deletedTodos = await db.delete(schema.todos).where(
  and(
    eq(schema.todos.id, id),
    eq(schema.todos.userId, user.id)
  )
).returning()

const deletedTodo = deletedTodos[0]
if (!deletedTodo) {
  throw createError({
    statusCode: 404,
    message: 'Todo not found'
  })
}
```

### 分析结果

假设用户在两个不同的浏览器标签页中同时删除同一个待办事项：

#### 执行时序
```
时间线：
T1: 第一个 DELETE 请求到达
T2: 第一个请求执行 SQL DELETE，记录被删除
T3: 第一个请求返回 deletedTodo
T4: 第二个 DELETE 请求到达
T5: 第二个请求执行 SQL DELETE（记录已不存在）
T6: 第二个请求返回空数组，抛出 404
```

#### 关键问题解答

**Q: 当第二个请求到达该逻辑时，底层 SQL 语句执行的受影响行数（Affected Rows）是多少？**

A: **受影响行数为 0**

因为第一个请求已经成功删除了该记录，数据库中已不存在满足条件的行。SQL DELETE 语句在没有匹配行时执行但不报错，受影响行数为 0。

**Q: deletedTodos 变量会获得什么具体的值？**

A: **空数组 `[]`**

Drizzle ORM 的 `returning()` 方法会返回被删除的行。当没有行被删除（受影响行数为 0）时，`returning()` 返回空数组。因此 `deletedTodos = []`，`deletedTodos[0] = undefined`，触发 `!deletedTodo` 为 true，抛出 404 错误。

---

## 问题 2：幂等性设计与前后端调整方案

### 核心代码引用

**后端** `server/api/todos/[id].delete.ts:22-27`:
```typescript
if (!deletedTodo) {
  throw createError({
    statusCode: 404,
    message: 'Todo not found'
  })
}
```

**前端** `app/pages/optimistic-todos.vue:162-170`:
```typescript
onError(err, todo, { oldTodos, newTodos }) {
  if (newTodos != null && newTodos === queryCache.getQueryData(todosQuery.key)) {
    queryCache.setQueryData(todosQuery.key, oldTodos)
  }

  console.error(err)
  toast.add({ title: 'Unexpected Error', color: 'error' })
}
```

### 幂等性分析

**什么是幂等？**
在 RESTful 架构中，DELETE 操作被认为是**幂等**的。幂等的定义是：**多次执行相同的操作，系统状态保持一致**。第一次调用 DELETE 删除资源，第二次调用时资源已不存在，系统状态与第一次调用后相同，因此应该视为成功。

**当前实现是否违背幂等性？**
- **从 HTTP 规范角度**：404 不是严格违背幂等性。RFC 规范允许对已删除资源返回 404。
- **从用户体验角度**：是的，存在问题。用户在标签页 A 删除成功，切换到标签页 B（缓存的旧数据）再次点击删除，看到 "Unexpected Error" 是困惑的体验。
- **从前端逻辑角度**：`optimistic-todos.vue` 的 `onError` 会**回滚缓存**，把已删除的 todo 又显示回来，这是实际的状态不一致 bug。

### 前后端调整方案

#### 方案一：后端返回 200/204（推荐，符合幂等语义）

**后端调整**：
```typescript
const deletedTodos = await db.delete(schema.todos).where(
  and(
    eq(schema.todos.id, id),
    eq(schema.todos.userId, user.id)
  )
).returning()

const deletedTodo = deletedTodos[0]
if (!deletedTodo) {
  // 资源已不存在，但用户意图已达成（幂等）
  // 返回 200 或 204，不报错
  return null
}
return deletedTodo
```

**前端调整**（`todos.vue` 需添加 `onError` 处理）：
```typescript
const { mutate: deleteTodo } = useMutation({
  mutation: (todo: Todo) =>
    $fetch(`/api/todos/${todo.id}`, { method: 'DELETE' }),

  async onSuccess(_result, todo) {
    await queryCache.invalidateQueries(todosQuery)
    if (_result) {
      toast.add({ title: `Todo "${todo.title}" deleted.` })
    }
    // 返回 null 时静默处理，不弹错误也不弹成功提示
  },
  
  onError(err, todo) {
    // 只有非 404 的错误才需要提示用户
    // 如果后端返回 null，这里不会触发
    console.error(err)
    toast.add({ title: 'Failed to delete todo', color: 'error' })
  }
})
```

#### 方案二：后端保留 404，前端静默消化（最小改动）

**后端**：无需改动

**前端调整**（`optimistic-todos.vue`）：
```typescript
onError(err, todo, { oldTodos, newTodos }) {
  // 检查是否是 404（资源已被其他端删除）
  const status = (err as any)?.statusCode || (err as any)?.status
  
  if (status === 404) {
    // 404 视为成功：资源已不存在，用户意图已达成
    // 不回滚缓存，也不弹错误提示
    return
  }
  
  // 其他错误才回滚并提示
  if (newTodos != null && newTodos === queryCache.getQueryData(todosQuery.key)) {
    queryCache.setQueryData(todosQuery.key, oldTodos)
  }

  console.error(err)
  toast.add({ title: 'Failed to delete todo', color: 'error' })
}
```

**前端调整**（`todos.vue` - 需补充 `onError`）：
```typescript
const { mutate: deleteTodo } = useMutation({
  mutation: (todo: Todo) =>
    $fetch(`/api/todos/${todo.id}`, { method: 'DELETE' }),

  async onSuccess(_result, todo) {
    await queryCache.invalidateQueries(todosQuery)
    toast.add({ title: `Todo "${todo.title}" deleted.` })
  },
  
  onError(err, todo) {
    const status = (err as any)?.statusCode || (err as any)?.status
    if (status === 404) {
      // 静默刷新列表，让 UI 与服务端一致
      queryCache.invalidateQueries(todosQuery)
      return
    }
    console.error(err)
    toast.add({ title: 'Failed to delete todo', color: 'error' })
  }
})
```

### 对比总结

| 维度 | 方案一（后端返回 200/null） | 方案二（前端静默 404） |
|------|--------------------------|---------------------|
| 改动范围 | 前后端都要改 | 仅前端 |
| HTTP 语义 | 更符合幂等设计 | 404 也是合法的 |
| 代码清晰 | 语义明确 | 依赖约定 |
| 推荐度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**建议**：采用**方案二作为短期修复**（仅前端改动，风险低），**方案一作为长期重构**（更符合 REST 最佳实践）。

---

## 总结

1. **并发删除时**：第二个请求的 SQL 受影响行数为 0，`deletedTodos` 为空数组，触发 404。

2. **幂等性问题**：当前实现返回 404 不违背 HTTP 规范，但在多标签页并发场景下造成困惑的用户体验。`optimistic-todos.vue` 还存在回滚缓存的 bug。

3. **解决方案**：
   - **后端**：对已删除资源返回成功（200/204）而非错误
   - **前端**：在 `onError` 中区分 404（静默）和其他错误（提示），`optimistic-todos.vue` 中 404 时不应回滚缓存
