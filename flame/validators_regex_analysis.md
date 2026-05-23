# validators.ts 正则表达式安全性分析与修正

## 1. 正则表达式分析

### 1.1 相关代码定位

文件：[validators.ts](file:///e:/solo-code-2/flame/client/src/utility/validators.ts#L15-L25)

```ts
export const isImage = (data: string): boolean => {
  const regex = /.(jpeg|jpg|png|ico)$/i;
  return regex.test(data);
};

export const isSvg = (data: string): boolean => {
  const regex = /.(svg)$/i;
  return regex.test(data);
};
```

### 1.2 `.` 字符在正则表达式中的特殊含义

在 JavaScript 正则表达式（以及绝大多数正则引擎）中：

- **`.`**（未转义的点号）是一个**通配符**，在默认模式下表示「匹配除换行符（`\n`、`\r`）之外的任意单个字符」。
- 要让 `.` 匹配字面意义上的点号，必须对其进行转义：`\.`（或放入字符组中：`[.]`）。

因此，`/.(jpeg|jpg|png|ico)$/i` 与 `/.(svg)$/i` 中的 `.` **并非字面量点号，而是"任意单个字符"的占位符**。

### 1.3 绕过校验的示例

由于 `.` 是通配符，以下字符串都会被错误地视为合法：

| 输入 | 被匹配的部分 | 说明 |
| --- | --- | --- |
| `testjpeg` | `tjpeg` | `t` 被 `.` 当作任意字符，后缀被识别为 `jpeg` |
| `hellopng` | `opng` | `o` 被 `.` 当作任意字符，后缀被识别为 `png` |
| `logosvg` | `gsvg` | `g` 被 `.` 当作任意字符，后缀被识别为 `svg` |
| `evil/svg` | `/svg` | 路径分隔符 `/` 也被 `.` 视为任意字符，可伪造路径 |
| `testXjpg`（`X` 为任意字符） | `Xjpg` | 任意字符都能冒充点号 |

除此之外，由于缺少前缀锚（未使用 `^`），该正则只要求字符串**末尾**符合条件，这意味着：

- `/etc/passwd.jpg` 这样的**绝对路径**也会通过。
- `script.exe.jpg`、`shell.php.jpg` 等**双扩展名**在不考虑其他过滤时也会通过（这对 MIME 检查或服务端二次解析是潜在的风险点）。

> 总结：未转义的 `.` 使得校验退化为"以 `jpeg|jpg|png|ico|svg` 结尾、且前面至少再有一个字符"，**完全无法保证文件真正拥有合法扩展名**。

---

## 2. 潜在安全威胁分析

### 2.1 绕过前端校验能带来的威胁

前端正则校验的作用本质上是**用户体验层**的"第一关"，它可以：

1. **提前提示用户**（友好提示）。
2. **降低服务器被无效请求轰炸的概率**。

但它**不是安全边界**——客户端校验可以被轻易绕过：
- 使用浏览器 DevTools 直接修改请求。
- 使用 `curl`、`Postman` 或自写脚本直接向接口发送 `multipart/form-data` 请求。
- 篡改 `Content-Type` 和 `filename`，上传任意内容。

攻击者可以：

| 攻击场景 | 具体行为 |
| --- | --- |
| **伪造扩展名** | 上传 `shell.php`，但将 `filename` 设为 `shell.jpg` 或直接留空。 |
| **MIME 欺骗** | 将 `Content-Type` 手工设置为 `image/jpeg`，内容却是 `text/html` 或可执行脚本。 |
| **SVG XSS / XML 注入** | 上传包含 `<script>`、外部实体 (`<!DOCTYPE>` + XXE)、`onload=...` 等的恶意 SVG。 |
| **路径遍历** | 通过 `filename: "../../evil.jpg"` 尝试写入非预期目录。 |
| **多后缀文件** | 上传 `evil.php.jpg`，若下游使用正则/字符串匹配、或 Apache/Nginx 配置不当，可能被当作脚本执行。 |
| **上传存储型 WebShell** | 若后端解析规则有漏洞（如扩展名白名单不完善、`AllowOverride`、`AddType` 配置等），上传的脚本可以被直接访问并执行。 |

### 2.2 结合后端 `multer` 的防御机制分析

后端中间件位于 [middleware/multer.js](file:///e:/solo-code-2/flame/middleware/multer.js)：

```js
const supportedTypes = ['jpg', 'jpeg', 'png', 'svg', 'svg+xml', 'x-icon'];

const fileFilter = (req, file, cb) => {
  if (supportedTypes.includes(file.mimetype.split('/')[1])) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ storage, fileFilter });
module.exports = upload.single('icon');
```

**已具备的防线**：

1. **存储位置固定**：`destination: './data/uploads'`，避免用户自定义路径（但需确认目录不可被当作静态资源或脚本执行）。
2. **文件名加时间戳前缀**：`Date.now() + '--' + file.originalname`，降低二次上传被 URL 直接命中的概率。
3. **MIME 白名单**：仅接受 `image/jpeg`、`image/png`、`image/svg+xml`、`image/x-icon`。

**仍然存在的薄弱点**（值得进一步加固）：

- `file.originalname` **直接拼接到磁盘文件名**，若该字段包含 `..`、`/`、`\`、控制字符等，在 Windows 下尤其容易出现路径问题或文件名冲突。
- `file.mimetype` 来自**客户端请求头**，可以被伪造，不能作为真实类型的唯一依据。
- 未对文件**魔数（Magic Number / 文件签名）**进行校验，无法真正识别文件内容。
- `svg` 文件即使通过 MIME 检查，仍可能包含恶意脚本（XSS/XXE）。
- 未限制文件大小（`limits`），可能导致**拒绝服务**（上传超大文件占用磁盘/内存）。
- `data/uploads` 目录若被静态服务直接托管，攻击者构造的恶意 SVG 可通过 `<iframe>` 或 `<img>` 触发脚本执行（取决于 `Content-Disposition` 和 CSP）。

---

## 3. 修正建议

### 3.1 修正后的前端正则

**核心目标**：

1. 将 `.` 正确识别为字面量：使用 `\.` 或 `[.]`。
2. 严格以指定后缀结尾：保留 `$`。
3. 建议增加前缀 `^`，避免被包含在更长的字符串中（例如路径遍历）。
4. 建议去除不必要的捕获组，改为非捕获组 `(?:...)`，同时明确多后缀匹配。

推荐实现：

```ts
export const isImage = (data: string): boolean => {
  // 仅匹配以 .jpeg / .jpg / .png / .ico 结尾的文件名，严格要求存在字面量点号
  const regex = /\.(jpeg|jpg|png|ico)$/i;
  return regex.test(data);
};

export const isSvg = (data: string): boolean => {
  // 仅匹配以 .svg 结尾的文件名
  const regex = /\.svg$/i;
  return regex.test(data);
};
```

若希望进一步收紧（禁止路径穿越、只允许安全字符的文件名），可使用：

```ts
export const isImage = (data: string): boolean => {
  // 仅允许 "安全字符 + 点号 + 合法后缀" 结尾
  const regex = /^[a-zA-Z0-9_\-]+\.(jpeg|jpg|png|ico)$/i;
  return regex.test(data);
};

export const isSvg = (data: string): boolean => {
  const regex = /^[a-zA-Z0-9_\-]+\.svg$/i;
  return regex.test(data);
};
```

### 3.3 第二套"收紧方案"与参数兼容性分析

上一节中给出的"收紧方案"使用了 `^[a-zA-Z0-9_\-]+\.(jpeg|jpg|png|ico)$/i` 等带前缀锚的正则。结合 [AppCard.tsx](file:///e:/solo-code-2/flame/client/src/components/AppCard/AppCard.tsx#L21-L32) 与 [BookmarkCard.tsx](file:///e:/solo-code-2/flame/client/src/components/Bookmarks/BookmarkCard/BookmarkCard.tsx#L57-L69) 的实际调用方式——`icon` 字段既可能是本地上传文件名（如 `logo.png`），也可能是完整 URL（如 `https://cdn.example.com/icons/icon.png?v=2`）或 CDN URL（带查询参数、端口、哈希）——这套正则的**兼容性有明显不足**：

1. **不支持 URL 协议与主机段**：`^[a-zA-Z0-9_\-]+` 从字符串开头就要求只能是字母数字下划线横杠，任何形如 `https://...`、`http://...`、`//cdn...` 的 URL 都会被拒。
2. **不支持路径层级**：`/uploads/icons/my-icon.png` 含有 `/`，同样会被拒绝。
3. **不支持查询参数与哈希**：`icon.png?x=1`、`icon.png#v2` 等常见带查询参数或片段的 URL 因为 `$` 锚定了后缀，会直接失败。
4. **不支持点号分隔的多级文件名**：`my.app.icon.png` 中 `my.app.icon` 因含 `.`，会被 `^[a-zA-Z0-9_\-]+` 拒掉。

| 输入 | 是否合法业务场景 | 收紧方案结果 | 说明 |
| --- | --- | --- | --- |
| `logo.png` | 本地文件名 | ✅ 通过 | 正常 |
| `my.app.icon.png` | 多级文件名 | ❌ 拒绝 | 含 `.` |
| `/uploads/icon.png` | 服务器相对路径 | ❌ 拒绝 | 含 `/` |
| `https://cdn.example.com/i.png` | 外链图片 URL | ❌ 拒绝 | 含 `:`、`.example.com` 等 |
| `https://i.example.com/pic.jpg?v=1` | 带查询参数的 CDN URL | ❌ 拒绝 | 含 `?`、`=`、`&` 等 |
| `https://i.example.com/pic.jpg#size` | 带哈希的 URL | ❌ 拒绝 | 含 `#` |

> 结论：若**不加区分地**对"文件名"和"URL"两种输入使用带 `^` 的收紧正则，会把大量合法的外链图片/查询参数 URL 误判为非法，破坏 [AppCard.tsx](file:///e:/solo-code-2/flame/client/src/components/AppCard/AppCard.tsx#L21-L24) 中"若 `icon` 是 URL 则直接作为 `<img src>`"的既有逻辑。

### 3.4 兼容两种输入的安全方案

核心思想：**把"安全校验"从单一正则中解耦，先判断输入的语义，再选择对应的校验策略**。

- 若输入是 URL（用现成的 `isUrl` 或 `URL` 构造函数判定）：允许协议 + 主机 + 路径 + 查询参数 + 哈希，但要求**路径部分**以合法后缀结尾（查询参数与哈希不参与扩展名匹配）。
- 若输入不是 URL（视为本地文件名）：使用较严格的文件名正则（禁止 `..`、`/`、`\`、控制字符），避免路径穿越与特殊字符。

推荐实现：

```ts
const IMAGE_EXTS = /\.(jpeg|jpg|png|ico)$/i;
const SVG_EXTS = /\.svg$/i;

// 仅允许安全文件名：字母、数字、下划线、横杠、点号；禁止以点开头、禁止连续点
const SAFE_FILENAME = /^[a-zA-Z0-9_\-]+(\.[a-zA-Z0-9_\-]+)*\.(jpeg|jpg|png|ico|svg)$/i;

const stripQueryAndHash = (s: string) => s.replace(/[?#].*$/, '');

const isSafeLocalFile = (data: string, ext: RegExp): boolean => {
  // 先做字符白名单，再做后缀匹配
  return SAFE_FILENAME.test(data) && ext.test(data);
};

const isUrlWithSafeExtension = (data: string, ext: RegExp): boolean => {
  try {
    const u = new URL(data);
    // 仅允许 http/https 协议，避免 javascript:/data: 等危险协议
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    // 去掉查询参数与哈希后再匹配后缀
    return ext.test(stripQueryAndHash(u.pathname));
  } catch {
    return false;
  }
};

export const isImage = (data: string): boolean => {
  if (typeof data !== 'string' || !data) return false;
  if (/^https?:\/\//i.test(data)) return isUrlWithSafeExtension(data, IMAGE_EXTS);
  return isSafeLocalFile(data, IMAGE_EXTS);
};

export const isSvg = (data: string): boolean => {
  if (typeof data !== 'string' || !data) return false;
  if (/^https?:\/\//i.test(data)) return isUrlWithSafeExtension(data, SVG_EXTS);
  return isSafeLocalFile(data, SVG_EXTS);
};
```

这套方案的优点：

1. **点号作为字面量**：后缀正则均使用 `\.`，消除原先通配符漏洞。
2. **保留外链能力**：URL 分支允许 `?`、`#`、`.`、`/` 等 URL 合法字符，仅对 `pathname` 做后缀匹配。
3. **协议白名单**：显式只允许 `http:` / `https:`，从前端就拒绝 `javascript:`、`data:`、`file:` 等危险协议，避免 [BookmarkCard.tsx](file:///e:/solo-code-2/flame/client/src/components/Bookmarks/BookmarkCard/BookmarkCard.tsx#L57-L69) 将危险 URL 渲染进 `<img src>` 造成的 XSS 风险。
4. **本地文件严格校验**：`SAFE_FILENAME` 禁止路径分隔符、禁止连续点、禁止控制字符，与后端 `multer` 存储文件名净化形成纵深防御。
5. **与现有调用点兼容**：`isUrl` 与 `isImage/isSvg` 协作时，URL 分支仍能返回正确结果，不破坏 `AppCard`、`BookmarkCard` 中的外链图片渲染逻辑。

### 3.5 后端（multer）加固建议（与前端正则配合的纵深防御）

1. **增加 `limits` 限制**：

```js
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 /* 5MB */, files: 1 },
});
```

2. **校验 `originalname` 合法性**，去除目录分隔符与控制字符：

```js
const path = require('path');
filename: (req, file, cb) => {
  const safeName = path.basename(file.originalname).replace(/[^\w.\-]/g, '_');
  cb(null, Date.now() + '--' + safeName);
},
```

3. **MIME 与扩展名交叉校验**，必要时使用魔数检测（如 `file-type` 包）：

```js
const FileType = require('file-type');
// 在保存后或通过 stream 检测真实内容类型，与白名单对比
```

4. **SVG 单独处理**：使用 `svg-sanitizer`、`DOMPurify` 等库过滤脚本、外部实体、危险属性。

5. **响应头加固**：
   - 访问上传目录时返回 `Content-Disposition: attachment`（避免浏览器内联渲染）。
   - 配置严格的 `Content-Security-Policy`（CSP），阻止 SVG 中内联脚本执行。

6. **不要将上传目录作为可执行脚本目录**，确保 Web 服务器对该目录禁用 PHP/ASP/ASPX 等解析。

7. **服务端再次做扩展名白名单检查**（不要仅依赖 MIME），例如使用 `path.extname()` 与白名单比较。

---

## 4. 小结

- `isImage` 与 `isSvg` 中 `.` 未转义，导致通配符语义，**任何以 `jpeg|jpg|png|ico|svg` 结尾且前面至少有一个字符的字符串**都能通过校验，例如 `testjpeg`、`logosvg`。
- 前端校验只能作为体验优化，真正的安全防线在后端：MIME 白名单 + 扩展名白名单 + 文件大小限制 + 文件名净化 + 魔数检测 + SVG 清洗 + 响应头加固。
- 建议将两处正则修正为 `\.(jpeg|jpg|png|ico)$/i` 与 `/\.svg$/i`，并与后端的 `multer` 加固策略形成纵深防御。
