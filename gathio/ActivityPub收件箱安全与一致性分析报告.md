# ActivityPub 收件箱安全与一致性分析报告

## 概述

本报告针对 Gathio 项目中 ActivityPub 远程收件箱信令解析机制进行深入分析，重点关注以下三个核心问题：

1. Follow/Undo 请求的状态竞态条件风险
2. 未签名请求的 CPU 拒绝服务攻击防护
3. Create(Note) 评论内容过滤与防垃圾群发机制

---

## 问题一：Follow/Undo 状态竞态条件分析

### 代码定位

核心处理函数位于 [activitypub.ts](file:///e:/solo-code-2/gathio/src/activitypub.ts)：

- Follow 处理：[_handleFollow](file:///e:/solo-code-2/gathio/src/activitypub.ts#L497-L593)
- Undo Follow 处理：[_handleUndoFollow](file:///e:/solo-code-2/gathio/src/activitypub.ts#L595-L632)

### 问题分析

**结论：存在明确的状态竞态条件风险。**

#### Follow 处理流程（_handleFollow）

```
1. 读取事件文档：const event = await Event.findOne({ id: eventID })  [L517]
2. 内存中检查是否已关注：event.followers?.map(...).includes(...)  [L521]
3. 内存中添加关注者：event.followers?.push(newFollower)  [L525]
4. 异步保存到数据库：await event.save()  [L527]
```

#### Undo Follow 处理流程（_handleUndoFollow）

```
1. 读取事件文档：const event = await Event.findOne({ id: eventID })  [L598]
2. 内存中查找关注者索引：event.followers?.findIndex(...)  [L602]
3. 内存中删除关注者：event.followers?.splice(indexOfFollower, 1)  [L609]
4. 异步保存到数据库：await event.save()  [L611]
```

#### 竞态场景演示

假设同一个 Fediverse 账号在极短时间内（<100ms）依次发送 Follow → Undo → Follow 请求：

| 时间点 | 请求 | 操作 | 内存状态 | 数据库状态 |
|--------|------|------|----------|------------|
| T0 | Follow#1 | findOne 读取 | followers: [] | followers: [] |
| T1 | Undo#1 | findOne 读取 | followers: [] | followers: [] |
| T2 | Follow#1 | push + save() | followers: [A] | **写入中** |
| T3 | Undo#1 | findIndex -1 (未找到) | followers: [] | followers: [] |
| T4 | Follow#1 | save() 完成 | followers: [A] | followers: [A] |
| T5 | Undo#1 | save() (无变化) | followers: [] | followers: [A] |
| T6 | Follow#2 | findOne 读取 | followers: [A] | followers: [A] |
| T7 | Follow#2 | 已存在，返回 200 | followers: [A] | followers: [A] |

**最终结果**：用户实际发送了 Follow → Undo → Follow，期望状态是"已关注"，但由于 Undo 读取时 Follow 尚未写入完成，Undo 操作无效。更严重的是，反向时序（Undo 在 Follow save 完成前执行）可能导致用户已取消关注但数据库中仍保留关注记录。

#### 根本原因

1. **"读取-修改-写回"（Read-Modify-Write）模式**：两个函数都先读取整个文档到内存，修改后再整体保存，没有使用 MongoDB 的原子操作符（如 `$push`、`$pull`）。

2. **缺少分布式锁或乐观并发控制**：没有版本号检查、没有事务、没有针对单个 actorId 的串行化处理。

3. **重复检查在内存中执行**：[L521](file:///e:/solo-code-2/gathio/src/activitypub.ts#L521) 的重复关注检查基于内存快照，可能已过时。

### 代码优化建议

```typescript
// 优化后的 _handleFollow - 使用原子操作
async function _handleFollow(req: Request, res: Response) {
  const targetDomain = new URL(req.body.actor).hostname;
  const eventID = getEventId(req.body.object);

  let body: Record<string, string>;
  try {
    body = await signedFetch(req.body.actor, eventID);
  } catch (err) {
    addToLog("handleFollow", "error", `Error fetching actor: ${err}`);
    return res.status(500).send("Error processing follow.");
  }

  const name = body.preferredUsername || body.name || body.attributedTo;
  const newFollower = {
    actorId: req.body.actor,
    followId: req.body.id,
    name: name,
    actorJson: JSON.stringify(body),
  };

  // 使用 findOneAndUpdate + $addToSet 原子操作，避免竞态
  const event = await Event.findOneAndUpdate(
    { 
      id: eventID,
      "followers.actorId": { $ne: req.body.actor }  // 原子性检查不存在
    },
    { $addToSet: { followers: newFollower } },
    { new: true }
  );

  if (!event) {
    // 可能是事件不存在，或者已经是关注者
    const existingEvent = await Event.findOne({ id: eventID });
    if (!existingEvent) return res.sendStatus(404);
    return res.sendStatus(200);  // 已关注
  }

  // ... 后续发送 Accept 消息等逻辑 ...
}

// 优化后的 _handleUndoFollow - 使用原子操作
async function _handleUndoFollow(req: Request, res: Response) {
  const eventID = req.body.object.object.replace(`https://${domain}/`, "");
  
  // 使用 updateOne + $pull 原子操作
  const result = await Event.updateOne(
    { 
      id: eventID,
      "followers.actorId": req.body.object.actor,
      "followers.followId": req.body.object.id
    },
    { $pull: { followers: { actorId: req.body.object.actor } } }
  );

  if (result.modifiedCount > 0) {
    addToLog(
      "removeEventFollower",
      "success",
      `Follower removed from event ${eventID}`,
    );
  }

  return res.sendStatus(200);
}
```

**优化要点**：
- 使用 MongoDB 的 `$addToSet` 和 `$pull` 原子操作符
- 将"存在性检查"嵌入查询条件，由数据库保证原子性
- 不再依赖内存状态进行判断

---

## 问题二：未签名请求的限流与 IP 黑名单机制

### 代码定位

签名验证逻辑位于 [routes/activitypub.ts](file:///e:/solo-code-2/gathio/src/routes/activitypub.ts#L233-L357) 的收件箱路由处理中。

### 问题分析

**结论：没有任何限流或 IP 黑名单机制，存在严重的 CPU 拒绝服务攻击风险。**

#### 当前签名验证流程

```
1. 检查是否有 signature header：[L246-L250]
   if (!incomingSignature) return res.status(401).send(...)

2. 解析 signature header：[L251-L269]

3. 通过 signedFetch 远程获取 actor 公钥：[L313-L314]
   const actorObj = await signedFetch(actorUrl, eventID || "");

4. RSA-SHA256 签名验证：[L325-L341]
   const verifier = crypto.createVerify("RSA-SHA256");
   verifier.update(comparison_string, "ascii");
   const result = verifier.verify(publicKey, signature, "base64");
```

#### 安全风险分析

1. **缺少前置限流**：
   - `package.json` 中没有 `express-rate-limit`、`rate-limiter-flexible` 等限流库
   - [app.ts](file:///e:/solo-code-2/gathio/src/app.ts) 中没有注册任何限流中间件
   - `/activitypub/inbox` 路由没有任何访问频率限制

2. **恶意攻击场景**：
   - 攻击者可以每秒发送数千个无签名或伪造签名的请求
   - 每个请求都会触发：HTTP 请求解析 → 签名头解析 → 远程 HTTP 请求获取公钥 → RSA 加密验证
   - RSA 验证是 CPU 密集型操作，大量请求可轻易耗尽服务器 CPU
   - 即使签名验证失败，攻击者已经消耗了服务器资源

3. **缺少 IP 黑名单**：
   - 没有检测异常请求频率的逻辑
   - 没有对多次验证失败的 IP 进行临时封禁
   - [helpers.ts](file:///e:/solo-code-2/gathio/src/helpers.ts) 中的 `addToLog` 仅做日志记录，不用于安全决策

4. **远程获取公钥的额外风险**：
   - [signedFetch](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L79-L109) 本身也没有缓存机制
   - 攻击者可指定不存在的域名，导致 DNS 查询超时和连接超时
   - 可用于放大攻击：请求一个大体积的 actor JSON

### 代码优化建议

#### 1. 添加依赖

```bash
pnpm add express-rate-limit rate-limiter-flexible
```

#### 2. 新增限流中间件

```typescript
// src/lib/rateLimiter.ts
import rateLimit from "express-rate-limit";
import { RateLimiterMemory } from "rate-limiter-flexible";

// 全局收件箱限流：每个 IP 每分钟最多 30 个请求
export const inboxRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
});

// 签名验证失败限流：失败 5 次后封禁 1 小时
const failedAuthLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,  // 60秒内
  blockDuration: 60 * 60,  // 封禁1小时
});

export async function checkFailedAuthIP(req, res, next) {
  const ip = req.ip;
  try {
    const res = await failedAuthLimiter.get(ip);
    if (res && res.remainingPoints <= 0) {
      return res.status(429).send("Too many failed auth attempts.");
    }
    next();
  } catch {
    next();
  }
}

export async function recordFailedAuth(ip: string) {
  try {
    await failedAuthLimiter.consume(ip, 1);
  } catch {}
}

// 公钥缓存，避免重复请求
const actorCache = new Map<string, { data: any, expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

export function getCachedActor(url: string) {
  const cached = actorCache.get(url);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  actorCache.delete(url);
  return null;
}

export function setCachedActor(url: string, data: any) {
  actorCache.set(url, { data, expiry: Date.now() + CACHE_TTL });
}
```

#### 3. 修改收件箱路由

```typescript
// 在 routes/activitypub.ts 中
import { inboxRateLimiter, checkFailedAuthIP, recordFailedAuth, getCachedActor, setCachedActor } from "../lib/rateLimiter.js";

router.post(
  "/activitypub/inbox",
  send404IfNotFederated,
  inboxRateLimiter,      // 添加限流
  checkFailedAuthIP,     // 检查是否被临时封禁
  async (req: Request, res: Response) => {
    // ... 现有代码 ...
    
    // 修改公钥获取逻辑，增加缓存
    const actorUrl = signature_header.keyId?.replace(/#.*$/, "");
    
    // 先查缓存
    let actorObj = getCachedActor(actorUrl);
    if (!actorObj) {
      try {
        actorObj = await signedFetch(actorUrl, eventID || "");
        setCachedActor(actorUrl, actorObj);
      } catch (err) {
        await recordFailedAuth(req.ip);  // 记录失败
        console.log("[inbox] Error during signature verification:", err);
        return res.status(500).send("Signature verification error.");
      }
    }
    
    // ... 签名验证 ...
    
    if (!result) {
      await recordFailedAuth(req.ip);  // 验证失败也记录
      return res.status(401).send("Signature could not be verified.");
    }
    
    // ... 处理消息 ...
  }
);
```

---

## 问题三：Create(Note) 评论内容过滤与防垃圾群发

### 代码定位

评论处理函数位于 [activitypub.ts](file:///e:/solo-code-2/gathio/src/activitypub.ts#L849-L963) 的 `_handleCreateNoteComment`。

### 问题分析

#### 内容过滤机制

**XSS 防护：基本到位，但可更严格。**

当前实现 [L890-L893](file:///e:/solo-code-2/gathio/src/activitypub.ts#L890-L893)：

```typescript
const content = sanitizeHtml(req.body.object.content, {
  allowedTags: [],
  allowedAttributes: {},
}).replace(`@${eventID}`, "");
```

**优点**：
- 使用 `sanitize-html` 库（已在 [package.json](file:///e:/solo-code-2/gathio/package.json#L57) 中引入）
- `allowedTags: []` 移除所有 HTML 标签，有效防止 `<script>` 注入
- `allowedAttributes: {}` 移除所有属性，防止 `onclick`、`javascript:` 等事件注入

**潜在风险**：
1. **仅过滤 HTML，不过滤其他注入向量**：
   - Markdown 链接可能包含 `javascript:` 协议（虽然前端渲染时可能处理）
   - 没有对 URL 协议进行白名单限制

2. **没有进行 Unicode 规范化**：
   - 可能存在同形异义字（Homograph）钓鱼攻击
   - 零宽字符等不可见字符可能用于绕过检测

3. **长度限制检查位置不当**：
   - `maxCommentLength` 检查 [L895-L899](file:///e:/solo-code-2/gathio/src/activitypub.ts#L895-L899) 在 `sanitizeHtml` 之后
   - 攻击者可发送 10MB 的 HTML 内容，sanitize 处理消耗大量内存后才被拒绝

#### 防垃圾群发机制

**结论：防垃圾群发机制严重不足。**

当前防垃圾措施只有两处：

1. **目标事件数量检查** [L879-L881](file:///e:/solo-code-2/gathio/src/activitypub.ts#L879-L881)：
   ```typescript
   if (ourEvents.length !== 1) {
     return res.sendStatus(200);
   }
   ```
   仅检查是否同时@多个本域事件，无法防止针对单个事件的高频垃圾。

2. **评论开关检查** [L915-L917](file:///e:/solo-code-2/gathio/src/activitypub.ts#L915-L917)：
   ```typescript
   if (!event.usersCanComment) {
     return res.sendStatus(200);
   }
   ```

#### 跳板攻击风险

评论接收后会通过 `broadcastAnnounceMessage` [L929-L934](file:///e:/solo-code-2/gathio/src/activitypub.ts#L929-L934) 广播给所有关注者：

```typescript
await broadcastAnnounceMessage(
  jsonObject,
  event.followers ?? [],
  eventID,
);
```

**风险场景**：
1. 攻击者向事件 A 发送垃圾评论
2. 系统验证通过后，自动将评论 Announce 给事件 A 的所有关注者
3. 如果事件 A 有 10,000 个关注者，攻击者的 1 条评论变成了 10,000 条转发
4. 攻击者可以利用此机制进行大规模垃圾邮件分发

**缺少的防护**：
- 没有 per-actor 评论频率限制
- 没有重复内容检测
- 没有链接黑名单/域名信誉检查
- 没有人工审核队列
- 没有延迟发布机制
- 没有关注者必须关注一定时间才能评论的限制

### 代码优化建议

#### 1. 增强内容过滤

```typescript
// 内容过滤增强
const rawContent = req.body.object.content;

// 1. 先检查长度，避免处理大内容
if (Buffer.byteLength(rawContent, 'utf8') > maxCommentLength * 2) {
  return res.status(400).send("Comment too large.");
}

// 2. sanitize-html 增强配置
const content = sanitizeHtml(rawContent, {
  allowedTags: [],
  allowedAttributes: {},
  allowedSchemes: ['http', 'https', 'mailto'],  // 只允许安全协议
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  parser: {
    decodeEntities: true,
  },
}).replace(`@${eventID}`, "").trim();

// 3. Unicode 规范化和不可见字符清理
const normalizedContent = content.normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');  // 移除零宽字符

// 4. 长度检查（sanitize 后）
if (normalizedContent.length > maxCommentLength) {
  return res
    .status(400)
    .send(i18next.t("routes.commenttoolong", { maxCommentLength }));
}

// 5. 钓鱼链接检测（可选）
const urlRegex = /https?:\/\/[^\s]+/g;
const urls = normalizedContent.match(urlRegex) || [];
for (const url of urls) {
  try {
    const parsed = new URL(url);
    // 可集成域名信誉检查 API
    if (isDomainBlacklisted(parsed.hostname)) {
      return res.status(400).send("Comment contains blocked URLs.");
    }
  } catch {}
}
```

#### 2. 新增防垃圾群发机制

```typescript
// 新增 per-actor 频率限制
const FIVE_MINUTES = 5 * 60 * 1000;
const MAX_COMMENTS_PER_WINDOW = 5;

// 检查该 actor 最近的评论频率
const fiveMinutesAgo = new Date(Date.now() - FIVE_MINUTES);
const recentComments = event.comments?.filter(
  c => c.actorId === req.body.actor && c.timestamp > fiveMinutesAgo
) || [];

if (recentComments.length >= MAX_COMMENTS_PER_WINDOW) {
  addToLog("spamPrevention", "warning", 
    `Rate limited comment from ${req.body.actor} on event ${eventID}`);
  return res.status(429).send("Too many comments, please slow down.");
}

// 检查重复内容（相同内容 1 小时内不能重复提交）
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
const isDuplicate = event.comments?.some(
  c => c.actorId === req.body.actor && 
       c.content === normalizedContent && 
       c.timestamp > oneHourAgo
);

if (isDuplicate) {
  return res.status(400).send("Duplicate comment detected.");
}

// 新关注者冷却期（必须关注超过 10 分钟才能评论）
const follower = event.followers?.find(f => f.actorId === req.body.actor);
if (follower) {
  // 可记录关注时间进行检查
}

// 内容敏感词检测
const bannedWords = getBannedWordsList();
for (const word of bannedWords) {
  if (normalizedContent.toLowerCase().includes(word.toLowerCase())) {
    addToLog("contentFilter", "warning", 
      `Blocked comment containing banned word: ${word}`);
    return res.status(400).send("Comment contains inappropriate content.");
  }
}
```

#### 3. 跳板攻击防护

```typescript
// 延迟广播：高风险评论先放入待审核队列
const isHighRisk = 
  recentComments.length >= 2 ||  // 近期较活跃
  urls.length > 2 ||             // 包含多个链接
  follower === undefined;        // 非关注者

if (isHighRisk && event.followers && event.followers.length > 100) {
  // 关注者超过 100 人的事件，高风险评论不自动广播
  // 仅保存评论，需要人工审核后再广播
  newComment.requiresReview = true;
  addToLog("moderation", "info", 
    `Comment held for review on event ${eventID}`);
} else {
  // 低风险评论正常广播
  try {
    await broadcastAnnounceMessage(
      jsonObject,
      event.followers ?? [],
      eventID,
    );
  } catch (err) {
    addToLog(
      "handleCreateNoteComment",
      "error",
      `Error broadcasting comment: ${err}`,
    );
  }
}
```

---

## 总结与建议优先级

| 问题 | 风险等级 | 修复优先级 | 主要修复措施 |
|------|----------|------------|-------------|
| Follow/Undo 竞态 | 中 | P2 | 使用 MongoDB 原子操作符替代 RMW 模式 |
| 无限流导致 DoS | 高 | P1 | 添加 express-rate-limit、IP 失败封禁、公钥缓存 |
| 评论防垃圾不足 | 中高 | P2 | 增强内容过滤、频率限制、重复检测、延迟广播 |

### 紧急建议（P1）

1. 立即为 `/activitypub/inbox` 添加入口限流
2. 为签名验证失败添加 IP 级别的临时封禁
3. 为 `signedFetch` 添加缓存机制，避免重复 HTTP 请求

### 重要建议（P2）

1. 将 Follow/Undo 的读写模式改为 MongoDB 原子操作
2. 增强评论内容过滤，添加协议白名单和 Unicode 清理
3. 实现 per-actor 评论频率限制和重复内容检测
4. 为大关注量事件的评论添加人工审核或延迟发布机制

### 长期建议（P3）

1. 考虑引入联邦内容黑名单（如 Fediverse Blocklist）
2. 实现与其他实例的防御性联邦（Defederation）机制
3. 添加用户级别的评论举报和审核系统
4. 考虑使用 Proof of Work 机制防止垃圾消息
