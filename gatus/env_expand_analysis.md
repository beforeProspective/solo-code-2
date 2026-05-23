# Gatus 配置加载阶段的环境变量扩展机制分析

## 核心代码位置

环境变量扩展的完整流水线定义在 [config.go:parseAndValidateConfigBytes](file:///e:/solo-code-2/gatus/config/config.go#L282-L289)：

```go
// 1. 将 $$ 替换为 __GATUS_LITERAL_DOLLAR_SIGN__，防止 os.ExpandEnv 把 $$ 当作环境变量
yamlBytes = []byte(strings.ReplaceAll(string(yamlBytes), "$$", "__GATUS_LITERAL_DOLLAR_SIGN__"))
// 2. 对整段 YAML 字节流做环境变量扩展
yamlBytes = []byte(os.ExpandEnv(string(yamlBytes)))
// 3. 将 __GATUS_LITERAL_DOLLAR_SIGN__ 还原回字面 $
yamlBytes = []byte(strings.ReplaceAll(string(yamlBytes), "__GATUS_LITERAL_DOLLAR_SIGN__", "$"))
```

热重载触发点位于 [main.go:listenToConfigurationFileChanges](file:///e:/solo-code-2/gatus/main.go#L226-L252)，它通过 `HasLoadedConfigurationBeenModified()` 检测文件变化后重新调用 `loadConfiguration()`。

---

## 问题 1：`os.ExpandEnv` 对"非环境变量但含 `$`"字符串的篡改行为

### `os.ExpandEnv` 的行为

`os.ExpandEnv` 基于 Go 标准库内部的 `${[A-Za-z_][A-Za-z0-9_]*}` / `$[A-Za-z_][A-Za-z0-9_]*` 模式进行匹配。其关键语义是：

- 若 `$name` 或 `${name}` 对应的环境变量**存在**，替换为其值；
- 若**不存在**，替换为**空字符串**（即被删除）。

匹配规则使用的"变量名字符集"为 `[A-Za-z_][A-Za-z0-9_]*`，**数字不能作为名字的首字符**。

### 对题目示例的推导

| 原始字段 | 匹配情况 | 展开结果 |
|---------|---------|---------|
| `"Pwd$123"` | `$1` 中 `1` 是数字，不构成合法变量名首字符，因此 `$1` **不匹配**，保留原样 | `"Pwd$123"` |
| `"$body"`  （环境变量未设置时）| `$body` 完全匹配，查找 `body` 环境变量，未找到则替换为空 | `""` |
| `"$body"`  （环境变量已设置时，例如 `body=hello`）| 替换为变量值 | `"hello"` |
| `"${body}"`（环境变量已设置）| 替换为变量值 | `"hello"` |

### 更隐蔽的例子

- `"Foo$HOME_bar"`：若 `HOME_bar` 未定义 → `"Foo"`；若定义了 → `"Foo<HOME_bar的值>"`。
- `"Pwd$123"`：保留原样，因为 `1` 不合法，这是最容易让人产生"没问题"错觉的情况。
- `"$Bearer-Token"`：`-` 不是合法变量名字符，匹配到 `$Bearer`，若 `Bearer` 未定义 → `"-Token"`。

### 结论

只要配置中包含一个合法的 `$[A-Za-z_][A-Za-z0-9_]*` 形态的占位符，`os.ExpandEnv` **无论是否真的是想注入环境变量**，都会把它吃掉：未定义时就变成空字符串，已定义时就变成对应的值。这对 Webhook Payload 中的模板变量（例如 `$body`、`$response`、`$status`）以及 Bearer Token 中恰好以 `$` 开头的字母序列来说，都是**静默数据损坏**。

---

## 问题 2：用户配置中若已存在 `__GATUS_LITERAL_DOLLAR_SIGN__` 字面字符串会怎样

### 推演完整三步替换链

假设用户原始 YAML 文本中直接写了这段占位字符串（比如某个 Webhook 自定义字段就是这串字符），按三步替换：

1. **第一步（L285）**：`strings.ReplaceAll(..., "$$", "__GATUS_LITERAL_DOLLAR_SIGN__")`
   - 用户文本中没有 `$$`，所以内容保持不变，仍为 `__GATUS_LITERAL_DOLLAR_SIGN__`。

2. **第二步（L287）**：`os.ExpandEnv(...)`
   - 该字符串中没有 `$`，也不匹配任何变量形式，保持不变，仍为 `__GATUS_LITERAL_DOLLAR_SIGN__`。

3. **第三步（L289）**：`strings.ReplaceAll(..., "__GATUS_LITERAL_DOLLAR_SIGN__", "$")`
   - 因为第一步未动用户的原始字面量，所以第三步会把它**错误地**替换为 `$`。

### 最终结果

用户配置中的纯文本 `__GATUS_LITERAL_DOLLAR_SIGN__` 会被篡改成单个美元符号 `$`。这是一个**不可恢复**的单向修改，因为 YAML 解析后用户无法再区分这究竟是原始 `$` 还是被污染的占位符。

### 更进一步的极端情况

如果用户的原始文本中既有 `$$` 又有 `__GATUS_LITERAL_DOLLAR_SIGN__`：

| 原始 | 第一步后 | 第二步后 | 第三步后 |
|-----|---------|---------|---------|
| `foo__GATUS_LITERAL_DOLLAR_SIGN__$$bar` | `foo__GATUS_LITERAL_DOLLAR_SIGN____GATUS_LITERAL_DOLLAR_SIGN__bar` | 同左（无 `$`） | `foo$$bar` |

可以看到：原本的 `$$` 还原为 `$$`，而原本的占位字符串也变成了 `$`，两者被**错误地合并**为 `$$`。这意味着占位字符串的存在会让后续一个本应当字面量的 `$` 在展开阶段变成 `$$`（进而被进一步处理），产生**级联污染**。

### 结论

`__GATUS_LITERAL_DOLLAR_SIGN__` 作为"保留字"被写入了整个代码仓库中（实际上代码里也没把它声明为常量或在测试中覆盖），但它没有任何前缀保护（例如基于用户不可能产生的 UUID），任何用户只要在自己的配置中写了这串字面文本就会被偷偷替换成 `$`。这是一个**静默数据破坏漏洞**。

---

## 问题 3：热重载是否能自动应用新的环境变量值

### 热重载触发条件

`listenToConfigurationFileChanges` 每 30 秒轮询一次 `cfg.HasLoadedConfigurationBeenModified()`：

```go
func (config *Config) HasLoadedConfigurationBeenModified() bool {
    lastMod := config.lastFileModTime.Unix()
    fileInfo, err := os.Stat(config.configPath)
    ...
    return !fileInfo.ModTime().IsZero() && config.lastFileModTime.Unix() < fileInfo.ModTime().Unix()
}
```

只有当**磁盘上 config.yaml 的 mtime 大于 `lastFileModTime`** 时才会触发热重载。注意：该函数**完全不关心环境变量是否变化**，它只看文件 mtime。

### 触发热重载后的加载流程

一旦条件满足，热重载分支会执行：

```go
stop(cfg)
time.Sleep(time.Second)
save()
updatedConfig, err := loadConfiguration()   // 这里会重新走 parseAndValidateConfigBytes
...
store.Get().Close()
initializeStorage(updatedConfig)
start(updatedConfig)
return
```

`loadConfiguration()` → `LoadConfiguration()` → `parseAndValidateConfigBytes()`，其中的 `os.ExpandEnv` 使用的是**当前进程的环境变量快照**（Go 的 `os.ExpandEnv` 底层是 `os.Getenv`）。因此：

- 如果用户在修改 `config.yaml` 的同时也更新了进程的环境变量，新的值**会被应用**到新加载的 Endpoint 实例。
- 但如果环境变量变化而 `config.yaml` 的 mtime 没变（例如只改了注释、或 mtime 被强制保留），**热重载根本不会触发**，环境变量自然也就不会被重新应用。

### 微小注释修改的场景

题目中说"`config.yaml` 文件内容本身只有触发热重载的微小注释修改"，这意味着：

1. mtime 被更新，`HasLoadedConfigurationBeenModified()` 返回 `true`，触发热重载。
2. `parseAndValidateConfigBytes` 会把**当前**环境变量的值重新注入到 YAML 字节流里。
3. 新建的 `*Config` 与 `*Endpoint` 实例将持有新的环境变量值。

所以在这个条件下，答案是**能**。

### 但是仍然存在几个陷阱

1. **热重载只触发一次**：`listenToConfigurationFileChanges` 的最后一行是 `return`，整个函数**只跑一次**就退出了。之后再修改 config.yaml 将不再热重载（除非重启进程）。题目场景中恰好是首次修改，所以没问题。

2. **环境变量必须在进程启动或重载前已变更**：`os.Getenv` 读取的是进程当前的环境变量。如果环境变量是在**子进程**（例如通过 export 改了后重启 Gatus 所在容器）里生效的，那么只有新的进程实例才会看到。热重载不会重新 fork，也不会重新读取 shell 环境。

3. **配置结构替换而非增量更新**：整个 `*Config` 被整体替换，所以新的 Endpoint 实例一定使用的是新的环境变量值，没有"部分字段沿用旧值"的情况。

4. **若配置文件本身包含 `$VAR` 形式而用户期望的是字面量**（例如 Webhook Payload 模板变量），它仍然会被 `os.ExpandEnv` 吃掉，问题 1 中的风险在热重载阶段**同样存在**。

### 结论

只要热重载被触发（例如通过修改注释让 mtime 变化），新的 `*Config` 中所有字段都会重新走一遍 `os.ExpandEnv`，因此**能**自动应用新的环境变量值到 Endpoint 实例。但这个能力依赖于文件 mtime 变化，且热重载函数只会跑一次。

---

## 总结

| 问题 | 答案 |
|-----|------|
| 1. `Pwd$123` 保留原样；`$body` 未设 env 时变空，设了 env 时变 env 值 | `os.ExpandEnv` 对合法变量名的 `$xxx` 一律替换，不存在则清空 |
| 2. 用户配置中若包含 `__GATUS_LITERAL_DOLLAR_SIGN__` 字面文本，第三步替换会把它篡改成 `$` | 保留字符串被硬编码且无前缀保护，存在静默数据破坏 |
| 3. 热重载能自动应用新的环境变量值 | 只要触发了热重载，`parseAndValidateConfigBytes` 会重新 `os.ExpandEnv` 整个 YAML；但注意热重载函数只跑一次 |
