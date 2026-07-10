import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
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
      return okStructured(
        `❌ code_review 无法读取输入: ${resolved.error}`,
        {
          mode: "guidance",
          reviewInput: {
            received: false,
            error: resolved.error,
            file: filePath || null,
          },
        },
        {
          note: "指南型工具：请修正 file_path / project_root 或传入 code 后，由 Agent 按清单完成审查并输出 issues JSON",
        }
      );
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

    return okStructured(
      message,
      {
        mode: "guidance",
        reviewInput: {
          received: hasCode,
          focus,
          file: resolved.file ?? null,
          lineCount: hasCode ? resolved.code.split("\n").length : 0,
          code: hasCode ? resolved.code : null,
          truncatedInPrompt: hasCode && resolved.code.length !== promptCode.length,
        },
      },
      {
        schema: (await import("../schemas/output/core-tools.js")).CodeReviewReportSchema,
        note: "指南型工具：issues 须由 Agent 按清单审查后生成；MCP 不返回静态扫描结果",
      }
    );
  } catch (error) {
    return handleToolError(error, "code_review");
  }
}
