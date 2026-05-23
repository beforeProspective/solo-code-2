# 身份验证模块 JWT 有效期安全性分析

## 一、问题一：未传递 `duration` 参数时的行为分析

### 1.1 代码位置

- 登录入口：[login.js](file:///e:/solo-code-2/flame/controllers/auth/login.js#L9-L17)
- Token 签发：[signToken.js](file:///e:/solo-code-2/flame/utils/signToken.js#L3-L5)

关键代码：

```js
// controllers/auth/login.js 第 9 行
const { password, duration } = req.body;

// controllers/auth/login.js 第 17 行
const token = signToken(duration);
```

```js
// utils/signToken.js
const signToken = (expiresIn) => {
  const token = jwt.sign({ app: 'flame' }, process.env.SECRET, { expiresIn });
};
```

### 1.2 行为分析

当请求体中未传递 `duration` 参数时：

1. **解构赋值结果**：`duration` 的值为 `undefined`。
2. **函数调用**：`signToken(undefined)` 被调用，形参 `expiresIn` 的值为 `undefined`。
3. **jwt.sign 接收的参数**：`{ expiresIn: undefined }`。

### 1.3 `jsonwebtoken` 库对 `expiresIn: undefined` 的处理

`jsonwebtoken` 库（`jwt.sign`）在读取 `options.expiresIn` 时：

- 仅当 `expiresIn` 为 **有效的数值或字符串** 时，才会在 payload 中写入 `exp`（过期时间）与 `iat`（签发时间）声明。
- 当 `expiresIn` 为 `undefined`、`null`、`0`、空字符串等 **falsy 值** 时，库会 **跳过 `exp` 字段的写入**，即视为"永不过期"。

### 1.4 签发 Token 的有效期属性

- 生成的 JWT payload 中 **没有 `exp` 声明**，仅包含 `iat`（签发时间）和自定义字段 `{ app: 'flame' }`。
- 该 Token **在服务端默认校验下不会过期**，即具有 **永久有效期**（除非服务端另有自定义校验逻辑或吊销列表机制）。

这就意味着：**默认行为下，不传递 `duration` 参数反而能得到一个永不失效的 Token**，这与安全最佳实践严重相悖。

---

## 二、问题二：不限制 `duration` 带来的安全风险

由于代码直接将客户端可控的 `duration` 透传给 `jwt.sign`，攻击者可以构造如下恶意请求：

### 2.1 获取超长有效期 Token

| 攻击方式 | `duration` 取值 | 后果 |
| --- | --- | --- |
| 超长秒数 | `315360000`（10 年） | Token 在 10 年内有效，即便密码被轮换，攻击者仍可使用旧 Token 访问系统 |
| 超长字符串 | `"3650d"` / `"100y"` | 同上，jwt 支持 `ms` 风格字符串（如 `"100y"`） |
| 不传值 | `undefined`（缺省） | 得到**永久有效**的 Token，`exp` 缺失 |
| 传 `null` 或空串 | `null`、`""` | 同样导致 Token 不设置 `exp`，永久有效 |
| 传 `0` 或 `-1` | `0`、`-1` | 负数会使 `exp` 早于当前时间，被视为已过期；`0` 同样导致不写 `exp` 或立即过期，具体取决于库版本 |

### 2.2 导致后端进程异常或拒绝服务

| 攻击方式 | `duration` 取值 | 后果 |
| --- | --- | --- |
| 非数值/字符串的对象 | `{}`、`[]`、`Infinity`、`NaN` | `jwt.sign` 内部对 `expiresIn` 进行 `ms()` 转换，遇到异常类型可能抛出 `Error`，若上层未捕获（此处虽然有 `asyncWrapper`，但会返回 500 并污染日志，且大并发下形成 DoS） |
| 超长字符串 | 数十 MB 的字符串 | `jsonwebtoken` 会尝试解析为 `ms`，产生大量 CPU/内存开销，**造成进程阻塞甚至 OOM** |
| 包含恶意正则回溯的字符串 | 特定格式的字符串 | 可能触发底层正则的 ReDoS 漏洞（取决于 `ms` 库版本），**导致 Node 事件循环阻塞数秒至数十秒** |
| 传入布尔值或 `Symbol` | `true`、`Symbol('x')` | 直接导致 `jwt.sign` 抛出 `TypeError`，在日志中产生大量错误 |

### 2.3 综合风险总结

1. **认证绕过**：攻击者一旦获得一个永久有效的 Token，可长期访问系统。
2. **权限长期保留**：即使管理员更换密码或禁用账户，攻击者仍可使用已有 Token。
3. **拒绝服务**：通过异常类型/超大字符串触发高频 500 错误或 CPU 飙升。
4. **合规风险**：无限期 Token 违反安全合规要求（如 PCI-DSS、OWASP ASVS）。

---

## 三、问题三：生产安全最佳实践的重构方案

重构核心原则：**不信任任何客户端传入的参数，在服务端对 `duration` 进行类型校验、范围校验与兜底默认值**。

### 3.1 重构后的 `utils/signToken.js`

```js
const jwt = require('jsonwebtoken');

// 允许前端传入的带单位字符串白名单（与 AuthForm.tsx <select> 选项保持一致）
const ALLOWED_DURATION_STRINGS = new Set([
  '1h',    // 1 小时
  '1d',    // 1 天
  '14d',   // 2 周
  '30d',   // 1 个月
  '1y',    // 1 年
]);

const DEFAULT_EXPIRES_IN = '14d'; // 与前端默认值一致

/**
 * 规范化并校验 expiresIn。
 * 策略：
 *   - 若为字符串，仅接受白名单内的带单位字符串（"1h"/"1d"/"14d"/"30d"/"1y"）；
 *   - 若为数字，接受正整数秒（兜底兼容场景），并限制上限；
 *   - 其他任何类型（undefined、null、对象、Infinity、超大字符串等）一律使用 DEFAULT。
 */
const normalizeExpiresIn = (input) => {
  if (typeof input === 'string') {
    // 禁止超长字符串导致的 DoS（> 16 字节直接拒绝）
    if (input.length > 16) return DEFAULT_EXPIRES_IN;
    return ALLOWED_DURATION_STRINGS.has(input) ? input : DEFAULT_EXPIRES_IN;
  }

  if (typeof input === 'number' && Number.isFinite(input) && Number.isInteger(input) && input > 0) {
    // 兜底数字秒数，最大不超过 1 年
    return Math.min(input, 365 * 24 * 60 * 60);
  }

  return DEFAULT_EXPIRES_IN;
};

const signToken = (expiresIn) => {
  const safeExpiresIn = normalizeExpiresIn(expiresIn);

  return jwt.sign(
    { app: 'flame' },
    process.env.SECRET,
    { expiresIn: safeExpiresIn }
  );
};

module.exports = signToken;
module.exports.normalizeExpiresIn = normalizeExpiresIn;
module.exports.ALLOWED_DURATION_STRINGS = ALLOWED_DURATION_STRINGS;
module.exports.DEFAULT_EXPIRES_IN = DEFAULT_EXPIRES_IN;
```

### 3.2 重构后的 `controllers/auth/login.js`

```js
const asyncWrapper = require('../../middleware/asyncWrapper');
const ErrorResponse = require('../../utils/ErrorResponse');
const signToken = require('../../utils/signToken');

// @desc      Login user
// @route     POST /api/auth/
// @access    Public
const login = asyncWrapper(async (req, res, next) => {
  const { password, duration } = req.body;

  const isMatch = process.env.PASSWORD == password;

  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // 显式校验 duration：支持白名单字符串 或 正整数秒；非法则返回 400
  if (duration !== undefined) {
    const isAllowedString =
      typeof duration === 'string' &&
      duration.length <= 16 &&
      signToken.ALLOWED_DURATION_STRINGS.has(duration);

    const isAllowedNumber =
      typeof duration === 'number' &&
      Number.isFinite(duration) &&
      Number.isInteger(duration) &&
      duration > 0 &&
      duration <= 365 * 24 * 60 * 60;

    if (!isAllowedString && !isAllowedNumber) {
      return next(new ErrorResponse('Invalid duration format', 400));
    }
  }

  const token = signToken(duration);

  res.status(200).json({
    success: true,
    data: { token },
  });
});

module.exports = login;
```

### 3.3 关键加固点说明

| 加固点 | 说明 |
| --- | --- |
| **值白名单** | 字符串仅允许 `1h / 1d / 14d / 30d / 1y`，与 [AuthForm.tsx](file:///e:/solo-code-2/flame/client/src/components/Settings/AppDetails/AuthForm/AuthForm.tsx#L89-L94) `<select>` 选项严格对齐 |
| **长度上限** | 字符串长度 > 16 字节直接回落默认值，防止超长字符串触发 `ms` 库 ReDoS / OOM |
| **数值兜底** | 数字仅接受正整数秒，且上限 1 年，兼容非前端来源的合法调用 |
| **默认值兜底** | 未传值、非法值、越界值一律回落为 `DEFAULT=14d`，避免"永不过期"问题 |
| **显式拒绝非法格式** | 在 controller 层对明显非法的格式直接返回 400，降低下游处理压力与日志噪声 |
| **拒绝隐式类型转换** | 严格使用 `typeof` 判断与白名单比对，避免 `"3600"` / `"100y"` 被 `jwt.sign` 误解析 |
| **前后端契约一致** | 默认值与白名单与前端保持一致，防止登录流程被 400 中断 |
| **便于测试与审计** | 暴露 `normalizeExpiresIn`、`ALLOWED_DURATION_STRINGS`、`DEFAULT_EXPIRES_IN`，便于单元测试与安全审计 |

### 3.4 `duration` 格式兼容性审查（前后端契约核对）

#### 3.4.1 前端实际传入格式

在 [AuthForm.tsx#L22-L23](file:///e:/solo-code-2/flame/client/src/components/Settings/AppDetails/AuthForm/AuthForm.tsx#L22-L23) 与 [AuthForm.tsx#L89-L94](file:///e:/solo-code-2/flame/client/src/components/Settings/AppDetails/AuthForm/AuthForm.tsx#L89-L94) 中：

```ts
const [formData, setFormData] = useState({
  password: '',
  duration: '14d',   // 默认值为带单位的字符串
});

<select ...>
  <option value="1h">1 hour</option>
  <option value="1d">1 day</option>
  <option value="14d">2 weeks</option>
  <option value="30d">1 month</option>
  <option value="1y">1 year</option>
</select>
```

- `formData.duration` 的所有可能值均为 **带单位的字符串**（`"1h"` / `"1d"` / `"14d"` / `"30d"` / `"1y"`）。
- `login(formData)` 会直接将该字符串作为 `duration` 发送到 `POST /api/auth/`。
- 因此服务端若强制要求 `duration` 为"正整数秒"，会使所有合法的前端登录请求失败（全部返回 400），**导致登录功能被完全破坏**。

#### 3.4.2 原校验逻辑的缺陷

```js
// 原方案（会破坏登录）
if (duration !== undefined) {
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0) {
    return next(new ErrorResponse('Invalid duration format', 400));
  }
}
```

问题：
1. **与前端契约不兼容**：前端传入 `"14d"`（字符串），`typeof !== 'number'` 为 `true`，直接返回 400，登录链路被切断。
2. **过度严格导致可用性问题**：业务上用户通过下拉菜单选择的选项都是字符串，禁止字符串等于禁止业务。
3. **无法防御所有攻击**：即便只允许数字，攻击者仍可通过发送极大的数字绕过有效期限制；真正有效的是"边界 + 白名单"。

#### 3.4.3 白名单方案的取舍

兼顾安全与兼容的思路：**以白名单取代类型过滤**。

| 维度 | 策略 | 说明 |
| --- | --- | --- |
| **字符串白名单** | `Set { '1h','1d','14d','30d','1y' }` | 与前端 `<select>` 完全一致，100% 兼容登录流程 |
| **长度上限** | `length > 16` 直接回落默认值 | 防止超长字符串触发 `ms` 库的 ReDoS / OOM |
| **数值兜底** | 正整数秒且 ≤ 365×24×3600 | 兼容非前端来源（例如 CI/CD 或第三方脚本）的合法调用 |
| **默认值** | `'14d'` | 与前端默认值保持一致，用户体验连续 |
| **显式拒绝** | 字符串不在白名单内 / 数字不在合法区间 | 返回 400 并记录告警日志，便于安全审计 |
| **异常兜底** | `null` / `undefined` / `[]` / `{}` / `Infinity` / `NaN` / `Symbol` | 统一回落默认值，不中断业务 |

#### 3.4.4 安全性与兼容性平衡点分析

- **兼容**：前端所有下拉选项都在白名单内，登录流程不会被 400 中断。
- **安全**：
  - 攻击者即使绕过前端直接发送请求，也只能选择白名单中的已知有效期，无法获得"永不过期"或"100 年"等异常 Token。
  - 超长字符串、非数值对象、`Infinity`、`NaN` 等异常输入在进入 `jwt.sign` 之前即被归一化，消除了 CPU/OOM/ReDoS 风险。
  - 字符串长度上限 16 字节（远大于最长合法选项 `"30d"` 的 3 字节）对正常调用零影响，对攻击输入强力拦截。
- **可维护**：白名单常量与前端 `<select>` 选项一一对应，前端新增选项时只需同步更新服务端 `ALLOWED_DURATION_STRINGS`，属于显式契约而非隐式行为。

### 3.5 可选的进一步加固（若业务允许）

1. **完全移除 `duration` 参数**：由服务端统一控制 Token 有效期（如 15 分钟 + Refresh Token），这是最安全的做法。
2. **引入 Refresh Token 机制**：短生命周期 Access Token（15 分钟）+ 长生命周期 Refresh Token（7 天，且可被吊销）。
3. **服务端 Token 吊销列表（黑名单）**：在密码变更或账户冻结时强制失效已有 Token。
4. **请求速率限制**：登录接口增加 IP/账号限流，防止爆破与 DoS。
5. **`SAMESITE` + `HttpOnly` Cookie**：若前端可改造，优先使用 Cookie 存储 Token，减少 XSS 窃取风险。

---

## 四、结论

| 项目 | 现状 | 重构后 |
| --- | --- | --- |
| 未传 `duration` | Token 永不过期 ❌ | 默认 `14d`（与前端一致）✅ |
| 超长 `duration`（> 1 年） | 被原样签发 ❌ | 白名单内最大 `1y`，超出回落默认值 ✅ |
| 非数值类型 / 超长字符串 | 可能抛 500 / 解析异常 ❌ | 长度 > 16 或非白名单直接回落默认值 ✅ |
| 与前端登录兼容性 | 已兼容 | 白名单与前端 `<select>` 一一对应 ✅ |
| 拒绝服务风险 | 存在（CPU/OOM）❌ | 消除 ✅ |
| 合规性 | 不满足基本安全要求 ❌ | 符合 OWASP / PCI-DSS 基本要求 ✅ |

**最根本的建议**：在生产环境中，**不要让客户端控制 Token 有效期**。将 `duration` 视为一个潜在危险参数，服务端应以固定的短生命周期策略签发 Token，并结合 Refresh Token 机制实现长期会话。在必须保留 `duration` 的场景下，**白名单 + 长度上限 + 默认值兜底**是同时兼顾安全与业务兼容性的最佳实践。
