# TagAutoComplete 缓存策略与隐私安全分析报告

## 一、问题概述

当前 `TagAutoCompleteViewSet` 类（位于 [core/views.py](file:///e:/solo-code-2/pinry/core/views.py#L66-L77)）存在两个核心问题：

1. **缓存失效不及时**：使用 Django `cache_page` 装饰器硬编码 300 秒缓存，新标签无法立即被其他用户看到
2. **隐私泄露风险**：直接查询 `Tag.objects.all()`，未过滤私有 Pin 关联的机密标签

---

## 二、问题 1：缓存失效延迟分析

### 2.1 现象描述
用户 A 上传带有新标签的 Pin 后，其他用户在 5 分钟内无法在自动补全列表中看到该新标签。

### 2.2 根因分析

当前代码：
```python
class TagAutoCompleteViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Tag.objects.all()

    @method_decorator(cache_page(60 * 5))  # 硬编码 300 秒缓存
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)
```

**Django `cache_page` 的限制**：

1. **基于 URL 的缓存键**：`cache_page` 默认使用请求的完整 URL（包括查询参数）生成缓存键。这意味着：
   - `/api/tags-auto-complete/?search=foo` 和 `/api/tags-auto-complete/?search=bar` 是两个独立的缓存
   - 但同一 URL 的所有用户共享同一份缓存（这导致了问题 2 的隐私问题）

2. **无法主动失效**：`cache_page` 装饰器没有提供简单的 API 来主动清除特定视图的缓存。要手动失效，需要：
   - 知道确切的缓存键（由 Django 内部生成，格式复杂）
   - 或使用 `cache.delete_pattern()` 通配符删除（可能影响性能）
   - 或使用 `cache.clear()` 清空整个缓存（破坏性操作）

3. **无事件驱动失效**：当新的 Pin 被创建或标签被添加时，没有信号（Signal）触发缓存失效。

### 2.3 Django cache_page 缓存键生成机制

Django 内部生成的缓存键格式大致为：
```
views.decorators.cache.cache_page.<VERSION>.<URL_HASH>.<METHOD>.<ACCEPT_ENCODING>
```

这使得**精确删除特定视图的缓存变得非常困难**，因为：
- URL 哈希是通过对完整 URL（包括查询字符串）进行 MD5 生成的
- 不同的 `Accept-Encoding` 会生成不同的缓存键

---

## 三、问题 2：隐私泄露风险分析

### 3.1 现象描述
用户创建仅属于私有 Pin 的机密标签后，其他用户仍能通过标签自动补全 API 获取该机密标签。

### 3.2 根因分析

当前实现使用 `Tag.objects.all()` 作为查询集，完全忽略了：
- Pin 的 `private` 字段（参见 [core/models.py](file:///e:/solo-code-2/pinry/core/models.py#L101-L102)）
- Pin 的 `submitter` 所属关系
- 现有权限控制逻辑（参见 [core/serializers.py](file:///e:/solo-code-2/pinry/core/serializers.py#L14-L27) 中的 `filter_private_pin`）

**攻击场景示例**：
1. 用户 A 创建一个私有 Pin，并打上标签 `公司机密-季度财报`
2. 用户 B 在搜索框输入 `公司`
3. 自动补全接口返回 `公司机密-季度财报`，泄露敏感信息

### 3.3 现有权限控制参考

系统中已有成熟的过滤逻辑可复用：

```python
# core/serializers.py:14-19
def filter_private_pin(request, query):
    if request.user.is_authenticated:
        query = query.exclude(~Q(submitter=request.user), private=True)
    else:
        query = query.exclude(private=True)
    return query.select_related('image', 'submitter')
```

---

## 四、问题 3：重构方案与精细缓存策略

### 4.1 数据源过滤重构

#### 方案概述
重构 `TagAutoCompleteViewSet` 的 `get_queryset` 方法，使其仅返回对当前请求用户可见的 Pin 所关联的标签。

#### 实现方案

```python
# core/views.py 中 TagAutoCompleteViewSet 的重构版本
from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import mixins, viewsets
from taggit.models import Tag

from core.models import Pin
from core.serializers import filter_private_pin


class TagAutoCompleteViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = api.TagAutoCompleteSerializer
    pagination_class = None

    def get_queryset(self):
        """
        仅返回对当前用户可见的 Pin 所关联的标签
        """
        request = self.request
        # 1. 先过滤出用户可见的 Pin
        visible_pins = filter_private_pin(request, Pin.objects.all())
        # 2. 通过 Pin 的标签关系获取对应的 Tag
        # Pin 与 Tag 通过 django-taggit 的中间表关联
        return Tag.objects.filter(
            pin__in=visible_pins
        ).distinct().order_by('name')

    @method_decorator(cache_page(60 * 5))
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)
```

**关键点说明**：
1. **复用现有过滤逻辑**：使用 `filter_private_pin()` 确保与其他接口保持一致的权限模型
2. **反向关联查询**：通过 `pin__in` 反向查询关联到可见 Pin 的标签
3. **去重处理**：`.distinct()` 确保同一标签不会因为关联多个 Pin 而重复返回

### 4.2 精细缓存失效策略

#### 4.2.1 问题分析
使用 `cache_page` 存在以下问题：
- 所有用户共享同一缓存，无法按用户隔离
- 无法精确失效特定缓存
- 查询参数变化（如搜索词）导致缓存碎片化

#### 4.2.2 推荐方案：手动缓存控制

**方案设计**：

```python
# core/views.py - 手动缓存控制版本
from django.core.cache import cache
from rest_framework.response import Response


class TagAutoCompleteViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = api.TagAutoCompleteSerializer
    pagination_class = None

    def get_queryset(self):
        request = self.request
        visible_pins = filter_private_pin(request, Pin.objects.all())
        return Tag.objects.filter(
            pin__in=visible_pins
        ).distinct().order_by('name')

    def list(self, request, *args, **kwargs):
        search_term = request.query_params.get('search', '')
        user_id = request.user.id if request.user.is_authenticated else 'anon'
        
        # 构造用户级缓存键
        cache_key = f'tag_autocomplete:user_{user_id}:search_{search_term}'
        
        # 尝试从缓存获取
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)
        
        # 未命中缓存，执行查询
        response = super().list(request, *args, **kwargs)
        
        # 缓存结果 5 分钟
        cache.set(cache_key, response.data, timeout=60 * 5)
        
        return response
```

#### 4.2.3 主动缓存失效机制

**通过 Django Signals 实现事件驱动失效**：

```python
# core/signals.py（新建或添加到 core/models.py）
from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver
from django.core.cache import cache
from django.db.models import Q

from core.models import Pin


def invalidate_tag_autocomplete_cache(user_id=None):
    """
    失效标签自动补全缓存
    - 如果指定 user_id，仅失效该用户的缓存
    - 否则失效所有用户的缓存（使用通配符）
    """
    if user_id:
        pattern = f'tag_autocomplete:user_{user_id}:*'
    else:
        pattern = 'tag_autocomplete:*'
    
    # 注意：Memcached 不支持通配符删除，需根据后端实现
    # 如果使用 Redis，可以使用 cache.delete_pattern(pattern)
    # 简单实现：使用版本号机制或 cache.clear() 的替代方案
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        # 回退方案：设置一个全局版本号
        current_version = cache.get('tag_autocomplete_version', 0)
        cache.set('tag_autocomplete_version', current_version + 1)


@receiver(post_save, sender=Pin)
def handle_pin_save(sender, instance, created, **kwargs):
    """当 Pin 被创建或更新时，失效相关缓存"""
    # 失效提交者的缓存
    invalidate_tag_autocomplete_cache(user_id=instance.submitter_id)
    
    # 如果 Pin 从私有变为公开或反之，所有用户缓存都需要失效
    if 'private' in kwargs.get('update_fields', []):
        invalidate_tag_autocomplete_cache()


@receiver(post_delete, sender=Pin)
def handle_pin_delete(sender, instance, **kwargs):
    """当 Pin 被删除时，失效缓存"""
    invalidate_tag_autocomplete_cache(user_id=instance.submitter_id)


# 监听标签的 M2M 变化
@receiver(m2m_changed, sender=Pin.tags.through)
def handle_tags_changed(sender, instance, action, **kwargs):
    """当 Pin 的标签发生变化时失效缓存"""
    if action in ('post_add', 'post_remove', 'post_clear'):
        invalidate_tag_autocomplete_cache(user_id=instance.submitter_id)
```

#### 4.2.4 缓存键版本化方案（兼容 Memcached）

如果使用的缓存后端不支持通配符删除（如 Memcached），可以使用版本化方案：

```python
def list(self, request, *args, **kwargs):
    search_term = request.query_params.get('search', '')
    user_id = request.user.id if request.user.is_authenticated else 'anon'
    
    # 获取当前版本号
    version = cache.get('tag_autocomplete_version', 0)
    user_version = cache.get(f'tag_autocomplete_version_user_{user_id}', version)
    
    cache_key = f'tag_autocomplete:v{user_version}:user_{user_id}:search_{search_term}'
    
    cached_data = cache.get(cache_key)
    if cached_data is not None:
        return Response(cached_data)
    
    response = super().list(request, *args, **kwargs)
    cache.set(cache_key, response.data, timeout=60 * 5)
    
    return response
```

失效时只需增加版本号：
```python
def invalidate_tag_autocomplete_cache(user_id=None):
    if user_id:
        # 仅失效特定用户
        key = f'tag_autocomplete_version_user_{user_id}'
        current = cache.get(key, cache.get('tag_autocomplete_version', 0))
        cache.set(key, current + 1)
    else:
        # 失效所有用户
        current = cache.get('tag_autocomplete_version', 0)
        cache.set('tag_autocomplete_version', current + 1)
```

### 4.3 完整重构后的代码

```python
# core/views.py
from django.core.cache import cache
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, mixins, routers
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.viewsets import GenericViewSet
from taggit.models import Tag

from core import serializers as api
from core.models import Image, Pin, Board
from core.permissions import IsOwnerOrReadOnly, OwnerOnlyIfPrivate
from core.serializers import filter_private_pin, filter_private_board


class TagAutoCompleteViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = api.TagAutoCompleteSerializer
    pagination_class = None
    filter_backends = (SearchFilter,)
    search_fields = ('name',)

    def get_queryset(self):
        """仅返回对当前用户可见的 Pin 所关联的标签"""
        request = self.request
        visible_pins = filter_private_pin(request, Pin.objects.all())
        return Tag.objects.filter(
            pin__in=visible_pins
        ).distinct().order_by('name')

    def list(self, request, *args, **kwargs):
        """用户级缓存控制的列表接口"""
        search_term = request.query_params.get('search', '')
        user_id = request.user.id if request.user.is_authenticated else 'anon'
        
        # 使用版本号机制支持精确失效
        global_version = cache.get('tag_autocomplete_version', 0)
        user_version = cache.get(
            f'tag_autocomplete_version_user_{user_id}',
            global_version
        )
        
        cache_key = (
            f'tag_autocomplete:'
            f'v{user_version}:'
            f'user_{user_id}:'
            f'search_{search_term}'
        )
        
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)
        
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, timeout=60 * 5)
        
        return response
```

---

## 五、性能与权衡分析

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **cache_page 原方案** | 代码简洁，Django 原生支持 | 无法主动失效，所有用户共享缓存，有隐私风险 | 仅公开数据的简单场景 |
| **用户级手动缓存** | 按用户隔离，支持主动失效，隐私安全 | 代码复杂度增加 | 大多数生产场景 |
| **版本号缓存** | 兼容所有缓存后端，失效操作轻量 | 旧版本缓存会自然过期但占用空间 | 使用 Memcached 的场景 |
| **完全禁用缓存** | 实现最简单，数据实时 | 数据库压力大 | 标签量少、访问量低的场景 |

### 5.1 性能影响评估

**重构后的查询性能**：
- 查询复杂度：`Tag.objects.filter(pin__in=visible_pins)` 涉及 JOIN 操作
- 优化建议：
  1. 确保 `pin_private` 和 `pin_submitter_id` 字段有索引（现有模型已通过 `index_together` 部分覆盖）
  2. 考虑使用 `prefetch_related` 或 `annotate` 优化
  3. 对于高并发场景，可考虑将标签列表预计算并存储

---

## 六、完整实施步骤

1. **修改 `core/views.py`** 中的 `TagAutoCompleteViewSet` 类，添加 `get_queryset` 方法并替换 `list` 方法的缓存策略

2. **在 `core/models.py` 末尾添加信号处理器**（或创建 `core/signals.py` 并在 `apps.py` 中注册）

3. **测试验证**：
   - 测试私有 Pin 的标签不会出现在其他用户的自动补全中
   - 测试添加新标签后缓存能正确失效
   - 测试不同搜索词的缓存隔离

4. **性能监控**：
   - 监控数据库查询耗时
   - 监控缓存命中率
   - 根据实际情况调整缓存超时时间

---

## 七、总结

1. **缓存失效问题**：Django `cache_page` 确实存在无法主动使缓存失效的限制，建议使用手动缓存控制配合信号驱动的失效机制

2. **隐私泄露问题**：当前实现存在严重的隐私泄露风险，必须重构查询逻辑，过滤掉私有 Pin 关联的标签

3. **最佳实践**：
   - 数据源：使用 `get_queryset` + `filter_private_pin` 确保权限一致
   - 缓存策略：用户级缓存键 + 版本号机制 + 信号驱动失效
   - 代码复用：复用现有 `filter_private_pin` 逻辑，保持权限模型统一
