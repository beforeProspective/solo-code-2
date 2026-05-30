# Readability 网页正文提取算法深度分析

本文档基于 [readability.go](file:///e:/solo-code-2/yarr/src/content/readability/readability.go) 源代码，对网页正文打分与候选节点评估机制进行深入分析。

---

## 一、逗号特征与链接密度缩放机制分析

### 1.1 核心打分算法概述

在 [getCandidates](file:///e:/solo-code-2/yarr/src/content/readability/readability.go#L169-L215) 函数中，系统采用自下而上的遍历策略，对 `section,h2,h3,h4,h5,h6,p,td,pre,div` 等标签进行评分累加。核心打分逻辑位于第192-199行：

```go
// 基础分
contentScore := float32(1.0)

// 逗号数量加分
contentScore += float32(strings.Count(text, ",") + 1)

// 文本长度加分（每100字符+1分，最多+3分）
contentScore += float32(math.Min(float64(int(len(text)/100.0)), 3))
```

### 1.2 逗号作为正文密度核心特征的设计依据

逗号能成为判断正文文本密度的核心特征，主要基于以下语言学和统计学依据：

| 特征维度 | 分析说明 |
|---------|---------|
| **句法复杂性** | 自然语言正文段落通常包含复杂句式，逗号用于分隔从句、列举项、插入语等，是句法复杂度的重要指标。导航栏、广告等短文本则很少使用逗号。 |
| **信息密度** | 逗号的出现频率与文本信息量呈正相关。一个包含多个逗号的段落通常表达了更丰富的语义内容，而不仅仅是简单的链接或按钮文字。 |
| **语言普适性** | 逗号在多数语言中都作为句内停顿标记使用，相比句号、问号等句末标点，逗号在句子内部的出现更能反映段落的文本密集程度。 |
| **抗噪性强** | 相比特殊符号或关键词匹配，逗号计数受网页样式、模板语言影响较小，是一种相对稳健的统计特征。 |

**算法设计细节**：代码中使用 `strings.Count(text, ",") + 1`，额外加1是为了保证即使没有逗号的段落也能获得至少1分的基础增量，避免零值导致的评分断层。

### 1.3 链接密度缩放公式防止导航误判

在 [getCandidates](file:///e:/solo-code-2/yarr/src/content/readability/readability.go#L210-L212) 函数末尾，所有候选节点的分数都会经过链接密度缩放：

```go
for node := range scores {
    scores[node] *= (1 - getLinkDensity(node))
}
```

其中 [getLinkDensity](file:///e:/solo-code-2/yarr/src/content/readability/readability.go#L236-L248) 计算链接文本占总文本的比例：

```go
func getLinkDensity(n *html.Node) float32 {
    textLength := len(htmlutil.Text(n))
    linkLength := 0.0
    for _, a := range htmlutil.Query(n, "a") {
        linkLength += float64(len(htmlutil.Text(a)))
    }
    return float32(linkLength) / float32(textLength)
}
```

**防误判原理**：

1. **线性衰减机制**：`分数 *= (1 - 链接密度)` 是一个线性衰减函数
   - 链接密度 = 0 → 分数不变（纯文本）
   - 链接密度 = 0.5 → 分数减半
   - 链接密度 = 1.0 → 分数归零（纯链接）

2. **导航链接特征**：导航栏、侧边栏等区域通常链接密度 > 0.8，经过缩放后分数会被大幅削减

3. **正文特征**：正常文章的链接密度通常 < 0.1，缩放后分数几乎不受影响

**设计权衡**：该公式是简单高效的线性模型，相比复杂的机器学习模型，在保持不错准确率的同时，计算开销极低，适合大规模网页处理。

---

## 二、大量超链接对段落评分的影响分析

### 2.1 分数计算的两阶段流程

getCandidates 的评分分为两个独立阶段：

| 阶段 | 操作 | 位置 | 链接敏感性 |
|------|------|------|-----------|
| 第一阶段 | 基于文本长度和逗号数量的基础加分 | 第192-204行 | **不敏感** - 完全不考虑链接存在 |
| 第二阶段 | 统一的链接密度缩放 | 第210-212行 | **高度敏感** - 全局应用衰减 |

### 2.2 大量a标签子元素的实际表现

假设某段落包含1000字符，其中800字符被a标签包裹（链接密度=0.8）：

**第一阶段得分计算**：
```
基础分 = 1
逗号加分 = 假设有5个逗号 → 5 + 1 = 6
长度加分 = 1000 / 100 = 10，但上限3 → 3
合计 = 1 + 6 + 3 = 10分
```

**第二阶段缩放**：
```
最终得分 = 10 * (1 - 0.8) = 2分
```

**对比纯文本段落**（同样1000字符，无链接）：
```
最终得分 = 10 * (1 - 0) = 10分
```

### 2.3 比例缩放下的分值骤降风险

**会导致分值骤降，但这是有意的设计**：

| 链接密度区间 | 缩放比例 | 分值保留 | 场景判断 |
|-------------|---------|---------|---------|
| 0% - 10% | 90% - 100% | 几乎完整保留 | 正常正文段落 |
| 10% - 30% | 70% - 90% | 适度降低 | 引用较多的文章 |
| 30% - 60% | 40% - 70% | 显著降低 | 链接列表、推荐阅读 |
| 60% - 100% | 0% - 40% | 大幅削减 | 导航、广告、相关链接 |

**潜在问题与边界情况**：

1. **维基百科类页面**：正文中包含大量内链，可能被过度惩罚。但实际中维基百科的正文链接密度通常仍低于30%，缩放后仍能保留足够分数。

2. **参考文献段落**：学术文章末尾的参考文献列表链接密度极高，会被正确识别为非正文。

3. **短句多链接场景**：如 "点击 这里 查看 详情"，每个词都是链接，虽然总文本短，但链接密度100%，分数归零。

**设计合理性**：这种"先加分后缩放"的两阶段设计，保证了：
- 文本内容本身的价值被充分评估
- 链接因素作为全局校正器，避免了逐句判断的复杂性
- 计算效率最优，只需要遍历一次所有a标签

---

## 三、标签权重设计与Class属性正则修正机制

### 3.1 scoreNode 标签权重体系

在 [scoreNode](file:///e:/solo-code-2/yarr/src/content/readability/readability.go#L217-L232) 函数中，根据HTML标签语义赋予初始权重：

```go
switch node.Data {
case "div":
    score += 5
case "pre", "td", "blockquote", "img":
    score += 3
case "address", "ol", "ul", "dl", "dd", "dt", "li", "form":
    score -= 3
case "h1", "h2", "h3", "h4", "h5", "h6", "th":
    score -= 5
}
```

### 3.2 正负权重的设计依据

**正权重标签分析**：

| 标签 | 权重 | 设计依据 |
|------|------|---------|
| `div` | +5 | 正文内容最常见的容器标签，通常用于包裹文章主体 |
| `pre` | +3 | 预格式化文本，通常是代码块或引用内容，属于正文 |
| `td` | +3 | 表格单元格，表格数据通常是正文内容的一部分 |
| `blockquote` | +3 | 引用块，明确的正文内容标识 |
| `img` | +3 | 图片，文章通常配有插图，图片所在节点更可能是正文容器 |

**负权重标签分析**：

| 标签 | 权重 | 设计依据 |
|------|------|---------|
| `h1-h6` | -5 | 标题标签。虽然标题是文章的一部分，但readability算法的目标是提取**正文内容**，标题通常单独处理，且标题节点下文本量少，容易误判为最佳候选 |
| `th` | -5 | 表头单元格，通常是导航性或描述性文字，非正文 |
| `ol, ul, li` | -3 | 列表标签。导航菜单、相关链接、评论列表常使用列表，虽然正文也用列表，但整体负权重有助于降低导航区域分数 |
| `dl, dd, dt` | -3 | 定义列表，常用于元数据展示 |
| `address` | -3 | 联系信息，通常在页脚 |
| `form` | -3 | 表单，交互元素而非正文内容 |

**设计权衡**：这是一套基于"标签语义概率"的启发式规则。它不追求100%准确（因为任何标签都可能被滥用），而是基于统计规律：在大多数网页中，这些标签确实更可能出现在正文/非正文区域。

### 3.3 getClassWeight 正则修正机制

[getClassWeight](file:///e:/solo-code-2/yarr/src/content/readability/readability.go#L252-L278) 通过正则表达式匹配class和id属性，进行大幅度的分数修正（±25分）：

```go
func getClassWeight(node *html.Node) float32 {
    weight := 0
    class := htmlutil.Attr(node, "class")
    id := htmlutil.Attr(node, "id")

    if class != "" {
        if negativeRegexp.MatchString(class) { weight -= 25 }
        if positiveRegexp.MatchString(class) { weight += 25 }
    }

    if id != "" {
        if negativeRegexp.MatchString(id) { weight -= 25 }
        if positiveRegexp.MatchString(id) { weight += 25 }
    }

    return float32(weight)
}
```

**正匹配正则**（[positiveRegexp](file:///e:/solo-code-2/yarr/src/content/readability/readability.go#L37-L39)）：
```
article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story
```

**负匹配正则**（[negativeRegexp](file:///e:/solo-code-2/yarr/src/content/readability/readability.go#L34-L36)）：
```
hidden|^hid$|hid$|hid|^hid |banner|combx|comment|com-|contact|foot|footer|footnote|
masthead|media|meta|modal|outbrain|promo|related|scroll|share|shoutbox|sidebar|
skyscraper|sponsor|shopping|tags|tool|widget|byline|author|dateline|writtenby|p-author
```

### 3.4 正则表达式的设计特点

1. **大小写不敏感**：使用 `(?i)` 标志，匹配 `class="Article"` 和 `class="article"`

2. **子串匹配**：不要求完全匹配，只要属性值包含关键字即触发。例如 `class="post-content"` 会命中 `post`，获得+25分。

3. **精细的边界控制**：负正则中使用了 `^hid$`、`hid$`、`^hid ` 等锚定，精确匹配不同位置的"hid"关键词，避免误伤如"hybrid"等正常词汇。

4. **双重检查**：对id和class分别检查，最多可获得 ±50 分的修正（id和class同时匹配正/负规则）。

5. **修正力度大**：±25分的权重远大于标签权重（±5）和文本加分（通常<10），确保了语义明确的class/id能够"一锤定音"。

**修正机制的作用**：
- 当 `<div class="sidebar">` 出现时，即使其内部文本很多、逗号不少，`sidebar` 命中负正则的-25分也足以将其排除
- 当 `<div class="article-body">` 出现时，即使文本量暂时不多，`article` 和 `body` 的双重正匹配（+50分）也能让它成为有力候选

---

## 四、算法整体架构总结

Readability算法是一套**多特征融合的启发式评分系统**，各模块协同工作：

```
HTML文档
    ↓
[transformMisusedDivsIntoParagraphs] - 结构归一化
    ↓
[removeUnlikelyCandidates] - 初步过滤（基于class/id黑名单）
    ↓
[getCandidates] - 核心评分
    ├─ 遍历默认标签（section,h2-h6,p,td,pre,div）
    ├─ 为父节点和祖父节点累加分数
    ├─ 基础分 = 1 + 逗号数 + 1 + min(长度/100, 3)
    ├─ 父节点加分：基础分
    ├─ 祖父节点加分：基础分 / 2
    └─ 链接密度缩放：分数 *= (1 - 链接密度)
        └─ [getLinkDensity] - 计算链接文本占比
    ↓
[getTopCandidate] - 选出最高分节点
    ↓
[getArticle] - 扩展提取相关兄弟节点
    └─ [getLinkDensity] - 再次用于兄弟节点过滤
```

### 设计哲学

1. **"宁滥勿缺"的累加策略**：将分数同时累加到父节点和祖父节点（减半），利用了正文内容通常嵌套在多层容器中的特点，即使某一层标签不理想，上层容器仍能积累足够分数。

2. **多层次校正机制**：从标签权重 → 文本特征 → 链接密度 → class/id正则，形成了由粗到细的多层次判断，单一特征的误判难以影响最终结果。

3. **统计规律优先**：所有规则都基于"大多数网页如何设计"这一统计假设，而非追求理论完美，在工程实践中取得了效果与效率的平衡。

### 局限性与适用场景

该算法对**新闻、博客、百科**等以长文本为主体的页面效果最佳，对以下场景可能失效：
- 纯图片/视频展示页面
- 高度动态的单页应用（SPA）
- 非常规布局的创意网站
- 正文区域确实包含大量链接的页面（如导航站、目录页）
