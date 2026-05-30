# MedicationForm next_dose_interval 字段实现分析

## 概述

MedicationForm 为了给下一次服药计划设置提醒时限，引入了 `next_dose_interval` 这个虚构表单字段来中转前端输入（小时数）与模型时长（timedelta）的映射。本文档详细分析该字段在整个数据生命周期中的流转机制。

---

## 问题1：`__init__` 方法中如何读取并转换模型值为小时数

### 代码实现

关键代码位于 [forms.py#L356-L361](file:///e:/solo-code-2/babybuddy/core/forms.py#L356-L361)：

```python
def __init__(self, *args, **kwargs):
    super().__init__(*args, **kwargs)
    # Convert existing timedelta to hours for display
    if self.instance and self.instance.next_dose_interval:
        total_seconds = self.instance.next_dose_interval.total_seconds()
        self.initial["next_dose_interval"] = total_seconds / 3600
```

### 执行流程

1. **调用父类初始化**：首先通过 `super().__init__(*args, **kwargs)` 完成 Django ModelForm 的标准初始化，此时模型实例已被加载到 `self.instance` 中。

2. **检查实例是否存在**：`if self.instance and self.instance.next_dose_interval:` 确保只有在编辑既有记录（`instance` 存在）且该记录已有 `next_dose_interval` 值时才进行转换。

3. **timedelta 转秒**：通过 `total_seconds()` 方法将 `timedelta` 对象转换为总秒数。例如，`timedelta(hours=6)` 会被转换为 `21600.0` 秒。

4. **秒数转小时**：将总秒数除以 3600（`total_seconds / 3600`）得到小时数，填入 `self.initial["next_dose_interval"]` 作为表单字段的初始值。

> **设计意图**：模型层使用 `DurationField` 存储 `timedelta` 对象，但用户友好的输入方式是以小时为单位的十进制数，因此需要在表单初始化时进行模型到视图的转换。

---

## 问题2：`clean_next_dose_interval` 方法的校验和转换逻辑

### 代码实现

关键代码位于 [forms.py#L363-L367](file:///e:/solo-code-2/babybuddy/core/forms.py#L363-L367)：

```python
def clean_next_dose_interval(self):
    hours = self.cleaned_data.get("next_dose_interval")
    if hours is not None and hours > 0:
        return timezone.timedelta(hours=float(hours))
    return None
```

### 校验逻辑与返回值

| 输入值情况 | 条件判断 | 处理结果 | 返回值 |
|-----------|---------|---------|--------|
| 输入值为 `None`（字段为空） | `hours is not None` → False | 不创建时间间隔 | `None` |
| 输入值为 `0` | `hours > 0` → False | 不创建时间间隔 | `None` |
| 输入值为负数 | `hours > 0` → False | 不创建时间间隔 | `None` |
| 输入值为正数（如 `6.5`） | 两个条件均满足 | 转换为 `timedelta` | `timezone.timedelta(hours=6.5)` |

### 关键点说明

1. **零值和负值处理**：当输入值为 `0` 或负数时，方法返回 `None`。这意味着如果用户输入 `0` 或负数，实际上等同于"清除"该字段的值，模型中该字段将被设置为 `NULL`。

2. **字段级校验与表单字段 `min_value` 的关系**：表单字段定义中 `min_value=0`（[forms.py#L317](file:///e:/solo-code-2/babybuddy/core/forms.py#L317-L317)）会在字段级校验中拦截负值，所以 `clean_*` 方法中的 `hours > 0` 检查主要用于将 `0` 值转换为 `None`。

3. **返回类型匹配**：返回 `timezone.timedelta` 对象，与模型字段 `DurationField` 的类型完全匹配。

---

## 问题3：视图中的字段持久化与验证失败回滚机制

### 字段持久化机制

#### 1. 模型与表单字段的映射关系

- **模型层**：[models.py#L811-L816](file:///e:/solo-code-2/babybuddy/core/models.py#L811-L816) 定义了 `next_dose_interval = models.DurationField(...)`
- **表单层**：[forms.py#L314-L320](file:///e:/solo-code-2/babybuddy/core/forms.py#L314-L320) 定义了同名的 `next_dose_interval = forms.DecimalField(...)`
- **表单 Meta**：[forms.py#L345](file:///e:/solo-code-2/babybuddy/core/forms.py#L345-L345) 的 `fields` 列表中包含 `next_dose_interval`

#### 2. Django ModelForm 的自动映射机制

Django ModelForm 的 `save()` 方法会自动将 `cleaned_data` 中的字段值映射到模型实例。由于：
- 表单字段名 `next_dose_interval` 与模型字段名完全相同
- `clean_next_dose_interval` 返回的 `timedelta` 类型与模型 `DurationField` 类型兼容

因此，`cleaned_data["next_dose_interval"]` 的值会被自动赋给 `instance.next_dose_interval`，无需额外的手动赋值。

#### 3. 视图中的保存流程

[MedicationAdd](file:///e:/solo-code-2/babybuddy/core/views.py#L283-L287) 和 [MedicationUpdate](file:///e:/solo-code-2/babybuddy/core/views.py#L290-L294) 视图分别继承自 `CoreAddView` 和 `CoreUpdateView`，而这两个基类最终继承自 Django 的 `CreateView` 和 `UpdateView`。

标准的 `form_valid` 流程如下：

```
表单验证通过 → form.save(commit=True) 
    → 内部调用 ModelForm._post_clean() 映射 cleaned_data 到 instance
    → 调用 instance.save() 持久化到数据库
    → 调用 form.save_m2m() 保存多对多关系（如 tags）
```

由于 `MedicationForm` 没有重写 `save()` 方法，直接使用父类 `CoreModelForm` 的 `save()` 方法（[forms.py#L99-L108](file:///e:/solo-code-2/babybuddy/core/forms.py#L99-L108)），该方法也只是增加了计时器停止逻辑，不影响 `next_dose_interval` 字段的保存。

### 验证失败时的回滚机制

#### 1. 表单验证失败的处理流程

当表单验证失败时（包括 `clean_next_dose_interval` 在内的任何字段验证失败）：

```
Django FormMixin.form_invalid() 被调用
    → 重新渲染表单模板
    → 表单对象保留 bound 状态
    → 字段值从 self.data（原始POST数据）中重新获取
```

#### 2. 模型实例的状态

**关键事实**：验证失败时，`form.save()` 不会被调用，因此：
- 模型实例 `self.instance` 的属性不会被修改（因为字段值映射发生在 `_post_clean()` 中，而 `_post_clean()` 只有在全表单验证通过后才会执行 `save()` 相关的赋值）
- 数据库不会有任何写入操作
- 无需显式"回滚"，因为根本没有提交

#### 3. 表单字段值的保留

虽然模型值没有变化，但表单字段会保留用户输入的原始值：
- 原始输入的小时数会保留在 `form.data` 中
- 重新渲染表单时，字段会显示用户之前输入的值（小时数），而不是模型中存储的 `timedelta`

> **注意**：这是 Django 表单的标准行为——验证失败时，表单会"回弹"给用户，保留所有输入值，让用户修正后重新提交，而不会丢失用户已输入的数据。

---

## 完整数据流转图

```
编辑场景（UPDATE）：
  数据库 [timedelta] 
      ↓ (模型加载)
  form.instance.next_dose_interval
      ↓ (__init__: timedelta→小时)
  form.initial["next_dose_interval"]
      ↓ (表单渲染)
  前端显示：6.5 小时

用户输入/提交：
  前端输入：8.0 小时
      ↓ (POST)
  form.data["next_dose_interval"] = "8.0"
      ↓ (字段校验: min_value=0)
  form.cleaned_data["next_dose_interval"] = Decimal("8.0")
      ↓ (clean_next_dose_interval: 小时→timedelta)
  form.cleaned_data["next_dose_interval"] = timedelta(hours=8)
      ↓ (form.save(): 自动映射)
  form.instance.next_dose_interval = timedelta(hours=8)
      ↓ (instance.save())
  数据库 [timedelta]
```

---

## 代码设计亮点

1. **关注点分离**：模型层使用 `DurationField` 存储时间间隔，表单层使用 `DecimalField` 接收用户友好的小时输入，职责清晰。

2. **双向转换对称**：`__init__` 负责 `timedelta → 小时`，`clean_next_dose_interval` 负责 `小时 → timedelta`，形成完整的闭环。

3. **零值语义处理**：将 `0` 和负值统一转换为 `None`，避免了"零时间间隔"这种无意义的存储。

4. **复用 Django 标准机制**：通过保持表单字段名与模型字段名一致，充分利用 ModelForm 的自动映射能力，无需手动赋值。
