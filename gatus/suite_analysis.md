# Gatus Suite 模块深度分析

## 问题一：超时机制能否中断阻塞的 Endpoint 执行？

### 代码分析

在 [suite.go](file:///e:/solo-code-2/gatus/config/suite/suite.go#L138-L144) 的 Execute 方法中，超时检测实现如下：

```go
select {
case <-timeoutChan:
    result.AddError(fmt.Sprintf("suite execution timed out after %v", s.Timeout))
    result.Success = false
    break
default:
}
```

### 核心问题

**超时机制无法中断正在执行的 Endpoint**，原因如下：

1. **非阻塞 select 设计**：由于存在 `default` 分支，该 select 语句是非阻塞的。超时信号只在每个 Endpoint **执行前**被检查一次。

2. **无法中断进行中的请求**：如果某个 Endpoint 的 `EvaluateHealthWithContext` 方法因目标服务无响应而阻塞（例如 HTTP 请求挂起），超时机制无法主动中断该调用。

3. **break 作用域限制**：即使检测到超时，`break` 语句仅跳出 select 块，而非 for 循环。代码会继续执行后续逻辑。

### 实际行为

```
时间线：
|-- Endpoint1 执行(5s) --|-- 检查超时 --|-- Endpoint2 执行(阻塞30s) --|-- 检查超时 --|...
                         ↑                                    ↑
                    超时检查点                           超时检查点
                    
如果 Suite.Timeout = 10s：
- Endpoint1 执行 5s，正常完成
- Endpoint2 开始执行并阻塞
- 即使 10s 超时已到，也只能等待 Endpoint2 执行完毕后才会检查超时
- 最终 Suite 可能执行远超 Timeout 的时间
```

### 建议改进方向

1. 使用 goroutine + context 超时控制来中断 HTTP 请求
2. 在 `EvaluateHealthWithContext` 中支持传入 context 参数
3. 考虑在检测到超时后使用 `return` 直接退出循环

---

## 问题二：数字类型转换是否会产生精度损失？

### 数据流转路径

```
[BODY].status = "200"
    ↓
extractValueForStorage(): strconv.ParseInt("200", 10, 64) → int64(200)
    ↓
存储到 Gontext: ctx.Set("status_code", int64(200))
    ↓
resolveContextPlaceholder(): fmt.Sprintf("%v", int64(200)) → "200"
    ↓
isEqual() 比较: strconv.ParseInt("200", 0, 64) → int64(200)
```

### 分析结论

**对于纯数字字符串不会产生精度损失**，原因如下：

1. **可逆转换**：`int64 → string → int64` 的转换是可逆的。
   - `fmt.Sprintf("%v", int64(200))` 输出 `"200"`
   - `strconv.ParseInt("200", 0, 64)` 解析为 `int64(200)`

2. **isEqual 函数的类型感知**：在 [condition.go](file:///e:/solo-code-2/gatus/config/endpoint/condition.go#L159-L170) 中：

```go
// test if inputs are integers
firstInt, err1 := strconv.ParseInt(first, 0, 64)
secondInt, err2 := strconv.ParseInt(second, 0, 64)
if err1 == nil && err2 == nil {
    return firstInt == secondInt
}

return first == second
```

   - 两个值都能成功解析为整数时，按数值比较
   - 解析失败时退化为字符串比较

3. **潜在风险场景**：
   - **大数溢出**：超过 `int64` 范围的数字会解析失败，转为字符串比较
   - **前导零**：**不会导致等价性问题**。由于 `isEqual` 使用 `strconv.ParseInt(value, 0, 64)`（base=0），Go 标准库会自动检测进制：
     - `"001"` 以 `"0"` 开头 → 按八进制解析 → `int64(1)`
     - `"1"` 按十进制解析 → `int64(1)`
     - 因此 `isEqual("001", "1")` 返回 `true`
   - **浮点数**：`"3.14"` 会被 `ParseInt` 跳过，被 `ParseFloat` 转为 `float64(3.14)`，`fmt.Sprintf("%v", 3.14)` 可能输出 `"3.14"`，但在某些场景下可能出现精度问题

### 测试验证

在 [suite_test.go](file:///e:/solo-code-2/gatus/config/suite/suite_test.go#L191-L256) 的 `TestStoreResultValues` 测试中验证了这一点：

```go
if stored["response_code"] != int64(200) {
    t.Errorf("Expected response_code=200, got %v", stored["response_code"])
}
```

---

## 问题三：Endpoint 失败时 Gontext 占位符会导致什么请求畸变？

### 代码执行流程

在 [suite.go](file:///e:/solo-code-2/gatus/config/suite/suite.go#L132-L139) 中：

```go
for _, ep := range s.Endpoints {
    // Skip non-always-run endpoints if suite has already failed
    if suiteHasFailed && !ep.AlwaysRun {
        continue
    }
    // ... 执行端点
}
```

### 场景分析

假设 Suite 配置如下：

```yaml
suite:
  name: "test-suite"
  endpoints:
    - name: "create-resource"
      url: "https://api.example.com/resources"
      method: "POST"
      conditions:
        - "[STATUS] == 200"
      store:
        resource_id: "[BODY].id"  # 期望存储资源ID

    - name: "update-resource"      # 非 AlwaysRun，会被跳过
      url: "https://api.example.com/resources/[CONTEXT].resource_id"
      conditions:
        - "[STATUS] == 200"
      store:
        update_token: "[BODY].token"

    - name: "cleanup-resource"     # 标记为 AlwaysRun
      url: "https://api.example.com/resources/[CONTEXT].resource_id"
      method: "DELETE"
      conditions:
        - "[STATUS] == 204"
      always-run: true
```

### 执行过程

1. **create-resource** 执行成功，`resource_id` 被存储到 Gontext
2. **update-resource** 执行失败，`suiteHasFailed = true`，`update_token` 未被存储
3. **cleanup-resource** 因 `AlwaysRun = true` 而执行，尝试引用 `[CONTEXT].resource_id`

### 占位符处理逻辑

在 [endpoint.go](file:///e:/solo-code-2/gatus/config/endpoint/endpoint.go#L401-L416) 的 `replaceContextPlaceholders` 函数中：

```go
result := contextRegex.ReplaceAllStringFunc(input, func(match string) string {
    path := strings.TrimPrefix(match, "[CONTEXT].")
    value, err := ctx.Get(path)
    if err != nil {
        contextErrors = append(contextErrors, fmt.Sprintf("path '%s' not found", path))
        return match  // 保留原始占位符
    }
    return fmt.Sprintf("%v", value)
})
```

### 请求畸变类型

1. **URL 路径畸变**：
   - 期望：`DELETE https://api.example.com/resources/12345`
   - 实际：`DELETE https://api.example.com/resources/[CONTEXT].resource_id`
   - 后果：服务器收到无效路径，返回 404 或 400

2. **请求体畸变**：
   - 期望：`{"token": "abc123"}`
   - 实际：`{"token": "[CONTEXT].update_token"}`
   - 后果：JSON 解析失败或验证失败

3. **Header 畸变**：
   - 期望：`Authorization: Bearer abc123`
   - 实际：`Authorization: Bearer [CONTEXT].update_token`
   - 后果：认证失败

### 影响范围

| 畸变类型 | 影响程度 | 可检测性 |
|---------|---------|---------|
| URL 路径畸变 | 高 - 导致请求失败 | 高 - 服务器返回错误 |
| 请求体畸变 | 中 - 可能导致业务逻辑错误 | 中 - 依赖响应检查 |
| Header 畸变 | 高 - 认证/授权失败 | 高 - 服务器返回401 |

### 建议改进

1. 在执行 AlwaysRun 端点前检查必需的上下文键是否存在
2. 提供配置选项允许用户指定"必需的上下文键"
3. 在占位符无法解析时返回错误而非保留原始文本
4. 考虑在 Suite 执行结果中明确标识哪些端点因上下文缺失而失败

---

## 总结

| 问题 | 严重程度 | 当前行为 | 建议 |
|-----|---------|---------|------|
| 超时无法中断阻塞请求 | 高 | 超时只在端点间检查 | 使用 context 超时控制 |
| 数字类型转换精度 | 低 | 大多数场景安全，前导零不会导致问题 | 注意大数和大数场景 |
| 占位符未替换导致请求畸变 | 中 | 错误会阻止请求发送，但错误信息可能不够明确 | 增加上下文完整性检查 |
