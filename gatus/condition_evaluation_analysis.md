# `config/endpoint/condition.go` 中 `Condition.evaluate` 方法行为分析

涉及的主要代码位于 [condition.go](file:///e:/solo-code-2/gatus/config/endpoint/condition.go#L37-L92)。

---

## 问题一：`pat` 函数体内的 `==` 与外层 `!=` 的运算符优先级歧义

### 代码片段

```go
if strings.Contains(condition, " == ") {        // 先命中
    parameters, resolvedParameters := sanitizeAndResolveWithContext(
        strings.Split(condition, " == "), result, context)
    success = isEqual(resolvedParameters[0], resolvedParameters[1])
    ...
} else if strings.Contains(condition, " != ") { // 后命中
    ...
}
```

### 输入条件

```
[BODY].status != pat(*error == fatal*)
```

其中 `pat(*error == fatal*)` 为 pattern 函数体，期望按外层运算符 `!=` 将左右操作数切分为：

- 左：`[BODY].status`
- 右：`pat(*error == fatal*)`

### 实际切分

由于 `strings.Contains` 先检测到 ` == `，并且 `strings.Split(condition, " == ")` 按分隔符将条件字符串切分。该条件中 ` == ` 仅出现一次（位于 `pat(error == fatal)` 内部），因此切分结果为 **2** 段：

1. `"[BODY].status != pat(error`
2. `"fatal)"

即：

- 切分后的第 0 段 = `"[BODY].status != pat(error"`
- 切分后的第 1 段 = `"fatal)"`

这两段被送入 `isEqual`，而 `isEqual` 内部期望至少有一端带有 `pat(` 前缀和 `)` 后缀时才走 pattern 分支；这里第 1 段是 `fatal*)`，既没有 `pat(` 前缀，也不是合法的 pattern，最终会退化到整数比较或字符串相等比较，得到 `false`，从而 `success = false`，外层 `!=` 的意图完全没有被执行。

### 结论

- 期望切分：`[BODY].status` / `pat(*error == fatal*)`（2 段）
- 实际切分：`"[BODY].status != pat(error"` / `"fatal)"`（2 段）
- 语义：**比较结果完全不可预测，`!=` 语义被短路，`pat` 模式匹配失效**。

---

## 问题二：浮点截断为 `int64` 后导致的语义偏移与假阳性边界

### 代码片段（见 [sanitizeAndResolveNumericalWithContext](file:///e:/solo-code-2/gatus/config/endpoint/condition.go#L194-L215)）

```go
if f, err := strconv.ParseFloat(element, 64); err == nil {
    resolvedNumericalParameters = append(resolvedNumericalParameters, int64(f))
} else {
    resolvedNumericalParameters = append(resolvedNumericalParameters, 0)
}
```

`int64(f)` 采用 Go 的向零截断（向 0 取整），这对 `>=` 与 `<=` 会产生反转判定的情况。

### 分析

设真实浮点左值为 `a`、右值为 `b`，截断后分别记为 `⌊a⌋`、`⌊b⌋`。

| 运算符 | 真实判定 `a op b` | 截断判定 `⌊a⌋ op ⌊b⌋` | 反例条件 |
| :--- | :--- | :--- | :--- |
| `>=` | `a < b`（应为 false） | `true` | `⌊a⌋ = ⌊b⌋` 且 `a < b` |
| `<=` | `a > b`（应为 false） | `true` | `⌊a⌋ = ⌊b⌋` 且 `a > b` |
| `>`  | 不存在可反转为 true 的情形 | — | `⌊a⌋ > ⌊b⌋` 蕴含 `a > b` |
| `<`  | 不存在可反转为 true 的情形 | — | `⌊a⌋ < ⌊b⌋` 蕴含 `a < b` |

### 具体边界样例

- **`>=` 假阳性**：`1.1 >= 1.9`
  - 真实：`1.1 >= 1.9` = **false**
  - 截断：`1 >= 1` = **true** ← 假阳性

- **`<=` 假阳性**：`1.9 <= 1.1`
  - 真实：`1.9 <= 1.1` = **false**
  - 截断：`1 <= 1` = **true** ← 假阳性

- **`>` 不会假阳性但可能假阴性**：`1.9 > 1.1`
  - 真实：true；截断：`1 > 1` = false（假阴性）

- **`<` 不会假阳性但可能假阴性**：`1.1 < 1.9`
  - 真实：true；截断：`1 < 1` = false（假阴性）

### 结论

对 `>=` 和 `<=` 两种运算符，**只要两侧值的整数部分相等但小数部分使真实关系为 `false`，就会出现「本应 false 却判 true」的假阳性**。题目中举例的 `1.9 >= 1.2` 只是语义偏移的体现，但真正危险的边界是 `1.1 >= 1.9` 这类情形。

---

## 问题三：占位符解析失败兜底为 0 导致的静默假阳性

### 相关调用链

1. `Condition.evaluate` → 调用 `sanitizeAndResolveNumericalWithContext`（见 [condition.go#L59-L82](file:///e:/solo-code-2/gatus/config/endpoint/condition.go#L59-L82)）
2. `sanitizeAndResolveNumericalWithContext` → 调用 `sanitizeAndResolveWithContext`
3. `sanitizeAndResolveWithContext` → 调用 `ResolvePlaceholder`（见 [placeholder.go](file:///e:/solo-code-2/gatus/config/endpoint/placeholder.go)），失败时 `resolvedParameters[i] = element + " " + InvalidConditionElementSuffix`
4. 回到 `sanitizeAndResolveNumericalWithContext` 后：
   - 该字符串无法被 `ParseInt`/`ParseFloat` 解析
   - 落入 `else` 分支，返回 `0`

### 具体场景

```yaml
conditions:
  - "[BODY].count < 5"     # 真实 count = 10，应判定不健康
```

当 `[BODY].count` 路径拼写错误（如写成 `[BODY].coutn`）：

- `ResolvePlaceholder` 返回错误
- 占位符解析得到 `element + " (INVALID)"`
- 数值转换失败 → 解析值 `0`
- 条件 `0 < 5` = **true** → 判定健康通过

`result.AddError` 会记录错误，但：

- `Condition.evaluate` **不检查 `result.Errors` 来短路判定**；
- 只要 `success` 为 true，条件就被视为通过；
- 监控面板上通常只显示通过/未通过与最终的 `conditionToDisplay`，错误细节易被忽略。

### 风险归类

- **类别**：静默假阳性（silent false positive）
- **发生条件**：`[BODY]`/`[IP]`/`[CERTIFICATE_EXPIRATION]` 等占位符路径拼写错误、或服务响应结构与预期不符；
- **后果**：端点在实际不健康时被误判为健康，告警被抑制；
- **是否构成**：**是，这是一个典型的占位符配置错误下的静默假阳性**。

### 建议方向（供参考）

1. `sanitizeAndResolveNumericalWithContext` 在任一操作数解析失败时，应直接让 `success = false` 或追加一条明确的 `ConditionResult`，而不是用 `0` 兜底。
2. `Condition.evaluate` 可在 `result.Errors` 非空时把当前条件视为失败，避免「带错通过」。
3. 浮点比较应在 `float64` 域内进行，或对 `>=`/`<=` 使用 `int64` 前做预检查（如 `a < b` 时直接返回 false）。
4. 运算符解析建议按最长匹配或基于括号深度/函数嵌套切分，以避免 `pat(...)` 等函数体内的 `==`、`!=` 干扰外层运算符识别。

---

## 小结

| # | 现象 | 根因 | 结果 |
| :--- | :--- | :--- | :--- |
| 1 | `pat(*error == fatal*)` 中 `==` 被外层 `!=` 条件优先命中 | 无上下文的 `strings.Contains/Split` 按运算符字面量切分 | 操作数被错误切分为 `[BODY].status != pat(*error` 与 `fatal*)`，语义失真 |
| 2 | 浮点截断为 `int64` 后偏移比较语义 | `int64(f)` 向零截断 | `>=`/`<=` 在同整数量级的小数区间存在假阳性（如 `1.1 >= 1.9` 判 true） |
| 3 | 占位符路径错误后兜底 0 致通过 | 解析失败统一退化为 0，`evaluate` 不校验 `Errors` | 典型静默假阳性：异常端点被误判为健康 |
