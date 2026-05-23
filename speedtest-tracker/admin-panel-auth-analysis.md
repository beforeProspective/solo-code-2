# Filament 后台面板鉴权分析

本文基于项目 `speedtest-tracker` 的实际实现，梳理未登录访问 `/admin`、多层鉴权是否重复、以及 `Gate` 与 `UserPolicy` 配合这三个问题。

相关核心文件：

- [AdminPanelProvider.php](file:///e:/solo-code-2/speedtest-tracker/app/Providers/Filament/AdminPanelProvider.php)
- [PublicDashboard.php](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/PublicDashboard.php)
- [AppServiceProvider.php](file:///e:/solo-code-2/speedtest-tracker/app/Providers/AppServiceProvider.php#L94-L111)
- [User.php](file:///e:/solo-code-2/speedtest-tracker/app/Models/User.php#L56-L72)（`canAccessPanel`、`isAdmin`）
- [UserPolicy.php](file:///e:/solo-code-2/speedtest-tracker/app/Policies/UserPolicy.php)
- [web.php](file:///e:/solo-code-2/speedtest-tracker/routes/web.php#L19-L21)

## 1. 未登录用户访问 `/admin` 的执行过程

### 1.1 配置回顾

`AdminPanelProvider` 把整个 `admin` 面板挂到路径 `admin`，并声明了两层中间件：

- `->middleware([...])`：**全量中间件**，作用于该面板下所有路由（含登录页）。
- `->authMiddleware([Authenticate::class])`：**仅作用于需要登录的路由**（即除登录、密码重置等访客路由外的所有面板路由）。

登录入口通过 `->login()` 自动注册，对应路由名为 `filament.admin.auth.login`。

### 1.2 请求执行链（Laravel / Filament 的通用流程）

1. 请求进入 HTTP 内核，先经过全局中间件（`bootstrap/app.php` 里的 `withMiddleware`）。
2. 根据 URI `/admin` 匹配到 Filament 在面板启动时注册的路由组（path=`admin`）。
3. Filament 面板的路由组会依次应用：
   - 面板级 `middleware([EncryptCookies, StartSession, AuthenticateSession, ... , DispatchServingFilamentEvent])`。
   - 若匹配到的是「非访客路由」（例如 `/admin` 默认落地的 `Dashboard`），再叠加面板级 `authMiddleware`，即 `Filament\Http\Middleware\Authenticate`。
4. **阶段一：`Authenticate` 中间件——仅做登录校验**
   - `Authenticate` 只调用 `Filament::auth()->check()`，判断当前是否有已登录用户。
   - 它**不**调用 `User::canAccessPanel()`，也不关心角色。
   - 未登录 → 普通 HTTP 请求调用 `redirectGuest()` 重定向到 `filament.admin.auth.login`；AJAX/JSON 请求返回 401。
   - 已登录 → 放行，中间件栈执行完毕，进入面板解析阶段。
5. **阶段二：面板解析——单独检查 `canAccessPanel()`**
   - `Authenticate` 通过后，Filament 在解析面板时调用 `User::canAccessPanel(Panel $panel)`。
   - 这一步**不在 `Authenticate` 中间件内**，而是在中间件栈之外、面板渲染前的独立阶段。
   - 返回 `false` → 直接返回 `403 Forbidden`，不做重定向（无论是否 AJAX 请求）。
   - 返回 `true` → 继续进入 Dashboard 页面的 Livewire 组件。

### 1.3 重定向由哪一层触发

- **未登录访问 `/admin`**：由 **面板级 `authMiddleware`**（即 `Filament\Http\Middleware\Authenticate`）触发重定向。
- **未登录访问公开仪表盘 `/`**：由项目自定义的 [PublicDashboard](file:///e:/solo-code-2/speedtest-tracker/app/Http/Middleware/PublicDashboard.php#L17-L24) 中间件触发，它读取 `Gate::denies('view-dashboard')` 后自行 `redirect()->route('filament.admin.auth.login')`。

两者虽然最终都跳到登录页，但触发层不同：`/admin` 走 Filament 的面板栈；`/` 走 Laravel `web` 路由组里的 `public-dashboard` 中间件。

## 2. 控制器层 Gate 检查与面板层 Authenticate 是否重复

### 2.1 两类检查关注点不同

- 面板级 `Authenticate` 只做**身份认证**（Authentication），不检查角色：
  - 仅通过 `Filament::auth()->check()` 确认是否有登录用户；
  - 未登录则重定向到登录页，已登录则无条件放行到面板解析阶段；
  - 角色过滤不在 `Authenticate` 中进行，而是在后续的 `canAccessPanel()` 检查中完成。
- 面板解析阶段的 `canAccessPanel()` 检查做**面板级授权**：
  - 本项目中 `canAccessPanel` 直接返回 `true`（见 [User.php#L59-L62](file:///e:/solo-code-2/speedtest-tracker/app/Models/User.php#L59-L62)），因此所有已登录用户都能进入面板骨架；
  - 一旦改为按角色过滤，未通过的用户会收到 403 响应，而非重定向。
- 控制器 / 页面级检查（`Gate::authorize('view-dashboard')`、`UserPolicy`、`Resource::canAccess()` 等）关心「进入面板后**是否有资格**做某件事」。

所以「是否登录」和「是否有权限」是两层不同的决策，**不是重复鉴权，而是典型的纵深防御**。

### 2.2 本项目实际的组合

- `/` 路由由 [HomeController](file:///e:/solo-code-2/speedtest-tracker/app/Http/Controllers/HomeController.php) 处理，`HomeController` 自身没有再做 Gate 检查，鉴权完全交给 `PublicDashboard` 中间件（`web.php#L19-L21`）。
- `/admin` 下的资源页（`UserResource`、`ApiTokenResource`、`ResultResource` 等）是 Filament 自动生成的 Livewire 页面，Filament 会在渲染前调用资源的 `canAccess()` / Policy 方法：
  - [ApiTokenResource](file:///e:/solo-code-2/speedtest-tracker/app/Filament/Resources/ApiTokens/ApiTokenResource.php#L32-L39) 与设置页（`Notification`、`DataIntegration`、`Thresholds`）显式写了 `canAccess(): Auth::check() && Auth::user()->is_admin`。
  - `UserResource` 依赖 [UserPolicy](file:///e:/solo-code-2/speedtest-tracker/app/Policies/UserPolicy.php) 里基于 `$user->is_admin` 的判断。
  - `ResultResource` 未定义 `canAccess()`，但存在 [ResultPolicy](file:///e:/solo-code-2/speedtest-tracker/app/Policies/ResultPolicy.php)：`viewAny`、`view`、`update` 无条件 `allow`；`create` 无条件 `deny`；`delete`/`deleteAny` 仅 `is_admin` 时 `allow`。因此任何已登录用户（含 `user` 角色）都能查看和修改测速结果，只有 admin 能删除。

因此对本项目而言，不存在「控制器层已做 Gate 检查、面板层再做 Authenticate」这种意义上的冲突：

- 面板层 `Authenticate` 是**身份认证**（Authentication）。
- 页面/Policy 层是**授权**（Authorization）。

### 2.3 这种重复是安全冗余还是状态不一致

行为上是**安全冗余**：

- 面板先挡住未登录访客 → 登录后由 Policy / `canAccess` 再判断角色。
- 两层同时通过才算放行，任一失败都会被拦截，不会出现状态冲突。
- 唯一需要留意的是两处判断**语义不一致**时的体验问题：
  - 若面板入口用 `canAccessPanel` 严格要求 `is_admin`，而页面层用 `view-dashboard` 允许所有 `user` 角色通过，就会出现「能进面板但被页面挡住」或相反的情况。
  - 当前项目的 `canAccessPanel` 返回 `true`，所有角色都能进面板，然后再靠页面级判断收口，这种「宽进严出」策略不会出错，但会让普通角色也能看到面板骨架（顶部栏、侧边栏），容易暴露可访问页面的枚举信息。

**结论**：这种重复在本项目是良性的，且是推荐的分层方式。真正的风险点不在「重复」，而在「入口的 `canAccessPanel` 过宽」——下一节会展开。

## 3. `Gate::denies('view-dashboard')` 与 `UserPolicy` 的配合及入口漏洞

### 3.1 两者的职责分工

- `Gate::define('view-dashboard', ...)`（[AppServiceProvider#L100-L110](file:///e:/solo-code-2/speedtest-tracker/app/Providers/AppServiceProvider.php#L100-L110)）控制「是否能看**仪表盘**」：
  - 若 `speedtest.public_dashboard=true` → 允许匿名访问。
  - 否则需要登录且 `role ∈ {Admin, User}`。
  - 这是面向前台 `/` 的 Gate，语义是「能看公开仪表盘」。

- `UserPolicy`（[UserPolicy.php](file:///e:/solo-code-2/speedtest-tracker/app/Policies/UserPolicy.php)）控制「能对 `User` 模型做什么动作」，每个方法都基于 `$user->is_admin`：
  - 查看、创建、删除等只有 admin 可做。
  - `update` 还额外禁止修改自己。
  - `delete` 禁止删除其他 admin。

两者的角色集合**不同**：

| 能力 | `view-dashboard` 通过条件 | `UserPolicy::*` 通过条件 |
| --- | --- | --- |
| 前台仪表盘 `/` | `public_dashboard=true` 或 `role ∈ {Admin, User}` | 不涉及 |
| 后台用户管理 `/admin/users` | 不涉及 | `is_admin` |

也就是说，「能看前台仪表盘」与「能进后台用户管理」是两条独立的权限线，**并不互通**。

### 3.2 若只改页面层权限而不改面板入口的漏洞

当前项目的面板入口由以下三部分共同决定：

1. `User::canAccessPanel(Panel $panel)` → `true`（[User.php#L59-L62](file:///e:/solo-code-2/speedtest-tracker/app/Models/User.php#L59-L62)）。
2. 面板级 `Authenticate` 只校验登录。
3. 页面级 `canAccess()` / Policy 再做角色过滤。

如果维护者**只改页面层**（例如收紧 `UserPolicy`、在各 `Resource::canAccess()` 里加 `is_admin`），**但不改 `canAccessPanel`**，会留下以下入口漏洞：

- **角色为 `user` 的已登录账户可以进入 `/admin` 主框架**：
  - 左侧导航里，`ApiTokenResource`、设置页等因为 `shouldRegisterNavigation()` 返回 `false` 会被隐藏。
  - 但 `Dashboard` 本身没有 `canAccess`，会直接渲染。
  - `ResultResource` 没有 `canAccess()`，但存在 `ResultPolicy`，其 `viewAny`、`view`、`update` 均无条件 `allow`，因此 `user` 角色可以直接访问 `/admin/results`（见 [ResultResource.php](file:///e:/solo-code-2/speedtest-tracker/app/Filament/Resources/Results/ResultResource.php)、[ResultPolicy.php](file:///e:/solo-code-2/speedtest-tracker/app/Policies/ResultPolicy.php)）。
  - `UserResource`、`ApiTokenResource`、设置页在路由命中时会因 `canAccess` 或 Policy 抛 403。

- **后果**：
  1. **信息泄露**：未被显式 `canAccess` 限制的页面、菜单、统计数据对所有登录用户可见。
  2. **横向风险**：一旦某页面遗漏了 `canAccess`/Policy 校验（或未来新增页面忘了加），`user` 角色就能直接进入。
  3. **越权面扩大**：即便现有页面都做了限制，`/admin` 仍会把面板骨架、全局搜索、用户头像等 UI 发给所有登录用户，容易暴露后台存在与结构。
  4. **`view-dashboard` 与面板权限混淆**：`view-dashboard` 只控制 `/`，对 `/admin` 无影响，若维护者误以为收紧 `view-dashboard` 就能收紧面板，会形成「看似收紧、实际未收紧」的错觉。

### 3.3 推荐的收口方式

要让后台真正只有管理员能进，需要同时完成：

1. **面板入口收口**：把 `User::canAccessPanel` 改为基于 `is_admin`：

   ```php
   public function canAccessPanel(Panel $panel): bool
   {
       return $this->is_admin;
   }
   ```

   这样 `Authenticate` 通过登录检查后，在面板解析阶段会调用 `canAccessPanel()`。Filament 对 `canAccessPanel()` 返回 `false` 的处理**只有一种结果**：
   - 直接返回 `403 Forbidden` 响应，**不会重定向到登录页**（无论请求类型是普通 HTTP 还是 AJAX/JSON）。
   - 这与未登录时 `Authenticate` 中间件触发的「重定向到登录页」行为完全不同。

2. **页面级继续保留 Policy / `canAccess`**：这是纵深防御的第二层，即便入口失守也能兜底。

3. **统一口径**：`Gate::define('access-admin-panel', ...)`（[AppServiceProvider#L96-L98](file:///e:/solo-code-2/speedtest-tracker/app/Providers/AppServiceProvider.php#L96-L98)）当前未被任何地方调用，要么让 `canAccessPanel` / `Authenticate` 改用它，要么删掉避免死代码造成认知偏差。

## 4. 小结

- 未登录访问 `/admin` 的重定向来自 **Filament 面板 `authMiddleware` 中的 `Authenticate`**；`/` 的重定向来自项目自定义的 `PublicDashboard`。
- 「面板 `Authenticate` + 页面级 Gate/Policy」是标准的分层鉴权，行为安全冗余，不会引入状态不一致；风险在「入口和页面权限口径不一致」。
- `view-dashboard` 只约束前台仪表盘，与基于 `is_admin` 的 `UserPolicy` 不是一条线；只改页面层不改 `canAccessPanel` 会让所有登录用户进入 `/admin`，导致信息泄露与未来遗漏校验时的越权风险，应在 `canAccessPanel` 就把非 admin 挡在门外。
