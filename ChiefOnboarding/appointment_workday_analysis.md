# Appointment 相对工作日换算算法深度分析

## 1. 算法复杂度瓶颈与 O(1) 数学公式重构

### 1.1 现有算法分析

当前 `workday_to_datetime` 方法定义在 [users/models.py](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L452-L462)：

```python
def workday_to_datetime(self, workdays):
    start_day = self.start_day
    if workdays == 0:
        return None

    start = 1
    while start != workdays:
        start_day += timedelta(days=1)
        if start_day.weekday() not in [5, 6]:
            start += 1
    return start_day
```

**时间复杂度：O(n)**，其中 n = 实际需要遍历的日历天数 ≈ workdays × (7/5)

#### 复杂度瓶颈分析

当时间跨度较大时（数年），该算法存在以下问题：

1. **线性时间复杂度**：对于 `workdays = 1000`（约4年），需要循环约 1400 次
2. **单次循环开销**：每次循环执行 `timedelta(days=1)` 和 `weekday()` 计算
3. **缓存失效风险**：该方法未使用缓存，多次调用会重复计算
4. **同类方法冗余**：系统中存在4个类似的循环方法：
   - `workday` 属性 ([L436-L450](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L436-L450))
   - `workday_to_datetime` ([L452-L462](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L452-L462))
   - `offboarding_workday_to_date` ([L464-L474](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L464-L474))
   - `days_before_termination_date` ([L476-L492](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L476-L492))

### 1.2 O(1) 复杂度数学公式重构

#### 核心数学原理

一周有7天，其中5个工作日（周一至周五，weekday 0-4），2个周末（周六周日，weekday 5-6）。

设：
- `start_weekday` = 起始日期的星期几 (0=周一, 1=周二, ..., 4=周五, 5=周六, 6=周日)
- `target_workday` = 目标工作日编号（第 N 个工作日）
- `adjusted_target` = 调整后的目标（从0开始计数）

#### 正向计算（入职后第 N 个工作日）

```python
def workday_to_datetime_optimized(self, workdays):
    if workdays == 0:
        return None
    
    start_day = self.start_day
    start_weekday = start_day.weekday()
    
    # 将工作日转换为从0开始的偏移量
    day_offset = workdays - 1
    
    # 计算完整周数和剩余工作日
    weeks = day_offset // 5
    remaining_days = day_offset % 5
    
    # 计算日历日偏移
    # 5和6是周末，需要跳过
    if start_weekday >= 5:
        # 如果起始日在周末，先调整到下周一
        calendar_offset = (7 - start_weekday) + remaining_days + weeks * 7
    else:
        # 起始日在工作日
        if start_weekday + remaining_days >= 5:
            # 需要跨过一个周末
            calendar_offset = remaining_days + 2 + weeks * 7
        else:
            # 不需要跨周末
            calendar_offset = remaining_days + weeks * 7
    
    return start_day + timedelta(days=calendar_offset)
```

#### 逆向计算（离职前第 N 个工作日）

```python
def offboarding_workday_to_date_optimized(self, workdays):
    base_date = self.termination_date
    base_weekday = base_date.weekday()
    
    if base_weekday >= 5:
        # 如果基准日在周末，先调整到上周五
        calendar_offset = (base_weekday - 4) + workdays + ((workdays - 1) // 5) * 2
    else:
        # 基准日在工作日
        if base_weekday - workdays < 0:
            # 需要跨过一个周末
            calendar_offset = workdays + 2 + ((workdays - 1) // 5) * 2
        else:
            calendar_offset = workdays + ((workdays - 1) // 5) * 2
    
    return base_date - timedelta(days=calendar_offset)
```

#### 计算两个日期之间的工作日数

```python
def workdays_between(start_date, end_date):
    if start_date > end_date:
        return 0
    
    start_weekday = start_date.weekday()
    end_weekday = end_date.weekday()
    
    # 总天数
    total_days = (end_date - start_date).days
    
    # 完整周数
    weeks = total_days // 7
    remaining_days = total_days % 7
    
    # 基础工作日 = 完整周 × 5
    workdays = weeks * 5
    
    # 处理剩余天数，需要考虑起止日期的星期
    if start_weekday <= end_weekday:
        # 在同一周内或跨整周
        if end_weekday >= 5:
            workdays += max(0, 5 - start_weekday)
        else:
            workdays += max(0, end_weekday - start_weekday + 1)
    else:
        # 跨周末
        workdays += max(0, 5 - start_weekday) + max(0, end_weekday + 1)
    
    return workdays
```

#### 复杂度验证

| workdays | 原算法循环次数 | 优化算法运算次数 | 性能提升 |
|----------|---------------|-----------------|----------|
| 1        | 0             | ~5              | 持平     |
| 10       | ~14           | ~5              | 2.8x     |
| 100      | ~140          | ~5              | 28x      |
| 1000     | ~1400         | ~5              | 280x     |
| 10000    | ~14000        | ~5              | 2800x    |

---

## 2. 入职日期在周末时的边界行为分析

### 2.1 问题场景

当新员工的入职日期 `start_day` 恰好设定在周六（weekday=5）或周日（weekday=6）时，`workday_to_datetime(1)` 的行为：

### 2.2 算法追踪分析

**场景：start_day = 2024-01-06（周六，weekday=5），计算第1个工作日**

```python
def workday_to_datetime(self, workdays):  # workdays = 1
    start_day = self.start_day  # 2024-01-06 (周六)
    if workdays == 0:
        return None

    start = 1
    while start != workdays:  # 1 != 1 → False，循环不执行
        start_day += timedelta(days=1)
        if start_day.weekday() not in [5, 6]:
            start += 1
    return start_day  # 返回 2024-01-06（周六）
```

**结论：返回的是周六本身，而非下周一！**

### 2.3 偏差影响

| start_day (周末) | workday_to_datetime(1) 返回 | 预期的第一个工作日 | 偏差 |
|------------------|----------------------------|-------------------|------|
| 周六 (weekday=5) | 周六                        | 下周一             | -2天 |
| 周日 (weekday=6) | 周日                        | 下周一             | -1天 |

### 2.4 连锁影响

1. **Appointment 日期错误**：预约事件的触发日期会落在周末
2. **通知发送失败**：定时触发器在 [tasks.py](file:///e:/solo-code-2/ChiefOnboarding/back/admin/sequences/tasks.py#L181) 中明确跳过周末：
   ```python
   elif user.get_local_time(last_updated).weekday() < 5:
       # 仅在工作日触发
   ```
3. **workday 属性不一致**：`workday` 属性在 [models.py](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L436-L450) 中同样存在此问题

---

## 3. 负相对工作日与法定节假日支持分析

### 3.1 负 on_day 值的行为

`workday_to_datetime` 方法**不支持负数**，会导致**无限循环**：

```python
def workday_to_datetime(self, workdays):  # workdays = -1
    start_day = self.start_day
    if workdays == 0:
        return None

    start = 1
    while start != workdays:  # 1 != -1 → 永远为 True，死循环！
        start_day += timedelta(days=1)  # 日期不断向前推进
        if start_day.weekday() not in [5, 6]:
            start += 1  # start 不断增大，永远追不上 -1
```

### 3.2 系统如何处理入职前事件

系统通过 `Condition.Type.BEFORE` 类型处理入职前事件，定义在 [sequences/models.py](file:///e:/solo-code-2/ChiefOnboarding/back/admin/sequences/models.py#L722)：

在 [general.py](file:///e:/solo-code-2/ChiefOnboarding/back/back/templatetags/general.py#L64-L65) 中可以看到：
```python
if condition.condition_type == Condition.Type.BEFORE:
    return new_hire.start_day - timedelta(days=condition.days)
else:
    return new_hire.workday_to_datetime(condition.days)
```

**关键问题**：`BEFORE` 类型直接使用 `timedelta(days=condition.days)` 进行日期减法，**不跳过周末**！

### 3.3 通知投递机制

在 [tasks.py](file:///e:/solo-code-2/ChiefOnboarding/back/admin/sequences/tasks.py#L174-L180) 中：

```python
if amount_days == 0:
    # 入职前
    conditions = user.conditions.filter(
        condition_type=Condition.Type.BEFORE,
        days=amount_days_before,  # 使用自然日，不是工作日
        time=current_time,
    )
```

而 `days_before_starting` 属性 ([models.py](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L495-L499)) 也明确标注：

```python
@cached_property
def days_before_starting(self):
    # not counting workdays here  <-- 注意这个注释！
    if self.start_day <= self.get_local_time().date():
        return 0
    return (self.start_day - self.get_local_time().date()).days
```

### 3.4 法定节假日支持

**结论：当前系统不支持排除法定节假日。**

证据：
1. 所有工作日判断仅检查 `weekday() not in [5, 6]`，仅排除周六周日
2. `Organization` 模型 ([organization/models.py](file:///e:/solo-code-2/ChiefOnboarding/back/organization/models.py)) 中没有节假日相关字段
3. 代码库中搜索 "holiday" 仅在测试数据中出现，无业务逻辑实现
4. 没有 `Holiday` 或类似的模型定义

### 3.5 风险总结

| 场景 | 行为 | 风险 |
|------|------|------|
| on_day < 0 传入 workday_to_datetime | 无限循环，CPU 100% | 服务卡死 |
| BEFORE 条件日期落在周末 | 按自然日计算，可能落在周末 | 通知延迟到下周一发送，比预期晚1-2天 |
| BEFORE 条件日期落在法定节假日 | 不识别节假日，正常触发 | 通知在节假日发送，可能无人查看 |
| 长假期（如春节7天假） | 仅跳过周末，不跳过假期 | 通知在假期期间发送，错过最佳时机 |

---

## 附录：修复建议摘要

### 建议1：O(1) 算法替换
将所有4个循环方法替换为数学公式版本，可获得 100-1000x 的性能提升。

### 建议2：周末起始日修复
在 `workday_to_datetime` 开头增加校准逻辑：
```python
if start_day.weekday() >= 5:
    # 调整到下周一
    start_day += timedelta(days=7 - start_day.weekday())
```

### 建议3：负数参数防护
增加参数校验，避免无限循环：
```python
if workdays < 0:
    raise ValueError("workdays must be non-negative")
```

### 建议4：法定节假日支持
建议新增 `Holiday` 模型，并在工作日计算中排除这些日期。但需注意：引入可变的节假日表后，将无法再使用纯数学公式实现 O(1) 复杂度，需要采用查表+数学混合方案。
