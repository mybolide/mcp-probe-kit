import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import { handleToolError } from "../utils/error-handler.js";
import { resolveGuidanceCode, trimCodeForPrompt } from "../lib/code-review-input.js";
import { resolveWorkspaceRoot } from "../lib/workspace-root.js";

export async function refactor(args: any) {
  try {
    const parsedArgs = parseArgs<{
      code?: string;
      goal?: string;
      file_path?: string;
      project_root?: string;
      input?: string;
    }>(args, {
      defaultValues: {
        code: "",
        goal: "",
        file_path: "",
        project_root: "",
      },
      primaryField: "code",
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        goal: ["target", "objective", "目标", "重构目标"],
        file_path: ["filePath", "filepath", "path", "文件路径"],
        project_root: ["projectRoot", "project_path", "dir", "directory", "项目路径"],
      },
    });

    const goal = getString(parsedArgs.goal) || "全面优化";
    const inlineCode = getString(parsedArgs.code) || getString(parsedArgs.input);
    const filePath = getString(parsedArgs.file_path);
    const projectRoot = getString(parsedArgs.project_root);

    const resolved = resolveGuidanceCode({
      code: inlineCode,
      filePath: filePath || undefined,
      projectRoot: projectRoot ? resolveWorkspaceRoot(projectRoot) : undefined,
    });

    if (resolved.error) {
      return okStructured(
        `❌ refactor 无法读取输入: ${resolved.error}`,
        {
          mode: "guidance",
          refactorInput: {
            received: false,
            error: resolved.error,
            file: filePath || null,
            goal,
          },
        },
        {
          note: "指南型工具：请修正 file_path / project_root 或传入 code 后，由 Agent 输出重构计划",
        }
      );
    }

    const hasCode = Boolean(resolved.code.trim());
    const promptCode = hasCode ? trimCodeForPrompt(resolved.code, 24000, "refactorInput") : "";

    const header = renderGuidanceHeader({
      tool: "refactor",
      goal: "由 Agent 根据下方代码与重构清单分析坏味道，并输出重构计划与示例代码。",
      tasks: [
        "先阅读本次注入的 refactorInput.code（或 file_path 对应文件）",
        "识别代码坏味道并给出优先级",
        "在回复中输出结构化重构计划 JSON",
      ],
      outputs: ["重构计划（步骤、风险评估、预期收益）— 由 Agent 生成，非 MCP 自动分析"],
      notes: [
        "本工具为指南型（guidance-only），不在服务端自动修改源文件",
        hasCode ? `已注入待重构代码（${resolved.code.split("\n").length} 行）` : "未收到 code/file_path，请先提供待重构内容",
      ],
    });

    const message = `${header}请为以下代码提供重构建议：

📝 **待重构代码**${resolved.file ? `（来源: ${resolved.file}）` : ""}：
${hasCode ? `\`\`\`\n${promptCode}\n\`\`\`` : "_未提供 code / file_path，请 Agent 先读取目标文件或让用户补充后再分析_"}

🎯 **重构目标**：${goal}

---

## 重构分析流程

### 第一步：识别代码坏味道

**常见问题**：
1. **重复代码（Duplicated Code）** — 建议提取公共函数
2. **过长函数（Long Function）** — 建议拆分
3. **过大类（Large Class）** — 建议按职责拆分
4. **过长参数列表** — 建议对象封装
5. **复杂条件判断** — 提前返回、策略模式
6. **魔法数字** — 使用常量
7. **紧耦合** — 依赖注入、接口抽象

### 第二步：重构建议优先级

- 🔴 **Critical**：严重影响可维护性
- 🟡 **Important**：建议尽快处理
- 🟢 **Nice-to-have**：可选优化

---

## 重构技术参考

- 提取函数（Extract Function）
- 简化条件表达式（Early Return）
- 引入参数对象
- 替换魔法数字
- 组合函数调用 / pipe

---

## ⚠️ 边界约束

- MCP 仅返回指南 + 注入的代码，**重构计划由 Agent 分析后生成**
- ❌ 不自动修改源文件，不执行命令
- ✅ 保持功能不变，仅改善代码结构

---

## 📤 Agent 必须输出的 JSON 格式

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
    "risks": ["风险1"],
    "mitigations": ["缓解措施1"]
  },
  "expectedBenefits": ["收益1"]
}
\`\`\`

现在请分析代码，提供详细的重构建议和实施计划。`;

    return okStructured(
      message,
      {
        mode: "guidance",
        refactorInput: {
          received: hasCode,
          goal,
          file: resolved.file ?? null,
          lineCount: hasCode ? resolved.code.split("\n").length : 0,
          code: hasCode ? resolved.code : null,
          truncatedInPrompt: hasCode && resolved.code.length !== promptCode.length,
        },
      },
      {
        schema: (await import("../schemas/output/core-tools.js")).RefactorPlanSchema,
        note: "指南型工具：重构计划须由 Agent 分析后生成；MCP 不返回自动分析结果",
      }
    );
  } catch (error) {
    return handleToolError(error, "refactor");
  }
}
