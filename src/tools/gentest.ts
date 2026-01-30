import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import type { TestSuite } from "../schemas/output/core-tools.js";

// gentest 工具实现
export async function gentest(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      framework?: string;
    }>(args, {
      defaultValues: {
        code: "",
        framework: "jest",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "function"],
        framework: ["test_framework", "lib", "框架", "测试框架"],
      },
    });
    
    const code = getString(parsedArgs.code);
    const framework = getString(parsedArgs.framework) || "jest"; // jest, vitest, mocha

    const header = renderGuidanceHeader({
      tool: "gentest",
      goal: "生成完整可运行的测试用例。",
      tasks: ["基于代码生成测试用例", "仅输出测试代码"],
      outputs: [`${framework} 测试代码（含边界与异常用例）`],
    });

    const message = `${header}请为以下代码生成完整的测试用例：

📝 **代码内容**：
${code || "请提供需要测试的代码"}

🧪 **测试框架**：${framework}

---

## 测试用例生成指南

### 1️⃣ 测试策略

**测试类型**：
- **单元测试**：测试单个函数/方法
- **集成测试**：测试模块间交互
- **边界测试**：测试极端情况
- **异常测试**：测试错误处理

**覆盖维度**：
- ✅ 正常情况（Happy Path）
- ✅ 边界条件（Boundary Conditions）
- ✅ 异常情况（Error Cases）
- ✅ 空值/特殊值（Null/Special Values）

### 2️⃣ 测试用例模板

**测试结构（AAA 模式）**：
\`\`\`typescript
describe('函数/模块名称', () => {
  // Arrange - 准备测试数据
  // Act - 执行被测试的代码
  // Assert - 验证结果
  
  test('描述测试场景', () => {
    // Arrange
    const input = ...;
    const expected = ...;
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toBe(expected);
  });
});
\`\`\`

### 3️⃣ 测试用例清单

**正常情况测试**：
- [ ] 基本功能正常工作
- [ ] 返回值类型正确
- [ ] 副作用符合预期

**边界条件测试**：
- [ ] 空输入（null, undefined, "", [], {}）
- [ ] 最小值/最大值
- [ ] 边界临界值

**异常情况测试**：
- [ ] 无效输入
- [ ] 类型错误
- [ ] 超出范围
- [ ] 异常抛出正确

**性能测试（可选）**：
- [ ] 大数据量处理
- [ ] 时间复杂度验证

### 4️⃣ Mock 和 Stub

**需要 Mock 的场景**：
- API 调用
- 数据库操作
- 文件系统操作
- 时间相关函数
- 随机数生成
- 外部依赖

**Mock 示例**：
\`\`\`typescript
// Mock 函数
const mockFetch = jest.fn();

// Mock 模块
jest.mock('./api', () => ({
  fetchUser: jest.fn().mockResolvedValue({ id: 1, name: 'Test' })
}));

// Mock 时间
jest.useFakeTimers();
\`\`\`

### 5️⃣ 测试数据

**测试数据原则**：
- 使用有意义的测试数据
- 避免硬编码，使用工厂函数
- 覆盖各种数据类型
- 准备充分的边界数据

**数据工厂示例**：
\`\`\`typescript
const createUser = (overrides = {}) => ({
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
  ...overrides
});
\`\`\`

---

## 测试文件命名规范

- **单元测试**：\`functionName.test.ts\` 或 \`functionName.spec.ts\`
- **集成测试**：\`moduleName.integration.test.ts\`
- **E2E 测试**：\`feature.e2e.test.ts\`

---

---

## ⚠️ 边界约束

- ❌ 仅输出测试代码，不自动运行测试
- ❌ 不修改被测试的源代码
- ✅ 默认跟随项目现有测试框架与语言
- ✅ 输出完整可运行的测试文件

现在请生成完整的测试代码，包括：
1. describe 块组织
2. 所有必要的测试用例
3. Mock/Stub 设置
4. 测试数据准备
5. 清晰的注释说明

---

## 📤 输出格式要求

请严格按以下 JSON 格式输出测试套件：

\`\`\`json
{
  "summary": "测试套件摘要",
  "framework": "jest|vitest|mocha",
  "testCases": [
    {
      "name": "测试用例名称",
      "description": "测试用例描述",
      "type": "unit|integration|e2e",
      "code": "完整的测试代码",
      "assertions": ["断言1", "断言2"]
    }
  ],
  "edgeCases": [
    {
      "scenario": "边界场景描述",
      "input": "输入数据",
      "expectedOutput": "预期输出"
    }
  ],
  "mockData": {
    "mockName": "mock数据"
  }
}
\`\`\``;

    // 创建结构化数据对象
    const testSuite: TestSuite = {
      summary: `为提供的代码生成 ${framework} 测试用例`,
      framework: framework as any,
      testCases: [],
    };

    return okStructured(message, testSuite, {
      schema: (await import('../schemas/output/core-tools.js')).TestSuiteSchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorData: TestSuite = {
      summary: `生成测试用例失败: ${errorMessage}`,
      framework: 'jest',
      testCases: [],
    };
    return okStructured(
      `❌ 生成测试用例失败: ${errorMessage}`,
      errorData,
      {
        schema: (await import('../schemas/output/core-tools.js')).TestSuiteSchema,
      }
    );
  }
}

