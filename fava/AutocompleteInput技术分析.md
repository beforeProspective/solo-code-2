# Fava 前端自动补全组件技术分析报告

## 1. 自动补全数据源与实时更新机制

### 1.1 全局 Svelte Store 架构

AutocompleteInput.svelte 组件本身**不直接**从全局 Store 获取数据，而是通过 `suggestions` 属性接收外部传入的补全词条数组。实际的数据源来自 [stores/index.ts](file:///e:/solo-code-2/fava/frontend/src/stores/index.ts) 中定义的一系列派生 Store。

**核心数据 Store 结构：**

| Store 名称     | 数据类型 | 用途                     |
|---------------|----------|--------------------------|
| `accounts`    | string[] | 账户名称列表             |
| `currencies`  | string[] | 货币/商品列表            |
| `links`       | string[] | 链接标签列表             |
| `payees`      | string[] | 收款人列表               |
| `tags`        | string[] | 标签列表                 |

所有这些 Store 都派生自核心的 `ledgerData` writable Store：

```typescript
// stores/index.ts#L10
export const ledgerData = writable<LedgerData>();

// 使用 derived_array 进行浅比较优化的派生
export const accounts = derived_array(ledgerData, (v) => v.accounts);
export const currencies = derived_array(ledgerData, (v) => v.currencies);
export const links = derived_array(ledgerData, (v) => v.links);
export const payees = derived_array(ledgerData, (v) => v.payees);
export const tags = derived_array(ledgerData, (v) => v.tags);
```

**数据流向示例**（以 AccountSelector.svelte 为例）：
- [sidebar/AccountSelector.svelte](file:///e:/solo-code-2/fava/frontend/src/sidebar/AccountSelector.svelte#L6) 从 Store 订阅 `$accounts`
- 将其作为 `suggestions` 属性传递给 AutocompleteInput 组件

### 1.2 后台账本数据实时更新机制

数据更新采用**轮询 + mtime 变更检测**的混合策略：

#### 步骤1：定期轮询检查变更
在 [app.ts#L98-L100](file:///e:/solo-code-2/fava/frontend/src/app.ts#L98-L100) 中，每5秒调用一次 `get_changed()` 接口：

```typescript
setInterval(pollForChanges, 5000);
```

#### 步骤2：mtime 变更检测
API 响应中携带的 `mtime` 会触发 `ledger_mtime` Store 更新，见 [api/index.ts#L131-L133](file:///e:/solo-code-2/fava/frontend/src/api/index.ts#L131-L133)：

```typescript
if (typeof json.mtime === "string") {
  set_mtime(json.mtime);
}
```

#### 步骤3：触发数据重新加载
在 [app.ts#L112-L119](file:///e:/solo-code-2/fava/frontend/src/app.ts#L112-L119) 中订阅 `ledger_mtime` 变更，触发 `onChanges()` 进行全量数据更新：

```typescript
ledger_mtime.subscribe(() => {
  if (initial_mtime) {
    initial_mtime = false;
    return;
  }
  has_changes.set(true);
  onChanges();
});
```

#### 步骤4：全量拉取最新数据
`onChanges()` 函数调用 `get_ledger_data()` 获取完整账本数据并更新 Store，见 [app.ts#L70-L87](file:///e:/solo-code-2/fava/frontend/src/app.ts#L70-L87)：

```typescript
function onChanges() {
  get_ledger_data()
    .then((v) => {
      ledgerData.set(v);  // 更新核心 Store，触发所有派生 Store 更新
    })
    .catch(...);
  // ...
}
```

#### 增量优化机制
为避免不必要的更新，`derived_array` 工具函数在 [lib/store.ts#L14-L30](file:///e:/solo-code-2/fava/frontend/src/lib/store.ts#L14-L30) 中实现了**浅比较优化**：

```typescript
export function derived_array<S, T extends StrictEquality>(
  store: Readable<S>,
  getter: (values: S) => readonly T[],
): Readable<readonly T[]> {
  let val: readonly T[] = [];
  return derived(store, (store_val, set) => {
    const newVal = getter(store_val);
    if (!shallow_equal(val, newVal)) {  // 只有数组内容真正变化时才触发更新
      set(newVal);
      val = newVal;
    }
  }, val);
}
```

---

## 2. 下拉补全窗口位置计算机制

### 2.1 AutocompleteInput.svelte 的定位策略

在 [AutocompleteInput.svelte#L217-L234](file:///e:/solo-code-2/fava/frontend/src/AutocompleteInput.svelte#L217-L234) 中采用 CSS 相对+绝对定位方案：

```css
span {
  position: relative;    /* 父容器相对定位，作为下拉列表的定位参照 */
  display: inline-block;
}

ul {
  position: var(--autocomplete-list-position, absolute);  /* 默认 absolute */
  z-index: var(--z-index-autocomplete);
  overflow: hidden auto;
  background-color: var(--background);
  border: 1px solid var(--border-darker);
  box-shadow: var(--box-shadow-dropdown);
}
```

**定位原理：**
1. 外层 `<span>` 设置 `position: relative`，创建定位上下文
2. 内层 `<ul>` 下拉列表使用 `position: absolute`，相对于父容器定位
3. 由于 CSS 流布局特性，下拉列表自然出现在输入框正下方

### 2.2 特殊场景的定位适配

在 [sidebar/AccountSelector.svelte#L34-L35](file:///e:/solo-code-2/fava/frontend/src/sidebar/AccountSelector.svelte#L34-L35) 中，通过 CSS 变量切换为 `fixed` 定位以适应侧边栏场景：

```css
li {
  --autocomplete-list-position: fixed;  /* 固定定位，避免被侧边栏 overflow 裁剪 */
}
```

### 2.3 CodeMirror 编辑器中的自动补全定位

在 CodeMirror 集成场景中，位置计算由 `@codemirror/autocomplete` 库内部处理，见 [codemirror/base-extensions.ts#L41](file:///e:/solo-code-2/fava/frontend/src/codemirror/base-extensions.ts#L41)：

```typescript
export const base_extensions = [
  // ...
  autocompletion(),  // CodeMirror 内置自动补全扩展
  // ...
];
```

**CodeMirror 自动补全的定位逻辑（内部实现）：**
1. 通过 `EditorView.coordsAtPos()` 获取光标在视口中的像素坐标
2. 计算 tooltip 面板的理想位置（通常在光标下方）
3. 检测视口边界，自动调整位置（如空间不足则显示在光标上方）
4. 监听编辑器滚动事件，实时更新 tooltip 位置

在 [codemirror/beancount-autocomplete.ts](file:///e:/solo-code-2/fava/frontend/src/codemirror/beancount-autocomplete.ts) 中，补全数据源通过 `store_get()` 实时读取 Store 中的最新数据：

```typescript
import { get as store_get } from "svelte/store";
import { accounts, currencies, links, payees, tags } from "../stores/index.ts";

export const beancount_completion: CompletionSource = (context) => {
  const tag = context.matchBefore(/#[A-Za-z0-9\-_/.]*/);
  if (tag) {
    return {
      options: opts(store_get(tags)),  // 实时从 Store 获取标签列表
      from: tag.from + 1,
      validFor: /\S+/,
    };
  }
  // ... 其他补全逻辑
};
```

---

## 3. 性能优化策略：防抖与缓存

### 3.1 Svelte 5 响应式系统的自动缓存

在 [AutocompleteInput.svelte#L81-L94](file:///e:/solo-code-2/fava/frontend/src/AutocompleteInput.svelte#L81-L94) 中，使用 `$derived.by` 进行过滤计算：

```typescript
let filteredSuggestions: {
  suggestion: string;
  fuzzywrapped: FuzzyWrappedText;
}[] = $derived.by(() => {
  const filtered = fuzzyfilter(extractedValue, suggestions)
    .slice(0, 30)  // 限制最多显示30条结果
    .map((suggestion) => ({
      suggestion,
      fuzzywrapped: fuzzywrap(extractedValue, suggestion),
    }));
  return filtered.length === 1 && filtered[0]?.suggestion === extractedValue
    ? []
    : filtered;
});
```

**Svelte 5 的 `$derived` 特性：**
- **自动依赖追踪**：仅当 `extractedValue` 或 `suggestions` 变化时重新计算
- **计算结果缓存**：相同输入下直接返回缓存结果
- **惰性求值**：只有当结果被使用时才执行计算

### 3.2 搜索结果数量限制

通过 `.slice(0, 30)` 限制最多显示 30 条匹配结果，避免：
- 渲染大量 DOM 元素导致的卡顿
- 用户在长列表中滚动选择的体验问题

### 3.3 Fuzzy 匹配算法优化

在 [lib/fuzzy.ts](file:///e:/solo-code-2/fava/frontend/src/lib/fuzzy.ts) 中实现的模糊匹配算法：

#### fuzzytest 函数（[fuzzy.ts#L11-L33](file:///e:/solo-code-2/fava/frontend/src/lib/fuzzy.ts#L11-L33)）
```typescript
export function fuzzytest(pattern: string, text: string): number {
  const casesensitive = pattern === pattern.toLowerCase();
  const exact = casesensitive
    ? text.toLowerCase().indexOf(pattern)
    : text.indexOf(pattern);
  if (exact > -1) {
    return pattern.length ** 2;  // 精确子串匹配优先
  }
  // ... 后续的非连续字符匹配逻辑
}
```

**优化点：**
1. **快速路径优先**：先检查精确子串匹配，成功则直接返回高分
2. **单次遍历**：非连续匹配只需一次线性扫描，时间复杂度 O(n)
3. **大小写智能处理**：小写模式自动不区分大小写

#### fuzzyfilter 函数（[fuzzy.ts#L38-L50](file:///e:/solo-code-2/fava/frontend/src/lib/fuzzy.ts#L38-L50)）
```typescript
export function fuzzyfilter(
  pattern: string,
  suggestions: readonly string[],
): readonly string[] {
  if (!pattern) {
    return suggestions;  // 空模式直接返回，避免无意义计算
  }
  return suggestions
    .map((s): [string, number] => [s, fuzzytest(pattern, s)])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])  // 按匹配度排序
    .map(([s]) => s);
}
```

**优化点：**
- **空模式短路**：用户未输入时直接返回全部建议，跳过计算
- **单次遍历计算分数**，避免多次遍历数组

### 3.4 关于"拼音模糊匹配"的说明

代码中**并未实现拼音模糊匹配**功能。当前的 fuzzy 匹配算法：
- 支持子串匹配（如 "cash" 匹配 "Expenses:Cash"）
- 支持非连续字符匹配（如 "ec" 匹配 "Expenses:Cash"）
- 不支持拼音首字母匹配（如 "xj" 不能匹配 "现金"）

### 3.5 防抖机制的实现状态

**代码库中没有显式的 debounce 实现。** 实际依赖的是：

1. **浏览器输入事件的自然频率限制** - 键盘输入本身有物理间隔
2. **Svelte 5 的批处理更新** - 响应式系统会自动批处理同步更新
3. **现代 JS 引擎的执行速度** - 对于上万条数据的 fuzzy 过滤通常在 10ms 内完成

**对于极端大数据量（10万+账户）的潜在优化建议：**
- 可以添加 `setTimeout` + `clearTimeout` 实现 50-100ms 的输入防抖
- 建立前缀索引或 trie 树结构加速匹配
- 使用 Web Worker 将匹配计算移至后台线程

---

## 总结

| 技术点 | 实现方式 | 关键代码位置 |
|--------|----------|-------------|
| 数据源 | 全局 Store `ledgerData` 派生 | [stores/index.ts](file:///e:/solo-code-2/fava/frontend/src/stores/index.ts) |
| 实时更新 | 5秒轮询 + mtime 检测 + 全量刷新 | [app.ts#L125](file:///e:/solo-code-2/fava/frontend/src/app.ts#L125) |
| 位置计算 | CSS relative+absolute 定位 | [AutocompleteInput.svelte#L217](file:///e:/solo-code-2/fava/frontend/src/AutocompleteInput.svelte#L217) |
| 编辑器定位 | CodeMirror 内置 autocompletion 扩展 | [codemirror/base-extensions.ts#L41](file:///e:/solo-code-2/fava/frontend/src/codemirror/base-extensions.ts#L41) |
| 搜索优化 | 结果截断（30条）+ 快速路径匹配 | [AutocompleteInput.svelte#L85](file:///e:/solo-code-2/fava/frontend/src/AutocompleteInput.svelte#L85) |
| 响应式缓存 | Svelte 5 `$derived` 自动缓存 | [AutocompleteInput.svelte#L81](file:///e:/solo-code-2/fava/frontend/src/AutocompleteInput.svelte#L81) |
| 防抖机制 | 依赖 Svelte 批处理，无显式 debounce | - |
