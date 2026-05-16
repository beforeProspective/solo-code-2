# TOCTOU 竞争条件深度分析 - 基于 UserService.reg() 方法

## 一、代码位置与原逻辑分析

**目标代码**：[UserService.java](file:///e:/solo-code-2/VBlog/blogserver/src/main/java/org/sang/service/UserService.java#L52-L70)

```java
public int reg(User user) {
    User loadUserByUsername = userMapper.loadUserByUsername(user.getUsername());
    if (loadUserByUsername != null) {
        return 1;  // 用户名重复
    }
    // 插入用户,插入之前先对密码进行加密
    user.setPassword(passwordEncoder.encode(user.getPassword()));
    user.setEnabled(true);
    long result = userMapper.reg(user);
    // 配置用户的角色，默认都是普通用户
    String[] roles = new String[]{"2"};
    int i = rolesMapper.addRoles(roles, user.getId());
    boolean b = i == roles.length && result == 1;
    return b ? 0 : 2;  // 0成功，2失败
}
```

**数据库表结构**（来自 [vueblog.sql](file:///e:/solo-code-2/VBlog/blogserver/src/main/resources/vueblog.sql#L244-L254)）：

```sql
CREATE TABLE `user` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(64) DEFAULT NULL,
  `nickname` varchar(64) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `enabled` tinyint(1) DEFAULT '1',
  `email` varchar(64) DEFAULT NULL,
  `userface` varchar(255) DEFAULT NULL,
  `regTime` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

> **关键发现**：`username` 字段 **没有** 唯一索引（Unique Key）约束。

---

## 二、问题1：TOCTOU 竞争条件解释与触发机制

### 2.1 什么是 TOCTOU？

**Time-Of-Check to Time-Of-Use (TOCTOU)** 是一类经典的软件竞争条件漏洞，发生在以下场景：

1. **Check（检查）**：程序先检查某个资源的状态（如"用户名是否存在"）
2. **Time Gap（时间差）**：在检查和使用之间存在不可控的时间窗口
3. **Use（使用）**：程序基于检查结果执行操作（如"插入新用户"）
4. **Race（竞争）**：在时间差窗口内，其他线程/进程修改了资源状态，导致检查时的条件在使用时已不成立

TOCTOU 是分布式系统和并发编程中最常见的安全缺陷之一，属于 **"检查后使用"** 模式的固有风险。

### 2.2 此代码中 TOCTOU 的触发过程

假设两个独立的 HTTP 请求（线程 A 和线程 B）在同一毫秒内尝试注册用户名 `zhangsan`：

```
时间轴 →
│
├─ [T1] 线程A执行 SELECT * FROM user WHERE username='zhangsan' → 返回 null
│
├─ [T2] 线程B执行 SELECT * FROM user WHERE username='zhangsan' → 返回 null
│
├─ [T3] 线程A检查通过，开始密码加密、设置enabled等业务逻辑
│
├─ [T4] 线程B检查通过，开始密码加密、设置enabled等业务逻辑
│
├─ [T5] 线程A执行 INSERT INTO user ... → 插入成功
│
└─ [T6] 线程B执行 INSERT INTO user ... → 也插入成功！
```

**触发条件**：
- 两个请求几乎同时到达
- 两次 SELECT 查询都在对方 INSERT 之前完成
- 由于没有数据库层面的唯一约束，两次 INSERT 都能成功

**根本原因**：
- 应用层的 `SELECT` 检查与后续的 `INSERT` 操作不是原子操作
- 在默认的事务隔离级别（MySQL InnoDB 默认为 REPEATABLE READ）下，SELECT 语句不会对读取的行加锁
- 因此多个事务可以看到相同的"不存在"状态，并都执行插入

---

## 三、问题2：数据库约束层面的影响分析

### 3.1 场景一：username 字段**没有**唯一索引（当前现状）

**产生的脏数据**：

| id | username | nickname | password | ... |
|----|----------|----------|----------|-----|
| 21 | zhangsan | 用户A | $2a$10$... | ... |
| 22 | zhangsan | 用户B | $2a$10$... | ... |

**系统级别的连锁影响**：

1. **登录功能异常**：
   ```java
   // loadUserByUsername 方法可能返回多条记录中的任意一条
   // 取决于数据库的返回顺序和 MyBatis 的处理方式
   public UserDetails loadUserByUsername(String s) throws UsernameNotFoundException {
       User user = userMapper.loadUserByUsername(s);  // 如果返回多条，MyBatis会抛TooManyResultsException
       // ...
   }
   ```
   实际执行时，MyBatis 会抛出 `org.apache.ibatis.exceptions.TooManyResultsException: Expected one result (or null) to be returned by selectOne(), but found: 2`

2. **数据一致性破坏**：
   - 文章、评论、PV 等表通过 `uid` 关联用户
   - 两个"相同用户名"的用户实际是不同的 id，导致业务逻辑混乱
   - 无法通过用户名唯一确定用户身份

3. **后续维护困难**：
   - 无法简单地通过 `DELETE FROM user WHERE username='zhangsan'` 清理数据
   - 需要人工介入判断哪条是合法数据

### 3.2 场景二：username 字段**有**唯一索引

**执行流程与异常**：

```
线程A: SELECT → null
线程B: SELECT → null
线程A: INSERT → 成功，获得行锁
线程B: INSERT → 数据库检测到唯一键冲突，抛出异常
```

**MySQL 抛出的异常**：
```
com.mysql.jdbc.exceptions.jdbc4.MySQLIntegrityConstraintViolationException: 
Duplicate entry 'zhangsan' for key 'username_unique'
```

**Spring 封装后的异常**：
```
org.springframework.dao.DuplicateKeyException: 
### Error updating database.  Cause: com.mysql.jdbc.exceptions.jdbc4.MySQLIntegrityConstraintViolationException: Duplicate entry 'zhangsan' for key 'username_unique'
```

**当前代码的异常处理情况**：

查看 [UserService.java](file:///e:/solo-code-2/VBlog/blogserver/src/main/java/org/sang/service/UserService.java) 代码，`reg()` 方法：
- ❌ **没有捕获** `DuplicateKeyException` 异常
- ❌ 没有 `try-catch` 块包裹数据库操作
- ❌ 方法上只有 `@Transactional` 注解，没有声明回滚的异常类型

**实际运行结果**：
1. 异常会向上层抛出，可能导致：
   - 返回 500 错误给前端
   - 用户看到"系统错误"而非"用户名已存在"
   - 事务回滚（因为 `@Transactional` 默认回滚 `RuntimeException`）
2. 用户体验极差：明明是用户名重复，却显示系统错误

---

## 四、问题3：高并发场景下的重构方案

### 4.1 重构原则

1. **数据库层是第一道防线**：必须添加唯一索引，这是数据一致性的最后保障
2. **应用层优化用户体验**：捕获异常并转换为友好提示
3. **尽量减少锁竞争**：避免使用悲观锁（SELECT ... FOR UPDATE），会严重影响并发性能
4. **失败快速重试**：对于异常场景，不做复杂重试，直接返回用户友好提示

### 4.2 方案一：数据库唯一索引 + 异常捕获（推荐）

#### 步骤1：添加数据库唯一索引

```sql
ALTER TABLE `user` ADD UNIQUE KEY `uk_username` (`username`);
```

#### 步骤2：重构 UserService.reg() 方法

```java
@Service
@Transactional
public class UserService implements UserDetailsService {
    
    private static final Logger logger = LoggerFactory.getLogger(UserService.class);
    
    @Autowired
    UserMapper userMapper;
    @Autowired
    RolesMapper rolesMapper;
    @Autowired
    PasswordEncoder passwordEncoder;

    /**
     * 用户注册
     * @param user 用户信息
     * @return 0表示成功，1表示用户名重复，2表示失败
     */
    public int reg(User user) {
        // 预检查：提前过滤大部分重复请求，减轻数据库压力
        User existUser = userMapper.loadUserByUsername(user.getUsername());
        if (existUser != null) {
            return 1;
        }
        
        try {
            // 插入用户
            user.setPassword(passwordEncoder.encode(user.getPassword()));
            user.setEnabled(true);
            user.setRegTime(new Date());
            long result = userMapper.reg(user);
            
            if (result != 1) {
                return 2;
            }
            
            // 配置用户角色
            String[] roles = new String[]{"2"};
            int roleCount = rolesMapper.addRoles(roles, user.getId());
            
            return roleCount == roles.length ? 0 : 2;
            
        } catch (DuplicateKeyException e) {
            // 捕获唯一键冲突异常：说明在检查后插入前有其他线程抢先注册
            logger.info("用户名注册冲突: {}, 已被其他用户抢先注册", user.getUsername());
            return 1;  // 同样返回"用户名重复"
        } catch (Exception e) {
            logger.error("用户注册失败, username: {}", user.getUsername(), e);
            return 2;
        }
    }
}
```

**方案优点**：
- ✅ 性能最优：正常场景下只有 SELECT + INSERT，无额外锁开销
- ✅ 绝对安全：数据库唯一索引保证了数据一致性
- ✅ 用户体验好：无论"检查时发现重复"还是"插入时发现重复"，都返回相同的友好提示
- ✅ 失败快速：不会因为等待锁而阻塞

**为什么还保留前置 SELECT 检查？**
- 99% 的场景下，用户名确实是不存在的
- 前置检查可以过滤掉大部分真正的重复请求，避免走到 INSERT 才抛异常
- 异常捕获是为了处理那 1% 的高并发竞态场景

### 4.3 方案二：使用 INSERT ... WHERE NOT EXISTS（MySQL 8.0+）

```xml
<insert id="reg" useGeneratedKeys="true" keyProperty="id">
    INSERT INTO user (username, password, nickname, enabled, regTime)
    SELECT #{username}, #{password}, #{nickname}, #{enabled}, #{regTime}
    FROM DUAL
    WHERE NOT EXISTS (
        SELECT 1 FROM user WHERE username = #{username}
    )
</insert>
```

然后 Java 代码中判断影响行数：
```java
long result = userMapper.reg(user);
if (result == 0) {
    return 1;  // 插入0行，说明用户名已存在
}
```

**注意**：这种方式仍然需要唯一索引作为兜底，因为在某些隔离级别下，NOT EXISTS 子查询也可能出现竞态。

### 4.4 不推荐的方案

#### ❌ 方案A：使用 synchronized 关键字

```java
public synchronized int reg(User user) {
    // ... 原有逻辑
}
```

**问题**：
- 单体应用下能解决，但分布式部署（多实例）时完全无效
- 性能极差：所有注册请求串行化，吞吐量骤降
- 会阻塞整个 UserService 的其他方法调用

#### ❌ 方案B：SELECT ... FOR UPDATE 悲观锁

```xml
<select id="loadUserByUsernameForUpdate" resultType="org.sang.bean.User">
    SELECT * FROM user WHERE username=#{username} FOR UPDATE
</select>
```

**问题**：
- 如果用户名不存在，InnoDB 会升级为间隙锁（Gap Lock），锁住整个范围
- 高并发下会产生大量锁等待，甚至死锁
- 性能比方案一差很多

#### ❌ 方案C：分布式锁（Redis/ZooKeeper）

```java
// 伪代码
RLock lock = redisson.getLock("register:" + username);
try {
    lock.lock();
    // 检查 + 插入
} finally {
    lock.unlock();
}
```

**问题**：
- 过度设计：数据库唯一索引已经能解决问题
- 增加了系统复杂度和依赖
- 性能不如直接利用数据库的唯一约束
- 仍然需要数据库唯一索引作为兜底

### 4.5 最终推荐架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端 / API 层                         │
│  输入校验：用户名格式、密码强度等                          │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    业务层（UserService）                  │
│  1. 前置 SELECT 检查（快速过滤 99% 的重复请求）             │
│  2. 执行 INSERT + 角色配置                               │
│  3. 捕获 DuplicateKeyException，转换为友好提示            │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    数据库层（MySQL）                      │
│  1. username 字段 UNIQUE KEY 约束（终极保障）              │
│  2. 利用数据库的 ACID 特性保证原子性                       │
└─────────────────────────────────────────────────────────┘
```

---

## 五、总结

| 问题 | 结论 |
|------|------|
| **TOCTOU 触发** | 应用层 SELECT 检查与 INSERT 不是原子操作，高并发下多个请求可同时通过检查 |
| **无唯一索引后果** | 产生重复 username 的脏数据，导致登录异常、数据混乱 |
| **有唯一索引后果** | 抛出 `DuplicateKeyException`，当前代码未捕获，用户体验差 |
| **最佳修复方案** | 数据库加唯一索引 + 应用层预检查 + 捕获异常转换，性能与安全兼顾 |

> **核心启示**：在分布式系统中，永远不要信任应用层的"检查后执行"模式。数据库的唯一约束是数据一致性的最后一道防线，也是性能最优的解决方案。应用层的检查只是为了优化用户体验和减轻数据库压力，不能替代数据库层面的约束。
