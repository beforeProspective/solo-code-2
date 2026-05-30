# OAuth2 令牌并发刷新与级联故障分析报告

## 方法概览

`renew_key` 方法位于 [models.py#L586-L619](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L586-L619)，属于 `Integration` 模型的实例方法。核心逻辑分为三步：

1. **过期检测**：判断当前 Integration 是否配置了 OAuth、`extra_args.oauth` 中是否包含 `expires_in`、以及 `expiring` 时间戳是否已过期
2. **令牌刷新**：调用 `run_request(self.manifest["oauth"]["refresh"])` 向上游 OAuth2 提供者发起 refresh 请求
3. **状态更新**：刷新成功后合并新凭证到 `extra_args.oauth`，更新 `expiring` 时间戳，保存到数据库

```python
def renew_key(self):
    success = True
    if (
        self.has_oauth
        and "expires_in" in self.extra_args.get("oauth", {})
        and self.expiring < timezone.now()
    ):
        success, response = self.run_request(self.manifest["oauth"]["refresh"])

        if not success:
            user = self.new_hire if self.has_user_context else None
            Notification.objects.create(
                notification_type=Notification.Type.FAILED_INTEGRATION,
                extra_text=self.name,
                created_for=user,
                description="Refresh url: " + str(response),
            )
            return success

        self.extra_args["oauth"] |= response.json()
        if "expires_in" in response.json():
            self.expiring = timezone.now() + timedelta(
                seconds=response.json()["expires_in"]
            )
        self.save(update_fields=["expiring", "extra_args"])
        if hasattr(self, "tracker"):
            last_step = self.tracker.steps.last()
            last_step.json_response = self.clean_response(last_step.json_response)
            last_step.save()

    return success
```

该方法在三个关键入口被调用：

| 调用点 | 位置 | 说明 |
|-------|------|------|
| [execute()](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L673) | L673 | 执行集成配置的所有 HTTP 请求前 |
| [user_exists()](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L523) | L523 | 检查用户在上游系统中是否存在前 |
| [revoke_user()](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L565) | L565 | 撤销用户在上游系统的访问权限前 |

---

## 问题一：并发令牌刷新导致 refresh_token 失效

### 1.1 并发场景复现

在高并发入职流程中，多个新员工的入职 Sequence 可能同时引用同一个 Integration 对象。例如，当 `timed_triggers` 定时任务在同一个 5 分钟窗口内触发多个用户的 Condition 时（参见 [tasks.py#L161-L198](file:///e:/solo-code-2/ChiefOnboarding/back/admin/sequences/tasks.py#L161-L198)），每个 Condition 通过 `async_task` 异步调度执行，这些 task 会被 django-q 的 worker 并行消费。

```
时间线:
T0: Worker-1 加载 Integration(id=5), expiring=过期
T0: Worker-2 加载 Integration(id=5), expiring=过期
T0: Worker-3 加载 Integration(id=5), expiring=过期
                ↓
T1: Worker-1 调用 renew_key() → 检测过期 → 发起 refresh 请求
T1: Worker-2 调用 renew_key() → 检测过期 → 发起 refresh 请求
T1: Worker-3 调用 renew_key() → 检测过期 → 发起 refresh 请求
                ↓
T2: 上游 OAuth2 返回: {access_token: "new_1", refresh_token: "rotated_1"}
T2: 上游 OAuth2 返回: {error: "invalid_grant"} ← 旧 refresh_token 已被轮换
T2: 上游 OAuth2 返回: {error: "invalid_grant"} ← 旧 refresh_token 已被轮换
```

### 1.2 根本原因：无锁保护下的 TOCTOU 竞态

`renew_key` 方法存在经典的 **TOCTOU（Time-of-Check-to-Time-of-Use）** 竞态条件：

```python
# 步骤1: 检查（Check）—— 所有 Worker 同时读到 expiring 已过期
if (
    self.has_oauth
    and "expires_in" in self.extra_args.get("oauth", {})
    and self.expiring < timezone.now()  # ← 竞态窗口入口
):
    # 步骤2: 使用（Act）—— 所有 Worker 同时发起刷新请求
    success, response = self.run_request(self.manifest["oauth"]["refresh"])
    # ← 竞态窗口出口

    # 步骤3: 更新（Update）—— 只有第一个 Worker 能成功
    self.extra_args["oauth"] |= response.json()
    self.save(update_fields=["expiring", "extra_args"])
```

**竞态窗口**：从 `self.expiring < timezone.now()` 判断到 `self.save()` 之间，没有任何互斥机制阻止其他进程同时进入这段代码。

### 1.3 OAuth2 Refresh Token 轮换机制加剧问题

大多数主流 OAuth2 提供者（Google、Microsoft、Slack、GitHub 等）实现了 **Refresh Token Rotation** 机制：

| 提供者 | 轮换策略 | 重用检测 |
|-------|---------|---------|
| Google | 每次刷新返回新 refresh_token | 重用旧 token 时撤销整个授权 |
| Microsoft Entra ID | 每次刷新返回新 refresh_token | 重用旧 token 时撤销（可配置宽限期） |
| Slack | 不轮换 refresh_token | N/A（少数不轮换的提供者） |
| Auth0 | 支持可配置的轮换 | 重用时撤销所有 token |
| Okta | 支持轮换 | 重用时撤销授权 |

**关键问题**：当多个并发请求使用同一个 `refresh_token` 刷新时：

1. **第一次刷新成功**：上游返回新的 `access_token` + 新的 `refresh_token`（如 `rotated_1`）
2. **第二次刷新失败**：使用旧的 `refresh_token` 再次请求，上游检测到重用 → **撤销整个授权**（不仅拒绝本次请求，还连带撤销 `rotated_1`）
3. **不可逆破坏**：此时 Integration 的 OAuth2 授权已被上游彻底撤销，必须由管理员重新走一遍完整的 OAuth2 授权流程（`authenticate_url` → `access_token` → 手动重新授权）

### 1.4 代码层面的问题链

在 [renew_key](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L586-L619) 中，即便不考虑 Token Rotation，还有更隐蔽的问题：

```python
self.extra_args["oauth"] |= response.json()
```

这行代码使用 `|=` 合并新响应到已有 `extra_args["oauth"]`。当多个 Worker 并发执行时：

1. Worker-1 读取 `self.extra_args`（内存中的 Python 对象）
2. Worker-2 也读取 `self.extra_args`（同一个 Integration 对象，但 Django ORM 各自独立加载）
3. Worker-1 覆盖写入新数据：`self.save(update_fields=["expiring", "extra_args"])`
4. Worker-2 覆盖写入新数据：`self.save(update_fields=["expiring", "extra_args"])` ← **覆盖了 Worker-1 的写入**

结果：数据库中保存的是最后一个 Worker 写入的凭证。如果 Worker-1 获得了有效的 `access_token` + `refresh_token`，而 Worker-2 的刷新失败（因为旧 `refresh_token` 已失效），Worker-2 的 `save()` 会把失败的响应数据写入数据库，**覆盖掉 Worker-1 成功获得的有效凭证**。

---

## 问题二：基于数据库分布式锁的双重检查锁重构方案

### 2.1 设计目标

1. **互斥性**：同一 Integration 在同一时刻只允许一个进程执行令牌刷新
2. **高吞吐**：令牌未过期时零开销（不获取锁）
3. **快速失败**：锁等待不应无限阻塞，需要超时机制
4. **自适应降级**：刷新失败后为其他等待者提供短路返回
5. **兼容性**：不引入新的外部依赖（Redis 等），基于 Django 已有基础设施

### 2.2 方案 A：`select_for_update` 行级锁双重检查

#### 架构图

```
Worker-1                         Worker-2                         Worker-3
  │                                │                                │
  ├─ 第一次检查(无锁)              ├─ 第一次检查(无锁)              ├─ 第一次检查(无锁)
  │  expiring < now? → YES         │  expiring < now? → YES         │  expiring < now? → YES
  │                                │                                │
  ├─ 获取行级锁                    ├─ 获取行级锁(BLOCKED)           ├─ 获取行级锁(BLOCKED)
  │  SELECT ... FOR UPDATE         │  等待...                       │  等待...
  │  ✓ 获得锁                     │                                │
  │                                │                                │
  ├─ 第二次检查(持锁)              │                                │
  │  重新读取 expiring             │                                │
  │  仍然过期? → YES               │                                │
  │                                │                                │
  ├─ 发起 refresh 请求             │                                │
  │  成功 → 更新凭证 + expiring    │                                │
  │  save()                        │                                │
  │  COMMIT(释放锁)                ├─ 获得锁                       │
  │                                ├─ 第二次检查(持锁)              │
  │                                │  重新读取 expiring              │
  │                                │  已被更新,不再过期 → SKIP       │
  │                                │  COMMIT(释放锁)                ├─ 获得锁
  │                                │                                ├─ 第二次检查
  │                                │                                │  不再过期 → SKIP
```

#### 代码实现

```python
from django.db import transaction


def renew_key(self):
    if not self.has_oauth:
        return True
    if "expires_in" not in self.extra_args.get("oauth", {}):
        return True
    if self.expiring >= timezone.now():
        return True

    try:
        with transaction.atomic():
            locked_self = Integration.objects.select_for_update().get(pk=self.pk)

            if locked_self.expiring >= timezone.now():
                return True

            success, response = self.run_request(
                self.manifest["oauth"]["refresh"]
            )

            if not success:
                user = self.new_hire if self.has_user_context else None
                Notification.objects.create(
                    notification_type=Notification.Type.FAILED_INTEGRATION,
                    extra_text=self.name,
                    created_for=user,
                    description="Refresh url: " + str(response),
                )
                return False

            locked_self.extra_args["oauth"] |= response.json()
            if "expires_in" in response.json():
                locked_self.expiring = timezone.now() + timedelta(
                    seconds=response.json()["expires_in"]
                )
            locked_self.save(update_fields=["expiring", "extra_args"])

            self.extra_args = locked_self.extra_args
            self.expiring = locked_self.expiring

            if hasattr(self, "tracker"):
                last_step = self.tracker.steps.last()
                last_step.json_response = self.clean_response(
                    last_step.json_response
                )
                last_step.save()

    except Exception:
        return False

    return True
```

#### 关键设计说明

| 设计点 | 说明 |
|-------|------|
| **第一次检查（无锁快速路径）** | `self.expiring >= timezone.now()` 直接返回，99% 的请求不会进入锁区域 |
| **`select_for_update()`** | PostgreSQL 的 `FOR UPDATE` 会在行级加排他锁，其他事务在此行上的 `select_for_update` 会阻塞直到锁释放 |
| **第二次检查（持锁确认）** | 从数据库重新读取 `expiring`，避免因内存中缓存了旧值导致的重复刷新 |
| **事务提交即释放锁** | `with transaction.atomic()` 正常退出时自动 `COMMIT`，锁随之释放 |
| **同步内存状态** | 刷新成功后将数据库值同步回 `self`，避免后续 `run_request` 使用旧凭证 |

**注意**：`select_for_update` 需要 PostgreSQL（或 MySQL InnoDB）才支持行级锁。SQLite 不支持此特性。此外，如果 `run_request` 的网络请求耗时较长，锁持有时间会很长，影响并发吞吐量。

### 2.3 方案 B：Django 缓存锁双重检查（推荐）

`select_for_update` 的主要缺陷是锁持有时间与网络请求耗时成正比，高并发下可能造成连接池耗尽。Django 缓存锁将"互斥"与"网络请求"解耦。

#### 架构图

```
Worker-1                              Worker-2
  │                                     │
  ├─ 第一次检查(无锁)                   ├─ 第一次检查(无锁)
  │  expiring < now? → YES              │  expiring < now? → YES
  │                                     │
  ├─ 尝试获取缓存锁                     ├─ 尝试获取缓存锁
  │  cache.add("renew:{pk}", ...)       │  cache.add("renew:{pk}", ...)
  │  → True(获得锁)                     │  → False(锁已存在)
  │                                     │
  ├─ 重新从DB读取                       ├─ 等待锁释放
  │  Integration.objects.get(pk)        │  time.sleep(0.5)
  │  expiring 仍然过期? → YES           │  重新从DB读取
  │                                     │  expiring 已更新 → SKIP ✓
  ├─ 发起 refresh 请求
  │  成功 → save() + 释放锁
  │  cache.delete("renew:{pk}")
  │
```

#### 代码实现

```python
from django.core.cache import cache
import logging

logger = logging.getLogger(__name__)

RENEW_KEY_LOCK_PREFIX = "integration:renew_key_lock:"
RENEW_KEY_LOCK_TIMEOUT = 30


def renew_key(self):
    if not self.has_oauth:
        return True
    if "expires_in" not in self.extra_args.get("oauth", {}):
        return True
    if self.expiring >= timezone.now():
        return True

    lock_key = f"{RENEW_KEY_LOCK_PREFIX}{self.pk}"
    acquired = cache.add(lock_key, "1", RENEW_KEY_LOCK_TIMEOUT)

    if not acquired:
        for _ in range(6):
            import time
            time.sleep(0.5)
            refreshed = Integration.objects.get(pk=self.pk)
            if refreshed.expiring >= timezone.now():
                self.extra_args = refreshed.extra_args
                self.expiring = refreshed.expiring
                return True

        Notification.objects.create(
            notification_type=Notification.Type.FAILED_INTEGRATION,
            extra_text=self.name,
            created_for=self.new_hire if self.has_user_context else None,
            description="Token refresh timed out: another process holds the lock",
        )
        return False

    try:
        locked_self = Integration.objects.get(pk=self.pk)
        if locked_self.expiring >= timezone.now():
            self.extra_args = locked_self.extra_args
            self.expiring = locked_self.expiring
            return True

        success, response = self.run_request(
            self.manifest["oauth"]["refresh"]
        )

        if not success:
            user = self.new_hire if self.has_user_context else None
            Notification.objects.create(
                notification_type=Notification.Type.FAILED_INTEGRATION,
                extra_text=self.name,
                created_for=user,
                description="Refresh url: " + str(response),
            )
            return False

        locked_self.extra_args["oauth"] |= response.json()
        if "expires_in" in response.json():
            locked_self.expiring = timezone.now() + timedelta(
                seconds=response.json()["expires_in"]
            )
        locked_self.save(update_fields=["expiring", "extra_args"])

        self.extra_args = locked_self.extra_args
        self.expiring = locked_self.expiring

        if hasattr(self, "tracker"):
            last_step = self.tracker.steps.last()
            last_step.json_response = self.clean_response(
                last_step.json_response
            )
            last_step.save()

        return True
    finally:
        cache.delete(lock_key)
```

#### 关键设计说明

| 设计点 | 说明 |
|-------|------|
| **`cache.add` 原子性** | `add` 仅在 key 不存在时设置成功并返回 `True`，天然实现互斥获取 |
| **锁超时自动释放** | `RENEW_KEY_LOCK_TIMEOUT = 30` 秒后锁自动过期，防止进程崩溃导致死锁 |
| **等待者轮询 + 重读** | 未获得锁的 Worker 短暂等待后从数据库重新读取，利用刷新成功者写入的新值 |
| **`finally` 释放锁** | 无论刷新成功或失败，都确保锁被释放 |
| **无长事务** | 不持有数据库事务锁，网络请求期间不占用数据库连接 |

#### 两种方案对比

| 维度 | 方案 A: `select_for_update` | 方案 B: 缓存锁（推荐） |
|-----|---------------------------|----------------------|
| 互斥保证 | 强（数据库行锁） | 最终一致（缓存 + DB 重读） |
| 锁持有时间 | 整个 refresh 请求耗时 | 同上，但通过 TTL 兜底 |
| 数据库连接占用 | 是，事务期间占用连接 | 否，网络请求在事务外 |
| 死锁风险 | 需注意事务嵌套 | TTL 自动过期，无死锁 |
| 缓存依赖 | 无 | 依赖 Django CACHE 配置 |
| 适用场景 | 单进程 / 低并发 | 多进程 / 高并发 |
| 实现复杂度 | 低 | 中等 |

### 2.4 方案 C：`select_for_update` + 缓存锁混合（生产级）

在高安全要求场景下，可以结合两种方案的优点：

```python
def renew_key(self):
    if not self.has_oauth:
        return True
    if "expires_in" not in self.extra_args.get("oauth", {}):
        return True
    if self.expiring >= timezone.now():
        return True

    lock_key = f"{RENEW_KEY_LOCK_PREFIX}{self.pk}"
    acquired = cache.add(lock_key, "1", RENEW_KEY_LOCK_TIMEOUT)

    if not acquired:
        for _ in range(6):
            import time
            time.sleep(0.5)
            refreshed = Integration.objects.get(pk=self.pk)
            if refreshed.expiring >= timezone.now():
                self.extra_args = refreshed.extra_args
                self.expiring = refreshed.expiring
                return True

        Notification.objects.create(
            notification_type=Notification.Type.FAILED_INTEGRATION,
            extra_text=self.name,
            created_for=self.new_hire if self.has_user_context else None,
            description="Token refresh timed out waiting for lock",
        )
        return False

    try:
        with transaction.atomic():
            locked_self = Integration.objects.select_for_update().get(
                pk=self.pk
            )
            if locked_self.expiring >= timezone.now():
                self.extra_args = locked_self.extra_args
                self.expiring = locked_self.expiring
                return True

        refreshed = Integration.objects.get(pk=self.pk)
        success, response = self.run_request(
            self.manifest["oauth"]["refresh"]
        )

        if not success:
            user = self.new_hire if self.has_user_context else None
            Notification.objects.create(
                notification_type=Notification.Type.FAILED_INTEGRATION,
                extra_text=self.name,
                created_for=user,
                description="Refresh url: " + str(response),
            )
            return False

        with transaction.atomic():
            locked_self = Integration.objects.select_for_update().get(
                pk=self.pk
            )
            locked_self.extra_args["oauth"] |= response.json()
            if "expires_in" in response.json():
                locked_self.expiring = timezone.now() + timedelta(
                    seconds=response.json()["expires_in"]
                )
            locked_self.save(update_fields=["expiring", "extra_args"])

        self.extra_args = locked_self.extra_args
        self.expiring = locked_self.expiring

        if hasattr(self, "tracker"):
            last_step = self.tracker.steps.last()
            last_step.json_response = self.clean_response(
                last_step.json_response
            )
            last_step.save()

        return True
    finally:
        cache.delete(lock_key)
```

**混合方案的核心思路**：

1. **缓存锁控制"谁能刷新"**：快速互斥，避免多个 Worker 同时发起 HTTP 请求
2. **行级锁控制"谁能写入"**：确保数据库写入的原子性，防止 `extra_args` 被并发覆盖
3. **网络请求在事务外执行**：不占用数据库连接，避免连接池耗尽
4. **写入时再加行级锁**：`select_for_update` 的持有时间极短（仅 `save()` 操作），最大化并发吞吐

---

## 问题三：FAILED_INTEGRATION 通知的级联阻塞效应

### 3.1 当前通知创建路径分析

`renew_key` 刷新失败时的代码路径：

```python
# renew_key() 失败
if not success:
    user = self.new_hire if self.has_user_context else None
    Notification.objects.create(
        notification_type=Notification.Type.FAILED_INTEGRATION,
        extra_text=self.name,
        created_for=user,
        description="Refresh url: " + str(response),
    )
    return success  # → False
```

返回 `False` 后的传播路径：

```
renew_key() → False
    ↓
execute() [L673] → return False, None
    ↓
IntegrationConfig.execute() [L628-L630]
    self.integration.execute(user, self.additional_data, retry_on_failure=True)
    ↓
Condition.process_condition() [L911]
    item.execute(user)  ← 静默失败，无异常传播
    ↓
process_condition task [L31]
    condition.process_condition(user)  ← 继续，不中断
```

### 3.2 级联阻塞机制

级联阻塞**不是**通过 `FAILED_INTEGRATION` 通知本身产生的（通知仅是记录），而是通过 **Integration 对象的状态污染** 产生的。整个级联链如下：

```
┌─────────────────────────────────────────────────────────────┐
│                  Integration(id=5, OAuth2过期)                 │
│                  refresh_token = "old_token"                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
      ┌────────────┼────────────────┐
      │            │                │
      ▼            ▼                ▼
┌──────────┐ ┌──────────┐   ┌──────────┐
│ 新员工A   │ │ 新员工B   │   │ 新员工C   │
│ Condition │ │ Condition │   │ Condition │
│   ↓       │ │   ↓       │   │   ↓       │
│ renew_key │ │ renew_key │   │ renew_key │
│   ↓       │ │   ↓       │   │   ↓       │
│ 失败!     │ │ 失败!     │   │ 失败!     │
│   ↓       │ │   ↓       │   │   ↓       │
│ FAILED_   │ │ FAILED_   │   │ FAILED_   │
│ INTEGRATION│ │ INTEGRATION│ │ INTEGRATION│
│   ↓       │ │   ↓       │   │   ↓       │
│ 1h后重试  │ │ 1h后重试  │   │ 1h后重试  │
│ (仍失败!) │ │ (仍失败!) │   │ (仍失败!) │
└──────────┘ └──────────┘   └──────────┘
```

**核心问题**：`renew_key` 失败后，`Integration` 对象的 `refresh_token` 仍然是旧的（已被上游撤销或轮换），但方法**没有将 Integration 标记为"不可用"**。后续所有使用该 Integration 的流程都会重复走同样的失败路径。

### 3.3 具体级联场景

#### 场景 1：定时触发批量失败

[timed_triggers](file:///e:/solo-code-2/ChiefOnboarding/back/admin/sequences/tasks.py#L133-L226) 每 5 分钟运行一次，扫描所有新员工的 Condition：

```python
for user in get_user_model().new_hires.all():
    conditions = user.conditions.filter(
        condition_type=Condition.Type.AFTER,
        days=amount_days,
        time=current_time,
    )
    for i in conditions:
        async_task(
            process_condition,
            i.id,
            user.id,
        )
```

如果有 10 个新员工在同一时间窗口内的 Condition 引用了同一个 Integration，则 10 个 `async_task` 会被并行调度，每个都会调用 `renew_key()`，每个都会创建 `FAILED_INTEGRATION` 通知，每个都会调度 1 小时后的重试。

#### 场景 2：重试雪崩

[retry_integration](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/tasks.py#L5-L8) 的实现：

```python
def retry_integration(new_hire_id, integration_id, params):
    integration = Integration.objects.get(id=integration_id)
    new_hire = get_user_model().objects.get(id=new_hire_id)
    integration.execute(new_hire, params)
```

1 小时后重试时，如果 Integration 的 OAuth2 授权已被上游撤销（因 refresh_token 重用检测），则重试仍然会失败。但这次 `retry_on_failure` 不再为 `True`（重试是直接调用 `execute`，不经过 `IntegrationConfig.execute`），所以**不会再调度重试**——该新员工的集成流程被**永久静默放弃**。

#### 场景 3：其他 IntegrationConfig 的误杀

一个 Condition 可以包含多个 `IntegrationConfig`（参见 [Condition.integration_configs](file:///e:/solo-code-2/ChiefOnboarding/back/admin/sequences/models.py#L753)），但每个 `IntegrationConfig` 可能引用不同的 `Integration`。当其中一个 `Integration` 的令牌刷新失败时：

```python
# Condition.process_condition() [L905-L912]
for field in ["admin_tasks", "external_messages", "integration_configs", "hardware"]:
    for item in getattr(self, field).all():
        item.execute(user)  # ← 每个独立执行
```

虽然每个 `IntegrationConfig.execute()` 是独立调用的，不会因为一个失败而跳过其他的，**但是** `IntegrationConfig.execute()` 在 `renew_key()` 返回 `False` 后会返回（不执行实际业务逻辑），然后 `process_condition` 继续执行下一个 item。

**问题在于**：如果两个 `IntegrationConfig` 引用了**同一个** `Integration`（这在使用同一个集成但不同配置时很常见），则第二个也会因为相同的 `renew_key()` 失败而失败。

### 3.4 FAILED_INTEGRATION 通知的语义缺陷

当前 `Notification` 模型中 `FAILED_INTEGRATION` 的设计存在以下问题：

| 问题 | 说明 |
|-----|------|
| **归因错误** | `created_for` 关联到特定新员工，但根本原因是 Integration 级别的全局故障 |
| **信息冗余** | 同一个 Integration 的令牌刷新失败，会为每个新员工各创建一条通知，产生 N 条重复通知 |
| **无恢复机制** | 通知被创建后没有对应的"恢复"通知类型，管理员无法区分"暂时的网络超时"和"OAuth2 授权被永久撤销" |
| **无聚合能力** | 管理员在通知面板中看到 10 条 `FAILED_INTEGRATION`，无法快速识别这是同一个 Integration 的 10 次失败 |

### 3.5 级联阻塞的完整影响链

```
renew_key() 网络超时失败
    │
    ├── FAILED_INTEGRATION 通知 × N（每个触发的新员工一条）
    │
    ├── execute() 返回 False
    │   ├── 当前新员工的集成流程中断
    │   └── retry_on_failure=True → 1小时后重试
    │       └── 重试仍使用同一个 Integration（refresh_token 可能已失效）
    │           └── 二次失败 → 永久放弃（不再重试）
    │
    ├── Integration.expiring 未更新
    │   └── 后续所有使用该 Integration 的流程
    │       ├── user_exists() → renew_key() → 再次失败
    │       ├── execute() → renew_key() → 再次失败
    │       └── revoke_user() → renew_key() → 再次失败
    │
    └── 如果是 Token Rotation 场景
        └── 并发刷新导致 refresh_token 被上游撤销
            └── Integration 进入不可恢复状态
                └── 需要管理员手动重新授权 OAuth2
```

### 3.6 缓解级联阻塞的建议

#### 短期：集成级故障标记

```python
class Integration(models.Model):
    # ... 现有字段 ...

    oauth_failure_at = models.DateTimeField(null=True, blank=True)
    oauth_failure_reason = models.TextField(default="", blank=True)

    def renew_key(self):
        if not self.has_oauth:
            return True
        if "expires_in" not in self.extra_args.get("oauth", {}):
            return True
        if self.expiring >= timezone.now():
            return True

        if self.oauth_failure_at is not None:
            cooldown = timezone.now() - self.oauth_failure_at
            if cooldown < timedelta(minutes=5):
                return False

        lock_key = f"{RENEW_KEY_LOCK_PREFIX}{self.pk}"
        acquired = cache.add(lock_key, "1", RENEW_KEY_LOCK_TIMEOUT)

        if not acquired:
            refreshed = Integration.objects.get(pk=self.pk)
            if refreshed.expiring >= timezone.now():
                self.extra_args = refreshed.extra_args
                self.expiring = refreshed.expiring
                return True
            if refreshed.oauth_failure_at is not None:
                self.oauth_failure_at = refreshed.oauth_failure_at
                self.oauth_failure_reason = refreshed.oauth_failure_reason
                return False
            for _ in range(6):
                import time
                time.sleep(0.5)
                refreshed = Integration.objects.get(pk=self.pk)
                if refreshed.expiring >= timezone.now():
                    self.extra_args = refreshed.extra_args
                    self.expiring = refreshed.expiring
                    return True
            return False

        try:
            locked_self = Integration.objects.get(pk=self.pk)
            if locked_self.expiring >= timezone.now():
                self.extra_args = locked_self.extra_args
                self.expiring = locked_self.expiring
                return True

            success, response = self.run_request(
                self.manifest["oauth"]["refresh"]
            )

            if not success:
                locked_self.oauth_failure_at = timezone.now()
                locked_self.oauth_failure_reason = str(response)
                locked_self.save(
                    update_fields=["oauth_failure_at", "oauth_failure_reason"]
                )

                Notification.objects.create(
                    notification_type=Notification.Type.FAILED_INTEGRATION,
                    extra_text=self.name,
                    created_for=None,
                    description="Refresh url: " + str(response),
                )
                return False

            locked_self.extra_args["oauth"] |= response.json()
            if "expires_in" in response.json():
                locked_self.expiring = timezone.now() + timedelta(
                    seconds=response.json()["expires_in"]
                )
            locked_self.oauth_failure_at = None
            locked_self.oauth_failure_reason = ""
            locked_self.save(
                update_fields=["expiring", "extra_args",
                               "oauth_failure_at", "oauth_failure_reason"]
            )

            self.extra_args = locked_self.extra_args
            self.expiring = locked_self.expiring

            if hasattr(self, "tracker"):
                last_step = self.tracker.steps.last()
                last_step.json_response = self.clean_response(
                    last_step.json_response
                )
                last_step.save()

            return True
        finally:
            cache.delete(lock_key)
```

**改进点**：
- `oauth_failure_at` 标记 Integration 级别的故障状态，替代 N 条 `FAILED_INTEGRATION` 通知
- `created_for=None` 表明这是全局故障，不归因于特定用户
- 5 分钟冷却期避免对已知故障的 Integration 反复刷新请求
- 故障恢复时（刷新成功）自动清除标记

#### 中期：故障通知聚合

在 [Notification](file:///e:/solo-code-2/ChiefOnboarding/back/organization/models.py#L290-L467) 模型中增加去重逻辑：

```python
class Notification(models.Model):
    # ... 现有字段 ...

    dedup_key = models.CharField(max_length=200, default="", blank=True, db_index=True)

    @classmethod
    def create_dedup(cls, dedup_key=None, **kwargs):
        if dedup_key and cls.objects.filter(dedup_key=dedup_key).exists():
            cls.objects.filter(dedup_key=dedup_key).update(
                description=kwargs.get("description", ""),
                created=timezone.now(),
            )
            return cls.objects.get(dedup_key=dedup_key)
        return cls.objects.create(dedup_key=dedup_key or "", **kwargs)
```

使用时：

```python
Notification.create_dedup(
    dedup_key=f"oauth_refresh_failure:{self.pk}",
    notification_type=Notification.Type.FAILED_INTEGRATION,
    extra_text=self.name,
    created_for=None,
    description="Refresh url: " + str(response),
)
```

---

## 总结

| 问题 | 根因 | 影响 | 推荐方案 |
|-----|------|-----|---------|
| 并发刷新导致 refresh_token 失效 | TOCTOU 竞态 + OAuth2 Token Rotation | Integration OAuth2 授权被永久撤销 | 缓存锁双重检查（方案 B） |
| 并发写入覆盖有效凭证 | `self.save()` 无行级保护 | 最后写入者覆盖，有效凭证丢失 | 写入时 `select_for_update` 保护 |
| FAILED_INTEGRATION 级联阻塞 | Integration 级故障未标记，反复触发 | N 条冗余通知 + 重试雪崩 + 永久静默放弃 | 集成级故障标记 + 冷却期 + 通知去重 |
