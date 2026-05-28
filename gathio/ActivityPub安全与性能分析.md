# ActivityPub 联邦协议交互安全与性能分析

## 概述

本文档针对 Gathio 项目中 ActivityPub 联邦协议实现的三个关键技术问题进行深度分析，涉及代码主要实现位于：

- 核心实现文件：
  - [activitypub.ts](file:///e:/solo-code-2/gathio/src/routes/activitypub.ts) - inbox 端点实现
  - [activitypub.ts](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts) - signedFetch 工具函数

---

## 一、恶意 keyId 与 signedFetch 安全性分析

### 1.1 关键代码链路

**keyId 解析与 actorUrl 提取：
```typescript
// [activitypub.ts#L313-L314](file:///e:/solo-code-2/gathio/src/routes/activitypub.ts#L313-L314)
const actorUrl = signature_header.keyId?.replace(/#.*$/, "");
const actorObj = await signedFetch(actorUrl, eventID || "");
```

**signedFetch 签名请求实现：**
```typescript
// [activitypub.ts#L79-L109](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L79-L109)
export async function signedFetch(url: string, eventID: string): Promise<any> {
  const targetUrl = new URL(url);  // URL 格式验证
  // ...
  if (event?.privateKey) {
    const stringToSign = `(request-target): get ${pathFragment}\nhost: ${targetDomain}\ndate: ${fetchDate}`;
    const signer = crypto.createSign("sha256");
    signer.update(stringToSign);
    const sig_b64 = signer.sign(event.privateKey).toString("base64");
    headers.Signature = `keyId="https://${domain}/${eventID}#main-key",algorithm="rsa-sha256",headers="(request-target) host date",signature="${sig_b64}"`;
  }
  const response = await fetch(url, { headers });
}
```

### 1.2 请求伪造防护机制

**已有的安全措施：

1. **URL 格式合法性验证：
   - `new URL(url)` 利用内置 URL 构造函数会严格验证 URL 格式
   - 非法 URL 格式会直接抛出 TypeError，阻止后续请求

2. **本地私钥签名机制：
   - 所有外发请求使用**本地 event 私钥进行 RSA-SHA256 签名
   - 签名覆盖：`(request-target)`、`host`、`date` 三个头部
   - 签名头部包含本地 keyId 指向本地实体身份

3. **防止请求伪造的核心原理：
   - 即使攻击者控制了 `keyId` 参数诱导服务器请求恶意地址，外发请求的签名始终由本地私钥生成
   - 恶意服务器无法伪造有效响应的签名，因为它不掌握本地私钥
   - 这保证了**请求的完整性和身份真实性**

### 1.3 存在的安全风险

1. **SSRF 风险**：
   - 缺少协议白名单验证缺失：未限制只能使用 `https` 协议
   - 缺少内网地址防护：可被诱导请求 `http://127.0.0.1 等内网地址
   - 缺少域名黑名单缺失：无 URL 长度限制

2. **keyId 解析缺陷**：
   - `replace(/#.*$/, "") 仅去除 fragment，但未验证 keyId 本身的格式有效性
   - 攻击者可构造 `keyId="javascript://attacker.com%23@good.com` 等畸形参数

3. **代码优化建议：

```typescript
// 优化后的 keyId 安全解析
function safeExtractActorUrl(keyId: string): string {
  if (!keyId) throw new Error("No keyId provided");
  
  // 先验证 keyId 是合法 URL
  const url = new URL(keyId);
  
  // 协议白名单
  if (url.protocol !== 'https:') {
    throw new Error("Invalid protocol");
  }
  
  // 内网地址防护
  const hostname = url.hostname;
  if (['localhost', '127.0.0.1', '::1'].includes(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname)) {
    throw new Error("Invalid hostname");
  }
  
  // 去除 fragment 后重新构造 URL
  url.hash = '';
  return url.toString();
}
```

---

## 二、远程服务器延迟响应的性能影响分析

### 2.1 关键代码问题

```typescript
// [activitypub.ts#L104](file:///e:/solo-code-2/gathio/src/lib/activitypub.ts#L104)
const response = await fetch(url, { headers });
```

**核心问题：** `fetch` 调用**未设置任何超时**，Node.js 原生 fetch 默认超时为**无穷大**。

### 2.2 对 Node.js EventLoop 的具体影响

| 层面 | 影响分析 |
|------|----------|
| **EventLoop 本身 | `fetch` 是异步非阻塞 I/O，等待响应期间 EventLoop 本身不会被阻塞，可继续处理其他事件 |
| **libuv 线程池** | DNS 解析会占用线程池线程（默认 4 个），大量延迟请求可能耗尽线程池 |
| **系统资源** | 每个挂起请求占用：socket 文件描述符、TCP 连接、内存 |

### 2.3 对 Express 并发吞吐量的具体影响

1. **内存泄漏式拒绝服务（Slowloris 变种攻击）**：
   - 攻击者批量发送包含恶意 `keyId` 的请求，这些 `keyId` 指向故意延迟响应的服务器
   - 每个请求保持挂起状态，持续占用系统资源

2. **资源耗尽链**：
   ```
   每秒 100 个恶意请求 × 30 秒延迟 = 3000 个并发挂起请求
   ↓
   每个请求占用 ~15KB（req/res 对象 + socket 缓冲区
   ↓
   3000 × 15KB = 45MB 内存占用
   ↓
   3000 个文件描述符（默认 ulimit 通常为 1024 或 4096）
   ↓
   文件描述符耗尽 → 无法建立新连接 → 服务拒绝
   ```

3. **TCP 连接队列溢出**：
   - 每个挂起的 fetch 请求占用一个 TCP 连接
   - 操作系统 TCP  backlog 队列溢出 → 新连接被丢弃
   - Node.js 无法接受新的合法请求

4. **事件循环延迟累积**：
   - 虽然 I/O 是异步的，但大量回调注册和定时器管理会产生微任务队列处理延迟
   - 合法请求的处理延迟上升，吞吐量下降

### 2.4 代码优化建议

```typescript
// 带超时和并发控制的 signedFetch
export async function signedFetch(url: string, eventID: string, timeoutMs: number = 10000): Promise<any> {
  // ... 签名逻辑不变
  
  // 使用 AbortController 设置超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { 
      headers,
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**额外防护措施：**
- 针对同一域名的并发限制
- 熔断机制：短时间内多次失败后暂时拒绝请求该域名
- 全局并发请求数限制

---

## 三、非法公钥格式的异常处理机制

### 3.1 关键代码链路

```typescript
// [activitypub.ts#L335-L355](file:///e:/solo-code-2/gathio/src/routes/activitypub.ts#L335-L355)
try {
  // ... 公钥获取
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(comparison_string, "ascii");
  const result = verifier.verify(
    publicKey,
    signature_header.signature,
    "base64",
  );
  if (result) {
    await processInbox(req, res);
  } else {
    return res.status(401).send("Signature could not be verified.");
  }
} catch (err) {
  console.log("[inbox] Error during signature verification:", err);
  return res.status(500).send("Signature verification error.");
}
```

### 3.2 `verifier.verify()` 可能抛出的异常场景

| 异常场景 | 触发条件 | 异常类型 |
|----------|----------|----------|
| **公钥格式无效 | PEM 格式损坏、ASN.1 解析失败 | `Error: error:0909006C:PEM routines:get_name:no start line` |
| **公钥算法不匹配 | 使用 EC 密钥但指定 RSA-SHA256 | `Error: error:04099079:rsa routines:RSA_padding_check_PKCS1_type_1:invalid padding` |
| **签名格式无效 | 无法 base64 解码 | `TypeError: Invalid base64 encoded string` |
| **公钥已篡改 | 公钥内容被修改导致 ASN.1 结构损坏 | `Error: error:0D07207B:asn1 encoding routines:ASN1_get_object:header too long` |

### 3.3 当前异常处理机制

**已有的保护措施：**

1. **try-catch 包裹整个验证流程**：
   - 所有加密操作异常都会被捕获
   - 异常不会向上传播，不会导致 Node.js 进程崩溃
   - 单个请求的验证失败不会影响其他请求的处理

2. **错误响应**：
   - 捕获异常后记录错误日志
   - 返回 HTTP 500 状态码和通用错误信息

**存在的问题：**

1. **错误状态码不准确**：
   - 客户端输入错误（非法公钥）应返回 400 Bad Request
   - 当前统一返回 500 Internal Server Error
   - 可能泄露内部错误信息给攻击者

2. **缺少公钥预校验缺失**：
   - 未提前验证公钥格式有效性，直接交给 `crypto` 处理
   - 可能触发底层 OpenSSL 错误，增加攻击面

3. **错误信息过于模糊**：
   - 日志记录了详细错误信息，但响应信息过于简单
   - 不利于问题排查

### 3.4 代码优化建议

```typescript
// 公钥格式预校验
function validatePublicKey(publicKey: string): void {
  if (publicKey = publicKey.trim();
  
  // PEM 格式基本检查
  const pemHeader = "-----BEGIN PUBLIC KEY-----";
  const pemFooter = "-----END PUBLIC KEY-----";
  
  if (!publicKey.startsWith(pemHeader) || !publicKey.endsWith(pemFooter)) {
    throw new Error("Invalid public key format");
  }
  
  // 提取 base64 内容并验证
  const base64Content = publicKey.slice(pemHeader.length, publicKey.length - pemFooter.length).trim();
  
  // Base64 格式验证
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Content)) {
    throw new Error("Invalid base64 in public key");
  }
  
  // 长度合理性检查（RSA 2048 位公钥约 294 字节 base64）
  if (base64Content.length < 100 || base64Content.length > 2000) {
    throw new Error("Invalid public key length");
  }
}

// 优化后的验证流程
try {
  // ... 获取公钥后先预校验
  validatePublicKey(publicKey);
  
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(comparison_string, "ascii");
  const result = verifier.verify(publicKey, signature_header.signature, "base64");
  
  if (result) {
    await processInbox(req, res);
  } else {
    return res.status(401).send("Signature could not be verified.");
  }
} catch (err) {
  console.log("[inbox] Error during signature verification:", err);
  
  // 根据错误类型返回不同状态码
  if (err.message.includes("public key") || err.message.includes("PEM")) {
    return res.status(400).send("Invalid public key format.");
  }
  return res.status(500).send("Signature verification error.");
}
```

### 3.5 系统运行保障原理

当前代码的 try-catch 机制确保了：
- **进程隔离**：单个请求的加密异常不会导致整个 Node.js 进程崩溃
- **资源清理**：异常发生时请求上下文会被正常清理，不会发生资源泄漏
- **故障隔离**：单个恶意请求不会影响其他并发请求的处理
- **可观测性**：错误日志记录便于后续分析和攻击检测

---

## 四、总结与建议

### 4.1 安全加固优先级

| 问题 | 风险等级 | 修复优先级 |
|-----|----------|------------|
| fetch 无超时 | 高 | P0 |
| keyId 缺少 SSRF 防护 | 高 | P0 |
| 公钥预校验缺失 | 中 | P1 |
| 错误状态码不准确 | 低 | P2 |

### 4.2 整体架构建议

1. **引入请求超时中间件**：为所有外发 HTTP 请求设置合理的超时（5-10秒）
2. **实现域名白名单/黑名单**：建立可信联邦实例名单
3. **添加速率限制**：对 inbox 端点进行速率限制
4. **实现熔断机制**：对频繁失败的远程实例进行熔断
5. **增加监控告警**：对验证失败率、请求延迟等指标进行监控
