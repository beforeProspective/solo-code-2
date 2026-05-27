# Django Token 创建并发竞态条件分析

## 一、代码位置

- 函数定义：[models.py](file:///e:/solo-code-2/pinry/users/models.py#L8-L14)
- 信号调用：[models.py](file:///e:/solo-code-2/pinry/users/models.py#L27-L29)
- 序列化器调用：[serializers.py](file:///e:/solo-code-2/pinry/users/serializers.py#L79-L82)

```python
def create_token_if_necessary(user: BaseUser):
    from rest_framework.authtoken.models import Token
    token = Token.objects.filter(user=user).first()
    if token is not None:
        return token
    else:
        return Token.objects.create(user=user)
```

---

## 二、竞态条件分析

### 2.1 触发场景

`create_token_if_necessary` 在两个地方被调用：

1. **`post_save` 信号处理器 `create_profile`**：每当 `User` 保存后自动调用。这是最关键的入口，高并发注册时多个请求几乎同时保存 User 对象。
2. **`UserSerializer.get_token`**：序列化时按需创建 token，若多个请求同时获取同一用户的 token 也会触发。

### 2.2 竞态条件产生机制

此函数采用的是经典的 **TOCTOU（Time of Check, Time of Use）** 模式——先检查再创建，两步操作之间存在时间窗口。

执行流程如下：

```
时间   线程A                                    线程B
 │   filter(user=user).first()
 │   → 结果：None
 │                                     filter(user=user).first()
 │                                     → 结果：None
 │   Token.objects.create(user=user)
 │   → 插入成功
 │                                     Token.objects.create(user=user)
 │                                     → 插入失败！
 ↓
```

### 2.3 具体违反的数据库约束

`rest_framework.authtoken.models.Token` 模型在其 `user` 字段上定义了 `OneToOneField`，对应数据库层面的 **唯一约束（UNIQUE constraint）**：

```sql
-- DRF Token 模型对应的 DDL
CREATE TABLE authtoken_token (
    key VARCHAR(40) NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,  -- 唯一约束
    created DATETIME NOT NULL
);
```

因此，当线程 A 成功插入后，线程 B 的 `INSERT` 操作会触发数据库级别的 `IntegrityError`，具体表现为：

```
django.db.utils.IntegrityError: UNIQUE constraint failed: authtoken_token.user_id
```

在 MySQL 中错误类似：

```
django.db.utils.IntegrityError: (1062, "Duplicate entry 'X' for key 'user_id'")
```

在 PostgreSQL 中错误类似：

```
django.db.utils.IntegrityError: duplicate key value violates unique constraint "authtoken_token_user_id_key"
```

### 2.4 失败的严重性

- **功能层面**：第二次 `create()` 调用抛出未捕获异常，导致整个请求失败，用户注册流程中断。
- **信号层面**：`post_save` 信号中抛出的异常会导致 `save()` 操作回滚，User 对象本身也可能被回滚（取决于事务配置），用户无法完成注册。
- **数据层面**：如果 Token 创建在显式事务中，异常可能导致整个事务回滚，丢失所有已做的更改。

---

## 三、`get_or_create` vs `filter().first()` + `create()`

### 3.1 `get_or_create` 的实现原理

Django ORM 的 `get_or_create` 在单次数据库操作中同时完成查询和创建。其核心逻辑位于 `django/db/models/query.py`：

```python
def get_or_create(self, defaults=None, **kwargs):
    # ... 省略参数处理 ...
    try:
        return self.get(**kwargs), False
    except self.model.DoesNotExist:
        try:
            return self.create(**params, **defaults), True
        except IntegrityError:
            return self.get(**kwargs), False
```

关键特征：

| 步骤 | `filter().first()` + `create()` | `get_or_create()` |
|------|-------------------------------|-------------------|
| 查询 | `SELECT ... WHERE user_id = ?` | `SELECT ... WHERE user_id = ?` |
| 创建 | `INSERT INTO ...` | `INSERT INTO ...` |
| 并发保护 | ❌ 无，依赖调用方 | ✅ 内部捕获 `IntegrityError` 并回退到 `get` |
| 原子性 | ❌ 两步非原子 | ⚠️ 非严格原子，但有回退机制 |

### 3.2 `get_or_create` 的三个改进

1. **消除竞态窗口**：虽然 `get_or_create` 在底层仍是先 `SELECT` 再 `INSERT`，但它内置了 `IntegrityError` 捕获机制。当并发导致 `INSERT` 失败时，它会自动执行一次 `get()` 重试获取已有记录，调用方不会看到异常。

2. **返回值语义**：返回 `(instance, created)` 元组，`created=True` 表示新创建，`created=False` 表示已存在。调用方可以根据此标志做不同处理。

3. **减少数据库往返**：与手动编写 try-except 逻辑等价，但封装在 ORM 层，代码更简洁。

### 3.3 改写示例

```python
def create_token_if_necessary(user: BaseUser):
    from rest_framework.authtoken.models import Token
    token, _ = Token.objects.get_or_create(user=user)
    return token
```

### 3.4 `get_or_create` 的局限性

**重要：`get_or_create` 并非完美的原子操作**。它在数据库层面仍然是「先 SELECT 再 INSERT」的两步操作，只是多了一层 `IntegrityError` 捕获后的重试。这意味着：

- 如果并发写入恰好都在 SELECT 步骤返回空，两者都进入 INSERT 分支，其中一个会 `IntegrityError`，然后自动回退到 `get()` 获取已有记录。**对调用方完全透明，不会抛出异常。**
- 但 `get_or_create` 内部的 `IntegrityError` 捕获是一个 **通用 `except IntegrityError`**，在 PostgreSQL 下会额外执行一次 `savepoint` 回滚以清理事务状态。

---

## 四、完全消除并发问题的鲁棒方案

### 4.1 方案一：`select_for_update` 锁行（悲观锁）

在事务中对 Token 表执行 `SELECT ... FOR UPDATE`，让行级锁保证同一时间只有一个线程能访问：

```python
from django.db import transaction, IntegrityError
from rest_framework.authtoken.models import Token

@transaction.atomic
def create_token_if_necessary(user: BaseUser):
    # 尝试获取行级锁（如果记录已存在则锁住）
    # select_for_update 需要在事务内使用
    token = Token.objects.select_for_update().filter(user=user).first()
    if token is not None:
        return token
    try:
        # 在持锁事务内创建
        return Token.objects.create(user=user)
    except IntegrityError:
        # 极端情况：即使在事务中，也可能因 unique 约束冲突
        # 此时另一个事务已创建，直接查询返回
        return Token.objects.get(user=user)
```

**优点**：
- 真正的行级锁保护，`select_for_update` 会阻塞其他事务对同一行的访问。
- 唯一约束冲突几乎不可能发生（因为先锁住了相关行）。

**缺点**：
- 必须在显式事务中使用（`@transaction.atomic` 装饰器）。
- 在极端高并发下仍可能出现死锁（两个事务互相等待对方释放锁）。
- 对不存在的记录，`select_for_update` 无法加锁，所以 `IntegrityError` 捕获仍然需要。

### 4.2 方案二：`select_for_update(skip_locked=True)`（推荐，PostgreSQL 9.5+/MySQL 8.0+）

跳过已被其他事务锁定的行，避免阻塞：

```python
from django.db import transaction, IntegrityError
from rest_framework.authtoken.models import Token

@transaction.atomic
def create_token_if_necessary(user: BaseUser):
    token = (
        Token.objects
        .select_for_update(skip_locked=True)
        .filter(user=user)
        .first()
    )
    if token is not None:
        return token
    try:
        return Token.objects.create(user=user)
    except IntegrityError:
        return Token.objects.get(user=user)
```

**优点**：
- 不会因为等待锁而阻塞其他事务。
- 如果其他事务正在创建 Token，`select_for_update(skip_locked=True)` 直接返回空，进入 `IntegrityError` 分支获取已创建的记录。

### 4.3 方案三：`get_or_create` + 显式 `IntegrityError` 处理（最通用）

这是最推荐的通用方案，不依赖特定数据库特性：

```python
from django.db import IntegrityError
from rest_framework.authtoken.models import Token

def create_token_if_necessary(user: BaseUser):
    try:
        token, _ = Token.objects.get_or_create(user=user)
        return token
    except IntegrityError:
        # 极端竞态：get_or_create 内部的 get 也可能因唯一约束冲突而失败
        # （例如 PostgreSQL 下 savepoint 操作失败导致事务中止）
        # 此时必须显式重新查询
        return Token.objects.get(user=user)
```

**为什么还要捕获 `IntegrityError`？**

虽然 `get_or_create` 内部已经捕获了 `IntegrityError`，但在某些数据库（特别是 PostgreSQL）下：

- `get_or_create` 为了实现"失败后回退到 get"，会使用 `savepoint`（保存点）。
- 在 PostgreSQL 中，任何 `IntegrityError` 会导致当前事务进入「中止状态」，后续任何操作都无法执行，直到事务回滚。
- Django 的 `transaction.atomic` 装饰器会自动处理 savepoint 回滚，但在 **未被 `transaction.atomic` 包裹的代码路径** 中（例如直接调用 `get_or_create`），如果发生 `IntegrityError` 后又立即尝试 `get()`，PostgreSQL 会抛出 `current transaction is aborted, commands ignored until end of transaction block`。
- 因此，外层再包一层 `try-except IntegrityError` 是防御性编程的最佳实践。

### 4.4 方案四：数据库原生 `INSERT ... ON CONFLICT`（PostgreSQL 9.5+ / SQLite 3.24+ / MySQL 8.0+）

对于 PostgreSQL，可以使用原生 SQL 执行原子级 UPSERT：

```python
from django.db import connection
from rest_framework.authtoken.models import Token

def create_token_if_necessary(user: BaseUser):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO authtoken_token (user_id, key, created)
            VALUES (%s, %s, NOW())
            ON CONFLICT (user_id) DO NOTHING
            RETURNING key
            """,
            [user.id, Token.generate_key()]
        )
        row = cursor.fetchone()
    if row:
        # 新创建
        return Token.objects.get(key=row[0])
    else:
        # 已存在，冲突时 DO NOTHING 不返回行
        return Token.objects.get(user=user)
```

**优点**：
- 数据库层面真正的原子操作，不存在竞态条件。
- 单次数据库往返。

**缺点**：
- 依赖特定数据库语法，跨数据库不兼容。
- 绕过了 Django ORM 的信号、验证等机制。
- 需要手动处理 key 生成。

---

## 五、最终推荐方案

综合考虑代码简洁性、数据库兼容性和鲁棒性，**方案三** 是最佳选择：

```python
from django.db import IntegrityError
from rest_framework.authtoken.models import Token


def create_token_if_necessary(user: BaseUser):
    try:
        token, _ = Token.objects.get_or_create(user=user)
        return token
    except IntegrityError:
        return Token.objects.get(user=user)
```

**与原代码的对比：**

| 维度 | 原代码 (`filter().first()` + `create()`) | 推荐代码 (`get_or_create` + `IntegrityError`) |
|------|------------------------------------------|-----------------------------------------------|
| 代码行数 | 7 行 | 7 行 |
| 并发安全 | ❌ 直接抛 `IntegrityError` | ✅ 优雅处理，返回已有 Token |
| 数据库往返 | 2 次 | 1-2 次（get 成功则 1 次，否则 2 次） |
| 事务安全 | ❌ 可能回滚整个注册事务 | ✅ 不影响外层事务 |
| 兼容性 | N/A | ✅ 所有数据库 |
| 代码意图 | 隐式（需阅读 if/else 才能理解） | 显式（`get_or_create` 语义清晰） |

**额外注意事项：**

1. 如果调用方已经在 `transaction.atomic` 中，`IntegrityError` 捕获后需要确认事务状态。建议将 `create_token_if_necessary` 本身标记为 `@transaction.atomic` 或确保调用方在事务中使用 savepoint。

2. 如果需要在极端高并发（数千 QPS）场景下使用，可以在 PostgreSQL 环境中升级为方案四（原生 `INSERT ... ON CONFLICT`）。

3. 对于 `create_profile` 信号处理器，建议添加 `dispatch_uid` 以避免在 Django 启动时重复连接信号导致多次调用：

```python
@receiver(post_save, sender=User, dispatch_uid="create_user_profile_token")
def create_profile(sender, instance: User, **kwargs):
    create_token_if_necessary(instance)
```