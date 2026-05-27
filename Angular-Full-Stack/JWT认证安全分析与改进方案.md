# JWT 认证安全分析与改进方案

## 一、问题分析

### 1. 客户端直接解析 JWT 令牌导致的状态不一致问题

当前 [auth.service.ts](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/auth.service.ts#L19-L25) 构造函数的实现：

```typescript
constructor() {
  const token = localStorage.getItem('token');
  if (token) {
    const decodedUser = this.decodeUserFromToken(token);
    this.setCurrentUser(decodedUser);
  }
}
```

**存在的问题：**

- **无过期时间校验**：直接信任 localStorage 中的 token，未检查 `exp` 声明，已过期的令牌仍会被视为有效
- **无后端验证**：JWT 是自包含令牌，客户端可以解码读取 payload，但无法验证令牌是否已在服务端被吊销（如用户修改密码、管理员强制登出等场景）
- **状态不一致风险**：
  - 后端已吊销令牌，但前端仍显示登录状态
  - 令牌实际已过期，但前端仍允许访问受保护页面
  - 用户权限在后端已变更，但前端仍使用旧的权限信息

### 2. 令牌过期或被吊销时 loggedIn 信号保持 true 的异常影响

当前 [auth-guard-login.service.ts](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/auth-guard-login.service.ts#L9-L11) 的实现：

```typescript
canActivate(): boolean {
  return this.auth.loggedIn();
}
```

**对用户操作与体验的异常影响：**

| 异常场景 | 用户体验影响 | 技术后果 |
|---------|-------------|---------|
| **令牌已过期** | 用户可以进入个人中心页面，但所有 API 请求返回 401 错误 | 页面显示异常、操作静默失败、用户困惑 |
| **令牌已被吊销** | 用户界面显示已登录，但点击任何需要权限的按钮都会失败 | 用户需要重新登录但界面无任何提示 |
| **权限已变更** | 用户仍然可以看到管理员菜单，但实际无法执行操作 | 界面与实际权限不符，误导用户 |
| **并发登录限制** | 用户在其他设备登出后，当前设备仍显示在线 | 安全风险，无法确保单一设备登录策略 |

**典型用户路径异常：**
1. 用户登录成功 → 关闭浏览器
2. 3天后重新打开网站 → localStorage 中 token 已过期
3. 前端构造函数解析 token → 设置 `loggedIn = true`
4. 用户点击"个人中心" → 路由守卫放行
5. 页面加载后调用 API 获取用户信息 → 返回 401 未授权
6. 用户看到空白页面或错误信息 → 体验极差

---

## 二、改进方案设计

### 方案一：路由守卫拦截 + 后端令牌校验（推荐）

#### 1. 后端新增令牌校验接口

在服务端新增 `/api/auth/verify` 接口，用于验证令牌有效性：

```javascript
// 后端示例代码（Node.js/Express）
app.get('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ valid: false });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // 检查令牌是否在吊销列表中
    if (tokenBlacklist.has(token)) {
      return res.status(401).json({ valid: false, reason: 'revoked' });
    }
    res.json({ valid: true, user: decoded.user });
  } catch (err) {
    res.status(401).json({ valid: false, reason: 'expired' });
  }
});
```

#### 2. 前端 UserService 新增校验方法

修改 [user.service.ts](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/user.service.ts)：

```typescript
verifyToken(): Observable<{ valid: boolean; user?: User; reason?: string }> {
  return this.http.get<{ valid: boolean; user?: User; reason?: string }>('/api/auth/verify');
}
```

#### 3. 改进 AuthService

```typescript
@Injectable()
export class AuthService {
  private userService = inject(UserService);
  private router = inject(Router);
  private jwtHelper = inject(JwtHelperService);

  loggedIn = signal<boolean>(false);
  isAdmin = signal<boolean>(false);
  currentUser = signal<User>(new User());
  isVerifying = signal<boolean>(false);

  constructor() {
    const token = localStorage.getItem('token');
    if (token && !this.jwtHelper.isTokenExpired(token)) {
      const decodedUser = this.decodeUserFromToken(token);
      this.setCurrentUser(decodedUser);
    }
  }

  async verifyTokenOnServer(): Promise<boolean> {
    const token = localStorage.getItem('token');
    if (!token || this.jwtHelper.isTokenExpired(token)) {
      this.logout();
      return false;
    }

    this.isVerifying.set(true);
    try {
      const result = await firstValueFrom(this.userService.verifyToken());
      if (result.valid && result.user) {
        this.setCurrentUser(result.user);
        return true;
      } else {
        this.logout();
        return false;
      }
    } catch {
      this.logout();
      return false;
    } finally {
      this.isVerifying.set(false);
    }
  }

  // ... 其他方法保持不变
}
```

#### 4. 改进 AuthGuardLogin 路由守卫

```typescript
@Injectable()
export class AuthGuardLogin implements CanActivate {
  auth = inject(AuthService);
  router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    if (!this.auth.loggedIn()) {
      return this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    
    return from(this.auth.verifyTokenOnServer()).pipe(
      map(valid => valid ? true : this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }))
    );
  }
}
```

---

### 方案二：静默刷新令牌机制（Silent Refresh）

#### 1. 后端支持 Refresh Token

后端需要支持 refresh token 机制，提供 `/api/auth/refresh` 接口：

```javascript
app.post('/api/auth/refresh', (req, res) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken || refreshTokenBlacklist.has(refreshToken)) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const newAccessToken = jwt.sign(
      { user: decoded.user },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.json({ token: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: 'Refresh token expired' });
  }
});
```

#### 2. 前端 AuthService 集成静默刷新

```typescript
@Injectable()
export class AuthService {
  private refreshTimeout?: ReturnType<typeof setTimeout>;

  login(emailAndPassword: { email: string; password: string }): void {
    this.userService.login(emailAndPassword).subscribe({
      next: res => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('refreshToken', res.refreshToken);
        const decodedUser = this.decodeUserFromToken(res.token);
        this.setCurrentUser(decodedUser);
        this.scheduleRefresh(res.token);
        this.router.navigate(['/']);
      }
    });
  }

  scheduleRefresh(token: string): void {
    this.clearRefreshTimeout();
    const expirationDate = this.jwtHelper.getTokenExpirationDate(token);
    if (!expirationDate) return;
    
    const refreshBeforeMs = 60 * 1000; // 提前1分钟刷新
    const delay = expirationDate.getTime() - Date.now() - refreshBeforeMs;
    
    if (delay > 0) {
      this.refreshTimeout = setTimeout(() => this.refreshToken(), delay);
    }
  }

  refreshToken(): void {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return;
    
    this.userService.refreshToken(refreshToken).subscribe({
      next: res => {
        localStorage.setItem('token', res.token);
        const decodedUser = this.decodeUserFromToken(res.token);
        this.setCurrentUser(decodedUser);
        this.scheduleRefresh(res.token);
      },
      error: () => this.logout()
    });
  }

  clearRefreshTimeout(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = undefined;
    }
  }

  logout(): void {
    this.clearRefreshTimeout();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    this.loggedIn.set(false);
    this.isAdmin.set(false);
    this.currentUser.set(new User());
    this.router.navigate(['/']);
  }
}
```

---

### 方案三：HTTP 拦截器全局处理 401 错误

创建 HTTP 拦截器，在所有 API 请求返回 401 时自动登出：

```typescript
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  auth = inject(AuthService);
  router = inject(Router);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = localStorage.getItem('token');
    if (token) {
      request = request.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.auth.logout();
          this.router.navigate(['/login']);
        }
        return throwError(() => error);
      })
    );
  }
}
```

---

## 三、推荐实施方案

建议采用 **方案一 + 方案三** 的组合策略：

| 方案 | 适用场景 | 优点 | 缺点 |
|-----|---------|------|------|
| 路由守卫校验 | 页面切换时验证 | 确保进入页面前令牌有效，用户体验较好 | 每次路由切换增加一次 API 调用 |
| HTTP 拦截器 | API 请求层兜底 | 全局处理 401 错误，作为最后防线 | 错误发生时用户已在页面中 |
| 静默刷新 | 长时间活跃用户 | 用户无感知续期，体验最佳 | 实现复杂，需要后端配合 refresh token |

**实施步骤：**

1. **第一步**：修改构造函数增加本地过期检查（快速修复）
2. **第二步**：新增 HTTP 拦截器处理 401 错误（全局兜底）
3. **第三步**：改进路由守卫，在激活前调用后端校验接口（确保安全）
4. **第四步（可选）**：实现静默刷新机制（优化体验）

---

## 四、代码变更总结

需要修改的文件：

1. [auth.service.ts](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/auth.service.ts)
   - 构造函数增加 `jwtHelper.isTokenExpired()` 检查
   - 新增 `verifyTokenOnServer()` 方法
   
2. [user.service.ts](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/user.service.ts)
   - 新增 `verifyToken()` API 调用方法
   
3. [auth-guard-login.service.ts](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/auth-guard-login.service.ts)
   - 改为异步守卫，调用后端验证
   
4. [auth-guard-admin.service.ts](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/auth-guard-admin.service.ts)
   - 同样增加后端验证逻辑
   
5. 新增 `auth.interceptor.ts`（可选但推荐）
   - 全局处理 401 错误

通过以上改进，可以确保前端 `loggedIn` 信号与后端实际会话状态保持一致，有效提升应用的安全性和用户体验。
