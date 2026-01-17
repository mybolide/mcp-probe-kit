import { parseArgs, getString } from "../utils/parseArgs.js";

// gensql 工具实现
export async function gensql(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      description?: string;
      dialect?: string;
    }>(args, {
      defaultValues: {
        description: "",
        dialect: "postgres",
      },
      primaryField: "description", // 纯文本输入默认映射到 description 字段
      fieldAliases: {
        description: ["query", "requirement", "需求", "查询需求"],
        dialect: ["database", "db", "type", "数据库", "数据库类型"],
      },
    });
    
    const description = getString(parsedArgs.description);
    const dialect = getString(parsedArgs.dialect) || "postgres"; // postgres, mysql, sqlite

    const message = `请根据以下需求生成 SQL：

📝 **需求描述**：
${description || "请描述需要查询/操作的数据"}

🗄️ **数据库类型**：${dialect}

---

## SQL 生成指南

### 第一步：理解需求

**需求类型**：
- 查询（SELECT）
- 插入（INSERT）
- 更新（UPDATE）
- 删除（DELETE）
- 建表（CREATE TABLE）
- 修改表结构（ALTER TABLE）
- 创建索引（CREATE INDEX）

### 第二步：生成 SQL

**查询示例：**

**1️⃣ 简单查询**
\`\`\`sql
-- 查询所有用户
SELECT * FROM users;

-- 按条件查询
SELECT id, name, email 
FROM users 
WHERE status = 'active' 
  AND created_at > '2024-01-01';
\`\`\`

**2️⃣ 复杂查询**
\`\`\`sql
-- JOIN 查询
SELECT 
  u.id,
  u.name,
  u.email,
  COUNT(o.id) as order_count,
  SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 10;
\`\`\`

**3️⃣ 子查询**
\`\`\`sql
-- 查找购买金额超过平均值的用户
SELECT 
  u.name,
  SUM(o.total) as total_spent
FROM users u
JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name
HAVING SUM(o.total) > (
  SELECT AVG(total_per_user)
  FROM (
    SELECT SUM(total) as total_per_user
    FROM orders
    GROUP BY user_id
  ) avg_calc
);
\`\`\`

**4️⃣ 窗口函数**
\`\`\`sql
-- 每个用户的订单排名
SELECT 
  user_id,
  order_id,
  total,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY total DESC) as rank,
  SUM(total) OVER (PARTITION BY user_id) as user_total
FROM orders;
\`\`\`

---

### 建表示例

**完整的表定义：**
\`\`\`sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 约束
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
  CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'suspended'))
);

-- 索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

-- 注释
COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.email IS '用户邮箱（唯一）';
\`\`\`

---

### 索引优化

**索引建议：**
\`\`\`sql
-- 单列索引
CREATE INDEX idx_users_email ON users(email);

-- 复合索引（顺序很重要！）
CREATE INDEX idx_orders_user_status ON orders(user_id, status, created_at);

-- 唯一索引
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);

-- 部分索引（条件索引）
CREATE INDEX idx_active_users ON users(email) WHERE status = 'active';

-- 全文索引（PostgreSQL）
CREATE INDEX idx_posts_title_fulltext ON posts USING GIN (to_tsvector('english', title));
\`\`\`

---

## 查询优化技巧

### 1️⃣ 使用 EXPLAIN ANALYZE
\`\`\`sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id = 123;
\`\`\`

### 2️⃣ 避免 SELECT *
\`\`\`sql
-- ❌ Bad
SELECT * FROM users;

-- ✅ Good
SELECT id, name, email FROM users;
\`\`\`

### 3️⃣ 使用 EXISTS 替代 IN（大数据量）
\`\`\`sql
-- ❌ Slow
SELECT * FROM users 
WHERE id IN (SELECT user_id FROM orders);

-- ✅ Faster
SELECT * FROM users u
WHERE EXISTS (
  SELECT 1 FROM orders o WHERE o.user_id = u.id
);
\`\`\`

### 4️⃣ 避免在 WHERE 中使用函数
\`\`\`sql
-- ❌ Bad (无法使用索引)
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';

-- ✅ Good
SELECT * FROM users WHERE email = 'test@example.com';
\`\`\`

### 5️⃣ 分页优化
\`\`\`sql
-- ❌ Slow (大 OFFSET)
SELECT * FROM posts ORDER BY created_at DESC LIMIT 10 OFFSET 10000;

-- ✅ Faster (游标分页)
SELECT * FROM posts 
WHERE created_at < '2024-01-01 00:00:00'
ORDER BY created_at DESC 
LIMIT 10;
\`\`\`

---

## 常用查询模板

### 去重查询
\`\`\`sql
SELECT DISTINCT email FROM users;

-- 或使用 GROUP BY
SELECT email FROM users GROUP BY email;
\`\`\`

### 统计分析
\`\`\`sql
SELECT 
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(total) as revenue,
  AVG(total) as avg_order_value
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;
\`\`\`

### 排名查询
\`\`\`sql
-- Top N per group
SELECT * FROM (
  SELECT 
    *,
    ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY sales DESC) as rank
  FROM products
) ranked
WHERE rank <= 10;
\`\`\`

### 递归查询（树形结构）
\`\`\`sql
WITH RECURSIVE category_tree AS (
  -- 根节点
  SELECT id, name, parent_id, 1 as level
  FROM categories
  WHERE parent_id IS NULL
  
  UNION ALL
  
  -- 递归部分
  SELECT c.id, c.name, c.parent_id, ct.level + 1
  FROM categories c
  JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree ORDER BY level, name;
\`\`\`

---

## 数据库特定语法

### PostgreSQL
\`\`\`sql
-- JSON 查询
SELECT data->>'name' as name FROM users WHERE data @> '{"active": true}';

-- 数组操作
SELECT * FROM posts WHERE tags && ARRAY['sql', 'database'];

-- 全文搜索
SELECT * FROM articles WHERE to_tsvector(content) @@ to_tsquery('postgresql');
\`\`\`

### MySQL
\`\`\`sql
-- JSON 查询
SELECT JSON_EXTRACT(data, '$.name') as name FROM users;

-- 全文搜索
SELECT * FROM articles WHERE MATCH(title, content) AGAINST('database' IN NATURAL LANGUAGE MODE);
\`\`\`

---

现在请根据需求生成优化的 SQL 语句，并提供：
1. 完整的 SQL 代码
2. 执行计划分析（如需要）
3. 索引建议
4. 性能优化建议`;

    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 生成 SQL 失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

