import { parseArgs, getNumber, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { GuidanceResult } from "../schemas/output/guidance-tools.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import { handleToolError } from "../utils/error-handler.js";
import { renderCodeLimits, renderBannedPatterns, CODE_LIMITS } from "../lib/quality-constraints.js";
import { resolveReviewCode, trimReviewCodeForPrompt } from "../lib/code-review-input.js";
import { resolveWorkspaceRoot } from "../lib/workspace-root.js";
import {
  collectCodeReviewEvidence,
  normalizeGitDiffMode,
  renderConsistencyEvidence,
} from "../lib/code-review-evidence.js";

export async function codeReview(args: any) {
  try {
    const parsedArgs = parseArgs<{
      code?: string;
      focus?: string;
      file_path?: string;
      project_root?: string;
      plan_id?: string;
      diff_mode?: string;
      base_ref?: string;
      head_ref?: string;
      max_diff_chars?: number;
      input?: string;
    }>(args, {
      defaultValues: {
        code: "",
        focus: "all",
        file_path: "",
        project_root: "",
        plan_id: "",
        diff_mode: "auto",
        base_ref: "",
        head_ref: "",
        max_diff_chars: 120000,
      },
      primaryField: "code",
      fieldAliases: {
        code: ["source", "src", "代码", "content", "diff"],
        focus: ["type", "category", "类型", "重点"],
        file_path: ["filePath", "filepath", "path", "文件路径"],
        project_root: ["projectRoot", "project_path", "dir", "directory", "项目路径"],
        plan_id: ["planId", "plan", "计划ID", "计划"],
        diff_mode: ["diffMode", "变更模式"],
        base_ref: ["baseRef", "base", "基线"],
        head_ref: ["headRef", "head", "目标版本"],
        max_diff_chars: ["maxDiffChars", "最大Diff字符"],
      },
    });

    const focus = getString(parsedArgs.focus) || "all";
    const inlineCode = getString(parsedArgs.code) || getString(parsedArgs.input);
    const filePath = getString(parsedArgs.file_path);
    const projectRootInput = getString(parsedArgs.project_root);
    const planId = getString(parsedArgs.plan_id);
    const diffModeText = getString(parsedArgs.diff_mode) || "auto";
    const baseRef = getString(parsedArgs.base_ref);
    const headRef = getString(parsedArgs.head_ref);
    const maxDiffChars = getNumber(parsedArgs.max_diff_chars, 120000);
    const diffMode = normalizeGitDiffMode(diffModeText);
    if (diffMode === "range" && (!baseRef || !headRef)) {
      throw new Error("diff_mode=range 时必须同时提供 base_ref 和 head_ref");
    }
    const needsProjectEvidence = Boolean(
      projectRootInput
      || planId
      || getString(parsedArgs.base_ref)
      || getString(parsedArgs.head_ref)
      || diffModeText !== "auto"
    );
    const projectRoot = needsProjectEvidence
      ? resolveWorkspaceRoot(projectRootInput || "")
      : undefined;

    const resolved = resolveReviewCode({
      code: inlineCode,
      filePath: filePath || undefined,
      projectRoot,
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

    const collectDiff = Boolean(
      projectRoot
      && (planId || !resolved.code.trim() || baseRef || headRef || diffModeText !== "auto")
    );
    const evidenceBundle = await collectCodeReviewEvidence({
      projectRoot,
      planId: planId || undefined,
      collectDiff,
      diffMode,
      baseRef: baseRef || undefined,
      headRef: headRef || undefined,
      maxDiffChars,
    });
    const gitDiffCode = evidenceBundle.diffEvidence?.available
      ? evidenceBundle.diffEvidence.diff
      : "";
    const reviewCode = resolved.code.trim() || gitDiffCode;
    const reviewSource = resolved.code.trim()
      ? resolved.file ? "file" : "inline"
      : gitDiffCode ? "git-diff" : "none";
    const hasCode = Boolean(reviewCode.trim());
    const promptCode = hasCode ? trimReviewCodeForPrompt(reviewCode) : "";
    const consistencySection = renderConsistencyEvidence(evidenceBundle);

    const header = renderGuidanceHeader({
      tool: "code_review",
      goal: "由 Agent 根据下方代码与审查清单完成审查，并输出结构化问题清单。",
      tasks: [
        "先阅读本次注入的 reviewInput.code、真实 Git diff 和 Plan 证据（存在时）",
        "先处理 deterministic consistency findings，再进行代码语义审查",
        "按审查清单逐项检查，不要只复述清单",
        "在回复中输出 issues JSON（severity/category/message/suggestion）",
      ],
      outputs: ["审查报告（问题清单、优点、建议）— 由 Agent 生成，非 MCP 静态扫描"],
      notes: [
        "本工具为指南型（guidance-only），不在服务端做静态规则扫描",
        hasCode ? `已注入待审内容（来源=${reviewSource}，${reviewCode.split("\n").length} 行）` : "未收到 code/file_path，也未取得可审查 Git diff",
        planId ? `Plan 对照：${planId}` : "未指定 Plan，仅执行代码/Diff 审查",
      ],
    });

    const message = `${header}请对以下代码进行全面审查：

📝 **待审内容**${resolved.file ? `（来源: ${resolved.file}）` : reviewSource === "git-diff" ? "（来源: 真实 Git diff）" : ""}：
${hasCode ? `\`\`\`\n${promptCode}\n\`\`\`` : "_未提供 code / file_path，请 Agent 先读取目标文件或让用户补充后再审查_"}

🎯 **审查重点**：${focus}

${consistencySection}

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

### 5️⃣ 交付一致性检查

- [ ] 真实 changed files 是否落在 Plan declaredScope 内
- [ ] Plan 声明产物是否真实存在，路径是否一致
- [ ] 公共接口、Schema、迁移、协议和发布配置变化是否有兼容、迁移和回滚说明
- [ ] 实现变化是否有真实测试命令、退出码和回归证据
- [ ] Plan 的 lastVerifiedRevision 是否仍对应当前 HEAD
- [ ] 使用 ArchitectureCandidate 或触及公共契约时是否完成 architecture validate/drift

### 6️⃣ 最佳实践检查

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
      "category": "quality|security|performance|style|scope|contract|test|architecture",
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

- MCP 会确定性收集 Git/Plan 证据并生成 consistency findings；这不等于静态代码扫描
- 代码语义 issues 仍由 Agent 基于真实代码/Diff 审查后生成
- 不要声称「工具已扫描完成」；应区分确定性一致性发现与 Agent 代码判断

现在请开始审查并输出问题清单。`;

    const structured: GuidanceResult & {
      reviewInput: Record<string, unknown>;
      diffEvidence?: Record<string, unknown>;
      planContext?: Record<string, unknown>;
      consistency?: Record<string, unknown>;
      evidenceWarnings?: string[];
    } = {
      mode: "guidance",
      summary: `代码审查指南：${focus}`,
      input: {
        focus,
        file: resolved.file ?? null,
        source: reviewSource,
        planId: planId || null,
        diffMode: collectDiff ? diffMode : null,
        lineCount: hasCode ? reviewCode.split("\n").length : 0,
      },
      reviewInput: {
        received: hasCode,
        focus,
        source: reviewSource,
        file: resolved.file ?? null,
        lineCount: hasCode ? reviewCode.split("\n").length : 0,
        code: hasCode ? reviewCode : null,
        truncatedInPrompt: hasCode && reviewCode.length !== promptCode.length,
      },
      instructions: [
        "完整阅读 reviewInput.code、diffEvidence 和 planContext，不要只机械勾选清单",
        "逐项核验 consistency.findings；可反驳，但必须提供当前仓库证据",
        "检查代码质量、SOLID、常见安全漏洞、性能风险和项目规范",
        "每个问题必须有代码证据、严重级别、类别、位置和可执行修复建议",
        "同时记录做得好的地方；没有证据的问题不要报告",
      ],
      outputContract: {
        summary: "string",
        overallScore: "number 0-100",
        issues: [{
          severity: "critical|high|medium|low",
          category: "quality|security|performance|style|scope|contract|test|architecture",
          file: "string|null",
          line: "number|null",
          code: "string|null",
          message: "string",
          suggestion: "string",
        }],
        strengths: ["string"],
      },
      boundaries: [
        "该工具确定性收集 Git/Plan 证据并比较范围、产物、测试、契约、架构和 revision，但不声称已运行静态代码扫描器",
        "最终 issues 必须由 Agent 基于实际代码分析生成",
      ],
      nextSteps: ["Agent 按 instructions 审查代码并输出符合 outputContract 的报告"],
      ...(evidenceBundle.diffEvidence
        ? { diffEvidence: evidenceBundle.diffEvidence as unknown as Record<string, unknown> }
        : {}),
      ...(evidenceBundle.planContext ? { planContext: evidenceBundle.planContext } : {}),
      ...(evidenceBundle.consistency
        ? { consistency: evidenceBundle.consistency as unknown as Record<string, unknown> }
        : {}),
      ...(evidenceBundle.warnings.length > 0 ? { evidenceWarnings: evidenceBundle.warnings } : {}),
    };

    return okStructured(message, structured, {
      schema: (await import("../schemas/output/guidance-tools.js")).GuidanceResultSchema,
      note: "证据增强的指导型工具：MCP 收集真实 Git/Plan 一致性证据；代码语义 issues 仍由 Agent 基于实际代码生成",
    });
  } catch (error) {
    return handleToolError(error, "code_review");
  }
}
