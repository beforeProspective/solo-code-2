# ProjectStatus 与 Statusable 状态辅助逻辑分析

> 涉及文件：
> - [ProjectStatus.php](file:///e:/solo-code-2/DaybydayCRM/app/Enums/ProjectStatus.php)
> - [Statusable.php](file:///e:/solo-code-2/DaybydayCRM/app/Traits/Statusable.php)
> - [Project.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/Project.php)
> - [Task.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/Task.php)
> - [Lead.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/Lead.php)
> - [DeadlineTrait.php](file:///e:/solo-code-2/DaybydayCRM/app/Traits/DeadlineTrait.php)
> - [ProjectsController.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/ProjectsController.php)
> - [TasksController.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/TasksController.php)
> - [tasks/_sidebar.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/tasks/_sidebar.blade.php)
> - [projects/show.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/projects/show.blade.php)

---

## 1. 为什么不能只拿数据库里的原始字符串比较，而必须走状态辅助逻辑

### 1.1 数据层已有的事实

仓库中历史数据对同一状态存在大小写混用（`Closed` / `closed` / `CLOSED`），`ProjectStatus::CLOSED` 甚至被迫写成 `'Closed'`（首字母大写），注释里明确写着 *"Uses capital C to match existing data"*。这意味着 `statuses.title` 这一列并不是真正的枚举字段，而是一个"曾经被自由写入过"的自由文本列。

### 1.2 如果直接比较原始字符串会触发哪些业务事故

项目处于"关闭态"（`isClosed()` 为 `true`）时，系统会对这一条实体施加一系列业务限制。这些限制分布在模型层、控制器层和 Blade 视图层，只要 `isClosed()` 的结果为 `false`（假阴性），限制就会被解除，产生错误的可见性与动作。

#### (a) 模型层：[DeadlineTrait.php](file:///e:/solo-code-2/DaybydayCRM/app/Traits/DeadlineTrait.php#L9-L22)

```php
public function isOverDeadline(): bool
{
    if (!$this->deadline) { return false; }
    if ($this->isClosed()) { return false; }  // 关闭态下 deadline 不再生效
    return $this->deadline->startOfDay() < Carbon::now()->startOfDay();
}
```

如果 `isClosed()` 因为大小写差异返回了 `false`，一个明明已经关闭的项目/任务/线索会被错误地标记为"逾期"，随后出现在逾期提醒、看板筛选、自动告警等所有依赖 `isOverDeadline()` 的下游逻辑里。

#### (b) 视图层：[projects/show.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/projects/show.blade.php#L13-L15)

```blade
@if(!$project->isClosed() && $client)
    <a href="{{route('client.project.task.create', ...)}}" class="btn btn-md btn-brand">New task</a>
@endif
```

- 关闭态下应**禁止再创建新任务**。假阴性会让"New task"按钮重新露出来，用户可以给已经结算/废弃的项目继续加任务，造成数据噪声与账单/工时错误。

#### (c) 视图层：[tasks/_sidebar.blade.php](file:///e:/solo-code-2/DaybydayCRM/resources/views/tasks/_sidebar.blade.php#L11-L29)

```blade
@if(!$tasks->isClosed())
    {{-- 重新指派负责人的编辑按钮 --}}
@end

@if(!$tasks->isClosed())
    {{-- 重新修改状态的编辑按钮 --}}
@end
```

关闭态本应**锁定负责人和状态字段**（已完成的任务不允许再指派、再流转）。假阴性会让这些表单重新出现，用户能把"已完成"的任务重新改成 `Open` 或重新指派他人，破坏了"关闭 = 归档"的语义。

#### (d) 控制器层：[TasksController.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/TasksController.php#L124-L126)

```php
$projects = $client->projects()->whereHas('status', function ($q) {
    return $q->whereRaw('LOWER(title) != ?', [mb_strtolower(ProjectStatus::CLOSED->value)]);
})->pluck('title', 'external_id');
```

创建任务时，"所属项目"下拉框只应显示**未关闭的项目**。如果这里没有用 `LOWER()`（而是直接用 `where('title', '!=', 'Closed')`），所有历史上被写成 `'closed'` 的项目会继续出现在下拉框中，用户可以给已经关闭的项目挂新任务。

### 1.3 小结

直接用数据库原始字符串比较 = 在业务语义上把"一个关闭态实体"当成"未关闭态实体"。这种错误会以**漏限制**（按钮露出来）、**错统计**（完成率偏低、逾期偏高）、**漏筛选**（下拉/列表出现不该出现的行）三种形式污染几乎所有依赖 `isClosed()` 的下游分支。必须通过 `ProjectStatus::isClosed()` + `strcasecmp` 这种大小写无关的辅助逻辑，才能把数据层的"脏值"在进入业务语义前就被归一化。

---

## 2. 大小写不一致导致的假阴性会在哪里失真、为什么、先在哪一页冒出来

### 2.1 失真点

`ProjectStatus::CLOSED->value === 'Closed'`，而数据库里历史数据可能是 `'Closed'`、`'closed'`、`'CLOSED'`、`'close d'` 等。任何**严格等于 `===`** 或 **SQL `WHERE title = 'Closed'`** 的比较在遇到小写值时都会返回 `false`。

在本项目中，最容易出问题的三个比较位置是：

1. **`$status->title === 'Closed'`（PHP 严格比较）**
   例如 [Project.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/Project.php#L125-L129) 里 `isClosed()` 若被写成
   ```php
   return $this->status && $this->status->title === ProjectStatus::CLOSED->value;
   ```
   当数据库存的是 `'closed'` 时永远返回 `false`。

2. **`WHERE title = 'Closed'`（SQL 默认区分大小写的比较）**
   例如在 [Statusable.php](file:///e:/solo-code-2/DaybydayCRM/app/Traits/Statusable.php#L66-L71) 的 `scopeWithStatus`：
   ```php
   $q->where('title', $statusTitle);
   ```
   如果 `$statusTitle` 传 `'Closed'`，而库里是 `'closed'`，这个 scope 会漏掉那些行。

3. **`$status->title === TaskStatus::CLOSED->value` 这种直接跨实体比较**
   虽然 Task/Lead/Project 的 `CLOSED` 枚举值本身都是小写，但数据库的 `statuses.title` 来自一张共享表，很可能是 `'Closed'`（与 Project 的那条旧记录一致）。这种情况下恰恰是**小写枚举**去比**大写数据库值**，同样会失真。

### 2.2 为什么会出现假阴性

严格相等（`===` / `=`）在字符串层面上要求**字符代码点完全一致**，而英文字母大小写在 Unicode/ASCII 中是不同的代码点（`C` = U+0043，`c` = U+0063）。对于存储在数据库里的 "Closed" 和 "closed"，它们表达的是**同一个业务语义**（关闭），但在严格比较的视角里是**两个不同的字符串**。当业务写的是 `$title === 'Closed'` 而数据里存的是 `'closed'` 时，业务语义判定就**对真值返回了 false**——这就是假阴性。

### 2.3 假阴性最先在列表页还是详情页冒出来

结论：**先在列表页（index / 看板 / 下拉筛选）冒出来，详情页稍后才被用户手动发现。**

原因：

1. 列表页 / DataTables / 创建任务时的项目下拉框，依赖的是 **SQL 层的 `WHERE`** 或 Eloquent 的 `whereHas('status', fn($q) => $q->where('title', '...'))`。这里只要用的是严格 `=`（而不是 `LOWER(title) = LOWER(?)`），大小写不匹配的行就**根本不会被取出来**——页面渲染出来就是"少了几条数据"，而用户未必能立刻意识到是"漏了"而不是"本来就没有"。

   例如在 [TasksController.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/TasksController.php#L124-L126) 创建任务时拉取项目下拉框时用的就是 `LOWER(title) != ?`，这是修过的版本；如果当时用的是 `where('title', '!=', 'Closed')`，则所有历史上 `'closed'` 的项目仍然会显示在下拉里，这也是一种"假阴性的反面表现"——本该被过滤掉的行没有被过滤。反过来，如果是"过滤出已关闭项目"的报表/看板，`where('title', 'Closed')` 会把 `'closed'` 的行漏掉，用户看到的统计数字偏小。

2. 详情页（`projects/show`、`tasks/show`）**通常通过主键/外键或 external_id 直接加载**，不受 `title` 过滤影响，所以这一行一定会被加载出来。但进入详情页后，视图层通过 `$project->isClosed()` 再次判断业务语义，此时才会出现"按钮出现/消失异常"的现象。这要求用户先进入详情页、且刚好留意到按钮状态，所以它比列表页的"行直接消失"更晚被发现、更隐蔽。

因此从现象可见性上排序是：

- **列表页 / 筛选页**：大小写不匹配的行被 SQL 过滤掉，表现为"数据量少了"，最先被观察到。
- **详情页**：数据能加载，但按钮/表单展示异常（比如关闭态的项目还显示 "New task" 按钮），需要用户主动点进去才能发现。

---

## 3. 状态判断更适合放在哪里：模型、Trait 还是控制器

### 3.1 现状与分层

本项目的状态判断其实已经分散在三层，每一层都有其合理之处：

| 层次 | 位置 | 职责 | 典型方法 |
| --- | --- | --- | --- |
| 枚举层 | [ProjectStatus.php](file:///e:/solo-code-2/DaybydayCRM/app/Enums/ProjectStatus.php) | 定义状态值域、大小写无关的语义比较 | `ProjectStatus::isClosed($title)` |
| Trait 层 | [Statusable.php](file:///e:/solo-code-2/DaybydayCRM/app/Traits/Statusable.php) | 为"带 status 关联"的任意模型提供通用的状态关系与作用域 | `hasStatus()` / `setStatus()` / `scopeWithStatus()` / `scopeWithoutStatus()` |
| 模型层 | [Project.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/Project.php#L125-L129) / [Task.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/Task.php#L169-L172) / [Lead.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/Lead.php#L168-L171) | 把枚举层的通用语义与自身的 status 关系拼接起来，对外暴露一个业务语义方法 | `$project->isClosed()` |
| 控制器层 | [ProjectsController.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/ProjectsController.php) / [TasksController.php](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/TasksController.php) | 只在必要时使用模型/Trait 暴露的语义方法做业务编排 | 例如下拉过滤、DataTables 的列渲染 |

### 3.2 为什么"控制器直接判断"是最差方案

假设有人把状态判断写在控制器里：

```php
// ❌ 不推荐：在控制器里直接做字符串比较
public function show(Project $project)
{
    $isClosed = $project->status && strcasecmp($project->status->title, 'Closed') === 0;
    // ...
}
```

问题：

1. **不可复用**：同一段 `strcasecmp` 会在 `ProjectsController`、`TasksController`、`LeadsController`、所有 Blade 视图、以及将来的命令行/队列脚本里复制 10 次，任何一次漏改都会出现上一节所说的假阴性。
2. **语义泄露**：控制器把 "Closed 是关闭态" 这个领域知识暴露给了 HTTP 层，一旦状态值域变化（例如新增 `'Archived'` 也视为关闭），需要在所有控制器里同步修改，维护成本高。
3. **测试粒度太粗**：要测试状态判断必须构造一个完整的 HTTP 请求，而如果判断封装在模型方法里，只需 `$project->setRelation('status', ...)` 就能单元测试。
4. **视图层无法直接调用**：Blade 里最常见的用法就是 `@if(!$project->isClosed())`，如果语义在控制器里，视图只能依赖控制器传一个额外的 `$isClosed` 变量，容易出现"忘了传"或"传错了"的情况。

### 3.3 Trait vs 模型：两种互补的落点

#### (a) Trait 适合放"与状态关系有关的通用能力"

[Statusable.php](file:///e:/solo-code-2/DaybydayCRM/app/Traits/Statusable.php) 里放的是：

- `status()` 关联的统一声明；
- `hasStatus()` / `setStatus()`：读写 `status_id` 的通用逻辑；
- `scopeWithStatus()` / `scopeWithoutStatus()`：基于状态的查询作用域。

这些逻辑对 Project / Task / Lead / 任何将来新增的可带状态的模型都是一样的，抽到 Trait 可以避免在三个模型里写三遍，是最容易被复用的一层。

#### (b) 模型适合放"与本模型业务语义有关的状态判断"

比如 [Project.php](file:///e:/solo-code-2/DaybydayCRM/app/Models/Project.php#L125-L129) 的：

```php
public function isClosed()
{
    return $this->status && ProjectStatus::isClosed($this->status->title);
}
```

- 这个方法内部**引用了 `ProjectStatus`**（一个只对 Project 有意义的枚举），不可能是通用的——Task 和 Lead 各有自己的枚举，所以不适合放到 Statusable Trait 里。
- 但它的签名 `isClosed(): bool` 在三个模型里是完全一致的，这使得 [DeadlineTrait.php](file:///e:/solo-code-2/DaybydayCRM/app/Traits/DeadlineTrait.php#L16-L18) 可以写成 `$this->isClosed()` 而不用关心自己被挂在哪个模型上——这是一种"约定式的多态"，通过 duck-typing 让 DeadlineTrait 获得了最大复用性。

#### (c) 枚举层负责"值域归一化"

[ProjectStatus::isClosed()](file:///e:/solo-code-2/DaybydayCRM/app/Enums/ProjectStatus.php#L12-L15) 用 `strcasecmp` 做大小写无关比较，本质上是把数据层的脏值（`Closed` / `closed` / `CLOSED`）**归一化为单一语义**。这个归一化点必须集中在一处，否则任何一次忘记加 `strcasecmp` 都会回到第 2 节所说的假阴性问题。

### 3.4 结论：最佳落点与复用性

- **枚举层**：只放"值域 + 归一化比较"，单一来源，所有对"关闭态"的判定最终都应该流经这里。
- **Trait（Statusable）**：放"与 status 关系有关的通用行为"，比如 `hasStatus` / `setStatus` / `scopeWithStatus`。这一层**复用性最高**，任何 `belongsTo(Status::class)` 的模型只要 `use Statusable;` 就能获得全部能力。
- **模型**：放"本模型的业务语义方法"，比如 `isClosed()`，内部调用枚举层做归一化比较。这一层是**视图和控制器最常调用的入口**，保持方法名一致（`isClosed()`）可以让其他 Trait（如 `DeadlineTrait`）通过 duck-typing 复用。
- **控制器**：只做编排，**绝不直接比较字符串**。它应该只调用模型层已经暴露的语义方法（`$project->isClosed()`、`Project::withStatus('Closed')`、`Project::withoutStatus('Closed')` 等）。

一句话概括：**把"字符串怎么比较"封在枚举里，把"status 关系怎么读/写/过滤"封在 Trait 里，把"这个实体现在是不是关闭态"封在模型里，控制器只调用语义方法。**这样分层后，数据层的大小写脏值永远不会泄露到业务层，也不会在视图/控制器里出现第 2 节那种假阴性。
