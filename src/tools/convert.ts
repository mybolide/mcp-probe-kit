import { parseArgs, getString } from "../utils/parseArgs.js";

// convert 工具实现
export async function convert(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      from?: string;
      to?: string;
    }>(args, {
      defaultValues: {
        code: "",
        from: "",
        to: "",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        from: ["source_format", "source_type", "源格式", "源类型"],
        to: ["target_format", "target_type", "目标格式", "目标类型"],
      },
    });
    
    const code = getString(parsedArgs.code);
    const from = getString(parsedArgs.from);
    const to = getString(parsedArgs.to);

    const message = `请转换以下代码：

📝 **源代码**：
${code || "请提供需要转换的代码"}

🔄 **转换类型**：${from} → ${to}

---

## 代码转换指南

### 支持的转换类型

#### 语言转换
- JavaScript → TypeScript
- TypeScript → JavaScript
- Python → JavaScript
- CommonJS → ESM

#### 框架转换
- Class Component → Hooks
- Vue 2 → Vue 3
- AngularJS → React
- jQuery → Vanilla JS

#### 样式转换
- CSS → Tailwind CSS
- SCSS → CSS-in-JS
- Styled-components → Emotion

#### 数据格式转换
- JSON → TypeScript Interface
- GraphQL → REST
- XML → JSON

---

## 转换示例

### 1️⃣ JavaScript → TypeScript

**JavaScript (Before):**
\`\`\`javascript
function calculateTotal(items, discount) {
  const subtotal = items.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);
  
  return discount ? subtotal * (1 - discount) : subtotal;
}

const order = {
  id: '123',
  items: [
    { name: 'Book', price: 29.99, quantity: 2 },
    { name: 'Pen', price: 1.99, quantity: 5 }
  ],
  discount: 0.1
};

const total = calculateTotal(order.items, order.discount);
\`\`\`

**TypeScript (After):**
\`\`\`typescript
interface Item {
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  items: Item[];
  discount?: number;
}

function calculateTotal(items: Item[], discount?: number): number {
  const subtotal = items.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);
  
  return discount ? subtotal * (1 - discount) : subtotal;
}

const order: Order = {
  id: '123',
  items: [
    { name: 'Book', price: 29.99, quantity: 2 },
    { name: 'Pen', price: 1.99, quantity: 5 }
  ],
  discount: 0.1
};

const total: number = calculateTotal(order.items, order.discount);
\`\`\`

**✅ 转换要点**：
1. 添加类型接口定义
2. 函数参数和返回值添加类型注解
3. 变量添加类型声明（可选）
4. 可选属性用 \`?\` 标记

---

### 2️⃣ Class Component → React Hooks

**Class Component (Before):**
\`\`\`jsx
import React, { Component } from 'react';

class UserProfile extends Component {
  constructor(props) {
    super(props);
    this.state = {
      user: null,
      loading: true,
      error: null
    };
  }

  componentDidMount() {
    this.fetchUser();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.userId !== this.props.userId) {
      this.fetchUser();
    }
  }

  componentWillUnmount() {
    this.abortController?.abort();
  }

  async fetchUser() {
    this.setState({ loading: true });
    this.abortController = new AbortController();
    
    try {
      const response = await fetch(\`/api/users/\${this.props.userId}\`, {
        signal: this.abortController.signal
      });
      const user = await response.json();
      this.setState({ user, loading: false });
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.setState({ error: error.message, loading: false });
      }
    }
  }

  render() {
    const { user, loading, error } = this.state;

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;
    if (!user) return null;

    return (
      <div>
        <h1>{user.name}</h1>
        <p>{user.email}</p>
      </div>
    );
  }
}

export default UserProfile;
\`\`\`

**Hooks (After):**
\`\`\`tsx
import React, { useState, useEffect } from 'react';

interface User {
  name: string;
  email: string;
}

interface UserProfileProps {
  userId: string;
}

const UserProfile: React.FC<UserProfileProps> = ({ userId }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchUser() {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(\`/api/users/\${userId}\`, {
          signal: abortController.signal
        });
        const userData = await response.json();
        setUser(userData);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchUser();

    return () => {
      abortController.abort();
    };
  }, [userId]); // userId 变化时重新获取

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!user) return null;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
};

export default UserProfile;
\`\`\`

**✅ 转换要点**：
1. \`constructor\` + \`this.state\` → \`useState\`
2. \`componentDidMount\` + \`componentDidUpdate\` → \`useEffect\`
3. \`componentWillUnmount\` → \`useEffect\` 清理函数
4. \`this.props\` → 函数参数
5. \`this.setState\` → \`setState\` 函数
6. 类方法 → 函数内部函数或自定义 Hook

---

### 3️⃣ Promises → Async/Await

**Promises (Before):**
\`\`\`javascript
function getUserData(userId) {
  return fetch(\`/api/users/\${userId}\`)
    .then(response => {
      if (!response.ok) {
        throw new Error('User not found');
      }
      return response.json();
    })
    .then(user => {
      return fetch(\`/api/posts?userId=\${user.id}\`);
    })
    .then(response => response.json())
    .then(posts => {
      return { user, posts };
    })
    .catch(error => {
      console.error('Error:', error);
      throw error;
    });
}

// 使用
getUserData('123')
  .then(data => console.log(data))
  .catch(error => console.error(error));
\`\`\`

**Async/Await (After):**
\`\`\`javascript
async function getUserData(userId) {
  try {
    const userResponse = await fetch(\`/api/users/\${userId}\`);
    
    if (!userResponse.ok) {
      throw new Error('User not found');
    }
    
    const user = await userResponse.json();
    const postsResponse = await fetch(\`/api/posts?userId=\${user.id}\`);
    const posts = await postsResponse.json();
    
    return { user, posts };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// 使用
try {
  const data = await getUserData('123');
  console.log(data);
} catch (error) {
  console.error(error);
}
\`\`\`

**✅ 转换要点**：
1. 函数前加 \`async\` 关键字
2. \`.then()\` → \`await\`
3. \`.catch()\` → \`try/catch\`
4. Promise 链条变为顺序执行
5. 代码更易读，像同步代码

---

### 4️⃣ CSS → Tailwind CSS

**CSS (Before):**
\`\`\`css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.375rem;
  background-color: #3b82f6;
  color: white;
  transition: background-color 0.2s;
}

.button:hover {
  background-color: #2563eb;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-lg {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
}
\`\`\`

**Tailwind CSS (After):**
\`\`\`jsx
// 基础按钮
<button className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
  Button
</button>

// 大按钮
<button className="inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-md bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
  Large Button
</button>

// 或使用组件抽象
const Button = ({ size = 'default', children, ...props }) => {
  const sizeClasses = {
    default: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };
  
  return (
    <button
      className={\`
        inline-flex items-center justify-center font-medium rounded-md
        bg-blue-600 text-white transition-colors
        hover:bg-blue-700
        disabled:opacity-50 disabled:cursor-not-allowed
        \${sizeClasses[size]}
      \`}
      {...props}
    >
      {children}
    </button>
  );
};
\`\`\`

**✅ Tailwind 类名对照表**：

| CSS 属性 | Tailwind 类名 |
|----------|---------------|
| \`display: flex\` | \`flex\` |
| \`align-items: center\` | \`items-center\` |
| \`justify-content: center\` | \`justify-center\` |
| \`padding: 0.5rem 1rem\` | \`px-4 py-2\` |
| \`font-size: 0.875rem\` | \`text-sm\` |
| \`font-weight: 500\` | \`font-medium\` |
| \`border-radius: 0.375rem\` | \`rounded-md\` |
| \`background-color: #3b82f6\` | \`bg-blue-600\` |
| \`color: white\` | \`text-white\` |

---

### 5️⃣ CommonJS → ESM

**CommonJS (Before):**
\`\`\`javascript
// math.js
function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = {
  add,
  multiply
};

// main.js
const { add, multiply } = require('./math');
const lodash = require('lodash');

console.log(add(2, 3));
\`\`\`

**ESM (After):**
\`\`\`javascript
// math.js
export function add(a, b) {
  return a + b;
}

export function multiply(a, b) {
  return a * b;
}

// 或默认导出
// export default { add, multiply };

// main.js
import { add, multiply } from './math.js';
import lodash from 'lodash';

console.log(add(2, 3));
\`\`\`

**✅ 转换要点**：
1. \`module.exports\` → \`export\` / \`export default\`
2. \`require()\` → \`import\`
3. 文件扩展名：ESM 中通常需要 \`.js\`
4. \`package.json\` 需要设置 \`"type": "module"\`

---

### 6️⃣ JSON → TypeScript Interface

**JSON (Before):**
\`\`\`json
{
  "id": "123",
  "name": "John Doe",
  "email": "john@example.com",
  "age": 30,
  "isActive": true,
  "roles": ["admin", "user"],
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "zipCode": "10001"
  },
  "metadata": {
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T00:00:00Z"
  }
}
\`\`\`

**TypeScript Interface (After):**
\`\`\`typescript
interface Address {
  street: string;
  city: string;
  zipCode: string;
}

interface Metadata {
  createdAt: string; // 或 Date
  updatedAt: string; // 或 Date
}

interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  isActive: boolean;
  roles: string[];
  address: Address;
  metadata: Metadata;
}

// 使用
const user: User = {
  id: "123",
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  isActive: true,
  roles: ["admin", "user"],
  address: {
    street: "123 Main St",
    city: "New York",
    zipCode: "10001"
  },
  metadata: {
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-15T00:00:00Z"
  }
};
\`\`\`

---

## 转换注意事项

### ⚠️ 潜在问题

1. **类型安全**
   - 转换后需要添加类型检查
   - 注意 null/undefined 处理

2. **API 差异**
   - 不同框架的生命周期不同
   - 状态管理方式不同

3. **性能影响**
   - 某些转换可能影响性能
   - 需要测试和优化

4. **依赖更新**
   - 检查依赖包兼容性
   - 更新 package.json

---

---

## ⚠️ 边界约束

- ❌ 仅输出转换后代码，不自动替换源文件
- ❌ 不执行代码或命令
- ✅ 保持功能等价，不改变业务逻辑
- ✅ 输出完整可用的转换代码

现在请根据需求进行代码转换，提供：
1. 转换后的完整代码
2. 关键变更说明
3. 潜在问题提示
4. 迁移步骤（如需要）`;

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
          text: `❌ 代码转换失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

