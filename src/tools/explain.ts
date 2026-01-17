import { parseArgs, getString } from "../utils/parseArgs.js";

// explain 工具实现
export async function explain(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      context?: string;
    }>(args, {
      defaultValues: {
        code: "",
        context: "",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "snippet"],
        context: ["background", "info", "上下文", "背景"],
      },
    });
    
    const code = getString(parsedArgs.code);
    const context = getString(parsedArgs.context);

    const message = `请详细解释以下代码：

📝 **代码内容**：
${code || "请提供需要解释的代码"}

📋 **上下文**：
${context || "无"}

---

## 代码解释指南

### 第一步：整体概览

**快速总结**：
- 这段代码的主要功能是什么？
- 解决了什么问题？
- 在项目中的作用？

### 第二步：逐行解释

**详细分析**：
- 每一行代码做了什么
- 为什么这样写
- 有什么注意事项

### 第三步：深入理解

**核心概念**：
- 使用的设计模式
- 关键技术原理
- 性能考虑
- 潜在问题

---

## 解释示例

### 示例 1：React Hooks

\`\`\`typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
\`\`\`

**🎯 整体功能**：
这是一个防抖 Hook，用于延迟更新值。常用于搜索输入，避免频繁触发 API 请求。

**📖 逐行解释**：

1. **函数签名**
\`\`\`typescript
function useDebounce<T>(value: T, delay: number): T
\`\`\`
- 泛型 \`<T>\` 表示可以处理任意类型的值
- 接收两个参数：\`value\`（要防抖的值）和 \`delay\`（延迟毫秒数）
- 返回类型也是 \`T\`，确保类型一致

2. **状态管理**
\`\`\`typescript
const [debouncedValue, setDebouncedValue] = useState<T>(value);
\`\`\`
- 使用 \`useState\` 创建一个内部状态
- 初始值设为传入的 \`value\`
- 这个状态会在延迟后更新

3. **副作用处理**
\`\`\`typescript
useEffect(() => {
  const handler = setTimeout(() => {
    setDebouncedValue(value);
  }, delay);

  return () => {
    clearTimeout(handler);
  };
}, [value, delay]);
\`\`\`
- 当 \`value\` 或 \`delay\` 改变时，触发 effect
- 创建一个定时器，\`delay\` 毫秒后更新 \`debouncedValue\`
- **清理函数**：组件卸载或依赖变化时，清除旧的定时器（关键！）
- 这样可以避免内存泄漏和意外的状态更新

4. **返回值**
\`\`\`typescript
return debouncedValue;
\`\`\`
- 返回延迟后的值

**💡 工作原理**：

\`\`\`
用户输入 h  → 创建定时器（500ms 后更新）
用户输入 he → 清除旧定时器，创建新定时器
用户输入 hel → 清除旧定时器，创建新定时器
用户停止输入 → 500ms 后，debouncedValue 更新为 hel
\`\`\`

**🎨 设计模式**：
- **装饰器模式**：为普通值添加防抖功能
- **闭包**：定时器 ID 保存在 effect 作用域中

**⚠️ 注意事项**：
1. 每次 \`value\` 改变都会重置定时器
2. 组件卸载时会清理定时器，防止内存泄漏
3. \`delay\` 变化也会触发重新计时

**💻 使用场景**：
\`\`\`typescript
function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    if (debouncedSearchTerm) {
      // 只有在用户停止输入 500ms 后才发起请求
      fetchSearchResults(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);

  return (
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="搜索..."
    />
  );
}
\`\`\`

---

### 示例 2：复杂算法

\`\`\`typescript
function longestPalindrome(s: string): string {
  if (s.length < 2) return s;
  
  let start = 0;
  let maxLen = 1;
  
  function expandAroundCenter(left: number, right: number): void {
    while (left >= 0 && right < s.length && s[left] === s[right]) {
      const len = right - left + 1;
      if (len > maxLen) {
        start = left;
        maxLen = len;
      }
      left--;
      right++;
    }
  }
  
  for (let i = 0; i < s.length; i++) {
    expandAroundCenter(i, i);     // 奇数长度回文
    expandAroundCenter(i, i + 1); // 偶数长度回文
  }
  
  return s.substring(start, start + maxLen);
}
\`\`\`

**🎯 整体功能**：
找出字符串中最长的回文子串（如 "babad" → "bab" 或 "aba"）。

**📖 核心思想**：

**中心扩展法**：
1. 遍历每个字符作为潜在的回文中心
2. 从中心向两边扩展，检查是否对称
3. 记录最长的回文串

**📊 时间复杂度**：O(n²)
**📊 空间复杂度**：O(1)

**🔍 详细分析**：

1. **边界处理**
\`\`\`typescript
if (s.length < 2) return s;
\`\`\`
- 长度 0 或 1 的字符串本身就是回文

2. **状态变量**
\`\`\`typescript
let start = 0;   // 最长回文的起始位置
let maxLen = 1;  // 最长回文的长度
\`\`\`

3. **扩展函数**
\`\`\`typescript
function expandAroundCenter(left: number, right: number): void {
  while (left >= 0 && right < s.length && s[left] === s[right]) {
    // 条件：不越界 && 两边字符相同
    const len = right - left + 1;
    if (len > maxLen) {
      start = left;
      maxLen = len;
    }
    left--;
    right++;
  }
}
\`\`\`
- 从中心向两边扩展
- 遇到不匹配或越界时停止
- 更新全局最长记录

4. **遍历所有中心**
\`\`\`typescript
for (let i = 0; i < s.length; i++) {
  expandAroundCenter(i, i);     // 奇数：中心是一个字符
  expandAroundCenter(i, i + 1); // 偶数：中心是两个字符之间
}
\`\`\`

**💡 为什么要检查两次？**

\`\`\`
奇数长度：aba   中心是 b     (i, i)
偶数长度：abba  中心是 bb    (i, i+1)
\`\`\`

**🎨 其他解法对比**：

| 方法 | 时间复杂度 | 空间复杂度 | 说明 |
|------|------------|------------|------|
| 暴力枚举 | O(n³) | O(1) | 太慢 |
| 中心扩展 | O(n²) | O(1) | 本方法 |
| 动态规划 | O(n²) | O(n²) | 需要额外空间 |
| Manacher | O(n) | O(n) | 最优，但复杂 |

---

### 示例 3：设计模式

\`\`\`typescript
class Singleton {
  private static instance: Singleton;
  private constructor() {}
  
  public static getInstance(): Singleton {
    if (!Singleton.instance) {
      Singleton.instance = new Singleton();
    }
    return Singleton.instance;
  }
}
\`\`\`

**🎯 设计模式**：单例模式（Singleton）

**📖 核心思想**：
确保一个类只有一个实例，并提供全局访问点。

**🔍 实现细节**：

1. **私有构造函数**
\`\`\`typescript
private constructor() {}
\`\`\`
- 阻止外部直接 \`new Singleton()\`

2. **静态实例变量**
\`\`\`typescript
private static instance: Singleton;
\`\`\`
- 保存唯一实例

3. **懒加载**
\`\`\`typescript
public static getInstance(): Singleton {
  if (!Singleton.instance) {
    Singleton.instance = new Singleton();
  }
  return Singleton.instance;
}
\`\`\`
- 第一次调用时才创建实例
- 后续调用返回同一个实例

**💻 使用场景**：
- 数据库连接池
- 配置管理器
- 日志记录器

**⚠️ TypeScript 现代替代**：
\`\`\`typescript
// 使用模块单例（更简单）
export const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
};
\`\`\`

---

## 解释框架

对于任何代码，按以下结构解释：

### 1. 概述（30 秒理解）
- 一句话总结功能
- 主要用途

### 2. 工作原理（5 分钟理解）
- 核心逻辑
- 数据流向
- 关键步骤

### 3. 技术细节（深入理解）
- 设计模式
- 算法原理
- 性能分析
- 边界情况

### 4. 实际应用
- 使用示例
- 最佳实践
- 常见陷阱

---

---

## ⚠️ 边界约束

- ❌ 仅输出代码解释，不修改代码
- ❌ 不执行代码或命令
- ✅ 输出结构化的代码解释和原理分析

现在请为提供的代码生成详细解释，包括：
1. 整体功能概述
2. 逐行代码说明
3. 核心原理分析
4. 设计模式识别
5. 使用场景和注意事项`;

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
          text: `❌ 代码解释失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

