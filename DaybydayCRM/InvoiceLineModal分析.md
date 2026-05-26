# InvoiceLineModal 弹窗逻辑分析

## 1. 弹窗接口调用决策逻辑与数据依赖

### 1.1 接口调用决策链

弹窗通过三个核心属性 `readOnly`、`isEditable` 和 `resource` 来决定调用哪个后端接口，决策逻辑如下：

**计算属性定义**（[InvoiceLineModal.vue#L198-L211](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/InvoiceLineModal.vue#L198-L211)）：
```javascript
readOnly() {
    if (this.external_id && !this.editMode) {
        return true;
    }
    return false;
},
isEditable() {
    return this.external_id && this.editMode;
}
```

**提交表单时的分支逻辑**（[InvoiceLineModal.vue#L314-L332](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/InvoiceLineModal.vue#L314-L332)）：

| 条件 | 调用接口 | 说明 |
|------|---------|------|
| `isEditable` 为 true | `POST /offer/{external_id}/update` | 编辑已存在的 offer 条目 |
| `isEditable` 为 false | `POST /invoice/create/{type}/{resource.external_id}` | 创建新的 invoice line |

### 1.2 初次加载与回显编辑数据的依赖

**初次加载（创建模式）**：
- 不需要预先拉取业务数据
- 初始化一个空的 lines 数组（[InvoiceLineModal.vue#L338-L349](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/InvoiceLineModal.vue#L338-L349)）
- 并行拉取两个基础数据：
  - `/products/data` - 产品列表用于下拉选择（[InvoiceLineModal.vue#L376-L378](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/InvoiceLineModal.vue#L376-L378)）
  - `/money-format` - 货币格式配置（[InvoiceLineModal.vue#L379-L381](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/InvoiceLineModal.vue#L379-L381)）

**回显编辑数据**（[InvoiceLineModal.vue#L354-L375](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/InvoiceLineModal.vue#L354-L375)）：
- 触发条件：`readOnly || isEditable` 为 true（即存在 external_id）
- 调用接口：`GET /offer/{useable_id}/invoice-lines/json`
- 数据转换：后端返回的 price 以分为单位存储，前端需要 `price / 100` 转换为元
- 数据结构映射：
  ```javascript
  invoiceLine.price = line.price / 100  // 分转元
  invoiceLine.title = line.title
  invoiceLine.type = line.type
  invoiceLine.comment = line.comment
  invoiceLine.quantity = line.quantity
  ```

---

## 2. 后端价格乘以100与状态校验的必要性

### 2.1 价格乘以100的原因

**后端代码**（[InvoicesController.php#L168](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/InvoicesController.php#L168)）：
```php
'price' => $request->price * 100,
```

**原因分析**：

1. **整数存储避免浮点数精度问题**
   - 金融计算中浮点数（如 0.1 + 0.2 ≠ 0.3）会导致精度丢失
   - 以"分"为单位用整数存储是行业标准做法
   - 数据库字段类型为整数，确保计算的精确性

2. **前后端数据约定**
   - 前端展示和用户输入以"元"为单位（更友好）
   - 后端存储和计算以"分"为单位（更精确）
   - 这是一种标准的货币金额处理模式

3. **不能信任前端计算**
   - 前端计算仅用于实时预览展示
   - 后端需要独立计算确保数据一致性
   - 前端数据可能被篡改（通过浏览器开发者工具）

### 2.2 invoice 状态校验的必要性

**后端代码**（[InvoicesController.php#L149-L153](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/InvoicesController.php#L149-L153)）：
```php
if (!$invoice->canUpdateInvoice()) {
    Session::flash('flash_message_warning', __("Can't insert new invoice line, to already sent invoice"));
    return redirect()->back();
}
```

**`canUpdateInvoice` 实现**（[Invoice.php#L81-L84](file:///e:/solo-code-2/DaybydayCRM/app/Models/Invoice.php#L81-L84)）：
```php
public function canUpdateInvoice(): bool
{
    return !$this->isSent();
}
```

**为什么不能完全信任前端**：

1. **前端校验可被绕过**
   - 用户可通过浏览器控制台修改 JavaScript 变量
   - 可直接构造 HTTP 请求发送到后端
   - 前端校验仅用于提升用户体验，不能作为安全屏障

2. **业务数据一致性要求**
   - 发票一旦发送（sent_at 有值），即产生法律效力
   - 修改已发送发票会导致财务数据不一致
   - 可能引发审计问题和法律风险

3. **状态机完整性**
   - 发票有明确的状态流转：草稿 → 已发送 → 已支付/已逾期
   - 后端强制校验确保状态机不会被破坏
   - 这是典型的"防御性编程"实践

---

## 3. 发票已发送后弹窗打开的三层拦截机制

### 3.1 三层拦截详解

#### 第一层：前端按钮控制

**代码位置**（[show.blade.php#L45-L63](file:///e:/solo-code-2/DaybydayCRM/resources/views/invoices/show.blade.php#L45-L63)）：
```blade
@if(Entrust::can('modify-invoice-lines'))
    @if(!$invoice->sent_at)
        <button id="time-manager">...</button>
    @endif
@endif
```

**拦截逻辑**：
- 检查 `$invoice->sent_at` 是否为空
- 发票已发送则不渲染"Insert new invoice line"按钮
- 用户无法通过正常界面触发弹窗
- 这是最外层的体验优化

#### 第二层：后端权限校验

**代码位置**（[InvoicesController.php#L142-L146](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/InvoicesController.php#L142-L146)）：
```php
if (!auth()->user()->can('modify-invoice-lines')) {
    session()->flash('flash_message_warning', __('You do not have permission to modify invoice lines'));
    return redirect()->route('invoices.show', $external_id);
}
```

**拦截逻辑**：
- 检查用户是否拥有 `modify-invoice-lines` 权限
- 无权限则直接拒绝访问并重定向
- 属于权限边界控制，防止越权操作

#### 第三层：业务状态校验（canUpdateInvoice）

**代码位置**（[InvoicesController.php#L149-L153](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/InvoicesController.php#L149-L153)）与（[Invoice.php#L81-L89](file:///e:/solo-code-2/DaybydayCRM/app/Models/Invoice.php#L81-L89)）：
```php
public function canUpdateInvoice(): bool
{
    return !$this->isSent();
}

public function isSent(): bool
{
    return $this->sent_at !== null;
}
```

**拦截逻辑**：
- 检查发票是否已发送（`sent_at !== null`）
- 已发送发票拒绝任何修改操作
- 这是业务规则的最后一道防线

### 3.2 最不该省略的一层

**结论：第三层 `canUpdateInvoice` 业务状态校验最不该省略**

**理由**：

1. **不可绕过性**
   - 前端按钮可通过 DOM 操作或直接输入 URL 绕过
   - 权限校验是通用权限，不针对特定业务状态
   - 只有状态校验是针对发票生命周期的强制规则

2. **数据一致性的最后保障**
   - 即使前端被篡改、权限配置错误
   - 业务状态校验仍能确保数据完整性
   - 这是"纵深防御"设计理念的体现

3. **业务规则的核心表达**
   - "已发送发票不可修改"是财务系统的核心业务规则
   - 这个规则应该在模型层面固化，不依赖外部调用者的判断
   - 符合"单一职责"和"高内聚"的设计原则

4. **调用者信任问题**
   - 模型方法可被多个控制器/服务调用
   - 每个调用者都需要重复判断会导致代码冗余和遗漏
   - 在模型层面统一校验确保所有调用路径都安全

**实际案例**：
- [InvoiceLineService.php](file:///e:/solo-code-2/DaybydayCRM/app/Services/InvoiceLine/InvoiceLineService.php) 中多处调用 `canUpdateInvoice()`
- 测试用例 [CanUpdateInvoiceTest.php](file:///e:/solo-code-2/DaybydayCRM/tests/Unit/Invoices/CanUpdateInvoiceTest.php) 专门验证此逻辑
- 说明这是一个被广泛依赖的核心业务规则
