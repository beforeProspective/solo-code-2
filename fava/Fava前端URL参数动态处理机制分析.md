# Fava 前端 URL 参数动态处理机制分析

本文档深入分析 Fava 前端单页应用中 URL 查询参数的动态修改机制，基于 [router.ts](file:///E:/solo-code-2/fava/frontend/src/router.ts) 核心源码。

---

## 一、`charts` 与 `query_string` 参数规避网络加载的实现机制

### 1.1 核心方法 `set_search_param`

[set_search_param](file:///E:/solo-code-2/fava/frontend/src/router.ts#L358-L376) 是前端修改 URL 查询参数的统一入口，其实现包含关键的参数分流逻辑：

```typescript
set_search_param(key: FavaQueryParameters, value: string): void {
  const target = new URL(this.current);
  set_query_param(target, key, value);
  if (target.href !== this.current.href) {
    const load = !(key === "charts" || key === "query_string");
    this.navigate(target, load);
  }
}
```

**分流逻辑分析**：

- **参数比较**：`target.href !== this.current.href` 确保仅在 URL 实际发生变化时才执行导航
- **布尔值控制**：`const load = !(key === "charts" || key === "query_string")`
  - 当 `key` 为 `"charts"` 或 `"query_string"` 时，`load = false`
  - 其他参数（`account`、`conversion`、`filter`、`interval`、`time`）时，`load = true`
- **导航调用**：将 `load` 作为第二个参数传递给 `navigate` 方法

### 1.2 `navigate` 方法的分支执行

[navigate](file:///E:/solo-code-2/fava/frontend/src/router.ts#L309-L318) 方法根据 `load` 参数决定是否触发网络加载：

```typescript
navigate(url: string | URL, load = true): void {
  const target = url instanceof URL ? url : new URL(url, window.location.href);
  if (load) {
    this.#load_url(target).catch(log_error);
  } else {
    window.history.pushState(null, "", target);
    this.current = target;
  }
}
```

**执行路径对比**：

| `load` 值 | 执行路径 | 操作内容 |
|----------|---------|---------|
| `true` | 调用 `#load_url` | 触发异步网络请求，重新加载页面数据 |
| `false` | 本地状态更新 | 仅执行 `pushState` 更新浏览器地址栏，同步内部状态 |

### 1.3 本地更新的具体操作

当 `load = false` 时，仅执行两项操作：

1. **`window.history.pushState(null, "", target)`**
   - 更新浏览器地址栏 URL
   - 向历史记录栈添加一条新记录
   - **不会触发页面刷新**

2. **`this.current = target`**
   - 调用 `current` 的 setter 方法
   - 触发 `current_url` Store 更新，通知所有订阅组件响应式更新

### 1.4 `charts` 参数的使用场景

在 [Chart.svelte](file:///E:/solo-code-2/fava/frontend/src/charts/Chart.svelte#L69-L71) 中，图表显示/隐藏按钮的点击处理：

```svelte
<button
  type="button"
  class="show-charts"
  onclick={() => {
    router.set_search_param("charts", $show_charts ? "false" : "");
  }}
>
```

- `charts` 参数仅控制图表 DOM 元素的显示/隐藏
- 图表数据已在页面初始加载时获取完成
- 状态切换完全在前端完成，无需后端参与

### 1.5 `query_string` 参数的使用场景

在 [Query.svelte](file:///E:/solo-code-2/fava/frontend/src/reports/query/Query.svelte#L43-L68) 中，查询提交时：

```typescript
function submit() {
  const query = query_string;
  // ...
  query_shell_history.add(query);
  router.set_search_param("query_string", query);
  get_query({ query_string: query, ...$filter_params })
    .then(/* ... */);
}
```

- `query_string` 参数仅用于保存查询历史和 URL 分享
- 实际查询结果通过独立的 `get_query` API 调用获取
- 路由层面不触发数据加载，数据获取由组件自行管理

---

## 二、过滤参数变更触发 `load_url` 的必要性分析

### 2.1 过滤参数的分类

Fava 的查询参数分为两类，在 [router.ts](file:///E:/solo-code-2/fava/frontend/src/router.ts#L45-L52) 中定义：

```typescript
type FavaQueryParameters =
  | "account"    // 账户过滤
  | "charts"     // 图表显示（纯前端）
  | "conversion" // 货币转换
  | "filter"     // FQL 过滤表达式
  | "interval"   // 时间间隔
  | "query_string" // 查询字符串（纯前端）
  | "time";      // 时间范围
```

**需要后端加载的参数**：`account`、`conversion`、`filter`、`interval`、`time`

### 2.2 后端数据过滤的本质

过滤参数（`time`、`filter`、`account` 等）的变更是**账本数据过滤条件的变更**，需要从后端重新获取完整的过滤后的数据。

[BackendRoute.render](file:///E:/solo-code-2/fava/frontend/src/reports/route.ts#L55-L78) 中的数据加载逻辑：

```typescript
async render(
  target: HTMLElement,
  url: URL,
  previous?: RenderedReport,
  before_render?: () => void,
): Promise<RenderedReport> {
  // ...
  const get_url = new URL(url);
  get_url.searchParams.set("partial", "true");
  const content = await fetch_text(get_url);
  // ...
  before_render?.();
  target.innerHTML = content;
  read_mtime();
}
```

**后端加载流程**：

1. 构造请求 URL，添加 `partial=true` 参数表示仅获取部分内容
2. 发起网络请求获取后端渲染的 HTML 片段
3. 执行 `before_render` 钩子更新历史记录
4. 替换 `<article>` 元素的 `innerHTML`
5. 刷新账本修改时间（`read_mtime`）

### 2.3 与纯前端选项切换的本质区别

#### 本地纯前端切换（如图表模式）

图表模式状态存储在 [chart.ts](file:///E:/solo-code-2/fava/frontend/src/stores/chart.ts) 的 `localStorageSyncedStore` 中：

```typescript
export const hierarchyChartMode = localStorageSyncedStore<HierarchyChartMode>(
  "hierarchy-chart-mode",
  hierarchy_chart_mode_validator,
  () => "treemap",
  () => [
    ["treemap", _("Treemap")],
    ["sunburst", _("Sunburst")],
    ["icicle", _("Icicle")],
  ],
);
```

**纯前端切换特点**：

| 特性 | 纯前端切换 | 过滤参数变更 |
|------|-----------|-------------|
| **数据来源** | 数据已在内存中 | 需要从后端重新获取 |
| **状态存储** | localStorage / 内存 Store | URL 查询参数 |
| **渲染范围** | 仅重新渲染图表组件 | 重新渲染整个 `<article>` 内容 |
| **网络请求** | 无 | 必须发起网络请求 |
| **历史记录** | 不产生历史记录 | 产生新的历史记录 |

#### 本质区别总结

1. **数据依赖不同**：
   - 纯前端切换：操作的是**已加载数据**的展现形式
   - 过滤参数变更：操作的是**数据加载条件**，需要重新获取数据集

2. **状态持久化方式不同**：
   - 纯前端切换：状态持久化到 localStorage，与 URL 无关
   - 过滤参数变更：状态持久化到 URL，支持浏览器前进/后退和分享

3. **渲染粒度不同**：
   - 纯前端切换：组件级重渲染，粒度细、性能好
   - 过滤参数变更：页面级重渲染，需要完整替换内容

---

## 三、浏览器历史记录栈防堆积的代码层面防范

### 3.1 当前实现的潜在问题

当前 [navigate](file:///E:/solo-code-2/fava/frontend/src/router.ts#L309-L318) 方法在 `load=false` 时的实现：

```typescript
navigate(url: string | URL, load = true): void {
  // ...
  } else {
    window.history.pushState(null, "", target);  // 每次都 push 新记录
    this.current = target;
  }
}
```

**问题分析**：

- 每次调用 `set_search_param("charts", ...)` 或 `set_search_param("query_string", ...)` 都会执行 `pushState`
- 在图表交互场景中，用户可能快速连续点击图表显示/隐藏按钮，或连续修改查询字符串
- 这会导致浏览器历史记录栈中堆积大量无意义的冗余导航记录
- 用户点击"后退"按钮时，需要多次点击才能回到真正的上一页

### 3.2 代码层面的防范方案

#### 方案一：使用 `replaceState` 替代 `pushState`

对于不需要产生独立历史记录的快速操作，使用 `history.replaceState` 替换当前历史条目：

```typescript
// 修改后的 navigate 方法，增加 replace 参数
navigate(url: string | URL, load = true, replace = false): void {
  const target = url instanceof URL ? url : new URL(url, window.location.href);
  if (load) {
    this.#load_url(target).catch(log_error);
  } else {
    if (replace) {
      window.history.replaceState(null, "", target);  // 替换而非添加
    } else {
      window.history.pushState(null, "", target);
    }
    this.current = target;
  }
}

// set_search_param 中对于 charts 和 query_string 使用 replace
set_search_param(key: FavaQueryParameters, value: string): void {
  const target = new URL(this.current);
  set_query_param(target, key, value);
  if (target.href !== this.current.href) {
    const load = !(key === "charts" || key === "query_string");
    const replace = key === "charts" || key === "query_string";  // 新增
    this.navigate(target, load, replace);
  }
}
```

**方案一优点**：
- 简单直接，修改量小
- `replaceState` 不会增加历史记录数量
- URL 仍保持最新状态，支持刷新和分享

#### 方案二：防抖（Debounce）机制

对于连续快速的参数变更，合并为一次历史记录操作：

```typescript
class Router {
  // ...
  #pending_navigation: { target: URL; timer: number } | null = null;

  navigate(url: string | URL, load = true): void {
    const target = url instanceof URL ? url : new URL(url, window.location.href);
    if (load) {
      // 清除待处理的导航
      if (this.#pending_navigation) {
        clearTimeout(this.#pending_navigation.timer);
        this.#pending_navigation = null;
      }
      this.#load_url(target).catch(log_error);
    } else {
      // 防抖处理：300ms 内的连续操作合并为一次 replaceState
      if (this.#pending_navigation) {
        clearTimeout(this.#pending_navigation.timer);
        // 直接替换当前待定目标
        this.#pending_navigation.target = target;
        window.history.replaceState(null, "", target);
      } else {
        // 首次操作使用 pushState
        window.history.pushState(null, "", target);
      }
      this.current = target;
      
      // 设置定时器，300ms 后清除待定状态
      this.#pending_navigation = {
        target,
        timer: window.setTimeout(() => {
          this.#pending_navigation = null;
        }, 300),
      };
    }
  }
}
```

**方案二优点**：
- 首次操作产生历史记录（符合用户直觉）
- 300ms 内的连续操作仅更新 URL，不新增历史记录
- 用户停顿超过 300ms 后的再次操作会产生新记录

#### 方案三：检测连续相似导航

通过 Navigation API 检测历史记录栈，对相似的连续导航进行合并：

```typescript
navigate(url: string | URL, load = true): void {
  const target = url instanceof URL ? url : new URL(url, window.location.href);
  if (load) {
    this.#load_url(target).catch(log_error);
  } else {
    // 检查前一条历史记录是否也是同类参数变更
    if (navigation_api?.currentEntry != null && navigation_api.canGoBack) {
      const entries = navigation_api.entries();
      const prevEntry = entries[navigation_api.currentEntry.index - 1];
      
      if (prevEntry) {
        const prevUrl = new URL(prevEntry.url);
        const currentUrl = this.current;
        
        // 检查是否仅 charts 或 query_string 参数不同
        const prevParams = new URLSearchParams(prevUrl.search);
        const currParams = new URLSearchParams(currentUrl.search);
        const targetParams = new URLSearchParams(target.search);
        
        // 移除 charts 和 query_string 后比较是否相同
        for (const p of ["charts", "query_string"]) {
          prevParams.delete(p);
          currParams.delete(p);
          targetParams.delete(p);
        }
        
        // 如果其他参数都相同，说明是连续的同类操作，使用 replaceState
        if (prevParams.toString() === currParams.toString() &&
            currParams.toString() === targetParams.toString()) {
          window.history.replaceState(null, "", target);
          this.current = target;
          return;
        }
      }
    }
    
    // 默认行为
    window.history.pushState(null, "", target);
    this.current = target;
  }
}
```

**方案三优点**：
- 基于实际历史记录进行智能判断
- 无论时间间隔如何，只要是连续的同类操作就合并
- 保留了 Navigation API 的使用（代码中已有相关基础）

### 3.3 综合推荐方案

结合三种方案的优点，推荐以下综合实现：

```typescript
class Router {
  // 防抖定时器
  #pending_no_load_nav: { timer: number; lastKey: string | null } | null = null;

  /**
   * Set the URL parameter and push a history state for it if changed.
   *
   * For `charts` and `query_string`, this will not load the target URL.
   */
  set_search_param(key: "charts", value: "false" | ""): void;
  set_search_param(
    key:
      | "account"
      | "conversion"
      | "filter"
      | "interval"
      | "query_string"
      | "time",
    value: string,
  ): void;
  set_search_param(key: FavaQueryParameters, value: string): void {
    const target = new URL(this.current);
    set_query_param(target, key, value);
    if (target.href !== this.current.href) {
      const load = !(key === "charts" || key === "query_string");
      this.#navigate_with_history_control(target, load, key);
    }
  }

  /**
   * 带有历史记录控制的导航方法
   * @param key - 当前变更的参数名，用于判断是否需要防抖合并
   */
  #navigate_with_history_control(
    target: URL,
    load: boolean,
    key: FavaQueryParameters,
  ): void {
    if (load) {
      // 需要加载的操作，清除待处理状态并正常导航
      if (this.#pending_no_load_nav) {
        clearTimeout(this.#pending_no_load_nav.timer);
        this.#pending_no_load_nav = null;
      }
      this.#load_url(target).catch(log_error);
    } else {
      const isSameKeyAsPending =
        this.#pending_no_load_nav?.lastKey === key;
      const isSameKeyFamily =
        (key === "charts" || key === "query_string") &&
        (this.#pending_no_load_nav?.lastKey === "charts" ||
          this.#pending_no_load_nav?.lastKey === "query_string");

      if (isSameKeyAsPending || isSameKeyFamily) {
        // 同类连续操作，使用 replaceState
        clearTimeout(this.#pending_no_load_nav.timer);
        window.history.replaceState(null, "", target);
      } else {
        // 首次或不同类操作，使用 pushState
        window.history.pushState(null, "", target);
      }

      this.current = target;

      // 设置防抖定时器
      this.#pending_no_load_nav = {
        timer: window.setTimeout(() => {
          this.#pending_no_load_nav = null;
        }, 500),
        lastKey: key,
      };
    }
  }
}
```

**综合方案特点**：

1. **智能合并**：500ms 内连续修改 `charts` 或 `query_string` 时，使用 `replaceState` 替代 `pushState`，避免历史记录堆积
2. **操作区分**：不同类型的无加载参数变更（如先改 `charts` 再改 `query_string`）视为独立操作，保留历史记录
3. **边界处理**：一旦触发需要加载的导航（如修改 `time` 参数），立即清除待定状态，避免状态混乱
4. **向后兼容**：不改变现有 API，仅内部实现优化

---

## 总结

Fava 的 URL 参数动态处理机制体现了清晰的关注点分离设计：

1. **参数分流策略**：通过 `set_search_param` 中的布尔值控制，将参数分为"纯前端状态型"（`charts`、`query_string`）和"后端数据依赖型"（`time`、`filter`、`account` 等），分别采用不同的处理路径

2. **加载必要性区分**：过滤参数的变更意味着账本数据过滤条件的变更，必须通过 `load_url` 重新获取后端数据；而纯前端参数仅需更新 URL 和本地状态，体现了对数据依赖关系的深刻理解

3. **历史记录管理**：当前实现存在连续快速操作导致历史记录堆积的潜在问题，可通过 `replaceState` 替代、防抖机制、连续相似导航检测等方案进行优化，提升用户体验

这些机制共同保证了 Fava 在单页应用模式下既能提供流畅的交互体验，又能正确处理复杂的账本数据过滤需求。
