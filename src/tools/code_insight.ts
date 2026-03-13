import * as path from "node:path";
import { parseArgs, getString, getNumber, getBoolean } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
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
const DEFAULT_AUTO_QUERY = "项目整体架构 核心流程 关键模块 依赖关系 入口点";

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function makeSafeSegment(value: string): string {
  return (value || "code-insight")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "code-insight";
}

function buildProjectDocsOutputs(input: {
  projectRoot?: string;
  docsDirName?: string;
  mode: CodeInsightMode;
  structured: Record<string, unknown>;
}): { markdownFilePath: string; jsonFilePath: string } | null {
  const projectRoot = input.projectRoot?.trim();
  if (!projectRoot) {
    return null;
  }

  const docsRoot = path.join(path.resolve(projectRoot), input.docsDirName || "docs", "graph-insights");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = makeSafeSegment(input.structured.summary as string || input.mode);
  const baseName = `${timestamp}-${input.mode}-${suffix}`;

  return {
    markdownFilePath: toPosixPath(path.join(docsRoot, `${baseName}.md`)),
    jsonFilePath: toPosixPath(path.join(docsRoot, `${baseName}.json`)),
  };
}

function renderPlanSteps(steps: Array<{ id: string; action: string; outputs?: string[]; note?: string }>): string {
  return steps
    .map((step, index) => {
      const lines = [`${index + 1}. ${step.action}`];
      if (step.outputs && step.outputs.length > 0) {
        lines.push(`   输出: ${step.outputs.join(", ")}`);
      }
      if (step.note) {
        lines.push(`   说明: ${step.note}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

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

export function resolveCodeInsightQuery(input: {
  mode: CodeInsightMode;
  query: string;
  target: string;
  input: string;
}): { finalQuery: string; finalTarget: string } {
  const finalTarget =
    input.target || ((input.mode === "context" || input.mode === "impact") ? input.input : "");

  const finalQuery = input.query
    || (input.mode === "query" ? input.input : "")
    || (input.mode === "auto" && !finalTarget ? DEFAULT_AUTO_QUERY : "");

  return { finalQuery, finalTarget };
}

export async function codeInsight(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, "code_insight 已取消");

    const parsedArgs = parseArgs<{
      mode?: string;
      query?: string;
      target?: string;
      repo?: string;
      project_root?: string;
      docs_dir?: string;
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
        project_root: ["projectRoot", "project_path", "path", "dir", "directory", "项目路径", "项目根目录"],
        docs_dir: ["docsDir", "docs", "文档目录"],
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
    const projectRoot = getString(parsedArgs.project_root);
    const docsDirName = getString(parsedArgs.docs_dir) || "docs";
    const goal = getString(parsedArgs.goal);
    const taskContext = getString(parsedArgs.task_context);
    const direction = normalizeDirection(getString(parsedArgs.direction));
    const maxDepth = Math.max(1, getNumber(parsedArgs.max_depth, 3));
    const includeTests = getBoolean(parsedArgs.include_tests, false);
    const input = getString(parsedArgs.input);

    const { finalQuery, finalTarget } = resolveCodeInsightQuery({
      mode,
      query,
      target,
      input,
    });

    throwIfAborted(context?.signal, "code_insight 已取消");

    const result = await runCodeInsightBridge({
      mode,
      query: finalQuery,
      target: finalTarget,
      repo: repo || undefined,
      projectRoot: projectRoot || undefined,
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
工作区: ${result.workspaceMode}
源目录: ${result.sourceRoot}

摘要:
${result.summary}

执行详情:
${executionSummary}

${result.warnings.length > 0 ? `警告: ${result.warnings.join(", ")}` : ""}`.trim();

    const structured = {
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
      workspaceMode: result.workspaceMode,
      sourceRoot: result.sourceRoot,
      analysisRoot: result.analysisRoot,
      pathMapped: result.pathMapped,
    } as Record<string, unknown>;

    const docsSnapshot = buildProjectDocsOutputs({
      projectRoot: projectRoot || result.sourceRoot,
      docsDirName,
      mode,
      structured,
    });

    let projectDocs:
      | {
          docsDir: string;
          projectContextFilePath: string;
          latestMarkdownFilePath: string;
          latestJsonFilePath: string;
          archiveMarkdownFilePath: string;
          archiveJsonFilePath: string;
          navigationSnippet: string;
          devGuideSnippet: string;
        }
      | undefined;
    let persistencePlan:
      | {
          mode: "delegated";
          steps: Array<{
            id: string;
            action: string;
            outputs?: string[];
            note?: string;
          }>;
        }
      | undefined;

    if (docsSnapshot) {
      const docsDir = path.dirname(docsSnapshot.markdownFilePath);
      projectDocs = {
        docsDir,
        projectContextFilePath: toPosixPath(path.join(path.resolve(projectRoot || result.sourceRoot), docsDirName, "project-context.md")),
        latestMarkdownFilePath: toPosixPath(path.join(docsDir, "latest.md")),
        latestJsonFilePath: toPosixPath(path.join(docsDir, "latest.json")),
        archiveMarkdownFilePath: docsSnapshot.markdownFilePath,
        archiveJsonFilePath: docsSnapshot.jsonFilePath,
        navigationSnippet: `### [代码图谱洞察](./graph-insights/latest.md)
最近一次 code_insight 分析结果，包含调用链、上下文与影响面摘要
`,
        devGuideSnippet: `- **代码图谱洞察**: [graph-insights/latest.md](./graph-insights/latest.md) - 需要理解模块依赖、调用链和影响面时优先查看
`,
      };
      structured.projectDocs = projectDocs;
      structured.nextAction = `请按 delegated plan 落盘图谱文档，并更新 ${projectDocs.projectContextFilePath} 的索引入口`;
      persistencePlan = {
        mode: "delegated",
        steps: [
          {
            id: "ensure-project-context",
            action: `检查 ${projectDocs.projectContextFilePath} 是否存在；若不存在，先调用 init_project_context 生成项目上下文索引`,
            outputs: [projectDocs.projectContextFilePath],
            note: "只有 project-context.md 存在，后续图谱文档入口才可持续复用",
          },
          {
            id: "save-latest-md",
            action: `将本次 code_insight 的文本分析结果写入 ${projectDocs.latestMarkdownFilePath}`,
            outputs: [projectDocs.latestMarkdownFilePath],
          },
          {
            id: "save-archive-md",
            action: `将本次 code_insight 的文本分析结果归档到 ${projectDocs.archiveMarkdownFilePath}`,
            outputs: [projectDocs.archiveMarkdownFilePath],
          },
          {
            id: "save-latest-json",
            action: `将本次 code_insight 的 structuredContent 写入 ${projectDocs.latestJsonFilePath}`,
            outputs: [projectDocs.latestJsonFilePath],
            note: "建议保留完整结构化结果，便于后续 AI 继续读取",
          },
          {
            id: "save-archive-json",
            action: `将本次 code_insight 的 structuredContent 归档到 ${projectDocs.archiveJsonFilePath}`,
            outputs: [projectDocs.archiveJsonFilePath],
          },
          {
            id: "update-project-context-index",
            action: `更新 ${projectDocs.projectContextFilePath}，在“## 📚 文档导航”加入图谱文档入口，并在“## 💡 开发时查看对应文档”加入代码图谱洞察链接`,
            outputs: [projectDocs.projectContextFilePath],
            note: `建议插入内容:\n${projectDocs.navigationSnippet}\n${projectDocs.devGuideSnippet}`,
          },
        ],
      };
      structured.plan = persistencePlan;
    }

    return okStructured(
      projectDocs && persistencePlan
        ? `${renderOrchestrationHeader({
            tool: "code_insight",
            goal: "完成图谱分析后，将结果按 delegated plan 落盘到 docs/graph-insights",
            tasks: [
              "先消费本次 code_insight 返回的分析结果",
              "严格按 delegated plan 将 Markdown / JSON 保存到指定路径",
              "不要只口头总结而不写文件",
            ],
            notes: [
              `工作区模式: ${result.workspaceMode}`,
              `来源目录: ${result.sourceRoot}`,
            ],
          })}${message}

## delegated plan
${renderPlanSteps(persistencePlan.steps)}

后续操作:
- 请先确保 ${projectDocs.projectContextFilePath} 可用，并把图谱入口挂到该索引中
- 请将本次分析保存到 ${projectDocs.latestMarkdownFilePath}
- 如需归档，请额外保存到 ${projectDocs.archiveMarkdownFilePath}
- 如需结构化副本，请保存 JSON 到 ${projectDocs.latestJsonFilePath} 或 ${projectDocs.archiveJsonFilePath}`
        : message,
      structured
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ code_insight 执行失败: ${errorMessage}` }],
      isError: true,
    };
  }
}
