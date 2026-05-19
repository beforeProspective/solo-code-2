# React Query Mutation 缓存失效机制深度分析

## 问题背景

当前项目中产品模块的 mutation 设计存在潜在的缓存失效问题。本文将从三个维度深入分析这些问题。

---

## 问题一：Server Action 场景下的 getQueryClient 行为（修正版）

### 关键机制澄清

首先必须明确 **Server Action 的执行边界**，这是理解整个问题的核心：

| 代码部分 | 执行环境 | 说明 |
|---------|---------|------|
| `'use server'` 标记的函数 **内部逻辑** | 服务端（Node.js） | 只有函数体在服务端执行 |
| 调用 Server Action 的代码 | 客户端（浏览器） | 包括 useMutation、onSuccess 回调等 |
| `mutationFn` 中调用 Server Action | 客户端发起，服务端执行函数体 | 网络请求由客户端发起 |
| `onSuccess` / `onError` 回调 | 客户端（浏览器） | React Query 在客户端执行回调 |

### 代码参考

[query-client.ts](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/lib/query-client.ts#L19-L26) 中 `getQueryClient` 的实现：

```typescript
export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();  // 服务端：每次新建实例
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;  // 客户端：返回单例
  }
}
```

[mutations.ts](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/features/products/api/mutations.ts#L7-L12) 中的 mutation 定义：

```typescript
export const createProductMutation = mutationOptions({
  mutationFn: (data: ProductMutationPayload) => createProduct(data),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: productKeys.all });
  }
});
```

### 分析结论

**当 service.ts 改为 Server Action 时（在文件顶部添加 `'use server'`）：**

1. **getQueryClient 返回值**：`onSuccess` 回调在**客户端**执行，`getQueryClient()` 返回的是**浏览器单例 `browserQueryClient`**，与 `QueryProvider` 使用的是同一个实例。

2. **缓存失效效果**：**完全有效**！原因如下：
   - `onSuccess` 回调在客户端浏览器中执行
   - 调用 `getQueryClient()` 走的是 `else` 分支，返回客户端单例
   - 在这个单例上调用 `invalidateQueries` 会正确标记客户端缓存失效
   - 服务端执行的只是 `createProduct` 函数体本身，与 `onSuccess` 回调完全隔离

3. **执行流程图**：
   ```
   浏览器（客户端）                          服务端（Node.js）
   ┌───────────────────────────┐          ┌─────────────────────┐
   │ useMutation({             │          │ 'use server'        │
   │   mutationFn: createProduct│   RPC   │ async function      │
   │   onSuccess: () => {      │────────▶│ createProduct(data) {│
   │     getQueryClient()      │          │   // 操作数据库     │
   │     .invalidateQueries()  │          │   return result     │
   │     toast.success()       │◀────────│ }                   │
   │     router.push()         │          └─────────────────────┘
   │   }                       │
   │ })                        │
   └───────────────────────────┘
   ```

4. **这意味着什么**：
   - 现有的 `onSuccess` 回调设计在 Server Action 场景下**完全正常工作**
   - 之前的分析错误地认为 onSuccess 会随 Server Action 一起在服务端执行
   - 真正的问题是问题二中的**回调覆盖 Bug**，而不是 Server Action 兼容性问题

---

## 问题二：mutationOptions 与 useMutation 回调的执行关系

### 代码参考

[product-form.tsx](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/features/products/components/product-form.tsx#L25-L45) 中的使用方式：

```typescript
const createMutation = useMutation({
  ...createProductMutation,  // 展开 mutationOptions
  onSuccess: () => {         // 覆盖 onSuccess
    toast.success('Product created successfully');
    router.push('/dashboard/product');
  },
  onError: () => {
    toast.error('Failed to create product');
  }
});
```

### 分析结论

**在 TanStack React Query v5 中：**

1. **执行关系**：**useMutation 级别的回调会完全覆盖 mutationOptions 级别的同名回调**，而不是追加或链式执行。

2. **技术原因**：
   - 这是 JavaScript 对象展开运算符（`...`）的标准行为
   - 后面的属性会覆盖前面同名的属性
   - `onSuccess` 函数被完全替换，原有的 `invalidateQueries` 逻辑丢失

3. **实际执行结果**：
   - `mutations.ts` 中定义的 `invalidateQueries` **不会执行**
   - 只有 `product-form.tsx` 中定义的 toast 和 router.push 会执行

4. **这意味着什么**：
   - 产品创建/更新/删除后，React Query 缓存中的产品列表数据不会被标记为失效
   - 这是一个**隐蔽的 Bug**，代码看起来有缓存失效逻辑，但实际上从未执行
   - 违反了关注点分离原则：mutations.ts 负责数据层逻辑，product-form.tsx 负责 UI 层逻辑，但覆盖导致数据层逻辑丢失

---

## 问题三：跳转列表页的数据显示行为分析

### 关键配置

1. **staleTime 配置**：[query-client.ts](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/lib/query-client.ts#L6-L8) 中配置为 60 秒
   ```typescript
   defaultOptions: {
     queries: {
       staleTime: 60 * 1000  // 60秒
     }
   }
   ```

2. **列表页预取逻辑**：[product-listing.tsx](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/features/products/components/product-listing.tsx#L22-L29)

### 分析结论

**用户创建产品后跳转回列表页时，会显示旧数据**。从两个维度分析：

#### 维度一：Next.js App Router 客户端导航行为

- `router.push('/dashboard/product')` 是**客户端导航**，不会触发完整的页面刷新
- 客户端导航时，React Query 会检查缓存中是否已有该查询的数据
- 如果缓存中有数据且未过期，直接使用缓存数据，不会发起新的网络请求
- 服务端预取（`prefetchQuery`）只在首次访问或硬刷新时执行，客户端导航时不会重新执行服务端组件

#### 维度二：React Query staleTime 60秒配置

- `staleTime: 60 * 1000` 表示数据在 60 秒内被视为"新鲜"（fresh）
- 在 staleTime 窗口内：
  - 数据被认为是有效的
  - `useSuspenseQuery` 会直接返回缓存数据
  - 不会触发背景重新获取
- 60 秒后：
  - 数据变为"陈旧"（stale）
  - 再次访问时会触发背景重新获取
  - 但仍会先显示旧数据，新数据获取完成后才更新

#### 时间线示例

| 时间点 | 操作 | 缓存状态 | 显示数据 |
|--------|------|----------|----------|
| T0 | 用户访问产品列表 | 缓存为空，发起请求 | 显示加载态，然后显示列表 |
| T0+5s | 用户创建新产品并跳转回列表 | 缓存中数据 age=5s < 60s，fresh | **显示旧列表（不含新产品）** |
| T0+5s ~ T0+60s | 用户反复访问列表 | 数据一直 fresh | 始终显示旧列表 |
| T0+61s | 用户访问列表 | 数据 age=61s > 60s，stale | 先显示旧列表，背景重新获取后显示新列表 |

---

## 修正方案建议

### 方案一：使用回调合并（推荐）

修改 `product-form.tsx`，保留原有的 onSuccess 逻辑：

```typescript
const createMutation = useMutation({
  ...createProductMutation,
  onSuccess: (...args) => {
    // 先执行原有的缓存失效逻辑
    createProductMutation.onSuccess?.(...args);
    // 再执行 UI 逻辑
    toast.success('Product created successfully');
    router.push('/dashboard/product');
  },
  onError: () => {
    toast.error('Failed to create product');
  }
});
```

### 方案二：使用 meta 字段提取 UI 逻辑

将 UI 回调与数据层回调分离：

```typescript
// mutations.ts
export const createProductMutation = mutationOptions({
  mutationFn: (data: ProductMutationPayload) => createProduct(data),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: productKeys.all });
  },
  meta: {
    successMessage: 'Product created successfully',
    redirectTo: '/dashboard/product'
  }
});

// product-form.tsx
const createMutation = useMutation({
  ...createProductMutation,
  onSuccess: () => {
    toast.success(createProductMutation.meta?.successMessage);
    router.push(createProductMutation.meta?.redirectTo);
  }
});
```

### 方案三：在组件内手动调用 invalidateQueries

不依赖 mutationOptions 中的 onSuccess：

```typescript
const queryClient = useQueryClient();

const createMutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: productKeys.all });
    toast.success('Product created successfully');
    router.push('/dashboard/product');
  }
});
```

---

## 总结

### 修正后的核心结论

当前实现**只有一个关键问题**：

1. **✅ Server Action 兼容性**：`getQueryClient()` 在 `onSuccess` 回调中调用时，回调在客户端执行，返回浏览器单例，缓存失效**完全有效**
2. **❌ 回调覆盖 Bug**：useMutation 覆盖 onSuccess 导致 `mutations.ts` 中定义的 `invalidateQueries` **从未执行**

### 问题根源

`product-form.tsx` 中使用对象展开运算符时，后面定义的 `onSuccess` 完全覆盖了 `createProductMutation` 中定义的 `onSuccess`，导致缓存失效逻辑丢失。这是一个**隐蔽的 Bug** —— 代码看起来有缓存失效逻辑，但实际上从未执行。

### 影响

用户创建产品后跳转回列表页时，在 60 秒的 `staleTime` 窗口内始终看到旧数据（不包含新创建的产品），直到缓存过期后才会重新获取最新数据。

### 推荐修复方案

使用**回调合并**的方式，在组件的 `onSuccess` 中先调用原有的缓存失效逻辑：

```typescript
const createMutation = useMutation({
  ...createProductMutation,
  onSuccess: (...args) => {
    createProductMutation.onSuccess?.(...args); // 保留缓存失效
    toast.success('Product created successfully');
    router.push('/dashboard/product');
  }
});
```
