# HTML节点查询组件分析报告

## 1. FindNodes的BFS队列实现与DFS的内存和效率差异

[FindNodes](file:///e:/solo-code-2/yarr/src/content/htmlutil/query.go#L12-L28) 函数使用切片作为队列实现了广度优先搜索（BFS）：

```go
queue := make([]*html.Node, 0)
queue = append(queue, node)
for len(queue) > 0 {
    n, queue = queue[0], queue[1:]  // 从队首出队
    if match(n) {
        nodes = append(nodes, n)
    }
    for c := n.FirstChild; c != nil; c = c.NextSibling {
        queue = append(queue, c)    // 子节点入队
    }
}
```

### 内存占用差异

| 维度 | BFS队列实现 | DFS（栈/递归）实现 |
|------|-------------|-------------------|
| **峰值内存** | 等于树的**最大宽度**（某一层的节点总数） | 等于树的**最大深度**（从根到最远叶子的路径长度） |
| **极宽DOM树** | 内存开销大。例如一个 `<ul>` 包含 10,000 个 `<li>` 子节点时，队列需同时存储全部 10,000 个节点指针 | 内存开销小。仅需维护一条从根到当前节点的路径，栈深度约为 2-3 层 |
| **极深DOM树** | 内存开销小。每层节点数少，队列规模稳定 | 内存开销大。递归实现可能触发栈溢出；显式栈实现需存储整条深度路径 |
| **平均情况** | 对于扁平结构的 HTML（如大量同级 `<div>`），内存压力大 | 对于深层嵌套的 HTML（如复杂布局），内存压力大 |

### 执行效率差异

| 维度 | BFS队列实现 | DFS实现 |
|------|-------------|---------|
| **出队操作** | **O(n) 时间复杂度**。`queue[1:]` 操作需复制整个切片的剩余元素，这是当前实现的主要性能瓶颈 | **O(1) 时间复杂度**。栈的弹出操作仅需移动栈顶指针 |
| **缓存局部性** | 同层节点连续处理，若节点在内存中布局连续则缓存命中率较好。但 `golang.org/x/net/html` 的节点通过指针链接，实际局部性有限 | 深度优先遍历的访问模式跳跃性更强，缓存局部性略差 |
| **栈溢出风险** | 无。使用显式队列，不受调用栈限制 | 递归实现有栈溢出风险（深度超过 1000 层时可能触发） |
| **结果顺序** | 按层次顺序返回节点 | 按先序遍历顺序返回节点 |

> **关键发现**：当前 BFS 实现的 `n, queue = queue[0], queue[1:]` 操作是 **O(n)** 复杂度，对于大规模 DOM 树会产生显著的性能损耗。建议改用链表或环形缓冲区实现队列，使出队操作降为 **O(1)**。

---

## 2. NewMatcher 与 nodeNameRegex 的选择器支持限制

### NewMatcher 实现分析

[NewMatcher](file:///e:/solo-code-2/yarr/src/content/htmlutil/query.go#L45-L57) 函数的核心逻辑：

```go
var nodeNameRegex = regexp.MustCompile(`\w+|\*`)

func NewMatcher(sel string) Matcher {
    multi := MultiMatch{}
    parts := strings.Split(sel, ",")
    for _, part := range parts {
        part := strings.TrimSpace(part)
        if nodeNameRegex.MatchString(part) {
            multi.Add(ElementMatch{Name: part})
        } else {
            panic("unsupported selector: " + part)
        }
    }
    return multi
}
```

### 包含特殊符号的选择器处理

当传入包含以下符号的 CSS 选择器时：

| 选择器示例 | 符号 | 程序行为 | 原因 |
|-----------|------|---------|------|
| `div.classname` | `.` 类名选择器 | **panic**：`unsupported selector: div.classname` | `.` 不属于 `\w` 字符集，正则匹配失败 |
| `div#header` | `#` ID选择器 | **panic**：`unsupported selector: div#header` | `#` 不属于 `\w` 字符集，正则匹配失败 |
| `div > p` | `>` 子组合器 | **panic**：`unsupported selector: div > p` | `>` 和空格均不属于 `\w` 字符集 |
| `div[attr=val]` | `[]` 属性选择器 | **panic** | `[`、`]`、`=` 均不匹配 |
| `div:first-child` | `:` 伪类 | **panic** | `:` 不匹配 |

### nodeNameRegex 支持的选择器范围

正则表达式 `\w+|\*` 的匹配范围：
- `\w+`：匹配一个或多个 **单词字符**（`[a-zA-Z0-9_]`）
- `|`：或
- `\*`：匹配字面量星号

因此，该解析器仅支持以下基础选择器：

| 类型 | 示例 | 说明 |
|------|------|------|
| **元素标签选择器** | `div`、`p`、`table`、`code`、`h1` | 匹配 HTML 标签名 |
| **通配符选择器** | `*` | 匹配任意元素节点 |
| **多选择器组合** | `div, p, table` | 逗号分隔，只要匹配其中任一选择器即命中 |

> **限制总结**：该解析器是一个极简实现，**不支持**类选择器、ID选择器、属性选择器、伪类、层级组合器等标准 CSS 选择器功能。

---

## 3. Closest 函数的时间复杂度与优化策略

### Closest 实现分析

[Closest](file:///e:/solo-code-2/yarr/src/content/htmlutil/query.go#L35-L43) 函数向上遍历祖先节点：

```go
func Closest(node *html.Node, sel string) *html.Node {
    matcher := NewMatcher(sel)
    for cur := node; cur != nil; cur = cur.Parent {
        if matcher.Match(cur) {
            return cur
        }
    }
    return nil
}
```

### 最坏时间复杂度

**O(d)**，其中 `d` 为当前节点在 DOM 树中的**深度**。

- **最坏场景**：目标节点是树的叶子节点，且匹配的祖先为根节点（或无匹配祖先），此时需要遍历完整的祖先链。
- **例如**：在深度为 1000 的 DOM 树中，对最深层节点调用 `Closest(node, "html")`，需执行 1000 次 `Parent` 跳转和 `Match` 检查。
- **Readability 场景**：清洗网页时，若对每个文本节点都调用 `Closest` 判断是否处于 `<table>` 或 `<code>` 内，时间复杂度将达到 **O(n × d)**，在长文档中可能成为性能瓶颈。

### 优化策略

针对 Readability 频繁调用 `Closest` 的场景，可采用以下优化方案：

#### 方案一：缓存 Matcher 对象（低投入，中收益）

**问题**：当前每次调用 `Closest` 都会重新调用 `NewMatcher(sel)` 解析选择器，而 Readability 中检查的选择器通常是固定的（如 `"table"`, `"code"`, `"pre"`）。

**优化**：

```go
// 预创建常用 matcher，避免重复解析
var (
    tableMatcher = NewMatcher("table")
    codeMatcher  = NewMatcher("code, pre")
)

func HasTableAncestor(node *html.Node) bool {
    return closestWithMatcher(node, tableMatcher) != nil
}

func closestWithMatcher(node *html.Node, matcher Matcher) *html.Node {
    for cur := node; cur != nil; cur = cur.Parent {
        if matcher.Match(cur) {
            return cur
        }
    }
    return nil
}
```

#### 方案二：节点结果备忘录（中投入，高收益）

**问题**：同一节点可能被多次查询同一选择器，或兄弟节点共享部分祖先路径。

**优化**：使用 `map` 缓存查询结果（DOM 树在清洗过程中不可变，结果可安全缓存）：

```go
type AncestorCache struct {
    hasTable map[*html.Node]bool
    hasCode  map[*html.Node]bool
}

func (c *AncestorCache) HasTableAncestor(node *html.Node) bool {
    if result, ok := c.hasTable[node]; ok {
        return result
    }
    // 递归查询父节点，同时填充缓存
    result := false
    if node.Parent != nil {
        result = c.HasTableAncestor(node.Parent)
    }
    if !result && node.Type == html.ElementNode && node.Data == "table" {
        result = true
    }
    c.hasTable[node] = result
    return result
}
```

#### 方案三：预计算祖先标签（高投入，最高收益）

**问题**：逐个节点向上遍历产生重复计算。

**优化**：在清洗开始前，对 DOM 树做一次 BFS/DFS 遍历，为每个节点预计算祖先标签集合：

```go
type NodeMeta struct {
    inTable bool
    inCode  bool
}

func PrecomputeAncestors(root *html.Node) map[*html.Node]*NodeMeta {
    meta := make(map[*html.Node]*NodeMeta)
    var preorder func(n *html.Node, inTable, inCode bool)
    preorder = func(n *html.Node, inTable, inCode bool) {
        if n.Type == html.ElementNode {
            if n.Data == "table" {
                inTable = true
            }
            if n.Data == "code" || n.Data == "pre" {
                inCode = true
            }
        }
        meta[n] = &NodeMeta{inTable: inTable, inCode: inCode}
        for c := n.FirstChild; c != nil; c = c.NextSibling {
            preorder(c, inTable, inCode)
        }
    }
    preorder(root, false, false)
    return meta
}
```

**收益**：预计算一次 O(n)，之后查询变为 O(1) 查表，总复杂度从 O(n × d) 降为 O(n)。

#### 方案四：路径压缩（Union-Find 思想）

在向上遍历的过程中，将查询结果记录到路径上的所有节点，使后续查询可共享结果。例如查询节点 A 是否有 table 祖先时，沿途的 A.parent、A.parent.parent 等节点都会被标记，后续对这些节点的查询直接命中缓存。

---

## 总结

| 问题 | 核心结论 | 优化建议 |
|------|---------|---------|
| BFS vs DFS | BFS 适合深层树，DFS 适合宽树；当前 BFS 出队操作是 O(n) 瓶颈 | 改用链表/环形缓冲区实现队列 |
| 选择器支持 | 仅支持元素标签名和 `*`，类/ID/层级选择器均会 panic | 若需扩展支持，需重新设计选择器解析逻辑 |
| Closest 性能 | 最坏 O(d)，频繁调用时为 O(n × d) | 预计算祖先标签 + 缓存 matcher，可降为 O(n) |
