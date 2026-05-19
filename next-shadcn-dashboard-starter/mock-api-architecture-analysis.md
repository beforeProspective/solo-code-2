# Mock API 架构深度分析

本文深入分析 `mock-api.ts` 模块级单例模式在 Next.js App Router 架构下的三个关键问题。

---

## 问题 1：ID 生成策略的缺陷

**问：** `createProduct` 方法用 `this.records.length + 1` 生成新 ID。如果先创建一个产品得到 ID=21，然后删除 ID=20 的产品导致 records 长度变回 20，再创建一个新产品，新产品的 ID 会是多少？这会导致什么问题？

### 分析结论

**新产品的 ID 会是 21，这会导致 ID 冲突（主键重复）。**

### 代码证据

查看 [mock-api.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\constants\mock-api.ts#L177-L195)：

```typescript
async createProduct(data: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'photo_url'>) {
  await delay(1000);

  const newProduct: Product = {
    ...data,
    id: this.records.length + 1,  // ⚠️ 基于数组长度生成 ID
    photo_url: `https://api.slingacademy.com/public/sample-products/${this.records.length + 1}.png`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  this.records.push(newProduct);
  // ...
}
```

删除操作的实现 [mock-api.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\constants\mock-api.ts#L227-L242)：

```typescript
async deleteProduct(id: number) {
  await delay(1000);
  const index = this.records.findIndex((product) => product.id === id);
  if (index === -1) {
    return { success: false, message: `Product with ID ${id} not found` };
  }
  this.records.splice(index, 1);  // 直接删除，数组长度减少
  // ...
}
```

### 场景复现

```
初始状态：records.length = 20，ID 为 1~20

步骤 1：创建新产品
→ id = 20 + 1 = 21
→ records.length = 21，ID 为 1~21

步骤 2：删除 ID=20 的产品
→ records.splice(indexOfId20, 1)
→ records.length = 20，ID 为 1~19, 21

步骤 3：再创建新产品
→ id = 20 + 1 = 21  ❌ ID 冲突！
→ records 中已有 ID=21 的产品
```

### 导致的问题

| 问题类型 | 具体表现 | 影响范围 |
|---------|---------|---------|
| **主键冲突** | 新创建的产品 ID 与已存在的产品 ID 重复 | `getProductById` 始终返回第一个匹配的记录，后创建的产品永远无法通过 ID 访问 |
| **数据覆盖** | 虽然 `push` 不会覆盖已有元素，但查询时会产生歧义 | 基于 ID 的更新、删除操作可能操作错误的记录 |
| **引用失效** | 如果其他数据结构通过 ID 引用产品，会指向错误的对象 | 关联数据一致性被破坏 |
| **URL 异常** | `photo_url` 同样基于 `length + 1` 生成，会与已有产品使用相同的图片 URL | 产品图片显示错误 |

### 根因分析

这种 ID 生成方式违反了**标识符不变性原则**：

- 数组长度是**可变状态**，随删除操作而变化
- ID 应该是**不可变的唯一标识符**，一旦分配就不应受其他记录影响
- 正确的做法是使用独立的自增计数器（如 `nextId` 变量），只增不减

```typescript
// ✅ 正确的实现方式
let nextId = 21; // 独立于数组长度的计数器

createProduct(data) {
  const newProduct = {
    ...data,
    id: nextId++,  // 只增不减，保证唯一性
    // ...
  };
}
```

---

## 问题 2：模块级单例在服务端的生命周期

**问：** 在 Next.js App Router 架构下，`mock-api.ts` 这个模块级单例在服务端的生命周期是什么？多个并发请求是否共享同一个 `fakeProducts.records` 数组？这跟 `getQueryClient` 在 `isServer` 时每次都 `new` 一个新实例的设计哲学有什么本质区别？为什么 QueryClient 要每次新建而 mock 数据却用单例？

### 分析结论

**`fakeProducts` 是跨请求共享的单例，而 `QueryClient` 是请求隔离的。这是一个"正确性 vs 便利性"的权衡。**

### 服务端模块生命周期

在 Node.js 中，模块是**单例加载**的：

1. 当 `mock-api.ts` 第一次被 `import` 时，Node.js 执行整个模块
2. `fakeProducts.initialize()` 在模块加载时执行一次
3. 模块导出的 `fakeProducts` 对象被缓存
4. 后续所有 `import { fakeProducts }` 都返回**同一个对象引用**

```
Node.js 进程
├── 模块缓存
│   └── mock-api.ts → { fakeProducts: { records: [...] } }  ← 仅初始化一次
├── 请求 1 (用户 A) → 访问 fakeProducts.records
├── 请求 2 (用户 B) → 访问同一个 fakeProducts.records
└── 请求 3 (用户 C) → 访问同一个 fakeProducts.records
```

### 并发请求的共享问题

**是的，多个并发请求完全共享同一个 `fakeProducts.records` 数组。**

这意味着：

- 用户 A 创建一个产品 → 用户 B 立即能看到
- 用户 A 删除一个产品 → 用户 B 看到的列表也少了一项
- 用户 A 修改一个产品 → 用户 B 刷新后看到修改后的内容
- 服务重启 → 所有修改丢失，恢复到初始 20 条数据

这是**内存状态共享**，类似于一个非常简单的内存数据库。

### 与 QueryClient 设计的本质区别

| 维度 | `fakeProducts` 单例 | `QueryClient` 请求隔离 |
|------|-------------------|---------------------|
| **生命周期** | 进程级（直到服务重启） | 请求级（仅当前 HTTP 请求） |
| **共享范围** | 所有用户、所有请求 | 单个用户、单个请求 |
| **设计目的** | 模拟持久化数据存储 | 缓存当前请求的查询结果 |
| **数据性质** | 业务数据（产品、用户等） | 查询缓存（临时状态） |
| **修改影响** | 影响所有用户 | 仅影响当前请求的渲染 |
| **销毁时机** | 进程退出 | 请求处理完成 |

### 为什么 QueryClient 要每次新建？

QueryClient 每次新建是**安全设计**：

1. **数据隔离**：不同用户的查询缓存不能互相访问，防止数据泄露
2. **状态干净**：每个请求从头开始，不会有之前请求的残留缓存
3. **内存管理**：请求结束后实例被 GC，不会累积内存
4. **并发安全**：多个请求同时操作不同的 QueryClient，没有竞态条件

查看 [query-client.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\lib\query-client.ts#L19-L26) 的设计：

```typescript
export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();  // ✅ 每次新建，请求隔离
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient; // 客户端单例，全局共享缓存
  }
}
```

### 为什么 Mock 数据可以用单例？

`fakeProducts` 用单例是**权衡选择**：

1. **模拟真实后端**：真实数据库也是跨用户共享的，mock 数据模拟了这种行为
2. **开发体验**：在开发时，你创建的产品刷新后还在，符合直觉
3. **成本低廉**：不需要为每个请求创建 20 条假数据，节省内存和 CPU
4. **可接受的风险**：这是 mock 数据，不是真实用户数据，即使有并发问题也不严重
5. **文档明确说明**：文件开头注释 `🛑 Nothing in here has anything to do with Nextjs, it's just a fake database` 明确告知这是假数据库

### 架构启示

这揭示了一个重要的架构原则：

> **数据的生命周期取决于它的用途，而不是它的实现形式。**

- **共享状态**适合表示"真理来源"（数据库、全局配置）
- **隔离状态**适合表示"会话上下文"（请求缓存、用户会话）

在生产环境中，你会用真正的数据库（跨请求共享）替代 `fakeProducts`，而 QueryClient 的请求隔离设计保持不变。

---

## 问题 3：参数解析不一致的真实影响

**问：** `getProducts` 方法解析 `categories` 参数时用的分隔符正则是逗号和句点都支持（`/[.,]/`）。但 `useDataTable` hook 中定义的 `ARRAY_SEPARATOR` 常量只有逗号。如果用户通过 URL 手动构造 `category=Electronics.Furniture` 这样的参数，服务端 `searchParamsCache` 和客户端 `useQueryStates` 解析出的值是否一致？会导致什么具体问题？

### 分析结论

**两端用于构建 Query Key 的值完全一致，不会导致 hydration 不匹配或重复请求。解析正则不一致的唯一后果是：客户端表格的下拉筛选框 UI 回显状态（高亮/选中态）错乱，但底层数据交互完全正常。**

### 关键代码证据

#### 1. 两套独立的 URL 解析逻辑

在 `product-tables/index.tsx` 中，存在**两套独立**的 URL 状态管理：

**第一套（组件顶层，用于 API 请求）** [product-tables/index.tsx](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\features\products\components\product-tables\index.tsx#L14-L29)：

```typescript
// 第 15-21 行：独立的 useQueryStates，category 是纯字符串
const [params] = useQueryStates({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  category: parseAsString,  // ✅ 纯字符串，不分割
  sort: getSortingStateParser(columnIds).withDefault([])
});

// 第 23-29 行：用这个 params 构建 filters，传给 API
const filters = {
  page: params.page,
  limit: params.perPage,
  ...(params.name && { search: params.name }),
  ...(params.category && { categories: params.category }),  // 直接传字符串
  ...(params.sort.length > 0 && { sort: JSON.stringify(params.sort) })
};

// 第 31 行：API 请求已经发起，数据拿到了
const { data } = useSuspenseQuery(productsQueryOptions(filters));
```

**第二套（useDataTable 内部，用于 UI 状态）** [use-data-table.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\hooks\use-data-table.ts#L169-L187)：

```typescript
// 第 174-177 行：category 列有 meta.options，所以用 parseAsArrayOf
if (column.meta?.options) {
  acc[column.id ?? ''] = parseAsArrayOf(parseAsString, ARRAY_SEPARATOR).withOptions(
    queryStateOptions
  );
}

// 第 187 行：独立的 useQueryStates 调用，仅用于表格 UI 状态
const [filterValues, setFilterValues] = useQueryStates(filterParsers);
```

**关键点**：这是两个独立的 `useQueryStates` 调用，都在读取同一个 URL，但用途完全不同。

#### 2. `manualFiltering: true` 的重要性

[use-data-table.ts](file:///e:\solo-code-2\next-shadcn-dashboard-starter\src\hooks\use-data-table.ts#L280-L280) 明确设置：

```typescript
manualFiltering: true  // ✅ 禁用表格本地过滤，所有过滤由 API 完成
```

这意味着 `useDataTable` 内部的 `columnFilters` 状态**只影响 UI 显示**，不影响数据过滤。

### 场景复现：URL = `?category=Electronics.Furniture`

#### 服务端链路（数据获取）

```
URL: ?category=Electronics.Furniture
    ↓
searchParamsCache.get('category') → "Electronics.Furniture" （字符串）
    ↓
传给 getProducts({ categories: "Electronics.Furniture" })
    ↓
fakeProducts 内部 split(/[.,]/) → ["Electronics", "Furniture"]
    ↓
返回匹配这两个分类的产品列表
    ↓
通过 HydrationBoundary 序列化到客户端
```

#### 客户端链路（数据获取）

```
URL: ?category=Electronics.Furniture
    ↓
useQueryStates({ category: parseAsString }) → "Electronics.Furniture" （字符串）
    ↓
filters.categories = "Electronics.Furniture"
    ↓
queryKey: ["products", "list", { categories: "Electronics.Furniture", ... }]
    ↓
与服务端的 queryKey 完全一致 ✅
    ↓
命中缓存，不重新请求
    ↓
数据与服务端完全一致 ✅
```

**结论**：数据获取层完全正常，没有重复请求，没有 hydration mismatch。

#### 客户端链路（UI 状态回显）

```
URL: ?category=Electronics.Furniture
    ↓
useDataTable 内部 useQueryStates({ category: parseAsArrayOf(parseAsString, ',') })
    ↓
"Electronics.Furniture" 中没有逗号 → 解析为 ["Electronics.Furniture"] （1 个元素）
    ↓
作为表格 columnFilters 状态传给下拉筛选组件
    ↓
CATEGORY_OPTIONS 中只有 "Electronics" 和 "Furniture"，没有 "Electronics.Furniture"
    ↓
下拉框中没有任何选项被高亮 ❌
```

**结论**：只有 UI 回显状态错乱，数据本身是正确的。

### 不同 URL 参数的表现

| URL 参数 | 服务端数据结果 | 客户端数据结果 | UI 下拉框回显 |
|---------|-------------|-------------|------------|
| `?category=Electronics,Furniture` | `["Electronics", "Furniture"]` → 多个产品 | 与服务端一致 ✅ | `["Electronics", "Furniture"]` → 两个都高亮 ✅ |
| `?category=Electronics.Furniture` | `["Electronics", "Furniture"]` → 多个产品 | 与服务端一致 ✅ | `["Electronics.Furniture"]` → 无高亮 ❌ |
| `?category=Electronics,Furniture.Books` | `["Electronics", "Furniture", "Books"]` → 多个产品 | 与服务端一致 ✅ | `["Electronics", "Furniture.Books"]` → 部分高亮 ❌ |

### 根本原因

这是一个**职责边界不清晰**的问题：

1. **组件顶层**的 `useQueryStates` 负责数据获取，使用 `parseAsString` 保持原始字符串
2. **`useDataTable` 内部**的 `useQueryStates` 负责 UI 状态，使用 `parseAsArrayOf` 解析数组
3. **`fakeProducts.getProducts`** 内部又做了一次 split 解析，支持两种分隔符
4. 三层解析逻辑没有统一，但由于 `manualFiltering: true`，数据层和 UI 层解耦了，所以只有 UI 出问题

### 修正后的架构启示

> **URL 参数解析应该分层：数据层和 UI 层可以有不同的解析逻辑，但需要明确边界。**

在这个项目中，架构实际上是合理的：

```
URL 原始字符串
    ├─→ 数据层解析（service 层内部）→ 用于数据过滤
    └─→ UI 层解析（useDataTable 内部）→ 用于表格筛选状态回显
```

问题只在于 `fakeProducts` 支持的分隔符（`/[.,]/`）与 UI 层使用的分隔符（`,`）不一致，导致手动构造的特殊 URL 出现 UI 回显问题。但这是 mock 数据层的实现细节，在接入真实后端时会被替换。

### 实际影响评估

| 影响类型 | 是否发生 | 说明 |
|---------|---------|------|
| Hydration 不匹配 | ❌ 不会 | 两端数据完全一致 |
| 重复请求 | ❌ 不会 | Query Key 完全相同 |
| 数据显示错误 | ❌ 不会 | API 返回的数据是正确的 |
| UI 筛选框回显错乱 | ✅ 会 | 手动构造含句点的 URL 时，下拉框高亮不正确 |
| 普通用户影响 | ❌ 几乎没有 | 普通用户通过 UI 操作产生的 URL 只会有逗号 |

**最终结论**：这个解析正则不一致的影响非常有限，仅在用户手动修改 URL 并使用句点分隔符时才会出现 UI 回显问题，不影响核心功能。

---

## 总结

这三个问题揭示了架构设计中的常见陷阱：

| 问题 | 根因 | 修复原则 |
|-----|------|---------|
| ID 重复 | 用可变状态（数组长度）生成不可变标识符 | ID 生成器独立于数据存储 |
| 单例 vs 隔离 | 数据生命周期与用途不匹配 | 共享状态存真理，隔离状态存上下文 |
| 参数解析不一致 | 多处重复实现解析逻辑 | 单一真相来源，统一解析层 |

`mock-api.ts` 作为开发时的模拟数据层，这些问题在生产环境中会被真实的后端和数据库替代，但理解这些设计权衡对于构建健壮的生产级应用至关重要。
