# 首页路由 / 权限控制分析

涉及文件：

- [web.php](file:///E:/solo-code-2/speedtest-tracker/routes/web.php)
- [HomeController.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Controllers/HomeController.php)
- [PublicDashboard.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Middleware/PublicDashboard.php)
- [GettingStarted.php](file:///E:/solo-code-2/speedtest-tracker/app/Http/Middleware/GettingStarted.php)
- [AppServiceProvider.php](file:///E:/solo-code-2/speedtest-tracker/app/Providers/AppServiceProvider.php)
- [User.php](file:///E:/solo-code-2/speedtest-tracker/app/Models/User.php)
- [AdminPanelProvider.php](file:///E:/solo-code-2/speedtest-tracker/app/Providers/Filament/AdminPanelProvider.php)

---

## 一、当 `public_dashboard = true` 且访客直接访问 `/` 时，两层判断的关系

### 1. 调用顺序（按中间件优先级在路由上的声明顺序）

`/` 路由声明为：

```php
Route::get('/', HomeController::class)
    ->middleware(['getting-started', 'public-dashboard'])
    ->name('home');
```

Laravel 按数组顺序执行中间件，所以顺序是：

1. `GettingStarted`：检查是否存在 `status = Completed` 的 `Result`，没有则重定向到 `getting-started`。
2. `PublicDashboard`：调用 `Gate::denies('view-dashboard')`，若为 `true`（即“不允许查看”）则重定向到 `filament.admin.auth.login`；否则放行 `$next($request)`，进入 `HomeController` 渲染 `dashboard` 视图。

也就是说，`PublicDashboard` 中间件本身并不做独立判断，它**只是把权限问题委托给 `view-dashboard` 门**。

### 2. `view-dashboard` 门的定义（AppServiceProvider::defineGates）

```php
Gate::define('view-dashboard', function (?User $user) {
    if (config('speedtest.public_dashboard')) {
        return true;
    }
    if ($user === null) {
        return false;
    }
    return in_array($user->role, [UserRole::Admin, UserRole::User]);
});
```

当 `public_dashboard = true` 时，**不管当前是访客还是登录用户**，门都直接返回 `true`。于是：

- `Gate::denies('view-dashboard')` 等价于 `! Gate::allows('view-dashboard')` → `!true` → `false`；
- `PublicDashboard` 中间件里的 `if` 分支条件为 `false`，因此**不会重定向**，直接执行 `return $next($request)`。

### 3. 为什么会出现“两层判断却只需一层放行”

表面上看是两层：**中间件 PublicDashboard + 门 view-dashboard**，但实质是**中间件只是门的载体**，它通过 `Gate::denies('view-dashboard')` 把权限判定完全交给 `view-dashboard` 这一扇门来做。因此：

- 中间件本身不关心用户身份、也不读取 `public_dashboard` 配置；
- 所有“允许/拒绝”的业务语义都收敛在 `view-dashboard` 门里；
- 只要 `view-dashboard` 返回 `true`，`PublicDashboard` 就必然放行；
- 反之，`view-dashboard` 返回 `false` 就必然被重定向到登录页。

换句话说，这两层不是“双重独立校验”，而是**包装层（中间件）+ 策略层（Gate 门）**的分层。包装层只是路由级的拦截点，真正的策略写在门里。所以在 `public_dashboard = true` 且访客访问 `/` 时：

- `GettingStarted` 若有已完成测速记录 → 放行；
- `PublicDashboard` 调用 `view-dashboard` → 返回 `true` → 放行；
- `HomeController` 被执行，渲染 `dashboard` 视图。

两层都不会拦截，并且只要其中真正做决策的那一层（`view-dashboard`）放行，整个链路就可以继续。

---

## 二、单独修改门或单独修改中间件的不一致结果

### 情形 A：把 `view-dashboard` 门改成“只允许登录用户”，但不改 `PublicDashboard` 中间件

假设：

```php
Gate::define('view-dashboard', function (?User $user) {
    return $user !== null && in_array($user->role, [UserRole::Admin, UserRole::User]);
});
```

而 `PublicDashboard` 中间件仍然是：

```php
if (Gate::denies('view-dashboard')) {
    return redirect()->route('filament.admin.auth.login');
}
```

此时：

| 场景 | 行为 |
| --- | --- |
| `public_dashboard = true` + 访客访问 `/` | 门返回 `false` → 中间件重定向到 `/admin/login`。**公开看板功能失效**，与配置意图相反。 |
| 登录 Admin/User 访问 `/` | 门返回 `true` → 中间件放行 → 看板正常渲染。 |
| 登录但 `role` 不在白名单（未来新增角色） | 门返回 `false` → 重定向到登录页，虽然已经登录了，但看不到首页看板。 |

结论：**公开看板功能被静默破坏**，而 `/` 变成“只有登录且角色白名单的用户才能看”的入口。配置文件中 `public_dashboard` 字段形同虚设，运维以为开了公开看板，实际仍需要登录。

### 情形 B：只改 `PublicDashboard` 中间件，不改 `view-dashboard` 门

假设把中间件改成：

```php
public function handle(Request $request, Closure $next): Response
{
    // 去掉对 view-dashboard 的校验，直接放行
    return $next($request);
}
```

此时：

| 场景 | 行为 |
| --- | --- |
| 访客访问 `/`（`public_dashboard = false`） | 中间件放行 → HomeController 渲染 `dashboard` 视图。**绕过配置直接公开**。 |
| 登录 Admin/User 访问 `/` | 正常放行。 |
| 其它使用 `view-dashboard` 门的地方（如 Blade `@can('view-dashboard')` 或其它控制器） | 仍然按门策略工作（需要登录且角色在白名单）。 |

结果：**同一个权限语义出现了“入口不校验、内部仍校验”的分裂状态**。首页公开了，但页面中若使用 `@can('view-dashboard')` 控制的区块会被隐藏；而别的调用处（如 API、其他控制器）仍会拒绝访客。最典型的就是用户会看到一个“空白的看板布局”或“缺少部分数据卡片”的页面，原因是页面内部的 `@can('view-dashboard')` 仍然在挡数据渲染。

### 情形 C：反过来——只改中间件，让它读配置但门不读

```php
// PublicDashboard
if (! config('speedtest.public_dashboard') && Gate::denies('view-dashboard')) {
    return redirect()->route('filament.admin.auth.login');
}
```

此时：

- `public_dashboard = true` → 中间件直接跳过门判断，`/` 总是公开；
- 但 `view-dashboard` 门仍然要求登录+角色白名单；
- 若 Blade 或其它控制器也使用了 `view-dashboard`，它们会在页面内挡住部分内容，于是访客看到“部分空白、部分正常”的看板。

### 小结

- 只改门不改中间件：**功能被意外收紧**。最典型是公开看板失效但没有任何报错日志，配置看似生效却不生效。
- 只改中间件不改门：**权限出现“裂缝”**。路由放行了，但应用内基于门的其他判断仍在，导致 UI/数据不一致、页面局部隐藏。
- 两层必须成对修改，且在修改时应保持“中间件只负责路由拦截，业务语义全部由 Gate 承载”这一分工，避免出现上述的分裂。

---

## 三、`access-admin-panel` 门、`User::canAccessPanel()` 与 `/login` 重定向的分工与易出裂缝的路径

### 1. 三者分工

| 机制 | 位置 | 职责 |
| --- | --- | --- |
| `Gate::define('access-admin-panel', …)` | [AppServiceProvider.php#L96-L98](file:///E:/solo-code-2/speedtest-tracker/app/Providers/AppServiceProvider.php#L96-L98) | 声明“谁可以访问 Filament 管理面板”的**权限声明**。参数是已登录的 `User`，允许 `Admin` 与 `User` 两种角色。通常被 `canAccessPanel` 内部调用或被应用中其它 `@can('access-admin-panel')`/`$user->can('access-admin-panel')` 消费。 |
| `User::canAccessPanel(Panel $panel): bool` | [User.php#L59-L62](file:///E:/solo-code-2/speedtest-tracker/app/Models/User.php#L59-L62) | Filament 官方钩子。Filament 在每次进入面板资源/页面时会调用该方法判断是否允许该用户进入。**当前实现直接 `return true`**，也就是把“面板访问”完全放开给所有已登录用户，与 `access-admin-panel` 门脱节。 |
| `Route::redirect('/login', '/admin/login')` | [web.php#L30-L31](file:///E:/solo-code-2/speedtest-tracker/routes/web.php#L30-L31) | 纯 URL 别名。把 Laravel 默认的 `login` 命名路由指向 Filament 的登录页。它只负责“**去哪里登录**”，不负责“**谁可以登录**”也不负责“**谁可以进面板**”。 |

三者的调用链可以用下面的时序表示：

```
未登录用户访问 /admin/*
    │
    ▼
Filament authMiddleware: Authenticate
    │ 未通过 → Laravel 按 'login' 命名路由重定向
    │
    ▼
'/login' 被重写到 '/admin/login'   ← 分工：决定登录页地址
    │
    ▼
用户提交凭证 → Laravel Auth 登录
    │
    ▼
Filament 进入面板 → 调用 User::canAccessPanel($panel)
    │ 当前实现：始终 true
    ▼
在面板的资源/页面中如果使用了 @can('access-admin-panel')
    │ 才会再次走到 AppServiceProvider 的门
    ▼
允许/拒绝访问具体资源
```

### 2. 三者混改时的典型裂缝

#### 裂缝 1：“可登录但不可见（登录后被踢）”

如果把 `User::canAccessPanel()` 改为严格调用 `access-admin-panel` 门，但**没有同步调整 Filament 的登录后的跳转**：

```php
public function canAccessPanel(Panel $panel): bool
{
    return $this->can('access-admin-panel');
}
```

而 `access-admin-panel` 仍然是：

```php
Gate::define('access-admin-panel', function (User $user) {
    return in_array($user->role, [UserRole::Admin, UserRole::User]);
});
```

再同时把 `/login` 仍然指向 `/admin/login`。此时出现的路径：

1. 一个角色为 `Observer`（未来新增角色）或 `null` 的用户访问 `/admin/login` 可以正常打开；
2. 他用合法凭证登录，Laravel 认为“已认证”；
3. Filament 在进入 `/admin` 面板路由时调用 `canAccessPanel` → 返回 `false` → **403 Forbidden**；
4. 于是用户“能登录但无法进入面板”，被卡在一个登录成功但访问被拒的死循环。

这是最常见的“**认证 ≠ 授权**”裂缝：认证通过（login 成功）不代表授权通过（能进入面板）。

#### 裂缝 2：“可见但不可进入（匿名看板 + 面板入口暴露）”

反过来，把 `view-dashboard` 门放开、把 `canAccessPanel` 改为 `return true`，但忘记改 `access-admin-panel`：

- 访客能看到首页 `/`（公开看板）；
- 页面若有“前往后台”按钮使用 `@can('access-admin-panel')`，这个按钮对访客会被隐藏；
- 但访问 `/admin/login` 直接访问，通过 Filament 登录后，`canAccessPanel` 仍返回 `true` → **进入面板**。

结果：UI 上看不出后台入口，但实际上登录后能进去。一旦公开看板页面中存在链接或用户手动键入 `/admin`，就会绕过 UI 提示进入面板，形成“**UI 隐藏 ≠ 权限拦截**”的假象。

#### 裂缝 3：修改 `/login` 重定向带来的路径混乱

如果把 `/login` 改回 Laravel 默认的登录页（比如自建 `Auth\LoginController`），但 Filament 的 `authMiddleware` 仍是 `Authenticate::class`（它默认跳转到 `login` 命名路由）：

- 未登录访问 `/admin/*` 会被 `Authenticate` 中间件重定向到 `/login`（自建登录页）；
- 但该登录页成功后，Laravel 的 `HOME = '/'` 会把用户带回首页，而不是 `/admin`；
- 同时 `PublicDashboard` 在 `/` 上会触发 `view-dashboard` 门，若 `public_dashboard = false` 又把他重定向回 `/admin/login`；
- 用户陷入“`/admin/login` → 登录 → `/` → 重定向 `/admin/login`”的循环。

这是最典型的“**路由别名、默认 HOME、Filament Authenticate 三者不一致**”带来的登录死循环。

### 3. 最容易留下裂缝的路径

综合上面三条，最容易留下裂缝的路径是：

> **登录成功 → 进入 `/admin` 面板 → `canAccessPanel` 的判定**。

原因：

1. `/login` 只负责“到哪儿登录”，而 `access-admin-panel` 门是“谁能进面板”，`canAccessPanel` 是“真正执行放行的钩子”。当前项目里 `canAccessPanel` 直接 `return true`，等于**把 `access-admin-panel` 门闲置**了。
2. 如果未来改 `access-admin-panel` 门收紧了角色，但忘了让 `canAccessPanel` 去消费它，就会出现“门声明收紧了，但实际放行仍全部开放”的**声明与执行不一致**。
3. 如果改了 `canAccessPanel` 让它调用 `access-admin-panel`，但忘了同步 `/login` → `/admin/login` 的重定向及 `HOME` 常量，就会出现“登录成功后跳回 `/`，然后被 `PublicDashboard` 踢回登录页”的死循环。
4. 该路径还是首页 `/`（公开/非公开）、Filament 面板、以及 Laravel Auth 三者的**交汇点**：任何一处改动（HOME 常量、PublicDashboard 中间件、view-dashboard 门、canAccessPanel、access-admin-panel 门、/login 重定向）都会在这里相互作用，且影响是跨路由（`/`、`/admin`、`/admin/login`）的。

### 建议的最小变更原则

当需要调整权限时，应按以下顺序一起评估，避免只改其中一处：

1. 先改 `AppServiceProvider` 里的 `view-dashboard` / `access-admin-panel` 门，明确语义；
2. 让 `User::canAccessPanel()` 消费 `access-admin-panel` 门，而不是硬编码 `return true`；
3. 保持 `PublicDashboard` 中间件只是路由级的 `Gate::denies('view-dashboard')` 委托，不要引入独立业务逻辑；
4. 若调整登录页地址或 `HOME`，同步修改 `Route::redirect('/login', …)` 与 `AppServiceProvider::HOME`，并验证：
   - 未登录访问 `/admin/*` 能否到正确登录页；
   - 登录后能否进入 `/admin`（而不是被踢回 `/` 再被踢回登录页）；
   - 公开看板模式下访客访问 `/` 不会被重定向；
   - 非公开模式下访客访问 `/` 会被重定向到登录页。

这样才能保证“声明（Gate）— 执行（中间件 / canAccessPanel）— 路由（HOME / /login）”三层一致，不留“可登录但不可见”或“可见但不可进”的裂缝。
