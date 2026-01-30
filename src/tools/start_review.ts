import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import type { ReviewWorkflowReport } from "../schemas/output/workflow-tools.js";

/**
 * start_review 智能编排工具
 * 
 * 场景：代码体检
 * 编排：[检查上下文] → code_review → security_scan → perf
 */
export async function startReview(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      language?: string;
    }>(args, {
      defaultValues: {
        code: "",
        language: "auto",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        language: ["lang", "语言", "编程语言"],
      },
    });

    const code = getString(parsedArgs.code);
    const language = getString(parsedArgs.language) || "auto";

    if (!code) {
      throw new Error("缺少必填参数: code（需要审查的代码）");
    }

    const header = renderOrchestrationHeader({
      tool: 'start_review',
      goal: '输出代码体检综合报告',
      tasks: [
        '按 delegated plan 顺序调用工具',
        '汇总质量/安全/性能结果并给出优先级',
      ],
    });

    const message = header + `# 🔍 代码体检编排

对以下代码进行全面体检：

\`\`\`${language}
${code}
\`\`\`

---

## 📋 执行步骤

### 步骤 1: 代码质量审查
调用 \`code_review\` 工具，审查代码可读性、命名规范、代码结构、最佳实践和潜在 Bug。

### 步骤 2: 安全漏洞扫描
调用 \`security_scan\` 工具，扫描注入漏洞、认证授权问题、加密安全和敏感数据泄露。

### 步骤 3: 性能分析
调用 \`perf\` 工具，分析算法复杂度、内存使用、数据库查询和渲染性能。

---

## 📊 综合报告

完成后，生成包含以下内容的综合报告：
- 总体评分（代码质量、安全性、性能）
- 严重问题清单（需立即修复）
- 一般问题清单（建议修复）
- 优化建议
- 修复优先级

    **重要**: 请使用结构化输出格式返回结果。`;

    const plan = {
      mode: 'delegated',
      steps: [
        {
          id: 'code-review',
          tool: 'code_review',
          args: { code, focus: 'all' },
          outputs: [],
        },
        {
          id: 'security-scan',
          tool: 'security_scan',
          args: { code, language, scan_type: 'all' },
          outputs: [],
        },
        {
          id: 'perf',
          tool: 'perf',
          args: { code, type: 'all' },
          outputs: [],
        },
      ],
    };

    // 创建结构化数据对象
    const structuredData: ReviewWorkflowReport = {
      summary: "代码体检编排",
      status: "pending",
      steps: [
        {
          name: "code_review",
          description: "代码质量审查",
          status: "pending",
        },
        {
          name: "security_scan",
          description: "安全漏洞扫描",
          status: "pending",
        },
        {
          name: "perf",
          description: "性能分析",
          status: "pending",
        },
      ],
      reviewResults: {},
      overallScore: 0, // AI 将填充实际评分
      metadata: {
        plan,
      },
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/workflow-tools.js")).ReviewWorkflowSchema,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    const errorData: ReviewWorkflowReport = {
      summary: "代码体检失败",
      status: "failed",
      steps: [],
      reviewResults: {},
      overallScore: 0,
      warnings: [errorMsg],
    };
    
    return okStructured(`❌ 编排执行失败: ${errorMsg}`, errorData, {
      schema: (await import("../schemas/output/workflow-tools.js")).ReviewWorkflowSchema,
    });
  }
}
