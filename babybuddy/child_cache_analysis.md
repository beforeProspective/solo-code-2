# Child 模型缓存计数机制分析

## 1. `save`/`delete` 方法与 `cache.set` 更新机制，以及 `count` 类方法的 `cache.get_or_set` 懒加载

### 1.1 `save` 方法中的缓存更新

```python
# core/models.py L220-L223
def save(self, *args, **kwargs):
    self.slug = slugify(self, allow_unicode=True)
    super(Child, self).save(*args, **kwargs)
    cache.set(self.cache_key_count, Child.objects.count(), None)
```

执行流程：

1. **先生成 slug**：在写入数据库前，通过 `slugify` 为当前实例计算 slug 值。
2. **调用父类 `save`**：`super(Child, self).save(...)` 将数据真正持久化到数据库。此时数据库中已包含该新增（或更新后的）记录。
3. **强制刷新缓存**：`cache.set(self.cache_key_count, Child.objects.count(), None)` 向缓存写入键 `"core.child.count"`，值为 **数据库中最新的总行数** `Child.objects.count()`，超时设为 `None`（永不过期）。

关键点：这里采用的是"写后刷新"（write-through）策略——每次单条 `save` 后，直接从数据库重新计算全量计数并覆盖缓存中的旧值，保证了**单进程串行操作**下缓存与数据库的一致性。

### 1.2 `delete` 方法中的缓存更新

```python
# core/models.py L225-L227
def delete(self, using=None, keep_parents=False):
    super(Child, self).delete(using, keep_parents)
    cache.set(self.cache_key_count, Child.objects.count(), None)
```

执行流程与 `save` 对称：

1. **调用父类 `delete`**：先从数据库中删除该实例。
2. **强制刷新缓存**：再次从数据库查询剩余总数并覆盖缓存。

注意：`delete` 的返回值（元组）被丢弃了，父类 `delete` 返回的 `(num_deleted, dict)` 信息没有传递回调用者。

### 1.3 `count` 类方法的懒加载读取

```python
# core/models.py L243-L246
@classmethod
def count(cls):
    """Get a (cached) count of total number of Child instances."""
    return cache.get_or_set(cls.cache_key_count, Child.objects.count, None)
```

执行流程：

1. **`cache.get_or_set(key, default, timeout)`** 是 Django 提供的原子性语义方法：
   - 如果缓存中存在键 `core.child.count`，直接返回其值（**不触发数据库查询**）。
   - 如果缓存中不存在该键（从未写入、已过期、或被手动清除），则调用 `default`（此处为 `Child.objects.count`——注意传递的是**方法引用**而非调用结果 `Child.objects.count()`），将返回值写入缓存并返回。
2. 超时设为 `None`，意味着一旦懒加载写入，缓存永不过期。

**读取路径总结**：`Child.count()` → 缓存命中则返回缓存值；缓存未命中则查库、写入缓存、返回值。

### 1.4 缓存键与后端

- **缓存键**：类属性 `cache_key_count = "core.child.count"`（[models.py#L209](file:///e:/solo-code-2/babybuddy/core/models.py#L209-L209)）
- **缓存后端**：项目配置使用 `django.core.cache.backends.db.DatabaseCache`，缓存数据存储在数据库表 `cache_default` 中（[base.py#L138-L143](file:///e:/solo-code-2/babybuddy/babybuddy/settings/base.py#L138-L143)）。这意味着缓存读写本身也经过数据库，与传统内存缓存（如 Redis/Memcached）相比，延迟更高且不具备真正的原子递增/递减能力。

---

## 2. 高并发环境下的数据一致性风险与竞态条件

### 2.1 `save` 中的竞态：读-写不一致

假设两个进程 P1、P2 同时创建 Child，数据库中当前有 N 条记录：

| 时间 | P1 | P2 |
|------|----|----|
| T1 | `super().save()` → DB 现有 N+1 条 | |
| T2 | | `super().save()` → DB 现有 N+2 条 |
| T3 | `Child.objects.count()` → 返回 N+2 | |
| T4 | `cache.set(key, N+2)` | |
| T5 | | `Child.objects.count()` → 返回 N+2 |
| T6 | | `cache.set(key, N+2)` |

此场景下缓存值 N+2 恰好正确。但考虑以下时序：

| 时间 | P1 | P2 |
|------|----|----|
| T1 | `super().save()` → DB 现有 N+1 条 | |
| T2 | `Child.objects.count()` → 返回 N+1 | |
| T3 | | `super().save()` → DB 现有 N+2 条 |
| T4 | | `Child.objects.count()` → 返回 N+2 |
| T5 | `cache.set(key, N+1)` ⚠️ | |
| T6 | | `cache.set(key, N+2)` |

P1 在 T5 写入的旧值 N+1 会覆盖 P2 在 T4 尚未写入的更准确的 N+2。不过这里 P2 在 T6 又写入了 N+2，最终结果正确。更危险的是：

| 时间 | P1 | P2 |
|------|----|----|
| T1 | `super().save()` → DB N+1 | |
| T2 | `Child.objects.count()` → N+1 | |
| T3 | `cache.set(key, N+1)` | |
| T4 | | `super().save()` → DB N+2 |
| T5 | | `Child.objects.count()` → N+2 |
| T6 | | `cache.set(key, N+2)` |

此场景正确。但以下情况会导致缓存永久错误：

| 时间 | P1 (create) | P2 (delete) |
|------|-------------|-------------|
| T1 | `super().save()` → DB N+1 | |
| T2 | | `super().delete()` → DB N |
| T3 | `Child.objects.count()` → N | |
| T4 | `cache.set(key, N)` ⚠️ | |
| T5 | | `Child.objects.count()` → N |
| T6 | | `cache.set(key, N)` |

此场景缓存值 N 正确。但：

| 时间 | P1 (create) | P2 (delete) |
|------|-------------|-------------|
| T1 | `super().save()` → DB N+1 | |
| T2 | | `super().delete()` → DB N |
| T3 | | `Child.objects.count()` → N |
| T4 | | `cache.set(key, N)` |
| T5 | `Child.objects.count()` → N | |
| T6 | `cache.set(key, N)` ⚠️ (P1 的 save 应使计数为 N+1，但 P2 已删除一条) |

实际 DB 中只有 N 条（P1 新增了1条但 P2 删除了1条），所以 N 是正确的。但如果 P2 的删除在 P1 的 `count()` 查询之后完成：

| 时间 | P1 (create) | P2 (delete) |
|------|-------------|-------------|
| T1 | `super().save()` → DB N+1 | |
| T2 | `Child.objects.count()` → N+1 | |
| T3 | | `super().delete()` → DB N |
| T4 | `cache.set(key, N+1)` ⚠️ | |
| T5 | | `Child.objects.count()` → N |
| T6 | | `cache.set(key, N)` |

如果 T4 在 T6 之前完成写入，那 T6 会修正回 N。但如果 T6 在 T4 之前：

| 时间 | P1 (create) | P2 (delete) |
|------|-------------|-------------|
| T1 | `super().save()` → DB N+1 | |
| T2 | `Child.objects.count()` → N+1 | |
| T3 | | `super().delete()` → DB N |
| T4 | | `Child.objects.count()` → N |
| T5 | | `cache.set(key, N)` |
| T6 | `cache.set(key, N+1)` ⚠️ **最终缓存值 N+1，DB 值 N** |

**缓存永久停留在 N+1，而数据库实际为 N，且超时设为 `None`（永不过期），错误将一直持续，直到下一次显式的 `save` 或 `delete` 操作。**

### 2.2 `cache.get_or_set` 的 TOCTOU 问题

`cache.get_or_set` 在 Django 的 `DatabaseCache` 后端中**并非真正的原子操作**。其实现逻辑是：

1. 尝试 `cache.get(key)`
2. 如果 miss，则 `cache.set(key, default_value)`

在步骤 1 和 2 之间存在时间窗口，多进程可能同时发现缓存 miss，同时查询数据库并执行 `cache.set`，导致：

- 重复的数据库查询（惊群效应）
- 后写入的值覆盖先写入的值，虽然值相同，但存在不必要的开销

### 2.3 `DatabaseCache` 后端的局限性

当前项目使用 `DatabaseCache` 作为缓存后端：

- **无原子递增/递减**：不像 Redis 的 `INCR`/`DECR`，无法通过原子操作增减计数，只能全量覆写。
- **缓存与业务数据在同一数据库**：缓存表和业务表共享同一个数据库连接，如果主库存在复制延迟，`Child.objects.count()` 可能读取到过期数据。
- **缓存行级锁**：`DatabaseCache` 在写入时使用 `SELECT ... FOR UPDATE`，但 `get_or_set` 的非原子性仍然存在。

### 2.4 事务隔离级别的影响

在 Django 默认的 `READ COMMITTED` 隔离级别下：

- `super().save()` 执行后，如果外层事务尚未提交，另一个进程的 `Child.objects.count()` 可能看不到新增的行。
- 这会导致 `save` 方法中的 `Child.objects.count()` 在自己事务内返回正确值，但其他进程的并发 `count()` 查询可能返回旧值。

---

## 3. `bulk_create` 等批量操作导致的缓存不一致及修正方案

### 3.1 不一致的根因

当前缓存更新**仅依赖重写的 `save()` 和 `delete()` 实例方法**。而以下操作**不会触发这些方法**：

| 操作 | 是否触发 `save()` | 是否触发 `delete()` | 缓存是否更新 |
|------|-------------------|---------------------|-------------|
| `child.save()` | ✅ | — | ✅ |
| `child.delete()` | — | ✅ | ✅ |
| `Child.objects.create(...)` | ✅（内部调用 `save`） | — | ✅ |
| `Child.objects.bulk_create([...])` | ❌ | — | ❌ |
| `Child.objects.filter(...).delete()` | — | ❌ | ❌ |
| `Child.objects.filter(...).update(...)` | ❌ | — | ❌ |
| Admin 导入（`import_export`） | 可能使用 `bulk_create` | — | ❌ |
| Django 管理命令 `loaddata` | ❌ | — | ❌ |

`bulk_create` 直接在数据库层面执行 `INSERT` 语句，**完全绕过**模型的 `save()` 方法。同样，`QuerySet.delete()` 执行 `DELETE` SQL，也不调用模型实例的 `delete()` 方法。

因此，任何通过 `bulk_create`、`QuerySet.delete()`、`QuerySet.update()` 修改数据后，缓存中的计数值仍然停留在最后一次 `save()`/`delete()` 调用时写入的值，与数据库实际行数产生偏差。且由于缓存超时设为 `None`，该错误值将**永久驻留**。

### 3.2 修正方案

#### 方案一：使用 Django 信号（推荐，最小侵入）

使用 `post_save` 和 `post_delete` 信号替代在 `save()`/`delete()` 中的缓存更新逻辑。信号在 `bulk_create` 等场景下同样不会被触发，但可以**同时保留 `save()`/`delete()` 中的逻辑作为补充**，或完全迁移到信号。

但需注意：`bulk_create` **同样不触发 `post_save` 信号**（在 Django 5.0 之前，`bulk_create` 不发送任何信号；Django 5.0+ 可通过 `bulk_create(..., send_signals=True)` 启用，但仅限 `post_save`）。

因此，仅使用信号**不能完全解决问题**，需要配合以下方案。

#### 方案二：自定义 Manager，重写 `bulk_create` 和 `QuerySet.delete`

```python
class ChildManager(models.Manager):
    def bulk_create(self, objs, *args, **kwargs):
        result = super().bulk_create(objs, *args, **kwargs)
        cache.set(Child.cache_key_count, Child.objects.count(), None)
        return result

    def _invalidate_count_cache(self):
        cache.set(Child.cache_key_count, Child.objects.count(), None)


class ChildQuerySet(models.QuerySet):
    def delete(self):
        result = super().delete()
        cache.set(Child.cache_key_count, Child.objects.count(), None)
        return result


class Child(models.Model):
    objects = ChildManager.from_queryset(ChildQuerySet)()

    # ... 其余字段不变 ...
```

此方案确保 `bulk_create` 和 `QuerySet.delete()` 执行后也刷新缓存。

#### 方案三：缓存失效策略（最终一致性）

不主动写入缓存，而是在数据变更后**删除缓存键**，让 `count()` 方法的 `cache.get_or_set` 在下次读取时自动从数据库懒加载：

```python
from django.core.cache import cache
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver


def _invalidate_child_count_cache():
    cache.delete(Child.cache_key_count)


@receiver(post_save, sender=Child)
def on_child_save(sender, **kwargs):
    _invalidate_child_count_cache()


@receiver(post_delete, sender=Child)
def on_child_delete(sender, **kwargs):
    _invalidate_child_count_cache()
```

同时重写 `save()`/`delete()` 方法，移除 `cache.set` 调用，改为调用 `_invalidate_child_count_cache()`。

优点：
- 避免了 `cache.set` 中先查库再写缓存的竞态窗口
- `cache.delete` 是幂等操作，即使多次调用也无副作用
- `count()` 方法中的 `cache.get_or_set` 保证了缓存重建

但 `bulk_create`（Django < 5.0）仍然不触发信号，仍需配合方案二中的自定义 Manager。

#### 方案四：综合方案（推荐）

结合方案二和方案三的优点：

1. **使用信号处理常规的 `save`/`delete` 操作**——采用缓存失效（`cache.delete`）而非缓存更新（`cache.set`），减少竞态窗口。
2. **自定义 Manager 重写 `bulk_create`**——在批量创建后使缓存失效。
3. **自定义 QuerySet 重写 `delete`**——在批量删除后使缓存失效。
4. **保留 `count()` 中的 `cache.get_or_set`**——作为缓存重建入口。
5. **考虑高并发场景**——如果使用 Redis 作为缓存后端，可使用 `cache.incr`/`cache.decr` 原子操作替代全量计数查询。

完整示例代码：

```python
from django.core.cache import cache
from django.db import models
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver


class ChildManager(models.Manager):
    def bulk_create(self, objs, *args, **kwargs):
        result = super().bulk_create(objs, *args, **kwargs)
        cache.delete(Child.cache_key_count)
        return result


class Child(models.Model):
    cache_key_count = "core.child.count"
    objects = ChildManager()

    def save(self, *args, **kwargs):
        self.slug = slugify(self, allow_unicode=True)
        super().save(*args, **kwargs)
        cache.delete(self.cache_key_count)

    def delete(self, using=None, keep_parents=False):
        result = super().delete(using=using, keep_parents=keep_parents)
        cache.delete(self.cache_key_count)
        return result

    @classmethod
    def count(cls):
        return cache.get_or_set(cls.cache_key_count, Child.objects.count, None)


@receiver(post_save, sender=Child)
def on_child_post_save(sender, **kwargs):
    cache.delete(Child.cache_key_count)


@receiver(post_delete, sender=Child)
def on_child_post_delete(sender, **kwargs):
    cache.delete(Child.cache_key_count)
```

### 3.3 各方案对比

| 维度 | 当前实现 | 方案一（仅信号） | 方案二（自定义 Manager） | 方案三（缓存失效） | 方案四（综合） |
|------|---------|----------------|------------------------|------------------|-------------|
| `save()`/`delete()` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `bulk_create` | ❌ | ❌ (Django<5.0) | ✅ | ❌ | ✅ |
| `QuerySet.delete()` | ❌ | ❌ | ✅ | ❌ | ✅ |
| 竞态风险 | 高 | 高 | 高 | 低 | 低 |
| 侵入性 | — | 低 | 中 | 中 | 中 |

### 3.4 关于 Django 5.0+ 的 `bulk_create` 信号支持

从 Django 5.0 开始，`bulk_create` 支持 `send_signals=True` 参数，可以在批量创建后发送 `post_save` 信号。如果项目升级到 Django 5.0+，方案三（纯缓存失效 + 信号）即可覆盖 `bulk_create` 场景，无需自定义 Manager。但 `QuerySet.delete()` 仍然不触发 `post_delete` 信号，仍需自定义 QuerySet 处理。

---

## 总结

| 问题 | 核心结论 |
|------|---------|
| `save`/`delete` 缓存更新 | 采用"写后全量刷新"策略，先完成数据库操作再 `cache.set` 写入最新计数；`count()` 通过 `cache.get_or_set` 实现懒加载读取 |
| 高并发竞态 | 多进程同时 `save`/`delete` 时，`cache.set` 的非原子性可能导致旧值覆盖新值，造成缓存永久偏误；`DatabaseCache` 后端无原子递增能力加剧了此风险 |
| `bulk_create` 不一致 | 批量操作绕过模型 `save()`/`delete()` 方法，缓存无法感知变更；建议采用"缓存失效 + 信号 + 自定义 Manager/QuerySet"的综合方案确保一致性 |
