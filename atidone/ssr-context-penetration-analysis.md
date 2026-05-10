# Nuxt 3 SSR 上下文穿透机制深度分析

## 代码背景

在 `app/queries/todos.ts` 文件中，我们可以看到这样的关键代码：

```typescript
import { defineQueryOptions } from '@pinia/colada'

export const todosQuery = defineQueryOptions({
  key: ['todos'],
  // NOTE: the cast sometimes avoids an "Excessive depth check" TS error
  // using $fetch directly doesn't avoid the round trip to the server
  // when doing SSR
  // https://github.com/nuxt/nuxt/issues/24813
  query: () => useRequestFetch()('/api/todos') as Promise<Todo[]>
})
```

作者注释特别警告："如果直接使用 `$fetch` 将无法避免 SSR 时的网络往返（Round Trip）"，并引用了 GitHub issue #24813。这引出了两个核心技术问题。

---

## 问题 1：为什么原生 `$fetch` 在 SSR 阶段会退化成真实 HTTP 请求？

### 1.1 SSR 的请求上下文隔离模型

在 Nuxt 3 的服务端渲染（SSR）过程中，每个请求都有其独立的请求生命周期和上下文。整个流程如下：

```
浏览器请求
    ↓
Nitro/H3 服务器接收请求
    ↓
创建 H3Event 对象（包含请求信息、cookies、headers 等）
    ↓
创建 SSR Context（包含 event、url、runtimeConfig 等）
    ↓
渲染 Vue 组件树
    ↓
组件内发起 API 请求
    ↓
返回 HTML
```

### 1.2 `$fetch` 的本质：ofetch 的运行时能力

`$fetch` 是 Nuxt 对 [ofetch](https://github.com/unjs/ofetch) 的封装。在服务端环境下，Nitro 为 `$fetch` 提供了一项重要优化：**对于内部相对路径（如 `/api/todos`），理论上可以直接调用对应的路由处理函数，而不是发起真实的 HTTP 请求**。

然而，这种"直连优化"有一个关键前提：**必须在正确的请求上下文中执行**。

### 1.3 原生 `$fetch` 无法获取 SSR 上下文的原因

当在组件外部（如 `defineQueryOptions` 的 `query` 函数中）直接调用 `$fetch` 时，存在以下问题：

#### A. 异步上下文丢失

在现代 JavaScript 中，异步操作（如 Promise、定时器）可能会丢失"异步执行上下文"。虽然 Node.js 提供了 `AsyncLocalStorage`，但在某些场景下：

- Pinia Colada 使用 `onServerPrefetch` 内部处理 SSR
- 查询函数可能在组件 setup 之外的上下文中被调用
- 异步回调的执行链可能跨越了原始的请求作用域

#### B. 全局 `$fetch` 与事件绑定 `event.$fetch` 的区别

Nitro 中存在两种 `$fetch`：

1. **全局 `globalThis.$fetch`**：这是一个全局可用的 ofetch 实例。虽然它对内部路由有直连能力，但它**不绑定任何特定的 H3Event**。

2. **`event.$fetch`**：每个 H3Event 对象上绑定的 `$fetch` 实例。这才是能够正确传递请求上下文（cookies、headers、session 等）的版本。

#### C. 为什么会"退化"成真实 HTTP 请求？

当使用全局 `$fetch` 且无法正确关联到当前请求事件时：

- 它可能尝试使用 `localhost` 发起回环请求（loopback request）
- 这个请求会重新进入 Nitro 的 HTTP 处理管道
- 导致服务器自己请求自己，产生不必要的网络开销

即使 Nitro 的 `unenv` 拦截尝试做直连，由于缺少当前请求的 H3Event 上下文：
- 用户的认证 cookie 无法传递
- 请求 headers 无法正确转发
- 会话信息丢失
- API 路由中的 `requireUserSession(event)` 会失败

### 1.4 结合本项目的具体场景

在本项目的 `server/api/todos/index.get.ts` 中：

```typescript
export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  // ...
})
```

这个 API 路由依赖 `requireUserSession(event)` 来获取当前用户。如果在 SSR 阶段使用原生 `$fetch` 调用这个 API：

1. `$fetch` 无法将当前 SSR 请求的 event 传递过去
2. 即使直连，`event` 也不是用户的原始请求事件
3. `requireUserSession` 会找不到 session
4. 或者回退到真实 HTTP 请求，产生性能损耗

---

## 问题 2：`useRequestFetch()` 如何通过 H3Event 实现短路优化？

### 2.1 `useRequestFetch()` 的工作原理

`useRequestFetch()` 是 Nuxt 3.2.0 引入的 composable，其核心目标是：**在 SSR 期间捕获当前请求的 H3Event，并将其上下文延续到后续的 fetch 调用中**。

### 2.2 从源码看实现机制

根据 Nuxt 源码（`packages/nuxt/src/app/composables/ssr.ts`），核心逻辑链路如下：

#### 步骤 1：获取当前 Nuxt 应用实例

```typescript
export function useRequestFetch (): $Fetch {
  return $fetch as $Fetch  // 简化示意，实际更复杂
}
```

**关键点**：`useRequestFetch()` 必须在组件的 setup 函数或正确的注入上下文中调用，这样它才能通过 `useNuxtApp()` 访问到 `ssrContext`。

#### 步骤 2：通过 `ssrContext` 获取 H3Event

```typescript
export function useRequestEvent (nuxtApp?: NuxtApp) {
  if (import.meta.client) { return }
  nuxtApp ||= useNuxtApp()
  return nuxtApp.ssrContext?.event
}
```

在 SSR 阶段，`nuxtApp.ssrContext.event` 就是当前请求的 H3Event 对象。这个对象是在 Nitro 创建 SSR 上下文时注入的：

```typescript
// packages/nitro-server/src/runtime/utils/renderer/app.ts
export function createSSRContext (event: H3Event): NuxtSSRContext {
  const ssrContext: NuxtSSRContext = {
    url: event.path,
    event,  // ← H3Event 被注入到这里
    runtimeConfig: useRuntimeConfig(event),
    // ...
  }
  return ssrContext
}
```

#### 步骤 3：事件上下文的延续

当 `useRequestFetch()` 在服务端执行时，它会：

1. 通过 `useNuxtApp().ssrContext?.event` 获取当前 H3Event
2. 优先使用 `event.$fetch`（事件绑定的 fetch 实例）
3. `event.$fetch` 是 Nitro 为每个请求事件创建的特殊 ofetch 实例

### 2.3 `event.$fetch` 的魔法：直连 API 路由

`event.$fetch` 与全局 `$fetch` 的关键区别在于它能够：

#### A. 直接调用路由处理函数（Short-circuit）

```
常规 HTTP 路径（慢）：
$fetch('/api/todos') 
    → 创建 HTTP 请求
    → 经过 TCP/IP 协议栈
    → Nitro 服务器接收
    → 路由匹配
    → 执行 eventHandler

直连路径（快）：
event.$fetch('/api/todos')
    → 内部路由查找
    → 直接获取 eventHandler 函数引用
    → 在同一事件上下文中执行
    → 返回结果
```

Nitro 通过 `unjs/unenv` 实现了这种"短路"机制。对于相对路径的内部请求，它绕过了整个网络层。

#### B. 自动转发请求头和 Cookie

```typescript
// 当前 SSR 请求的 headers
const originalHeaders = event.req.headers

// event.$fetch 会自动将这些 headers 转发
// （安全过滤后，排除 host、connection 等不应转发的头）
```

在客户端导航时，浏览器会自动带上 Cookie；但在 SSR 期间，服务端代码"模拟"浏览器请求时，必须手动转发这些头部。

#### C. 保持会话上下文

回到本项目的例子：

```typescript
// SSR 组件中
query: () => useRequestFetch()('/api/todos')

// server/api/todos/index.get.ts
export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)  // ← 这里的 event 能正确获取 session！
})
```

通过 `useRequestFetch()`：
- 初始请求的 H3Event（包含用户 session）被捕获
- 调用 `/api/todos` 时，这个事件上下文被延续
- `requireUserSession(event)` 能正确读取到用户的登录状态

### 2.4 完整的上下文穿透流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    浏览器发起请求                             │
│              GET /todos (Cookie: sessionId=xxx)              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Nitro/H3 服务器层                               │
│                                                             │
│  1. 创建 H3Event (包含 req, res, context)                    │
│     - event.req.headers.cookie = 'sessionId=xxx'            │
│     - event.context.session = { user: {...} }               │
│                                                             │
│  2. 调用 createSSRContext(event)                            │
│     - ssrContext.event = event                              │
│     - 注入到 NuxtApp 实例中                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 Vue 组件 SSR 渲染层                          │
│                                                             │
│  app/queries/todos.ts:                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ query: () => useRequestFetch()('/api/todos')        │   │
│  │     │                                                │   │
│  │     ▼                                                │   │
│  │  useRequestFetch()                                   │   │
│  │    ├─ 客户端: 直接返回全局 $fetch                      │   │
│  │    └─ 服务端:                                         │   │
│  │        ├─ useNuxtApp()                               │   │
│  │        ├─ 获取 ssrContext.event                      │   │
│  │        └─ 返回绑定了该 event 的 $fetch 实例           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  3. 执行 useRequestFetch()('/api/todos')                    │
│     ├─ 识别为内部相对路径                                    │
│     ├─ 查找 server/api/todos/index.get.ts                  │
│     ├─ 获取对应的 eventHandler 函数引用                      │
│     └─ 在**同一 event 上下文**中直接调用                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              API 路由处理层                                  │
│                                                             │
│  server/api/todos/index.get.ts:                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ eventHandler(async (event) => {                      │   │
│  │   // 这里的 event 是原始请求的 event！                 │   │
│  │   const { user } = await requireUserSession(event)  │   │
│  │   // ✓ session 正确获取                               │   │
│  │                                                      │   │
│  │   const todos = await db.select()...                 │   │
│  │   return todos                                       │   │
│  │ })                                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    返回 HTML 给浏览器                        │
│  整个过程中：                                                │
│  - 没有发起额外的 HTTP 请求                                  │
│  - 没有 TCP 连接开销                                        │
│  - 请求上下文完美延续                                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.5 安全性考虑

并非所有 headers 都会被转发。Nuxt 出于安全考虑（如防止 SSRF 攻击），会过滤以下 headers：

- `transfer-encoding`
- `connection`
- `keep-alive`
- `upgrade`
- `expect`
- `host`
- `accept`

这确保了在转发请求时不会引入安全风险。

---

## 总结

### 核心要点对比

| 特性 | 原生 `$fetch` | `useRequestFetch()` |
|------|--------------|---------------------|
| 上下文感知 | 否 | 是（通过 `useNuxtApp().ssrContext.event`） |
| SSR 内部 API 调用 | 可能回退到真实 HTTP | 直接函数调用（短路优化） |
| Cookie/Headers 转发 | 否 | 是（安全过滤后） |
| Session 延续 | 否 | 是 |
| 客户端行为 | 相同 | 相同（退化为普通 `$fetch`） |

### 为什么 Pinia Colada 场景必须使用 `useRequestFetch()`？

1. **查询定义位置**：`defineQueryOptions` 在模块顶层定义，不在组件 setup 中
2. **SSR 触发时机**：Pinia Colada 使用 `onServerPrefetch` 在 SSR 时自动执行查询
3. **上下文捕获**：查询函数执行时需要能够"回溯"到当前的请求上下文
4. **认证依赖**：本项目的 `/api/todos` 依赖用户会话，必须传递正确的 H3Event

### 关键技术栈总结

- **Nitro**：提供 `event.$fetch` 和内部路由直连能力
- **H3Event**：贯穿整个 SSR 生命周期的请求上下文载体
- **`useNuxtApp().ssrContext.event`**：连接 Vue 组件层和 Nitro 服务器层的桥梁
- **`useRequestFetch()`**：在正确时机捕获并延续上下文的 composable

这种设计体现了 Nuxt 3 的核心哲学：**让同构代码在服务端和客户端都能"正常工作"，同时最大化服务端渲染的性能优势**。

---

## 参考资料

- [Nuxt Issue #24813 - `$fetch`: use `useRequestFetch()` when calling internal API during SSR](https://github.com/nuxt/nuxt/issues/24813)
- [Nuxt 3 Docs - useRequestFetch](https://nuxt.com/docs/3.x/api/composables/use-request-fetch)
- [Nuxt 3 Docs - Data Fetching](https://dev.nuxt.com/docs/3.x/getting-started/data-fetching)
- [Nitro Docs - Fetch](https://nitro.build/guide/fetch)
- [Pinia Colada - Nuxt Integration](https://pinia-colada.esm.dev/nuxt.html)
