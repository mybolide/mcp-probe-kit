/**
 * fix_bug 工具 — SRC-8 delegated plan + 真因工作表
 */

import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { handleToolError } from "../utils/error-handler.js";
import { resolveGuidanceCode, trimCodeForPrompt } from "../lib/code-review-input.js";
import { resolveWorkspaceRoot } from "../lib/workspace-root.js";
import {
  ATTRIBUTION_LAYERS,
  SRC8_METHODOLOGY,
  ROOT_CAUSE_WORKSHEET_GATES,
  buildRootCauseWorksheet,
  buildSrc8Checklist,
  buildSrc8DelegatedPlan,
  buildSrc8EvidenceFromInput,
  renderFixBugAgentPromptBody,
  resolveAnalysisMode,
} from "../lib/src8-guidance.js";

function extractFilePaths(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[A-Za-z]:[\\/][^:\n\r\t]+|(?:src|app|lib|server|client|docs)[\\/][^:\n\r\t)]+/g) || [];
  return Array.from(new Set(matches.map((item) => item.replace(/\\/g, "/")))).slice(0, 8);
}

function summarizePhenomenon(errorMessage: string, expectedBehavior: string, actualBehavior: string): string {
  if (expectedBehavior || actualBehavior) {
    return `实际表现为「${actualBehavior || errorMessage}」，但期望是「${expectedBehavior || "保持正常行为"}」。`;
  }
  return `当前可见现象是「${errorMessage}」，需要先区分它属于失败、停滞、未生效还是性能退化。`;
}

export async function fixBug(args: any) {
  try {
    const parsedArgs = parseArgs<{
      error_message?: string;
      description?: string;
      stack_trace?: string;
      code_context?: string;
      file_path?: string;
      project_root?: string;
      analysis_mode?: string;
      steps_to_reproduce?: string;
      expected_behavior?: string;
      actual_behavior?: string;
      success_sample?: string;
      verification_target?: string;
    }>(args, {
      defaultValues: {
        error_message: "",
        stack_trace: "",
        code_context: "",
        file_path: "",
        project_root: "",
        analysis_mode: SRC8_METHODOLOGY,
        steps_to_reproduce: "",
        expected_behavior: "",
        actual_behavior: "",
        success_sample: "",
        verification_target: "",
      },
      primaryField: "error_message",
      fieldAliases: {
        error_message: ["error", "err", "message", "错误", "错误信息", "description", "desc", "summary", "问题", "bug", "issue"],
        stack_trace: ["stack", "trace", "堆栈", "调用栈"],
        code_context: ["code_context", "code", "context", "相关代码", "代码上下文"],
        file_path: ["filePath", "filepath", "path", "文件路径"],
        project_root: ["projectRoot", "project_path", "dir", "directory", "项目路径"],
        analysis_mode: ["analysis_mode", "methodology", "tbp", "src8", "rca", "分析方法"],
        steps_to_reproduce: ["steps", "reproduce", "步骤", "复现步骤"],
        expected_behavior: ["expected", "期望", "期望行为"],
        actual_behavior: ["actual", "实际", "实际行为"],
        success_sample: ["success", "working_case", "正常样本", "成功样本", "对比样本"],
        verification_target: ["target", "acceptance", "验收标准", "验证目标", "done_criteria"],
      },
    });

    const errorMessage = getString(parsedArgs.error_message) || getString(parsedArgs.description);
    const stackTrace = getString(parsedArgs.stack_trace);
    const inlineCodeContext = getString(parsedArgs.code_context);
    const filePath = getString(parsedArgs.file_path);
    const projectRoot = getString(parsedArgs.project_root);
    const analysisMode = resolveAnalysisMode(getString(parsedArgs.analysis_mode));
    const stepsToReproduce = getString(parsedArgs.steps_to_reproduce);
    const expectedBehavior = getString(parsedArgs.expected_behavior);
    const actualBehavior = getString(parsedArgs.actual_behavior);
    const successSample = getString(parsedArgs.success_sample);
    const verificationTarget = getString(parsedArgs.verification_target);

    if (!errorMessage) {
      throw new Error("缺少必填参数: error_message（错误信息）");
    }

    const resolvedProjectRoot = projectRoot ? resolveWorkspaceRoot(projectRoot) : undefined;

    const resolvedCode = resolveGuidanceCode({
      code: inlineCodeContext,
      filePath: filePath || undefined,
      projectRoot: resolvedProjectRoot,
    });

    const hasSuccessSample = Boolean(successSample.trim());
    const rootCauseWorksheet = buildRootCauseWorksheet({ hasComparisonSample: hasSuccessSample });

    const plan = buildSrc8DelegatedPlan({
      error_message: errorMessage,
      stack_trace: stackTrace || undefined,
      analysis_mode: analysisMode,
      code_context: resolvedCode.code || inlineCodeContext || undefined,
      project_root: resolvedProjectRoot,
      file_path: filePath || resolvedCode.file || undefined,
    });

    if (resolvedCode.error) {
      return okStructured(
        `❌ fix_bug 无法读取代码上下文: ${resolvedCode.error}`,
        {
          mode: "delegated",
          methodology: analysisMode,
          src8Checklist: buildSrc8Checklist(),
          rootCauseWorksheet,
          metadata: { plan },
          bugfixInput: {
            received: false,
            error: resolvedCode.error,
            error_message: errorMessage,
            file: filePath || null,
            analysis_mode: analysisMode,
          },
        },
        {
          note: "请修正 file_path/project_root 后重试；执行顺序见 metadata.plan",
        }
      );
    }

    const codeContext = resolvedCode.code;
    const hasCodeContext = Boolean(codeContext.trim());
    const promptCodeContext = hasCodeContext ? trimCodeForPrompt(codeContext, 24000, "bugfixInput") : "";

    const stackTraceSection = stackTrace
      ? `**堆栈跟踪**:\n\`\`\`\n${stackTrace}\n\`\`\``
      : "**堆栈跟踪**: 未提供（建议提供以便更准确定位）";

    const reproduceSection = stepsToReproduce ? `**复现步骤**:\n${stepsToReproduce}` : "";

    const behaviorSection = [expectedBehavior ? `**期望行为**: ${expectedBehavior}` : "", actualBehavior ? `**实际行为**: ${actualBehavior}` : ""]
      .filter(Boolean)
      .join("\n\n");

    const comparisonSection = hasSuccessSample
      ? `**成功样本（SRC-4c 对比分叉）**:\n${successSample}`
      : "**成功样本**: 未提供（SRC-4c 须在 rootCauseAnalysis.evidenceGaps 说明缺口）";

    const verificationTargetSection = verificationTarget
      ? `**验收契约（SRC-3）**:\n${verificationTarget}`
      : "**验收契约**: 未提供（SRC-3 须设定 SMART 标准，如 failing test 变绿）";

    const codeContextSection = hasCodeContext
      ? `**代码/图谱上下文**${resolvedCode.file ? `（来源: ${resolvedCode.file}）` : ""}:\n\`\`\`\n${promptCodeContext}\n\`\`\``
      : "";

    const header = renderOrchestrationHeader({
      tool: "fix_bug",
      goal: `SRC-8 修复 Bug：${errorMessage.substring(0, 120)}${errorMessage.length > 120 ? "..." : ""}`,
      tasks: [
        "严格按 structuredContent.metadata.plan.steps 顺序执行（禁止从 src8-4 跳起）",
        "src8-4 闭合 rootCauseWorksheet 并输出 rootCauseAnalysis 后才可进入 src8-5/6",
        "src8-6 前满足复现门禁；src8-8 用 memorize_asset 沉淀",
      ],
      notes: [
        "MCP 为 guidance-only，不自动修 Bug",
        hasCodeContext ? `已注入代码上下文（${codeContext.split("\n").length} 行）` : "建议补充 code_context 或 file_path + project_root",
      ],
    });

    const guide = `${header}${renderFixBugAgentPromptBody({
      error_message: errorMessage,
      stack_trace_section: stackTraceSection,
      reproduce_section: reproduceSection,
      behavior_section: behaviorSection,
      comparison_section: comparisonSection,
      verification_target_section: verificationTargetSection,
      code_context_section: codeContextSection,
      plan,
    })}`;

    const evidence = buildSrc8EvidenceFromInput({
      error_message: errorMessage,
      stack_trace: stackTrace || undefined,
      code_context: codeContext || undefined,
      steps_to_reproduce: stepsToReproduce || undefined,
      expected_behavior: expectedBehavior || undefined,
      actual_behavior: actualBehavior || undefined,
      success_sample: successSample || undefined,
      verification_target: verificationTarget || undefined,
    });

    const affectedFiles = [...extractFilePaths(stackTrace), ...extractFilePaths(codeContext)]
      .filter((value, index, array) => array.indexOf(value) === index);

    return okStructured(
      guide,
      {
        mode: "delegated",
        methodology: analysisMode,
        src8Checklist: buildSrc8Checklist(),
        attributionLayers: ATTRIBUTION_LAYERS,
        rootCauseWorksheet,
        agentMustProduce: "BugAnalysis",
        src8Gate: {
          blockCodeChangeUntilStep: 4,
          blockCountermeasuresUntilRootCauseWorksheetClosed: true,
          implementAtStep: 6,
          rootCauseWorksheetGates: ROOT_CAUSE_WORKSHEET_GATES,
          requireReproductionBeforeImplement: true,
          escalateAfterFailedFixAttempts: 3,
        },
        metadata: { plan },
        bugfixInput: {
          received: true,
          error_message: errorMessage,
          stack_trace: stackTrace || null,
          code_context: hasCodeContext ? codeContext : null,
          file: resolvedCode.file ?? (filePath || null),
          lineCount: hasCodeContext ? codeContext.split("\n").length : 0,
          truncatedInPrompt: hasCodeContext && codeContext.length !== promptCodeContext.length,
          steps_to_reproduce: stepsToReproduce || null,
          expected_behavior: expectedBehavior || null,
          actual_behavior: actualBehavior || null,
          success_sample: successSample || null,
          verification_target: verificationTarget || null,
          hasComparisonSample: hasSuccessSample,
          hasVerificationTarget: Boolean(verificationTarget.trim()),
          analysis_mode: analysisMode,
          affectedFiles,
          evidence,
          phenomenon: summarizePhenomenon(errorMessage, expectedBehavior, actualBehavior),
        },
      },
      {
        schema: (await import("../schemas/output/core-tools.js")).BugAnalysisSchema,
        note: "按 metadata.plan 执行 SRC-8；src8-4 闭合前禁止改代码",
      }
    );
  } catch (error) {
    return handleToolError(error, "fix_bug");
  }
}
