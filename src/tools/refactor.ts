import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import type { RefactorPlan } from "../schemas/output/core-tools.js";

// refactor 工具实现
export async function refactor(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      goal?: string;
    }>(args, {
      defaultValues: {
        code: "",
        goal: "",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        goal: ["target", "objective", "目标", "重构目标"],
      },
    });
    
    const code = getString(parsedArgs.code);
    const goal = getString(parsedArgs.goal); // improve_readability, reduce_complexity, extract_function, etc.

    const header = renderGuidanceHeader({
      tool: "refactor",
      goal: "输出结构化的重构计划。",
      tasks: ["分析代码问题并给出重构步骤", "仅输出重构方案"],
      outputs: ["结构化重构计划（JSON）"],
    });

    const message = `${header}请为以下代码提供重构建议：

📝 **代码内容**：
${code || "请提供需要重构的代码"}

🎯 **重构目标**：${goal || "全面优化"}

---

## 重构分析流程

### 第一步：识别代码坏味道

**常见问题**：
1. **重复代码（Duplicated Code）**
   - 相同或相似的代码出现多次
   - 建议：提取公共函数/方法

2. **过长函数（Long Function）**
   - 函数超过 30 行
   - 建议：拆分为多个小函数

3. **过大类（Large Class）**
   - 类职责过多
   - 建议：按职责拆分类

4. **过长参数列表（Long Parameter List）**
   - 参数超过 3-4 个
   - 建议：使用对象封装参数

5. **复杂条件判断（Complex Conditional）**
   - 嵌套超过 3 层
   - 建议：提前返回、使用策略模式

6. **魔法数字（Magic Numbers）**
   - 硬编码的数字
   - 建议：使用常量

7. **紧耦合（Tight Coupling）**
   - 模块间依赖过强
   - 建议：依赖注入、接口抽象

### 第二步：重构建议

**优先级分类**：
- 🔴 **Critical**：严重影响可维护性
- 🟡 **Important**：建议尽快处理
- 🟢 **Nice-to-have**：可选优化

---

## 重构技术清单

### 1️⃣ 提取函数（Extract Function）

**场景**：一段代码可以被独立理解

**示例**：
\`\`\`typescript
// Before
function processOrder(order) {
  // 验证订单
  if (!order.id || !order.items || order.items.length === 0) {
    throw new Error('Invalid order');
  }
  
  // 计算总价
  let total = 0;
  for (const item of order.items) {
    total += item.price * item.quantity;
  }
  
  // 应用折扣
  if (order.coupon) {
    total = total * (1 - order.coupon.discount);
  }
  
  return total;
}

// After
function processOrder(order) {
  validateOrder(order);
  const subtotal = calculateSubtotal(order.items);
  const total = applyDiscount(subtotal, order.coupon);
  return total;
}

function validateOrder(order) {
  if (!order.id || !order.items || order.items.length === 0) {
    throw new Error('Invalid order');
  }
}

function calculateSubtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function applyDiscount(amount, coupon) {
  return coupon ? amount * (1 - coupon.discount) : amount;
}
\`\`\`

### 2️⃣ 简化条件表达式

**技巧**：
- 使用提前返回（Early Return）
- 合并条件
- 使用三元运算符
- 策略模式替代 switch

**示例**：
\`\`\`typescript
// Before
function getDiscount(user) {
  if (user) {
    if (user.isPremium) {
      if (user.orderCount > 10) {
        return 0.3;
      } else {
        return 0.2;
      }
    } else {
      return 0.1;
    }
  } else {
    return 0;
  }
}

// After
function getDiscount(user) {
  if (!user) return 0;
  if (!user.isPremium) return 0.1;
  return user.orderCount > 10 ? 0.3 : 0.2;
}
\`\`\`

### 3️⃣ 引入参数对象

**场景**：参数过多

**示例**：
\`\`\`typescript
// Before
function createUser(name, email, age, address, phone, country) {
  // ...
}

// After
interface UserData {
  name: string;
  email: string;
  age: number;
  address: string;
  phone: string;
  country: string;
}

function createUser(userData: UserData) {
  // ...
}
\`\`\`

### 4️⃣ 替换魔法数字

**示例**：
\`\`\`typescript
// Before
if (status === 1) {
  // ...
} else if (status === 2) {
  // ...
}

// After
enum OrderStatus {
  PENDING = 1,
  PROCESSING = 2,
  COMPLETED = 3
}

if (status === OrderStatus.PENDING) {
  // ...
} else if (status === OrderStatus.PROCESSING) {
  // ...
}
\`\`\`

### 5️⃣ 组合函数调用

**示例**：
\`\`\`typescript
// Before
const data = getData();
const filtered = filterData(data);
const sorted = sortData(filtered);
const formatted = formatData(sorted);

// After
const result = getData()
  .then(filterData)
  .then(sortData)
  .then(formatData);

// Or using pipe
const result = pipe(
  getData,
  filterData,
  sortData,
  formatData
)();
\`\`\`

---

## 重构计划模板

### 🎯 重构目标
简要说明重构的目的和预期效果

### 📋 问题清单
1. **问题 1**：重复代码
   - 位置：第 10-20 行、第 50-60 行
   - 影响：可维护性差
   - 优先级：🔴 Critical

2. **问题 2**：函数过长
   - 位置：processData() 函数
   - 影响：难以理解和测试
   - 优先级：🟡 Important

### 🔧 重构步骤

**步骤 1：准备**
- [x] 确保测试覆盖率 > 80%
- [x] 备份当前代码
- [x] 创建重构分支

**步骤 2：小步重构**
1. 提取 calculateTotal 函数
   - 风险：低
   - 预计时间：10 分钟
   - 测试：运行单元测试

2. 简化条件判断
   - 风险：低
   - 预计时间：15 分钟
   - 测试：运行集成测试

3. 引入参数对象
   - 风险：中
   - 预计时间：30 分钟
   - 测试：全量测试

**步骤 3：验证**
- [ ] 所有测试通过
- [ ] 代码审查
- [ ] 性能对比
- [ ] 部署到测试环境

### ⚠️ 风险评估

**高风险操作**：
- 修改公共 API
- 改变数据结构
- 调整核心算法

**降低风险的措施**：
- 渐进式重构（小步快跑）
- 每步都运行测试
- 保持功能不变
- Code Review

### 📊 预期收益

**可维护性**：⬆️ 30%
- 代码行数减少 20%
- 圈复杂度降低 40%

**可测试性**：⬆️ 50%
- 函数职责单一
- 依赖可注入

**性能**：⬆️ 10%
- 减少重复计算
- 优化算法复杂度

---

---

## ⚠️ 边界约束

- ❌ 仅输出重构建议和代码，不自动修改源文件
- ❌ 不执行代码或命令
- ✅ 保持功能不变，仅改善代码结构
- ✅ 输出结构化重构方案和示例代码

---

## 📤 输出格式要求

请严格按以下 JSON 格式输出重构计划：

\`\`\`json
{
  "summary": "重构摘要",
  "goal": "improve_readability|reduce_complexity|improve_performance|improve_maintainability|modernize",
  "currentIssues": ["问题1", "问题2"],
  "refactoringSteps": [
    {
      "step": 1,
      "title": "步骤标题",
      "description": "步骤描述",
      "before": "重构前代码",
      "after": "重构后代码",
      "rationale": "重构理由"
    }
  ],
  "riskAssessment": {
    "level": "low|medium|high",
    "risks": ["风险1", "风险2"],
    "mitigations": ["缓解措施1", "缓解措施2"]
  },
  "expectedBenefits": ["收益1", "收益2"]
}
\`\`\`

现在请分析代码，提供详细的重构建议和实施计划。`;

    // 创建结构化数据对象
    const refactorPlan: RefactorPlan = {
      summary: `代码重构计划 - 目标: ${goal || '全面优化'}`,
      goal: (goal as any) || 'improve_maintainability',
      refactoringSteps: [],
      riskAssessment: {
        level: 'medium',
        risks: [],
      },
    };

    return okStructured(message, refactorPlan, {
      schema: (await import('../schemas/output/core-tools.js')).RefactorPlanSchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorData: RefactorPlan = {
      summary: `重构分析失败: ${errorMessage}`,
      goal: 'improve_maintainability',
      refactoringSteps: [],
      riskAssessment: {
        level: 'high',
        risks: [errorMessage],
      },
    };
    return okStructured(
      `❌ 重构分析失败: ${errorMessage}`,
      errorData,
      {
        schema: (await import('../schemas/output/core-tools.js')).RefactorPlanSchema,
      }
    );
  }
}

