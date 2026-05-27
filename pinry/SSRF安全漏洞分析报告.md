# Pinry 项目 SSRF 安全漏洞分析报告

## 漏洞概述

[core/models.py](file:///e:/solo-code-2/pinry/core/models.py) 中的 `ImageManager.create_for_url` 方法存在严重的**服务端请求伪造（SSRF）**漏洞及相关安全隐患。该方法接收用户可控的 `url` 和 `referer` 参数，直接使用 `requests.get` 发起网络请求，未进行任何安全过滤。

---

## 问题1：SSRF 内网资产探测风险

### 漏洞代码位置

[create_for_url 方法](file:///e:/solo-code-2/pinry/core/models.py#L37-L54) 第43行：

```python
response = requests.get(url, headers=headers)
```

### 攻击场景

当恶意用户传入指向内网IP的URL时（如 `http://127.0.0.1:8080/`、`http://192.168.1.1:22/`、`http://10.0.0.1/admin/`），系统会：

1. **直接发起内网请求**：服务器作为代理向内网IP发送HTTP请求
2. **通过响应差异探测资产**：根据响应时间、错误信息、返回内容判断端口是否开放、服务是否存在
3. **绕过访问控制**：访问原本只允许内网访问的管理界面、API接口

### 安全隐患

| 风险类型 | 具体危害 |
|---------|---------|
| **内网资产探测** | 攻击者可绘制内网拓扑图，识别数据库、Redis、缓存服务等内网资源 |
| **敏感信息泄露** | 访问内网元数据服务（如AWS EC2 `http://169.254.169.254/`）获取凭证 |
| **端口扫描** | 对服务器所在网络进行端口扫描，发现可攻击目标 |
| **未授权访问** | 访问内网管理后台、数据库Web管理界面（如phpMyAdmin） |
| **DoS放大** | 请求内网大文件或慢接口，造成服务器资源耗尽 |
| **协议 smuggling** | 利用URL解析差异攻击其他内网服务 |

---

## 问题2：图片校验的局限性分析

### 校验代码位置

[_is_valid_image 方法](file:///e:/solo-code-2/pinry/core/models.py#L24-L34)：

```python
@staticmethod
def _is_valid_image(fp):
    fp.seek(0)
    try:
        PIL.Image.open(fp)
    except PIL.UnidentifiedImageError:
        fp.seek(0)
        return False
    else:
        fp.seek(0)
        return True
```

### 2.1 能否防范 DoS 攻击？

**结论：不能。**

**原因分析：**

1. **超大像素图片（解压炸弹）**
   - `PIL.Image.open()` 只读取文件头，不会立即解压全部像素数据
   - 恶意构造的"图片炸弹"（如 100000x100000 像素的ZIP压缩PNG）在后续处理时才会耗尽内存
   - 代码第53行生成缩略图时才真正解压像素：`Thumbnail.objects.get_or_create_at_sizes(...)`

2. **超大文件下载**
   - 代码第44行直接写入全部响应内容：`buf.write(response.content)`
   - 无文件大小限制，攻击者可提供GB级文件触发OOM

3. **慢请求攻击**
   - `requests.get` 默认无超时设置，攻击者可通过慢速发送响应耗尽连接池

### 2.2 能否防范脚本执行？

**结论：无法防范文件上传后的脚本执行风险，但PIL本身不会执行脚本。**

**原因分析：**

1. **PIL 的安全性**
   - `PIL.Image.open()` 主要识别文件头，不执行嵌入的脚本
   - 但某些格式（如SVG）如果被错误处理可能存在XXE风险

2. **实际风险点**
   - 代码保存的文件名为 `url.split("/")[-1]`（第38行），未做扩展名强制校验
   - 如果Web服务器配置不当，保存的文件可能被解析为脚本执行
   - 例如：`url=http://evil.com/shell.php%00.png` 可能在某些环境下被解析为PHP

---

## 问题3：Django 安全修复方案

### 修复方案概览

需实现四层防护：**URL 安全解析 → 内网IP过滤 → 下载大小限制 → 超时控制**

### 3.1 URL 安全解析与内网过滤

```python
import ipaddress
import socket
from urllib.parse import urlparse

def is_safe_url(url):
    """检查URL是否指向公网资源，禁止内网访问"""
    try:
        parsed = urlparse(url)
        
        # 仅允许HTTP/HTTPS协议
        if parsed.scheme not in ('http', 'https'):
            return False
        
        # 解析主机名
        hostname = parsed.hostname
        if not hostname:
            return False
        
        # 解析IP地址（处理域名）
        try:
            ip = socket.gethostbyname(hostname)
        except socket.gaierror:
            return False
        
        # 检查是否为内网/保留IP
        ip_obj = ipaddress.ip_address(ip)
        
        # 禁止的IP范围
        blocked_ranges = [
            ipaddress.ip_network('127.0.0.0/8'),      # 回环
            ipaddress.ip_network('10.0.0.0/8'),       # 私网A类
            ipaddress.ip_network('172.16.0.0/12'),    # 私网B类
            ipaddress.ip_network('192.168.0.0/16'),   # 私网C类
            ipaddress.ip_network('169.254.0.0/16'),   # 链路本地
            ipaddress.ip_network('0.0.0.0/8'),        # 本网络
            ipaddress.ip_network('::1/128'),          # IPv6回环
            ipaddress.ip_network('fc00::/7'),         # IPv6私网
            ipaddress.ip_network('fe80::/10'),        # IPv6链路本地
        ]
        
        for network in blocked_ranges:
            if ip_obj in network:
                return False
        
        return True
    except Exception:
        return False
```

### 3.2 限制下载大小与超时

```python
import requests
from django.conf import settings

MAX_DOWNLOAD_SIZE = getattr(settings, 'MAX_IMAGE_DOWNLOAD_SIZE', 10 * 1024 * 1024)  # 10MB
REQUEST_TIMEOUT = getattr(settings, 'IMAGE_REQUEST_TIMEOUT', 10)  # 10秒

def safe_download_image(url, referer=None):
    """安全下载图片，限制大小和超时"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.82 Safari/537.36',
    }
    if referer:
        headers['Referer'] = referer
    
    # 使用 stream=True 避免一次性加载全部内容
    response = requests.get(
        url, 
        headers=headers, 
        stream=True, 
        timeout=REQUEST_TIMEOUT,
        allow_redirects=False  # 禁止重定向，防止绕过SSRF防护
    )
    response.raise_for_status()
    
    # 检查 Content-Length
    content_length = response.headers.get('Content-Length')
    if content_length and int(content_length) > MAX_DOWNLOAD_SIZE:
        raise ValueError("File too large")
    
    # 分块下载并实时检查大小
    buf = BytesIO()
    downloaded = 0
    for chunk in response.iter_content(chunk_size=8192):
        downloaded += len(chunk)
        if downloaded > MAX_DOWNLOAD_SIZE:
            raise ValueError("File too large")
        buf.write(chunk)
    
    return buf
```

### 3.3 强化图片校验

```python
from PIL import Image

MAX_IMAGE_PIXELS = getattr(settings, 'MAX_IMAGE_PIXELS', 4096 * 4096)  # 约1600万像素

def _is_valid_image(fp):
    """强化的图片校验，包含像素数量检查"""
    fp.seek(0)
    try:
        with Image.open(fp) as img:
            # 验证文件格式
            img.verify()
            
            # 重新打开（verify后文件指针位置变化）
            fp.seek(0)
            with Image.open(fp) as img2:
                # 检查像素数量，防止解压炸弹
                width, height = img2.size
                if width * height > MAX_IMAGE_PIXELS:
                    return False
                
                # 检查实际像素数据完整性
                img2.load()
                
        fp.seek(0)
        return True
    except (PIL.UnidentifiedImageError, PIL.Image.DecompressionBombError, Exception):
        fp.seek(0)
        return False
```

### 3.4 修复后的 create_for_url 方法

```python
def create_for_url(self, url, referer=None):
    # 1. URL安全检查
    if not is_safe_url(url):
        return None
    
    # 2. 安全下载
    try:
        buf = safe_download_image(url, referer)
    except Exception:
        return None
    
    # 3. 强化图片校验
    if not self._is_valid_image(buf):
        return None
    
    # 4. 强制安全的文件名
    file_name = url.split("/")[-1].split('#')[0].split('?')[0]
    # 只保留安全字符，限制长度
    file_name = ''.join(c for c in file_name if c.isalnum() or c in '._-')[:100]
    if not file_name:
        file_name = 'image'
    
    # 5. 确保文件扩展名匹配实际格式
    # ... (可选：根据PIL检测到的格式添加/修正扩展名)
    
    buf.seek(0)
    obj = InMemoryUploadedFile(buf, 'image', file_name,
                               None, buf.tell(), None)
    image = self.create(image=obj)
    Thumbnail.objects.get_or_create_at_sizes(image, settings.IMAGE_SIZES.keys())
    return image
```

### 3.5 额外安全建议

| 防护措施 | 说明 |
|---------|------|
| **出站防火墙规则** | 在网络层面限制服务器只能访问特定端口/网段 |
| **独立代理服务器** | 所有出站请求通过专用代理，代理配置严格的ACL |
| **DNS rebinding 防护** | 检查DNS解析结果，防止DNS重绑定攻击 |
| **速率限制** | 限制每个用户/IP的图片下载频率 |
| **异步任务处理** | 将下载逻辑移至Celery等异步队列，避免阻塞Web进程 |
| **白名单模式** | 如业务场景允许，仅允许访问预设的图片域名白名单 |

---

## 总结

当前 `create_for_url` 方法存在严重的SSRF漏洞，可被用于内网资产探测和敏感信息窃取。同时，图片校验机制不完善，无法有效防范DoS攻击。建议按照上述方案进行多层安全防护，重点实现URL安全解析、内网IP过滤、下载大小限制和超时控制。
