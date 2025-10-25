// perf 工具实现
export async function perf(args: any) {
  try {
    const code = args?.code || "";
    const type = args?.type || "all"; // algorithm, memory, react, database

    const message = `请分析以下代码的性能问题并提供优化建议：

📝 **代码内容**：
${code || "请提供需要性能分析的代码"}

🎯 **分析重点**：${type}

---

## 性能分析流程

### 第一步：识别性能瓶颈

**常见性能问题**：
1. **时间复杂度过高**
   - 嵌套循环 O(n²) 或更差
   - 未优化的算法
   - 重复计算

2. **空间复杂度问题**
   - 内存泄漏
   - 大对象频繁创建
   - 缓存滥用

3. **I/O 阻塞**
   - 同步 I/O 操作
   - 未使用连接池
   - 缺少缓存机制

4. **渲染性能**
   - 不必要的重渲染
   - 大列表未虚拟化
   - 图片未优化

---

## 性能优化指南

### 1️⃣ 算法优化

**复杂度分析**：
\`\`\`
O(1)    - 常数时间      ✅ 最优
O(log n) - 对数时间      ✅ 很好
O(n)     - 线性时间      ✅ 良好
O(n log n) - 线性对数   ⚠️ 可接受
O(n²)    - 平方时间      ⚠️ 注意
O(2ⁿ)    - 指数时间      ❌ 避免
O(n!)    - 阶乘时间      ❌ 严禁
\`\`\`

**优化技巧**：

**示例 1：使用 Map 替代数组查找**
\`\`\`typescript
// Before - O(n²)
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}

// After - O(n)
function findDuplicates(arr) {
  const seen = new Map();
  const duplicates = new Set();
  
  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.add(item);
    } else {
      seen.set(item, true);
    }
  }
  
  return Array.from(duplicates);
}
\`\`\`

**示例 2：缓存计算结果**
\`\`\`typescript
// Before - 重复计算
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// After - 使用 memoization
const memo = new Map();
function fibonacci(n) {
  if (n <= 1) return n;
  if (memo.has(n)) return memo.get(n);
  
  const result = fibonacci(n - 1) + fibonacci(n - 2);
  memo.set(n, result);
  return result;
}
\`\`\`

### 2️⃣ 内存优化

**避免内存泄漏**：
\`\`\`typescript
// ❌ 内存泄漏
class EventManager {
  listeners = [];
  
  addEventListener(listener) {
    this.listeners.push(listener);
    // 忘记移除监听器
  }
}

// ✅ 正确做法
class EventManager {
  listeners = new Set();
  
  addEventListener(listener) {
    this.listeners.add(listener);
  }
  
  removeEventListener(listener) {
    this.listeners.delete(listener);
  }
  
  destroy() {
    this.listeners.clear();
  }
}
\`\`\`

**对象池复用**：
\`\`\`typescript
// ❌ 频繁创建对象
for (let i = 0; i < 10000; i++) {
  const obj = { x: i, y: i * 2 };
  process(obj);
}

// ✅ 对象池
class ObjectPool {
  pool = [];
  
  acquire() {
    return this.pool.pop() || {};
  }
  
  release(obj) {
    this.pool.push(obj);
  }
}

const pool = new ObjectPool();
for (let i = 0; i < 10000; i++) {
  const obj = pool.acquire();
  obj.x = i;
  obj.y = i * 2;
  process(obj);
  pool.release(obj);
}
\`\`\`

### 3️⃣ React 性能优化

**useMemo 和 useCallback**：
\`\`\`typescript
// ❌ 每次渲染都创建新函数
function MyComponent({ data }) {
  const processedData = expensiveComputation(data);
  const handleClick = () => { /* ... */ };
  
  return <ChildComponent data={processedData} onClick={handleClick} />;
}

// ✅ 使用 hooks 优化
function MyComponent({ data }) {
  const processedData = useMemo(
    () => expensiveComputation(data),
    [data]
  );
  
  const handleClick = useCallback(() => {
    /* ... */
  }, []);
  
  return <ChildComponent data={processedData} onClick={handleClick} />;
}
\`\`\`

**React.memo 避免重渲染**：
\`\`\`typescript
// ✅ 使用 memo
const ChildComponent = React.memo(({ data, onClick }) => {
  return <div onClick={onClick}>{data}</div>;
});
\`\`\`

**虚拟列表**：
\`\`\`typescript
// ❌ 渲染 10000 个元素
function List({ items }) {
  return (
    <div>
      {items.map(item => <Item key={item.id} data={item} />)}
    </div>
  );
}

// ✅ 使用虚拟列表
import { FixedSizeList } from 'react-window';

function List({ items }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={50}
    >
      {({ index, style }) => (
        <div style={style}>
          <Item data={items[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
\`\`\`

### 4️⃣ 数据库优化

**添加索引**：
\`\`\`sql
-- Before
SELECT * FROM users WHERE email = 'user@example.com';

-- After
CREATE INDEX idx_users_email ON users(email);
SELECT * FROM users WHERE email = 'user@example.com';
\`\`\`

**查询优化**：
\`\`\`typescript
// ❌ N+1 查询
const users = await User.findAll();
for (const user of users) {
  user.posts = await Post.findAll({ where: { userId: user.id } });
}

// ✅ 使用 JOIN
const users = await User.findAll({
  include: [{ model: Post }]
});
\`\`\`

**批量操作**：
\`\`\`typescript
// ❌ 逐条插入
for (const item of items) {
  await db.insert(item);
}

// ✅ 批量插入
await db.insertMany(items);
\`\`\`

---

## 性能测试

### Benchmark 测试
\`\`\`typescript
console.time('operation');
// 执行操作
console.timeEnd('operation');

// 或使用 performance API
const start = performance.now();
// 执行操作
const end = performance.now();
console.log(\`耗时: \${end - start}ms\`);
\`\`\`

### 性能指标

**目标值**：
- 首屏加载：< 1s
- 交互响应：< 100ms
- 动画帧率：60 FPS
- API 响应：< 200ms

---

## 性能优化报告模板

### 📊 性能分析

**当前性能**：
- 时间复杂度：O(n²)
- 内存占用：150MB
- 响应时间：800ms

**瓶颈识别**：
1. 嵌套循环导致复杂度过高
2. 未缓存计算结果
3. 数组查找效率低

### 🎯 优化方案

**方案 1：算法优化**
- 使用 Map 替代数组
- 预期提升：70%

**方案 2：添加缓存**
- 使用 memoization
- 预期提升：50%

### 📈 优化效果

**优化后性能**：
- 时间复杂度：O(n)
- 内存占用：50MB ↓ 67%
- 响应时间：200ms ↓ 75%

---

现在请分析代码，提供详细的性能优化建议。`;

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
          text: `❌ 性能分析失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

