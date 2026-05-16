# ArticleController.uploadImg 接口安全漏洞深度分析

## 一、漏洞代码定位

漏洞位于 [ArticleController.java](file:///e:/solo-code-2/VBlog/blogserver/src/main/java/org/sang/controller/ArticleController.java#L46-L71) 的 `uploadImg` 方法。

**关键漏洞代码段：**

```java
@RequestMapping(value = "/uploadimg", method = RequestMethod.POST)
public RespBean uploadImg(HttpServletRequest req, MultipartFile image) {
    // ...
    String filePath = "/blogimg/" + sdf.format(new Date());
    String imgFolderPath = req.getServletContext().getRealPath(filePath);  // 风险点1: 保存到web可访问目录
    // ...
    // 风险点2: 仅去除空格，保留原始文件扩展名
    String imgName = UUID.randomUUID() + "_" + image.getOriginalFilename().replaceAll(" ", "");
    try {
        // 风险点3: 直接写入，无任何内容校验
        IOUtils.write(image.getBytes(), new FileOutputStream(new File(imgFolder, imgName)));
        url.append("/").append(imgName);
        return new RespBean("success", url.toString());
    } catch (IOException e) {
        e.printStackTrace();
    }
    return new RespBean("error", "上传失败!");
}
```

---

## 二、问题1：缺失的关键安全校验步骤

该接口在处理 `MultipartFile` 时，缺失了以下 **5个关键安全校验步骤**：

| 序号 | 缺失的安全校验 | 风险说明 | 代码位置 |
|------|---------------|----------|---------|
| 1 | **文件扩展名白名单校验** | 攻击者可上传 `.jsp`、`.jspx`、`.class` 等可执行文件 | 第62行 |
| 2 | **文件MIME类型校验** | 仅依赖 `Content-Type` 不可靠，但应作为基础校验 | - |
| 3 | **文件内容魔数校验** | 防止图片马（文件头伪造），确保是真正的图片文件 | 第64行 |
| 4 | **文件名路径遍历过滤** | 原始文件名可能包含 `../` 进行目录穿越 | 第62行 |
| 5 | **存储目录安全** | 使用 `getRealPath()` 保存到web应用可访问目录 | 第50行 |

### 跨模块风险关联

此漏洞还涉及以下模块的潜在风险：

1. **Web容器配置模块**：Tomcat的 `web.xml` 中默认注册了 `JspServlet`，处理 `*.jsp` 请求
2. **静态资源映射模块**：Spring MVC如果配置了 `<mvc:resources>` 或默认静态资源处理，会直接返回该目录下的文件
3. **权限控制模块**：如果 `/blogimg/**` 路径未被Spring Security保护，则匿名用户即可访问

---

## 三、问题2：渗透链路与部署配置条件

### 触发条件

攻击者上传 `shell.jsp` 木马并能成功执行，需要满足以下 **特定服务器部署配置**：

| 部署配置条件 | 说明 |
|------------|------|
| 1. Tomcat默认JSP Servlet启用 | `conf/web.xml` 中 `org.apache.jasper.servlet.JspServlet` 未被注释或移除 |
| 2. 应用context未禁用JSP | 应用的 `WEB-INF/web.xml` 未覆盖默认JSP servlet映射 |
| 3. `/blogimg/**` 可匿名访问 | Spring Security配置中该路径未被保护 |
| 4. Tomcat工作目录可写 | `getRealPath()` 返回的目录具有写入权限 |

### 完整渗透链路

```
攻击者上传shell.jsp
        ↓
[第62行] 文件名变为：550e8400-e29b-41d4-a716-446655440000_shell.jsp
        ↓
[第50行] 保存路径：{TOMCAT_HOME}/webapps/VBlog/blogimg/20260516/
        ↓
[第64行] 文件被写入磁盘：.../blogimg/20260516/550e8400-e29b-41d4-a716-446655440000_shell.jsp
        ↓
攻击者访问：http://victim:8080/VBlog/blogimg/20260516/550e8400-e29b-41d4-a716-446655440000_shell.jsp
        ↓
Tomcat的JspServlet匹配到.jsp后缀，将文件编译为Servlet执行
        ↓
攻击者获得WebShell，获取服务器权限
```

### 为什么UUID前缀不影响攻击？

UUID前缀只是文件名的一部分，**文件扩展名 `.jsp` 才是关键**。只要扩展名是 `.jsp`，无论前缀是什么，Tomcat的JSP Servlet都会匹配并尝试编译执行该文件。

---

## 四、问题3：彻底封堵漏洞的修复方案

### 方案一：完整安全校验代码（推荐）

```java
import org.apache.commons.io.FilenameUtils;
import org.springframework.util.StringUtils;
import java.io.InputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

// 允许的图片扩展名白名单
private static final Set<String> ALLOWED_IMAGE_EXTENSIONS = 
    new HashSet<>(Arrays.asList("jpg", "jpeg", "png", "gif", "bmp", "webp"));

// 图片文件魔数（文件头）
private static final byte[][] IMAGE_MAGIC_NUMBERS = {
    {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF},       // JPEG
    {(byte) 0x89, 0x50, 0x4E, 0x47},               // PNG
    {0x47, 0x49, 0x46, 0x38},                      // GIF
    {0x42, 0x4D},                                   // BMP
    {(byte) 0x52, 0x49, 0x46, 0x46}                 // WebP
};

@RequestMapping(value = "/uploadimg", method = RequestMethod.POST)
public RespBean uploadImg(HttpServletRequest req, MultipartFile image) {
    if (image == null || image.isEmpty()) {
        return new RespBean("error", "上传文件不能为空");
    }

    // 1. 获取并清理原始文件名
    String originalFilename = StringUtils.cleanPath(image.getOriginalFilename());
    if (originalFilename.contains("..")) {
        return new RespBean("error", "非法文件名");
    }

    // 2. 白名单校验文件扩展名
    String extension = FilenameUtils.getExtension(originalFilename).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.contains(extension)) {
        return new RespBean("error", "只允许上传图片文件");
    }

    // 3. 校验文件内容魔数（防止图片马）
    try (InputStream is = image.getInputStream()) {
        byte[] fileHeader = new byte[8];
        int read = is.read(fileHeader);
        if (read < 2) {
            return new RespBean("error", "文件内容无效");
        }
        
        boolean validImage = false;
        for (byte[] magic : IMAGE_MAGIC_NUMBERS) {
            if (startsWith(fileHeader, magic)) {
                validImage = true;
                break;
            }
        }
        if (!validImage) {
            return new RespBean("error", "文件内容不是有效的图片");
        }
    } catch (IOException e) {
        return new RespBean("error", "文件校验失败");
    }

    // 4. 生成安全的文件名（不保留原始扩展名也可，这里保留但已校验）
    String safeFileName = UUID.randomUUID().toString() + "." + extension;
    
    // 5. 保存到Web应用外部目录（关键！不要使用getRealPath）
    // 建议配置在application.properties中：upload.path=/data/blog/images
    String uploadBasePath = env.getProperty("upload.path", "/var/blog/uploads");
    String datePath = sdf.format(new Date());
    File uploadDir = new File(uploadBasePath, datePath);
    if (!uploadDir.exists()) {
        uploadDir.mkdirs();
    }
    
    File destFile = new File(uploadDir, safeFileName);
    try {
        image.transferTo(destFile);
    } catch (IOException e) {
        e.printStackTrace();
        return new RespBean("error", "文件保存失败");
    }

    // 6. 返回的URL应该通过专门的图片访问接口，而不是直接访问静态资源
    // 例如：/article/image/20260516/550e8400-e29b-41d4-a716-446655440000.png
    String accessUrl = req.getContextPath() + "/article/image/" + datePath + "/" + safeFileName;
    
    return new RespBean("success", accessUrl);
}

private boolean startsWith(byte[] data, byte[] prefix) {
    if (data.length < prefix.length) return false;
    for (int i = 0; i < prefix.length; i++) {
        if (data[i] != prefix[i]) return false;
    }
    return true;
}
```

### 方案二：新增图片访问接口（配合方案一使用）

```java
// 图片访问接口，从外部目录读取并返回
@GetMapping("/image/{datePath}/{fileName}")
public void getImage(@PathVariable String datePath, 
                     @PathVariable String fileName,
                     HttpServletResponse response) throws IOException {
    // 再次校验文件名
    if (fileName.contains("..")) {
        response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
        return;
    }
    
    String extension = FilenameUtils.getExtension(fileName).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.contains(extension)) {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        return;
    }

    String uploadBasePath = env.getProperty("upload.path", "/var/blog/uploads");
    File imageFile = new File(new File(uploadBasePath, datePath), fileName);
    
    if (!imageFile.exists()) {
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
        return;
    }

    // 设置正确的Content-Type
    response.setContentType("image/" + (extension.equals("jpg") ? "jpeg" : extension));
    
    try (FileInputStream fis = new FileInputStream(imageFile);
         OutputStream os = response.getOutputStream()) {
        IOUtils.copy(fis, os);
    }
}
```

### 方案三：部署加固（运维层面）

1. **禁用Tomcat的JSP Servlet**（如果应用不需要JSP）：
   在应用的 `WEB-INF/web.xml` 中添加：
   ```xml
   <servlet-mapping>
       <servlet-name>jsp</servlet-name>
       <url-pattern>*.jsp</url-pattern>
   </servlet-mapping>
   ```
   然后映射到403或404。

2. **Spring Security保护静态资源路径**：
   ```java
   @Override
   protected void configure(HttpSecurity http) throws Exception {
       http.authorizeRequests()
           .antMatchers("/blogimg/**").denyAll()  // 直接禁止访问
           // 或 .antMatchers("/blogimg/**").authenticated()
           .anyRequest().authenticated();
   }
   ```

3. **Tomcat配置文件上传大小限制**：
   在 `server.xml` 的Connector中添加：
   ```xml
   <Connector ... maxPostSize="5242880" />  <!-- 限制5MB -->
   ```

---

## 五、修复效果总结

| 修复措施 | 解决的风险 |
|---------|-----------|
| 扩展名白名单校验 | 阻止 `.jsp`、`.jspx` 等可执行文件上传 |
| 文件魔数校验 | 阻止图片马（头部是图片，内容是webshell） |
| 存储目录移出webapps | 即使上传了恶意文件也无法通过URL执行 |
| 独立的图片访问接口 | 统一入口，可添加权限控制和水印处理 |
| 文件名清理 | 防止路径遍历攻击 |

**核心原则**：文件上传的安全本质是 **"上传的文件永远不应该被当作代码执行"**。
