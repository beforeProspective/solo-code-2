# handlePollResponse 安全分析报告

## 概述

[handlePollResponse](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L111-L287) 是 Gathio 去中心化投票交互的核心协调函数，负责将对侧联邦平台投递来的 ActivityPub `Create/Note` 投票回复映射成本地 RSVP 变更。以下针对三个关键安全问题进行深入分析。

---

## 问题一：二次身份校验如何防范冒充投票

### 防御层次梳理

`handlePollResponse` 的身份校验由三层防线构成：

#### 第一层：Inbox 级 HTTP 签名验证

在请求到达 `handlePollResponse` 之前，[inbox 路由](file:///e:/solo-code-2/gathio/src/routes/activitypub.ts#L233-L357) 已执行 HTTP Signature 验证：

```typescript
// routes/activitypub.ts L246-L251
const incomingSignature = req.get("signature");
if (!incomingSignature) {
  return res.status(401).send("No signature provided.");
}
```

路由从签名的 `keyId` 提取 actor URL，用 `signedFetch` 拉取远端公钥，再用 `crypto.createVerify("RSA-SHA256")` 验证请求签名。只有签名验证通过后才会调用 `processInbox` → `handlePollResponse`。这保证了**请求的传输层来源确实持有对应私钥**。

#### 第二层：关注者白名单校验

[handlePollResponse L123-L128](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L123-L128)：

```typescript
const senderAlreadyFollows = event.followers?.some(
  (el) => el.actorId === attributedTo,
);
if (!senderAlreadyFollows) {
  throw new Error("Poll response sender does not follow event");
}
```

只有已在 `event.followers` 列表中的 actor 才有资格投票。此列表在 `_handleFollow` 流程中通过 `signedFetch(req.body.actor)` 验证 actor 真实性后写入，确保关注者身份可信。

#### 第三层：inReplyTo + 收件人匹配（二次校验核心）

[handlePollResponse L132-L143](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L132-L143)：

```typescript
const matchingMessage = event.activityPubMessages?.find((el) => {
  const content = JSON.parse(el.content || "{}");
  return inReplyTo === content?.object?.id;
});
if (!matchingMessage) throw new Error("No matching message found");
const messageContent = JSON.parse(matchingMessage.content || "{}");
const messageRecipient = getNoteRecipient(messageContent.object);
if (!messageRecipient || messageRecipient !== attributedTo) {
  throw new Error("MessageRecipient does not match attributedTo");
}
```

此逻辑的防御机制：

1. **消息溯源**：遍历 `activityPubMessages`，找到 `inReplyTo` 与已发送消息的 `object.id` 匹配的记录。由于消息 ID 含 `crypto.randomBytes(16).toString("hex")` 生成的高熵随机值（见 [signAndSend](file:///e:/solo-code-2/gathio/src/activitypub.ts#L227-L228)），攻击者无法枚举或猜出合法消息 ID。
2. **收件人绑定**：从匹配到的原始消息中提取 `to`/`cc` 收件人，与本次请求的 `attributedTo` 比对。投票消息只能回复给**发给自己的**投票邀请，而不能复用发给别人的邀请。

### 防冒充效果评估

**有效防护的场景**：攻击者 A 试图冒充用户 B 投票。即使 A 持有自己的合法私钥（签名验证通过），由于投票邀请是私发给 B 的，消息收件人为 B 的 actor URL，A 无法使 `messageRecipient === attributedTo(A)` 成立，投票被拒绝。

**残留风险**：HTTP 签名验证了**请求发送者**的身份（`keyId` 对应的 actor），但代码**未校验 `req.body.object.attributedTo` 与签名 `keyId` 是否一致**。如果签名者与 `attributedTo` 不是同一实体，系统仍可能接受请求——只要 `attributedTo` 恰好同时满足关注者检查和收件人匹配。这意味着：

- 在联邦场景下，一个实例的中继服务（relay）可能以自己的私钥签名但保留原始 `attributedTo`，此时签名者与声称的作者不一致。
- 如果攻击者能获取到发给目标用户的投票消息 ID（例如通过消息泄露或社交工程），并自己也是该事件的关注者，则理论上可以构造 `inReplyTo` 指向目标用户的消息、`attributedTo` 伪装成目标用户来提交投票。但前提是消息 ID 未泄露，且攻击者本身也必须是关注者——这在实际中大幅缩小了攻击面。

### 修复建议

在 inbox 签名验证阶段增加一步校验：

```typescript
const actorUrl = signature_header.keyId?.replace(/#.*$/, "");
if (req.body.actor !== actorUrl) {
  return res.status(401).send("Actor does not match signing key.");
}
```

同时在 `handlePollResponse` 内部增加对 `req.body.actor` 与 `attributedTo` 的一致性检查。

---

## 问题二：并发流量下 maxAttendees 容量突破的竞态条件

### 问题定位

`handlePollResponse` 中的容量检查与写入操作之间存在经典的 **TOCTOU（Time-of-Check to Time-of-Use）竞态窗口**：

**读取阶段**（[L119](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L119)）：

```typescript
const event = await Event.findOne({ id: eventID });
```

**检查阶段**（[L173-L174](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L173-L174)）：

```typescript
if (event.maxAttendees !== null && event.maxAttendees !== undefined) {
  if (getApprovedAttendeeCount(event) >= event.maxAttendees) {
```

**写入阶段**（[L208-L212](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L208-L212)）：

```typescript
const updatedEvent = await Event.findOneAndUpdate(
  { id: eventID },
  { $push: { attendees: newAttendee } },
  { new: true },
).exec();
```

### 竞态分析

三个阶段分属三次独立的数据库操作，中间无事务隔离或原子性保证：

```
时间线  请求A                              请求B
------  ------                             ------
T1      findOne → attendees.length = 9
T2                                         findOne → attendees.length = 9
T3      getApprovedAttendeeCount = 9 < 10  (检查通过)
T4                                         getApprovedAttendeeCount = 9 < 10 (检查通过)
T5      findOneAndUpdate $push (attendee 10)
T6                                         findOneAndUpdate $push (attendee 11) ← 超限！
```

当 `maxAttendees = 10` 且当前已有 9 人报名时，两个并发请求各自在 T1/T2 读到 9 人，各自通过容量检查，随后都执行 `$push`，导致最终报名人数达到 11，突破限制。

此外，[getApprovedAttendeeCount](file:///e:/solo-code-2/ggathio/src/models/Event.ts#L81-L90) 的计算逻辑基于从数据库读出的内存对象 `event`，而非数据库端的实时聚合，进一步加剧了数据过时的问题。

### 影响范围

- 在低并发场景下，由于 Node.js 单线程事件循环的特性，竞态窗口较小但并非为零——`await` 关键字会在每个异步操作处让出执行权，其他请求可在间隙中插入。
- 在高并发场景下（例如热门活动开放报名的瞬间），大量请求可能在同一事件循环 tick 内进入 `findOne`，产生大面积超限。
- `findOneAndUpdate` 本身使用 `$push` 操作符，这是文档级原子操作，但由于**缺少条件过滤**（未在查询条件中加入容量约束），原子性未被利用来保护业务不变量。

### 修复建议

将容量检查与写入合并为单次原子操作，利用 MongoDB 的条件更新：

```typescript
const updatedEvent = await Event.findOneAndUpdate(
  {
    id: eventID,
    $expr: {
      $lt: [
        {
          $size: {
            $filter: {
              input: "$attendees",
              cond: {
                $and: [
                  { $eq: ["$$this.status", "attending"] },
                  ...(event.approveRegistrations
                    ? [{ $eq: ["$$this.approved", true] }]
                    : []),
                ],
              },
            },
          },
        },
        event.maxAttendees,
      ],
    },
  },
  { $push: { attendees: newAttendee } },
  { new: true },
).exec();

if (!updatedEvent) {
  // 容量检查在数据库层面失败，说明已满
  return res.status(200).send("Event is at capacity.");
}
```

或者使用 MongoDB 事务配合快照隔离（如果运行在副本集上）。

---

## 问题三：signedFetch(attributedTo) 的 SSRF 风险

### 数据流追踪

[handlePollResponse L168](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L168)：

```typescript
const apActor = await signedFetch(attributedTo, eventID);
```

`attributedTo` 来自 `req.body.object.attributedTo`（[L114](file:///e:/solo-code-2/ggathio/src/lib/activitypub.ts#L114)），是攻击者完全可控的外部输入。

[signedFetch](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L79-L109) 的核心逻辑：

```typescript
export async function signedFetch(url: string, eventID: string): Promise<any> {
  const targetUrl = new URL(url);       // 仅做 URL 格式校验
  const targetDomain = targetUrl.hostname;
  const pathFragment = targetUrl.pathname;
  // ... 构建带 HTTP Signature 的请求头 ...
  const response = await fetch(url, { headers });  // 直接发起请求
  return response.json();
}
```

### SSRF 攻击面

`signedFetch` 对 `url` 的唯一校验是 `new URL(url)`，这仅保证 URL 格式合法，**不限制协议、域名或 IP 地址**。攻击者可构造如下 `attributedTo`：

| 攻击目标 | 构造的 attributedTo | 效果 |
|---|---|---|
| 云元数据泄露 | `http://169.254.169.254/latest/meta-data/iam/security-credentials/` | 获取 AWS IAM 凭证 |
| 本地服务探测 | `http://localhost:27017/` | 探测 MongoDB 是否在本地监听 |
| 内网服务访问 | `http://10.0.0.5:8080/admin` | 访问内网管理面板 |
| DNS 重绑定 | `http://attacker-rebind.evil.com/` (先解析为外部 IP，再解析为 127.0.0.1) | 绕过首次校验后访问本地服务 |

### 带签名请求的放大风险

此 SSRF 的特殊危险在于**请求携带了 HTTP Signature**：

1. **私钥泄露**：签名头中包含 `keyId="https://domain/eventID#main-key"`，暴露了事件标识符和密钥标识。
2. **内部服务认证绕过**：如果内网存在需要 HTTP Signature 认证的服务，此请求会通过其签名验证，攻击者可借此在内部网络中执行已认证操作。
3. **响应泄露**：`response.json()` 的返回值会被函数调用方使用（如提取 `preferredUsername`），如果攻击者控制的远端服务器返回特定 JSON 结构，可能影响后续逻辑（如注入 attendee 名称）。

此外，SSRF 不仅存在于 `handlePollResponse`，还存在于：
- [_handleFollow](file:///e:/solo-code-2/gathio/src/activitypub.ts#L503) 中的 `signedFetch(req.body.actor, eventID)`
- [_handleAcceptEvent](file:///e:/solo-code-2/ggathio/src/activitypub.ts#L655) 中的 `signedFetch(actor, eventID)`
- [_handleCreateNoteComment](file:///e:/solo-code-2/ggathio/src/activitypub.ts#L887) 中的 `signedFetch(req.body.actor, eventID)`
- inbox 签名验证阶段的 `signedFetch(actorUrl, eventID || "")`

所有这些调用点都接受用户可控的 URL 参数，面临同样的 SSRF 风险。

### 修复建议

1. **URL 白名单/协议限制**：

```typescript
export async function signedFetch(url: string, eventID: string): Promise<any> {
  const targetUrl = new URL(url);
  if (targetUrl.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }
  // ...
}
```

2. **内网 IP 过滤**：在发起请求前解析目标域名，检查其 IP 是否属于私有地址段（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16`、`127.0.0.0/8` 等）。

3. **DNS 重绑定防护**：在 DNS 解析后、发起请求前再次校验 IP 地址，且确保 DNS 解析结果与请求目标一致。

4. **域名归属校验**：对于 ActivityPub 场景，可验证 `attributedTo` 的域名与请求来源（`req.body.actor` 或签名 `keyId`）的域名一致，防止跨域 SSRF。

5. **独立网络通道**：将联邦出站请求通过隔离的网络通道或代理发送，限制其对内网的访问能力。

---

## 总结

| 问题 | 严重程度 | 根因 | 现有缓解措施 | 核心风险 |
|---|---|---|---|---|
| 冒充投票 | 中 | `attributedTo` 未与签名 `keyId` 强绑定 | 三层校验（签名+关注者+收件人匹配） | 消息 ID 泄露后可能被关注者利用 |
| 容量竞态 | 高 | 检查与写入非原子操作 | 无 | 并发请求可突破 maxAttendees |
| SSRF | 高 | 用户可控 URL 直接传入 `fetch` | `new URL()` 格式校验 | 可访问内网服务、泄露云凭证 |
