# DaybydayCRM 路由权限与方法别名深度分析

## 一、权限检查为何不能靠通用中间件一次性覆盖

### 1.1 四个中间件的职责边界

在 [Kernel.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Kernel.php#L74-L78) 中注册了四个中间件别名，对应四个独立的中间件类：

| 别名 | 中间件类 | 检查的权限 |
|------|---------|-----------|
| `task.update.status` | `CanTaskUpdateStatus` | `TASK_UPDATE_STATUS`（task-update-status） |
| `task.assigned` | `IsTaskAssigned` | `TASK_ASSIGN`（can-assign-new-user-to-task） |
| `lead.assigned` | `IsLeadAssigned` | `LEAD_ASSIGN`（can-assign-new-user-to-lead） |
| `lead.update.status` | `CanLeadUpdateStatus` | `LEAD_UPDATE_STATUS`（lead-update-status） |

每个中间件在 [TasksController](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/TasksController.php#L43-L63) 和 [LeadsController](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/LeadsController.php#L35-L42) 的构造函数中按动作精确挂载：

```php
// TasksController
$this->middleware('task.update.status', ['only' => ['updateStatus']]);
$this->middleware('task.assigned', ['only' => ['updateAssign', 'updateTime']]);

// LeadsController
$this->middleware('lead.assigned', ['only' => ['updateAssign']]);
$this->middleware('lead.update.status', ['only' => ['updateStatus']]);
```

### 1.2 无法合并的根本原因

#### (1) 权限名称不同，权限语义不同

四个中间件检查的是 [PermissionName](file:///e:/solo-code-2/DaybydayCRM/app/Enums/PermissionName.php#L65-L69) 枚举中四个完全独立的权限值：

- `TASK_UPDATE_STATUS = 'task-update-status'`
- `TASK_ASSIGN = 'can-assign-new-user-to-task'`
- `LEAD_ASSIGN = 'can-assign-new-user-to-lead'`
- `LEAD_UPDATE_STATUS = 'lead-update-status'`

一个「通用中间件」若想一次性覆盖，必须动态推断当前请求属于哪个域（Task 还是 Lead）、哪个动作（updateStatus 还是 updateAssign），然后映射到正确的权限名称。这种动态推断存在三个问题：

- **路由推断不可靠**：路由路径如 `/tasks/updatestatus/{id}` 和 `/leads/updatestatus/{id}` 结构对称，但中间件拿到的是解析后的请求对象，必须从 URL 字符串中解析域和动作，耦合了路由命名约定。
- **权限名称映射是硬编码的**：即使通过路由参数推断出「这是一个 Task 的 updateStatus 请求」，仍然需要硬编码一张映射表（动作×域 → 权限名），这张表本质上就是把四个中间件的逻辑搬进了一个大的 switch-case 里。
- **权限语义不通用**：「更新状态」和「重新分配」在业务语义上完全不同。`TASK_UPDATE_STATUS` 控制的是能否改变任务的完成状态，而 `TASK_ASSIGN` 控制的是能否改变任务的负责人。一个用户可能被授予前者但不授予后者。

#### (2) Task 与 Lead 的域差异

两个模型虽然字段高度相似（都有 `status_id`、`user_assigned_id`、`deadline`），但业务域的差异决定了权限必须隔离：

- **生命周期不同**：Task 是运营工作项，状态流转围绕「完成/未完成」；Lead 是销售线索，状态流转围绕「赢单/输单/跟进」。
- **状态值不通用**：Task 使用 `TaskStatus` 枚举，Lead 使用 `LeadStatus` 枚举，状态表中通过 `source_type` 区分。一个 Task 状态的 `status_id` 不能用于更新 Lead，反之亦然。这在 [UpdateTaskStatusRequest](file:///e:/solo-code-2/DaybydayCRM/app/Http/Requests/Task/UpdateTaskStatusRequest.php#L45-L53) 的 `withValidator` 中已有体现——它明确校验 `status_id` 属于 `Status::typeOfTask()`。
- **权限粒度是业务需求**：在 [PermissionName::grouping()](file:///e:/solo-code-2/DaybydayCRM/app/Enums/PermissionName.php#L263-L267) 中，Task 相关权限归为 `task` 组，Lead 相关权限归为 `lead` 组。角色权限分配页面会按组展示，管理员可以精确控制「谁能操作任务、谁能操作线索」。

#### (3) 拆分后避免的越权误判

如果合并为一个通用中间件，最容易出现的越权场景是：

- **跨域授权泄漏**：假设中间件逻辑是「检查请求 URL 中的模型类型，然后验证 `{model}-update-status` 权限」。如果 URL 解析出错（如 `/tasks/updatestatus/xxx` 被错误识别为 Lead 域），会导致本应检查 `task-update-status` 却检查了 `lead-update-status`，从而让一个没有任务权限但有线索权限的用户越权通过。
- **动作混淆**：`updateAssign` 和 `updateStatus` 都带 `update` 前缀，通用中间件容易将「分配权限」和「状态权限」混为一谈。拆分后每个中间件只对应一个精确的权限名，不存在歧义。
- **新增动作不连锁**：如果未来为 Task 新增 `updatePriority` 动作，只需添加一个新中间件 `CanTaskUpdatePriority`，不会影响已有的 `CanTaskUpdateStatus` 和 `IsTaskAssigned`。通用中间件则需要修改映射表，引入回归风险。

---

## 二、任务重新分配后的过期请求应在哪一层被拒绝

### 2.1 场景描述

> 假设一个任务刚刚被重新分配给别的用户，原负责人仍然点击更新状态按钮。

### 2.2 最该拒绝的层级：控制器方法内部（或 Service 层）

中间件层做不到这件事。原因是：

- **四个中间件只检查「角色是否拥有该权限」**，不检查「该用户是否仍是这个任务的负责人」。`CanTaskUpdateStatus` 的核心逻辑就是一行 `$user->can(PermissionName::TASK_UPDATE_STATUS->value)`，它不读取任务数据，不比较 `user_assigned_id`。
- 即使想扩展中间件来做归属检查，中间件在路由绑定完成后才执行，但它拿到的 `$request` 中只有 URL 参数 `external_id`，没有 Task 模型实例。要获得模型实例，需要再次查询数据库，这和在控制器里查没有本质区别，却多了一层路由参数解析的耦合。

正确的拒绝位置是在 [TasksController::updateStatus()](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/TasksController.php#L226-L276) 中，在 `$this->findByExternalId($external_id)` 获取到 Task 模型之后：

```php
$task = $this->findByExternalId($external_id);

// 应在此处增加归属校验
if ($task->user_assigned_id !== auth()->id()) {
    // 拒绝请求
}
```

同理，`updateAssign`、`updateDeadline` 等涉及特定 Task/Lead 操作的方法也应在此层做归属校验。

### 2.3 拒绝依据的数据：重新读取的 `user_assigned_id`

拒绝的依据是 **数据库中当前存储的 `user_assigned_id`**，必须与 `auth()->id()` 比较。

**关键：这类数据必须在校验时重新读取**，原因：

- **竞态条件（Race Condition）**：用户在页面加载时看到「自己是负责人」，但在他点击提交的瞬间，任务可能已被管理员重新分配给别人。页面上的 Vue/Blade 数据是页面渲染时刻的快照，不是实时的。
- **前端状态不可信**：Blade 模板渲染时 `$tasks->user_assigned_id` 已经固化在 HTML 中；Vue 组件中的 `this.lead.user_assigned_id` 也是组件挂载时的快照。攻击者（或过期页面）可以构造带有旧 `user_assigned_id` 的请求。
- **中间件也无法解决**：即使中间件能读取 Task，它执行时路由绑定已经完成，但绑定的是 URL 的 `external_id`，Task 实例是由 [HasExternalId](file:///e:/solo-code-2/DaybydayCRM/app/Traits/HasExternalId.php) trait 在每次请求中重新查询的。所以拒绝逻辑放在控制器中更直观——它已经拿到了 Task 实例。

结论：**归属校验必须基于数据库实时读取的 `user_assigned_id`，与当前认证用户 ID 比较，不依赖前端传递的任何归属信息**。

---

## 三、PATCH 与 POST 双别名并存的影响

在 [routes/web.php](file:///e:/solo-code-2/DaybydayCRM/routes/web.php#L68-L94) 中，tasks 和 leads 的多个操作同时注册了 PATCH 和 POST 两个路由：

```php
// Tasks
Route::patch('/updatestatus/{external_id}', 'TasksController@updateStatus')->name('task.update.status');
Route::patch('/updateassign/{external_id}', 'TasksController@updateAssign')->name('task.update.assignee');
Route::post('/updatestatus/{external_id}', 'TasksController@updateStatus');   // 无 name
Route::post('/updateassign/{external_id}', 'TasksController@updateAssign');   // 无 name
Route::patch('/update-deadline/{external_id}', 'TasksController@updateDeadline')->name('task.update.deadline');

// Leads
Route::patch('/updateassign/{external_id}', 'LeadsController@updateAssign')->name('leads.updateAssign');
Route::post('/updateassign/{external_id}', 'LeadsController@updateAssign');    // 无 name
Route::patch('/updatestatus/{external_id}', 'LeadsController@updateStatus')->name('lead.update.status');
Route::post('/updatestatus/{external_id}', 'LeadsController@updateStatus');    // 无 name
Route::patch('/update-deadline/{external_id}', 'LeadsController@updateDeadline')->name('lead.update.deadline');
```

### 3.1 表单重复提交

HTML `<form>` 原生只支持 `GET` 和 `POST` 方法。在 [tasks/_sidebar.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/tasks/_sidebar.blade.php#L13-L28) 和 [leads/_sidebar.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/leads/_sidebar.blade.php#L13-L29) 中，所有状态更新和分配表单都使用 `method="POST"`：

```blade
<form method="POST" action="{{url('tasks/updatestatus', $tasks->external_id)}}">
```

如果只有 PATCH 路由，这些表单将无法工作。POST 别名的存在就是为了兼容 HTML 表单。

**风险点**：

- **同一操作有两个入口**：PATCH 的路由命名为 `task.update.status`，而 POST 路由没有命名，只能通过 URL 路径匹配。如果 POST 路由被误删（或在重构中被遗漏），表单提交会返回 405 Method Not Allowed。
- **重复提交防护**：Laravel 的 CSRF 中间件对两种方法都生效，但如果业务层没有做幂等处理（如先查询再更新），用户快速双击可能导致两次更新。
- **路由缓存差异**：`route('task.update.status')` 始终指向 PATCH 路由，但 Blade 模板用的是 `url('tasks/updatestatus', ...)`，这绕过了路由名称，直接拼接 URL。如果未来修改了路由路径，Blade 中的 `url()` 调用不会自动跟随变更。

### 3.2 前端 AJAX 兼容性

前端存在两种调用模式：

**Blade 表单提交（POST）：**
- 走标准 HTML 表单 → POST 路由 → 控制器 → `redirect()->back()`
- [tasks/_sidebar.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/tasks/_sidebar.blade.php#L67-L81) 中的状态选择器 `onchange="this.form.submit()"` 就是这种模式

**Vue 组件 AJAX 调用（POST）：**
- [LeadSidebar.vue](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/LeadSidebar.vue#L162-L176) 中 `closeLead()` 和 `reopenLead()` 使用 `axios.post('/leads/updatestatus/' + ...)`
- 注意：它发的也是 POST，不是 PATCH

**E2E 测试调用（PATCH）：**
- [tests/e2e/feature/tasks/tasks.feature.spec.ts](file:///e:/solo-code-2/DaybydayCRM/tests/e2e/feature/tasks/tasks.feature.spec.ts#L68) 中 `request.patch('/tasks/updatestatus/' + taskExternalId, {...})` 走的是 PATCH 路由

双别名使得前端可以自由选择 HTTP 方法，但也引入了问题：

- **方法不一致**：同一个资源的更新操作，有的前端用 POST，有的用 PATCH。如果后端只维护其中一个方法的路由，部分前端会失效。
- **CSRF Token 处理差异**：Axios 自动附加 X-CSRF-TOKEN 头（通过 `XSRF-TOKEN` cookie），而 HTML 表单依赖 `{{csrf_field()}}` 渲染的隐藏 input。两种方式都能通过 CSRF 中间件，但如果 CSRF 配置变更（如改为仅验证特定方法），两个入口需要同时调整。
- **后端代码分支**：控制器的 `updateStatus` 方法不区分请求方法，但 `$request->expectsJson()` 会根据 `Accept` 头或 `X-Requested-With` 头判断是否 AJAX 请求，从而返回 JSON 或 Redirect。POST 表单提交和 POST AJAX 调用虽然方法相同，但响应格式不同，增加了测试复杂度。

### 3.3 幂等语义判断

PATCH 和 POST 在 HTTP 规范中有不同的幂等语义：

| 方法 | 幂等性 | 规范含义 |
|------|--------|---------|
| **PATCH** | 非幂等（但通常被当作部分更新的幂等操作使用） | 对资源做部分修改 |
| **POST** | 非幂等 | 创建子资源或执行非幂等操作 |

在 DaybydayCRM 的场景中：

- **updateStatus**：将任务/线索的状态从一个值改为另一个值。如果请求被重复发送两次，结果相同（状态仍为目标值），实际上具备幂等性。
- **updateAssign**：将负责人从 A 改为 B。重复发送也只停留在 B，幂等。
- **updateDeadline**：将截止日期改为新值。重复发送也只停留在新值，幂等。

所以从业务效果看，这三个操作都是幂等的。用 PATCH 还是 POST 取决于调用方的习惯，而非业务必需性。

**但双别名带来的语义混淆**：

- 如果 API 文档只记录了 PATCH 路由，用 POST 调用的前端（如 LeadSidebar.vue 的 `axios.post`）看起来像是在「违反规范」，但实际上是被允许的。
- 如果某个缓存层（如 CDN、反向代理）基于 HTTP 方法做缓存策略，PATCH 响应可能被缓存而 POST 响应不会。两个入口产生不同的缓存行为，可能导致前端拿到过期数据。
- Laravel 的路由匹配是按方法区分的，同一个 URL 注册两种方法后，框架会在路由表中产生两条记录。如果两条记录的中间件挂载不同（当前代码中中间件是在控制器构造函数中挂载的，对两种方法都生效），行为一致；但如果将来有人只给 PATCH 路由添加了中间件，POST 路由就会绕过该中间件。

### 3.4 接口文档维护

双别名对文档维护产生以下影响：

- **路由表膨胀**：`php artisan route:list` 会显示两条路径完全相同、仅方法不同的记录（一条 PATCH、一条 POST）。对于 tasks 和 leads 各三条操作，至少多出 6 条路由记录，增加了阅读成本。
- **命名不统一**：PATCH 路由有 `name()`，POST 路由没有。文档中引用路由名称时，只能指向 PATCH 版本，但实际代码中有些地方用 `url()` 构造 POST 路径，文档无法准确描述「哪个 URL 对应哪种调用方式」。
- **OpenAPI/Swagger 生成困难**：如果使用自动文档生成工具（如 L5-Swagger），同一 URL 的两个方法会被生成为两个独立的 API 端点，文档阅读者会困惑于「为什么同一个操作有两个接口」。
- **升级迁移成本**：如果未来决定只保留 PATCH（符合 RESTful 规范），需要逐一排查所有 POST 调用点并改为 PATCH。目前已知的 POST 调用点包括：
  - Blade 模板中的 HTML 表单（需要改为 `method="POST"` + `@method('PATCH')` 或改用 AJAX + `axios.patch`）
  - LeadSidebar.vue 中的 `axios.post`（改为 `axios.patch`）
  - 任何第三方集成中可能存在的 POST 调用

### 3.5 总结

| 影响维度 | 具体表现 | 严重程度 |
|---------|---------|---------|
| 表单重复提交 | 同一操作双入口，POST 被删则表单失效 | 中 |
| AJAX 兼容性 | 不同前端用不同方法，重构易遗漏 | 中 |
| 幂等语义 | 业务上幂等但 HTTP 方法语义不一致，缓存策略可能混乱 | 低-中 |
| 文档维护 | 路由表膨胀、命名不统一、生成工具困惑 | 低 |
| 中间件一致性 | 两个方法共享同一控制器方法但路由独立，中间件可能不对称 | 高（潜在风险） |

根本解决方案是：在 Blade 表单中使用 `@method('PATCH')` 伪造方法，让所有更新操作统一走 PATCH 路由；同时将 Vue 组件中的 `axios.post` 改为 `axios.patch`。这样可以删除 POST 别名，减少路由表膨胀，同时保持 RESTful 一致性。但需要确保所有调用点都已迁移，且 HTML 表单通过 `_method` 隐藏字段正确传递 PATCH 方法。
