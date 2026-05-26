# API Token 权限控制体系深度分析（第三版）

## 问题 1：Resource 页面授权失败时的真实处理链条

### 1.1 原始文档第 95-135 行的问题定位

原始文档称：
> Filament 通过 `CanAuthorizeResourceAccess` 中间件处理 Resource 访问授权

但实际对照 [AdminPanelProvider.php#L44-L57](file:///e:/solo-code-2/speedtest-tracker/app/Providers/Filament/AdminPanelProvider.php#L44-L57) 的中间件配置：

```php
->middleware([
    EncryptCookies::class,
    AddQueuedCookiesToResponse::class,
    StartSession::class,
    AuthenticateSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
    SubstituteBindings::class,
    DisableBladeIconComponents::class,
    DispatchServingFilamentEvent::class,
])
->authMiddleware([
    Authenticate::class,
])
```

**关键发现**：AdminPanelProvider 的中间件列表中 **没有** 单独的 `CanAuthorizeResourceAccess` 中间件。

### 1.2 真实的授权处理流程

Filament 的 Resource 授权不是通过独立中间件实现的，而是通过 **Page 类的 mount 阶段** 实现的。

根据 Filament 源码（`InteractsWithRecord` trait）：

```php
// Filament 框架内部
public function mountCanAuthorizeAccess(): void
{
    abort_unless(static::canAccess(['record' => $this->getRecord()]), 403);
}
```

**完整流程**：

```
HTTP 请求
  → Filament 全局中间件（Session、CSRF 等）
  → Authenticate 中间件（验证是否登录）
  → Livewire 组件 mount
    → mountCanAuthorizeAccess()
      → canAccess() 返回 false
        → abort_unless(..., 403)
          → abort(403)
            → throw new HttpResponseException(response('Forbidden', 403))
              → 403 响应返回
```

### 1.3 abort(403) 与 HttpResponseException 的关系

**结论：两者是同一回事，只是调用层级不同**

| 调用方式 | 底层实现 | 结果 |
|---------|---------|------|
| `abort(403)` | Laravel 辅助函数 | 内部抛出 `HttpResponseException` |
| `abort_unless(condition, 403)` | Laravel 辅助函数 | 条件不满足时调用 `abort(403)` |
| `throw new HttpResponseException(...)` | Laravel 底层异常 | 立即返回指定响应 |

**调用链**：
```
canAccess() 返回 false
  → abort_unless(static::canAccess(), 403)
    → abort(403)
      → throw new HttpResponseException(response('Forbidden', 403))
        → Laravel 异常处理器捕获
          → 返回 403 响应
```

### 1.4 原始文档的修正

| 原始说法 | 修正后 |
|---------|--------|
| 通过 `CanAuthorizeResourceAccess` 中间件 | ❌ 错误，该中间件不存在于当前配置 |
| 授权失败时抛出 `HttpResponseException` | ✅ 正确，但更准确说是 `abort(403)` → `HttpResponseException` |
| 拦截发生在"Resource 层" | ⚠️ 更准确说是 **Page 组件的 mount 阶段** |

---

## 问题 2：CheckboxList 的 abilities 是否经过服务端校验

### 2.1 原始文档第 160-223 行的问题定位

原始文档称：
> CheckboxList **只是前端选项约束**，没有把后端白名单锁住

### 2.2 实际验证分析

#### (1) CheckboxList 的定义

[ApiTokenForm.php#L22-L35](file:///e:/solo-code-2/speedtest-tracker/app/Filament/Resources/ApiTokens/Schemas/ApiTokenForm.php#L22-L35)：

```php
CheckboxList::make('abilities')
    ->options([
        'results:read' => __('api_tokens.read_results'),
        'speedtests:run' => __('general.run_speedtest'),
        'ookla:list-servers' => __('general.list_servers'),
    ])
    ->required()
    ->bulkToggleable()
```

#### (2) ListApiTokens 的处理

[ListApiTokens.php#L23-L28](file:///e:/solo-code-2/speedtest-tracker/app/Filament/Resources/ApiTokens/Pages/ListApiTokens.php#L23-L28)：

```php
->action(function (array $data): void {
    $token = Auth::user()->createToken(
        $data['name'],
        $data['abilities'],  // 直接使用前端传来的数据
        $data['expires_at'] ? Carbon::parse($data['expires_at']) : null
    );
})
```

#### (3) Filament CheckboxList 的服务端验证行为

**关键发现**：Filament 的 CheckboxList **默认情况下不会在服务端验证选项值是否在预定义的 options 中**。

- `options()` 方法仅用于前端渲染和显示
- 服务端提交时，CheckboxList 只验证字段级别的规则（如 `required`、`max` 等）
- **不会自动验证提交的值是否在 options 列表中**

#### (4) 绕过测试

如果有人绕过前端，直接发送 HTTP 请求：

```http
POST /livewire/update
Content-Type: application/json

{
    "components": [
        {
            "snapshot": "...",
            "updates": {
                "data.abilities": ["*", "admin:full", "results:read"]
            }
        }
    ]
}
```

**结果**：
- ✅ 请求会被 Filament 接受
- ✅ `abilities` 字段会存储 `["*", "admin:full", "results:read"]`
- ⚠️ `"*"` 是 Sanctum 的万能能力，会绕过所有 `tokenCan()` 检查

#### (5) 表单验证行为

[ApiTokenForm.php#L22-L35](file:///e:/solo-code-2/speedtest-tracker/app/Filament/Resources/ApiTokens/Schemas/ApiTokenForm.php#L22-L35) 中没有添加 `in` 或自定义验证规则：

```php
CheckboxList::make('abilities')
    ->options([...])
    ->required()  // 仅验证不为空
    // 没有 ->rule('in:...') 或自定义验证规则
```

### 2.3 结论

| 层级 | 是否验证 options | 说明 |
|------|-----------------|------|
| CheckboxList 前端 | ✅ 限制 UI 选项 | 用户界面只能看到预设选项 |
| CheckboxList 服务端 | ❌ 不验证 | 不检查提交值是否在 options 中 |
| ListApiTokens::action | ❌ 直接透传 | 不验证 abilities 内容 |
| Sanctum::createToken | ❌ 接受任意值 | 不做白名单验证 |

**原始文档的结论正确**：CheckboxList 只是前端约束，没有服务端白名单验证。

---

## 问题 3：删掉 canAccess 后普通用户的实际权限边界

### 3.1 原始文档第 181-198 行和第 292-309 行的问题定位

原始文档称：
> 普通用户可创建、查看、删除 API Token，能生成带任意能力的 Token

### 3.2 实际验证分析

#### (1) ApiTokenTable 的查询限制

[ApiTokenTable.php#L22](file:///e:/solo-code-2/speedtest-tracker/app/Filament/Resources/ApiTokens/Tables/ApiTokenTable.php#L22)：

```php
->query(PersonalAccessToken::query()->where('tokenable_id', Auth::id()))
```

**关键发现**：查询被限制为 `tokenable_id = Auth::id()`，即：
- 普通用户只能看到 **自己的** Token
- 无法看到其他用户的 Token
- 无法看到全站 Token

#### (2) 创建 Token 的归属

[ListApiTokens.php#L24](file:///e:/solo-code-2/speedtest-tracker/app/Filament/Resources/ApiTokens/Pages/ListApiTokens.php#L24)：

```php
$token = Auth::user()->createToken(...)
```

**关键发现**：Token 绑定到当前登录用户，即：
- 普通用户创建的 Token **只属于自己**
- 无法为其他用户创建 Token

#### (3) EditAction 和 DeleteAction 的范围

[ApiTokenTable.php#L87-L94](file:///e:/solo-code-2/speedtest-tracker/app/Filament/Resources/ApiTokens/Tables/ApiTokenTable.php#L87-L94)：

```php
->recordActions([
    ActionGroup::make([
        EditAction::make()
            ->disabled(fn ($record) => $record->expires_at !== null && $record->expires_at->isPast())
            ->modalWidth('xl'),
        DeleteAction::make(),
    ]),
])
```

**Filament 的行为**：
- EditAction 和 DeleteAction 操作的是表格查询返回的记录
- 由于查询已限制为当前用户的 Token，普通用户只能编辑/删除 **自己的** Token

#### (4) 关于"任意能力"的结论

原始文档第 184 行称：
> 普通用户能生成带任意能力的 Token

**这个结论是正确的**，但需要更精确的表述：

1. **前端受限**：CheckboxList 限制 UI 上只能选择三个预设选项
2. **后端可绕过**：如果有人绕过前端（如通过 API 直接调用），可以创建带任意能力的 Token
3. **需要管理员权限进入**：如果 `canAccess` 没有被删除，普通用户无法进入页面

### 3.3 删掉 canAccess 后的实际影响

| 操作 | 影响 | 说明 |
|------|------|------|
| 查看 Token | ✅ 普通用户可以看到 **自己的** Token | 被 `tokenable_id` 限制 |
| 查看他人 Token | ❌ 无法看到 | 被 `tokenable_id` 限制 |
| 创建 Token | ✅ 普通用户可以创建 **自己的** Token | 被 `Auth::user()` 限制 |
| 创建带 `*` 能力的 Token | ⚠️ 前端受限但后端可绕过 | 需要绕过前端 |
| 编辑 Token | ✅ 普通用户可以编辑 **自己的** Token | 被表格查询限制 |
| 删除 Token | ✅ 普通用户可以删除 **自己的** Token | 被表格查询限制 |
| 编辑/删除他人 Token | ❌ 无法操作 | 被表格查询限制 |

### 3.4 结论

**原始文档的结论部分正确，但需要修正**：

| 原始说法 | 实际情况 |
|---------|---------|
| 普通用户能看到全站 Token | ❌ 错误，只能看到自己的 |
| 普通用户能操作他人的 Token | ❌ 错误，只能操作自己的 |
| 能生成带任意能力的 Token | ✅ 正确，但前端受限 |
| 完全绕过数据隔离边界 | ❌ 错误，`tokenable_id` 提供了数据隔离 |

**真正的风险点**：
1. 如果业务设计上普通用户不应该管理 API Token，那删掉 `canAccess` 确实是问题
2. abilities 没有后端白名单验证，存在创建带 `*` 能力 Token 的风险
3. 但数据隔离（`tokenable_id`）仍然有效，普通用户无法影响其他用户

---

## 综合修正与补充建议

### 建议 1：添加后端 abilities 白名单验证

在 `ListApiTokens` 的 action 中添加验证：

```php
->action(function (array $data): void {
    $allowedAbilities = ['results:read', 'speedtests:run', 'ookla:list-servers'];
    $abilities = array_intersect($data['abilities'], $allowedAbilities);
    
    if (empty($abilities)) {
        Notification::make()
            ->title(__('api_tokens.invalid_abilities'))
            ->danger()
            ->send();
        return;
    }
    
    $token = Auth::user()->createToken(
        $data['name'],
        array_values($abilities),
        $data['expires_at'] ? Carbon::parse($data['expires_at']) : null
    );
    // ...
})
```

### 建议 2：在 ApiTokenResource 中明确数据隔离

虽然当前 `ApiTokenTable` 已通过查询限制实现了数据隔离，但建议在 `canAccess` 的注释中说明：

```php
/**
 * 仅管理员可访问 API Token 管理界面。
 * 普通用户不应创建/管理 Token，除非业务需求变更。
 * 
 * 注意：即使删除此检查，ApiTokenTable 的查询限制
 * （tokenable_id = Auth::id()）仍然会阻止用户查看他人的 Token。
 */
public static function canAccess(): bool
{
    return Auth::check() && Auth::user()->is_admin;
}
```

### 建议 3：权限体系的真实层次

```
┌─────────────────────────────────────────────────────────┐
│ 事实来源：role 字段（数据库）                           │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 派生层：isAdmin 访问器（便捷封装）                      │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 授权层：Gate / Policy / canAccess                       │
│  ├─ AppServiceProvider: 直接使用 $user->role            │
│  ├─ UserPolicy: 使用 $user->is_admin                    │
│  └─ Resource::canAccess: 使用 $user->is_admin           │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 数据隔离层：tokenable_id = Auth::id()                   │
│  （与角色权限无关，独立实现数据隔离）                    │
└─────────────────────────────────────────────────────────┘
```

---

## 最终结论

| 问题 | 原始文档 | 修正后 |
|------|---------|--------|
| Resource 授权处理 | ⚠️ 提到中间件但不准确 | 授权在 Page mount 阶段通过 `abort_unless()` 实现 |
| 403 与 HttpResponseException | ✅ 正确 | 两者本质相同，`abort(403)` 内部抛出 `HttpResponseException` |
| CheckboxList 服务端验证 | ✅ 正确 | 仅前端约束，服务端无白名单验证 |
| 删掉 canAccess 可看全站 Token | ❌ 错误 | 被 `tokenable_id` 限制，只能看自己的 |
| 能创建带任意能力的 Token | ✅ 正确 | 前端受限但后端可绕过 |

**核心发现**：该系统的权限设计存在 **前端约束依赖** 的问题，abilities 白名单仅在 UI 层实现，缺少后端强制验证。这是需要关注的潜在安全弱点。
