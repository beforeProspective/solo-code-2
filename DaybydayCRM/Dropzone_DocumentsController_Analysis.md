# Dropzone + DocumentsController 上传与文件系统集成分析

> 针对三个问题的说明，代码引用基于当前仓库 `resources/views/documents/_uploadFileModal.blade.php`、`app/Http/Controllers/DocumentsController.php`、`app/Services/Storage/StorageAdapterRegistry.php`、`app/Http/Middleware/RedirectIfFileSystemIsNotEnabled.php`、`app/Repositories/FilesystemIntegration/FilesystemIntegration.php`。

---

## 1. 为什么上传成功后要按来源（任务 / 项目 / 客户）跳转不同地址，而不是统一跳回同一个页面？

### 根本原因：一个弹窗服务于三种不同的业务资源，这三种资源的"详情页 URL 结构"互不兼容。

弹窗通过 `_uploadFileModal.blade.php` 第 9 行的 `<form action="{{ $route }}">` 动态指向后端上传路由，该路由由 `DocumentsController::uploadFilesModalView` 依据 `$type` 生成：

```php
return $view
    ->withTitle($task->title)
    ->with('external_id', $external_id)
    ->withType($type)
    ->withRoute(route('document.' . $type . '.upload', $external_id));
```

其中 `document.task.upload` → `/uploaToTask/{external_id}`（对应 `uploadToTask`），`document.project.upload` → `/uploaToProject/{external_id}`（对应 `uploadToProject`），`document.client.upload` → 走 `upload` 入口。

后端三个入口在成功后返回的 JSON 都只给出了 **`external_id`**：

```php
return response()->json(['external_id' => $task->external_id], 200);       // uploadToTask
return response()->json(['external_id' => $project->external_id], 200);    // uploadToProject
// upload() 给 Client 时 Session flash + redirect
```

前端在 `success` 回调里（`_uploadFileModal.blade.php` 第 45-60 行）只能拿到这个"纯 ID"，必须根据上传来源拼成对应资源的详情页地址：

```js
var typeRouteMap = {
    'task': 'tasks',
    'project': 'projects',
    'client': 'clients'
};
var routeName = typeRouteMap['{{$type}}'];
window.location.href = baseUrl + "/" + response;
```

**为什么不能统一跳同一个页面（例如 `documents` 列表）？**

1. **语义不同**。任务附件属于任务上下文、项目附件属于项目上下文、客户附件属于客户上下文。用户上传完一个任务附件，期望回到的是"任务详情页看到这个附件"，而不是某个与任务毫不相关的文档中心。
2. **前端只拿到 `external_id`，没有任何能区分资源类型的字段**。后端返回值故意只给 ID，避免让前端处理 `source_type` 这种领域概念；因此前端必须借助调用上下文里已经注入的 `$type` 进行路由拼接。
3. **路由本身是 Laravel 资源路由**：`/tasks/{id}`、`/projects/{id}`、`/clients/{id}` 互不相同，统一跳转会出现"跳错页"或 404。
4. **权限 / 数据可见性依赖来源**。用户是否能查看任务 / 项目 / 客户是独立判断的，统一跳转容易触发未授权错误。

因此，弹窗通过 `$type`（后端已验证，参见 `DocumentsController::uploadFilesModalView` 中的 `$type == 'task'|'client'|'project'`）这一外部上下文参数，将同一 UI 绑定到三种来源，在成功回调里做路由拼接，从而避免了后端返回体里携带路由信息。

---

## 2. 上传 / 查看 / 下载三条路径里，前端最先拿到的错误通常来自哪一层？后端在哪一层分别把"源对象权限"和"文件系统开关"拦住？

### 2.1 整体中间件 / 校验顺序

`DocumentsController` 的构造函数：

```php
public function __construct(private StorageAdapterRegistry $storage)
{
    $this->middleware('filesystem.is.enabled');
}
```

Laravel 路由进入 Controller 方法的顺序是：

1. 全局中间件 `web`（`CheckForMaintenanceMode` → `StartSession` → `VerifyCsrfToken` 等）
2. 路由级中间件（若有）
3. **Controller 构造函数注册的中间件**（此处即 `filesystem.is.enabled` = `RedirectIfFileSystemIsNotEnabled`）
4. **Controller 方法内部的业务校验**

所以整体顺序是：**Session / CSRF / 路由绑定 → 文件系统开关 → 权限 → 业务**。

### 2.2 文件系统开关（filesystem.is.enabled）在哪一层被拦

由 `RedirectIfFileSystemIsNotEnabled` 在 **Controller 构造函数中间件层** 拦住：

```php
public function handle($request, Closure $next)
{
    if ($this->storage->isEnabled()) {
        return $next($request);
    }

    if ($request->expectsJson()) {
        return response()->json([
            'message' => __('File integration required for this action'),
        ], 422);
    }

    session()->flash('flash_message_warning', __('File integration required for this action'));

    return redirect()->back();
}
```

- 它依赖 `StorageAdapterRegistry::driver()->isEnabled()`（代理方法）。
- 判断发生在 `view` / `download` / `upload*` / `destroy` 任一方法执行 **之前**。
- AJAX 请求返回 **422 JSON**；普通请求返回 **302 + flash**。

### 2.3 源对象权限在哪一层被拦

权限在 **Controller 方法内部**（业务层）分两类：

- **上传（upload / uploadToTask / uploadToProject / destroy）**：方法入口直接用 Entrust `auth()->user()->can('...')` 判断。例如：

  ```php
  if (! auth()->user()->can('task-upload-files')) {
      session()->flash('flash_message_warning', __('You do not have permission to upload files'));
      return redirect()->back();
  }
  ```

- **查看 / 下载（view / download）**：方法入口先根据 `external_id` 取 `Document`，再调用 `canAccessDocument($document)` 检查。其判断依据：
  - `source_type === Client::class`：要求 `source->user_id === auth()->id()`；
  - `source_type ∈ {Task, Project, Lead}`：调用 `userOwnsAssignableSource`，允许创建者、被分配者、或关联客户所有者访问；
  - 其他类型直接拒绝。

  对 AJAX / JSON 返回 403，对同步请求 flash + `redirect()->back()`。

### 2.4 前端最先拿到的错误来自哪一层

把三条路径的错误来源按"请求抵达时最先触发"排序：

| 路径 | 前端最先看到的错误 | 来源层 | 典型场景 |
|------|---------------------|--------|----------|
| 上传（Dropzone AJAX） | 403（权限不足）| Controller 方法内 `can(...)` | 用户未持有 `task-upload-files` / `project-upload-files` / `document-upload` |
| 上传（Dropzone AJAX） | 422（文件系统未启用）| `filesystem.is.enabled` 中间件 | `StorageAdapterRegistry::driver()->isEnabled()` 返回 false（无 integration 或 NullStorageAdapter）|
| 上传（Dropzone AJAX） | 419 | `web` 组的 `VerifyCsrfToken` | meta tag 缺失或 CSRF 过期 |
| 查看 / 下载（浏览器直开） | 404 找不到文档 | Controller 方法内 `Document::whereExternalId(...)` 查不到 | `external_id` 无效 |
| 查看 / 下载 | 403（权限不足）| Controller 方法内 `canAccessDocument` | 用户非源对象所有者/分配者 |
| 查看 / 下载 | 422 JSON / 302 + flash | `filesystem.is.enabled` 中间件 | 文件系统未启用 |
| 查看 / 下载 | 200 但内容为错误提示 | Controller 业务层 `$fileSystem->view()` 返回 null | 文件已被从 Dropbox 等底层移动 |

对 Dropzone 而言，它走 `POST` 且 `dataType` 默认 json，因此 `error` 回调里最常见的是：

1. **419（CSRF）**：最外层先挂；
2. **422（filesystem.is.enabled）**：未配置集成；
3. **403（权限）**：用户没有对应权限；
4. **4xx 校验（文件超限、源对象不存在）**：业务层返回 redirect，Dropzone 会把 HTML 当 JSON 解析失败，进入 `error` 回调。

对应前端代码就是 `myDropzone.on("error", function(file, response) { $('input[type="submit"]').attr("disabled", false); });`，它只做了启用按钮这一件事，**错误信息其实在响应体里但前端没有做可读化展示**，这也是当前实现的一个已知短板。

### 2.5 两层拦截的职责边界

- **文件系统开关**：由中间件层 (`filesystem.is.enabled`) 统一解决，让所有涉及存储的方法都不必重复判定。
- **源对象权限**：由业务层（Controller 方法内部）解决，因为它依赖"源对象是谁、当前用户和源对象的关系"这类动态信息，不适合下放到通用中间件。

---

## 3. 如果测试环境里容器已经绑定了一个假的 `FilesystemIntegration` 实现，这个弹窗在行为上会怎样变化？为什么前端本身不需要知道底层是本地还是云盘？

### 3.1 假实现会带来哪些行为变化

`StorageAdapterRegistry::driver()` 里有一个明确的容器覆盖分支：

```php
// Allow tests to inject a fake via the container.
if (app()->bound(FilesystemIntegration::class)) {
    return $this->resolved = app(FilesystemIntegration::class);
}
```

测试（例如 `tests/Feature/Storage/StorageAdapterIsolationTest::it_returns_422_json_when_upload_is_attempted_with_no_storage_enabled`）用：

```php
app()->instance(FilesystemIntegration::class, new NullStorageAdapter());
app(StorageAdapterRegistry::class)->reset();
```

注入假实现后，行为变化取决于假实现的 `isEnabled()`：

- **若假实现 `isEnabled()` 返回 `false`**：
  - `filesystem.is.enabled` 中间件直接拦回 **422 JSON**（Dropzone 会触发 `error` 回调），上传按钮在前端重新启用，但实际上没有任何文件入库。
  - 查看 / 下载也会被中间件拦下，不会进入 `$fileSystem->view()` / `download()`。
- **若假实现 `isEnabled()` 返回 `true`，但 `upload()` 返回固定桩数据**：
  - 中间件放行；`uploadToTask` / `uploadToProject` 会走完整流程：拿到假的 `file_path` / `id`，**向数据库写入一条 `Document`**（这是关键行为——假实现不代表不落库，控制器仍然会创建 `Document` 记录）。
  - 返回给前端的 JSON 仍然是 `{ external_id: $task->external_id }`，前端按 `typeRouteMap` 正常跳转。
  - 查看 / 下载：假实现的 `view()` / `download()` 返回 null 或固定串，控制器会在 `!$file` 分支走 flash + `redirect()->back()`，或直接返回 200 假内容。
- **假实现决定不了的部分**：
  - 权限判断（`canAccessDocument` / `can('document-upload')` 等）始终真实，不受假存储影响。
  - CSRF / 认证 / Session 也不受影响。

### 3.2 为什么前端本身不需要知道底层是本地还是云盘

前端之所以"无感"，是因为 **契约被完全收敛到 HTTP 层**：

1. **后端对存储的抽象是 `FilesystemIntegration` 接口**，控制器只面向接口编程：
   - `$fileSystem->upload($folder, $filename, $file)` → 返回 `['file_path', 'id']`；
   - `$fileSystem->view($document)` / `download($document)` → 返回二进制或 null；
   - `$fileSystem->isEnabled()` → 中间件提前消费。
2. **返回给前端的载荷是固定的**：
   - 上传成功：始终是 `{ external_id: ... }`，没有"存储类型"字段；
   - 失败：统一走 4xx + JSON 消息，Dropzone 的 `error` 回调只关心 HTTP 状态。
3. **路由 / 权限 / UI 完全不关心存储位置**：
   - 前端只需要知道"提交到哪条路由"（由 `$route` 传入）、"成功后跳到哪条资源详情页"（由 `$type` 映射）。
   - 无论是 `Local`（走 `Storage::disk('local')`）、`Dropbox`、`GoogleDrive`、还是测试环境里的假实现，响应体结构不变。
4. **错误语义归一化**：
   - "文件系统未启用"由中间件统一翻译成 422；
   - "文件不存在"由控制器统一翻译成 flash + redirect；
   - 前端只需处理 "成功 / 失败" 两种情况即可。

换句话说，**对前端而言，Dropzone 看到的只是"一个能接受 `files[]` 并返回 JSON 的 HTTP 端点"**；至于这个端点背后是把文件写进本地磁盘、Dropbox 还是 Google Drive，属于服务端内部的实现细节，被 `FilesystemIntegration` + `StorageAdapterRegistry` + `filesystem.is.enabled` 这套组合完全封装掉了。也正因此，测试里替换成假的 `FilesystemIntegration` 后，前端代码一行都不用改，行为上仅在"是否能完成上传并跳转"这一结果上体现差异。
