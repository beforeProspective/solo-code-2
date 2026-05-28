# Fava 多级余额树构建与数据层级解析

## 核心源码

- [tree.py](file:///e:/solo-code-2/fava/src/fava/core/tree.py) — `Tree` 与 `TreeNode` 类定义
- [inventory.py](file:///e:/solo-code-2/fava/src/fava/core/inventory.py) — `CounterInventory` 余额存储
- [account.py](file:///e:/solo-code-2/fava/src/fava/beans/account.py) — `parent()` 账户名拆分
- [helpers.ts](file:///e:/solo-code-2/fava/frontend/src/tree-table/helpers.ts) — 前端空节点过滤逻辑

---

## 一、Tree 构造函数：从扁平指令到层级科目树

### 1.1 整体流程

`Tree` 继承自 `dict[str, TreeNode]`，其自身就是一张 `账户全名 → TreeNode` 的扁平查找表，同时通过 `TreeNode.children` 维持父子指针，形成树状结构。构造函数分三个阶段工作：

```
阶段 1 — 初始化根节点
阶段 2 — 预建账户骨架（create_accounts / Open 指令）
阶段 3 — 聚合分录余额并挂载到树
```

### 1.2 阶段 1：初始化根节点

```python
super().__init__(self)
self.get("", insert=True)
```

- `super().__init__(self)` 创建空字典。
- `self.get("", insert=True)` 创建一个 `name=""` 的根节点，代表整棵树的虚拟顶点。所有顶层科目（如 `Assets`、`Liabilities`）都将是此根节点的子节点。

### 1.3 阶段 2：预建骨架

```python
if create_accounts:
    for account in create_accounts:
        self.get(account, insert=True)
```

若提供了 `create_accounts` 列表，则对每个账户名调用 `get(name, insert=True)`。同时在遍历 entries 时，遇到 `Open` 指令也会调用：

```python
if isinstance(entry, Open):
    self.get(entry.account, insert=True)
```

这些操作仅创建节点并建立层级关系，**不设置任何余额，也不标记 `has_txns`**。

### 1.4 核心：`get(name, insert=True)` 的递归建树机制

这是将冒号分隔的账户名逐层拆分并连成父子树的关键方法：

```python
def get(self, name: str, *, insert: bool = False) -> TreeNode:
    try:
        return self[name]                    # 字典中已存在 → 直接返回
    except KeyError:                         # 不存在 → 需要创建
        node = TreeNode(name)
        if insert:
            if name:                         # 非根节点
                parent = self.get(
                    account_parent(name) or "", insert=True  # 递归！
                )
                parent.children.append(node) # 挂到父节点的 children 列表
            self[name] = node                # 注册到字典
        return node
```

以账户 `Assets:Current:Cash` 为例，执行过程如下：

```
get("Assets:Current:Cash", insert=True)
  ├── KeyError → 创建 TreeNode("Assets:Current:Cash")
  ├── account_parent("Assets:Current:Cash") → "Assets:Current"
  ├── 递归 get("Assets:Current", insert=True)
  │     ├── KeyError → 创建 TreeNode("Assets:Current")
  │     ├── account_parent("Assets:Current") → "Assets"
  │     ├── 递归 get("Assets", insert=True)
  │     │     ├── KeyError → 创建 TreeNode("Assets")
  │     │     ├── account_parent("Assets") → None
  │     │     ├── get("", insert=True) → 返回根节点
  │     │     ├── root.children.append(Assets节点)
  │     │     └── self["Assets"] = Assets节点
  │     ├── Assets.children.append(Current节点)
  │     └── self["Assets:Current"] = Current节点
  ├── Current.children.append(Cash节点)
  └── self["Assets:Current:Cash"] = Cash节点
```

`account_parent` 的实现基于 `rsplit(":", 1)`：

```python
def parent(account: str) -> str | None:
    parts = account.rsplit(":", maxsplit=1)
    return parts[0] if len(parts) == 2 else None
```

即从右侧按第一个冒号切割，`Assets:Current:Cash` → `("Assets:Current", "Cash")`，父名为 `Assets:Current`。顶层科目如 `Assets` 无冒号，返回 `None`。

### 1.5 阶段 3：聚合余额并挂载

```python
account_balances: dict[str, CounterInventory] = defaultdict(CounterInventory)
for entry in entries:
    if isinstance(entry, Open):
        self.get(entry.account, insert=True)
    for posting in getattr(entry, "postings", []):
        account_balances[posting.account].add_position(posting)

for name, balance in sorted(account_balances.items()):
    self.insert(name, balance)
```

1. 遍历所有 entries，将每个 posting 的金额累加到对应账户的 `CounterInventory`。
2. 排序后逐个调用 `insert(name, balance)`，将余额挂载到树节点上并向上传播。

`insert` 方法同时更新节点自身余额和所有祖先的汇总余额：

```python
def insert(self, name: str, balance: CounterInventory) -> None:
    node = self.get(name, insert=True)
    node.balance.add_inventory(balance)          # 自身余额
    node.balance_children.add_inventory(balance)  # 含自身的累计余额
    node.has_txns = True                         # 标记有交易
    for parent_node in self.ancestors(name):
        parent_node.balance_children.add_inventory(balance)  # 向上累加
```

`ancestors` 生成器从底部向上逐级产出祖先节点：

```python
def ancestors(self, name: str) -> Iterable[TreeNode]:
    while name:
        name = account_parent(name) or ""
        yield self.get(name)
```

至此，树构建完成。每个 `TreeNode` 持有两个余额：

| 属性 | 含义 |
|---|---|
| `balance` | 本科目自身的余额（不含子科目） |
| `balance_children` | 本科目及所有后代科目的累计余额 |

---

## 二、cap 方法：期末结转与数学汇总

### 2.1 调用场景

`cap` 在构建资产负债表时被调用，位于 [FavaLedger.root_tree_closed](file:///e:/solo-code-2/fava/src/fava/core/__init__.py#L199-L203)：

```python
@cached_property
def root_tree_closed(self) -> Tree:
    tree = Tree(self.entries)
    tree.cap(self.ledger.options)
    return tree
```

### 2.2 cap 的三步操作

```python
def cap(self, options: BeancountOptions) -> None:
    equity = options["name_equity"]

    # 第 1 步：添加汇兑差异
    conversions = CounterInventory(
        {(currency, None): -number
         for currency, number in AT_COST.apply(
             self.get("").balance_children).items()},
    )
    self.insert(equity + ":" + options["account_current_conversions"], conversions)

    # 第 2 步：添加未实现损益
    unrealized_gains = -self.get("").balance_children
    self.insert(equity + ":" + options["account_unrealized_gains"], unrealized_gains)

    # 第 3 步：结转收入和费用
    self.insert(equity + ":" + options["account_current_earnings"],
                self.get(options["name_income"]).balance_children)
    self.insert(equity + ":" + options["account_current_earnings"],
                self.get(options["name_expenses"]).balance_children)
```

### 2.3 数学汇总公式

设根节点 `""` 的 `balance_children` 为 $B_{root}$，则三步操作的数学本质如下：

**第 1 步 — 汇兑差异（Conversions）**

$$C_{conv} = -\text{AT\_COST}(B_{root})$$

将根节点的累计余额按成本价折算后取负。这补偿了因多币种成本计价导致的差额，使得在成本视角下所有科目的借方合计等于贷方合计。

**第 2 步 — 未实现损益（Unrealized Gains）**

$$C_{unrealized} = -B_{root}$$

直接对根节点 `balance_children` 取负。此时前两步插入 Equity 的金额之和为：

$$C_{conv} + C_{unrealized} = -\text{AT\_COST}(B_{root}) + (-B_{root})$$

**第 3 步 — 结转本期损益（Current Earnings）**

$$C_{earnings} = B_{Income}^{children} + B_{Expenses}^{children}$$

将收入和费用科目的累计余额（含所有子科目）合并插入到 `Equity:CurrentEarnings`。

### 2.4 借贷方向与负数平衡的处理

在 Beancount 的复式记账模型中，借贷方向通过**数值的正负号**天然表达：

| 科目类型 | 正常余额方向 | 数值符号 |
|---|---|---|
| Assets（资产） | 借方 | 正数 |
| Liabilities（负债） | 贷方 | 负数 |
| Equity（权益） | 贷方 | 负数 |
| Income（收入） | 贷方 | 负数 |
| Expenses（费用） | 借方 | 正数 |

`CounterInventory.add_inventory` 的核心是**按 key 逐项做 Decimal 加法**：

```python
def add_inventory(self, counter: CounterInventory) -> None:
    if not self:
        self.update(counter)
    else:
        self_get = self.get
        for key, num in counter.items():
            new_num = num + self_get(key, ZERO)
            if new_num == ZERO:
                self.pop(key, None)
            else:
                self[key] = new_num
```

关键特性：

1. **正负相消**：借方 +100 和贷方 -100 对同一 key 求和后为 0，自动从 inventory 中移除（`self.pop(key, None)`）。
2. **多币种独立**：每个 `(currency, cost)` 组合是一个独立 key，不同币种互不干扰。
3. **负号取反**：`CounterInventory.__neg__` 返回所有数值取反的新 inventory，用于生成汇兑差异和未实现损益的抵消项。

在 `cap` 执行后，理想情况下根节点的 `balance_children` 应趋近于零（资产 = 负债 + 权益 + 收入 - 费用 + 结转调整项），这正是资产负债表平衡的数学保证。

---

## 三、空流水父节点的隐藏逻辑

### 3.1 后端数据供给

`TreeNode` 的 `has_txns` 属性是判断节点是否有直接交易流水的唯一标志：

- **构造函数中**：`self.get(account, insert=True)` 仅创建节点，`has_txns` 保持 `False`。
- **insert 方法中**：`node.has_txns = True`，仅当账户确实拥有 posting 余额时才设置。

因此，一个仅因作为子科目路径前缀而被自动创建的父节点（如 `Assets:Current`），其 `has_txns` 为 `False`，`balance` 为空，但 `balance_children` 可能为非零（因为子科目的余额已向上传播）。

### 3.2 前端递归过滤

[helpers.ts](file:///e:/solo-code-2/fava/frontend/src/tree-table/helpers.ts#L43-L61) 中的 `should_show_recursive` 函数实现了核心过滤逻辑：

```typescript
const should_show_recursive = (n: AccountTreeNode): boolean => {
    // 优先级 1：有可见后代 或 累计余额非空 → 必须显示
    if (
        n.children.map(should_show_recursive).some((b) => b) ||
        !is_empty(n.balance_children)
    ) {
        return true;
    }
    // 优先级 2：检查隐藏条件
    if (
        !$accounts_set.has(n.account) ||
        (!$show_closed_accounts && $is_closed_account(n.account, end)) ||
        (!$show_accounts_with_zero_balance && is_empty(n.balance)) ||
        (!$show_accounts_with_zero_transactions && !n.has_txns)
    ) {
        not_shown.add(n.account);
        return false;
    }
    return true;
};
```

### 3.3 判断流程详解

对于"父级科目无交易流水，但子科目有非零余额"的场景，判断过程如下：

```
父节点 P（has_txns=false, balance={}, balance_children={USD: 500}）
  └── 子节点 C（has_txns=true, balance={USD: 500}, balance_children={USD: 500}）
```

1. **评估子节点 C**：
   - `n.children.map(...).some(...)` → 无子节点，空数组 `.some()` 为 `false`
   - `!is_empty(n.balance_children)` → `true`（余额非空）
   - → 返回 `true`，C 需要显示

2. **评估父节点 P**：
   - `n.children.map(should_show_recursive).some(...)` → C 返回了 `true`，所以 `.some()` 为 `true`
   - → 返回 `true`，P 也必须显示

**关键设计**：优先级 1 中的两个条件构成"保底显示"机制——

| 条件 | 语义 |
|---|---|
| `children.map(...).some((b) => b)` | 至少有一个后代需要显示 → 父节点作为路径必须保留 |
| `!is_empty(n.balance_children)` | 累计余额非空 → 即使所有子节点都被隐藏，也必须展示此节点以呈现余额 |

只有当两个保底条件都不满足时（所有后代均隐藏 **且** `balance_children` 为空），才进入优先级 2 的隐藏条件判断。此时若无交易流水且用户未开启"显示零交易账户"选项，该空流水父节点才会被隐藏。

### 3.4 特殊场景：过滤后子科目余额归零

若时间/标签过滤使得子科目的所有交易都被排除，则：

1. 子科目的 `balance` 和 `balance_children` 均为空（Tree 在构造时就基于过滤后的 entries）
2. 子节点的 `should_show_recursive` 在优先级 1 两个条件都为 `false`
3. 进入优先级 2：若 `!n.has_txns`（过滤后无交易）且未开启零交易显示 → 子节点被隐藏
4. 父节点重新评估：`children.map(...).some()` → `false`，`!is_empty(balance_children)` → `false`
5. 父节点也进入优先级 2 判断，同样可能被隐藏

这确保了过滤后的报表不会出现无意义的空壳层级。

---

## 四、总结

| 机制 | 核心实现 | 设计要点 |
|---|---|---|
| 扁平→层级建树 | `get()` 递归 + `account_parent()` 冒号拆分 | 字典保证 O(1) 查找，递归保证路径完整性 |
| 余额向上传播 | `insert()` + `ancestors()` 生成器 | `balance` 记录自身，`balance_children` 记录累计 |
| 期末结转 | `cap()` 三步插入 Equity 虚拟科目 | 正负号天然表达借贷，零值自动消除保证平衡 |
| 空节点过滤 | 前端 `should_show_recursive` | 双重保底（有可见后代 或 累计非零）优先于隐藏条件 |
