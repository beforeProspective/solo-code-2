# SQLite 数据库迁移深度分析

本文基于 [migration.go](file:///e:/solo-code-2/yarr/src/storage/migration.go) 中的 `m03_on_delete_actions` 迁移函数，深入分析 SQLite 数据库结构迁移中的三个关键技术问题。

---

## 问题一：为什么执行 m03 迁移时需要显式关闭与开启外键约束？

### 核心代码位置

在 [migrate](file:///e:/solo-code-2/yarr/src/storage/migration.go#L27-L65) 函数中：

```go
trickyAlteration := (v == 3)

if trickyAlteration {
    db.Exec("pragma foreign_keys=off;")
}

err := migrateVersion(v, db)

if trickyAlteration {
    db.Exec("pragma foreign_keys=on;")
}
```

### 原因分析

#### 1. 避免中间状态的外键约束检查导致迁移失败

`m03_on_delete_actions` 迁移需要执行以下操作序列：
1. 创建 `new_feeds`、`new_items` 等临时表
2. 将数据从旧表复制到新表
3. **删除旧表**（`DROP TABLE feeds;` 等）
4. 重命名新表为原表名

**关键问题**：如果外键约束处于开启状态，执行 `DROP TABLE feeds;` 时，SQLite 会检测到 `items`、`http_states`、`feed_errors` 等表中存在大量指向 `feeds` 表的外键引用，此时会发生以下情况之一：

- 如果外键定义包含 `ON DELETE CASCADE`，删除 `feeds` 表会触发级联删除，**导致所有 items 数据被误删**
- 如果外键定义是默认的 `ON DELETE RESTRICT` 或 `ON DELETE NO ACTION`，删除操作会直接失败，返回 "FOREIGN KEY constraint failed" 错误

#### 2. 解决重命名表时的外键依赖问题

SQLite 在处理表重命名时，会自动更新所有引用该表的外键定义。但在迁移过程中，我们需要先删除旧表再重命名新表，这个操作序列在外键约束开启时会因为引用完整性检查而无法执行。

#### 3. SQLite 外键约束的特殊性质

与其他数据库不同，SQLite 的外键约束：
- **默认关闭**：需要每次连接时显式执行 `PRAGMA foreign_keys = ON;` 才能生效
- **连接级设置**：`PRAGMA foreign_keys` 是针对单个数据库连接的设置，不会持久化到数据库文件中
- **可以动态切换**：允许在同一个会话中随时开启或关闭

---

## 问题二：SQLite 的 ALTER TABLE 限制如何导致该迁移需要创建临时表并重新导入数据？

### SQLite ALTER TABLE 的能力边界

根据 SQLite 官方文档，`ALTER TABLE` 命令仅支持以下操作：
1. **重命名表** (`ALTER TABLE ... RENAME TO ...`)
2. **重命名列** (`ALTER TABLE ... RENAME COLUMN ...`) - 3.25.0+
3. **添加列** (`ALTER TABLE ... ADD COLUMN ...`)
4. **删除列** (`ALTER TABLE ... DROP COLUMN ...`) - 3.35.0+

**不支持的操作**（关键限制）：
- ❌ 修改列的数据类型
- ❌ 修改列的约束（如 `NOT NULL`、`UNIQUE`）
- ❌ 添加或修改外键约束（包括 `ON DELETE` / `ON UPDATE` 动作）
- ❌ 修改主键定义
- ❌ 调整列的顺序

### m03 迁移的目标

对比 [m01_initial](file:///e:/solo-code-2/yarr/src/storage/migration.go#L92-L150) 和 [m03_on_delete_actions](file:///e:/solo-code-2/yarr/src/storage/migration.go#L172-L245) 中的表定义：

| 表 | 列 | 原定义 | 新定义 |
|---|---|---|---|
| feeds | folder_id | `references folders(id)` | `references folders(id) on delete set null` |
| items | feed_id | `references feeds(id)` | `references feeds(id) on delete cascade` |
| http_states | feed_id | `references feeds(id) unique` | `references feeds(id) on delete cascade unique` |
| feed_errors | feed_id | `references feeds(id) unique` | `references feeds(id) on delete cascade unique` |

m03 迁移的核心目标是为外键添加 `ON DELETE` 动作，但这正是 SQLite `ALTER TABLE` 无法直接完成的操作。

### 通用表重建流程（Generalized ALTER TABLE）

SQLite 官方文档中明确描述了这种"重建表"的标准迁移流程：

```
1. PRAGMA foreign_keys = OFF;       ← 关闭外键约束
2. BEGIN TRANSACTION;               ← 开启事务
3. CREATE TABLE new_xxx (...);      ← 创建带新结构的临时表
4. INSERT INTO new_xxx SELECT * FROM xxx;  ← 复制数据
5. DROP TABLE xxx;                  ← 删除旧表
6. ALTER TABLE new_xxx RENAME TO xxx;  ← 重命名新表
7. 重建索引、触发器等附属对象
8. PRAGMA foreign_key_check;        ← 外键一致性检查
9. COMMIT;                          ← 提交事务
10. PRAGMA foreign_keys = ON;       ← 恢复外键约束
```

这正是 [m03_on_delete_actions](file:///e:/solo-code-2/yarr/src/storage/migration.go#L172-L245) 函数中采用的 6 步流程：
1. 创建 `new_feeds`、`new_items` 等临时表（第175-209行）
2. 从旧表导入数据（第212-215行）
3. 删除旧表（第218-221行）
4. 重命名新表（第224-227行）
5. 重建索引和触发器（第230-238行）
6. 外键一致性检查（第241行）

---

## 问题三：外键检查指令的物理执行流程是什么？为什么是数据库结构迁移中必不可少的防线？

### PRAGMA foreign_key_check 的执行流程

在 [m03_on_delete_actions](file:///e:/solo-code-2/yarr/src/storage/migration.go#L241) 的最后一步：

```sql
pragma foreign_key_check;
```

#### 物理执行步骤

1. **获取所有外键定义**：SQLite 首先查询系统表 `sqlite_master`，获取所有包含 `REFERENCES` 子句的表定义。

2. **遍历每个子表**：对于每个定义了外键的表（子表），执行以下操作：
   ```
   对于 items 表中的每一行：
       获取 feed_id 的值
       检查 feeds 表中是否存在 id = feed_id 的记录
       如果不存在 → 返回一条违反记录
   ```

3. **返回结果**：如果存在外键违反，该命令返回一个结果集，每行包含4列：
   | 列 | 含义 |
   |---|---|
   | 第1列 | 包含外键的子表名（如 `items`） |
   | 第2列 | 违反约束的行的 rowid |
   | 第3列 | 被引用的父表名（如 `feeds`） |
   | 第4列 | 外键约束的序号（0-based） |

4. **在事务中触发错误**：当 `PRAGMA foreign_key_check` 返回任何行时，Go 的 `database/sql` 驱动会检测到结果集非空，而在当前的迁移实现中，如果在事务内执行该检查并发现违反，后续的 `COMMIT` 会失败，导致整个迁移事务回滚。

### 为什么这是必不可少的防线？

#### 1. 迁移期间外键约束被关闭，存在数据损坏窗口

当执行 `PRAGMA foreign_keys = OFF` 后，SQLite 停止了所有外键约束检查。这意味着：
- 可以插入指向不存在父记录的外键值
- 可以删除被子表引用的父记录
- 整个迁移过程处于"无保护"状态

#### 2. 迁移操作本身可能引入错误

尽管迁移脚本是精心编写的，但仍可能出现以下问题：
- **数据复制错误**：`INSERT INTO new_xxx SELECT * FROM xxx` 可能因为列顺序不匹配导致数据错位
- **表删除顺序错误**：如果删除表的顺序不正确，可能在删除旧表后某些数据尚未复制
- **重命名错误**：新表重命名时可能出现拼写错误
- **条件逻辑错误**：迁移代码中的逻辑错误可能导致部分数据丢失或损坏

#### 3. 历史数据可能早已存在不一致

在迁移之前的数据库中，可能因为以下原因已经存在外键不一致：
- 应用程序 bug 导致的错误数据插入
- 早期版本未启用外键约束时产生的孤儿记录
- 用户使用外部工具直接修改数据库

#### 4. 最终完整性验证

`PRAGMA foreign_key_check` 是迁移完成前的**最后一道防线**：
- 它验证所有的外键关系在迁移后仍然有效
- 如果发现任何不一致，整个迁移事务会回滚，避免损坏的数据被永久保存
- 这是 SQLite 官方文档中明确推荐的迁移步骤

### 失败保护机制

如果外键检查失败，整个迁移流程会通过事务回滚机制保证数据安全：

```
migrateVersion() 函数中的事务保护：
├─ 开始事务 (db.Begin())
├─ 执行迁移函数 (m03_on_delete_actions)
│   ├─ 创建新表
│   ├─ 复制数据
│   ├─ 删除旧表
│   ├─ 重命名新表
│   ├─ 重建索引
│   └─ 执行 pragma foreign_key_check  ← 失败时返回错误
├─ 如果有错误 → 回滚事务 (tx.Rollback())
└─ 成功 → 提交事务 (tx.Commit())
```

---

## 总结

m03 迁移的设计充分体现了 SQLite 数据库的特性和限制：

1. **关闭外键约束**是为了让"删除旧表-重命名新表"的操作序列能够顺利执行，避免级联删除或约束违反错误
2. **创建临时表重建**是因为 SQLite `ALTER TABLE` 无法直接修改外键的 `ON DELETE` 动作，必须采用官方推荐的通用表重建流程
3. **外键检查**是必不可少的完整性防线，它在迁移结束时验证所有外键关系，确保迁移不会引入数据不一致

这种设计模式是 SQLite 数据库进行复杂结构变更的标准最佳实践，代码中引用的 SQLite 官方文档链接也印证了这一点：
> "Making Other Kinds Of Table Schema Changes" - https://www.sqlite.org/lang_altertable.html
