# Fava 前端 SPA 路由系统核心机制分析

本文档深入分析 Fava 前端单页应用路由系统的三个核心机制，基于 [router.ts](file:///E:/solo-code-2/fava/frontend/src/router.ts) 源码。

---

## 一、链接点击拦截判断逻辑

### 1.1 修饰键状态检查

路由器通过 `is_normal_click` 函数判断点击事件是否为"正常点击"，即需要被 SPA 拦截的点击：

```typescript
const is_normal_click = (event: MouseEvent) =>
  event.button === 0 &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey;
```

**检查条件**：
- **鼠标按键**：必须是左键（`event.button === 0`）
- **无修饰键**：
  - `Alt` 键未按下
  - `Ctrl` 键未按下
  - `Meta` 键（Windows 键 / Command 键）未按下
  - `Shift` 键未按下

### 1.2 超链接元素特征检查

通过 `is_external_link` 函数判断链接是否为外部链接（需要放行）：

```typescript
const is_external_link = (link: HTMLAnchorElement | SVGAElement) =>
  link.hasAttribute("data-remote") ||
  (link instanceof HTMLAnchorElement &&
    (link.host !== window.location.host || !link.protocol.startsWith("http")));
```

**外部链接判定条件**：
- **`data-remote` 属性**：链接显式标记为远程链接
- **Host 不同**：链接的主机名与当前页面主机名不一致
- **非 HTTP 协议**：协议不以 `http` 开头（如 `mailto:`、`ftp:`、`file:` 等）

### 1.3 完整拦截判断流程

在 `#intercept_link_click` 方法中执行完整的判断链条：

```typescript
#intercept_link_click = (event: PointerEvent): void => {
  const link: unknown = get_el(event.target)?.closest("a");
  if (!(link instanceof HTMLAnchorElement || link instanceof SVGAElement)) {
    return;
  }
  if (!is_normal_click(event)) {
    return;
  }
  if (event.defaultPrevented) {
    return;
  }
  if (link.getAttribute("href")?.charAt(0) === "#") {
    return;
  }
  if (is_external_link(link)) {
    return;
  }

  event.preventDefault();
  // 执行 SPA 导航
  this.navigate(href);
};
```

**判断顺序**：
1. **元素类型检查**：点击目标必须是 `<a>` 标签（包括 SVG 中的 `<a>` 元素）
2. **正常点击检查**：调用 `is_normal_click` 验证
3. **事件默认阻止检查**：如果其他代码已调用 `preventDefault()`，则跳过
4. **锚点链接检查**：以 `#` 开头的纯锚点链接放行，交给浏览器原生处理
5. **外部链接检查**：调用 `is_external_link` 验证
6. **拦截执行**：通过所有检查后，调用 `event.preventDefault()` 阻止默认跳转，执行 SPA 导航

---

## 二、中断处理器校验链条与导航阻断

### 2.1 中断处理器注册机制

路由器维护一个 `#interrupt_handlers` 集合，用于注册导航中断检查函数：

```typescript
#interrupt_handlers = new Set<() => string | null>();

add_interrupt_handler(handler: () => string | null): () => void {
  this.#interrupt_handlers.add(handler);
  return () => {
    this.#interrupt_handlers.delete(handler);
  };
}
```

**设计特点**：
- **返回值语义**：处理器返回 `string` 表示需要中断导航（字符串为提示消息），返回 `null` 表示允许导航
- **自动清理**：`add_interrupt_handler` 返回一个清理函数，可直接用于 Svelte 的 `onMount` 钩子
- **集合存储**：使用 `Set` 保证处理器唯一性，避免重复注册

### 2.2 校验链条执行逻辑

`#should_interrupt` 方法按顺序执行所有注册的处理器：

```typescript
#should_interrupt(): string | null {
  for (const handler of this.#interrupt_handlers) {
    const leave_message = handler();
    if (leave_message != null) {
      return leave_message;
    }
  }
  return null;
}
```

**执行机制**：
- **短路求值**：遍历处理器集合，**第一个返回非 null 消息的处理器将终止遍历**
- **优先级**：先注册的处理器具有更高优先级（按插入顺序执行）
- **统一返回**：返回第一个中断消息，或全部通过后返回 `null`

### 2.3 确认框阻断物理重定向

在 `#load_url` 方法中实现导航阻断：

```typescript
async #load_url(url: URL): Promise<void> {
  const leave_message = this.#should_interrupt();
  if (leave_message != null && !window.confirm(leave_message)) {
    return;
  }
  // 继续执行页面加载...
}
```

**阻断流程**：
1. **调用校验**：执行 `#should_interrupt()` 获取中断消息
2. **条件判断**：如果存在中断消息且用户**点击取消**（`window.confirm` 返回 `false`）
3. **提前返回**：直接 `return`，终止后续的 URL 加载和历史记录操作
4. **无状态变更**：由于在 `history.pushState` 之前返回，URL 物理重定向被完全阻断

### 2.4 浏览器刷新/关闭保护

通过 `beforeunload` 事件保护页面刷新或关闭场景：

```typescript
#beforeunload = () => (event: BeforeUnloadEvent) => {
  const leave_message = this.#should_interrupt();
  if (leave_message != null) {
    event.preventDefault();
  }
};
```

**注意**：现代浏览器不支持自定义 `beforeunload` 消息文本，只会显示标准提示框。

---

## 三、Popstate 事件与 URL 状态同步

### 3.1 Popstate 事件处理

浏览器前进/后退操作触发 `popstate` 事件时，路由器执行以下逻辑：

```typescript
#popstate = (): void => {
  const target = new URL(window.location.href);
  const { current } = this;
  if (
    target.pathname !== current.pathname ||
    target.search !== current.search
  ) {
    this.#load_url(target).catch(log_error);
  } else {
    this.current = target;
  }
};
```

**判断逻辑**：
- **目标 URL**：从 `window.location.href` 创建新的 URL 对象（反映浏览器历史状态）
- **当前 URL**：路由器内部维护的 `#current` 状态
- **深度比较**：仅比较 `pathname` 和 `search`，**忽略 hash 变化**
- **分支处理**：
  - **路径/查询变化**：调用 `#load_url` 重新加载页面内容
  - **仅 hash 变化**：仅同步 `current` 状态，不触发重新渲染

### 3.2 URL 状态与 Store 同步

路由器通过 setter 方法实现与全局 Store 的同步：

```typescript
private set current(url: URL) {
  if (this.#current.href !== url.href) {
    this.#current = url;
    current_url.set(url);
  }
}
```

**同步机制**：
- **去重优化**：仅在 URL 实际变化时才更新 Store
- **单向数据流**：路由器是唯一的 URL 状态源，通过 `current_url.set()` 通知所有订阅者
- **响应式更新**：Svelte 组件订阅 `current_url` Store 后自动响应 URL 变化

### 3.3 页面重新渲染流程

`#load_url` 调用 `#render_route` 完成页面内容更新：

```typescript
async #render_route(url: URL, before_render?: () => void): Promise<void> {
  const previous = this.#current_report;
  const relative_path = getUrlPath(url).unwrap();
  const report = relative_path.slice(0, relative_path.indexOf("/"));
  const route =
    this.#frontend_routes.find((r) => r.report === report) ?? backend_route;

  try {
    this.#current_report = await loading_state.await(
      route.render(this.#article, url, previous, before_render),
    );
  } catch (error: unknown) {
    // 错误处理...
  }
  raw_page_title.set(this.#current_report.title);
}
```

**渲染流程**：
1. **路由解析**：从 URL 路径提取报表名称
2. **路由匹配**：优先匹配前端路由，不匹配则回退到后端路由
3. **异步渲染**：调用 `route.render()` 更新 `<article>` 元素内容
4. **状态更新**：更新 `#current_report` 和页面标题 Store
5. **钩子执行**：`before_render` 回调在渲染前执行历史记录推送和 URL 同步

### 3.4 历史记录推送时机

历史记录推送在 `before_render` 钩子中执行：

```typescript
const before_render = is_reload
  ? undefined
  : () => {
      this.#article.scroll(0, 0);
      if (url.href !== window.location.href) {
        window.history.pushState(null, "", url);
      }
      this.current = url;
    };
```

**设计意图**：
- **滚动复位**：页面切换时滚动到顶部
- **条件推送**：仅当 URL 与当前浏览器地址不同时才推送历史
- **状态同步**：推送历史后立即同步路由器内部状态和 Store
- **时机选择**：在数据加载完成后、渲染执行前推送，保证 UI 与 URL 一致

---

## 总结

Fava 的路由系统通过三层核心机制实现了流畅的 SPA 体验：

1. **精准拦截**：通过修饰键、Host 名、协议等多重判断实现智能链接拦截
2. **安全导航**：可插拔的中断处理器链条配合确认框，有效防止数据丢失
3. **状态同步**：popstate 事件与 Store 的深度集成确保浏览器历史与应用状态一致

这些机制共同保证了 Fava 在单页应用模式下既能提供流畅的用户体验，又能维持良好的可维护性和数据安全性。
