# HTML 净化器安全设计分析

本文档针对 [sanitizer.go](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer.go) 中的三个关键设计决策进行深入分析。

---

## 问题 1：iframe 视频包裹层（video-wrapper）的排版意义

### 代码位置
- 判定逻辑：[isVideoIframe](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer.go#L434-L451)
- 包裹逻辑：[Sanitize](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer.go#L62-L78)
- 样式定义：[app.css](file:///e:/solo-code-2/yarr/src/assets/stylesheets/app.css#L381-L400)

### 设计意图

当 `isVideoIframe` 检测到 iframe 来自 YouTube、Bilibili、Vimeo、Dailymotion 等视频平台时，会自动将其包裹在 `<div class="video-wrapper">` 容器中。这是为了解决 **响应式视频排版** 问题。

### 核心技术原理

CSS 采用了经典的 **"Padding Trick"** 技术：

```css
.content .video-wrapper {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
}

.content .video-wrapper::before {
  display: block;
  padding-top: 56.25%; /* 16:9 宽高比 = 9/16 = 0.5625 */
  content: "";
}

.content .video-wrapper iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
```

### 解决的排版问题

| 问题 | 说明 |
|------|------|
| **固定宽高比变形** | iframe 本身不具备固有宽高比，在响应式布局中如果只设置 `width: 100%`，高度会保持原尺寸或被压缩，导致视频变形 |
| **容器溢出** | 视频播放器在小屏幕设备上可能超出内容区域宽度，导致横向滚动条 |
| **不同屏幕适配** | 在手机、平板、桌面等不同尺寸屏幕上，视频需要保持一致的 16:9 影院级比例 |
| **流式布局一致性** | 文章内容是流式的，视频需要像图片一样自然融入文档流，同时保持正确比例 |

### 实现效果

净化前：
```html
<iframe src="https://www.youtube.com/embed/foobar" width="800" height="450"></iframe>
```

净化后：
```html
<div class="video-wrapper">
  <iframe src="https://www.youtube.com/embed/foobar" 
          sandbox="allow-scripts allow-same-origin allow-popups" 
          loading="lazy"></iframe>
</div>
```

---

## 问题 2：iframe 源白名单的安全意义

### 代码位置
- 白名单校验：[isValidIframeSource](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer.go#L266-L288)

### 白名单内容

```go
whitelist := []string{
    "bandcamp.com",
    "cdn.embedly.com",
    "invidio.us",
    "player.bilibili.com",
    "player.vimeo.com",
    "soundcloud.com",
    "vk.com",
    "w.soundcloud.com",
    "www.dailymotion.com",
    "www.youtube-nocookie.com",
    "www.youtube.com",
}
```

同时允许 **同源域名**（与 `baseURL` 同域）。

### 防范的安全隐患

| 攻击类型 | 风险说明 | 白名单如何防御 |
|----------|----------|----------------|
| **点击劫持（Clickjacking）** | 恶意 iframe 可以透明覆盖在正常内容之上，诱导用户点击执行非预期操作（如转账、关注等） | 仅允许可信视频平台，这些平台通常设置了 `X-Frame-Options` 防止被嵌套用于恶意目的 |
| **跨站脚本攻击（XSS）** | 恶意 iframe 加载的页面可以通过 `postMessage` 或其他方式与父页面通信，注入恶意脚本 | 限制为可信域名，这些平台的内容经过审核 |
| **钓鱼攻击** | iframe 可以伪装成登录框、支付页面等，诱导用户输入敏感信息 | 白名单域名都是知名内容平台，不会用于钓鱼 |
| **自动播放恶意内容** | 恶意 iframe 可能自动播放声音、弹窗、下载恶意软件 | 视频平台的播放器行为规范，且通过 `sandbox` 属性进一步限制 |
| **同源数据泄露** | 如果允许任意 iframe，攻击者可能加载同源页面（如 `yarr` 自身的设置页），通过 `window.parent` 访问数据 | 虽然同源被允许，但 `sandbox="allow-same-origin"` 配合 `allow-scripts` 已限制了大部分危险操作，且用户订阅的内容通常不会包含恶意同源 iframe |
| **挖矿脚本 / 资源滥用** | 恶意网站可能在 iframe 中隐藏挖矿脚本，消耗用户 CPU 资源 | 仅允许可信平台，排除未知的恶意站点 |
| **统计追踪 / 隐私泄露** | 第三方 iframe 可能用于用户行为追踪、指纹识别 | 白名单排除了已知的统计域名（如 `stats.wordpress.com` 在 `isBlockedResource` 中被单独屏蔽） |

### 设计权衡

- **严格但不失灵活**：白名单只包含主流视频/音频平台，覆盖了 99% 的合法嵌入场景
- **同源例外**：允许用户自己的内容服务器嵌入 iframe，满足自建媒体场景
- **分层防御**：即使白名单域名被攻破，后面还有 `sandbox` 属性作为第二道防线

---

## 问题 3：安全属性强制注入的意义

### 代码位置
- 属性注入逻辑：[getExtraAttributes](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer.go#L165-L192)

### 各标签注入属性详解

#### 3.1 `<a>` 标签 - 链接安全

```go
case "a":
    return []string{"rel", "target", "referrerpolicy"}, 
           []string{
               `rel="noopener noreferrer"`,
               `target="_blank"`,
               `referrerpolicy="no-referrer"`,
           }
```

| 属性 | 安全作用 |
|------|----------|
| **`rel="noopener"`** | 防止新打开的标签页通过 `window.opener` 对象访问原页面，阻断 **反向 Tabnabbing 攻击**（新页面可以修改原页面 URL 进行钓鱼） |
| **`rel="noreferrer"`** | 不发送 HTTP `Referer` 头，防止目标网站获知用户来源 URL，保护阅读隐私 |
| **`target="_blank"`** | 在新标签页打开链接，确保用户不离开 RSS 阅读器，提升体验的同时也隔离了风险 |
| **`referrerpolicy="no-referrer"`** | 现代浏览器的标准 Referrer 控制策略，作为 `rel="noreferrer"` 的补充和替代 |

#### 3.2 `<iframe>` 标签 - 沙箱隔离

```go
case "iframe":
    return []string{"sandbox", "loading"}, 
           []string{
               `sandbox="allow-scripts allow-same-origin allow-popups"`,
               `loading="lazy"`,
           }
```

| 属性 | 安全作用 |
|------|----------|
| **`sandbox`** | HTML5 沙箱机制，将 iframe 置于受限环境中：<br>- ✅ `allow-scripts`：允许视频播放器运行 JavaScript<br>- ✅ `allow-same-origin`：允许 iframe 访问自身源的 API（视频播放器需要）<br>- ✅ `allow-popups`：允许用户点击后弹出新窗口（如全屏、分享）<br>- ❌ **默认禁止**：表单提交、顶级导航、模态框、指针锁定等危险操作 |
| **`loading="lazy"`** | 懒加载，提升页面加载速度，减少带宽消耗 |

#### 3.3 `<img>` 标签 - 图片隐私与性能

```go
case "img":
    return []string{"loading"}, 
           []string{`loading="lazy"`, `referrerpolicy="no-referrer"`}
```

| 属性 | 作用 |
|------|------|
| **`loading="lazy"`** | 图片懒加载，仅当滚动到可视区域时才加载，显著提升长文章加载速度 |
| **`referrerpolicy="no-referrer"`** | 加载图片时不发送 Referer 头，防止：<br>1. 图片服务器追踪用户阅读行为<br>2. 泄露订阅的 RSS 源 URL<br>3. 规避某些图片防盗链（反而可能导致加载失败，但为了隐私做的权衡） |

#### 3.4 `<video>` / `<audio>` 标签 - 媒体控制

```go
case "video", "audio":
    return []string{"controls"}, []string{"controls"}
```

| 属性 | 作用 |
|------|------|
| **`controls`** | 强制显示播放控制条，防止：<br>1. 自动播放声音干扰用户<br>2. 隐藏播放器用于追踪或其他恶意目的<br>3. 确保用户可以控制播放/暂停/音量 |

---

## 整体安全架构总结

### 多层防御体系

```
净化流程 → 标签白名单 → 属性过滤 → URL 校验 → 安全属性注入
    ↓          ↓           ↓          ↓           ↓
  移除恶意   仅保留     过滤危险     校验       强制添加
  脚本标签   安全标签   属性/事件    协议/域名   安全属性
```

### 设计原则

1. **默认拒绝**：不在白名单中的标签、属性、域名一律拒绝
2. **最小权限**：只授予元素正常工作所需的最少权限
3. **纵深防御**：多层校验（白名单 + 属性注入 + 沙箱）
4. **隐私优先**：通过 `referrerpolicy` 减少用户行为泄露
5. **体验平衡**：在安全前提下不破坏正常内容的可读性和可用性

### 参考测试用例

所有安全策略都在 [sanitizer_test.go](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer_test.go) 中得到验证：
- [TestWrapYoutubeIFrames](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer_test.go#L307-L314) - 视频包裹测试
- [TestValidIFrame](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer_test.go#L167-L174) - 同源 iframe 测试
- [TestInvalidIFrame](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer_test.go#L177-L184) - 非同源 iframe 拦截测试
- [TestRelativeURL](file:///e:/solo-code-2/yarr/src/content/sanitizer/sanitizer_test.go#L97-L104) - 链接安全属性注入测试
