# SettingsController 与 Calendar.vue 协作分析

## 1. 背景：两个"客户"共享同一组接口

[SettingsController](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/SettingsController.php) 暴露了三组与设置相关的端点（见 [web.php](file:///e:/solo-code-2/DaybydayCRM/routes/web.php#L131-L135)）：

- `PATCH /settings/overall` → `updateOverall`：普通设置页的整体更新入口；
- `GET /settings/business-hours` → `businessHours()`：只返回 `{open, close}` 两个时间；
- `GET /settings/date-formats` → `dateFormats()`：返回完整的日期格式映射（PHP、JS、Carbon、Moment.js 等）。

它们同时服务两个前端：

1. 普通**设置页** `settings/index.blade.php`：页面首屏用 `index()` 渲染出带 `$settings / $businessHours` 的表单；保存时向 `updateOverall` 发 PATCH。
2. **Calendar.vue**：在 `created()` 里并发发三条 axios 请求：
   - `/settings/date-formats` → 用于 `options.format.majorLabels.minorLabels` 构造 vis-timeline 的时间轴文案（[Calendar.vue#L200-L204](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/Calendar.vue#L200-L204)）；
   - `/settings/business-hours` → 写入 `this.business_hours`，并据此拼出 `hiddenDates` 中每日重复的"非营业时间"区间（[Calendar.vue#L239-L248](file:///e:/solo-code-2/DaybydayCRM/resources/assets/js/components/Calendar.vue#L239-L248)）；
   - `/users/calendar-users`、`/appointments/data` → 人员/事件数据。

`mounted()` 用 `await itemsLoaded/usersLoaded/businessHoursLoaded/dateFormatsLoaded` 等所有前置数据就绪后才 `new Timeline(...)`，也就是说**时间轴的初始刻度、范围、分组全部由这两份设置快照决定**。

---

## 2. PATCH 提交与 GET 查询的关系，以及为何不该共用同一响应形态

### 2.1 它们围绕的"设置"其实是两层不同的东西

- `updateOverall` 做的是**命令（Command）**：接收一整个表单（company / currency / country / language / vat / client_number / invoice_number / start_time / end_time），调用 [UpdateOverallSettingsService](file:///e:/solo-code-2/DaybydayCRM/app/Services/Setting/UpdateOverallSettingsService.php) 做校验、落库、清缓存，然后返回"成功 / 哪一类校验失败 / 异常"。
- `businessHours()` / `dateFormats()` 做的是**查询（Query）**：只读数据库/缓存，不产生副作用，返回的是"当前系统的真实配置值"。

这两个方向分别落在 CQS 的两边：一个是**写**，一个是**读**。即便它们都"围绕设置"，**语义、幂等性、缓存策略、错误模型都完全不同**。

### 2.2 PATCH 的响应长什么样

`updateOverall` 按 `$request->expectsJson()` 分支：

- 成功 → `200 { message: "Overall settings successfully updated" }`；
- `client_number_invalid` / `invoice_number_invalid` → `400 { message: "..." }` 或 `redirect()->back()` + Session flash；
- 异常 → `failureResponse(...)`。

它的响应里只有"操作结果 + 提示文案"，不包含任何设置的实际值，因为设置页的调用方（表单提交）根本不需要这些值——它要么 `redirect()->back()` 让浏览器重新请求 `index()` 渲染，要么拿到 JSON 消息后弹 toast。

### 2.3 GET 的响应长什么样

- `businessHours()`：`{ open: "09:00", close: "17:00" }`，Calendar 需要用它拼 `hiddenDates` 的 start/end；
- `dateFormats()`：从 `GetDateFormat::getAllDateFormats()` 出来的一张格式表，Calendar 用它写 `majorLabels.hour = res.data.momentjs_day_and_date_with_text`、`minorLabels.hour = res.data.momentjs_time`，并在渲染请假条时用 `moment(...).format(momentjs_day_and_date_with_text + " " + momentjs_time)` 拼时间区间。

### 2.4 为什么不该共用同一个响应形态

假设为了"复用"把 PATCH 的成功响应也改成 `{ settings, business_hours, date_formats }`，带来的问题：

1. **语义混乱**：一个写请求返回的是"当前全局视图"，意味着调用方拿到的是写后的读取结果，两者耦合后就无法再对 PATCH 做独立缓存、重试、幂等测试。
2. **前端职责错位**：设置页的表单拿到一堆 `date_formats` 根本没用；Calendar 又根本不发 PATCH，硬塞过来的"最新 settings" 与它已有的 `businessHoursLoaded / dateFormatsLoaded` Promise 链会互相打架。
3. **缓存失效更难推理**：`updateOverall` 里已经做了 `cache()->delete(GetDateFormat::CACHE_KEY)`（[UpdateOverallSettingsService.php#L80](file:///e:/solo-code-2/DaybydayCRM/app/Services/Setting/UpdateOverallSettingsService.php#L80)）。如果 PATCH 响应再把一份"刚读出的格式"塞回去，前端会把它当成新事实缓存，与 GET 接口的缓存策略（以及将来可能加的 HTTP 缓存头）形成双写源。
4. **错误模型不同**：PATCH 的 4xx/5xx 要区分"客户编号无效"、"发票编号无效"、"异常"，这些状态对 GET 端点毫无意义；反过来 GET 需要的 `304 Not Modified`、ETag 对 PATCH 也不适用。

**结论**：PATCH 只管"告诉我这次写入有没有成功/为什么失败"，GET 只管"给我当前值"。让它们各自返回最小必要的数据，是比"复用一个大包"更清晰的边界。

---

## 3. 不刷新日期格式缓存会在日历与表单里出现什么显示偏差，为什么更难排查

### 3.1 偏差一：vis-timeline 的时间轴文案与实际语言不匹配

`dateFormats()` 返回的是**带语言和地区倾向**的格式串（如 `momentjs_day_and_date_with_text` 在 `dk` 语言下可能是 `ddd D MMMM`，在 `en` 下是 `ddd Do MMMM`）。如果 `updateOverall` 改了 `language = dk` 却没有执行 `cache()->delete(GetDateFormat::CACHE_KEY)`：

- 后端缓存里仍是 `en` 的格式串；
- Calendar 的 `majorLabels.hour`、`minorLabels.hour`、请假条里的 `moment(...).format(...)` 全部继续按英文规则渲染；
- 但页面其他部分（由 Blade 或 i18n 控制）已经切换为丹麦语。

结果：时间轴顶部写着 "Mon 12 January"，旁边按钮却显示 "Vælg dato"，**同屏出现两种语言/两种日期风格**。

### 3.2 偏差二：不同页面/组件显示格式不一致

- 设置页表单保存后 `redirect()->back()` 会重新走 `index()`，页面上的默认值通过 `$setting->...` 直接从 DB 读，是正确的；
- 但 Calendar、以及其他通过 `GetDateFormat` 走缓存渲染的列表/详情页，依然拿着旧格式串。

结果：在设置页看到的是 `2026-05-25`，切到日历却显示 `05/25/2026`；**同一个日期字段在两个页面出现不同的显示格式**。

### 3.3 为什么这种偏差比单纯的文案错误更难排查

1. **它不是"乱码"或"空白"，而是"看起来合理但不对"**：日期能正常显示，格式也合法，只是跟用户预期不一致。测试人员和用户常常会以为"这是我自己看错了"，或者把它当作浏览器缓存问题而忽略。
2. **它具有"路径依赖性"**：只有**先打开 Calendar 再去改设置**（或反之）的用户才会看到。干净环境下复现不出来，因为 `GetDateFormat` 的缓存只在第一次读取时建立，而 `updateOverall` 只在更新时才会清缓存。
3. **它跨层**：涉及"设置页写 → 缓存清 → GetDateFormat 读 → Moment 渲染"整条链路。断点要打在 PHP 缓存命中处、`dateFormats()` 的响应、Calendar 的 `created()`、vis-timeline 的 `setOptions` 四处才可能连起来，任何单点都看不出问题。
4. **它不是功能性错误**：不会抛异常、不会在日志里留下 stack trace、不会使 Sentry 报警。QA 的"所有功能点正常"自动化脚本也抓不出来，因为它只校验"是否有日期"，不校验"日期格式是否符合当前语言设置"。
5. **它容易被误判为前端 bug**：后端响应看起来是 200，Calendar 渲染也正常，开发会先去 Vue 层找问题，兜一圈才意识到是缓存里的格式串过期。

这类"**显示正确但语义错误**"的偏差，通常只有在多语言、多地区同时上线后才会被发现，而且几乎只能靠人工 UI 比对才能抓到。

---

## 4. 返回 result 对象而不是布尔值时，前后端分别多拿到什么，如何帮助决策

### 4.1 当前的 `UpdateOverallSettingsResult` 能提供什么

[UpdateOverallSettingsService](file:///e:/solo-code-2/DaybydayCRM/app/Services/Setting/UpdateOverallSettingsService.php#L26-L83) 返回一个 `UpdateOverallSettingsResult`，至少包含：

- `status === 'success'`：写入成功；
- `status === 'client_number_invalid'`：客户编号与已使用的冲突；
- `status === 'invoice_number_invalid'`：发票编号冲突。

相比单纯返回 `true/false`：

| 布尔能表达的 | result 额外能表达的 |
| --- | --- |
| 成功 / 失败 | 成功 / **哪一类**失败 / 未来可扩展的更多状态（例如 `vat_invalid`、`currency_unsupported`、`read_only_demo`） |
| 失败原因只能靠日志/异常消息 | 失败原因是**结构化的枚举**，可直接驱动 UI，不依赖翻译文案 |
| 控制器只能 "throw / redirect" | 控制器可以按状态选择 **不同的 HTTP 状态码、不同的 Session flash key、不同的前端提示文案** |

### 4.2 控制器侧因此能做出的决策

当前 `updateOverall` 的结构（[SettingsController.php#L145-L184](file:///e:/solo-code-2/DaybydayCRM/app/Http/Controllers/SettingsController.php#L145-L184)）就是按 result 的 status 分支：

- `client_number_invalid` / `invoice_number_invalid`：HTTP 400（或 redirect back + `flash_message_warning`），文案可区分；
- 其它：200 + `flash_message`；
- 异常：走统一的 `failureResponse`。

如果只返回布尔值，控制器就只能：

- 让 service 抛一个泛化异常，或
- 用 magic number（-1、-2）区分失败原因，

这两种做法都会让控制器丢失"业务语义"，被迫去解析异常消息或字符串。

### 4.3 前端侧因此能做出的决策

以 JSON 请求为例，前端拿到的是：

- 200 `{ message: "..." }` → 弹成功 toast，必要时跳转或刷新；
- 400 `{ message: "Client number invalid" }` → 在 "客户编号" 字段下方高亮提示；
- 400 `{ message: "Invoice number invalid" }` → 在 "发票编号" 字段下方高亮提示；
- 5xx → 弹通用错误提示。

**关键点**：这三类响应的**文案、展示位置、后续动作**都不一样。如果后端只返回 `{ ok: true/false }`，前端只能做"成功 toast / 失败 toast"两件事，无法：

1. 把错误定位到具体表单字段；
2. 给不同失败类型配不同文案（现在文案由 `__('Client number invalid')` 走 i18n，前端拿不到翻译键）；
3. 在更复杂的场景（例如"编号冲突 → 给出建议的下一可用编号"）下附带结构化数据。

### 4.4 "弹提示还是走 redirect" 是如何决定的

当前的分流开关是 `$request->expectsJson()`：

- **非 JSON（常规表单提交）**：一律 `redirect()->back()` + `Session::flash(...)`，由 Blade 在下次渲染时读 `flash_message` / `flash_message_warning` 显示横幅。这是传统 Web 表单的最佳实践。
- **JSON（AJAX / SPA）**：一律返回 JSON `{ message }`，HTTP 状态码由业务决定。前端按状态码走 `then`/`catch`，分别触发成功/失败 toast。

如果没有 result 对象：

- 控制器只知道 "成功/失败"，就无法在 JSON 分支里返回 400 vs 500；
- 前端只能根据 "成功/失败" 走一条路径，无法在表单里给出字段级提示。

换句话说，**result 对象让控制器能把"业务失败"和"系统失败"区分开**，进而让前端能把"可恢复的用户错误"和"不可恢复的服务器错误"区分开——前者留在当前页给提示，后者才考虑走 redirect 或跳转错误页。

---

## 小结

- `updateOverall` 是写命令，`businessHours/dateFormats` 是读查询；让它们共用响应形态会混淆 CQS 边界，引入双写源和缓存混乱。
- 日期格式缓存不刷新会造成"显示正确但语义错误"的跨层、跨语言偏差，比显式报错更难被自动化与人工捕获。
- 返回 result 对象而不是布尔值，让控制器能按业务语义选择 HTTP 状态与 flash key，让前端能按状态码选择"字段级提示 / 通用 toast / redirect"，是保持"后端业务语义 → 前端 UX 行为"这条链路不丢失的关键。
