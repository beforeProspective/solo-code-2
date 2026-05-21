# 看板模块 Zustand + dnd-kit 水合不匹配分析

本文基于以下真实源码进行分析：

- 状态管理模块：[store.ts](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/features/kanban/utils/store.ts)
- 看板 UI 模块：[kanban-board.tsx](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/features/kanban/components/kanban-board.tsx)
- Kanban 拖拽组件：[kanban.tsx](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/components/ui/kanban.tsx)

---

## 1. 预渲染与水合阶段各自拿到的数据

### 1.1 服务端预渲染（SSR / RSC HTML 生成）阶段

`store.ts` 通过 `create<KanbanState>()(...)` 直接在模块作用域初始化 Zustand store，`columns` 的初始值是硬编码的 `initialColumns`：

```
backlog:   [id:1,2,3,9]
inProgress: [id:4,5,10]
done:      [id:6,7,8]
```

关键点：**服务端没有 `window.localStorage`，`persist` 中间件的 `storage` 在 Node 环境下不可用**。`zustand/middleware` 内部的 `createJSONStorage(() => localStorage)` 在 SSR 时会：

- 要么抛出（取决于写法）
- 要么回退为 `getItem` 始终返回 `null`，`setItem` 为 no-op

因此无论是未启用 `persist` 还是启用了 `persist`，**SSR 阶段 `columns` 一律等于 `initialColumns`**。

所以 `<KanbanBoard>` 在服务器上渲染出来的 HTML 中：

- `TaskColumn` 实例顺序：`backlog` → `inProgress` → `done`
- 各列内卡片数量：`4 / 3 / 3`
- 每个 `TaskCard` 渲染的 `title`、`priority`、`assignee`、`dueDate` 均为 `initialColumns` 中定义的静态值

### 1.2 客户端水合（Hydration）阶段

#### Zustand `persist` 的真实执行时序

`zustand/middleware` 中 `persist` 的核心逻辑是在 `createStore` 阶段**同步**执行的（使用 `createJSONStorage(() => localStorage)`）：

```ts
// zustand/middleware/persist.ts 简化示意
const state = (set, get, store) => {
  const stored = hasLocalStorage ? storage.getItem(name) : null;
  if (stored) {
    const parsed = JSON.parse(stored);
    // 同步调用 set，把持久化数据合并进 store
    set({ ...parsed, ...userInitial });
    if (config.onRehydrateStorage) config.onRehydrateStorage()(get());
  }
  return userInitial;
};
```

而 `store.ts` 是 **模块顶层初始化** 的（`export const useTaskStore = create...`），因此在 Next.js 的 ES Module 加载阶段——**远早于 `hydrateRoot` 执行**——Zustand 就已经完成了对 `localStorage` 的读取和 `set()` 合并。

换句话说：

- `columns` 的最终值在 `import { useTaskStore } from '../utils/store'` 语句执行完毕时就已经确定；
- `onRehydrateStorage` 回调也在**同一同步调用栈**内触发；
- React 在调用 `useSyncExternalStore` 读取 store 时，读到的是**已恢复后的 `columns`**。

#### 首次同步渲染时 store 的实际值

假设用户上一次会话中把任务 `id:1（Migrate to Stripe billing API）` 从 `backlog` 拖拽到了 `inProgress`，那么 `localStorage` 中快照为：

```
backlog:   [id:2,3,9]
inProgress: [id:1,4,5,10]
done:      [id:6,7,8]
```

在 React 首次执行 `<KanbanBoard>` 组件函数时，store 的状态为：

| 字段 | 值 |
|---|---|
| `columns` | **持久化快照**（id:1 在 `inProgress`） |
| `hasHydrated`（若按原 3.2 示例通过 `onRehydrateStorage` 设置） | **`true`**（因为在 store 初始化同步阶段已触发） |

而服务端返回的 HTML 仍然是基于 `initialColumns` 渲染的（SSR 无 `localStorage`）。因此：

- 服务端 HTML：`backlog=[1,2,3,9]` / `inProgress=[4,5,10]`
- 客户端 VDOM（首次 render）：`backlog=[2,3,9]` / `inProgress=[1,4,5,10]`

**二者从 React 首次同步渲染开始就已经不一致**，hydration mismatch 不是"先一致、后续更新触发"，而是"从第一帧起就错位"。

#### 为什么此前的"异步恢复"描述是错的

此前文档假设"`persist` 是异步/延后恢复的"，这一假设与 `createJSONStorage(localStorage)` 的实现不符。`localStorage.getItem` 本身是同步 API，Zustand 没有为其引入异步流程；`onRehydrateStorage` 的回调也是同步在 `set()` 之后立即调用的。因此不存在"水合瞬间读旧值、微任务后读新值"的窗口——客户端从第一帧起就持有持久化数据，与服务端 HTML 直接冲突。

#### 修正后的时序表

| 阶段 | `columns` 数据 | 来源 |
|---|---|---|
| SSR 预渲染 | `initialColumns`（id:1 在 `backlog`） | 源码常量（`localStorage` 不可用） |
| 客户端模块加载 | 同步读取 `localStorage`，调用 `set()` | `persist` 中间件在 `createStore` 中执行 |
| 首次同步水合渲染 | **持久化快照**（id:1 已在 `inProgress`） | 已恢复的 store |
| 首帧之后 | 持久化快照（不变） | Zustand 订阅与 `setState` 保持 |

**结论：hydration mismatch 在首次同步渲染时就已经发生，与后续的 re-render 无关。**

---

## 2. 水合不匹配如何破坏 DOM 并导致崩溃

React 的水合假设：**"客户端第一次 render 产生的 Virtual DOM 必须与服务端返回的 HTML 严格一致"**。一旦违背这个假设，会沿着以下路径破坏页面：

### 2.1 文本节点错位

`initialColumns` 中 `inProgress` 第一张卡片是 `Refactor notification service`（id:4）；而持久化后 `inProgress` 第一张是 `Migrate to Stripe billing API`（id:1）。React 对 `TaskColumn` 内部列表做 diff 时：

- SSR DOM 的第 1 个 `<article>` 文本：`Refactor notification service`
- 客户端 Virtual DOM 第 1 个 `<article>` 文本：`Migrate to Stripe billing API`

React 会抛出：

```
Warning: Text content did not match. Server: "Refactor notification service" Client: "Migrate to Stripe billing API"
```

更严重的是：dnd-kit 会给每个可拖拽项注入 `data-id`、`role="button"`、`tabIndex` 以及由 `useSortable` 计算出的 `transform` 内联样式。一旦文本节点错位，**这些属性会被绑定到错误的 DOM 节点上**，表现为：

- 点 `Card A` 却拖起 `Card B`
- `aria-pressed`、`aria-describedby` 指向错误的 id，读屏器完全错乱
- `transform` 内联样式作用在错误元素上，卡片位置跳动

### 2.2 列表长度不一致导致 DOM 结构错位

`backlog` 在 SSR 中渲染 4 个卡片（id:1,2,3,9），在持久化版本中只剩 3 个（id:2,3,9）。React 水合期间不会删除 DOM，只会尝试复用已有节点并将多余节点标记为"未管理"，结果：

- 第 4 个卡片节点留在 DOM 中但 React 不再跟踪它 → **"幽灵节点"**
- 该节点无法响应 dnd-kit 的指针事件，因为没有绑定到新的 `DndContext` 中的 `DragOverlay`
- 拖拽时 dnd-kit 的 `PointerSensor` 会在 `document.elementFromPoint` 处拿到未被 React 管理的节点，抛出 `Cannot read properties of undefined (reading 'data')` 或类似错误，使整个拖拽上下文崩溃

### 2.3 dnd-kit 内部状态与 DOM 不一致

`@dnd-kit/core` 内部通过 `context.data.draggables` 维护 `{ id: { node, ... } }` 映射。React 在水合时以"客户端 VDOM + 服务端 DOM"的混合形态挂载：

1. `Kanban`（即 `DndContext`）**从第一帧起就以持久化后的 `columns` 渲染**；
2. 每个 `TaskCard` 中的 `useSortable` 基于持久化后的 id 注册；
3. 但真实 DOM 仍然是 SSR 时期的 id 顺序、文本、节点数。

后果：

- `DndContext.data.draggables` 的 id→node 映射与真实 DOM 不一致；
- 拖拽时 `collisionDetection` 使用的 `rect` 是错位节点的 rect，命中测试失败；
- `DragOverlay` 绑定的 `activeId` 找不到对应项，`Overlay` 渲染空；
- 控制台出现 `Maximum update depth exceeded`：dnd-kit 每次指针移动触发的 `setState` 与 React 水合后的 DOM 错位循环；
- 在 Next.js 的开发模式下，**整个页面会因 hydration mismatch 被自动刷新（HMR 重试）**，形成"刷新 → 崩溃 → 再刷新"的死循环。

### 2.4 典型的最终崩溃路径

```
SSR HTML:          backlog=[1,2,3,9]  inProgress=[4,5,10]
模块加载:            persist 同步读 localStorage 并 set()
首次客户端 render:   backlog=[2,3,9]    inProgress=[1,4,5,10]
                    ↑ 与 SSR HTML 从第一帧就不一致
→ React hydrateRoot 对比 VDOM 与 SSR DOM
→ 发现文本 / 长度 / 节点顺序均不匹配
→ Warning: Text content did not match.
         Server: "Refactor notification service"
         Client: "Migrate to Stripe billing API"
→ React "尽力而为" 复用 DOM，产生错位的绑定
→ dnd-kit 已基于错位的 DOM 注册 draggables 映射
→ PointerSensor 在 pointerdown 触发 dragStart，取到的 node 与
  DndContext.data.draggables[id] 不一致
→ "Uncaught TypeError: Cannot read properties of undefined (reading 'id')"
→ React ErrorBoundary 未捕获 → 整页白屏
```

**关键差异：不存在"先 hydrate 一次 OK、再 hydrate 一次错位"的两阶段过程。客户端从首次渲染的第一帧起就已经错位，React 的 hydrate 一次性失败。**

---

## 3. 最佳实践：在组件挂载阶段做隔离

基于 1.2 节修正后的时序认知，原来的 3.1 / 3.2 策略需要重新评估。核心目标不变：**SSR 与首次客户端渲染看到的数据必须完全一致，持久化数据必须在首次渲染"之后"才接入 UI。**

### 3.1 方案评估：`useEffect` + `isHydrated` 标志（可行，但需避免在 SSR 分支读 store）

原 3.1 方案的核心是：
- SSR + 首次客户端同步 render：用 `useTaskStore.getState().columns` 渲染静态列，不挂载 `DndContext`；
- `useEffect` 触发后：切换到 `columns`（订阅版），挂载 `Kanban`。

**问题：`useTaskStore.getState()` 在客户端已经是持久化后的数据。**

- SSR 调用 `getState()` → `initialColumns`（服务端无 localStorage）
- 客户端首次 render 调用 `getState()` → **持久化快照**

因此该方案的 "静态列" 分支在 SSR 与客户端之间仍然会**文本不一致**，产生 hydration warning。

**修正：** 在 `isHydrated === false` 分支中不要读 store，而是直接使用与 SSR 同源的 `initialColumns` 常量渲染：

```tsx
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Kanban, KanbanBoard as KanbanBoardPrimitive, KanbanOverlay } from '@/components/ui/kanban';
import { useTaskStore, initialColumns } from '../utils/store';
import { TaskColumn } from './board-column';
import { TaskCard } from './task-card';
import { createRestrictToContainer } from '../utils/restrict-to-container';

export function KanbanBoard() {
  const { columns, setColumns } = useTaskStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const restrictToBoard = useCallback(
    createRestrictToContainer(() => containerRef.current),
    []
  );

  if (!isHydrated) {
    return (
      <div ref={containerRef} className="w-full overflow-x-auto rounded-md pb-4">
        <div className="flex flex-col items-start gap-4 md:flex-row">
          {Object.entries(initialColumns).map(([columnValue, tasks]) => (
            <TaskColumn key={columnValue} value={columnValue} tasks={tasks} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <Kanban
        value={columns}
        onValueChange={setColumns}
        getItemValue={(item) => item.id}
        modifiers={[restrictToBoard]}
        autoScroll={false}
      >
        <div className="w-full overflow-x-auto rounded-md pb-4">
          <KanbanBoardPrimitive className="flex flex-col items-start gap-4 md:flex-row">
            {Object.entries(columns).map(([columnValue, tasks]) => (
              <TaskColumn key={columnValue} value={columnValue} tasks={tasks} />
            ))}
          </KanbanBoardPrimitive>
        </div>
        <KanbanOverlay>
          {({ value, variant }) => {
            if (variant === 'column') {
              const tasks = columns[value] ?? [];
              return <TaskColumn value={value} tasks={tasks} />;
            }
            const task = Object.values(columns).flat().find((t) => t.id === value);
            if (!task) return null;
            return <TaskCard task={task} />;
          }}
        </KanbanOverlay>
      </Kanban>
    </div>
  );
}
```

关键点：

1. **首次渲染（SSR + 首次客户端同步）**：直接使用 `initialColumns` 常量渲染不含 `DndContext` 的静态列，与 SSR HTML 严格对齐。
2. **`useEffect` 触发后**：`isHydrated` 变为 `true`，读取 store 的 `columns`，挂载 `Kanban`，此时 dnd-kit 从一开始就看到持久化后的数据。
3. **绝对不要在 `!isHydrated` 分支中调用 `useTaskStore.getState()`**，它在客户端已经是持久化后的值，读了反而破坏对齐。

### 3.2 方案评估：在 Zustand 层暴露 `hasHydrated` 状态（不可行）

原 3.2 方案的核心是：
- store 初始化时 `hasHydrated: false`；
- `onRehydrateStorage` 回调中 `setHasHydrated(true)`；
- 组件 `if (!hasHydrated) return <SkeletonBoard />`。

**问题：Zustand persist 的恢复在模块加载阶段同步完成。**

从 1.2 节的分析可知：

- `createStore` 调用栈内会同步读取 `localStorage` 并 `set()`；
- `onRehydrateStorage` 回调在**同一同步调用栈**内立即执行；
- store 的 `hasHydrated` 在 `import { useTaskStore }` 完成时就已经是 `true`。

因此 React 在首次 render 时读取 `hasHydrated` **已经是 `true`**，`columns` **已经是持久化快照**：

```tsx
const { columns, hasHydrated } = useTaskStore();
// 首次 render: hasHydrated === true, columns === 持久化快照
// → 直接走真实 UI 分支
// → DndContext 挂载时立刻以持久化数据渲染
// → 与 SSR HTML 从第一帧就错位
```

换句话说，`hasHydrated` 标志**永远在首次 render 之前就已经是 true**，失去了"延迟挂载"的语义。`if (!hasHydrated)` 这个分支在客户端根本不会被执行。

**结论：3.2 方案无法阻止与服务端静态 HTML 的水合冲突。**

**为什么"在 store 里加未就绪态"也不行：**

即便把 store 的初始值设计成可区分的未就绪态（例如 `columns: null`），`persist` 中间件在 `createStore` 时仍会用 `null` 合并持久化数据，最终 `columns` 在模块加载完成时就已经是非 null 的持久化值，与 `initialColumns` 错位依然存在。

**唯一可靠的"隔离层"是在 React 的挂载边界（`useEffect` 或 `useSyncExternalStore` 的 `getServerSnapshot`）做延迟，而不是试图在 store 初始化阶段完成。**

### 3.3 使用 `dynamic` + `ssr: false` 彻底规避

对于整个看板页面，如果确认不需要 SEO，可以在 page 层：

```tsx
import dynamic from 'next/dynamic';

const KanbanBoard = dynamic(
  () => import('@/features/kanban/components/kanban-board').then((m) => m.KanbanBoard),
  { ssr: false, loading: () => <SkeletonBoard /> }
);
```

代价：首屏 SEO 丢失，需要加载 JS 后才有内容。适合作为最极端场景的兜底，**与 3.1 组合使用时优先级更低**。

### 3.4 避免在水合前触发任何 store 写入

在 [store.ts](file:///e:/solo-code-2/next-shadcn-dashboard-starter/src/features/kanban/utils/store.ts) 的 `addTask`、`setColumns` 中增加守卫：

```ts
const setColumns = (columns) => {
  if (typeof window === 'undefined') return;
  set({ columns });
};
```

防止 SSR 期间被 RSC 或 layout 意外触发写入，污染初始状态。

---

## 小结

| 阶段 | 数据来源 | 是否与 SSR 一致 |
|---|---|---|
| SSR | `initialColumns` | 基准 |
| 客户端模块加载 | 同步从 `localStorage` 恢复 | — |
| 客户端首次同步 render | **持久化快照** | ❌ **与 SSR 不一致（从第一帧起错位）** |

**修正后的核心防御策略：**

1. **不可行方案**：在 Zustand store 中通过 `hasHydrated` + `onRehydrateStorage` 标记恢复状态——因为它在模块加载时同步被置为 `true`，客户端首次 render 读到的已经是 `true` + 持久化快照。
2. **可行方案**：在组件层用 `useEffect` + `isHydrated` 做延迟挂载，并在 SSR 分支中**直接使用 `initialColumns` 常量**渲染静态 UI，避免任何对 store 的读取；`useEffect` 触发后再切换到 store 数据并挂载 `DndContext`。
3. **兜底方案**：`dynamic(..., { ssr: false })` 彻底禁用 SSR。

只有在组件挂载边界上做隔离，才能保证 dnd-kit 的 id / rect / draggables 映射与真实 DOM 一致，从根源上消除水合不匹配引发的 DOM 错位和拖拽崩溃。
