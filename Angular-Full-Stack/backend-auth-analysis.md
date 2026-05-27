# 后端身份验证与角色授权分析

## 一、问题分析

### 1. 匿名用户直接调用后端 API 的情况

在 [server/routes.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/routes.ts) 中，所有用户相关路由被直接挂载到控制器方法，没有任何 `AuthMiddleware` 或 `Authorization` 中间件：

```ts
router.route('/users').get(userCtrl.getAll);
router.route('/user/:id').delete(userCtrl.delete);
```

这意味着：

- **匿名 GET `/api/users`**：请求会直接进入 `UserCtrl.getAll`，只要数据库可访问，就会返回 **200 OK** + 所有用户数据。系统相当于把用户列表暴露给互联网。
- **匿名 DELETE `/api/user/ID`**：请求会直接进入 `BaseCtrl.delete`，只要传入一个合法的 `_id`，就会返回 **200 OK**（或 204）并删除该用户记录。任何知道用户 ID 的人都可以把用户删光。

更糟糕的是，`/user`（POST 创建）也没有任何防护，任何人都可以随意注册管理员账号，然后登录获取 token 进行更多操作。

**结论**：后端的响应当前是"无条件放行"。只有在 Controller 内部显式做了判断（如 `login` 方法里校验密码）才会返回 403；其余接口一律按正常业务逻辑处理。

---

### 2. 前端 Guard 为什么保护不了后端 API

前端的 [AuthGuardLogin](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/auth-guard-login.service.ts) 与 [AuthGuardAdmin](file:///e:/solo-code-2/Angular-Full-Stack/client/app/services/auth-guard-admin.service.ts) 工作在 Angular 的 `canActivate` 钩子上，它们的作用是：

- 决定浏览器端**是否渲染某个页面组件**；
- 并**不能**拦截后端 Express 对 HTTP 请求的处理。

原因如下：

1. **Guard 只在 Angular 路由切换时生效**。它根本不参与 XMLHttpRequest / fetch 调用。直接用 `curl`、Postman、Burp Suite 或任何 HTTP 客户端发起请求，Angular 应用甚至不会被加载，Guard 完全无从执行。
2. **前端代码在用户手中**。攻击者可以：
   - 在浏览器 DevTools 里直接修改 `localStorage`/`sessionStorage`，伪造 `loggedIn()` 返回值；
   - 用 JS 控制台调用 `fetch('/api/users')` 直接读取数据；
   - 反编译 JS，绕过所有 `canActivate` 检查。
3. **网络层不可控**。前端做的任何"校验"本质上只是 UI 层的便利——比如跳到登录页、提示权限不足——并不能阻止请求到达服务器。

所以只在前端做拦截最多只能"改善用户体验"，**无法提供任何真正的安全保障**。真正的授权必须发生在**请求到达业务逻辑之前的服务器端**。

---

## 二、JWT 验证中间件设计

我们设计一个基于 `jsonwebtoken` 的中间件模块，放在 `server/middlewares/auth.middleware.ts`，并提供两个工厂函数：

- `authenticate`：校验 token，把解析后的用户信息挂载到 `req.user`；
- `authorize(...roles)`：在 `authenticate` 之后校验 `role` 是否匹配。

### 代码实现

```ts
// server/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verify, Secret } from 'jsonwebtoken';

const secret: Secret = process.env.SECRET_TOKEN as string;

export interface AuthRequest extends Request {
  user?: { _id: string; email: string; role: string };
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verify(token, secret) as { user: AuthRequest['user'] };
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const authorize = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient privileges' });
      return;
    }
    next();
  };
```

> 注意：token 载荷结构必须与 [server/controllers/user.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/controllers/user.ts) 中 `sign({ user }, secret, ...)` 保持一致，即 `{ user: { _id, email, role, ... } }`。

### 路由接入方式

修改 [server/routes.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/routes.ts)：

```ts
import { authenticate, authorize } from './middlewares/auth.middleware';

router.route('/users')
  .get(authenticate, authorize('admin'), userCtrl.getAll);

router.route('/user/:id')
  .get(authenticate, userCtrl.get)
  .put(authenticate, authorize('admin'), userCtrl.update)
  .delete(authenticate, authorize('admin'), userCtrl.delete);

router.route('/user')
  .post(userCtrl.insert); // 注册接口保持公开

router.route('/login').post(userCtrl.login); // 登录接口保持公开
```

### 前端需要配合的改动

前端每次请求时都要在 header 中携带 token：

```ts
// client/app/services/auth.service.ts
getAuthHeaders(): HttpHeaders {
  const token = localStorage.getItem('token');
  return new HttpHeaders({ Authorization: `Bearer ${token}` });
}
```

并在 `HttpInterceptor` 中统一注入，避免每个服务重复写。

---

## 三、效果总结

| 场景 | 改造前 | 改造后 |
| --- | --- | --- |
| 未登录用户 GET `/api/users` | 200，返回全部用户 | 401 `No token provided` |
| 普通用户 DELETE `/api/user/ID` | 200，用户被删除 | 403 `Forbidden` |
| 管理员 DELETE `/api/user/ID` | 200（正常） | 200（正常） |
| 伪造过期 token 访问任意接口 | 200 | 401 `Invalid or expired token` |

前端 Guard 继续保留用于**用户体验**（阻止未登录用户访问管理页面并自动跳转到登录页），但它不再被当作安全措施；真正的访问控制下沉到 Express 中间件层，任何绕过前端的请求都会被后端拦住。
