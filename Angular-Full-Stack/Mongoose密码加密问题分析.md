# Mongoose 密码加密问题深度分析

## 问题概述

在 Angular-Full-Stack 项目中，用户更新密码时出现明文密码存储问题，导致登录验证失败。本文将深入分析问题根源并提供解决方案。

---

## 问题 1：为什么 `findOneAndUpdate` 会绕过 `preSave` 前置钩子？

### 1.1 核心代码分析

**模型中的 preSave 钩子** ([user.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/models/user.ts#L22-L34)):

```typescript
userSchema.pre<IUser>('save', function(next): void {
  const user = this;
  if (!user.isModified('password')) { return next(); }
  genSalt(10, (err, salt) => {
    if (err) { return next(err); }
    hash(user.password, salt, (error, hashedPassword) => {
      if (error) { return next(error); }
      user.password = hashedPassword;
      next();
    });
  });
});
```

**控制器中的 update 方法** ([user.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/controllers/user.ts#L30-L41)):

```typescript
update = async (req: Request, res: Response) => {
  try {
    const user = await this.model.findOneAndUpdate({ _id: req.params.id }, req.body, { new: true });
    // ...
  } catch (err) {
    // ...
  }
};
```

### 1.2 根本原因

**Mongoose 中间件执行机制的本质区别：**

| 方法 | 执行路径 | 是否触发 `pre('save')` |
|------|----------|-----------------------|
| `document.save()` | Mongoose 文档实例 → 验证 → 中间件 → 数据库 | ✅ **触发** |
| `Model.findOneAndUpdate()` | 直接发送 MongoDB 更新命令 → 数据库 | ❌ **不触发** |

### 1.3 技术深度解析

1. **`save()` 方法的完整流程**：
   ```
   new Model(data) 
       ↓
   document.validate() 
       ↓
   pre('save') 钩子执行 
       ↓
   实际数据库写入
   ```

2. **`findOneAndUpdate()` 的流程**：
   ```
   构造 MongoDB update 操作符 ($set, etc.)
       ↓
   直接发送命令给 MongoDB
       ↓
   返回更新后的文档
       ↓
   ❌ 跳过所有文档级中间件
   ```

3. **设计意图**：
   - `findOneAndUpdate` 是为高性能批量更新设计的原子操作
   - 绕过 Mongoose 文档层可以获得显著的性能提升
   - 这是 Mongoose 的**预期行为**，而非 Bug

---

## 问题 2：`comparePassword` 比对失败的底层逻辑

### 2.1 comparePassword 实现

**代码位置** ([user.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/models/user.ts#L37-L42)):

```typescript
userSchema.methods.comparePassword = function(candidatePassword: string, callback: any): void {
  compare(candidatePassword, this.password, (err, isMatch) => {
    if (err) { return callback(err); }
    callback(null, isMatch);
  });
};
```

### 2.2 bcryptjs 底层比对原理

#### 正常流程（数据库存储哈希值）：

```
用户输入: "myPassword123"
    ↓
bcrypt.compare("myPassword123", "$2a$10$N9qo8uLOickgx2ZMRZoMye...")
    ↓
1. 从哈希中提取盐值: $2a$10$N9qo8uLOickgx2ZMRZoMye
2. 使用相同盐值和成本因子哈希候选密码
3. 字节级比较两个哈希结果
    ↓
返回: true / false
```

#### 异常流程（数据库存储明文密码）：

```
用户输入: "myPassword123"
    ↓
bcrypt.compare("myPassword123", "myPassword123")
    ↓
1. 尝试解析第二个参数为 bcrypt 哈希格式
2. 明文 "myPassword123" 不符合 $2a$xx$... 格式
3. 解析失败，抛出错误或返回 false
    ↓
返回: false ❌
```

### 2.3 bcrypt 哈希格式详解

标准 bcrypt 哈希结构：
```
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
 \_/ \_/ \____________________/\_____________________________/
  |   |           |                       |
  |   |           |                       +---- 31字符: 哈希结果
  |   |           +---------------------------- 22字符: 盐值 (base64)
  |   +---------------------------------------- 2位: 成本因子 (2^10 = 1024轮)
  +-------------------------------------------- 版本标识 ($2a, $2b, $2y)
```

---

## 问题 3：重构方案与最佳实践

### 方案对比

| 方案 | 实现方式 | 优点 | 缺点 | 推荐指数 |
|------|----------|------|------|---------|
| **方案A** | 重构 update 使用 save() | 触发完整中间件链 | 两次数据库查询 | ⭐⭐⭐⭐⭐ |
| **方案B** | 添加 pre('findOneAndUpdate') | 无需修改控制器 | 逻辑分散 | ⭐⭐⭐⭐ |
| **方案C** | update 中手动哈希 | 最灵活 | 代码重复 | ⭐⭐⭐ |

---

### 方案 A：重构 update 方法（推荐）

**修改文件**: [server/controllers/user.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/controllers/user.ts)

```typescript
update = async (req: Request, res: Response) => {
  try {
    // 1. 先查找用户文档
    const user = await this.model.findOne({ _id: req.params.id });
    if (!user) {
      return res.sendStatus(404);
    }

    // 2. 更新文档属性（触发 isModified 检测）
    Object.assign(user, req.body);

    // 3. 保存文档（触发 pre('save') 钩子）
    const updatedUser = await user.save();

    const token = sign({ user: updatedUser }, secret, { expiresIn: '24h' });
    return res.status(200).json({ token });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
};
```

**为什么推荐**：
- ✅ 复用现有的 `pre('save')` 逻辑，保持 DRY 原则
- ✅ 触发完整的 Mongoose 验证和中间件链
- ✅ `isModified('password')` 检测自动生效，只在密码变更时哈希

---

### 方案 B：添加 pre('findOneAndUpdate') 钩子

**修改文件**: [server/models/user.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/models/user.ts)

```typescript
import { compare, genSalt, hash } from 'bcryptjs';
import { model, Schema, Document } from 'mongoose';

// ... 现有代码 ...

// 为 update 操作添加前置钩子
userSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate() as any;
  
  // 处理不同的更新格式
  const password = update.$set?.password || update.password;
  
  if (password) {
    try {
      const salt = await genSalt(10);
      const hashedPassword = await hash(password, salt);
      
      if (update.$set) {
        update.$set.password = hashedPassword;
      } else {
        update.password = hashedPassword;
      }
    } catch (err) {
      return next(err as Error);
    }
  }
  next();
});

// ... 现有代码 ...
```

**注意事项**：
- `this` 上下文是 Query 对象，不是 Document
- 需要同时处理 `update.password` 和 `update.$set.password` 两种格式
- 不会触发 Document 级别的验证器

---

### 方案 C：在控制器中手动哈希

**修改文件**: [server/controllers/user.ts](file:///e:/solo-code-2/Angular-Full-Stack/server/controllers/user.ts)

```typescript
import { hash, genSalt } from 'bcryptjs';

// ...

update = async (req: Request, res: Response) => {
  try {
    const updateData = { ...req.body };
    
    // 如果更新包含密码字段，先哈希
    if (updateData.password) {
      const salt = await genSalt(10);
      updateData.password = await hash(updateData.password, salt);
    }

    const user = await this.model.findOneAndUpdate(
      { _id: req.params.id }, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.sendStatus(404);
    }
    
    const token = sign({ user }, secret, { expiresIn: '24h' });
    return res.status(200).json({ token });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
};
```

---

## 最佳实践建议

### 1. 统一使用方案 A（使用 save()）

这是最符合 Mongoose 设计哲学的方案，确保：
- 所有业务逻辑集中在模型中间件
- 验证器完整执行
- 代码可维护性最高

### 2. 添加 `runValidators` 选项

如果继续使用 `findOneAndUpdate`，务必添加验证器：

```typescript
this.model.findOneAndUpdate(query, update, {
  new: true,
  runValidators: true,  // 启用 Schema 验证
  context: 'query'      // 让验证器访问查询上下文
})
```

### 3. 密码字段选择性更新

在前端或路由层确保只在必要时更新密码字段，避免覆盖：

```typescript
// 只更新允许修改的字段
const { password, username, email } = req.body;
const updateData: any = { username, email };
if (password) updateData.password = password;
```

### 4. 单元测试覆盖

添加测试用例验证密码加密行为：

```typescript
// 更新密码后应该是哈希值，不是明文
it('should hash password when updating', async () => {
  const user = await User.create({ email: 'test@test.com', password: 'pass123' });
  await User.findOneAndUpdate({ _id: user._id }, { password: 'newpass456' });
  const updated = await User.findById(user._id).select('+password');
  expect(updated.password).not.toEqual('newpass456');
  expect(updated.password.startsWith('$2a$')).toBe(true);
});
```

---

## 总结

| 问题 | 根本原因 | 解决方案 |
|------|----------|----------|
| preSave 未触发 | `findOneAndUpdate` 绕过文档层 | 改用 `find()` + `save()` 或添加 `pre('findOneAndUpdate')` |
| 密码比对失败 | 明文密码不符合 bcrypt 哈希格式 | 确保存储前正确哈希 |
| 最佳实践 | 保持业务逻辑在模型层 | 使用方案 A，通过 `save()` 触发完整中间件 |

**关键结论**：Mongoose 的 Query 方法和 Document 方法有本质区别，理解这一点是避免此类问题的核心。
