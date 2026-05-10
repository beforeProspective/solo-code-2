# Drizzle Timestamp 序列化与 Vue SSR 水合分析

## 问题 1：JSON 序列化后的 `createdAt` 类型分析

### 数据流追踪

让我们从数据库到前端 Pinia 完整追踪 `createdAt` 字段的数据流转：

#### 1.1 数据库层（SQLite）

在 `server/db/schema.ts:8` 中定义：

```typescript
createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
```

**Drizzle ORM 的 `mode: 'timestamp'` 行为：**
- **数据库存储**：SQLite 中存储为 **整数**（Unix 时间戳，秒或毫秒）
- **JS 内存中**：Drizzle 自动转换为 **Date 对象**

#### 1.2 后端 API 层

在 `server/api/todos/index.get.ts:8-10` 中：

```typescript
const todos = await db.select().from(schema.todos).where(...)
return todos  // todos 中的 createdAt 是 Date 对象
```

#### 1.3 Nuxt 网络层序列化

当服务端返回数据时，Nuxt/Nitro 会经过以下序列化流程：

```
JS 对象 (Date)
    ↓
JSON.stringify() 序列化
    ↓
字符串传输 (Response Body)
    ↓
前端 JSON.parse() 反序列化
    ↓
JS 对象
```

**关键点：`JSON.stringify()` 对 Date 对象的处理**

```javascript
const date = new Date(1700000000000)
JSON.stringify(date)
// 输出: '"2023-11-14T22:13:20.000Z"'  ← ISO 8601 格式字符串
```

#### 1.4 前端接收

前端通过 `app/queries/todos.ts:9` 接收：

```typescript
query: () => useRequestFetch()('/api/todos') as Promise<Todo[]>
```

### 答案

**前端 Pinia 接收到的 `createdAt` 字段类型是：String**

具体来说，是 **ISO 8601 格式的字符串**，例如：`"2023-11-14T22:13:20.000Z"`

### 详细解释

| 阶段 | 数据类型 | 说明 |
|------|----------|------|
| 数据库存储 | `INTEGER` | SQLite 中存储为 Unix 时间戳 |
| 服务端 JS 内存 | `Date` | Drizzle ORM 自动转换 |
| JSON 序列化后 | `string` | `JSON.stringify(Date)` → ISO 8601 字符串 |
| 网络传输 | `string` | HTTP Response Body 中的字符串 |
| 前端解析后 | `string` | `JSON.parse()` 不会自动恢复 Date 对象 |
| Pinia store 中 | `string` | 存储的是字符串 |

**为什么不是 Date 对象？**

1. **JSON 标准不支持 Date 类型**：JSON 只有 6 种数据类型：string, number, boolean, null, object, array
2. **Date.prototype.toJSON()**：Date 对象的 `toJSON()` 方法返回 ISO 字符串，这是 `JSON.stringify()` 调用的
3. **双向不对称**：序列化有默认行为，但 `JSON.parse()` 没有对应的默认反序列化逻辑

**代码验证示例**：

```javascript
// 服务端
const serverDate = new Date(1700000000000)
const serialized = JSON.stringify({ createdAt: serverDate })
// serialized = '{"createdAt":"2023-11-14T22:13:20.000Z"}'

// 前端
const parsed = JSON.parse(serialized)
typeof parsed.createdAt  // "string" ✓
parsed.createdAt instanceof Date  // false ✗
```

---

## 问题 2：SSR 水合不匹配分析

### 场景假设

假设在 `todos.vue` 模板中添加如下代码：

```vue
<template>
  <li v-for="todo of todos" :key="todo.id">
    <!-- ... 其他内容 ... -->
    <span>{{ new Date(todo.createdAt).toLocaleString() }}</span>
  </li>
</template>
```

部署环境：
- **服务器机房时区**：UTC+0（格林威治时间）
- **用户浏览器时区**：UTC+8（北京时间）
- **createdAt 原始值**：假设为 `2023-11-14T10:00:00.000Z`

### 2.1 服务端渲染（SSR）阶段

**服务器（UTC+0）执行：**

```javascript
const isoString = "2023-11-14T10:00:00.000Z"
const date = new Date(isoString)
date.toLocaleString()  // "11/14/2023, 10:00:00 AM"  ← UTC+0 时间
```

**生成的 HTML 片段**：
```html
<span>11/14/2023, 10:00:00 AM</span>
```

### 2.2 客户端水合（Hydration）阶段

**浏览器（UTC+8）执行：**

```javascript
const isoString = "2023-11-14T10:00:00.000Z"
const date = new Date(isoString)
date.toLocaleString()  // "11/14/2023, 6:00:00 PM"  ← UTC+8 时间（+8小时）
```

**期望的 DOM**：
```html
<span>11/14/2023, 6:00:00 PM</span>
```

### 2.3 冲突发生

| 环境 | 计算结果 | 生成的 HTML |
|------|----------|-------------|
| 服务端（UTC+0） | `toLocaleString()` | `"11/14/2023, 10:00:00 AM"` |
| 客户端（UTC+8） | `toLocaleString()` | `"11/14/2023, 6:00:00 PM"` |

**两个结果不一致！**

### 答案

#### Vue 抛出的警告级别和内容

Vue 会抛出 **Error 级别** 的控制台警告（在开发环境中是错误，生产环境是警告），典型消息如下：

```
[Vue warn]: Hydration text content mismatch in <span>:
- Server rendered: "11/14/2023, 10:00:00 AM"
- Client rendered: "11/14/2023, 6:00:00 PM"
```

在 Vue 3 中，这会被报告为 **Hydration Mismatch** 错误。

#### 为什么破坏了同构渲染的核心铁律

**同构渲染（Isomorphic Rendering）的核心铁律：**

> **同一份代码在服务端和客户端执行时，对于相同的输入，必须产生完全相同的输出。**

这段代码破坏铁律的原因：

##### 原因 1：使用了环境相关的 API

`Date.prototype.toLocaleString()` 是一个**环境敏感**的方法：

- **服务端**：使用 Node.js 进程的时区（通常是服务器系统时区，如 UTC+0）
- **客户端**：使用浏览器的时区（用户本地时区，如 UTC+8）

这导致相同的输入产生不同的输出。

##### 原因 2：违反了"确定性输出"原则

```javascript
// ❌ 非确定性（依赖环境）
new Date(todo.createdAt).toLocaleString()

// ✅ 确定性（任何环境结果相同）
new Date(todo.createdAt).toISOString()
// 或使用固定时区参数
new Date(todo.createdAt).toLocaleString('zh-CN', { timeZone: 'UTC' })
```

##### 原因 3：水合机制的工作原理

Vue 的水合流程：

```
1. 服务端渲染 HTML → 发送给浏览器
2. 浏览器下载并执行 JS
3. Vue 创建虚拟 DOM（vnode）
4. Vue 将 vnode 与现有 DOM 进行匹配（水合）
5. 如果不匹配 → 抛出警告/错误
```

**为什么这是严重问题？**

水合不匹配会导致：

1. **界面闪烁**：服务端渲染的内容被客户端内容替换，用户看到闪烁
2. **性能损耗**：Vue 需要重新渲染不匹配的部分，失去 SSR 的性能优势
3. **潜在的交互问题**：DOM 结构不一致可能导致事件绑定失败
4. **开发体验差**：控制台大量警告干扰调试

### 解决方案

#### 方案 A：使用无歧义的时间格式（推荐）

```vue
<template>
  <!-- 方案 1：使用 ISO 字符串（无时区歧义） -->
  <span>{{ new Date(todo.createdAt).toISOString() }}</span>
  
  <!-- 方案 2：使用 dayjs 等库，固定时区 -->
  <span>{{ formatDate(todo.createdAt) }}</span>
</template>

<script setup>
// 在 composable 中统一处理
function formatDate(isoString: string) {
  // 方案 A：服务端格式化后传给前端
  // 方案 B：使用 dayjs.utc() 保证一致性
  // 方案 C：使用 <ClientOnly> 只在客户端渲染时间显示
}
</script>
```

#### 方案 B：仅在客户端渲染时间敏感内容

```vue
<template>
  <ClientOnly>
    <span>{{ new Date(todo.createdAt).toLocaleString() }}</span>
  </ClientOnly>
</template>
```

#### 方案 C：服务端计算，客户端直接展示

```typescript
// server/api/todos/index.get.ts
const todos = await db.select().from(schema.todos).where(...)

// 服务端预格式化（使用固定时区）
return todos.map(todo => ({
  ...todo,
  createdAtFormatted: new Date(todo.createdAt).toISOString()
  // 或使用固定时区的 toLocaleString
}))
```

---

## 完整数据流图

```
┌─────────────────────────────────────────────────────────────┐
│                      数据库层                                │
│  SQLite: created_at (INTEGER, Unix timestamp)               │
└────────────────────────┬────────────────────────────────────┘
                         │ Drizzle ORM 转换
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   服务端 JS 内存                             │
│  todo.createdAt: Date (内存中是 Date 对象)                   │
└────────────────────────┬────────────────────────────────────┘
                         │ Nuxt/Nitro JSON 序列化
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   网络传输层                                 │
│  JSON.stringify(Date) → "2023-11-14T10:00:00.000Z"          │
│  (ISO 8601 字符串)                                          │
└────────────────────────┬────────────────────────────────────┘
                         │ 前端 JSON.parse()
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   前端 JS 内存                               │
│  todo.createdAt: string ("2023-11-14T10:00:00.000Z")        │
│  Pinia store 中存储的是字符串！                              │
└────────────────────────┬────────────────────────────────────┘
                         │ 模板渲染
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   SSR 渲染（问题点）                         │
│  服务端: new Date(str).toLocaleString()                     │
│           → "11/14/2023, 10:00:00 AM" (UTC+0)               │
│                                                             │
│  客户端: new Date(str).toLocaleString()                     │
│           → "11/14/2023, 6:00:00 PM" (UTC+8)                │
│                                                             │
│  结果: 水合不匹配 ❌                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 总结

### 问题 1 答案

前端 Pinia 接收到的 `createdAt` 字段类型是 **String**（ISO 8601 格式），不是 Date 对象。原因是 JSON 序列化时 `Date` 会被转换为字符串，而反序列化时不会自动恢复。

### 问题 2 答案

Vue 会抛出 **Hydration Mismatch** 错误。这段代码破坏同构渲染铁律的原因是：`toLocaleString()` 依赖运行环境的时区设置，导致服务端和客户端对相同输入产生不同输出，违反了"同构代码必须产生确定性输出"的原则。

### 核心教训

1. **Date 类型的序列化**：前后端传递 Date 时，要清楚经过 JSON 后会变成字符串
2. **SSR 时间处理**：涉及时区、本地化的时间显示，要么使用无歧义格式，要么使用 `<ClientOnly>`，要么在服务端预计算
3. **同构代码原则**：任何在模板中使用的代码，必须保证服务端和客户端执行结果一致
