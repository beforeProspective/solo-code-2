# Fava 自定义选项解析器深度分析

## 概述

Fava 通过 Beancount 的 `custom` 指令实现前端界面参数配置，所有 Fava 特有的界面呈现选项必须通过 `fava-option` 自定义指令层过渡解析。核心模块 [fava_options.py](file:///e:/solo-code-2/fava/src/fava/core/fava_options.py) 负责从 Beancount 原生的 Custom 指令集合中过滤、提取、类型转换并构建为强类型 `FavaOptions` 对象。

用户在 Beancount 文件中的配置格式如下：

```beancount
2016-04-14 custom "fava-option" "auto-reload" "true"
2016-04-14 custom "fava-option" "currency-column" "100"
2016-04-14 custom "fava-option" "collapse-pattern" "Assets:Bank"
2016-04-14 custom "fava-option" "conversion-currencies" "USD EUR HOOLI"
```

---

## 一、parse_options：从 Custom 指令到 FavaOptions 强类型对象

### 1.1 过滤机制：识别 `fava-option` 指令

[parse_options](file:///e:/solo-code-2/fava/src/fava/core/fava_options.py#L226-L254) 函数接收 Beancount 解析后产生的全部 Custom 指令列表，通过生成器表达式过滤出第一参数为 `"fava-option"` 的条目：

```python
for entry in (e for e in custom_entries if e.type == "fava-option"):
```

Beancount 的 Custom 指令结构中，`entry.type` 对应指令中第一个字符串值（即 `custom "fava-option"` 中的 `"fava-option"`）。只有 `type` 为 `"fava-option"` 的 Custom 指令才会被处理，其余类型的 custom 指令（如 `"fava-extension"` 等）被自动跳过。

### 1.2 元编程：基于 dataclass 字段反射的字典映射

FavaOptions 是一个 `@dataclass`，定义在 [fava_options.py#L90-L178](file:///e:/solo-code-2/fava/src/fava/core/fava_options.py#L90-L178)。它声明了 22 个带默认值的字段，每个字段的类型注解直接决定了解析策略。模块利用 Python `dataclasses.fields()` 反射机制，在类定义之后立即构建四个选项分类集合：

```python
_fields = fields(FavaOptions)
All_OPTS = {f.name for f in _fields}
BOOL_OPTS = {f.name for f in _fields if str(f.type) == "bool"}
INT_OPTS = {f.name for f in _fields if str(f.type) == "int"}
TUPLE_OPTS = {f.name for f in _fields if f.type.startswith("tuple[str,")}
STR_OPTS = {f.name for f in _fields if f.type.startswith("str")}
```

这一设计的关键点在于：

- **`fields(FavaOptions)`** 返回所有 dataclass 字段的元信息列表，每个字段包含 `name` 和 `type` 属性
- **`str(f.type)`** 将类型注解转为字符串进行模式匹配，这是因为 Python 运行时对 `from __future__ import annotations` 下的类型注解会延迟求值，使用字符串比较更可靠
- **四个集合** 形成了从选项名到类型处理策略的隐式映射

### 1.3 解析分发：parse_option_custom_entry 的策略模式

[parse_option_custom_entry](file:///e:/solo-code-2/fava/src/fava/core/fava_options.py#L188-L223) 实现了分层分发策略：

**第一步：键名规范化与合法性校验**

```python
key = str(entry.values[0].value).replace("-", "_")
if key not in All_OPTS:
    raise UnknownOptionError(key)
```

Beancount 文件中使用连字符命名（如 `collapse-pattern`），而 Python 属性使用下划线命名（如 `collapse_pattern`）。此处通过 `replace("-", "_")` 完成转换，随后在 `All_OPTS` 集合中校验合法性。

**第二步：值提取与字符串类型断言**

```python
value = entry.values[1].value if len(entry.values) > 1 else ""
if not isinstance(value, str):
    raise NotAStringOptionError(key)
```

Custom 指令的 values 可能包含非字符串类型（如 Decimal、date），但 Fava 选项只接受字符串输入，后续再按需转换。

**第三步：特殊选项的专用处理（优先级最高）**

7 个选项拥有独立的 setter 方法，处理复杂逻辑：

| 选项 | setter 方法 | 特殊逻辑 |
|------|-------------|----------|
| `collapse_pattern` | `set_collapse_pattern` | 编译正则表达式，追加到列表 |
| `default_file` | `set_default_file` | 相对路径转绝对路径 |
| `fiscal_year_end` | `set_fiscal_year_end` | 解析财年结束日期格式 |
| `import_dirs` | `set_import_dirs` | 追加到目录列表 |
| `insert_entry` | `set_insert_entry` | 编译正则 + 构建 InsertEntryOption 元组 |
| `language` | `set_language` | babel Locale 验证 + 翻译可用性检查 |
| `locale` | `set_locale` | babel Locale 解析验证 |

**第四步：通用类型分发**

未被特殊处理的选项，按类型集合进行通用分发：

```python
elif key in STR_OPTS:
    setattr(options, key, value)
elif key in BOOL_OPTS:
    setattr(options, key, value.lower() == "true")
elif key in INT_OPTS:
    setattr(options, key, int(value))
else:  # key in TUPLE_OPTS
    setattr(options, key, tuple(value.strip().split(" ")))
```

- **STR_OPTS**：直接赋值字符串（如 `default_page`）
- **BOOL_OPTS**：将字符串 `"true"`/`"false"` 转为布尔值（如 `auto_reload`）
- **INT_OPTS**：调用 `int()` 转换（如 `currency_column`、`indent`、`sidebar_show_queries`）
- **TUPLE_OPTS**：按空格分割后构建元组（如 `conversion_currencies`）

### 1.4 完整数据流图

```
Beancount 文件
    │
    ▼
load_uncached() → all_entries_by_type.Custom
    │
    ▼
parse_options(custom_entries)
    │
    ├─ 过滤: e.type == "fava-option"
    │
    ├─ 对每个 fava-option 条目:
    │   ├─ 键名: 连字符→下划线
    │   ├─ 合法性: key ∈ All_OPTS?
    │   ├─ 特殊选项 → 专用 setter
    │   └─ 通用选项 → 类型集合分发 (BOOL/INT/STR/TUPLE)
    │
    ▼
FavaOptions (dataclass) + List[OptionError]
```

---

## 二、类型不符时的异常捕获与错误元组构建

### 2.1 异常层级体系

Fava 选项解析定义了精细的异常层级，所有异常均继承自 Python 内置异常，确保能被 `parse_options` 的统一 `except` 子句捕获：

```
ValueError
├── MissingOptionError          → Custom 条目缺少选项名
├── UnknownOptionError          → 选项名不在 All_OPTS 中
├── UnknownLocaleOptionError    → babel 无法识别的 locale 值
├── UnsupportedLanguageOptionError → Fava 无该语言的翻译
└── InvalidFiscalYearEndOptionError → 财年结束日期格式错误

TypeError
├── NotARegularExpressionError  → 正则表达式编译失败
└── NotAStringOptionError       → 选项值非字符串

IndexError
└── (entry.values 越界访问)
```

### 2.2 错误捕获机制

[parse_options](file:///e:/solo-code-2/fava/src/fava/core/fava_options.py#L246-L253) 中的核心异常处理：

```python
try:
    if not entry.values:
        raise MissingOptionError
    parse_option_custom_entry(entry, options)
except (IndexError, TypeError, ValueError) as err:
    msg = f"Failed to parse fava-option entry: {err!s}"
    errors.append(OptionError(entry.meta, msg, entry))
```

**关键设计**：

1. **统一异常类型捕获**：`IndexError`、`TypeError`、`ValueError` 三个基类覆盖了所有自定义异常（因为所有自定义异常均继承自这三者）
2. **错误消息透传**：`{err!s}` 将具体异常的 `__str__` 输出嵌入到统一格式的错误消息中，例如：
   - `Failed to parse fava-option entry: Unknown option 'invalid'`
   - `Failed to parse fava-option entry: Should be a regular expression: '(invalid'.`
   - `Failed to parse fava-option entry: Invalid 'fiscal_year_end' option: 'invalid'.`
3. **错误来源保留**：`entry.meta` 包含了出错的文件名和行号信息

### 2.3 OptionError 错误元组的结构

[OptionError](file:///e:/solo-code-2/fava/src/fava/core/fava_options.py#L36-L37) 继承自 [BeancountError](file:///e:/solo-code-2/fava/src/fava/helpers.py#L13-L18)，后者是一个 `NamedTuple`：

```python
class BeancountError(NamedTuple):
    source: Meta | None    # 包含 filename, lineno 等来源信息
    message: str           # 格式化后的错误描述
    entry: Directive | None # 引发错误的原始指令
```

### 2.4 错误在 FavaLedger 中的汇聚

[FavaLedger.load_file](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L419-L421) 将解析结果存储为两个属性：

```python
self.fava_options, self.fava_options_errors = parse_options(
    self.all_entries_by_type.Custom,
)
```

[FavaLedger.errors](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L466-L475) 属性将所有来源的错误合并为一个统一列表：

```python
@property
def errors(self) -> Sequence[BeancountError]:
    return [
        *self.load_errors,
        *self.fava_options_errors,
        *self.budgets.errors,
        *self.extensions.errors,
        *self.misc.errors,
        *self.ingest.errors,
    ]
```

### 2.5 典型错误场景示例

基于 [test_core_fava_options.py](file:///e:/solo-code-2/fava/tests/test_core_fava_options.py) 中的测试用例：

```beancount
2016-04-14 custom "fava-option" "invalid"              → UnknownOptionError
2016-04-14 custom "fava-option" "locale" "invalid"      → UnknownLocaleOptionError
2016-04-14 custom "fava-option" "collapse_pattern" "(invalid" → NotARegularExpressionError
```

测试断言 `assert len(errors) == 3`，确认三个错误均被正确捕获。

---

## 三、FavaOptions 到前端 Svelte 应用的序列化与控制链路

### 3.1 后端序列化路径

FavaOptions 通过**两条路径**传递到前端：

#### 路径 A：模板内嵌 JSON（主路径，页面初始加载）

[_layout.html](file:///e:/solo-code-2/fava/src/fava/templates/_layout.html#L20-L22) 中通过 Jinja2 模板将 `get_ledger_data()` 的输出直接嵌入 HTML：

```html
<script type="application/json" id="ledger-data">{{ get_ledger_data()|tojson }}</script>
```

[get_ledger_data](file:///e:/solo-code-2/fava/src/fava/internal_api.py#L100-L130) 构建 `LedgerData` dataclass，其中 `fava_options` 字段直接引用 `ledger.fava_options` 对象：

```python
return LedgerData(
    ...
    ledger.fava_options,     # FavaOptions dataclass 实例
    ...
)
```

序列化时，Flask 的 `FavaJSONProvider` 使用 [_json_default](file:///e:/solo-code-2/fava/src/fava/core/charts.py#L46-L58) 处理特殊类型：

```python
def _json_default(o: Any) -> Any:
    if isinstance(o, Pattern):
        return o.pattern          # 正则 → 字符串模式
    if is_dataclass(o):
        return {field.name: getattr(o, field.name) for field in fields(o)}  # dataclass → dict
```

这意味着 `FavaOptions` dataclass 会被自动展开为 JSON 字典，其中：
- `collapse_pattern` 中的 `Pattern[str]` 对象被序列化为正则表达式字符串
- `insert_entry` 中的 `InsertEntryOption` 也会被递归展开为字典
- `conversion_currencies` 元组被序列化为 JSON 数组

#### 路径 B：JSON API 端点（异步查询）

[get_options](file:///e:/solo-code-2/fava/src/fava/json_api.py#L622-L637) 提供独立的选项查询端点：

```python
@api_endpoint
def get_options() -> Options:
    fava_options = g.ledger.fava_options
    pprinted_fava_options = {
        field.name.replace("_", "-"): pformat(getattr(fava_options, field.name))
        for field in fields(fava_options)
    }
    return Options(pprinted_fava_options, ...)
```

此端点使用 `pformat` 将值格式化为可读字符串，键名转回连字符格式，**仅用于前端的 Options 展示页面**，不参与功能控制。

#### 路径 C：文件变更后异步刷新

[app.ts](file:///e:/solo-code-2/fava/frontend/src/app.ts#L70-L77) 中的 `onChanges()` 函数在文件变更时重新调用 `get_ledger_data` API 刷新数据：

```typescript
function onChanges() {
    get_ledger_data().then((v) => {
        ledgerData.set(v);
    });
}
```

### 3.2 前端验证与 Store 构建

#### 初始加载验证

[app.ts](file:///e:/solo-code-2/fava/frontend/src/app.ts#L102-L108) 从 `<script id="ledger-data">` 标签读取 JSON 数据，并使用 `ledgerDataValidator` 进行验证：

```typescript
const initial = getScriptTagValue("#ledger-data", ledgerDataValidator);
if (initial.is_ok) {
    ledgerData.set(initial.value);
}
```

[validators.ts](file:///e:/solo-code-2/fava/frontend/src/api/validators.ts#L48-L66) 中定义了 `fava_options` 的验证器，确保每个字段的类型安全：

```typescript
const fava_options = object({
    auto_reload: boolean,
    currency_column: number,
    conversion_currencies: array(string),
    collapse_pattern: array(string),
    import_config: optional(string),
    indent: number,
    invert_gains_losses_colors: boolean,
    invert_income_liabilities_equity: boolean,
    show_closed_accounts: boolean,
    show_accounts_with_zero_balance: boolean,
    show_accounts_with_zero_transactions: boolean,
    locale: optional(string),
    uptodate_indicator_grey_lookback_days: number,
    insert_entry: array(object({ date: string, filename: string, lineno: number, re: string })),
    use_external_editor: boolean,
});
```

注意：后端的 `Pattern[str]` 被序列化为字符串后，前端验证为 `array(string)`，即 `collapse_pattern` 在前端是字符串数组。

#### Svelte Store 派生链

[fava_options.ts](file:///e:/solo-code-2/fava/frontend/src/stores/fava_options.ts) 从 `ledgerData` store 派生出细粒度的响应式 store：

```typescript
const fava_options = derived(ledgerData, (v) => v.fava_options);

export const conversion_currencies = derived_array(
    fava_options,
    ($fava_options) => $fava_options.conversion_currencies,
);
export const collapse_pattern = derived_array(
    fava_options,
    ($fava_options) => $fava_options.collapse_pattern,
);
export const locale = derived(fava_options, ($fava_options) => $fava_options.locale);
// ... 共 16 个派生 store
```

每个选项都是独立的 Svelte derived store，当 `ledgerData` 更新时，只有实际使用了的派生 store 会触发 UI 重渲染。

### 3.3 前端控制案例：图表默认折叠（collapse_pattern）

#### 后端解析

用户配置：
```beancount
2016-04-14 custom "fava-option" "collapse-pattern" "Assets:Bank"
```

[FavaOptions.set_collapse_pattern](file:///e:/solo-code-2/fava/src/fava/core/fava_options.py#L117-L124)：

```python
def set_collapse_pattern(self, value: str) -> None:
    try:
        pattern = re.compile(value)
    except re.error as err:
        raise NotARegularExpressionError(value) from err
    self.collapse_pattern.append(pattern)
```

可配置多条 collapse-pattern，每条编译为正则对象追加到列表。

#### 序列化到前端

`_json_default` 中 `Pattern` → `o.pattern`（字符串），前端接收如 `["Assets:Bank", "Liabilities:*"]`。

#### 前端消费

[accounts.ts](file:///e:/solo-code-2/fava/frontend/src/stores/accounts.ts#L17-L26) 构建 `collapsed_accounts` 派生 store：

```typescript
const collapsed_accounts: Readable<readonly string[]> = derived(
    [collapse_pattern, accounts_internal],
    ([$collapse_pattern, $accounts_internal]) => {
        const matchers = $collapse_pattern.map((pattern) => new RegExp(pattern));
        return $accounts_internal.filter((account: string) =>
            matchers.some((matcher) => matcher.test(account)),
        );
    },
);
```

流程：
1. 将 `collapse_pattern` 字符串数组重新编译为 `RegExp` 对象数组
2. 遍历所有非叶子账户，检查是否匹配任一正则
3. 匹配的账户名构成 `collapsed_accounts` 集合

[toggled_accounts](file:///e:/solo-code-2/fava/frontend/src/stores/accounts.ts#L33-L46) 合并配置折叠和手动折叠：

```typescript
export const toggled_accounts: Readable<ReadonlySet<string>> = derived(
    [collapsed_accounts, explicitly_toggled],
    ([$collapsed_accounts, $explicitly_toggled]) => {
        const toggled = new Set($collapsed_accounts);
        for (const [account, is_toggled] of $explicitly_toggled) {
            if (is_toggled) toggled.add(account);
            else toggled.delete(account);
        }
        return toggled;
    },
);
```

最终，`toggled_accounts` 被 TreeTable 组件使用，控制账户树节点的默认展开/折叠状态。

### 3.4 前端控制案例：商品转换精度（conversion_currencies + locale + precisions）

#### 后端解析

用户配置：
```beancount
2016-04-14 custom "fava-option" "conversion-currencies" "USD EUR HOOLI"
```

通过 `TUPLE_OPTS` 分支解析：`tuple("USD EUR HOOLI".strip().split(" "))` → `("USD", "EUR", "HOOLI")`。

#### locale 控制数字格式化

[DecimalFormatModule.load_file](file:///e:/solo-code-2/fava/src/fava/core/number.py#L64-L92) 读取 `fava_options.locale` 构建 locale-aware 格式化器：

```python
locale_option = self.ledger.fava_options.locale
if locale_option:
    locale = Locale.parse(locale_option)

self._formatters = {
    currency: get_locale_format(locale, prec)
    for currency, prec in precisions.items()
}
self.precisions = precisions
```

`precisions` 字典通过 `LedgerData.precisions` 传递到前端。

#### 前端消费

[format.ts](file:///e:/solo-code-2/fava/frontend/src/stores/format.ts#L27-L34) 构建 `ctx` 格式化上下文：

```typescript
export const ctx = derived(
    [incognito, locale, precisions],
    ([$incognito, $locale, $precisions]): FormatterContext =>
        formatter_context($incognito, $locale, $precisions),
);
```

[formatter_context](file:///e:/solo-code-2/fava/frontend/src/format.ts#L48-L71) 为每个商品创建独立的格式化器：

```typescript
const currencyFormatters = Object.fromEntries(
    Object.entries(precisions).map(([currency, prec]) => [
        currency,
        localeFormatter(locale, prec),
    ]),
);
```

[localeFormatter](file:///e:/solo-code-2/fava/frontend/src/format.ts#L15-L29) 使用 `Intl.NumberFormat` 实现 locale-aware 格式化：

```typescript
export function localeFormatter(locale: string | null, precision = 2) {
    if (locale == null) {
        return format(`.${precision.toString()}f`);
    }
    const fmt = new Intl.NumberFormat(locale.replace("_", "-"), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
    return fmt.format.bind(fmt);
}
```

#### conversion_currencies 控制转换选项

[chart.ts](file:///e:/solo-code-2/fava/frontend/src/stores/chart.ts#L70-L79) 使用 `conversion_currencies` 构建货币转换下拉选项：

```typescript
const currency_suggestions = derived(
    [operating_currency, currencies_sorted, conversion_currencies],
    ([$operating_currency, $currencies_sorted, $conversion_currencies]) =>
        $conversion_currencies.length > 0
            ? $conversion_currencies
            : new Set([
                ...$operating_currency,
                ...$currencies_sorted.filter((c) => iso4217currencies.has(c)),
              ]),
);
```

当 `conversion_currencies` 非空时，转换下拉框只显示用户指定的货币；为空时则自动从运营货币和 ISO 4217 货币中生成候选列表。

### 3.5 端到端数据流总图

```
┌──────────────────────────────────────────────────────────────────┐
│                       Beancount 账本文件                          │
│  2016-04-14 custom "fava-option" "collapse-pattern" "Assets:*"  │
│  2016-04-14 custom "fava-option" "conversion-currencies" "USD"  │
│  2016-04-14 custom "fava-option" "locale" "de"                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  FavaLedger.load_file()  [core/__init__.py#L407-L441]           │
│    all_entries_by_type.Custom ──→ parse_options()                │
│                                       │                         │
│                    ┌──────────────────┴──────────────────┐      │
│                    ▼                                     ▼      │
│              FavaOptions                          OptionError[] │
│         (dataclass 强类型)                      (NamedTuple)    │
└────────────────────────────┬─────────────────────────────────────┘
                             │
               ┌─────────────┼─────────────┐
               ▼             ▼             ▼
     _layout.html       json_api.py     number.py
     tojson 嵌入        get_options()   DecimalFormatModule
     <script            (pformat展示)   locale→格式化器
      id="ledger-                                     precisions{}
      data">                                              │
               │                                          │
               ▼                                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                       前端 Svelte 应用                           │
│                                                                  │
│  app.ts: getScriptTagValue("#ledger-data", ledgerDataValidator) │
│       → ledgerData.set(initial.value)                            │
│                                                                  │
│  stores/fava_options.ts:                                         │
│    fava_options = derived(ledgerData, v => v.fava_options)       │
│    collapse_pattern = derived_array(fava_options, ...)           │
│    conversion_currencies = derived_array(fava_options, ...)      │
│    locale = derived(fava_options, ...)                           │
│                                                                  │
│  stores/accounts.ts:                                             │
│    collapsed_accounts → 正则匹配 → toggled_accounts              │
│    → TreeTable 节点折叠状态控制                                   │
│                                                                  │
│  stores/chart.ts:                                                │
│    currency_suggestions → 转换下拉选项                            │
│                                                                  │
│  stores/format.ts:                                               │
│    ctx = derived([incognito, locale, precisions], ...)           │
│    → formatter_context → localeFormatter → Intl.NumberFormat     │
│    → 每种货币的精度格式化                                         │
│                                                                  │
│  tree-table/helpers.ts:                                          │
│    get_not_shown = derived([                                     │
│      show_accounts_with_zero_balance,                            │
│      show_accounts_with_zero_transactions,                       │
│      show_closed_accounts, ...], ...)                            │
│    → 账户树行的可见性过滤                                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 四、架构设计亮点总结

1. **dataclass 字段反射驱动的类型分发**：无需维护额外的映射表，字段类型注解本身就是类型分发策略的元数据源，新增选项只需在 `FavaOptions` 中添加字段即可自动被通用路径处理

2. **异常类型的精确分层**：每个错误场景都有独立的异常类，但均继承自 `IndexError`/`TypeError`/`ValueError` 三大基类，使得 `parse_options` 的 `except` 子句既简洁又完备

3. **正则表达式双端编译**：后端编译为 `Pattern` 对象用于服务端验证，序列化时退化为字符串，前端在 `accounts.ts` 中重新编译为 `RegExp`，实现了跨语言的正则配置传递

4. **Svelte derived store 的细粒度响应性**：每个选项独立派生，只有实际订阅的选项变化才会触发 UI 更新，避免了整个 `FavaOptions` 对象变更导致的全局重渲染

5. **locale 双端协同格式化**：后端 `DecimalFormatModule` 使用 babel 进行 locale-aware 格式化（用于服务端渲染和导出），前端通过 `Intl.NumberFormat` + `precisions` 字典实现一致的 locale 格式化（用于交互展示），两端共享同一套 `locale` 和 `precisions` 配置
