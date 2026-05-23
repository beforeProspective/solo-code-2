# `getParsedBody` / `preprocessWithContext` / `buildHTTPRequest` 代码行为分析

本文对 `config/endpoint/endpoint.go` 中三个关联函数的行为进行逐条分析，回答用户提出的三个问题。

---

## 问题 1：Header 上下文解析失败后，`getParsedBody` 是否会将残留 `[CONTEXT].host` 的 URL 写入 Body？

### 结论：**不会**。`getParsedBody` 在该场景下根本不会被调用。

### 详细分析

调用链位于 `EvaluateHealthWithContext`（[endpoint.go#L294-L366](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L294-L366)），关键流程如下：

```go
// 第299行：preprocessWithContext 先执行
processedEndpoint = e.preprocessWithContext(result, context)
```

`preprocessWithContext`（[endpoint.go#L370-L393](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L370-L393)）依次处理三个字段：

| 处理目标 | 替换函数 | 失败行为 |
|---------|---------|---------|
| URL | `replaceContextPlaceholders` | 追加 error 到 `result.Errors`，流程继续 |
| Body | `replaceContextPlaceholders` | 追加 error 到 `result.Errors`，流程继续 |
| Headers (逐项) | `replaceContextPlaceholders` | 追加 error 到 `result.Errors`，流程继续 |

`replaceContextPlaceholders`（[endpoint.go#L396-L416](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L396-L416)）内部通过正则 `\[CONTEXT\]\.[\w\.\-]+` 匹配占位符，匹配成功后调用 `ctx.Get(path)`（[gontext.go#L37-L55](file:///e:/solo-code-2/gatus/config/gontext/gontext.go#L37-L55)）。若 `Get` 返回错误（路径不存在），匹配结果**保留原始占位符**（`return match`），同时记录到 `contextErrors`，最终返回替换结果和一个聚合 error。

**关键守卫在 `EvaluateHealthWithContext` 第 329 行**：

```go
// 第329行
if len(result.Errors) == 0 {
    processedEndpoint.call(result)
} else {
    result.Success = false
}
```

只要 Header 的 `[CONTEXT]` 解析失败，`result.Errors` 就非空，`call()` 直接被跳过。而 `getParsedBody` 仅在 `call()` → `buildHTTPRequest()` 中被调用（[endpoint.go#L570-L589](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L570-L589)），因此**整个请求构建环节不会执行**。

### 完整执行路径梳理

假设：URL = `https://[CONTEXT].host/api`，Body = `{"url": "[ENDPOINT_URL]"}`，某 Header = `[CONTEXT].token`（该路径不存在）。

```
preprocessWithContext:
  URL: [CONTEXT].host → "example.com" ✓  成功
  Body: 无 [CONTEXT] 占位符，无变化 ✓
  Header.token: ctx.Get("token") 失败 ✗  result.Errors += ["..."]

EvaluateHealthWithContext:
  result.Errors 非空 → 跳过 call()
  getParsedBody 未执行 → Body 保持原始 "{"url": "[ENDPOINT_URL]"}"
```

**最终结果**：`getParsedBody` 未被调用，Body 中 `[ENDPOINT_URL]` 未被替换，也不存在"残留 `[CONTEXT].host` 的 URL 被写入 Body"的问题。

### 补充说明

- 在 `ValidateAndSetDefaults`（[endpoint.go#L259](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L259)）中也调用了 `getParsedBody`，但此时无上下文可用，URL 中的 `[CONTEXT].host` 作为原始字符串存在。不过这是配置加载阶段的校验，与运行时上下文替换无关。
- 若 URL 本身的 `[CONTEXT]` 替换也失败，则 `processedEndpoint.URL` 仍含 `[CONTEXT].host`，但 `result.Errors` 同样非空，`call()` 仍被跳过，行为一致。

---

## 问题 2：`match[15:len(match)-1]` 硬编码偏移与大整数溢出风险

### 2.1 硬编码切片偏移的脆弱性

`getParsedBody`（[endpoint.go#L418-L439](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L418-L439)）第 426 行：

```go
n, _ := strconv.Atoi(match[15 : len(match)-1])
```

正则为 `\[RANDOM_STRING_\d+\]`，前缀 `[RANDOM_STRING_` 恰好 15 字节：

```
[ R A N D O M _ S T R I N G _
0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
                                  ↑ 数字从这里开始
```

**风险点**：若将来有人将前缀重构（如改为 `[RAND_STR_]` 或添加版本后缀 `[RANDOM_STRING_V2_]`），而未同步更新切片偏移，将导致：
- 偏移过大 → 截掉数字前几位，`Atoi` 仍返回有效值（变小），行为静默错误
- 偏移过小 → 包含前缀字符，`Atoi` 返回错误，`n = 0`，生成长度为 0 的随机串

**建议**：改用正则捕获组提取数字，消除对前缀长度的依赖：

```go
randRegex := regexp.MustCompile(`\[RANDOM_STRING_(\d+)\]`)
// ...
n, _ := strconv.Atoi(match) // match 现在是捕获组的内容
```

### 2.2 `strconv.Atoi` 溢出与 `make([]byte, n)` panic

#### 分析结论：**在当前正则约束下不会触发 panic，但错误处理存在隐患。**

逐步推演：

**正则约束**：`\d+` 仅匹配数字字符，不含负号，因此提取出的子串始终为非负整数。

**`strconv.Atoi` 行为**（Go 标准库）：
- 解析合法数字 → 返回 `(int, nil)`
- 溢出 `int` 范围 → 返回 `(math.MaxInt, error)` 或 `(math.MinInt, error)`，取决于溢出方向
- 对于纯数字输入，溢出时返回 **`math.MaxInt`（正值）**，因为 `\d+` 匹配的是正数

**关键代码**：
```go
n, _ := strconv.Atoi(match[15 : len(match)-1]) // error 被丢弃
if n > 8192 {
    n = 8192
}
b := make([]byte, n)
```

**各场景推演**：

| 场景 | match 内容 | Atoi 返回 n | n > 8192? | 最终 n | make 结果 |
|------|-----------|------------|-----------|--------|----------|
| 正常输入 | `32` | 32 | false | 32 | ✓ 正常 |
| 超大数字（64位） | 20位数字 | `math.MaxInt` ≈ 9.22×10¹⁸ | true | 8192 | ✓ 正常 |
| 超大数字（32位） | 11位数字 | `math.MaxInt32` ≈ 2.15×10⁹ | true | 8192 | ✓ 正常 |
| 非法输入 | `abc` | 0 | false | 0 | ✓ `make([]byte, 0)` 合法 |

**负值问题的回答**：由于正则 `\d+` 不匹配负号，提取出的子串不可能以 `-` 开头，因此 `Atoi` 不可能返回负值。即使在极端情况下（如有人修改了正则允许负号），负值 `< 8192` 判断为 false，`make([]byte, -1)` 确实会触发 `runtime panic: makeslice: len out of range`。但**当前代码在正则不变更的前提下不存在此风险**。

**值得注意的隐患**：`strconv.Atoi` 的 error 被 `_` 丢弃。如果正则匹配出的数字部分因某种原因（如编码问题）包含非数字字符，`n` 将为 0，`make([]byte, 0)` 合法但语义错误——请求将发送空串而非预期长度的随机串。这不会导致 panic，但会导致静默的功能失效。

---

## 问题 3：GraphQL 模式下 `json.Marshal` 对特殊字符的转义保障

### 结论：**是的，`json.Marshal` 能确保最终 payload 为合法 JSON。**

### 分析

`buildHTTPRequest`（[endpoint.go#L570-L589](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L570-L589)）中 GraphQL 模式的处理：

```go
if e.GraphQL {
    graphQlBody := map[string]string{
        "query": e.getParsedBody(),  // ① 先执行占位符替换
    }
    body, _ := json.Marshal(graphQlBody) // ② 再序列化为 JSON
    bodyBuffer = bytes.NewBuffer(body)
}
```

**执行顺序**：`getParsedBody()` 先做字符串替换（第 ① 步），`json.Marshal` 后做转义（第 ② 步）。

假设 `e.Name` = `test\n"quotes\"\backslash`，Body 模板 = `{"endpoint": "[ENDPOINT_NAME]"}`。

**Step 1 — `getParsedBody`**：
```
Body = strings.ReplaceAll(body, "[ENDPOINT_NAME]", e.Name)
     = `{"endpoint": "test\n"quotes\"\backslash"}`
```
此时 Body 是一个原始字符串，其中 `\n` 是两个字面字符（`\` 和 `n`），`\"` 是两个字面字符（`\` 和 `"`）。

**Step 2 — `json.Marshal`**：

Go 的 `encoding/json` 对字符串值执行完整转义，包括：
- `"` → `\"`
- `\` → `\\`
- 控制字符（`\n`, `\r`, `\t` 等）→ 对应的转义序列
- Unicode 转义（必要时）

因此最终输出为：

```json
{"query":"{\"endpoint\": \"test\\n\\\"quotes\\\"\\backslash\"}"}
```

这是一个**完全合法的 JSON**。JSON 解析器读取该字符串后，会正确还原 `query` 字段的值为：
```
{"endpoint": "test\n"quotes\"\backslash"}
```

### 潜在的语义问题

虽然 `json.Marshal` 保证了 JSON 合法性，但存在一个**语义层面的隐患**：

`getParsedBody` 对 Body 做的是**纯字符串替换**，不理解 JSON 语义。如果 Body 本身是 JSON 模板，且 `[ENDPOINT_NAME]` 等占位符被替换为包含特殊字符的值，替换后的 Body 在 JSON 层面可能是无效的——但 `json.Marshal` 会将这个"无效 JSON 字符串"作为普通字符串转义后嵌入外层 JSON，最终 payload 合法但语义上 `query` 字段的内容可能不符合预期。

举例：
- Body 模板：`{"name": "[ENDPOINT_NAME]"}`
- ENDPOINT_NAME：`foo"bar`
- 替换后 Body：`{"name": "foo"bar"}` ← 这是无效 JSON
- `json.Marshal` 输出：`{"query":"{\"name\": \"foo\"bar\"}"}` ← 合法 JSON，但 query 值是无效 JSON

最终 GraphQL 服务端收到的 `query` 值是 `{"name": "foo"bar"}`，这是一个无效的 JSON，会导致服务端解析失败。

**这并非 `json.Marshal` 的 bug**，而是 `getParsedBody` 纯字符串替换与 JSON 语义之间的天然割裂。

### 非 GraphQL 模式的对比

非 GraphQL 模式下（[endpoint.go#L579](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L579)），Body 直接作为请求体发送，不经过 `json.Marshal`。如果 Body 本身应当为 JSON 且含 `[ENDPOINT_NAME]` 等占位符，特殊字符同样会破坏 JSON 格式，且不会有 `json.Marshal` 的转义保护。

---

## 总结

| 问题 | 结论 | 风险等级 |
|------|------|---------|
| 问题 1：残留 `[CONTEXT].host` 写入 Body | **不会发生**，`result.Errors` 守卫阻止了 `call()` 执行 | 无风险 |
| 问题 2：硬编码切片偏移 | **脆弱**，正则前缀重构会静默产生错误偏移 | 中 |
| 问题 2：Atoi 溢出 → 负值 → panic | **当前不会**，正则不匹配负号，溢出返回正值被 8192 截断 | 低（前提是正则不变） |
| 问题 3：GraphQL 模式 JSON 合法性 | **有保障**，`json.Marshal` 在替换后执行，完整转义特殊字符 | 无风险 |
| 问题 3：GraphQL 语义正确性 | **存隐患**，纯字符串替换不理解 JSON 语义，特殊字符可能使 `query` 值在语义上无效 | 中 |
