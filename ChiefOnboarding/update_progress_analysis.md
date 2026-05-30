# update_progress 方法深度分析报告

## 方法概述

`update_progress` 方法位于 [back/users/models.py:384-405](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L384-L405)，属于 `User` 类的实例方法。该方法的核心功能是：

1. 收集用户所有待办任务（ToDo）和课程资源（Resource）的ID
2. 统计已完成的任务和课程数量
3. 更新用户的 `total_tasks` 和 `completed_tasks` 字段

```python
def update_progress(self):
    all_to_do_ids = list(
        self.conditions.values_list("to_do__id", flat=True)
    ) + list(self.to_do.values_list("id", flat=True))
    all_course_ids = list(
        self.conditions.filter(resources__course=True).values_list(
            "resources__id", flat=True
        )
    ) + list(self.resources.filter(course=True).values_list("id", flat=True))

    # remove duplicates
    all_to_do_ids = list(dict.fromkeys(all_to_do_ids))
    all_course_ids = list(dict.fromkeys(all_course_ids))

    completed_to_dos = ToDoUser.objects.filter(user=self, completed=True).count()
    completed_courses = ResourceUser.objects.filter(
        resource__course=True, user=self, completed_course=True
    ).count()

    self.total_tasks = len(all_to_do_ids + all_course_ids)
    self.completed_tasks = completed_to_dos + completed_courses
    self.save()
```

---

## 问题1：并发场景下的数据一致性风险

### 风险分析

**问题现象**：该方法使用 Django 默认的 `save()` 方法（第405行），未指定 `update_fields` 参数。在并发场景下，可能导致"丢失更新"（Lost Update）问题。

**并发场景示例**：
```
时序1: 进程A读取用户对象 → 修改个人资料（如first_name）
时序2: 进程B读取用户对象 → 完成任务 → 调用update_progress
时序3: 进程B执行save() → 更新completed_tasks和total_tasks
时序4: 进程A执行save() → 用旧值覆盖completed_tasks和total_tasks
```

**根本原因**：
- Django 的 `save()` 方法默认保存**所有字段**，而非仅修改的字段
- 两个并发进程读取到相同的对象状态后，后保存的进程会覆盖先保存进程的修改
- 这是典型的"读-改-写"（Read-Modify-Write）竞态条件

### 影响范围

查看调用点，该方法在以下场景被频繁调用：
- [api/views.py:71](file:///e:/solo-code-2/ChiefOnboarding/back/api/views.py#L71) - 创建新用户时
- [admin/sequences/tasks.py:130](file:///e:/solo-code-2/ChiefOnboarding/back/admin/sequences/tasks.py#L130) - 异步处理条件时
- [admin/people/new_hire_views.py](file:///e:/solo-code-2/ChiefOnboarding/back/admin/people/new_hire_views.py) - 多处管理员操作

特别是 `timed_triggers` 任务（第133行起）每5分钟执行一次，通过 `async_task` 并发处理大量用户条件，风险极高。

### 解决方案

#### 方案1：使用 update_fields 参数（推荐）

```python
def update_progress(self):
    # ... 现有逻辑 ...
    
    self.total_tasks = len(all_to_do_ids + all_course_ids)
    self.completed_tasks = completed_to_dos + completed_courses
    
    # 仅保存需要更新的字段
    self.save(update_fields=['total_tasks', 'completed_tasks'])
```

**优点**：
- 最小化更新范围，避免覆盖其他字段的并发修改
- 减少数据库传输数据量
- 符合 Django 最佳实践

#### 方案2：使用 select_for_update 行级锁

```python
from django.db import transaction

@transaction.atomic
def update_progress(self):
    # 重新获取对象并加锁
    user = User.objects.select_for_update().get(pk=self.pk)
    
    # ... 业务逻辑 ...
    
    user.save(update_fields=['total_tasks', 'completed_tasks'])
```

**适用场景**：需要强一致性的关键业务流程

#### 方案3：使用 F() 表达式原子更新

详见问题2的优化方案。

---

## 问题2：大规模入职时的数据库性能瓶颈

### 瓶颈分析

**当前实现的查询开销**：
每次调用 `update_progress` 会执行至少 **6次数据库查询**：

| 查询位置 | 查询类型 | 说明 |
|---------|---------|------|
| 第385-387行 | JOIN查询 | conditions.to_do 关联查询 |
| 第387行 | JOIN查询 | self.to_do 直接关联查询 |
| 第388-392行 | JOIN+过滤 | conditions.resources 课程查询 |
| 第392行 | JOIN+过滤 | self.resources 课程查询 |
| 第398行 | COUNT聚合 | ToDoUser 已完成统计 |
| 第399-401行 | COUNT聚合 | ResourceUser 课程完成统计 |

**大规模场景下的问题**：

1. **N+1 查询放大效应**：在 `timed_triggers` 中（第166-198行），遍历所有新员工并为每个用户触发条件，每个条件处理后调用 `update_progress`
2. **全表扫描风险**：`ToDoUser.objects.filter(user=self, completed=True).count()` 未建立合适索引时会全表扫描
3. **重复计算**：每次都重新计算所有任务的总数，即使只有一个任务状态变化

### 优化方案：原子自增 + 增量更新

#### 方案A：使用 F() 表达式原子自增

在任务完成时直接增量更新，而非重新统计全部：

```python
# 在 ToDoUser.mark_completed 方法中（第633-679行）
def mark_completed(self):
    from django.db.models import F
    
    self.completed = True
    self.save()
    
    # 原子自增 - 数据库层面执行，避免竞态
    User.objects.filter(pk=self.user_id).update(
        completed_tasks=F('completed_tasks') + 1
    )
```

**优点**：
- 原子操作，数据库层面保证并发安全
- 单次 UPDATE 查询，无需 SELECT
- 性能提升显著：从 6次查询 → 1次查询

#### 方案B：任务总数缓存 + 选择性重算

```python
def update_progress(self, force_full_recalc=False):
    if not force_full_recalc and self.total_tasks > 0:
        # 大多数情况：只统计已完成（2次查询）
        completed_to_dos = ToDoUser.objects.filter(user=self, completed=True).count()
        completed_courses = ResourceUser.objects.filter(
            resource__course=True, user=self, completed_course=True
        ).count()
        self.completed_tasks = completed_to_dos + completed_courses
        self.save(update_fields=['completed_tasks'])
    else:
        # 仅在序列变化时：全量计算（6次查询）
        # ... 原有完整逻辑 ...
```

#### 方案C：数据库索引优化

建议添加以下索引：

```python
class ToDoUser(models.Model):
    user = models.ForeignKey(...)
    to_do = models.ForeignKey(...)
    completed = models.BooleanField(default=False, db_index=True)  # 添加索引
    
    class Meta:
        indexes = [
            models.Index(fields=['user', 'completed']),  # 复合索引
        ]

class ResourceUser(models.Model):
    user = models.ForeignKey(...)
    resource = models.ForeignKey(...)
    completed_course = models.BooleanField(default=False, db_index=True)  # 添加索引
    
    class Meta:
        indexes = [
            models.Index(fields=['user', 'completed_course']),  # 复合索引
        ]
```

---

## 问题3：dict.fromkeys 去重算法复杂度分析

### 代码实现

```python
# 第395-396行
all_to_do_ids = list(dict.fromkeys(all_to_do_ids))
all_course_ids = list(dict.fromkeys(all_course_ids))
```

这是 Python 中利用字典键唯一性进行列表去重的经典实现。

### 时间复杂度分析

**算法流程**：
1. 遍历输入列表的每个元素
2. 将元素作为字典键插入（O(1) 哈希表操作）
3. 最后提取字典的键转换为列表

**时间复杂度：O(n)**
- 平均情况：每个元素的哈希插入是常数时间 O(1)
- 最坏情况：存在大量哈希冲突时退化为 O(n²)
- 实际场景：整数ID的哈希分布均匀，接近理想 O(n)

**对比其他去重方案**：

| 方法 | 时间复杂度 | 空间复杂度 | 保持顺序 |
|-----|-----------|-----------|---------|
| `dict.fromkeys()` | O(n) | O(n) | ✅ 是 |
| `set(list)` | O(n) | O(n) | ❌ 否 (Python 3.7前) |
| 双重循环检查 | O(n²) | O(1) | ✅ 是 |

### 空间复杂度分析

**空间复杂度：O(k)，其中 k 为唯一元素数量**

- 字典需要存储所有唯一键
- 最坏情况（无重复）：k = n，空间复杂度 O(n)
- 最好情况（全重复）：k = 1，空间复杂度 O(1)

**超大规模数据集下的问题**：

1. **内存占用**：当 n > 10^6 时，字典开销显著（每个字典条目约 72 字节）
2. **GC 压力**：创建大型临时字典会触发频繁垃圾回收
3. **内存拷贝**：`list(dict.keys())` 需要额外一次内存拷贝

### 优化建议

#### 方案1：数据库层面去重（推荐）

```python
def update_progress(self):
    # 使用 union() 在数据库层面去重，避免 Python 内存操作
    condition_todos = self.conditions.values_list("to_do__id", flat=True)
    direct_todos = self.to_do.values_list("id", flat=True)
    
    # QuerySet.union() 自动去重，数据库层面执行
    all_to_do_ids = condition_todos.union(direct_todos)
    
    # 直接获取数量，无需转换为列表
    self.total_tasks = all_to_do_ids.count() + all_course_ids.count()
```

**优点**：
- 数据库优化器处理，通常比 Python 层更快
- 无需将所有ID加载到内存
- 内存复杂度降为 O(1)

#### 方案2：对于小规模数据保持现状

对于大多数场景（每个用户任务数 < 1000），`dict.fromkeys()` 的性能完全足够，代码简洁性优先。

---

## 综合优化建议

### 优先级 P0（立即修复）

1. **添加 `update_fields` 参数**：解决并发数据覆盖问题
2. **添加数据库索引**：解决 COUNT 查询性能问题

### 优先级 P1（性能优化）

1. **重构为原子自增模式**：任务完成时使用 F() 表达式直接更新
2. **数据库层面去重**：使用 QuerySet.union() 替代 Python 层去重

### 优先级 P2（架构优化）

1. 考虑引入进度缓存层（Redis）
2. 实现异步批量进度更新
3. 添加进度更新的幂等性保证

---

## 总结

| 问题 | 严重程度 | 根因 | 修复成本 |
|-----|---------|------|---------|
| 并发save覆盖 | 高 | 未指定update_fields | 极低 |
| COUNT查询瓶颈 | 中 | 每次全量重算 | 中 |
| 去重内存开销 | 低 | Python层处理大数据 | 中 |

最关键的修正是为 `save()` 添加 `update_fields=['total_tasks', 'completed_tasks']`，这一行改动可以避免潜在的严重数据一致性问题。
