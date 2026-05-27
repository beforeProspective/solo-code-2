# flatnotes 路径前缀适配机制分析

本文档围绕路径前缀（`FLATNOTES_PATH_PREFIX`）在后端启动阶段如何修改前端打包产物，以及前端路由与后端静态文件服务之间的协同解析展开。涉及的核心文件包括：

- 后端注入： [server/helpers.py](file:///e:/solo-code-2/flatnotes/server/helpers.py#L63-L76) 中的 `replace_base_href`
- 后端装配： [server/main.py](file:///e:/solo-code-2/flatnotes/server/main.py#L23-L27) 与 [server/main.py#L261-L266](file:///e:/solo-code-2/flatnotes/server/main.py#L261-L266)
- 配置加载： [server/global_config.py](file:///e:/solo-code-2/flatnotes/server/global_config.py#L93-L102) 的 `_load_path_prefix`
- 前端模板： [client/index.html](file:///e:/solo-code-2/flatnotes/client/index.html#L11) 中的 `<base href="/" />`
- 前端路由： [client/router.js](file:///e:/solo-code-2/flatnotes/client/router.js#L7-L8) 的 `createWebHistory("")`
- 前端请求： [client/api.js](file:///e:/solo-code-2/flatnotes/client/api.js#L49) 中的相对 URL `api/config`
- 打包配置： [vite.config.js](file:///e:/solo-code-2/flatnotes/vite.config.js#L6-L9) 的 `base: ""`

---

## 1. `replace_base_href` 通过正则表达式将 `FLATNOTES_PATH_PREFIX` 注入前端打包模板

### 1.1 调用链路

在 FastAPI 服务初始化时，[server/main.py#L17-L27](file:///e:/solo-code-2/flatnotes/server/main.py#L17-L27) 的执行顺序保证了：

1. `global_config = GlobalConfig()` 读取环境变量 `FLATNOTES_PATH_PREFIX`（见 [global_config.py#L93-L102](file:///e:/solo-code-2/flatnotes/server/global_config.py#L93-L102)），并校验其必须以 `/` 开头且不以 `/` 结尾，未设置则返回空字符串 `""`。
2. `replace_base_href("client/dist/index.html", global_config.path_prefix)` 在应用**进程启动阶段**（而非请求阶段）直接改写前端打包产物的 HTML。

这是一次**同步的文件磁盘写操作**：只有前端构建产物 `client/dist/index.html` 存在时才能工作；若 Vite 未构建，启动会因 `FileNotFoundError` 失败（属于预期外场景，没有额外保护）。

### 1.2 正则表达式解析

`replace_base_href` 的核心代码位于 [helpers.py#L63-L76](file:///e:/solo-code-2/flatnotes/server/helpers.py#L63-L76)：

```python
def replace_base_href(html_file, path_prefix):
    base_path = path_prefix + "/"
    with open(html_file, "r", encoding="utf-8") as f:
        html = f.read()
    pattern = r'(<base\s+href=")[^"]*(")'
    replacement = r"\1" + base_path + r"\2"
    updated_html = re.sub(pattern, replacement, html, flags=re.IGNORECASE)
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(updated_html)
```

- **输入规范化**：`base_path = path_prefix + "/"`。因为 `_load_path_prefix` 已保证路径**不以 `/` 结尾**，所以这里的拼接既保证了空路径时得到 `"/"`（根路径语义正确），也保证了前缀 `/notes` 时得到 `"/notes/"`（符合 HTML `<base>` 规范：`href` 必须是一个"目录"，即结尾带 `/`）。
- **正则模式**：`r'(<base\s+href=")[^"]*(")'`
  - 第一捕获组 `(<base\s+href=")`：匹配字面量 `<base`、至少一个空白、字面量 `href="`，保留作为替换前缀。
  - `[^"]*`：匹配 href 属性当前值（任意数量的非双引号字符），这部分会被丢弃。
  - 第二捕获组 `(")`：匹配闭合的双引号，保留作为替换后缀。
  - `flags=re.IGNORECASE`：允许 `BASE`、`Base` 等写法，增加容错。
- **替换字符串**：`r"\1" + base_path + r"\2"`。`\1` / `\2` 为反向引用，分别对应两个捕获组，从而形成 `<base href=".../">`。
- **结果**：Vite 打包后的 `dist/index.html` 中原有的 `<base href="/" />` 被改写为 `<base href="${path_prefix}/" />`，例如：
  - 默认（未设置前缀）：`<base href="/" />` → `<base href="/" />`（保持不变）。
  - `FLATNOTES_PATH_PREFIX=/notes`：`<base href="/" />` → `<base href="/notes/" />`。

### 1.3 为何必须在进程启动时改 HTML

`client/index.html` 模板本身写死了 `<base href="/" />`，而 Vite `base: ""` 意味着构建产物中的静态资源引用（`assets/*.js`、`style.css` 等）是**相对 URL**。它们在浏览器中解析时以当前 `<base>` 为基准，所以必须在服务端**首次响应 HTML 之前**就将 base 标签对齐真实的挂载路径。这是 flatnotes 选择"启动时磁盘改写 + 运行时静态挂载"方案的关键前提。

---

## 2. Vue Router 通过 `createWebHistory` + `<base>` 协同解析静态 API 与动态路由跳转

### 2.1 浏览器层：`<base>` 的解析规则

HTML `<base href="...">` 会成为整页所有**相对 URL**（无协议/主机的 URL）解析时的基准。典型影响：

- 静态资源：`<link href="style.css">` → 实际解析为 `${base}style.css`。
- 脚本入口：`<script src="index.js">` → 实际解析为 `${base}index.js`。
- XHR/fetch：`axios.get("api/config")` → 实际请求 `${base}api/config`。

这正是 flatnotes 将 API 请求 URL 全部写成**相对路径**（见 [api.js](file:///e:/solo-code-2/flatnotes/client/api.js#L49) `api.get("api/config")` 等）的原因——无需在前端代码中显式拼接前缀，浏览器按 base 自动补全。

### 2.2 Vue Router 层：`createWebHistory("")` 与 base 的关系

[router.js#L7-L8](file:///e:/solo-code-2/flatnotes/client/router.js#L7-L8)：

```js
const router = createRouter({
  history: createWebHistory(""),
  routes: [...]
});
```

- `createWebHistory(base?)` 的 `base` 参数会被拼接到所有路由的内部路径计算中。
- 这里传入的是空字符串 `""`，等价于 "使用当前文档 URL 的路径部分"，并进一步让 vue-router 读取 HTML `<base>` 作为实际基准。
- 运行时，`router.push({ name: "login" })` 生成的浏览器 `History.pushState` 路径为 `${base}login`，例如：
  - 默认前缀：`/login`
  - 前缀 `/notes`：`/notes/login`

配合 [main.py#L31-L39](file:///e:/solo-code-2/flatnotes/server/main.py#L31-L39) 的根路由定义：

```python
@router.get("/", include_in_schema=False)
@router.get("/login", ...)
@router.get("/search", ...)
@router.get("/new", ...)
@router.get("/note/{title}", ...)
def root(title: str = ""):
    with open("client/dist/index.html", "r", encoding="utf-8") as f:
        html = f.read()
    return HTMLResponse(content=html)
```

所有前端路由匹配到的 `/login`、`/search`、`/note/:title` 都被后端原样返回 `index.html`（SPA 入口），由于 router 通过 `include_router(router, prefix=global_config.path_prefix)` 挂载（[main.py#L261](file:///e:/solo-code-2/flatnotes/server/main.py#L261)），这些页面路由天然具备前缀，例如 `/notes/login`、`/notes/note/xxx`。

### 2.3 静态资源与 API 请求的统一解析

- **静态资源**：`client/dist` 目录通过 `app.mount(global_config.path_prefix, StaticFiles(directory="client/dist"), name="dist")`（[main.py#L262-L266](file:///e:/solo-code-2/flatnotes/server/main.py#L262-L266)）挂载。当浏览器请求 `${prefix}/assets/index-xxxxx.js` 时，Starlette 的 `StaticFiles` 从 `client/dist/assets/` 读取对应文件。
- **API 请求**：Axios 发送的相对路径 `api/config` 被浏览器解析为 `${prefix}/api/config`，经由 `include_router(router, prefix=...)` 精准命中 FastAPI 路由，而不会落到静态文件处理。
- **路由跳转**：`router.push("/note/Hello")` 调用 `history.pushState(null, "", "/notes/note/Hello")`；浏览器不会发起网络请求，仅更新地址栏；下次刷新时，请求 URL `/notes/note/Hello` 命中 `@router.get("/note/{title}")`，后端返回 `index.html`，前端再根据当前路径 `"/note/Hello"` 完成 SPA 路由渲染。

### 2.4 与 Vite `base` 的关系

[vite.config.js#L6-L9](file:///e:/solo-code-2/flatnotes/vite.config.js#L6-L9)：

```js
export default defineConfig({
  plugins: [vue()],
  root: "client",
  base: "",
  ...
});
```

`base: ""` 让 Vite 产出的资源 URL 全部以相对形式写入 `dist/index.html`，配合后端启动时改写的 `<base>` 一起工作。若把 `base` 写死为 `"/notes/"`，则无法在启动时动态适配不同部署路径；完全依赖运行时环境变量的代价就是必须有 `replace_base_href` 这一层"补丁"。

---

## 3. 前缀配置错误导致 `app.mount` 静态文件服务错误拦截时的浏览器侧表现

### 3.1 错误场景与根本原因

典型的前缀配置错误会使"前端路由 / API 请求 / 静态资源"三者的基准路径不再对齐：

- 场景 A：环境变量 `FLATNOTES_PATH_PREFIX=/notes` 已设置，但 `replace_base_href` 因为 `client/dist/index.html` 缺失或未运行而未改写，`index.html` 仍保留 `<base href="/" />`。
- 场景 B：前端路径前缀未设置（base 保持 `/`），但后端却以 `include_router(router, prefix="/notes")` + `app.mount("/notes", ...)` 挂载。
- 场景 C：`FLATNOTES_PATH_PREFIX` 不合法（例如 `notes/` 不以 `/` 开头，或 `/notes/` 以 `/` 结尾），`_load_path_prefix`（[global_config.py#L93-L102](file:///e:/solo-code-2/flatnotes/server/global_config.py#L93-L102)）会直接 `sys.exit(1)`，服务根本起不来——这是启动强校验的保护机制。

**错误拦截的核心原因**：`app.mount(global_config.path_prefix, StaticFiles(...))` 的执行顺序晚于 `app.include_router(...)`，但 Starlette 的 `mount` 是**前缀匹配**，当请求 URL 的路径以该前缀开头时，会直接交给 `StaticFiles` 处理。一旦前端计算出来的 API/路由 URL 恰好落入该前缀范围但后端路由并未正确注册（或反之），请求就会被 `StaticFiles` 当成静态文件去查找，最终 404。

### 3.2 浏览器网络层表现

1. **API 请求返回 HTML 或 404**：
   - 浏览器发出 `GET /api/config`（错误前缀下可能变成 `/notes/api/config`），若后端只有 `prefix=""`，该路径既没命中 API 路由，也没命中静态目录（`client/dist` 下没有 `notes/api/config`），`StaticFiles` 返回 `404 Not Found`，响应体通常是 Starlette 的 HTML 错误页。
   - 因为前端 axios 预期的是 JSON，`response.data` 变成 HTML 字符串，随后 `response.data.xxx` 读取属性会是 `undefined`，但真正让前端表现异常的是 **401/业务 JSON 解析失败**。
2. **静态资源 404 导致白屏**：
   - 若 base 保持 `/` 而静态资源被挂在 `/notes/`，浏览器会请求 `/assets/index-xxxxx.js`，这一路径对 `StaticFiles(directory="client/dist")` 而言根本不存在，返回 404；`<script>` 无法执行，`#app` 节点永远不会被 Vue 挂载，页面表现为**完全白屏**。
3. **路由跳转刷新后 404**：
   - 在 `/notes/note/Hello` 页面直接按刷新，浏览器向服务器请求该 URL。如果后端路由前缀为空，这个路径既没匹配到 `/note/{title}`（因为路径是 `/notes/note/...`），也没有匹配到静态文件（`client/dist/notes/note/Hello` 不存在），返回 404 HTML。

### 3.3 浏览器 DOM 渲染层表现

1. **白屏（White Screen）**：最常见、最直观的表现。根因是入口脚本或样式表 404，Vue 应用初始化中断，`<div id="app"></div>` 保持空状态。
2. **控制台 `Failed to fetch dynamically imported module` / `Loading chunk failed`**：如果主入口成功加载但某个路由的动态 `import()`（[router.js](file:///e:/solo-code-2/flatnotes/client/router.js#L13-L32) 中 `() => import("./views/Home.vue")` 等）因为 base 计算错误而请求到错误的 chunk URL，浏览器会抛上述错误。
3. **`API 响应不是 JSON` → `authCheck` 抛错**：`router.beforeEach`（[router.js#L46-L63](file:///e:/solo-code-2/flatnotes/client/router.js#L46-L63)）会调用 `authCheck()`。如果 `/api/auth-check` 返回 404 HTML 而非 `"OK"`，`error.response.status` 不是 401，进入 `catch` 但不跳转，`authChecked` 被置为 `true`，后续路由守卫不再检查——页面继续尝试渲染但因业务数据缺失而呈现**空内容**。
4. **重复跳转到 `/login`**：若 API 恰好返回 401（例如因为前缀错导致鉴权头未带或命中了不同的服务），`apiErrorHandler`（[api.js#L28-L45](file:///e:/solo-code-2/flatnotes/client/api.js#L28-L45)）会 `router.push({ name: "login" })`，由于 `authChecked` 为 `true` 后守卫不再重新校验，可能出现"登录后仍被反复踢回"的死循环。
5. **图标/样式缺失**：`<link href="assets/favicon-32x32.png">`、`<link href="style.css">` 等相对 URL 在 base 错误时全部解析到错误路径，页面失去样式与图标，DOM 结构存在但视觉错乱。

### 3.4 排查建议

- 打开浏览器 DevTools → Network 面板，确认：
  - 入口 `index.html` 的 `<base href>` 是否与部署路径一致。
  - `api/config`、`api/auth-check` 等请求是否返回预期 JSON（状态码 200 + `Content-Type: application/json`）。
  - 静态资源 `assets/*.js`、`style.css` 是否 200。
- 打开后端日志（stdout），查看 `StaticFiles` 没有命中时 Starlette 的 `404 Not Found`，并核对是否命中了挂载前缀。
- 确认健康检查命令 `healthcheck.sh` 是否仍通过，可作为"前缀至少在服务端生效"的快速校验。

---

## 总结

- **后端注入**：`replace_base_href` 在 FastAPI 启动时用正则 `(<base\s+href=")[^"]*(")` 捕获并替换 `dist/index.html` 的 base 标签，使浏览器层的 URL 基准与 `FLATNOTES_PATH_PREFIX` 对齐。
- **前端协同**：Vite 以 `base: ""` 产出相对 URL，vue-router 以 `createWebHistory("")` 读取 base 作为路由基准，后端 `include_router(..., prefix=...)` + `app.mount(prefix, StaticFiles(...))` 双重挂载保证路由、API、静态资源在同一前缀下解析一致。
- **错误表现**：前缀配置不一致时，浏览器会出现静态资源 404 导致白屏、API 返回 HTML 404 导致业务 JSON 解析失败、路由刷新后 404，以及控制台动态 chunk 加载错误等症状。启动时 `_load_path_prefix` 的强校验是第一道防线，但"已启动后外部部署路径变更"或"忘记执行 Vite 构建"仍是常见的运行时陷阱。
