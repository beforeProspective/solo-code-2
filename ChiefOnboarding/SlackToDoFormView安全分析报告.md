# SlackToDoFormView 安全深度分析报告

## 代码位置参考
- 视图实现: [new_hire/views.py](file:///e:/solo-code-2/ChiefOnboarding/back/new_hire/views.py#L155-L183)
- 用户模型: [users/models.py](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L208-L421)
- Django-Axes配置: [back/settings.py](file:///e:/solo-code-2/ChiefOnboarding/back/back/settings.py#L389-L411)

---

## 问题一：Django login方法直接写入会话的会话引擎变化与CSRF Token刷新分析

### 1.1 当前实现代码分析

在 [SlackToDoFormView.dispatch](file:///e:/solo-code-2/ChiefOnboarding/back/new_hire/views.py#L160-L182) 中实现的免密登录逻辑：

```python
user.backend = "django.contrib.auth.backends.ModelBackend"
login(self.request, user)
```

### 1.2 Django会话引擎变化机制

当调用 `django.contrib.auth.login()` 时，Django会话引擎会发生以下变化：

#### 会话层面的变化

| 变化类型 | 具体行为 |
|---------|---------|
| **会话密钥轮换** | `login()` 函数默认会调用 `request.session.cycle_key()` 生成新的session key |
| **会话数据迁移** | 旧会话中的数据会被复制到新会话中 |
| **会话失效** | 旧的session id会立即失效，防止会话固定攻击 |

> **源码证据**：Django `login()` 函数的关键片段
> ```python
> # django/contrib/auth/__init__.py
> def login(request, user, backend=None):
>     if SESSION_KEY in request.session:
>         if request.session[SESSION_KEY] != user._meta.pk.value_to_string(user):
>             request.session.cycle_key()  # 强制轮换会话密钥
>     else:
>         request.session.cycle_key()
> ```

### 1.3 CSRF Token刷新机制

**答案：CSRF Token 不会被强制刷新**

#### CSRF与Session的独立性

- **CSRF Token存储位置**：存储在独立的Cookie（`csrftoken`）中，与会话Cookie（`sessionid`）分离
- **CSRF生成时机**：首次访问需要CSRF保护的视图时生成，与登录状态无直接绑定
- **CSRF生命周期**：默认持续1年（由 `CSRF_COOKIE_AGE` 控制，默认为31449600秒）

#### 登录流程中的CSRF行为

1. **未登录用户已有CSRF**：登录后继续使用原有CSRF Token
2. **未登录用户无CSRF**：首次POST请求时自动生成CSRF Token
3. **登录后CSRF验证**：`django.middleware.csrf.CsrfViewMiddleware` 会根据 `request.META['CSRF_COOKIE']` 和 POST 参数/Header 中的token进行比对

#### 安全建议

如果希望登录后刷新CSRF Token（推荐做法），需要显式调用：

```python
from django.middleware.csrf import rotate_token

login(self.request, user)
rotate_token(self.request)  # 手动刷新CSRF Token
```

---

## 问题二：Django-Axes IP锁定触发机制与单出口网络误锁定规避

### 2.1 user_login_failed 信号触发流程

#### 当前实现分析

在 [SlackToDoFormView.dispatch](file:///e:/solo-code-2/ChiefOnboarding/back/new_hire/views.py#L166-L175) 中：

```python
except User.DoesNotExist:
    signals.user_login_failed.send(
        sender=User,
        request=self.request,
        credentials={
            "token": self.request.GET.get("token", ""),
        },
    )
    raise Http404
```

#### Django-Axes 处理链路

```
HTTP请求 → axes_dispatch装饰器 → user_login_failed信号
    → AxesProxyHandler.handle() → 记录失败日志
    → 检查失败次数（AXES_FAILURE_LIMIT）→ 超过则锁定
    → 写入 axes_accessattempt 表 → 后续请求被 AxesMiddleware 拦截
```

### 2.2 单出口网络误锁定风险分析

#### 问题根源

| 配置项 | 当前值 | 风险说明 |
|--------|--------|---------|
| `AXES_FAILURE_LIMIT` | 10次 | 10次失败即锁定 |
| `AXES_COOLOFF_TIME` | 24小时 | 锁定持续24小时 |
| `AXES_IPWARE_META_PRECEDENCE_ORDER` | HTTP_X_FORWARDED_FOR, REMOTE_ADDR | 基于公网IP锁定 |

#### 单出口网络场景

```
企业内部网络 → 统一NAT网关(公网IP: 203.0.113.50)
    ├─ 合法新员工A - 192.168.1.10 (token有效)
    ├─ 合法新员工B - 192.168.1.11 (token有效)
    └─ 攻击者C    - 192.168.1.99 (暴力破解token)
```

当攻击者C发起10次错误token请求后：
- 公网IP `203.0.113.50` 被锁定
- **所有** 内部员工（包括A和B）都无法访问该端点
- 锁定持续24小时

### 2.3 规避方案设计

#### 方案一：使用用户名+IP组合锁定（推荐）

修改 `axes` 配置，基于 token/username + IP 组合锁定：

```python
# back/settings.py 新增配置
AXES_LOCKOUT_PARAMETERS = ["username", "ip_address"]
```

需要修改信号发送方式，传入 `username` 参数：

```python
# new_hire/views.py - 修改信号发送
signals.user_login_failed.send(
    sender=User,
    request=self.request,
    credentials={
        "username": self.request.GET.get("token", ""),  # 使用token作为username标识
        "token": self.request.GET.get("token", ""),
    },
)
```

#### 方案二：基于用户标识的锁定（最佳实践）

使用自定义的用户标识替代IP：

```python
# back/settings.py
AXES_LOCKOUT_PARAMETERS = [["username"]]  # 仅基于用户名/token锁定
```

优点：
- 同一IP下不同用户独立计数
- 攻击者只能锁定他正在尝试的token
- 对其他合法用户无影响

#### 方案三：调整失败阈值与冷却时间

```python
# back/settings.py
AXES_FAILURE_LIMIT = 100      # 提高阈值，减少误锁定可能
AXES_COOLOFF_TIME = 1         # 缩短锁定时间为1小时
```

#### 方案四：使用可信IP白名单

```python
# back/settings.py
AXES_NEVER_LOCKOUT_WHITELIST = [
    '203.0.113.50/32',  # 允许企业办公IP
    '192.168.0.0/16',   # 内网IP段
]
```

---

## 问题三：令牌单次有效/阅后即焚改良时序逻辑设计

### 3.1 当前unique_url泄漏风险点

| 泄漏场景 | 风险等级 | 说明 |
|---------|---------|------|
| **浏览器历史记录** | 高 | GET参数会被完整记录 |
| **网关/代理日志** | 中 | 七层代理会记录完整URL |
| **Referer头泄漏** | 中 | 页面外链可能带token |
| **书签/收藏夹** | 低 | 用户手动收藏带token页面 |

### 3.2 改良方案一：单次使用令牌（One-Time Token）

#### 数据库模型修改

```python
# users/models.py - User模型新增字段
class User(AbstractBaseUser, PermissionsMixin):
    # ... 现有字段 ...
    unique_url = models.CharField(max_length=250, unique=True)
    unique_url_used = models.BooleanField(default=False)  # 新增：标记是否已使用
    unique_url_expires_at = models.DateTimeField(null=True, blank=True)  # 新增：过期时间
```

#### 时序逻辑流程

```
┌─────────────────────────────────────────────────────────────┐
│  管理员端：生成一次性令牌                                     │
│  1. 生成 random_string(32)                                   │
│  2. 设置 expires_at = now() + 30 minutes                     │
│  3. 设置 used = False                                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  用户访问：GET /slack-form?token=xxx                          │
│  1. 查询: unique_url=xxx AND used=False AND expires_at>now   │
│  2. 不存在 → 发送 user_login_failed 信号 → 404               │
└──────────────────────────┬──────────────────────────────────┘
                           │ 存在
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  原子化标记使用（关键！）                                      │
│  UPDATE users_user                                            │
│  SET unique_url_used = TRUE                                   │
│  WHERE unique_url = :token AND unique_url_used = FALSE        │
│  RETURNING id                                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ 影响行数=1（成功获取锁）
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  登录逻辑执行                                                 │
│  1. 调用 login(request, user)                                 │
│  2. 返回表单页面                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 关键代码实现

```python
# new_hire/views.py - 改良后的SlackToDoFormView
from django.db import transaction

class SlackToDoFormView(TemplateView):
    def dispatch(self, *args, **kwargs):
        token = self.request.GET.get("token", "")
        
        with transaction.atomic():
            # 原子查询并锁定行
            user = User.objects.select_for_update(nowait=True).filter(
                unique_url=token,
                role=User.Role.NEWHIRE,
                unique_url_used=False,
                unique_url_expires_at__gt=timezone.now()
            ).first()
            
            if user is None:
                # 登录失败信号...
                raise Http404
            
            # 立即标记为已使用
            user.unique_url_used = True
            user.save(update_fields=['unique_url_used'])
        
        # 登录逻辑
        user.backend = "django.contrib.auth.backends.ModelBackend"
        login(self.request, user)
        return super().dispatch(*args, **kwargs)
```

### 3.3 改良方案二：短期有效+刷新机制（用户体验友好）

#### 时序逻辑

```
第一次访问                    5分钟内刷新页面
┌────────────┐             ┌────────────┐
│ GET token  │             │ GET token  │
│  302重定向  │             │  直接登录   │
│  Set-Cookie│             │  (重用会话) │
└─────┬──────┘             └────────────┘
      │
      ▼
┌─────────────────────────┐
│ URL变为 /slack-form/123  │
│ (不带token参数)          │
│ 浏览器URL不再含敏感信息   │
└─────────────────────────┘
```

#### 实现要点

```python
# new_hire/views.py
class SlackToDoFormView(TemplateView):
    def dispatch(self, *args, **kwargs):
        token = self.request.GET.get("token", "")
        
        if token:
            # 有token时验证并登录
            user = User.objects.filter(
                unique_url=token,
                role=User.Role.NEWHIRE,
                unique_url_expires_at__gt=timezone.now()
            ).first()
            
            if user is None:
                signals.user_login_failed.send(...)
                raise Http404
            
            user.backend = "django.contrib.auth.backends.ModelBackend"
            login(self.request, user)
            
            # 关键：重定向到不带token的URL
            return redirect(
                reverse("new_hire:slack-form", kwargs={"pk": self.kwargs["pk"]})
            )
        
        # 无token时走正常会话验证
        if not self.request.user.is_authenticated:
            raise Http404
            
        return super().dispatch(*args, **kwargs)
```

### 3.4 方案对比与推荐

| 方案 | 安全性 | 用户体验 | 实现复杂度 | 推荐场景 |
|-----|--------|---------|-----------|---------|
| **方案一：单次令牌** | ★★★★★ | ★★☆☆☆ | 中等 | 高安全要求场景 |
| **方案二：短期+重定向** | ★★★★☆ | ★★★★★ | 简单 | 平衡安全与体验 |
| **方案三：JWT自包含** | ★★★☆☆ | ★★★★☆ | 较高 | 微服务架构 |

#### 最终推荐组合方案

```python
# 推荐实现：短期有效 + URL重定向 + 浏览器历史清理

def dispatch(self, *args, **kwargs):
    token = self.request.GET.get("token", "")
    
    if token:
        # 验证token有效性（5分钟有效期）
        user = User.objects.filter(
            unique_url=token,
            role=User.Role.NEWHIRE,
            # 可选：创建时间在5分钟内
            date_joined__gte=timezone.now() - timedelta(minutes=30)
        ).first()
        
        if user is None:
            signals.user_login_failed.send(...)
            raise Http404
        
        login(self.request, user)
        
        # 302重定向，清除URL中的token
        response = redirect(self.request.path)
        # 可选：设置响应头禁止缓存
        response["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response["Pragma"] = "no-cache"
        return response
    
    # 后续请求走正常会话
    if not self.request.user.is_authenticated:
        raise Http404
        
    return super().dispatch(*args, **kwargs)
```

---

## 总结与行动建议

### 立即修复项

1. **添加CSRF Token轮换**：登录后调用 `rotate_token()`
2. **修改Axes锁定策略**：使用 `AXES_LOCKOUT_PARAMETERS = ["username", "ip_address"]`
3. **URL重定向去token**：登录成功后重定向到不带token的路径

### 中期优化项

1. **增加token过期机制**：为 `unique_url` 添加过期时间字段
2. **配置Referrer-Policy**：设置 `Referrer-Policy: origin` 防止泄漏
3. **监控告警**：对大量失败token请求设置告警阈值

### 长期架构改进

1. **迁移至POST方式**：token通过请求体传递，避免出现在URL和日志中
2. **实现PKCE流程**：类似OAuth2的授权码流程
3. **多因素验证**：对高风险操作增加额外验证步骤
