# Pinry Board 看板隐私控制机制深度分析

## 1. filter_private_board 数据库层过滤机制分析

### 1.1 函数实现源码

[filter_private_board](file:///e:/solo-code-2/pinry/core/serializers.py#L22-L27) 函数定义如下：

```python
def filter_private_board(request, query):
    if request.user.is_authenticated:
        query = query.exclude(~Q(submitter=request.user), private=True)
    else:
        query = query.exclude(private=True)
    return query
```

### 1.2 数据库查询层过滤逻辑

该函数在 **SQL查询构建阶段** 对私有看板进行过滤，通过 `exclude()` 方法在数据库层面直接排除不符合条件的记录：

| 用户状态 | 过滤条件 | SQL语义 |
|---------|---------|---------|
| **已登录用户** | `exclude(~Q(submitter=request.user), private=True)` | 排除「非当前用户创建」且「私有」的看板 |
| **未登录用户** | `exclude(private=True)` | 排除所有「私有」看板 |

**核心机制**：使用 Django ORM 的 `exclude()` 方法，配合 `Q` 对象进行复杂条件查询，最终生成的 SQL 会在 `WHERE` 子句中包含过滤条件，确保非拥有者的私有看板数据从数据库查询结果中被彻底排除。

### 1.3 与 BoardViewSet 中 permission_classes 的区别

[BoardViewSet](file:///e:/solo-code-2/pinry/core/views.py#L37-L47) 同时使用了两层防护：

```python
class BoardViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOwnerOrReadOnly("submitter"), OwnerOnlyIfPrivate("submitter")]
    
    def get_queryset(self):
        return filter_private_board(self.request, Board.objects.all())
```

#### 工作阶段区别：

| 防护机制 | 工作阶段 | 执行时机 |
|---------|---------|---------|
| **filter_private_board** | 查询集过滤阶段 | 在 `get_queryset()` 中调用，**数据库查询之前** |
| **permission_classes** | 对象权限校验阶段 | 在视图方法执行时，通过 `check_object_permissions()` 调用，**获取对象之后** |

#### 权限控制粒度区别：

| 防护机制 | 控制粒度 | 作用范围 |
|---------|---------|---------|
| **filter_private_board** | 粗粒度 | 对整个查询集进行批量过滤，影响 `list()` 和 `retrieve()` 等所有操作 |
| **permission_classes** | 细粒度 | 对单个对象进行权限校验，作用于具体的对象实例 |

#### 互补关系：

1. **filter_private_board** 是第一道防线，从数据源头上隐藏私有看板，避免敏感数据进入应用层
2. **permission_classes** 是第二道防线，防止用户通过直接指定 ID 等方式绕过查询集过滤访问私有对象
3. 两层防护构成了「深度防御」策略，即使一层被绕过，另一层仍能提供保护

---

## 2. 未登录用户访问私有看板的 DRF 权限认证流

### 2.1 DRF 标准权限认证流程

当未登录用户请求 `/api/boards/{id}/` 获取私有看板详情时，DRF 的请求处理流程如下：

```
请求到达 → 认证(Authentication) → 权限检查(Permission) → 
get_queryset() 过滤 → 视图方法 → check_object_permissions() → 返回响应
```

### 2.2 具体拦截过程

以未登录用户请求私有看板 `id=123` 为例：

#### 步骤 1：get_queryset() 过滤
[BoardViewSet.get_queryset()](file:///e:/solo-code-2/pinry/core/views.py#L46-L47) 首先调用 `filter_private_board`：
- 未登录用户 → `exclude(private=True)` → 私有看板被排除
- 查询结果为空 → DRF 返回 **404 Not Found**

#### 步骤 2：若绕过查询集过滤（理论场景）
假设通过某种方式绕过了查询集过滤，`check_object_permissions()` 会调用权限类：

[OwnerOnlyIfPrivate](file:///e:/solo-code-2/pinry/core/permissions.py#L24-L34) 的实现：
```python
class OwnerOnlyIfPrivate(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if getattr(obj, "private"):
            return request.user == getattr(obj, self.__owner_field_name)
        return True
```

- 检测到 `obj.private = True`
- 比较 `request.user`（匿名用户）与 `obj.submitter`（看板所有者）
- 不相等 → 返回 `False` → DRF 返回 **403 Forbidden**

### 2.3 OwnerOnlyIfPrivate 的核心作用

`OwnerOnlyIfPrivate` 权限类的设计意图：

1. **针对私有对象的访问控制**：只有当对象是私有时，才强制执行所有者检查
2. **公开对象可读**：对于公开对象（`private=False`），任何用户都可以读取
3. **补充查询集过滤**：作为第二道防线，防止查询集过滤被绕过

---

## 3. BoardSerializer._get_list 方法的安全检查分析

### 3.1 方法实现源码

[BoardSerializer._get_list](file:///e:/solo-code-2/pinry/core/serializers.py#L224-L232) 静态方法：

```python
@staticmethod
def _get_list(pins_id, submitter: User):
    pins = Pin.objects.filter(id__in=pins_id)
    valid_pins = []
    for pin in pins:
        if pin.private and pin.submitter != submitter:
            continue
        valid_pins.append(pin)
    return valid_pins
```

### 3.2 安全检查逻辑

该方法在 [update](file:///e:/solo-code-2/pinry/core/serializers.py#L234-L257) 方法中被调用，用于向看板添加/移除 Pin：

```python
def update(self, instance: Board, validated_data):
    # ...
    if pins_to_add:
        for pin in self._get_list(pins_to_add, instance.submitter):
            instance.pins.add(pin)
    # ...
```

**双重检查条件**：
1. `pin.private` —— 检查 Pin 是否为私有
2. `pin.submitter != submitter` —— 检查 Pin 提交者是否与看板提交者一致

**过滤规则**：只有当 Pin 是私有 **且** 提交者不是当前看板所有者时，才跳过该 Pin。

### 3.3 检查的必要性与越权风险

#### 为什么需要这个检查？

Pin 本身也有 `private` 字段（[Pin模型](file:///e:/solo-code-2/pinry/core/models.py#L100-L114)），用户可能创建了私有 Pin。当用户 A 尝试将用户 B 的私有 Pin 添加到自己的看板时，这个检查可以防止越权访问。

#### 遗漏检查的越权风险场景：

| 风险场景 | 攻击路径 | 后果 |
|---------|---------|-----|
| **私有Pin越权访问** | 用户A通过API获取到用户B的私有Pin ID → 调用添加Pin到看板接口 → 将私有Pin添加到自己的看板 | 用户A可以在自己的看板中查看用户B的私有Pin内容 |
| **敏感信息泄露** | 私有Pin可能包含个人隐私、商业秘密等敏感信息 | 敏感信息被未授权用户获取 |
| **间接数据泄露** | 攻击者可以遍历Pin ID，通过添加成功与否来推断私有Pin的存在 | 可以枚举系统中的私有资源 |

#### 攻击示例（假设检查被移除）：

```http
PATCH /api/boards/456/
Content-Type: application/json
Authorization: Token user_a_token

{
    "pins_to_add": [789]  # 789 是用户B的私有Pin
}
```

如果没有 `_get_list` 中的检查，Pin 789 会被成功添加到用户 A 的看板 456 中，用户 A 就可以通过看板接口访问到该私有 Pin 的完整信息（包括图片、描述等）。

---

## 总结：三层隐私防护体系

Pinry 为 Board 看板构建了三层隐私防护机制：

| 层级 | 防护机制 | 作用 |
|-----|---------|------|
| 第一层 | [filter_private_board](file:///e:/solo-code-2/pinry/core/serializers.py#L22-L27) | 数据库查询层过滤，从源头隐藏私有看板 |
| 第二层 | [OwnerOnlyIfPrivate](file:///e:/solo-code-2/pinry/core/permissions.py#L24-L34) | 对象权限检查，防止绕过查询集过滤 |
| 第三层 | [BoardSerializer._get_list](file:///e:/solo-code-2/pinry/core/serializers.py#L224-L232) | 业务逻辑层检查，防止非法关联私有Pin |

这种「深度防御」的设计确保了即使某一层防护出现漏洞，其他层级仍能提供保护，有效保障了用户隐私数据的安全。
