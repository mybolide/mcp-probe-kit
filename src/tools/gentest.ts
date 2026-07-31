import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { GuidanceResult } from "../schemas/output/guidance-tools.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import { handleToolError } from "../utils/error-handler.js";
import { resolveGuidanceCode, trimCodeForPrompt } from "../lib/code-review-input.js";
import { resolveWorkspaceRoot } from "../lib/workspace-root.js";

export async function gentest(args: any) {
  try {
    const parsedArgs = parseArgs<{
      code?: string;
      framework?: string;
      file_path?: string;
      project_root?: string;
      input?: string;
    }>(args, {
      defaultValues: {
        code: "",
        framework: "jest",
        file_path: "",
        project_root: "",
      },
      primaryField: "code",
      fieldAliases: {
        code: ["source", "src", "代码", "function"],
        framework: ["test_framework", "lib", "框架", "测试框架"],
        file_path: ["filePath", "filepath", "path", "文件路径"],
        project_root: ["projectRoot", "project_path", "dir", "directory", "项目路径"],
      },
    });

    const framework = getString(parsedArgs.framework) || "jest";
    const inlineCode = getString(parsedArgs.code) || getString(parsedArgs.input);
    const filePath = getString(parsedArgs.file_path);
    const projectRoot = getString(parsedArgs.project_root);

    const resolved = resolveGuidanceCode({
      code: inlineCode,
      filePath: filePath || undefined,
      projectRoot: projectRoot ? resolveWorkspaceRoot(projectRoot) : undefined,
    });

    if (resolved.error) {
      const structured: GuidanceResult & { gentestInput: Record<string, unknown> } = {
        mode: "guidance",
        summary: `无法读取待测试代码：${resolved.error}`,
        input: { framework, file: filePath || null },
        gentestInput: { received: false, error: resolved.error, file: filePath || null, framework },
        instructions: [
          "提供 code，或提供 file_path 与 project_root 让 Agent 读取目标文件",
          "拿到代码后覆盖正常、边界、异常和依赖交互场景",
        ],
        outputContract: { framework: "string", testFile: "complete source code", coveredScenarios: ["string"] },
        boundaries: ["该工具返回测试设计指南，不声称已生成或运行测试文件"],
        nextSteps: ["补充可读取的代码后重新调用 gentest"],
      };
      return okStructured(`gentest 无法读取代码：${resolved.error}`, structured, {
        schema: (await import("../schemas/output/guidance-tools.js")).GuidanceResultSchema,
      });
    }

    const hasCode = Boolean(resolved.code.trim());
    const promptCode = hasCode ? trimCodeForPrompt(resolved.code, 24000, "gentestInput") : "";

    const header = renderGuidanceHeader({
      tool: "gentest",
      goal: "由 Agent 根据下方代码与测试清单生成完整可运行的测试用例。",
      tasks: [
        "先阅读本次注入的 gentestInput.code（或 file_path 对应文件）",
        "按测试策略覆盖正常、边界与异常场景",
        "在回复中直接输出完整测试代码文件",
      ],
      outputs: [`${framework} 测试代码（含边界与异常用例）— 由 Agent 生成，非 MCP 自动生成`],
      notes: [
        "本工具为指南型（guidance-only），不在服务端生成或运行测试",
        hasCode ? `已注入待测代码（${resolved.code.split("\n").length} 行）` : "未收到 code/file_path，请先提供待测内容",
      ],
    });

    const message = `${header}请为以下代码生成完整的测试用例：

📝 **待测代码**${resolved.file ? `（来源: ${resolved.file}）` : ""}：
${hasCode ? `\`\`\`\n${promptCode}\n\`\`\`` : "_未提供 code / file_path，请 Agent 先读取目标文件或让用户补充后再生成测试_"}

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

### 4️⃣ Mock 和 Stub

**需要 Mock 的场景**：API 调用、数据库、文件系统、时间、随机数、外部依赖

---

## 测试文件命名规范

- **单元测试**：\`functionName.test.ts\` 或 \`functionName.spec.ts\`
- **集成测试**：\`moduleName.integration.test.ts\`

---

## ⚠️ 边界约束

- MCP 仅返回指南 + 注入的待测代码，**测试代码由 Agent 生成**
- ❌ 不自动运行测试，不修改被测试的源代码
- ✅ 默认跟随项目现有测试框架与语言

---

## 📤 Agent 必须输出的内容

请直接输出完整的测试代码文件，包含：
- import 语句（测试框架和被测试代码）
- describe 块（测试套件）
- 多个 test/it 块（各种测试用例）
- 必要的 mock 和 setup/teardown

现在请生成完整的测试代码。`;

    const structured: GuidanceResult & { gentestInput: Record<string, unknown> } = {
      mode: "guidance",
      summary: `${framework} 测试生成指南`,
      input: {
        framework,
        file: resolved.file ?? null,
        lineCount: hasCode ? resolved.code.split("\n").length : 0,
      },
      gentestInput: {
        received: hasCode,
        framework,
        file: resolved.file ?? null,
        lineCount: hasCode ? resolved.code.split("\n").length : 0,
        code: hasCode ? resolved.code : null,
        truncatedInPrompt: hasCode && resolved.code.length !== promptCode.length,
      },
      instructions: [
        "完整阅读 gentestInput.code，识别公开行为、输入输出、依赖和失败路径",
        "覆盖正常流程、边界值、空值、无效输入、异常和外部依赖交互",
        "沿用项目现有测试框架、命名、目录和 mock 习惯；默认使用 AAA 结构",
        "输出可直接落盘的完整测试代码，并说明覆盖场景；不要声称已经运行",
      ],
      outputContract: {
        framework,
        fileName: "*.test.* or *.spec.*",
        testFile: "complete source code with imports, describe/test blocks and mocks",
        coveredScenarios: ["happy path", "boundary", "error path"],
        verificationCommand: "project-specific test command",
      },
      boundaries: [
        "该工具提供测试设计和代码生成契约，不自动运行测试",
        "不得修改被测源代码来迎合测试；实际通过状态必须由运行结果证明",
      ],
      nextSteps: ["Agent 生成测试文件、落盘并运行项目测试命令验证"],
    };

    return okStructured(message, structured, {
      schema: (await import("../schemas/output/guidance-tools.js")).GuidanceResultSchema,
      note: "指导型工具：structuredContent 包含完整测试清单、边界和输出契约",
    });
  } catch (error) {
    return handleToolError(error, "gentest");
  }
}
