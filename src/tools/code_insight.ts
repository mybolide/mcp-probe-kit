import { parseArgs, getString, getNumber, getBoolean } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import {
  runCodeInsightBridge,
  type CodeInsightDirection,
  type CodeInsightMode,
} from "../lib/gitnexus-bridge.js";
import {
  throwIfAborted,
  type ToolExecutionContext,
} from "../lib/tool-execution-context.js";

const ALLOWED_MODES = new Set<CodeInsightMode>(["auto", "query", "context", "impact"]);
const ALLOWED_DIRECTIONS = new Set<CodeInsightDirection>(["upstream", "downstream"]);

function normalizeMode(value: string): CodeInsightMode {
  const mode = (value || "auto").trim().toLowerCase() as CodeInsightMode;
  if (!ALLOWED_MODES.has(mode)) {
    throw new Error(`不支持的 mode: ${value}（可选: auto/query/context/impact）`);
  }
  return mode;
}

function normalizeDirection(value: string): CodeInsightDirection | undefined {
  if (!value) {
    return undefined;
  }
  const direction = value.trim().toLowerCase() as CodeInsightDirection;
  if (!ALLOWED_DIRECTIONS.has(direction)) {
    throw new Error(`不支持的 direction: ${value}（可选: upstream/downstream）`);
  }
  return direction;
}

function summarizeExecutions(
  executions: Array<{ tool: string; ok: boolean; text?: string; error?: string }>
): string {
  if (executions.length === 0) {
    return "- 未执行图谱调用";
  }

  return executions
    .map((item) => {
      if (item.ok) {
        return `- ✅ ${item.tool}: ${(item.text || "已返回结果").replace(/\s+/g, " ").slice(0, 180)}`;
      }
      return `- ⚠️ ${item.tool}: ${(item.error || "调用失败").replace(/\s+/g, " ").slice(0, 180)}`;
    })
    .join("\n");
}

export async function codeInsight(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, "code_insight 已取消");

    const parsedArgs = parseArgs<{
      mode?: string;
      query?: string;
      target?: string;
      repo?: string;
      goal?: string;
      task_context?: string;
      direction?: string;
      max_depth?: number;
      include_tests?: boolean;
      input?: string;
    }>(args, {
      defaultValues: {
        mode: "auto",
        query: "",
        target: "",
        repo: "",
        goal: "",
        task_context: "",
        direction: "",
        max_depth: 3,
        include_tests: false,
      },
      primaryField: "input",
      fieldAliases: {
        mode: ["m", "模式"],
        query: ["q", "keyword", "关键词"],
        target: ["symbol", "name", "目标符号"],
        repo: ["repository", "仓库"],
        goal: ["目的", "目标"],
        task_context: ["context", "taskContext", "任务上下文"],
        direction: ["dir", "方向"],
        max_depth: ["depth", "maxDepth", "最大深度"],
        include_tests: ["includeTests", "包含测试"],
      },
    });

    const mode = normalizeMode(getString(parsedArgs.mode, "auto"));
    const query = getString(parsedArgs.query);
    const target = getString(parsedArgs.target);
    const repo = getString(parsedArgs.repo);
    const goal = getString(parsedArgs.goal);
    const taskContext = getString(parsedArgs.task_context);
    const direction = normalizeDirection(getString(parsedArgs.direction));
    const maxDepth = Math.max(1, getNumber(parsedArgs.max_depth, 3));
    const includeTests = getBoolean(parsedArgs.include_tests, false);
    const input = getString(parsedArgs.input);

    const finalQuery = query || (mode === "query" ? input : "");
    const finalTarget = target || ((mode === "context" || mode === "impact") ? input : "");

    throwIfAborted(context?.signal, "code_insight 已取消");

    const result = await runCodeInsightBridge({
      mode,
      query: finalQuery,
      target: finalTarget,
      repo: repo || undefined,
      goal: goal || undefined,
      taskContext: taskContext || undefined,
      direction,
      maxDepth,
      includeTests,
      signal: context?.signal,
    });

    const executionSummary = summarizeExecutions(
      result.executions.map((item) => ({
        tool: item.tool,
        ok: item.ok,
        text: item.text,
        error: item.error,
      }))
    );

    const message = `# code_insight 图谱分析结果

状态: ${result.available ? "可用" : "降级"}
模式: ${result.modeRequested} -> ${result.modeResolved}
来源: ${result.provider}

摘要:
${result.summary}

执行详情:
${executionSummary}

${result.warnings.length > 0 ? `警告: ${result.warnings.join(", ")}` : ""}`.trim();

    return okStructured(message, {
      status: result.available ? "ok" : "degraded",
      provider: result.provider,
      mode: {
        requested: result.modeRequested,
        resolved: result.modeResolved,
      },
      summary: result.summary,
      warnings: result.warnings,
      executions: result.executions,
      repo: result.repo || null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ code_insight 执行失败: ${errorMessage}` }],
      isError: true,
    };
  }
}
