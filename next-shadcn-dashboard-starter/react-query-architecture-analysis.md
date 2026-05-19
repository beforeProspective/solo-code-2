# React Query 数据获取架构深度分析

本文深入分析 Next.js + TanStack React Query 在产品列表页的数据获取链路中的三个关键架构问题。

---

## 问题 1：QueryClient 实例共享机制

**问：** `product-listing.tsx` 中调用 `getQueryClient` 拿到的 QueryClient 实例，和 QueryProvider 中通过同一个 `getQueryClient` 函数拿到的实例，是同一个吗？为什么这种设计不会导致预取的数据在客户端丢失？

### 分析结论

**它们不是同一个实例。** 这是一个精心设计的"服务端每次新建 + 客户端单例"的混合模式。

### 代码证据

查看 [query-client.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\lib\query-client.ts#L19-L26)：

```typescript
export function getQueryClient() {
  if (isServer) {
    return makeQueryClient(); // 服务端：每次调用都创建新实例
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient; // 客户端：单例模式
  }
}
```

### 详细解释

1. **服务端行为**：
   - 每次 HTTP 请求到来时，服务端执行 `getQueryClient()` 都会创建一个**全新**的 QueryClient 实例
   - 这是为了确保请求之间的数据隔离，避免不同用户/请求共享缓存导致的数据泄露
   - 该实例仅在当前请求的生命周期内存在，请求结束即被销毁

2. **客户端行为**：
   - 浏览器端首次调用 `getQueryClient()` 时创建实例并缓存到模块变量 `browserQueryClient`
   - 后续所有调用（包括 QueryProvider 和组件内）都返回**同一个**单例实例
   - 这确保了整个应用共享同一份缓存状态

3. **为什么数据不会丢失？—— Hydration 机制**：
   
   数据传递不依赖实例共享，而是通过**序列化 + 反序列化**完成：
   
   - 服务端：`dehydrate(queryClient)` 将 QueryClient 中的查询状态序列化为可传输的 JSON
   - 传输：序列化的状态作为 HTML 的一部分发送到浏览器
   - 客户端：`HydrationBoundary` 组件接收 dehydrated state，将其**注入**到客户端的 QueryClient 实例中

   查看 [product-listing.tsx](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\features\products\components\product-listing.tsx#L22-L29) 的核心模式：
   ```typescript
   const queryClient = getQueryClient();            // 服务端实例 A
   void queryClient.prefetchQuery(...);             // 数据预取到实例 A
   return (
     <HydrationBoundary state={dehydrate(queryClient)}>  // 序列化实例 A 的状态
       <ProductTable />                             // 客户端使用实例 B
     </HydrationBoundary>
   );
   ```

   这就像你把文件从电脑 A 复制到 U 盘，再从 U 盘复制到电脑 B——两台电脑不是同一个，但文件内容完整传输了。

---

## 问题 2：void 预取与 pending 状态的脱水机制

**问：** 预取用的是 `void` 而不是 `await`，意味着 `dehydrate` 调用时预取可能还没完成，query 状态可能还是 pending。`query-client.ts` 中 `shouldDehydrateQuery` 里那个判断 pending 状态的条件具体起什么作用？客户端拿到一个 pending 状态的 dehydrated data 后，`useSuspenseQuery` 会怎么表现？

### 代码证据

查看 [query-client.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\lib\query-client.ts#L9-L12)：

```typescript
dehydrate: {
  shouldDehydrateQuery: (query) =>
    defaultShouldDehydrateQuery(query) || query.state.status === 'pending'
}
```

### `shouldDehydrateQuery` 的作用

1. **默认行为**：`defaultShouldDehydrateQuery(query)` 只脱水状态为 `success` 或 `error` 的查询，**默认排除 pending 状态**。

2. **本项目的增强**：额外添加 `query.state.status === 'pending'` 条件，使得**正在进行中的请求也能被序列化**。

3. **为什么需要这个？**
   
   因为使用了 `void queryClient.prefetchQuery(...)` 而不是 `await`：
   - `void` 表示"发射后不管"，预取请求在后台异步执行
   - `dehydrate()` 会**立即**被调用，此时查询很可能还处于 pending 状态
   - 如果没有这个条件，pending 查询会被忽略，客户端不会知道有一个正在进行的请求，会重新发起请求，造成重复请求

### 客户端拿到 pending 脱水数据后的表现——基于源码的真相

让我们基于 [TanStack Query 源码](https://github.com/TanStack/query/blob/main/packages/query-core/src/hydration.ts) 来回答你的三个核心疑问：

#### 问题 1：dehydrate 能把 Promise 跨越网络边界传输给浏览器吗？

**答案：在普通 JSON 序列化中不能，但在 Next.js RSC 环境中可以。**

`dehydrate` 确实是一个同步操作（类似 JSON.stringify），但它在序列化 pending query 时做了特殊处理：

```typescript
// 摘自 TanStack Query hydration.ts 源码
return {
  dehydratedAt: Date.now(),
  state: { ...query.state },
  queryKey: query.queryKey,
  queryHash: query.queryHash,
  ...(query.state.status === 'pending' && {
    promise: query.promise,  // ← 直接把 Promise 对象放进去了！
  }),
  // ...
}
```

在常规 SSR 中，这不可能跨网络传输。但 **Next.js RSC（React Server Components）使用了特殊的序列化协议**，它通过 HTTP 分块传输编码（chunked encoding）将 Promise 作为"占位符"序列化，客户端的 React 运行时能够识别这些占位符并等待它们 resolve。

#### 问题 2：如果服务端 void prefetchQuery 还没完成就 dehydrate，客户端拿到的状态里有真实 data 吗？

**答案：没有。**

如果查询在 `dehydrate()` 调用时还处于 pending 状态：
- 序列化的状态中 `state.data` 是 `undefined`
- 只有 `state.status: 'pending'` 和一个 `promise` 字段
- 这个 promise 是服务端正在执行的那个查询的真实 promise

#### 问题 3：useSuspenseQuery 读到只有 pending 没有 data 的缓存时会怎么做？

**答案：它不会发起新请求，而是复用传递过来的 promise。**

查看 hydrate 源码中对 pending 查询的处理：

```typescript
// 摘自 TanStack Query hydration.ts 源码 - hydrate 函数
if (dehydratedQuery.state.status === 'pending' && dehydratedQuery.promise) {
  void query.fetch(undefined, {
    // 将服务端传递过来的 promise 作为 initialPromise
    initialPromise: Promise.resolve(dehydratedQuery.promise).then(deserializeData),
  })
}
```

完整流程是：

1. **服务端**：`void prefetchQuery()` 启动请求 → 立即 `dehydrate()` 序列化出 `{ status: 'pending', promise: <in-flight-promise> }`
2. **传输**：Promise 通过 Next.js RSC 流协议发送到浏览器
3. **客户端 hydrate**：将这个 pending 状态注入缓存，并调用 `query.fetch({ initialPromise })` 复用 promise
4. **useSuspenseQuery**：
   - 检测到查询已有一个 in-flight promise，**不发起新请求**
   - 抛出这个 promise 给 React Suspense，触发 fallback 显示
   - 当服务端的查询完成、数据通过流推送到客户端时，promise resolve
   - Suspense 边界自动切换为真实内容

### 关键修正与澄清

> **❌ 之前的错误说法**："客户端会接力等待服务端的响应"
> 
> **✅ 正确理解**：客户端不是在"等待服务端"，而是在等待一个**已经通过 RSC 协议传输过来的 Promise 对象**的 resolve。这个 Promise 在服务端创建，在客户端等待，由 Next.js 流式传输机制在后台推送数据。

### 关键收益

- **更快的 TTFB**：服务端不需要等待数据返回就可以开始发送 HTML
- **无重复请求**：只要 pending 状态被正确序列化，客户端不会重复请求
- **流式体验**：骨架屏立即显示，数据到达后平滑过渡
- **注意边界**：这套机制依赖 Next.js RSC 的流式传输能力。在非 RSC 环境（如纯 SPA 或 Pages Router）中，dehydrate pending query 可能导致客户端重复请求或 hydration 错误。

---

## 问题 3：Query Key 的稳定性保证

**问：** `ProductTable` 客户端组件用 `useQueryStates` 解析 URL 参数构建 `filters` 对象，而 `product-listing.tsx` 服务端组件用 `searchParamsCache.get` 构建 `filters` 对象。首次加载时两边的值相同但引用不同。这会不会导致 React Query 认为是两个不同的 queryKey 从而重新发请求？为什么？

### 分析结论

**不会导致重复请求。** React Query 的 query key 比较使用的是**深度序列化比较**，而非 JavaScript 的引用相等。

### 代码证据

服务端构建 filters [product-listing.tsx](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\features\products\components\product-listing.tsx#L8-L20)：
```typescript
const page = searchParamsCache.get('page');
const search = searchParamsCache.get('name');
// ...
const filters = { page, limit: pageLimit, ... };
```

客户端构建 filters [product-tables/index.tsx](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\features\products\components\product-tables\index.tsx#L15-L29)：
```typescript
const [params] = useQueryStates({ ... });
const filters = {
  page: params.page,
  limit: params.perPage,
  ...(params.name && { search: params.name }),
  // ...
};
```

Query Key 定义 [queries.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\features\products\api\queries.ts#L9)：
```typescript
list: (filters: ProductFilters) => [...productKeys.all, 'list', filters] as const,
```

### 详细解释

1. **Query Key 的序列化机制**：
   
   React Query 内部会将 query key 数组**稳定序列化**为字符串。例如：
   ```typescript
   // 服务端的 filters 对象（引用地址 0x123）
   { page: 1, limit: 10 }
   
   // 客户端的 filters 对象（引用地址 0x456）
   { page: 1, limit: 10 }
   
   // React Query 内部都会序列化为相同的字符串：
   // '["products","list",{"page":1,"limit":10}]'
   ```

   只要对象的**属性名和属性值**完全相同，序列化结果就相同，与对象引用无关。

2. **值的一致性保证**：
   
   服务端使用 `searchParamsCache.get()`，客户端使用 `useQueryStates()`，两者的解析规则是**对齐的**：
   
   - 服务端 [searchparams.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\lib\searchparams.ts#L8-L19) 定义：
     ```typescript
     page: parseAsInteger.withDefault(1),
     perPage: parseAsInteger.withDefault(10),
     ```
   
   - 客户端 [product-tables/index.tsx](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\features\products\components\product-tables\index.tsx#L15-L21) 使用相同的解析器和默认值：
     ```typescript
     page: parseAsInteger.withDefault(1),
     perPage: parseAsInteger.withDefault(10),
     ```
   
   因此首次加载时，两边解析出的 `page`、`limit` 等值必然完全相同。

3. **缓存命中过程**：
   
   当客户端 `useSuspenseQuery(productsQueryOptions(filters))` 执行时：
   1. 计算 query key 并序列化
   2. 在缓存中查找是否有匹配的 key
   3. 发现服务端脱水过来的数据有完全相同的 key
   4. 直接使用缓存数据，**不发起新请求**

### 注意边界

这种机制依赖一个隐含约定：**服务端和客户端对同一 URL 参数的解析逻辑必须完全一致**。如果两边的默认值、解析规则不同，就会导致 query key 不匹配，从而触发重复请求。本项目通过集中定义 parsers 来避免这个问题。

---

## 架构设计总结

这三个问题揭示了 Next.js App Router + React Query 架构的精妙设计：

| 设计决策 | 目的 | 实现机制 |
|---------|------|---------|
| 服务端每次新建 QueryClient | 请求间数据隔离 | `isServer` 判断 + 每次新建 |
| 客户端单例 QueryClient | 全局缓存共享 | 模块级变量缓存 |
| `void` 预取而非 `await` | 优化 TTFB，支持流式 SSR | 后台异步执行 |
| 允许脱水 pending 查询 | 避免重复请求，传输 in-flight promise | 自定义 `shouldDehydrateQuery` + Next.js RSC 流协议 |
| `initialPromise` 复用机制 | 客户端不重复请求 | hydrate 时将 dehydrated promise 传入 `query.fetch()` |
| 深度序列化 query key | 确保服务端/客户端缓存匹配 | 内部稳定序列化算法 |

这套架构是 TanStack 官方推荐的 Next.js App Router 集成模式，**深度依赖 Next.js RSC 的流式序列化能力**，在保证正确性的同时最大化了性能。

---

## 修正说明

本文档已根据 TanStack Query 源码（[hydration.ts](https://github.com/TanStack/query/blob/main/packages/query-core/src/hydration.ts)）进行了修正，特别澄清了：

1. Promise 跨网络传输依赖 Next.js RSC 特殊协议，而非普通 JSON 序列化
2. pending 状态的 dehydrated query 不含真实 data，只有 promise
3. 客户端通过 `initialPromise` 机制复用服务端传递的 promise，而非"接力等待网络响应"
4. 这套机制在非 RSC 环境中无法正常工作
