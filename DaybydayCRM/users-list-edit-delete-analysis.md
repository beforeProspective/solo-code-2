# DaybydayCRM 用户模块列表 / 编辑 / 删除 深度分析

本文基于 DaybydayCRM 项目实际代码，从前端视图、后端控制器、服务层三层面对用户模块的「列表（DataTables serverSide）」「编辑（复用 form.blade.php）」「删除（模态框 + AJAX + 转移策略）」三条链路逐一说明其协作方式与设计动机。

---

## 一、用户列表页：serverSide 表格、view/edit 动作列与权限条件的协作

### 1.1 路由注册

在 [routes/web.php](file:///e:/solo-code-2/DaybydayCRM/routes/web.php#L25-L33) 中同时声明了数据接口和资源路由：

```php
Route::get('/data', 'UsersController@anyData')->name('users.data');
// ...
Route::resource('users', 'UsersController');
```

- `users.data` → 供 DataTables Ajax 拉取 JSON；
- `users.index` / `users.show` / `users.edit` → 由资源路由自动生成。

### 1.2 视图：空表格 + JS 初始化

[resources/views/users/index.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/users/index.blade.php#L7-L18) 只输出一个空 `<table id="users-table">` 表头，真正的数据由 `@push('scripts')` 里的 jQuery DataTables 异步填充：

```js
$('#users-table').DataTable({
    processing: true,
    serverSide: true,
    ajax: '{!! route('users.data') !!}',
    columns: [
        {data: 'namelink', name: 'name'},
        {data: 'email',      name: 'email'},
        {data: 'primary_number', name: 'primary_number'},
        {data: 'view', ...},
        @if(Entrust::can('user-update'))
        {data: 'edit', ...},
        @endif
    ]
});
```

关键点：

1. **`serverSide: true`** 表示分页、排序、搜索全部由后端计算，前端只渲染当前页。这样即便用户表达到数万行，首屏也不会一次性把 HTML 全部下发，符合 CRM 场景的可扩展性。
2. **列定义在 Blade 中用 `@if(Entrust::can('user-update'))` 条件包裹**：
   - `view` 列对所有登录用户渲染；
   - `edit` 列只有具备 `user-update` 权限的用户才会被输出到最终 HTML（因此在浏览器里根本看不到该列的 DOM，而不是"隐藏"一个按钮）。
   - `delete` 列在代码里被整块注释（见 `index.blade.php` 第 140–144 行与 `UsersController::anyData` 第 85–87 行），说明删除动作不打算作为表格行内普通按钮出现，而是统一走模态框。

### 1.3 控制器：`anyData` 用 Yajra DataTables 拼装 HTML 按钮

[UsersController::anyData](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/UsersController.php#L73-L90)：

```php
$users = User::query()->select(['id', 'external_id', 'name', 'email', 'primary_number']);

return Datatables::of($users)
    ->addColumn('namelink', '<a href="{{ route("users.show",[$external_id]) }}">{{$name}}</a>')
    ->addColumn('view', function ($user) {
        return '<a href="' . route('users.show', $user->external_id) . '" class="btn btn-link">' . __('View') . '</a>';
    })
    ->addColumn('edit', function ($user) {
        return '<a href="' . route('users.edit', $user->external_id) . '" class="btn btn-link">' . __('Edit') . '</a>';
    })
    ->rawColumns(['namelink', 'view', 'edit', 'delete'])
    ->make(true);
```

这里是 serverSide 与动作列真正耦合的地方：

- `select(['id', 'external_id', ...])` 只取表格真正需要的字段，避免把 `password`、`remember_token` 等字段暴露给前端。
- `addColumn` 注入的不是纯数据，而是**拼好的 HTML 片段**（链接），并通过 `rawColumns` 告诉 DataTables 不要对 HTML 做转义。于是每一行的"查看 / 编辑"按钮都是后端生成的，前端只是按列渲染。
- `edit` 列生成时**后端不再二次鉴权**——因为 Blade 里已经把该列的声明整个 `@if` 掉了，请求自然不会带这个列；如果列声明存在，则每一行都返回 edit 链接。这是"双重门闸"的第一层：客户端不渲染，第二层由路由中间件兜底（见下）。

### 1.4 后端兜底的权限中间件

即便有人手动构造 `users.edit` URL，[UsersController::__construct](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/UsersController.php#L33-L43) 依然会拦住：

```php
$this->middleware('user.create',            ['only' => ['create']]);
$this->middleware('is.demo',               ['only' => ['update', 'destroy']]);
$this->middleware(function ($request, $next) {
    abort_unless(auth()->check() && auth()->user()->can('user-delete'), 403);
    return $next($request);
},                                          ['only' => ['destroy']]);
$this->middleware('permission:user-update', ['only' => ['edit']]);
```

而 `edit` 动作调用的 `UpdateUserRequest::authorize()` 再次用 `auth()->user()->can('user-update')` 做第三次鉴权（见下文 2.2）。这形成了"**表格不渲染列 → 路由中间件 → FormRequest authorize**"的三层纵深防御，任意一层被绕过都会失败。

### 1.5 为什么删除动作走模态框 + AJAX，而不是表格里放普通提交按钮

`index.blade.php` 第 21–95 行定义了一个 `#myModal` 模态框，里面包含三组 select：**任务处理、线索处理、客户处理**，每组都有"全部删除 / 全部迁移"，选择迁移时会再弹一个"迁移到哪位用户"的下拉。点击 `#confirm_delete` 后才发起 AJAX：

```js
$.ajax({
    url: '{{url('/users')}}' + "/" + external_id,
    type: 'DELETE',
    headers: { 'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content') },
    data: {
        tasks: handle_tasks, leads: handle_leads, clients: handle_clients,
        task_user: tasks_user, lead_user: leads_user, client_user: clients_user,
    },
    complete: function () { location.reload(); }
});
```

这种设计背后有四个理由：

1. **删除不是一个原子动作**。用户与 `Task`、`Lead`、`Client` 之间都有外键/业务关联，不能简单 `DELETE FROM users WHERE id = ?`。业务上必须先决定"这些关联数据怎么处置"，而这组决策选项（迁移目标用户、是否级联删除）无法在一行表格里塞下。
2. **需要交互收集额外字段**。模态框内的"选择新负责人"是动态下拉，且与"是否迁移"互斥显示（`#handle_tasks` 的 change 事件控制 `#assign_tasks` 的显隐）。这个交互用纯 HTML 提交按钮无法做到，必须走 JS。
3. **不能阻塞表格重绘**。DataTables 在 serverSide 模式下频繁刷新，如果把"删除"作为一个普通 submit，用户点按钮时可能正处于 AJAX 重绘间隙，表单会丢失。用独立 AJAX 请求并在 `complete` 中 `location.reload()`，保证操作语义独立于表格生命周期。
4. **天然的"确认"机制**。普通提交按钮一旦被误触就立刻执行；模态框把"危险操作"的门槛提到"打开 → 选择处置策略 → 二次点击确认"，降低误删概率，也符合 UX 中"破坏性动作必须有二次确认"的通用惯例。

> 注意：当前代码里 `anyData` 的 `delete` 列和 DataTables 配置里的 `delete` 列都被注释掉了（[UsersController.php#L85-L87](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/UsersController.php#L85-L87)、[index.blade.php#L140-L144](file:///e:/solo-code-2/DaybydayCRM/resources/views/users/index.blade.php#L140-L144)）。这意味着真正的删除入口目前是页面外的其他动作（例如 show 页或手动发请求）。模态框仍然保留，说明删除流程的设计意图没有被放弃，只是暂时隐藏了行内入口。

---

## 二、编辑页：前端控件、请求校验、UserUpdateService 的职责边界

### 2.1 视图：`edit.blade.php` + 复用 `form.blade.php`

[resources/views/users/edit.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/users/edit.blade.php#L9-L17) 只包一层 `<form>`，把真正的字段通过 `@include('users.form', ...)` 复用：

```blade
<form action="{{route('users.update', [$user->external_id])}}"
      method="POST" enctype="multipart/form-data" data-file="true">
    @method('PATCH')
    @csrf
    @include('users.form', ['submitButtonText' => __('Update user')])
</form>

@push('scripts')
@include('images._uploadAvatarPreview')
@endpush
```

复用同一个 `form.blade.php` 意味着**创建和编辑共用字段布局**，由是否传入 `$user` 变量区分两种模式：

- 角色 / 部门下拉：`$user->userRole?->role_id` 与 `$user->department?->first()?->id` 决定 `selected`；
- 密码区域：只有 `auth()->user()->canChangePasswordOn($user)` 时才渲染，并且创建时 `password` 是必填、编辑时是可选（见下文校验）；
- 语言单选：`isset($user) && strtolower($user->language) == "dk"` 控制 `checked`；
- 头像预览：`$user->avatar` 访问器返回 `Storage::url()` 或默认图，编辑时显示已有头像；创建时显示默认图。

`edit.blade.php` 最后 `@push('scripts')` 引入了 `images._uploadAvatarPreview` 片段，它为头像 input 绑定 `loadPreview(this)`（在 [form.blade.php#L22](file:///e:/solo-code-2/DaybydayCRM/resources/views/users/form.blade.php#L22) 里 `onchange="loadPreview(this);"`），这是**纯前端控件**：选图后立即把 `<img#preview_avatar>` 换成本地 DataURL，让用户在提交前就能预览。

### 2.2 后端请求校验：`UpdateUserRequest`

[app/Http/Requests/User/UpdateUserRequest.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Requests/User/UpdateUserRequest.php) 的职责是"**格式 + 授权层**"：

- `authorize()`：`auth()->user()->can('user-update')` —— 没有更新权限的请求直接 403；
- `rules()`：声明字段类型、长度、存在性（例如 `role` / `department` 必须是 `exists:roles,id` / `exists:departments,id`，`password` 是 `sometimes` 等）；
- `validationData()`：这是一个**关键的重写**——在进入真正的 `Validator` 之前，先判断当前登录用户是否有权修改目标用户的密码：

```php
if ($targetUser && ! auth()->user()->canChangePasswordOn($targetUser)) {
    unset($data['password'], $data['password_confirmation']);
}
```

为什么要这样做？因为 `form.blade.php` 虽然用 Blade 条件隐藏了密码输入框，但攻击者可以构造请求手动注入 `password=xxx`。如果不把这些字段从校验数据里剔除，规则会被执行，`Hash::make` 会把一个未经授权的新密码写入数据库。因此 `validationData()` 承担了**前端隐藏之后的后端补刀**。

### 2.3 服务层：`UserUpdateService` 处理"业务不变量"

[app/Services/User/UserUpdateService.php](file:///e:/solo-code-2/DaybydayCRM/app/Services/User/UserUpdateService.php) 封装两个动作：

1. `prepareValidatedInput(...)`：把 FormRequest 已经通过校验的原始输入转成"能直接 `fill` 到模型"的数组。
   - 若无权改密码 → `unset($input['password'], ...)`；
   - 若密码非空 → `Hash::make`；若空 → 保留原值（unset），这就是"编辑时密码可选"的真正实现；
   - 若上传了头像 → `Storage::put($companyExternalId, $imageFile)` 把文件写入磁盘并返回路径。
2. `syncRoleAndDepartment(...)`：同步角色和部门多对多关系。

```php
$owners = User::whereHas('roles', function ($query) {
    $query->where('name', RoleType::OWNER->value);
})->count();

$currentRole = $user->roles->first();
if ($currentRole && $currentRole->name === RoleType::OWNER->value && $owners <= 1) {
    return false;
}

$user->roles()->sync([$roleId]);
$user->department()->sync([$departmentId]);
```

### 2.4 角色或部门变更为什么不能只靠表单提交值本身

这是整个编辑链路最容易被忽视的点。表单只给出：

- `role = 3`（目标角色 ID）
- `department = 5`（目标部门 ID）

但从"旧角色 → 新角色"这个动作本身，业务上需要知道**旧值是什么**，因为有一个不变量：**系统中必须至少保留一个 owner**。

看 `syncRoleAndDepartment` 的逻辑：

- 如果当前被编辑的用户 **原本就是** `owner`，并且整个系统 `owner` 数 ≤ 1，那么拒绝变更（返回 `false`，控制器再把警告闪回给前端）；
- 这种场景下表单值 `role = 非 owner` 是"合法"的（通过了 `exists:roles,id`），但业务上不可行，而表单根本不携带"旧角色"信息。

同理，部门虽然没有硬性不变量，但它和角色一样是 **多对多（`role_user` / `department_user`）关系**，不能直接 `$user->role_id = xxx`，必须调用 `sync()`。`sync()` 同时也会处理"把用户从旧部门移出"的副作用，这同样需要知道旧值，而旧值只能从数据库读取，不是表单提交带过来的。

归纳一下：

| 层 | 关注点 | 是否依赖"旧值" |
|---|---|---|
| 前端控件 | 展示、预览、初始选中 | 需要（决定初始选中态） |
| `UpdateUserRequest` | 授权、格式、存在性 | 部分需要（鉴权时要知道目标用户是不是 owner） |
| `UserUpdateService::prepareValidatedInput` | 密码 hash、头像落盘 | 不需要 |
| `UserUpdateService::syncRoleAndDepartment` | 多对多同步 + 不变量 | **必须** |

这解释了为什么"角色/部门变更是 Service 的职责"：它需要**读数据库**而不是只读请求体。

### 2.5 控制器层的编排

[UsersController::update](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/UsersController.php#L284-L309) 把三层串起来：

```php
$validated  = $request->validated();
$role       = $validated['role'] ?? null;
$department = $validated['department'] ?? null;

$input = $userUpdateService->prepareValidatedInput(auth()->user(), $user, $validated, $request->file('image_path'));
$user->fill($input)->save();

if ($role !== null || $department !== null) {
    if (! $userUpdateService->syncRoleAndDepartment(auth()->user(), $user, (int) ($role ?? 0), (int) ($department ?? 0))) {
        session()->flash('flash_message_warning', __('Not able to change owner role, please choose a new owner first'));
    }
}
```

这里还有一个细节：**只有当请求里真的带了 `role` / `department` 字段时才同步**。因为前端在无权限修改角色时（`canChangeRole()` 返回 false），整个角色下拉都不会渲染，自然不会提交该字段；控制器用 `?? null` + 条件判断把这种情况安全跳过，避免"没选角色却把用户的角色清掉"。

---

## 三、删除用户：前端决策、额外字段收集与服务端执行

### 3.1 前端为什么必须先收集一组额外字段

从 [index.blade.php 模态框](file:///e:/solo-code-2/DaybydayCRM/resources/views/users/index.blade.php#L21-L95) 可见，一次删除至少要提交 6 个额外字段：

| 字段 | 含义 |
|---|---|
| `tasks` | `delete_all_tasks` / `move_all_tasks` |
| `leads` | `delete_all_leads` / `move_all_leads` |
| `clients` | `delete_all_clients` / `move_all_clients` |
| `task_user` | 当 `tasks=move_all_tasks` 时必填 |
| `lead_user` | 当 `leads=move_all_leads` 时必填 |
| `client_user` | 当 `clients=move_all_clients` 时必填 |

这组字段无法在表格行内表达，因为：

1. **数量多**。每行放 6 个 select 会把行高撑得巨大；
2. **强条件依赖**。`#handle_tasks` 的值决定 `#assign_tasks` 是否显示（见 `index.blade.php` 第 155–164 行），这种级联显示最自然的载体就是模态框；
3. **选择目标用户**需要把"除自己之外的用户列表"渲染到 `<select>`，而这个列表在 [UsersController::index](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/UsersController.php#L48-L51) 通过 `->withUsers(User::all())` 一次性下发给视图，再由 Blade 循环生成 option。如果用表格行内按钮，这个列表要么随每一行重复输出，要么需要 JS 动态请求——都比模态框的一次性渲染更复杂。

### 3.2 服务器端真正执行转移或删除

[UsersController::destroy](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/UsersController.php#L314-L342)：

```php
$user = $this->findByExternalId($external_id);

if ($user->hasRole('owner')) {
    session()->flash('flash_message_warning', __('Not allowed to delete super admin'));
    return redirect()->back();
}

if ($request->tasks == 'move_all_tasks' && $request->task_user != '') {
    $user->moveTasks($request->task_user);
}
if ($request->leads == 'move_all_leads' && $request->lead_user != '') {
    $user->moveLeads($request->lead_user);
}
if ($request->clients == 'move_all_clients' && $request->client_user != '') {
    $user->moveClients($request->client_user);
}

try {
    $user->delete();
    session()->flash('flash_message', __('User successfully deleted'));
} catch (QueryException $e) {
    session()->flash('flash_message_warning', __('User can NOT have, leads, clients, or tasks assigned when deleted'));
}
```

这里体现了"前端只做决策收集，真正的写操作在服务端"的分层原则：

- **`moveTasks` / `moveLeads` / `moveClients`**（[User.php#L172-L197](file:///e:/solo-code-2/DaybydayCRM/app/Models/User.php#L172-L197)）逐个把关联记录的 `user_assigned_id` / `user_id` 更新为目标用户，这是典型的"批量数据迁移"，必须在数据库事务语义下执行；
- **`$user->delete()`** 依赖上面三步已经清理或转移了所有外键关联，否则会抛 `QueryException`（外键约束）。控制器捕获该异常并给出"用户不能有未转移的关联"提示——这是**服务端的最终一致性校验**，即便前端声称"我都迁移了"，只要数据库里还存在关联就删不掉。
- **`hasRole('owner')` 的前置检查**：系统禁止删除超级管理员。这一步只能在服务端做——前端即便不渲染该用户的删除按钮，攻击者也可以直接发 `DELETE /users/{id}`。

注意三个 `moveXxx` 方法都没有做事务包裹，也没有校验 `$request->task_user` 是否存在。在生产上通常需要补上：

- 用 `DB::transaction(function () use (...) { ... })` 保证"迁移 + 删除"原子化；
- 校验 `task_user` / `lead_user` / `client_user` 确实是存在的、非自己的用户，避免前端传空或非法 ID。

当前代码里这些字段用 `!= ''` 的弱比较兜底，意味着：

- 如果前端选择了 "move" 但没选目标用户（或目标用户恰好被删掉），后端会静默跳过迁移并直接 `$user->delete()`，此时若有外键约束就会抛 `QueryException`，用户看到的只是"不能删"的提示，而不是"请选择目标用户"。
- 这是一个可以改进的点：应在进入 destroy 之前做一次显式校验（例如在 FormRequest 里声明条件规则）。

### 3.3 为什么表格里看到这条用户记录并不代表可以直接删

这是一个典型的"可见性 ≠ 可操作性"分离：

1. **可见性**由 `users.index` 的中间件控制（只要登录即可查看）；
2. **可删除性**由三层控制：
   - `UsersController` 构造器里的 `user-delete` 权限中间件（[第 37–41 行](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/UsersController.php#L37-L41)）；
   - `destroy` 方法内部的 `hasRole('owner')` 判断；
   - `destroy` 方法内部的 `is.demo` 中间件，禁止 demo 环境执行破坏性操作。
3. **数据完整性**还要求关联已被清理或迁移。即便有权限，如果用户还有未转移的 task/lead/client，`$user->delete()` 也会因外键约束失败。

因此"能看到一行"只是最宽松的条件；真正执行删除需要同时满足权限、角色不变量、数据一致性三个条件。模态框 + AJAX 的设计就是为了在**真正发起删除请求之前**把这三个条件尽可能前置地暴露给用户（选择迁移策略），但最终裁决权仍在服务器端。

---

## 四、小结

1. **列表页**：空表格 + DataTables serverSide + `anyData` 拼装 HTML 动作列 + Blade `@if(Entrust::can(...))` 动态决定列是否输出 + 路由 / 中间件 / FormRequest 多层鉴权，做到"能看到 ≠ 能操作"。
2. **编辑页**：`edit.blade.php` 薄壳 + `form.blade.php` 复用，前端控件负责展示与预览，`UpdateUserRequest` 负责授权与格式校验（尤其 `validationData()` 剔除非法 password 提交），`UserUpdateService` 负责密码 hash、头像落盘、角色/部门多对多同步以及"至少一个 owner"的业务不变量——这一步必须读数据库，不能只靠表单值。
3. **删除流程**：因为用户与 task / lead / client 有业务关联，删除本身是一个"多步决策 + 数据迁移"过程，模态框收集 6 个额外字段，AJAX 一并提交，`UsersController::destroy` 在服务端按顺序执行迁移 → 删除 → 异常兜底。表格里能看到某一行只代表可见性，不代表满足权限、角色不变量和数据一致性三个前置条件。

涉及的核心文件：

- [resources/views/users/index.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/users/index.blade.php)
- [resources/views/users/edit.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/users/edit.blade.php)
- [resources/views/users/form.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/users/form.blade.php)
- [app/Http/Controllers/UsersController.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/UsersController.php)
- [app/Http/Requests/User/UpdateUserRequest.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Requests/User/UpdateUserRequest.php)
- [app/Http/Requests/User/StoreUserRequest.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Requests/User/StoreUserRequest.php)
- [app/Services/User/UserUpdateService.php](file:///e:/solo-code-2/DaybydayCRM/app/Services/User/UserUpdateService.php)
- [app/Models/User.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/User.php#L172-L197)
- [routes/web.php](file:///e:/solo-code-2/DaybydayCRM/routes/web.php#L25-L33)
