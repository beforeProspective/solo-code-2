# 评论与提及链路分析

本文分析 DaybydayCRM 中 `CommentController@store`、`Task/Lead/Project` 的 `getCreateCommentEndpoint` 与 `NotiftyMentionedUsers` 如何组成评论与提及链路，并回答三个问题。

---

## 1. 评论输入框怎样根据资源自动选择提交地址

前端评论框集中在一个 Blade 组件中：

[comments.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/partials/comments.blade.php)

```blade
<form action="{{ $subject->getCreateCommentEndpoint() }}" method="POST">
```

这里的 `$subject` 是调用方传入的对象（Task/Lead/Project 三者之一）。由于三个模型都实现了 `Commentable` 接口：

[Commentable.php](file:///e:/solo-code-2/DaybydayCRM/app/Services/Comment/Commentable.php)

```php
interface Commentable
{
    public function comments(): MorphMany;
    public function getCreateCommentEndpoint(): string;
}
```

而每个模型独立给出 `getCreateCommentEndpoint()`：

- [Task.php#L130-L133](file:///e:/solo-code-2/DaybydayCRM/app/Models/Task.php#L130-L133) → `route('comments.create', ['type' => 'task', 'external_id' => ...])`
- [Lead.php#L148-L151](file:///e:/solo-code-2/DaybydayCRM/app/Models/Lead.php#L148-L151) → `route('comments.create', ['type' => 'lead', 'external_id' => ...])`
- [Project.php#L131-L134](file:///e:/solo-code-2/DaybydayCRM/app/Models/Project.php#L131-L134) → `route('comments.create', ['type' => 'project', 'external_id' => ...])`

路由统一注册为：

[web.php#L100](file:///e:/solo-code-2/DaybydayCRM/routes/web.php#L100)

```php
Route::post('/comments/{type}/{external_id}', 'CommentController@store')->name('comments.create');
```

因此：

- **Blade 组件并不需要关心当前是谁**：它只调用 `$subject->getCreateCommentEndpoint()`，由传入对象的多态行为决定 URL。
- **URL 的后半段 `{type}/{external_id}` 成了路由参数**：同一个 `CommentController@store` 收到请求后，再用 `$type` 反查出对应的模型类（`App\Models\Task` / `Lead` / `Project`），完成一条链路上的统一落点。

控制器在 [CommentController.php#L17-L47](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/CommentController.php#L17-L47) 中按 `type` 进行映射：

```php
$modelsMapping = [
    'task'    => 'App\\Models\\Task',
    'lead'    => 'App\\Models\\Lead',
    'project' => 'App\\Models\\Project',
];
$source = $model::findByExternalId($request->validated('external_id'));
$source->comments()->create([...]);
```

这就是"一套编辑器、三类模型"能够共存的根本原因：**前端以多态接口隐藏差异，后端以类型映射表重新路由到具体模型**。模型上的 `getCreateCommentEndpoint` 方法相当于把"我是哪一种资源"这个元信息通过 URL 显式传递给了控制器，避免了前端必须写三份表单或根据页面上下文做条件判断。

测试 [GetCommentEndpointTest.php](file:///e:/solo-code-2/DaybydayCRM/tests/Unit/Comments/GetCommentEndpointTest.php) 也验证了这三个 endpoint 分别指向不同 URL。

---

## 2. 提及链路中三层各自负责什么

评论正文里的 `@username` 提及由前端编辑器、评论存储、通知监听器三层配合完成。

### 2.1 前端编辑器层（Summernote + At.js）

[comments.blade.php#L52-L82](file:///e:/solo-code-2/DaybydayCRM/resources/views/partials/comments.blade.php#L52-L82)

```js
$('#comment-field').summernote({...});
$('.note-editable').atwho({
    at: "@",
    limit: 5,
    delay: 400,
    callbacks: {
        remoteFilter: function (t, e) {
            t.length <= 2 || $.getJSON("/users/users", {q: t}, function (t) { e(t) })
        }
    }
})
```

- **职责**：为用户提供富文本编辑，并在输入 `@` 时触发候选人下拉。`remoteFilter` 向后端 `/users/users`（`UsersController@users`）实时拉取匹配的用户名。
- **是否同步**：**同步**。编辑器必须在用户继续键入前立即给出候选列表，任何延迟都会打断输入体验。因此这一层必须同步返回（即使用 `delay: 400` 去抖，本质仍是一次同步 AJAX）。

### 2.2 评论存储层（`CommentController@store` + `Comment` 模型）

[CommentController.php#L17-L47](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/CommentController.php#L17-L47)  
[Comment.php#L51-L56](file:///e:/solo-code-2/DaybydayCRM/app/Models/Comment.php#L51-L56)

```php
$source->comments()->create([
    'description' => clean($request->validated('description')),
    'user_id'     => auth()->user()->id,
]);
```

`Comment` 模型提供 `mentionedUsers()` 方法，用正则 `/@([\w\-]+)/` 从 `description` 中抽取被提及的用户名：

```php
public function mentionedUsers()
{
    preg_match_all('/@([\w\-]+)/', $this->description, $matches);
    return $matches[1];
}
```

- **职责**：持久化评论正文并提供提取提及的能力。
- **是否同步**：**同步**。评论本身必须立即落库、立即给用户反馈，否则表单提交后的 `redirect()->back()` 会让用户看不到自己刚写的内容。

### 2.3 通知监听器层（`NotiftyMentionedUsers`）

[NotiftyMentionedUsers.php#L23-L33](file:///e:/solo-code-2/DaybydayCRM/app/Listeners/NotiftyMentionedUsers.php#L23-L33)

```php
public function handle(NewComment $event)
{
    collect($event->comment->mentionedUsers())
        ->map(function ($name) {
            return User::query()->where('name', $name)->first();
        })
        ->filter()
        ->each(function ($user) use ($event) {
            $user->notify(new YouWereMentionedNotification($event->comment));
        });
}
```

最终发出的通知类 [YouWereMentionedNotification.php](file:///e:/solo-code-2/DaybydayCRM/app/Notifications/YouWereMentionedNotification.php) 使用 `Queueable`，通过 `database` 通道落库：

```php
use Queueable;
public function via($notifiable) { return ['database']; }
```

- **职责**：把 `@` 用户名解析为 `User` 模型并发送通知。
- **是否同步**：**最适合异步**。被提及的人数可能较多、每次查询用户名都会产生数据库调用；用户并不关心通知"立即"出现在被提及者的收件箱。该监听器应通过 `ShouldQueue` 或在事件上用 `->queue(...)` 推入队列；即便监听器本身同步执行，`YouWereMentionedNotification` 也已经 `Queueable`，通知的投递可由队列 worker 完成。

### 小结

| 层 | 组件 | 职责 | 建议同步/异步 |
|---|---|---|---|
| 前端编辑器 | Summernote + At.js + `/users/users` | `@` 时拉取候选人、渲染下拉 | **同步**（阻塞输入体验） |
| 评论存储 | `CommentController@store` → `Comment` 模型 | 校验、落库、`mentionedUsers()` 正则提取 | **同步**（用户立即看到评论） |
| 通知监听 | `NotiftyMentionedUsers` → `YouWereMentionedNotification` | 解析用户 → 发通知 | **异步**（`Queueable` + 队列 worker） |

### 一个值得关注的实现缺口

`EventServiceProvider` 已注册 `NewComment → NotiftyMentionedUsers`：

[EventServiceProvider.php#L28-L30](file:///e:/solo-code-2/DaybydayCRM/app/Providers/EventServiceProvider.php#L28-L30)

```php
'App\Events\NewComment' => [
    'App\Listeners\NotiftyMentionedUsers',
],
```

但在 `app/` 源码中，**`NewComment` 事件并未被任何地方派发**：控制器没有调用 `event(new NewComment(...))`，`Comment` 模型也没有在 `created` 回调或 `CommentObserver` 中派发（代码库仅观察了 Task/Lead/Project/Client/Invoice/Document）。因此目前生产路径下 `NotiftyMentionedUsers` 实际不会被触发，提及通知链路是断开的。要让它工作，需要在 `CommentController@store` 中成功 `create()` 之后 `NewComment::dispatch($comment)`，或者为 `Comment` 模型注册 Observer 在 `created` 时派发。

---

## 3. 缺少 `source` 关系或 `getCreateCommentEndpoint` 的暴露点

### 3.1 前端最早暴露问题的环节

三个可评论模型必须同时具备：

1. `comments(): MorphMany` 关系（通过 `morphMany(Comment::class, 'source')` 建立多态关联）。
2. `getCreateCommentEndpoint(): string` 方法（由 `Commentable` 接口契约要求）。

- **缺少 `getCreateCommentEndpoint`**：
  - 由于 `Task`/`Lead`/`Project` 均显式 `implements Commentable`，PHP 在类加载时就会以 `Error` 级别报错 —— "Class must implement abstract method Commentable::getCreateCommentEndpoint"。
  - 若某个模型**没有**声明 `implements Commentable`，但仍被作为 `$subject` 传入 `comments.blade.php`，则会在 Blade 渲染阶段调用到不存在的方法，抛出 `BadMethodCallException`。**这是前端视角下最早、最明显的暴露点：评论区域本身根本渲染不出来**。

- **缺少 `comments()` 关系（即 `source` 关系）**：
  - 前端不会立刻报错，因为表单 HTML 只依赖 `getCreateCommentEndpoint`。只有在用户提交评论后，控制器调用 `$source->comments()->create(...)` 时才会失败，抛出 `BadMethodCallException`。由于控制器是同步的 POST 请求，**用户会看到 500 错误页或 `redirect()->back()` 前的异常**，而不是"评论已保存"。

**结论**：对前端而言，`getCreateCommentEndpoint` 的缺失在渲染阶段就已暴露；`comments()` 关系的缺失会在首次提交时才暴露。

### 3.2 后端失去通知能力的环节

通知链路：`NewComment` 事件 → `NotiftyMentionedUsers` → `YouWereMentionedNotification`。

关键步骤在监听器中：

[NotiftyMentionedUsers.php#L25-L31](file:///e:/solo-code-2/DaybydayCRM/app/Listeners/NotiftyMentionedUsers.php#L25-L31)

```php
collect($event->comment->mentionedUsers())
    ->map(...)
    ->filter()
    ->each(function ($user) use ($event) {
        $user->notify(new YouWereMentionedNotification($event->comment));
    });
```

以及通知的 `toArray()`：

[YouWereMentionedNotification.php#L44-L63](file:///e:/solo-code-2/DaybydayCRM/app/Notifications/YouWereMentionedNotification.php#L44-L63)

```php
$topic = $this->comment->commentable; // 通过 morphTo('source') 反查
$text  = __(':creator mentioned you in :topic', [
    'topic'   => $topic->title,
    ...
]);
```

- **缺少 `comments()`（`source` 多态）关系**：评论永远无法被成功创建（控制器 `$source->comments()->create` 直接抛异常），因此 `NewComment` 事件无从产生，**整条通知链在入口处就被短路**。
- **评论创建成功但 `commentable` 的反向 `morphTo('source')` 不可用**（理论上不会发生，因为 `comments()` 与 `morphTo('source')` 成对存在）：`$this->comment->commentable` 返回 `null`，`$topic->title` 会抛 `Error: Trying to get property 'title' of non-object`。即使监听器同步执行，异常也会在通知构建时出现；若监听器进入队列，worker 会反复重试并把该任务标记为 failed。**通知能力在 "解析被评论对象" 这一步失去**。
- **假设上述全部正常、但模型缺少 `getCreateCommentEndpoint`**：评论本身可能无法被提交（见 3.1），自然也不会有通知。即使绕过前端直接发 POST，也不影响后端，因为控制器根本不调用 `getCreateCommentEndpoint`。

**结论**：

- 失去通知能力的 **最早后端环节** 是 `CommentController@store` 中 `$source->comments()->create(...)` —— 没有 `comments()` 关系就不会有 Comment 记录，更不会有事件。
- 若评论成功写入但 `commentable` 反向关系失效，则 **在 `NotiftyMentionedUsers` 触发的 `YouWereMentionedNotification@toArray` 中崩溃**，通知消息无法构造。
- 通知发送本身可通过 `Queueable` 异步，但构造消息所需的 `$topic->title` 必须在同步/队列中都能访问到；只要 `source` 多态关系存在，这一步就成立。

---

## 总结

1. **前端复用原理**：统一的 Blade 组件通过 `Commentable` 接口调用 `$subject->getCreateCommentEndpoint()`，让 Task/Lead/Project 各自返回 `route('comments.create', [...])`，URL 中的 `{type}` 就是控制器用来反查模型类的开关。一个组件 + 一个控制器 + 三个 endpoint 实现，完美复用。
2. **三层分工**：
   - 编辑器层（Summernote + At.js + `/users/users`）负责 `@` 候选下拉，必须同步。
   - 存储层（`CommentController@store` + `Comment`）负责落库与正则提取提及，必须同步。
   - 监听器层（`NotiftyMentionedUsers` + `Queueable` 通知）负责解析用户并发通知，最适合异步。
3. **缺口暴露**：
   - 缺少 `getCreateCommentEndpoint`：前端在渲染评论区时立即抛异常。
   - 缺少 `comments()` morphMany：首次提交时控制器抛异常，评论与通知链路同时中断。
   - 后端失去通知能力的第一环：`$source->comments()->create(...)`；其次是 `YouWereMentionedNotification@toArray` 访问 `$topic->title` 时。
4. **额外发现**：`NewComment` 事件目前**没有任何派发点**，`NotiftyMentionedUsers` 在生产路径下实际上不会被触发，提及通知链路在设计上完整但在实现上有一个漏发事件的缺口需要补上。
