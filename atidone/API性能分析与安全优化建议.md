# API 端点性能分析与安全优化建议

## 概述

本文档分析了 `server/api/todos/stats.ts` 端点的性能和安全问题，并提供相应的优化建议。

## 问题 1：COUNT(DISTINCT) 的性能瓶颈分析

### 为什么 COUNT(DISTINCT) 会成为性能瓶颈？

在大多数关系型数据库中，`COUNT(DISTINCT)` 操作极易成为严重的性能瓶颈，主要原因如下：

#### 1. 无法利用维护好的计数器

- 与 `COUNT(*)` 不同，数据库通常不会为唯一值计数维护专门的计数器
- 每次查询都需要重新计算，无法直接返回预计算的值

#### 2. 底层存储引擎的扫描计算行为

`COUNT(DISTINCT)` 在数据库底层通常会引发以下操作：

##### 2.1 全表扫描或大范围索引扫描
- 数据库需要读取所有相关行来识别唯一值
- 即使有索引，也可能需要遍历整个索引树
- 对于大表，这会导致大量的磁盘 I/O

##### 2.2 临时表创建
- 数据库通常需要创建临时表来存储所有不同的 `userId` 值
- 如果去重后的结果集很大，临时表可能会非常大
- 额外的磁盘空间分配和管理开销

##### 2.3 排序或哈希操作
- 为了去重，数据库有两种主要策略：
  - **排序去重**：将所有值排序，然后顺序扫描去除重复值（O(n log n) 复杂度）
  - **哈希去重**：使用哈希表存储已见过的值（需要足够的内存）
- 这些操作会消耗大量的 CPU 和内存资源

##### 2.4 无法使用简单的索引覆盖
- 虽然索引可以帮助减少磁盘 I/O，但去重操作本身仍然是计算密集型的
- 即使有索引，数据库也需要遍历所有索引条目来计算唯一值

#### 3. 随着数据增长的性能退化

- **数据量线性增长**：随着 `todos` 表记录数增加，查询时间也会线性增长
- **并发查询放大**：多个并发查询会导致资源争用（CPU、内存、I/O）
- **缓存失效**：如果没有合适的缓存策略，每次请求都会触发全量计算

---

## 问题 2：公开接口的安全风险与防御策略

### 恶意攻击如何导致资源耗尽？

该端点属于公开接口（无 `requireUserSession`），且缺乏缓存或限流机制，容易成为 Layer 7（应用层）拒绝服务攻击的目标：

#### 1. 攻击模式

攻击者可以利用以下方式：
- **脚本高频请求**：使用自动化脚本发起大量并发请求
- **分布式攻击**：从多个 IP 地址发起请求（DDoS）
- **持续攻击**：长时间持续发送请求

#### 2. 资源耗尽路径

每次请求都会触发：
```
网络请求 → API 处理 → 数据库连接 → COUNT(DISTINCT) 全量计算
```

这会导致：
- **数据库连接池耗尽**：大量并发请求会迅速占满数据库连接池
- **CPU 资源耗尽**：`COUNT(DISTINCT)` 的排序/哈希操作是 CPU 密集型的
- **内存资源耗尽**：临时表和排序操作需要大量内存
- **I/O 资源耗尽**：全表扫描或大范围索引扫描会导致磁盘 I/O 飙升
- **服务级联失败**：数据库过载会导致所有依赖它的服务变慢或失败

### 最低成本的规避方案（不牺牲架构优雅性）

#### 方案 1：添加应用层缓存（推荐，成本最低）

使用简单的内存缓存来存储统计结果，设置合理的过期时间。

**优化后的代码示例：**

```typescript
import { db, schema } from 'hub:db'
import { sql } from 'drizzle-orm'

// 简单的内存缓存
interface CacheEntry {
  data: { todos: number; users: number }
  timestamp: number
}

let cache: CacheEntry | null = null
const CACHE_DURATION = 60 * 1000 // 1分钟缓存

export default eventHandler(async () => {
  const now = Date.now()
  
  // 检查缓存是否有效
  if (cache && (now - cache.timestamp < CACHE_DURATION)) {
    return cache.data
  }
  
  // 执行查询
  const result = await db.select({
    todos: sql<number>`count(*)`,
    users: sql<number>`count(distinct(${schema.todos.userId}))`
  }).from(schema.todos)
  
  // 更新缓存
  cache = {
    data: result[0],
    timestamp: now
  }
  
  return result[0]
})
```

**优点：**
- 实现简单，仅需添加几行代码
- 大幅降低数据库压力（1分钟内只查询一次）
- 对于统计数据，1分钟的延迟通常是可接受的
- 不引入外部依赖

#### 方案 2：添加简单的限流机制

基于 IP 的简单限流，防止单个客户端发起过多请求。

**优化后的代码示例（结合缓存）：**

```typescript
import { db, schema } from 'hub:db'
import { sql } from 'drizzle-orm'

// 缓存
let cache: { data: any; timestamp: number } | null = null
const CACHE_DURATION = 60 * 1000

// 限流
interface RateLimitEntry {
  count: number
  resetTime: number
}
const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1分钟窗口
const MAX_REQUESTS_PER_WINDOW = 100 // 每个IP每分钟最多100次

export default eventHandler(async (event) => {
  // 限流检查
  const clientIP = getRequestIP(event) || 'unknown'
  const now = Date.now()
  
  let rateLimit = rateLimitMap.get(clientIP)
  if (!rateLimit || now > rateLimit.resetTime) {
    rateLimit = { count: 1, resetTime: now + RATE_LIMIT_WINDOW }
    rateLimitMap.set(clientIP, rateLimit)
  } else {
    rateLimit.count++
    if (rateLimit.count > MAX_REQUESTS_PER_WINDOW) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Too Many Requests'
      })
    }
  }
  
  // 缓存检查
  if (cache && (now - cache.timestamp < CACHE_DURATION)) {
    return cache.data
  }
  
  // 执行查询
  const result = await db.select({
    todos: sql<number>`count(*)`,
    users: sql<number>`count(distinct(${schema.todos.userId}))`
  }).from(schema.todos)
  
  // 更新缓存
  cache = {
    data: result[0],
    timestamp: now
  }
  
  return result[0]
})
```

**优点：**
- 防止单个IP滥用接口
- 与缓存配合使用，防护效果更好
- 实现简单，无需外部依赖

#### 方案 3：数据库层面的长期优化（可选）

如果数据量持续增长，可以考虑：

1. **创建索引**：确保 `userId` 列有索引
2. **预计算统计**：定期（如每分钟）运行后台任务更新统计表
3. **物化视图**：如果数据库支持，使用物化视图存储预计算的统计数据

**预计算统计表示例：**

```sql
-- 创建统计表
CREATE TABLE todo_stats (
  id INT PRIMARY KEY DEFAULT 1,
  total_todos INT NOT NULL DEFAULT 0,
  total_users INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 定期更新（可以用 cron 或定时任务）
INSERT INTO todo_stats (id, total_todos, total_users, updated_at)
VALUES (1, (SELECT COUNT(*) FROM todos), (SELECT COUNT(DISTINCT userId) FROM todos), NOW())
ON DUPLICATE KEY UPDATE
  total_todos = VALUES(total_todos),
  total_users = VALUES(total_users),
  updated_at = VALUES(updated_at);
```

然后 API 端点只需查询 `todo_stats` 表，这是一个 O(1) 的操作。

---

## 综合建议

### 短期方案（立即实施）
- **方案 1（应用层缓存）**：最简单、成本最低，能解决 90% 的问题
- 对于统计数据，1-5 分钟的缓存延迟完全可以接受

### 中期方案（增强防护）
- **方案 1 + 方案 2**：缓存 + 限流，提供更全面的保护
- 防止恶意攻击者绕过缓存直接攻击数据库

### 长期方案（大规模扩展）
- **方案 3（预计算统计）**：当数据量达到百万级时考虑
- 可以结合更高级的缓存方案（如 Redis）

### 最终推荐的实现

推荐使用 **方案 1（应用层缓存）** 作为最低成本的解决方案，原因如下：
1. **实现成本极低**：只需添加几行代码
2. **效果显著**：数据库查询次数从 O(N) 降低到 O(1/缓存时间)
3. **不引入外部依赖**：保持代码简洁
4. **可维护性好**：缓存逻辑集中在一个地方
5. **可扩展性强**：未来需要时可以轻松升级到 Redis 等专业缓存

对于统计接口，用户通常能接受几分钟的数据延迟，这使得缓存成为完美的解决方案。
