import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { RefactorWorkflowReport } from "../schemas/output/workflow-tools.js";

/**
 * start_refactor 智能编排工具
 * 
 * 场景：代码重构
 * 编排：[检查上下文] → code_review → refactor → gentest
 */
export async function startRefactor(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      goal?: string;
    }>(args, {
      defaultValues: {
        code: "",
        goal: "improve_readability",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        goal: ["target", "objective", "目标", "重构目标"],
      },
    });

    const code = getString(parsedArgs.code);
    const goal = getString(parsedArgs.goal) || "improve_readability";

    if (!code) {
      throw new Error("缺少必填参数: code（需要重构的代码）");
    }

    const goalDesc: Record<string, string> = {
      improve_readability: "提高可读性",
      reduce_complexity: "降低复杂度",
      extract_function: "提取函数",
      remove_duplication: "消除重复",
      improve_naming: "改进命名",
    };

    const message = `# ♻️ 代码重构编排

重构以下代码：

\`\`\`
${code}
\`\`\`

**重构目标**: ${goalDesc[goal] || goal}

---

## 📋 执行步骤

### 步骤 1: 代码审查（发现问题）
调用 \`code_review\` 工具，识别代码坏味道、发现可改进点、评估当前代码质量。

### 步骤 2: 生成重构方案
调用 \`refactor\` 工具，根据重构目标生成重构后的代码和重构说明。

### 步骤 3: 生成保护测试
调用 \`gentest\` 工具，为重构后的代码生成测试，确保重构不改变行为。

---

## 📝 输出内容

完成后，提供：
1. 重构前后对比
2. 改进说明
3. 测试覆盖
4. 注意事项

**重要**: 请使用结构化输出格式返回结果。`;

    // 创建结构化数据对象
    const structuredData: RefactorWorkflowReport = {
      summary: `代码重构 - ${goalDesc[goal] || goal}`,
      status: "pending",
      steps: [
        {
          name: "code_review",
          description: "代码审查",
          status: "pending",
        },
        {
          name: "refactor",
          description: "生成重构方案",
          status: "pending",
        },
        {
          name: "gentest",
          description: "生成保护测试",
          status: "pending",
        },
      ],
      refactorPlan: {}, // AI 将填充实际的重构计划
      riskAssessment: {
        level: "medium",
      },
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/workflow-tools.js")).RefactorWorkflowSchema,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    const errorData: RefactorWorkflowReport = {
      summary: "代码重构失败",
      status: "failed",
      steps: [],
      refactorPlan: {},
      riskAssessment: {
        level: "high",
      },
      warnings: [errorMsg],
    };
    
    return okStructured(`❌ 编排执行失败: ${errorMsg}`, errorData, {
      schema: (await import("../schemas/output/workflow-tools.js")).RefactorWorkflowSchema,
    });
  }
}
