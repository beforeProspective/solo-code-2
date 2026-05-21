# TanStack Query 预取与脱水架构深度分析

本文针对 `src/app/dashboard/product/page.tsx` 与 `src/components/layout/query-provider.tsx` 之间的 TanStack Query 预取架构，深入分析三个核心问题：`void` 预取的缓存状态、`useSuspenseQuery` 与 `useQuery` 的视觉差异、以及 Streaming SSR 下的 Suspense 协作机制。

---

## 问题 1：`void prefetchQuery` 不等待导致的缓存状态与脱水应对

### 1.1 调用时序分析

在 [product-listing.tsx](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/features/products/components/product-listing.tsx#L22-L29) 中：

```typescript
const queryClient = getQueryClient();

void queryClient.prefetchQuery(productsQueryOptions(filters));

return (
  <HydrationBoundary state={dehydrate(queryClient)}>
    <ProductTable />
  </HydrationBoundary>
);
```

由于使用了 `void` 而非 `await`，调用时序如下：

```
时间轴 →

[服务端组件渲染开始]
    │
    ├─ getQueryClient()              ← 创建服务端 QueryClient 实例
    │
    ├─ void prefetchQuery(...)       ← 启动异步请求，不等待
    │     │
    │     └─ queryFn 开始执行        ← Promise 处于 pending 状态
    │
    ├─ dehydrate(queryClient)        ← 立即序列化 QueryClient 状态
    │     │                          （此时查询极大概率仍在 pending）
    │     │
    │     └─ 生成 dehydrated state:
    │        {
    │          queries: [{
    │            queryKey: [...],
    │            state: { status: 'pending' },  ← 没有 data！
    │            promise: <in-flight-promise>   ← 有 promise！
    │          }]
    │        }
    │
    ├─ <HydrationBoundary state={...}> ← 将 dehydrated state 嵌入 RSC 流
    │
[服务端组件渲染结束，HTML 开始流式发送]
```

### 1.2 缓存中的查询状态

在 `dehydrate(queryClient)` 被调用的瞬间，查询在 QueryClient 缓存中的状态是：

```
Query State:
{
  status: 'pending',       // 不是 'success'
  fetchStatus: 'fetching', // 正在获取中
  data: undefined,         // 没有数据
  dataUpdatedAt: 0,        // 未更新
  error: null,
  promise: Promise<pending> // in-flight 的 Promise
}
```

这是一个**无数据、仅有 Promise 引用**的 pending 状态。

### 1.3 `shouldDehydrateQuery` 如何应对

查看 [query-client.ts](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/lib/query-client.ts#L9-L12)：

```typescript
dehydrate: {
  shouldDehydrateQuery: (query) =>
    defaultShouldDehydrateQuery(query) || query.state.status === 'pending'
}
```

`defaultShouldDehydrateQuery` 的默认逻辑是：**只脱水 `success` 或 `error` 状态的查询**，排除 `pending` 状态。这在 `await prefetchQuery()` 的场景下没问题——等到数据返回后才脱水，拿到的是完整数据。

但本项目使用 `void`（fire-and-forget），数据尚未返回时脱水就已经发生了。如果不覆盖 `shouldDehydrateQuery`，pending 查询会被**静默丢弃**，后果是：

- 客户端缓存中没有这条查询的任何记录
- `useSuspenseQuery` 在客户端挂载时发现缓存为空，发起**全新的请求**
- 造成重复请求和性能浪费

**关键机制**：额外的 `|| query.state.status === 'pending'` 条件使得 pending 查询也被序列化。TanStack Query 在序列化 pending 查询时会**同时保存 Promise 引用**：

```typescript
// TanStack Query 内部处理
if (query.state.status === 'pending') {
  dehydratedQuery.promise = query.promise;  // 传递 in-flight Promise
}
```

这样客户端在 hydrate 时就能通过 `initialPromise` 机制**复用服务端已发起的请求**，而非重新发起。

### 1.4 流式传输中的 Promise 传递

这是整个机制最精妙的部分。普通 JSON 序列化无法传递 Promise 对象，但 **Next.js RSC 使用了自定义的序列化协议**（Flight Protocol），它可以：

1. 将 Promise 标记为"可解析的占位符"
2. 通过 HTTP chunked encoding 分块传输
3. 当服务端 Promise resolve 时，将结果通过后续 chunk 推送到客户端
4. 客户端的 React 运行时识别占位符并在数据到达时更新

这意味着 `dehydrate` 产生的 `{ status: 'pending', promise: <pending> }` 可以**跨越网络边界**完整传输到浏览器。

---

## 问题 2：`useSuspenseQuery` vs `useQuery` 的视觉差异

### 2.1 `useSuspenseQuery` 的行为（当前方案）

在 [product-tables/index.tsx](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/features/products/components/product-tables/index.tsx#L31) 中：

```typescript
const { data } = useSuspenseQuery(productsQueryOptions(filters));
```

**时间线分析**：

```
[客户端水合开始]
    │
    ├─ HydrationBoundary 注入 dehydrated state
    │     │
    │     └─ 缓存状态: { status: 'pending', promise: <已传输的 Promise> }
    │
    ├─ ProductTable 组件挂载
    │     │
    │     └─ useSuspenseQuery 执行
    │           │
    │           ├─ 检测到缓存中有 pending 状态 + promise
    │           ├─ 不发起新请求（复用已有 promise）
    │           └─ 抛出 Promise 给 React Suspense
    │
    ├─ React 捕获到 Promise 抛出
    │     │
    │     └─ 渲染 Suspense fallback（如果有），或阻塞渲染
    │
    ├─ [服务端数据到达，Promise resolve]
    │     │
    │     └─ 缓存状态更新: { status: 'success', data: [...] }
    │
    ├─ React 检测到 Promise resolve
    │     │
    │     └─ 重新渲染 ProductTable，直接显示数据表格
    │
[最终渲染：产品表格直接展示，无 loading 闪烁]
```

### 2.2 如果替换为 `useQuery`

```typescript
// 假设替换为:
const { data, isLoading } = useQuery(productsQueryOptions(filters));
```

**时间线分析**：

```
[客户端水合开始]
    │
    ├─ HydrationBoundary 注入 dehydrated state
    │     │
    │     └─ 缓存状态: { status: 'pending', promise: <已传输的 Promise> }
    │
    ├─ ProductTable 组件挂载
    │     │
    │     └─ useQuery 执行
    │           │
    │           ├─ 检测到缓存中有 pending 状态 + promise
    │           ├─ 不发起新请求（同样复用已有 promise）
    │           ├─ 返回: { data: undefined, isLoading: true, isFetching: true }
    │           │
    │           └─ ⚠️ 不会抛出 Promise！
    │
    ├─ 组件使用 isLoading === true 渲染 loading 骨架屏
    │     │
    │     └─ 用户看到：loading 骨架屏（即使服务端已有预取）
    │
    ├─ [服务端数据到达，Promise resolve]
    │     │
    │     └─ 缓存状态更新: { status: 'success', data: [...] }
    │
    ├─ useQuery 触发重新渲染
    │     │
    │     └─ 返回: { data: [...], isLoading: false }
    │
    ├─ 组件重新渲染，显示数据表格
    │
[最终渲染：先显示骨架屏 → 再显示表格（有闪烁）]
```

### 2.3 核心差异：为什么预取无法阻止 loading 骨架屏

**根本原因**：`useQuery` 和 `useSuspenseQuery` 对"数据未就绪"状态的处理方式完全不同：

| 维度 | `useSuspenseQuery` | `useQuery` |
|------|-------------------|-----------|
| 数据未就绪时 | **抛出 Promise** 给 React Suspense | 返回 `{ isLoading: true }` |
| 渲染行为 | 组件**不渲染**，由 Suspense 边界控制 | 组件**正常渲染**（显示 loading UI） |
| 与服务端预取配合 | 如果缓存中有 `success` 数据，**直接同步返回** | 如果缓存中有 `success` 数据，**也直接同步返回** |

**关键的时序修正**：

之前的分析存在一个重要的细节偏差，需要基于 React 渲染树的同步执行顺序进行修正：

#### 问题 1：HydrationBoundary 的水合时机

`HydrationBoundary` 在 React 渲染树中位于 `ProductTable` 的**父层级**。React 的渲染是**同步、深度优先**的：

```
渲染顺序：
1. <HydrationBoundary>       ← 首先执行
   │
   ├─ hydrate(client, state)  ← 同步执行！将数据注入缓存
   │
   └─ <Suspense>
        │
        └─ <ProductTable>  ← 然后才执行
             │
             └─ useQuery()
```

因此，**当 `useQuery` 在首帧渲染时，`hydrate()` 已经同步执行完毕**。不存在"水合延迟"的问题——hydrate 是在 React 渲染 `HydrationBoundary` 组件函数体中同步调用的，子组件渲染发生在父组件渲染**之后**（React 的渲染顺序保证了这一点。

#### 问题 2：useQuery 首帧能否同步读取到成功数据

**结论：可以。**

当满足以下条件时：
- `HydrationBoundary` 已将 dehydrated state 注入缓存
- 缓存中存在 `status: 'success'` 的查询
- 缓存键与 `useQuery` 的查询键完美匹配

`useQuery` 在首帧渲染时会**同步**返回：
```typescript
{ data: <真实数据, isLoading: false, isFetching: false }
```

**不会产生加载状态闪烁。**

这与之前的说法"即使缓存中有 success 数据，首帧也可能返回 isLoading: true"是**不准确的**。`useQuery` 的内部逻辑是同步读取缓存，如果缓存中已有 success 状态，它直接返回，不会产生中间态。

#### 问题 3：那为什么使用 useQuery 仍可能看到闪烁？

闪烁**仅在以下情况发生**：

```
情况 A：服务端 dehydrate 时数据已就绪（success）
┌─────────────────────────────────────────┐
│  HydrationBoundary → hydrate() 同步执行    │
│  → 缓存中有 { status: 'success' }    │
│  → useQuery 首帧直接返回数据            │
│  → 无闪烁 ✓                            │
└─────────────────────────────────────────┘

情况 B：服务端 dehydrate 时数据未就绪（pending）
┌─────────────────────────────────────────┐
│  HydrationBoundary → hydrate() 同步执行    │
│  → 缓存中有 { status: 'pending' }    │
│  → useQuery 首帧返回 isLoading: true    │
│  → 显示骨架屏 → 数据到达后重新渲染    │
│  → 有闪烁 ✗                            │
└─────────────────────────────────────────┘
```

在本项目使用 `void prefetchQuery` 的架构中，由于不使用 `await`，**情况 B 才是常态**——数据在 dehydrate 时大概率还是 pending 状态。这才是导致 `useQuery` 产生闪烁的真正原因，而非"水合延迟"。

**真正的差异总结**：

- **`useSuspenseQuery`**：无论缓存是 `success` 还是 `pending`，都不会出现"组件自绘 loading"的中间态
  - `success` → 直接返回数据
  - `pending` → 抛出 Promise，由 Suspense 边界控制渲染 fallback
- **`useQuery`**：当缓存是 `pending` 时，会返回 `isLoading: true`，导致组件自行渲染 loading 状态

### 2.4 视觉效果对比

```
useSuspenseQuery 时间线（当前方案）：
┌─────────────────────────────────────────┐
│  [空白/骨架]  →  [产品表格]              │  ← 最多一次过渡
│  (仅在数据未就绪时显示 fallback)          │
└─────────────────────────────────────────┘

useQuery 时间线（假设替换后）：
┌─────────────────────────────────────────┐
│  [loading骨架] → [产品表格]              │  ← 必定有闪烁
│  (isLoading=true → isLoading=false)      │     即使数据已在缓存中
└─────────────────────────────────────────┘
```

---

## 问题 3：Streaming SSR 下 `useSuspenseQuery` 与 Suspense 边界的协作

### 3.1 Next.js Streaming SSR 的核心机制

Next.js App Router 默认使用 **Streaming SSR**（流式服务端渲染），其核心原理：

```
传统 SSR（阻塞式）:
┌──────────────────────────────────────────┐
│  等待所有数据就绪 → 生成完整 HTML → 发送  │
│  TTFB 延迟高，用户长时间看到白屏          │
└──────────────────────────────────────────┘

Streaming SSR（流式）:
┌──────────────────────────────────────────┐
│  立即发送 HTML shell                      │
│  → 分块发送各 Suspense 边界的内容         │
│  → 每个 Suspense 数据就绪后单独推送       │
│  TTFB 快，用户快速看到页面结构            │
└──────────────────────────────────────────┘
```

### 3.2 `useSuspenseQuery` 如何与 Suspense 边界配合

在 [react-query/page.tsx](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/app/dashboard/react-query/page.tsx#L26-L30) 中可以看到显式的 Suspense 用法：

```typescript
<HydrationBoundary state={dehydrate(queryClient)}>
  <Suspense fallback={<PokemonSkeleton />}>
    <PokemonInfo />   {/* 内部使用 useSuspenseQuery */}
  </Suspense>
</HydrationBoundary>
```

**服务端渲染阶段的协作流程**：

```
[服务端 RSC 渲染开始]
    │
    ├─ 服务端组件（React Server Component）
    │     │
    │     ├─ void prefetchQuery(pokemonOptions(25))
    │     │     └─ 启动请求，返回 pending Promise
    │     │
    │     ├─ 返回 JSX:
    │        <HydrationBoundary state={dehydrate(queryClient)}>
    │          <Suspense fallback={<PokemonSkeleton />}>
    │            <PokemonInfo />   ← 这是 Client Component
    │          </Suspense>
    │        </HydrationBoundary>
    │
    ├─ Next.js 开始渲染 RSC 树
    │     │
    │     ├─ 遇到 <Suspense> 边界
    │     │     │
    │     │     └─ 渲染 fallback（PokemonSkeleton）
    │     │        同时标记此边界需要后续填充
    │     │
    │     ├─ 发送 HTML shell（包含 Skeleton）到浏览器
    │           浏览器立即显示：页面布局 + Skeleton
    │
    ├─ [prefetchQuery 完成，数据返回]
    │     │
    │     ├─ dehydrated state 更新（通过 RSC Flight 协议）
    │     ├─ Next.js 重新渲染 <PokemonInfo>
    │     │     │
    │     │     └─ useSuspenseQuery 执行
    │     │           ├─ 检测到缓存中已有 success 数据
    │     │           └─ 直接返回数据（不抛 Promise）
    │     │
    │     ├─ 生成 <PokemonInfo> 的完整 HTML
    │     │
    │     └─ 通过 HTTP chunk 推送到浏览器
    │           浏览器替换 Skeleton → 显示完整内容
    │
[渲染完成]
```

### 3.3 如何避免水合不匹配（Hydration Mismatch）

**水合不匹配警告**发生在：服务端渲染的 HTML 与客户端首次渲染的输出不一致。

在本架构中，`useSuspenseQuery` 与 Suspense 协作通过以下机制避免此问题：

#### 机制 1：服务端预取 + HydrationBoundary 的数据一致性

```
服务端渲染时：
  ├─ void prefetchQuery() 启动请求
  ├─ dehydrate(queryClient) 序列化缓存状态
  │   └─ 如果数据已就绪：{ status: 'success', data: [...] }
  │   └─ 如果数据未就绪：{ status: 'pending', promise: <pending> }
  │
  └─ HydrationBoundary 将状态嵌入 RSC payload

客户端水合时：
  ├─ HydrationBoundary 注入相同的 dehydrated state 到客户端缓存
  │
  └─ useSuspenseQuery 读取缓存：
      ├─ 如果 success：直接返回数据，渲染与服务端完全一致
      └─ 如果 pending：抛出 Promise，Suspense 渲染 fallback
```

**关键**：服务端和客户端读取的是**同一份缓存状态**（通过 dehydrate/hydrate 传递），因此渲染结果必然一致。

#### 机制 2：Suspense 边界作为"水合同步点"

```
传统水合问题（没有 Suspense）：
┌─────────────────────────────────────────┐
│  服务端: 渲染 <Table data={serverData}/> │
│  客户端: 渲染 <Table isLoading=true/>    │  ← 不匹配！警告！
│  原因: 客户端还没拿到 serverData          │
└─────────────────────────────────────────┘

Suspense + useSuspenseQuery 方案：
┌─────────────────────────────────────────┐
│  服务端: 渲染 <Suspense fallback={<Skel/>}>│
│           └─ 渲染 <Table data={data}/>   │
│                                         │
│  客户端: 渲染 <Suspense fallback={<Skel/>}>│
│           ├─ 如果数据已就绪: 渲染 Table   │
│           └─ 如果数据未就绪: 渲染 Skeleton│
│                                         │
│  结果: 两边始终一致！                     │
└─────────────────────────────────────────┘
```

Suspense 边界本身就是一个"水合同步点"——它在服务端和客户端使用相同的 fallback 内容，且只有在数据就绪后才渲染子组件。这确保了：

1. **数据未就绪时**：服务端和客户端都显示 fallback（Skeleton）——一致 ✓
2. **数据就绪后**：服务端和客户端都显示完整数据——一致 ✓

#### 机制 3：服务端数据在水合前已到达

在 Streaming SSR 中，RSC Flight Protocol 确保了一个重要的时序保证：

```
客户端水合时序：
    │
    ├─ HTML shell 到达 → 浏览器开始解析
    │
    ├─ RSC payload 开始流式接收
    │     │
    │     ├─ chunk 1: HydrationBoundary state（可能包含 pending promise）
    │     ├─ chunk 2: 其他组件数据
    │     ├─ ...
    │     └─ chunk N: 最终数据（如果之前是 pending）
    │
    ├─ React 开始水合
    │     │
    │     └─ HydrationBoundary 首先注入接收到的状态
    │
    └─ 组件挂载
          │
          └─ useSuspenseQuery 读取的是已注入的状态
             ├─ success → 直接返回数据（与服务端渲染一致）
             └─ pending → 抛出 Promise → 显示 fallback（与服务端一致）
```

**核心洞察**：水合不是"瞬间完成"的——它是随着 RSC payload 的流式到达而渐进进行的。`HydrationBoundary` 在水合过程中作为一个**屏障**，确保子组件在水合时读取的缓存状态与服务端渲染时完全一致。

### 3.4 与 `useQuery` 的对比

在 Streaming SSR 中，`useQuery` 的行为取决于服务端 dehydrate 时数据的就绪状态：

```
场景 A：服务端 dehydrate 时数据已就绪（success）
┌─────────────────────────────────────────┐
│                                         │
│  服务端:                                 │
│    渲染 <Table data={serverData}/>       │
│    → HTML 中包含完整数据                 │
│                                         │
│  客户端水合:                             │
│    HydrationBoundary 同步注入缓存        │
│    useQuery 读取到 { status: 'success' } │
│    → 首帧直接返回 data                   │
│    → 与服务端 HTML 一致 ✓                │
│                                         │
│  结果: 无闪烁，无水合不匹配              │
│                                         │
└─────────────────────────────────────────┘

场景 B：服务端 dehydrate 时数据未就绪（pending）
┌─────────────────────────────────────────┐
│                                         │
│  服务端:                                 │
│    Suspense 渲染 fallback（Skeleton）    │
│    → HTML 中包含 Skeleton               │
│                                         │
│  客户端水合:                             │
│    HydrationBoundary 注入 pending 状态  │
│    useQuery 返回 { isLoading: true }     │
│    → 组件渲染 loading 骨架              │
│    → 可能与服务端 Skeleton 不同          │
│    → 可能触发 hydration mismatch 警告 ⚠️ │
│                                         │
│  后续:                                   │
│    数据到达 → 重新渲染 → 显示表格        │
│    有视觉闪烁                           │
│                                         │
└─────────────────────────────────────────┘
```

在本项目使用 `void prefetchQuery` 的架构中，**场景 B 是常态**（数据在 dehydrate 时大概率还在 pending）。这就是为什么 `useSuspenseQuery` 是更安全的选择——它在 pending 状态下抛出 Promise 给 Suspense，由 Suspense 边界控制渲染 fallback（与服务端一致），而非让组件自行决定渲染什么 loading UI。

这就是为什么在 Next.js App Router + Streaming SSR 环境下，**`useSuspenseQuery` 是与服务端预取配合的最佳选择**——它通过 Suspense 机制消除了场景 B 中的水合不匹配风险和视觉闪烁。

---

## 架构总结

| 设计要素 | 作用 | 实现机制 |
|---------|------|---------|
| `void prefetchQuery` 不等待 | 优化 TTFB，支持流式 | fire-and-forget，后台异步 |
| `shouldDehydrateQuery` 包含 pending | 避免重复请求 | 序列化 in-flight Promise |
| Next.js RSC Flight Protocol | Promise 跨网络传输 | 特殊序列化 + chunked streaming |
| `useSuspenseQuery` | 避免 loading 闪烁 | 抛出 Promise 而非返回 loading 状态 |
| Suspense 边界 | 水合一致性保证 | fallback 在两端一致 |
| `HydrationBoundary` | 数据同步屏障 | 先注入状态，再水合子组件 |

这整套架构是 TanStack 官方推荐的 Next.js App Router 集成模式，其核心设计理念是：**在保证服务端/客户端渲染一致性的前提下，通过流式传输最大化首屏性能**。
