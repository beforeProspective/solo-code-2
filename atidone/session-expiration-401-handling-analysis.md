# Session 过期与 401 错误处理架构分析

## 问题背景

基于 `app/middleware/auth.ts`（路由守卫）、`app/pages/optimistic-todos.vue`（请求发起与错误处理）、`app/queries/todos.ts`（Pinia Colada 查询配置）以及服务端认证逻辑，深入分析前端认证状态与服务端 Session 状态不一致时的行为表现，并设计企业级的全局 401 处理方案。

---

## 问题 1：路由中间件对过期 Session 的拦截能力分析

### 场景描述

用户将电脑休眠一天，导致服务端的 Session Cookie 已经物理过期（如 HttpOnly Cookie 过期时间到点、服务端会话表清除、Redis 键过期等），但浏览器中 Vue 的内存状态 `loggedIn.value` 仍为 `true`。此时用户点击 `NuxtLink` 切换到 `/todos` 页面。

### 代码分析

#### 路由中间件实现

**文件位置**：`app/middleware/auth.ts:1-7`

```typescript
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo('/')
  }
})
```

#### 关键特征

| 检查维度 | 实现方式 | 结论 |
|---------|---------|------|
| 认证状态来源 | `loggedIn.value`（客户端内存状态） | 纯本地状态 |
| 服务端通信 | 无 | 不发起任何网络请求 |
| Cookie 验证 | 无 | 不验证 Cookie 是否有效 |
| 判断逻辑 | 仅判断 `!loggedIn.value` | 单条件布尔判断 |

#### `useUserSession` 的本质

来自 `nuxt-auth-utils` 模块：
- `loggedIn` 是一个响应式 `ref`（通常基于 Pinia 或 Vue 响应式系统）
- 该值在登录成功时设为 `true`，登出/清除时设为 `false`
- **关键**：它是**内存状态**，不与服务端实时同步
- 页面不刷新、状态不清除时，该值会一直保持为 `true`

### 拦截能力分析

#### 拦截流程推演

```
┌─────────────────────────────────────────────────────────────┐
│                    用户点击 NuxtLink                         │
│                    跳转到 /todos 页面                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Nuxt 路由系统触发中间件                         │
│              执行 auth.ts 路由守卫                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              读取 loggedIn.value                            │
│              值为 true（内存状态未变）                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         条件判断：!loggedIn.value === false                 │
│              不触发 navigateTo('/')                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              ✅ 路由守卫放行                                 │
│              页面 /todos 成功加载                            │
└─────────────────────────────────────────────────────────────┘
```

### 问题 1 答案

**不能拦截。**

#### 根本原因

路由中间件 `auth.ts` 是一个**纯本地状态检查器**，存在以下本质缺陷：

1. **本地-远程状态不同步**：`loggedIn.value` 是客户端内存状态，服务端 Session 状态变化（过期）时，客户端状态不会自动更新
2. **无主动验证机制**：中间件执行过程中不发起任何网络请求到服务端验证 Session 是否有效
3. **Cookie 无效性无法感知**：即使 Cookie 已过期，只要浏览器没清空，且 Vue 内存状态未变，`loggedIn.value` 就仍为 `true`

#### 架构层面的认知

这是一个典型的**"信任前端"**设计缺陷：
- 路由守卫相信客户端说的"我已登录"（`loggedIn.value === true`）
- 但真正的认证权威在服务端（`requireUserSession(event)`）
- 两者之间没有建立**状态一致性验证机制**

---

## 问题 2：401 错误处理架构缺陷及页面状态分析

### 场景描述

页面成功加载后（路由守卫已放行），Pinia Colada 发起后台请求（GET `/api/todos`，以及 add/toggle/delete 等 mutation）。这些请求到达服务端后，`requireUserSession(event)` 必然会因为 Cookie 过期而失败，抛出 `401 Unauthorized` 错误。

### 代码分析

#### 服务端认证失败逻辑

**文件位置**：`server/api/todos/index.get.ts:4-5`

```typescript
export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)  // ← Cookie 过期时抛出 401
  // ...
})
```

`requireUserSession` 来自 `nuxt-auth-utils`，当 Session 无效时会：
- 返回 HTTP 401 Unauthorized
- 响应内容通常包含错误信息

#### 前端查询配置

**文件位置**：`app/queries/todos.ts:3-10`

```typescript
export const todosQuery = defineQueryOptions({
  key: ['todos'],
  query: () => useRequestFetch()('/api/todos') as Promise<Todo[]>
})
```

#### 页面级错误处理

**文件位置**：`app/pages/optimistic-todos.vue:13-171`

页面中的请求分为两类：

**1. Query（自动获取数据）**：
```typescript
const { data: todos } = useQuery(todosQuery)  // ← 无 onError 配置
```

**2. Mutations（手动操作）**：
- `addTodo` mutation (lines 15-93)
- `toggleTodo` mutation (lines 95-138)
- `deleteTodo` mutation (lines 140-171)

#### onError 钩子实现分析（以 addTodo 为例）

**文件位置**：`app/pages/optimistic-todos.vue:70-92`

```typescript
onError(err, _title, { oldTodos, newTodos }) {
  // 1. 乐观更新回滚
  if (
    newTodos != null
    && newTodos === queryCache.getQueryData(todosQuery.key)
  ) {
    queryCache.setQueryData(todosQuery.key, oldTodos)
  }

  // 2. 错误分类处理
  if (isNuxtZodError(err)) {
    // 仅处理 Zod 验证错误（表单验证）
    const title = (err as any).data.data.issues
      .map((issue: { message: string }) => issue.message)
      .join('\n')
    toast.add({ title, color: 'error' })
  }
  else {
    // 其他错误（包括 401）：仅日志 + 通用弹窗
    console.error(err)
    toast.add({ title: 'Unexpected Error', color: 'error' })
  }
}
```

### 架构缺陷分析

#### 缺陷 1：Query 无错误处理

```typescript
const { data: todos } = useQuery(todosQuery)
```

- `useQuery` 没有配置 `onError` 钩子
- 当 GET `/api/todos` 返回 401 时：
  - Pinia Colada 内部会捕获错误
  - 但**没有任何业务层面的处理**
  - `todos` 会保持 `undefined` 或上一次缓存值

#### 缺陷 2：Mutation 错误处理不完整

| 错误类型 | 处理方式 | 是否充分 |
|---------|---------|---------|
| Zod 验证错误（422） | ✅ 解析字段错误并友好提示 | ✅ 充分 |
| 401 Unauthorized | ❌ console.error + "Unexpected Error" | ❌ 不充分 |
| 403 Forbidden | ❌ 同上 | ❌ 不充分 |
| 500 Server Error | ❌ 同上 | ❌ 不充分 |
| 网络错误 | ❌ 同上 | ❌ 不充分 |

#### 缺陷 3："只防君子不防过期"

- **防君子**：表单提交时做 Zod 验证，防止格式错误
- **不防过期**：认证过期（401）这种"非预期但必然发生"的场景，没有任何针对性处理
- 当用户看到 "Unexpected Error" 时：
  - 不知道发生了什么
  - 不知道需要重新登录
  - 可能反复操作但持续失败

### 页面呈现状态分析

#### 完整流程推演

```
┌─────────────────────────────────────────────────────────────────┐
│  1. 用户休眠唤醒，loggedIn.value 仍为 true                       │
│     点击 NuxtLink → /optimistic-todos                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. 路由中间件 auth.ts 检查                                      │
│     loggedIn.value === true → ✅ 放行                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. 页面组件挂载                                                  │
│     - 执行 const { data: todos } = useQuery(todosQuery)         │
│     - Pinia Colada 发起 GET /api/todos                          │
│     - 同时 UI 开始渲染                                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. 服务端处理请求                                                │
│     requireUserSession(event) 检测到 Cookie 过期                 │
│     → 返回 401 Unauthorized                                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. 前端接收 401 响应                                            │
│     - useQuery 没有 onError，错误被 Pinia Colada 内部处理        │
│     - todos 保持 undefined 或旧缓存                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. 页面状态：静默失败                                           │
│     ✅ 页面框架正常渲染（Header、Footer、布局）                   │
│     ⚠️ todos 列表为空或显示旧数据                                │
│     ❌ 没有明确提示"登录已过期，请重新登录"                        │
│     ❌ 没有自动跳转到登录页                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. 用户尝试操作（如添加 Todo）                                   │
│     - 点击提交 → 触发 addTodo mutation                           │
│     - POST /api/todos → 401 Unauthorized                        │
│     - onError 执行：                                             │
│       • console.error(err)                                      │
│       • toast.add({ title: 'Unexpected Error', color: 'error' })│
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  8. 用户看到的现象                                               │
│     ❌ 弹窗提示 "Unexpected Error"（莫名其妙的错误）             │
│     ❌ 新添加的 Todo 在 UI 上"闪一下"后消失（乐观回滚）          │
│     ❌ 不知道自己需要重新登录                                    │
│     ❌ 页面停留在 /optimistic-todos，无法正常使用                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 具体的页面状态表现

| 维度 | 表现 | 用户体验 |
|-----|------|---------|
| **路由位置** | 仍在 `/optimistic-todos` | ❌ 误导用户认为"我在正确的页面" |
| **Header 状态** | 仍显示用户头像、Logout 按钮 | ❌ 视觉上"我仍登录着" |
| **Todos 列表** | 空列表或旧缓存数据 | ⚠️ 数据异常但无解释 |
| **交互反馈** | 点击操作后出现 "Unexpected Error" 弹窗 | ❌ 错误信息无意义 |
| **操作结果** | 乐观更新后立即回滚（数据闪烁） | ❌ 困惑用户 |
| **用户感知** | "这个应用坏了" vs "我需要重新登录" | ❌ 完全错误的归因 |

---

## 企业级解决方案：全局 401 强制登出与重定向

### 核心设计原则

企业级应用需要在**请求层**和**应用层**建立完整的 401 处理机制：

1. **统一拦截**：所有请求（Query + Mutation + 直接 $fetch）的 401 都能被捕获
2. **原子操作**：检测到 401 → 清除本地认证状态 → 清理敏感数据缓存 → 跳转登录页
3. **防止死循环**：登录页相关请求不触发 401 处理逻辑
4. **用户友好**：可选地提示"登录已过期，请重新登录"

### 方案 A：ofetch 拦截器（推荐）

#### 方案说明

通过 Nuxt Plugin 全局配置 `$fetch` 的拦截器，在**请求响应层**统一处理 401。这是最底层、最全面的方案。

#### 实现代码

```typescript
// plugins/401-handler.ts
export default defineNuxtPlugin((nuxtApp) => {
  const { clear, loggedIn } = useUserSession()
  const queryCache = useQueryCache()
  const toast = useToast()
  const router = useRouter()

  // 防止重复处理的标志
  let isHandling401 = false

  // 全局 $fetch 拦截器配置
  nuxtApp.hook('app:mounted', () => {
    // 注意：在 Nuxt 3 中，我们通过 useRequestFetch 或直接配置全局拦截器
    // 以下是通过监听 $fetch 错误的实现方式
  })

  // 方案 1：使用 Pinia Colada 的全局错误钩子（更精准）
  const pinia = usePinia()
  
  // 监听所有请求的错误
  // 实际实现中，我们可以用以下方式：

  return {
    provide: {
      // 或者创建一个包装过的 fetch 方法
      authFetch: $fetch.create({
        onResponseError({ response }) {
          if (response.status === 401) {
            handle401()
          }
        }
      })
    }
  }

  function handle401() {
    // 防止重复触发
    if (isHandling401) return
    isHandling401 = true

    // 1. 清除认证状态
    clear()

    // 2. 清除所有 Pinia Colada 缓存（保护数据隐私）
    queryCache.cancelQueries()
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry))

    // 3. 提示用户（可选）
    toast.add({
      title: '登录已过期',
      description: '请重新登录以继续使用',
      color: 'warning'
    })

    // 4. 跳转到首页（登录页）
    if (router.currentRoute.value.path !== '/') {
      navigateTo('/')
    }

    // 5. 重置标志
    setTimeout(() => {
      isHandling401 = false
    }, 1000)
  }
})
```

#### 更好的实现方式：全局 $fetch 拦截

```typescript
// plugins/fetch-interceptor.ts
export default defineNuxtPlugin(() => {
  const { clear } = useUserSession()
  const queryCache = useQueryCache()
  const toast = useToast()

  let isHandling401 = false

  // 覆盖全局 $fetch 的行为
  // 注意：Nuxt 3 中 $fetch 是 ofetch 的实例，可以通过 hook 拦截
  // 或者在组件中统一使用包装后的 fetch

  globalThis.$fetch = $fetch.create({
    onResponseError({ response }) {
      if (response.status === 401) {
        handle401()
      }
    }
  })

  function handle401() {
    if (isHandling401) return
    isHandling401 = true

    // 1. 清除认证
    clear()

    // 2. 清除缓存
    queryCache.cancelQueries()
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry))

    // 3. 提示
    toast.add({
      title: '会话已过期',
      description: '请重新登录',
      color: 'error'
    })

    // 4. 跳转
    navigateTo('/')

    setTimeout(() => {
      isHandling401 = false
    }, 1000)
  }
})
```

### 方案 B：Nuxt Plugin + Pinia Colada 全局错误处理

#### 方案说明

利用 Pinia Colada 的插件机制或全局监听，在**应用层**统一处理所有 Query/Mutation 的错误。

#### 实现代码

```typescript
// plugins/auth-error-handler.ts
export default defineNuxtPlugin(() => {
  const { clear } = useUserSession()
  const queryCache = useQueryCache()
  const toast = useToast()

  let isHandling401 = false

  // 关键：监听 Pinia Colada 的所有错误
  // Pinia Colada 提供了全局错误处理能力
  
  // 方式 1：通过 Pinia 插件扩展
  const pinia = usePinia()
  
  // 注意：Pinia Colada 的错误状态存储在各自的 query store 中
  // 更实际的做法是统一包装 useQuery 和 useMutation
  
  // 推荐方式：创建 composables 统一封装
})
```

#### 推荐的实际实现：统一封装 useQuery/useMutation

```typescript
// composables/useAuthQuery.ts
export function useAuthQuery<T>(options: UseQueryOptions<T>) {
  const { clear } = useUserSession()
  const queryCache = useQueryCache()
  const toast = useToast()

  let isHandling401 = false

  return useQuery({
    ...options,
    onError(error: any) {
      // 检查是否是 401
      if (error?.status === 401 || error?.response?.status === 401) {
        handle401()
      }
      // 调用用户自定义的 onError
      options.onError?.(error)
    }
  })

  function handle401() {
    if (isHandling401) return
    isHandling401 = true

    clear()
    queryCache.cancelQueries()
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry))

    toast.add({
      title: '登录已过期',
      description: '请重新登录',
      color: 'error'
    })

    navigateTo('/')

    setTimeout(() => {
      isHandling401 = false
    }, 1000)
  }
}

// composables/useAuthMutation.ts
export function useAuthMutation<T>(options: UseMutationOptions<T>) {
  const { clear } = useUserSession()
  const queryCache = useQueryCache()
  const toast = useToast()

  let isHandling401 = false

  return useMutation({
    ...options,
    onError(error: any, variables, context) {
      if (error?.status === 401 || error?.response?.status === 401) {
        handle401()
      }
      options.onError?.(error, variables, context)
    }
  })

  function handle401() {
    // 同上...
  }
}
```

### 方案 C：最佳实践组合方案（企业级推荐）

#### 方案架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    全局 401 处理架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Layer 1: Plugin 初始化                                   │   │
│  │  - 注册全局拦截器                                         │   │
│  │  - 防止重复处理的状态管理                                  │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Layer 2: 请求拦截层 (ofetch interceptor)                │   │
│  │  - 捕获所有 $fetch 请求的 401 响应                        │   │
│  │  - 触发全局处理流程                                       │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Layer 3: 业务处理流程                                    │   │
│  │  1. 清除本地认证状态 (clear())                            │   │
│  │  2. 清除所有数据缓存 (queryCache)                         │   │
│  │  3. 用户友好提示 (toast)                                  │   │
│  │  4. 强制重定向到登录页 (navigateTo('/'))                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 完整实现代码

```typescript
// plugins/global-401-handler.ts
export default defineNuxtPlugin(() => {
  const { clear, loggedIn } = useUserSession()
  const queryCache = useQueryCache()
  const toast = useToast()
  const router = useRouter()

  // ==================== 防止重复处理 ====================
  let isHandling401 = false
  const LOCK_DURATION = 2000 // 2秒内不重复处理

  // ==================== 白名单路径 ====================
  // 这些路径的 401 不触发登出逻辑
  const PUBLIC_PATHS = [
    '/',
    '/api/auth/github',
    '/api/auth/github/callback'
  ]

  function shouldHandle401(path: string): boolean {
    return !PUBLIC_PATHS.some(p => path.includes(p))
  }

  // ==================== 核心处理函数 ====================
  async function handleSessionExpired() {
    // 1. 防重入检查
    if (isHandling401) return
    isHandling401 = true

    try {
      // 2. 如果当前已登出，无需处理
      if (!loggedIn.value) return

      // 3. 清除认证状态
      // 注意：clear() 可能是异步的，确保完成
      await clear()

      // 4. 清除所有数据缓存（保护隐私）
      queryCache.cancelQueries()
      const entries = queryCache.getEntries()
      entries.forEach((entry) => queryCache.remove(entry))

      // 5. 用户友好提示
      toast.add({
        title: '登录已过期',
        description: '为了您的账户安全，请重新登录',
        color: 'warning',
        icon: 'i-lucide-alert-circle'
      })

      // 6. 强制重定向到首页（登录页）
      const currentPath = router.currentRoute.value.path
      if (currentPath !== '/') {
        await navigateTo('/', { replace: true })
      }
    }
    catch (error) {
      console.error('处理 401 时发生错误:', error)
    }
    finally {
      // 7. 解锁
      setTimeout(() => {
        isHandling401 = false
      }, LOCK_DURATION)
    }
  }

  // ==================== 全局错误监听 ====================
  // 方式：通过监听 unhandledrejection 捕获未处理的 Promise 错误
  if (process.client) {
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason

      // 检查是否是 401 错误
      if (is401Error(error)) {
        event.preventDefault()
        handleSessionExpired()
      }
    })
  }

  // ==================== 辅助函数 ====================
  function is401Error(error: any): boolean {
    // ofetch 的错误格式
    if (error?.status === 401) return true
    if (error?.response?.status === 401) return true
    
    // Nuxt error 格式
    if (error?.statusCode === 401) return true
    
    return false
  }

  // ==================== 导出工具函数 ====================
  return {
    provide: {
      // 提供给业务代码使用的包装 fetch
      authFetch: $fetch.create({
        onResponseError({ response, request }) {
          if (response.status === 401 && shouldHandle401(String(request))) {
            handleSessionExpired()
          }
        }
      }),
      
      // 手动触发 401 处理（用于特殊场景）
      triggerSessionExpired: handleSessionExpired
    }
  }
})
```

### 方案对比

| 维度 | 方案 A (ofetch 拦截) | 方案 B (Composables 封装) | 方案 C (组合方案) |
|-----|---------------------|--------------------------|------------------|
| 覆盖范围 | 所有 $fetch 请求 | 仅使用包装函数的请求 | 全量覆盖 |
| 实现复杂度 | 中等 | 低 | 高 |
| 侵入性 | 低（全局配置） | 高（需替换所有调用） | 低 |
| 可维护性 | 好 | 好（统一入口） | 最好 |
| 推荐度 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 总结与建议

### 问题 1 总结

| 项目 | 结论 |
|-----|------|
| **能否拦截** | ❌ 不能 |
| **根本原因** | 路由中间件仅检查客户端内存状态 `loggedIn.value`，不与服务端验证 Session 有效性 |
| **架构本质** | "信任前端"的设计缺陷，本地状态与服务端状态可能不一致 |
| **改进方向** | 路由守卫 + 后台请求 401 全局处理 的双重保障 |

### 问题 2 总结

| 项目 | 结论 |
|-----|------|
| **页面状态** | 静默失败：UI 正常渲染但数据异常，仅显示通用错误提示 |
| **用户体验** | 极差：用户不知道需要重新登录，误认为应用故障 |
| **架构缺陷** | 错误处理分层不清，业务代码（`optimistic-todos.vue`）试图处理所有错误类型 |
| **设计原则** | 业务代码应关注业务错误，认证错误应由全局拦截器统一处理 |

### 企业级建议

1. **认证状态的权威在服务端**：前端的 `loggedIn` 只是"乐观猜测"，必须通过 401 处理来修正

2. **分层错误处理**：
   - **全局层**：处理 401、403、500 等通用错误
   - **业务层**：处理 Zod 验证、业务规则错误等

3. **401 处理的四步标准流程**：
   ```
   检测 401 → 清除认证状态 → 清除数据缓存 → 跳转到登录页
   ```

4. **必须防重入**：多个并发请求同时 401 时，只触发一次登出流程

5. **数据隐私保护**：登出时必须清除所有缓存，防止下一个用户看到前一个用户的数据

---

## 参考资料

- [ofetch 官方文档 - Interceptors](https://github.com/unjs/ofetch)
- [Pinia Colada 官方文档 - Error Handling](https://pinia-colada.esm.dev/)
- [nuxt-auth-utils GitHub](https://github.com/Atinux/nuxt-auth-utils)
- [Nuxt 3 官方文档 - Route Middleware](https://nuxt.com/docs/guide/directory-structure/middleware)
