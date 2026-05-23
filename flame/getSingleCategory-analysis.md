# getSingleCategory.js 查询逻辑分析与重构方案

## 问题分析

相关源码参考：[getSingleCategory.js](file:///e:/solo-code-2/flame/controllers/categories/getSingleCategory.js#L21-L40)

### 1. Sequelize 中 `include.where` 将 LEFT JOIN 隐式转换为 INNER JOIN 的原因

在 Sequelize 中，`include` 选项默认生成 `LEFT JOIN`，用于在没有关联记录时仍然返回主表数据。但是，当在 `include` 子句中显式配置了 `where` 条件时，Sequelize 会将这个 `where` 条件下推到 `JOIN ... ON` 子句中。

原代码（第 21-31 行）：

```js
const category = await Category.findOne({
  where: { id: req.params.id, ...visibility },
  include: [
    {
      model: Bookmark,
      as: 'bookmarks',
      where: visibility,
    },
  ],
  order,
});
```

当匿名用户请求时（`req.isAuthenticated` 为 `false`），`visibility = { isPublic: true }`。

Sequelize 会生成类似下面的 SQL：

```sql
SELECT "Category".*, "bookmarks".*
FROM "categories" AS "Category"
INNER JOIN "bookmarks" AS "bookmarks"
  ON "Category"."id" = "bookmarks"."categoryId"
  AND "bookmarks"."isPublic" = true
WHERE "Category"."id" = :id
  AND "Category"."isPublic" = true;
```

**为什么是 INNER JOIN？**

- Sequelize 的设计原则是：`include` 中的 `where` 条件代表"必须存在满足条件的关联记录"。
- 如果仍然使用 `LEFT JOIN`，当没有满足 `where` 条件的关联记录时，SQL 本身的语义仍然会保留主表行，但关联字段为 `NULL`。
- 为了让 `include.where` 的语义与常规 SQL 行为一致（"过滤掉不满足条件的关联"），Sequelize 将 `LEFT JOIN` 转为 `INNER JOIN`，使得"没有任何满足关联过滤条件的子行"的场景下，主表行也一并被过滤掉。

因此，当：

- 分类本身是公开的（`Category.isPublic = true`），但
- 该分类下**没有任何书签**，或 **所有书签都是私有的**（`Bookmark.isPublic = false`）时，

`INNER JOIN` 无法匹配到任何 `bookmarks` 行，结果集中连 `Category` 这一行也被丢弃。

### 2. 对 HTTP 状态码与错误信息的影响

由于上面的 `INNER JOIN` 导致结果集中没有任何行，`Category.findOne` 将返回 `null`（或 `undefined`）。

于是第 33-40 行的判断：

```js
if (!category) {
  return next(
    new ErrorResponse(
      `Category with id of ${req.params.id} was not found`,
      404
    )
  );
}
```

会直接触发，向前端返回：

- **HTTP 状态码**：`404 Not Found`
- **错误信息**：`Category with id of <id> was not found`

**为什么分类存在却返回"未找到"？**

- 从数据库真实数据来看，这条 `Category` 记录是存在的。
- 但由于关联查询的 `INNER JOIN` 把"过滤书签"和"过滤分类"这两件事耦合在了一起，导致"没有公开书签"被错误地等同于"分类不存在"。
- `findOne` 的 `null` 触发了第 33 行的 `!category` 判断，于是走了 404 分支。
- 这是一个典型的 **Eager Loading 过滤副作用**：子表过滤条件影响了父表结果集。

### 3. 重构方案

思路：使用 Sequelize 的 `required: false` 显式保留 `LEFT JOIN`，使"分类存在"与"书签为空"这两个逻辑独立处理。

#### 方案一：使用 `required: false` + 在外层单独判断分类是否存在

```js
const getSingleCategory = asyncWrapper(async (req, res, next) => {
  const { useOrdering: orderType } = await loadConfig();

  const visibility = req.isAuthenticated ? {} : { isPublic: true };

  const order =
    orderType == 'name'
      ? [[Sequelize.fn('lower', Sequelize.col('bookmarks.name')), 'ASC']]
      : [[{ model: Bookmark, as: 'bookmarks' }, orderType, 'ASC']];

  const category = await Category.findOne({
    where: { id: req.params.id, ...visibility },
    include: [
      {
        model: Bookmark,
        as: 'bookmarks',
        where: visibility,
        required: false,
      },
    ],
    order,
  });

  if (!category) {
    return next(
      new ErrorResponse(
        `Category with id of ${req.params.id} was not found`,
        404
      )
    );
  }

  res.status(200).json({
    success: true,
    data: category,
  });
});
```

**说明：**

- `required: false` 告诉 Sequelize：即使没有匹配的关联记录，也要保留主表行。这样生成的 SQL 保持为 `LEFT JOIN`：

  ```sql
  SELECT "Category".*, "bookmarks".*
  FROM "categories" AS "Category"
  LEFT JOIN "bookmarks" AS "bookmarks"
    ON "Category"."id" = "bookmarks"."categoryId"
    AND "bookmarks"."isPublic" = true
  WHERE "Category"."id" = :id
    AND "Category"."isPublic" = true;
  ```

- 当没有公开书签时，`Category` 行依然会被返回，`bookmarks` 数组为空 `[]`，前端得到正确的分类信息。
- 如果分类本身不存在（或分类是私有的且匿名访问），`category` 为 `null`，仍会进入 404 分支，符合预期。

#### 方案二（可选）：将书签过滤移到 `on` 条件的其他形式或分离查询

如果某些 Sequelize 版本对 `required: false` + `include.where` 的支持不理想，也可以用 `scope` 或分离查询的方式，但其本质与方案一相同。

**小结：**

| 场景 | 原行为 | 重构后行为 |
|------|--------|-----------|
| 分类公开 + 有公开书签 | 200 + 正常数据 | 200 + 正常数据 |
| 分类公开 + 无公开书签 | 404 分类不存在（错误） | 200 + bookmarks: [] |
| 分类私有 + 未登录访问 | 404 | 404（符合预期） |
| 分类不存在 | 404 | 404 |
