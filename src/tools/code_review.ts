import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { GuidanceResult } from "../schemas/output/guidance-tools.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import { handleToolError } from "../utils/error-handler.js";
import { renderCodeLimits, renderBannedPatterns, CODE_LIMITS } from "../lib/quality-constraints.js";
import { resolveReviewCode, trimReviewCodeForPrompt } from "../lib/code-review-input.js";
import { resolveWorkspaceRoot } from "../lib/workspace-root.js";

export async function codeReview(args: any) {
  try {
    const parsedArgs = parseArgs<{
      code?: string;
      focus?: string;
      file_path?: string;
      project_root?: string;
      input?: string;
    }>(args, {
      defaultValues: {
        code: "",
        focus: "all",
        file_path: "",
        project_root: "",
      },
      primaryField: "code",
      fieldAliases: {
        code: ["source", "src", "代码", "content", "diff"],
        focus: ["type", "category", "类型", "重点"],
        file_path: ["filePath", "filepath", "path", "文件路径"],
        project_root: ["projectRoot", "project_path", "dir", "directory", "项目路径"],
      },
    });

    const focus = getString(parsedArgs.focus) || "all";
    const inlineCode = getString(parsedArgs.code) || getString(parsedArgs.input);
    const filePath = getString(parsedArgs.file_path);
    const projectRoot = getString(parsedArgs.project_root);

    const resolved = resolveReviewCode({
      code: inlineCode,
      filePath: filePath || undefined,
      projectRoot: projectRoot ? resolveWorkspaceRoot(projectRoot) : undefined,
    });

    if (resolved.error) {
      const structured: GuidanceResult & { reviewInput: Record<string, unknown> } = {
        mode: "guidance",
        summary: `无法读取待审查代码：${resolved.error}`,
        input: { focus, file: filePath || null },
        reviewInput: {
          received: false,
          error: resolved.error,
          file: filePath || null,
        },
        instructions: [
          "提供 code，或提供 file_path 与 project_root 让 Agent 读取目标文件",
          "拿到代码后按质量、安全、性能和规范四个维度逐项审查",
        ],
        outputContract: {
          summary: "string",
          overallScore: "number",
          issues: [{ severity: "critical|high|medium|low", category: "quality|security|performance|style", message: "string", suggestion: "string" }],
          strengths: ["string"],
        },
        boundaries: ["该工具返回审查方法，不声称已经完成静态扫描"],
        nextSteps: ["补充可读取的代码后重新调用 code_review"],
      };
      return okStructured(`code_review 无法读取代码：${resolved.error}`, structured, {
        schema: (await import("../schemas/output/guidance-tools.js")).GuidanceResultSchema,
      });
    }

    const hasCode = Boolean(resolved.code.trim());
    const promptCode = hasCode ? trimReviewCodeForPrompt(resolved.code) : "";

    const header = renderGuidanceHeader({
      tool: "code_review",
      goal: "由 Agent 根据下方代码与审查清单完成审查，并输出结构化问题清单。",
      tasks: [
        "先阅读本次注入的 reviewInput.code（或 file_path 对应文件）",
        "按审查清单逐项检查，不要只复述清单",
        "在回复中输出 issues JSON（severity/category/message/suggestion）",
      ],
      outputs: ["审查报告（问题清单、优点、建议）— 由 Agent 生成，非 MCP 静态扫描"],
      notes: [
        "本工具为指南型（guidance-only），不在服务端做静态规则扫描",
        hasCode ? `已注入待审代码（${resolved.code.split("\n").length} 行）` : "未收到 code/file_path，请先提供待审内容",
      ],
    });

    const message = `${header}请对以下代码进行全面审查：

📝 **待审代码**${resolved.file ? `（来源: ${resolved.file}）` : ""}：
${hasCode ? `\`\`\`\n${promptCode}\n\`\`\`` : "_未提供 code / file_path，请 Agent 先读取目标文件或让用户补充后再审查_"}

🎯 **审查重点**：${focus}

---

## 代码审查清单

### 1️⃣ 代码质量检查

${renderCodeLimits()}

**代码坏味道（Code Smells）**：
- [ ] 重复代码（Duplicated Code）
- [ ] 过长函数（Long Function）> ${CODE_LIMITS.maxFunctionLines} 行
- [ ] 过长参数列表（Long Parameter List）> ${CODE_LIMITS.maxParameters} 个
- [ ] 复杂条件判断（Complex Conditional）> ${CODE_LIMITS.maxNestingDepth} 层嵌套
- [ ] 魔法数字（Magic Numbers）
- [ ] 命名不清晰（Poor Naming）

**设计原则**：
- [ ] 单一职责原则（SRP）
- [ ] 开闭原则（OCP）
- [ ] 接口隔离原则（ISP）
- [ ] 依赖倒置原则（DIP）

### 2️⃣ 安全漏洞检查

**常见漏洞**：
- [ ] SQL 注入风险
- [ ] XSS（跨站脚本）风险
- [ ] CSRF（跨站请求伪造）
- [ ] 硬编码密钥/密码
- [ ] 不安全的随机数生成
- [ ] 路径遍历漏洞
- [ ] 未验证的输入
- [ ] 敏感信息泄露

### 3️⃣ 性能问题检查

**性能风险**：
- [ ] 循环内创建对象
- [ ] 嵌套循环（O(n²) 或更差）
- [ ] 不必要的重复计算
- [ ] 内存泄漏风险
- [ ] 阻塞主线程
- [ ] 大数据量未分页
- [ ] 同步 I/O 操作

### 4️⃣ 完整性检查

${renderBannedPatterns()}

### 5️⃣ 最佳实践检查

**TypeScript/JavaScript**：
- [ ] 类型定义完整（避免 any）
- [ ] 错误处理完善（try-catch）
- [ ] 异步操作正确处理

---

## 📤 Agent 必须输出的 JSON 格式

\`\`\`json
{
  "summary": "代码整体评价（一句话）",
  "overallScore": 85,
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "quality|security|performance|style",
      "file": "文件路径（如有）",
      "line": 10,
      "code": "问题代码片段",
      "message": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "strengths": ["做得好的地方"]
}
\`\`\`

## ⚠️ 边界

- MCP 仅返回指南 + 注入的待审代码，**issues 由 Agent 审查后生成**
- 不要声称「工具已扫描完成」；应基于上方代码与清单给出真实发现

现在请开始审查并输出问题清单。`;

    const structured: GuidanceResult & { reviewInput: Record<string, unknown> } = {
      mode: "guidance",
      summary: `代码审查指南：${focus}`,
      input: {
        focus,
        file: resolved.file ?? null,
        lineCount: hasCode ? resolved.code.split("\n").length : 0,
      },
      reviewInput: {
        received: hasCode,
        focus,
        file: resolved.file ?? null,
        lineCount: hasCode ? resolved.code.split("\n").length : 0,
        code: hasCode ? resolved.code : null,
        truncatedInPrompt: hasCode && resolved.code.length !== promptCode.length,
      },
      instructions: [
        "完整阅读 reviewInput.code 或 file_path 对应文件，不要只机械勾选清单",
        "检查代码质量、SOLID、常见安全漏洞、性能风险和项目规范",
        "每个问题必须有代码证据、严重级别、类别、位置和可执行修复建议",
        "同时记录做得好的地方；没有证据的问题不要报告",
      ],
      outputContract: {
        summary: "string",
        overallScore: "number 0-100",
        issues: [{
          severity: "critical|high|medium|low",
          category: "quality|security|performance|style",
          file: "string|null",
          line: "number|null",
          code: "string|null",
          message: "string",
          suggestion: "string",
        }],
        strengths: ["string"],
      },
      boundaries: [
        "该工具提供审查清单和代码输入，不声称已运行静态扫描器",
        "最终 issues 必须由 Agent 基于实际代码分析生成",
      ],
      nextSteps: ["Agent 按 instructions 审查代码并输出符合 outputContract 的报告"],
    };

    return okStructured(message, structured, {
      schema: (await import("../schemas/output/guidance-tools.js")).GuidanceResultSchema,
      note: "指导型工具：structuredContent 包含完整审查清单、边界和输出契约，由 Agent 基于实际代码生成 issues",
    });
  } catch (error) {
    return handleToolError(error, "code_review");
  }
}
