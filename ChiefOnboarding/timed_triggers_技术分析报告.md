# timed_triggers 定时任务模块技术分析报告

## 代码参考

- 核心任务逻辑：[timed_triggers()](file:///e:/solo-code-2/ChiefOnboarding/back/admin/sequences/tasks.py#L133-L226)
- 时区转换方法：[get_local_time()](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L501-L519)
- 组织模型：[Organization](file:///e:/solo-code-2/ChiefOnboarding/back/organization/models.py#L25-L196)
- Django Q配置：[Q_CLUSTER](file:///e:/solo-code-2/ChiefOnboarding/back/back/settings.py#L358-L368)

---

## 问题1：夏令时切换时 get_local_time 转换缺陷分析

### 1.1 当前实现分析

`get_local_time()` 方法的核心实现逻辑：

```python
def get_local_time(self, date=None):
    if date is not None:
        date = date.replace(tzinfo=None)          # 第505行：强制移除时区信息
    
    local_tz = pytz.timezone("UTC")
    org = Organization.object.get()
    us_tz = pytz.timezone(org.timezone) if self.timezone == "" else pytz.timezone(self.timezone)
    
    local = local_tz.localize(datetime.now()) if date is None else local_tz.localize(date)
    return us_tz.normalize(local.astimezone(us_tz))
```

**关键缺陷**：第505行的 `date.replace(tzinfo=None)` 会丢失原始时区信息，然后在第517行用 `UTC` 时区重新 `localize`。这个假设在夏令时切换时会失效。

### 1.2 夏令时切换场景分析

#### 场景A：春季向前调（时钟跳变，丢失1小时）

以美国东部时区 `America/New_York` 为例：
- 2024年3月10日 02:00 → 03:00（跳过1小时）
- 时间序列：01:55 EST → **(跳变)** → 03:00 EDT

**问题表现**：
- 追赶循环步进经过 02:00-02:55 区间时，这些时间点在目标时区**不存在**
- `normalize()` 会将不存在的时间自动向前调整，导致 02:00-02:55 区间被映射到 03:00-03:55
- 后果：02:00-02:55 区间的条件被**遗漏**，03:00-03:55 区间被**重复扫描两次**

#### 场景B：秋季向后调（时钟回拨，重复1小时）

- 2024年11月3日 02:00 → 01:00（回拨1小时）
- 时间序列：01:55 EDT → **(回拨)** → 01:00 EST → 01:55 EST

**问题表现**：
- 追赶循环步进经过 01:00-01:55 区间时，这些时间点在目标时区**出现两次**
- `normalize()` 默认会选择**第二个**（标准时间）出现的时刻
- 后果：第一个 01:00-01:55（夏令时）区间被**遗漏**

### 1.3 对追赶循环的具体影响

在 `timed_triggers()` 的 while 循环中：

```python
while current_datetime > last_updated:
    last_updated += timedelta(minutes=5)              # 第162行：UTC时间步进
    org.timed_triggers_last_check = last_updated
    org.save()
    
    for user in get_user_model().new_hires.all():
        current_time = user.get_local_time(last_updated).time()  # 第169行：转换时区
        conditions = user.conditions.filter(
            condition_type=Condition.Type.AFTER,
            days=amount_days,
            time=current_time,                                   # 按本地时间过滤
        )
```

当 `last_updated` 处于夏令时切换点附近时：
1. **重复扫描**：由于 normalize 调整，不同的 UTC 时间可能转换为相同的本地时间，导致同一组 condition 被多次匹配
2. **时间遗漏**：不存在或被跳过的本地时间点对应的 condition 永远不会被触发
3. **循环异常**：在极端情况下，normalize 可能导致时间回退，破坏 `last_updated` 的单调递增性

### 1.4 修正方案

#### 方案一：保留时区信息，避免 naive datetime 转换

```python
def get_local_time(self, date=None):
    from organization.models import Organization
    
    org = Organization.object.get()
    us_tz = pytz.timezone(org.timezone) if self.timezone == "" else pytz.timezone(self.timezone)
    
    if date is None:
        return us_tz.normalize(datetime.now(pytz.UTC).astimezone(us_tz))
    
    # 如果date已经带有时区信息，直接转换
    if date.tzinfo is not None:
        return us_tz.normalize(date.astimezone(us_tz))
    
    # 对于naive datetime，假设其为UTC时间
    utc_date = pytz.UTC.localize(date)
    return us_tz.normalize(utc_date.astimezone(us_tz))
```

#### 方案二：在追赶循环中检测并处理夏令时边界

```python
# 在timed_triggers()中增加夏令时边界检测
while current_datetime > last_updated:
    last_updated += timedelta(minutes=5)
    
    # 检测夏令时切换点
    prev_local = prev_user.get_local_time(last_updated - timedelta(minutes=5))
    curr_local = prev_user.get_local_time(last_updated)
    time_diff = (curr_local - prev_local).total_seconds() / 60
    
    if time_diff != 5:  # 发生了夏令时切换
        # 跳过不存在的时间点或处理重复的时间点
        if time_diff < 5:  # 向前跳变，跳过不存在的区间
            continue
        # 向后跳变，需要标记已处理的时间点避免重复
    
    # ... 后续逻辑
```

#### 方案三：使用 UTC 时间存储 condition 的触发时间

将 condition 的 `time` 字段改为存储 UTC 时间，避免时区转换问题：

```python
# 存储时转换为UTC
condition.time = local_time.astimezone(pytz.UTC).time()

# 匹配时直接使用UTC时间，无需转换
conditions = user.conditions.filter(
    time=last_updated.time(),  # last_updated已经是UTC
)
```

**推荐采用方案一 + 方案三的组合**，从根源上避免时区转换问题。

---

## 问题2：READ COMMITTED 隔离级别下的竞态条件与崩溃恢复

### 2.1 当前执行流程分析

```python
while current_datetime > last_updated:
    last_updated += timedelta(minutes=5)
    org.timed_triggers_last_check = last_updated
    org.save()                                      # 第164行：保存进度
    
    for user in users:
        conditions = user.conditions.filter(...)    # 第173-187行：查询条件
        for i in conditions:
            async_task(
                process_condition, i.id, user.id,   # 第193-198行：分发异步任务
            )
```

**执行顺序**：
1. 更新 `timed_triggers_last_check` 并持久化
2. 查询该时间点需要触发的 conditions
3. 逐个调用 `async_task()` 分发任务

### 2.2 READ COMMITTED 隔离级别下的竞态分析

#### 竞态场景1：并发调度器实例

如果部署了多个 `timed_triggers` 调度实例：

| 时间 | 调度器A | 调度器B | 数据库状态（org.timed_triggers_last_check） |
|------|---------|---------|-------------------------------------------|
| T1 | 读取值为10:00 | 读取值为10:00 | 10:00 |
| T2 | 更新为10:05并提交 | - | 10:05 |
| T3 | 开始查询10:05的conditions | 更新为10:05并提交 | 10:05 |
| T4 | 分发10:05的任务 | 开始查询10:05的conditions | 10:05 |
| T5 | - | 分发10:05的任务 | 10:05 |

**后果**：同一时间点的 condition 被两个调度器实例重复分发，导致任务重复执行。

#### 竞态场景2：org.save() 与 async_task() 之间的状态不一致

在 READ COMMITTED 隔离级别下：
- `org.save()` 在独立的事务中提交，对其他事务立即可见
- `async_task()` 写入的 Task 记录也在各自事务中独立提交
- 两者之间**没有事务原子性**保证

**崩溃场景**：
1. 调度器执行 `org.save()`，将 `timed_triggers_last_check` 更新为 10:05
2. 调度器开始分发 10:00-10:05 之间的任务
3. 在分发了部分任务后，调度器崩溃
4. 重启后，`timed_triggers_last_check` 已经是 10:05，不会再处理 10:00-10:05 区间
5. **未分发的任务永久丢失**

#### 竞态场景3：async_task 与 process_condition 的读写冲突

`async_task` 写入 `django_q.Task` 表后，worker 进程会立即读取并执行：
- `process_condition` 会修改 `Condition`、`ToDoUser`、`Notification` 等表
- 如果同一用户的多个 condition 被快速分发，worker 可能产生写-写冲突
- READ COMMITTED 级别下，后提交的事务会覆盖先提交的修改

### 2.3 崩溃时的二次分发风险

**反向崩溃场景**（比任务丢失更严重）：
1. 调度器分发了 10:00 时间点的所有任务
2. 在执行 `org.save()` 更新 `timed_triggers_last_check` 之前崩溃
3. 重启后，`timed_triggers_last_check` 仍然是 09:55
4. 调度器会重新处理 10:00 时间点，**所有任务被二次分发**

### 2.4 解决方案

#### 方案一：使用 SELECT FOR UPDATE 锁定 org 记录

```python
from django.db import transaction, models

@transaction.atomic
def timed_triggers():
    org = Organization.object.select_for_update().get()  # 加排他锁
    if org is None:
        return
    
    # ... 所有逻辑都在这个事务中 ...
    
    while current_datetime > last_updated:
        last_updated += timedelta(minutes=5)
        
        # 在事务内查询，保证一致性读
        conditions = Condition.objects.select_for_update(skip_locked=True).filter(
            # ... 查询条件 ...
        )
        
        for i in conditions:
            async_task(process_condition, i.id, user.id)
        
        # 进度更新在事务最后统一提交
        org.timed_triggers_last_check = last_updated
        org.save()
```

#### 方案二：引入分布式锁

使用 Redis 或数据库实现分布式锁，确保同一时间只有一个调度器运行：

```python
from django.core.cache import cache

def timed_triggers():
    lock_acquired = cache.add('timed_triggers_lock', 'true', timeout=300)
    if not lock_acquired:
        return  # 另一个实例正在运行
    
    try:
        # 业务逻辑
    finally:
        cache.delete('timed_triggers_lock')
```

#### 方案三：任务幂等性设计

在 `process_condition` 中增加幂等性检查：

```python
def process_condition(condition_id, user_id, send_email=True):
    # 使用唯一约束防止重复执行
    trigger_key = f"condition_{condition_id}_user_{user_id}_triggered"
    if cache.get(trigger_key):
        return  # 已执行过，直接返回
    
    try:
        cache.set(trigger_key, 'true', timeout=86400)  # 标记为已执行
        # 业务逻辑
    except:
        cache.delete(trigger_key)  # 执行失败，清除标记
        raise
```

#### 方案四：两阶段提交模式

```python
@transaction.atomic
def timed_triggers():
    org = Organization.object.select_for_update().get()
    
    while current_datetime > last_updated:
        last_updated += timedelta(minutes=5)
        
        # 阶段1：查询并标记所有需要执行的condition
        conditions_to_run = []
        for user in users:
            conditions = user.conditions.filter(...)
            for condition in conditions:
                # 原子性标记为"待执行"
                updated = Condition.objects.filter(
                    id=condition.id,
                    status='pending'
                ).update(status='scheduled', scheduled_at=last_updated)
                
                if updated:
                    conditions_to_run.append((condition.id, user.id))
        
        # 阶段2：更新进度（先保证进度不回退）
        org.timed_triggers_last_check = last_updated
        org.save()
        
        # 事务提交后再分发任务
        transaction.on_commit(lambda: [
            async_task(process_condition, cid, uid)
            for cid, uid in conditions_to_run
        ])
```

**推荐采用方案一 + 方案三 + 方案四的组合**，从多个层面保证数据一致性。

---

## 问题3：大量异步调度任务的性能瓶颈分析

### 3.1 Django Q 表结构与索引分析

根据 Django Q 源码分析，`django_q.Task` 和 `django_q.Schedule` 表的核心字段：

**Task 表核心字段**：
| 字段 | 类型 | 说明 | 默认索引 |
|------|------|------|----------|
| `id` | CharField(32) | 主键，UUID | ✅ 主键索引 |
| `name` | CharField(100) | 任务名称 | ❌ 无 |
| `func` | CharField(250) | 执行函数 | ❌ 无 |
| `hook` | CharField(250) | 钩子函数 | ❌ 无 |
| `args` | PickledObjectField | 参数 | ❌ 无 |
| `kwargs` | PickledObjectField | 关键字参数 | ❌ 无 |
| `result` | PickledObjectField | 执行结果 | ❌ 无 |
| `group` | CharField(100) | 任务组 | ❌ 无 |
| `cluster` | CharField(100) | 集群名 | ❌ 无 |
| `started` | DateTimeField | 开始时间 | ❌ 无 |
| `stopped` | DateTimeField | 结束时间 | ❌ 无 |
| `success` | BooleanField | 是否成功 | ❌ 无 |

**Schedule 表核心字段**：
| 字段 | 类型 | 说明 | 默认索引 |
|------|------|------|----------|
| `id` | AutoField | 主键 | ✅ 主键索引 |
| `name` | CharField(100) | 名称 | ❌ 无 |
| `func` | CharField(250) | 函数 | ❌ 无 |
| `next_run` | DateTimeField | 下次执行时间 | ❌ 无（关键！） |
| `schedule_type` | CharField(1) | 调度类型 | ❌ 无 |
| `repeats` | IntegerField | 剩余次数 | ❌ 无 |
| `cluster` | CharField(100) | 集群名 | ❌ 无 |

### 3.2 行锁竞争分析

#### 3.2.1 Task 表插入时的行锁

当 `timed_triggers` 循环中高频调用 `async_task()` 时：

```python
for i in conditions:
    async_task(process_condition, i.id, user.id)
```

每次 `async_task()` 都会执行：
1. `INSERT INTO django_q_task (...) VALUES (...)`
2. 获取新插入行的排他锁
3. 事务提交后释放锁

**问题**：
- 高并发插入时，主键索引的 B+ 树叶子节点会产生热点
- 自增主键（或顺序UUID）导致插入集中在索引的同一侧
- 行锁虽然不会冲突，但**索引页闩锁（page latch）**会成为瓶颈

#### 3.2.2 Schedule 表查询时的行锁

Django Q 的 scheduler 进程会周期性执行：

```sql
SELECT * FROM django_q_schedule
WHERE repeats != 0 AND next_run < NOW()
ORDER BY next_run ASC
FOR UPDATE SKIP LOCKED;
```

**问题**：
- `next_run` 字段没有索引，导致全表扫描
- 全表扫描过程中会对所有扫描过的行加共享锁
- 在 READ COMMITTED 级别下，锁会持续到事务结束
- 当表中有大量历史 schedule 记录时，锁范围过大，影响并发

#### 3.2.3 org 记录的行锁竞争

`timed_triggers` 每次循环都更新同一行：

```sql
UPDATE organization_organization 
SET timed_triggers_last_check = '...'
WHERE id = 1;
```

**问题**：
- 所有调度器实例都竞争同一行的排他锁
- 锁等待队列会随着调度频率增加而变长
- 极端情况下可能出现锁超时和死锁

### 3.3 索引页分裂分析

#### 3.3.1 顺序插入导致的页分裂

`django_q.Task` 表使用顺序主键（UUID v1 或自增ID）：
- 新记录总是插入到 B+ 树索引的最右侧
- 当一个叶子页填满后，必须分裂为两个页
- 分裂操作需要：
  1. 持有父节点的排他闩锁
  2. 分配新的数据页
  3. 移动约50%的数据
  4. 更新父节点的指针

**性能影响**：
- 页分裂是重量级操作，会阻塞所有对该子树的访问
- 高频插入时，每秒可能发生数十次页分裂
- 分裂产生的碎片会导致后续查询性能下降

#### 3.3.2 缺失索引导致的全表扫描

`django_q.Schedule` 表的 `next_run` 字段缺失索引：
- scheduler 每30秒执行一次全表扫描
- 随着历史数据积累，扫描时间从毫秒级增长到秒级
- 全表扫描会将大量冷数据载入缓冲池，挤掉热数据
- 缓冲池命中率下降，整体数据库性能劣化

### 3.4 优化方案

#### 方案一：添加必要的索引

```sql
-- django_q_schedule 表添加索引
CREATE INDEX idx_django_q_schedule_next_run 
ON django_q_schedule(next_run)
WHERE repeats != 0;  -- 部分索引，只包含活跃记录

CREATE INDEX idx_django_q_schedule_cluster_next_run
ON django_q_schedule(cluster, next_run);

-- django_q_task 表添加索引
CREATE INDEX idx_django_q_task_cluster_started
ON django_q_task(cluster, started DESC);

CREATE INDEX idx_django_q_task_success_stopped
ON django_q_task(success, stopped DESC);
```

在 Django 中通过迁移添加：

```python
# migrations/xxxx_add_django_q_indexes.py
from django.db import migrations, models

class Migration(migrations.Migration):
    operations = [
        migrations.RunSQL(
            "CREATE INDEX CONCURRENTLY idx_django_q_schedule_next_run "
            "ON django_q_schedule(next_run) WHERE repeats != 0;",
            reverse_sql="DROP INDEX CONCURRENTLY idx_django_q_schedule_next_run;",
        ),
    ]
```

#### 方案二：使用批量插入减少事务开销

```python
# 替代循环调用async_task，使用bulk_create
from django_q.models import Task
import uuid

def bulk_async_tasks(tasks_data):
    task_objects = []
    for func_name, args, kwargs, task_name in tasks_data:
        task_objects.append(Task(
            id=uuid.uuid4().hex,
            name=task_name or func_name,
            func=func_name,
            args=args,
            kwargs=kwargs,
            # ... 其他必要字段
        ))
    
    # 批量插入，单条SQL
    Task.objects.bulk_create(task_objects, batch_size=100)
```

#### 方案三：优化主键策略避免热点

```python
# 使用随机UUID v4代替顺序UUID
from django_q.models import Task as DjangoQTask
import uuid

# 或者在创建task时显式指定随机ID
async_task(
    process_condition, i.id, user.id,
    task_name=f"Process condition: {i.id} for {user.full_name}",
    task_id=uuid.uuid4().hex,  # 显式指定随机ID
)
```

#### 方案四：分片与归档策略

```python
# 定期归档历史Task记录
from django_q.models import Task
from datetime import timedelta

def archive_old_tasks():
    cutoff = timezone.now() - timedelta(days=30)
    old_tasks = Task.objects.filter(stopped__lt=cutoff)
    
    # 分批删除，避免长事务
    while old_tasks.exists():
        batch_ids = old_tasks.values_list('id', flat=True)[:1000]
        Task.objects.filter(id__in=list(batch_ids)).delete()
```

#### 方案五：调整 Django Q 配置

```python
# settings.py
Q_CLUSTER = {
    'name': 'DjangORM',
    'workers': 4,              # 增加worker数量
    'timeout': 90,
    'retry': 1800,
    'queue_limit': 500,        # 增加队列限制
    'bulk': 50,                # 增加批量处理大小
    'orm': 'default',
    'catch_up': False,
    'max_attempts': 2,
    'save_limit': 1000,        # 限制保存的历史结果数
    'ack_failures': True,      # 自动确认失败任务
}
```

#### 方案六：考虑使用更高效的 Broker

当前使用 ORM 作为 Broker（数据库表作为队列），这是性能瓶颈的根源。建议迁移到：

```python
# 方案：使用Redis作为Broker
Q_CLUSTER = {
    'name': 'ChiefOnboarding',
    'workers': 4,
    'timeout': 90,
    'retry': 1800,
    'queue_limit': 500,
    'bulk': 50,
    'redis': {
        'host': 'localhost',
        'port': 6379,
        'db': 0,
    },
    # ...
}
```

**推荐采用方案一 + 方案二 + 方案五的组合**，在不改变架构的前提下获得最大性能提升。长期来看应考虑方案六迁移到 Redis Broker。

---

## 总结与建议

| 问题 | 风险等级 | 推荐方案 | 实施优先级 |
|------|----------|----------|------------|
| 夏令时转换错误 | 中高 | get_local_time修复 + UTC存储 | P1 |
| 崩溃导致重复分发 | 高 | SELECT FOR UPDATE + 幂等性 | P0 |
| 崩溃导致任务丢失 | 高 | 两阶段提交 + 事务原子性 | P0 |
| 索引缺失性能瓶颈 | 中 | 添加必要索引 | P1 |
| 行锁与页分裂 | 中 | 批量插入 + 随机主键 | P2 |
| ORM Broker性能 | 低中 | 迁移到Redis Broker | P3 |

### 立即行动项（P0/P1）

1. **修复 `get_local_time()` 时区处理逻辑**，避免夏令时切换问题
2. **为 `timed_triggers()` 添加 `select_for_update` 行锁**，防止并发调度
3. **为 `process_condition()` 添加幂等性检查**，防止重复执行
4. **为 `django_q_schedule.next_run` 添加索引**，解决全表扫描问题
5. **使用 `transaction.on_commit`** 确保任务分发在进度更新之后

### 中期优化项（P2）

1. 实现 `async_task` 的批量调用接口
2. 定期归档历史 Task 和 Schedule 记录
3. 调整 Q_CLUSTER 配置参数优化吞吐量
4. 监控数据库锁等待和索引分裂情况

### 长期架构优化（P3）

1. 考虑从 ORM Broker 迁移到 Redis Broker
2. 引入分布式任务调度框架（如 Celery Beat）
3. 实现任务执行的可观测性和告警机制
4. 评估基于事件驱动的架构替代定时轮询方案
