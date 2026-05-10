# 用户登出与 Pinia Colada 缓存生命周期分析

## 问题背景

基于 `app/app.vue`（用户登出逻辑）、`app/queries/todos.ts`（Pinia Colada 缓存配置）和 `nuxt-auth-utils` 的代码实现，分析前端数据缓存与用户认证生命周期的隔离问题。

---

## 问题 1：数据隐私漏洞分析

### 场景描述

在未刷新页面的 SPA 模式下，用户 A 登出后，用户 B 紧接着在同一设备登录并访问 `/todos` 页面，在用户 B 发起第一次真实 GET 请求并返回结果之前的几十毫秒"真空期"内，UI 会暴露出严重的数据隐私漏洞。

### 漏洞分析

#### 1. 代码实现分析

**`app/app.vue` 中的登出逻辑：
```typescript
const { loggedIn, user, clear } = useUserSession()

watch(loggedIn, () => {
  if (!loggedIn.value) {
    navigateTo('/')
  }
})

const items = [
  [
    {
      label: 'Logout',
      icon: 'i-lucide-log-out',
      onSelect: clear
    }
  ]
]
```

**`app/queries/todos.ts` 中的缓存配置：
```typescript
export const todosQuery = defineQueryOptions({
  key: ['todos'],
  query: () => useRequestFetch()('/api/todos') as Promise<Todo[]>
})
```

**`app/pages/todos.vue` 中的数据获取：
```typescript
const { data: todos } = useQuery(todosQuery)
```

#### 2. 漏洞产生的根本原因

Pinia Colada 的 `queryCache`（键为 `['todos']`）与 Nuxt Auth Session 的生命周期是**物理隔离**的：

- **Nuxt Auth Session**：通过 `useUserSession().clear()` 清除，生命周期结束
- **Pinia Colada 缓存**：存储在 Pinia store 中，独立于认证状态

#### 3. 具体漏洞流程

1. **用户 A 登录并访问 `/todos` 页面**
   - Pinia Colada 发起 GET 请求获取用户 A 的 todos
   - 数据被缓存到 `queryCache` 中，key 为 `['todos']`

2. **用户 A 点击 Logout**
   - 调用 `useUserSession().clear()` 清除认证状态
   - `loggedIn` 变为 false
   - 跳转到首页
   - **但 Pinia Colada 的缓存（用户 A 的 todos）**仍然存在**

3. **用户 B 紧接着登录并访问 `/todos` 页面**
   - 组件挂载，调用 `useQuery(todosQuery)`
   - Pinia Colada 首先检查缓存
   - 发现缓存中有 `['todos']` 的数据（用户 A 的 todos）
   - **立即返回缓存数据给 UI**
   - 同时在后台发起新的 GET 请求获取用户 B 的 todos

4. **真空期（几十毫秒）**
   - 在新的 GET 请求返回结果之前
   - UI 渲染的是**用户 A 的 todos 数据
   - **用户 B 可以看到用户 A 的私有数据**

#### 4. 漏洞严重性

这是一个**严重的数据隐私漏洞**，可能导致：

- **用户数据泄露**：用户 B 可以看到用户 A 的私有 todos
- **信任问题**：用户可能认为系统不安全
- **合规风险**：违反数据隐私法规（如 GDPR、CCPA 等）

---

## 问题 2：架构层面的解决方案

### 核心思路

从架构层面上将前端数据缓存的生命周期与用户认证生命周期强制绑定，确保用户登出时**同时清除**所有缓存数据。

### 解决方案

#### 1. 关键代码

根据 Pinia Colada 官方文档，正确的清除所有缓存的方式是：

```typescript
const queryCache = useQueryCache()
// 先取消待处理的请求
queryCache.cancelQueries()
// 然后移除所有缓存条目
queryCache.getEntries().forEach((entry) => queryCache.remove(entry))
```

#### 2. 实现位置

应该在 `app.vue` 的注销流程中补充这段代码，具体位置在 `clear` 函数调用时。

#### 3. 修改后的 `app.vue` 登出逻辑

修改 `app/app.vue` 中的登出逻辑，在用户登出时清除所有 Pinia Colada 缓存：

```typescript
<script setup lang="ts">
import type { DropdownMenuItem } from '#ui/types'

const { loggedIn, user, clear } = useUserSession()
const colorMode = useColorMode()
const queryCache = useQueryCache()

watch(loggedIn, () => {
  if (!loggedIn.value) {
    // 清除所有 Pinia Colada 缓存
    queryCache.cancelQueries()
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry))
    // 跳转到首页
    navigateTo('/')
  }
})

// ... 其余代码保持不变
</script>
```

#### 4. 为什么这样做

1. **`queryCache.cancelQueries()`**：取消所有待处理的请求，防止它们在缓存清除后仍然返回并写入缓存
2. **`queryCache.getEntries().forEach((entry) => queryCache.remove(entry))`：遍历并移除所有缓存条目
3. **在 `watch(loggedIn, ...)` 中执行**：确保无论通过任何方式登出（包括手动调用 `clear()`）都会触发缓存清除

#### 5. 替代方案：全局插件

也可以创建一个全局插件来监听认证状态变化并清除缓存：

```typescript
// plugins/auth-cache-sync.ts
export default defineNuxtPlugin(() => {
  const { loggedIn } = useUserSession()
  const queryCache = useQueryCache()

  watch(loggedIn, (isLoggedIn) => {
    if (!isLoggedIn) {
      // 用户登出时清除所有缓存
      queryCache.cancelQueries()
      queryCache.getEntries().forEach((entry) => queryCache.remove(entry))
    }
  })
})
```

---

## 总结

### 漏洞总结

1. **问题 1 答案**：
   - **漏洞**：用户 A 登出后，用户 B 在"真空期"内可以看到用户 A 的私有数据
   - **根本原因**：Pinia Colada 的 `queryCache` 与 Nuxt Auth Session 的生命周期物理隔离
   - **影响**：严重的数据隐私泄露

2. **问题 2 答案**：
   - **关键代码**：在用户登出时执行 `queryCache.cancelQueries()` 和 `queryCache.getEntries().forEach((entry) => queryCache.remove(entry))`
   - **实现位置**：`app.vue` 的 `watch(loggedIn, ...)` 中，或全局插件中
   - **效果**：将前端数据缓存的生命周期与用户认证生命周期强制绑定

### 最佳实践建议

1. **始终在用户登出时清除所有缓存**：这是一个安全最佳实践
2. **考虑使用 `cancelQueries()` 与 `remove()` 配合使用**：确保待处理的请求不会在缓存清除后仍然返回
3. **在全局统一管理**：使用全局插件或统一的登出逻辑**，确保所有登出场景都能触发缓存清除
4. **测试**：测试用户切换场景**，确保没有数据泄露

---

## 参考资料

- [Pinia Colada 官方文档 - Query Cache](https://pinia-colada.esm.dev/advanced/query-cache.html)
- [Pinia Colada GitHub 讨论 - How to clear all caches at once](https://github.com/posva/pinia-colada/discussions/56)
- [Pinia Colada GitHub 讨论 - add removeAll or clean to queryCache](https://github.com/posva/pinia-colada/discussions/140)
