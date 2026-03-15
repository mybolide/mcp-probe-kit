import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, getString, getNumber, getBoolean } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import {
  runCodeInsightBridge,
  type CodeInsightAmbiguity,
  type CodeInsightBridgeResult,
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
type CodeInsightStatus = "ok" | "degraded" | "ambiguous" | "not_found";

interface ProjectDocsPlan {
  docsDir: string;
  projectContextFilePath: string;
  latestMarkdownFilePath: string;
  latestJsonFilePath: string;
  archiveMarkdownFilePath: string;
  archiveJsonFilePath: string;
  navigationSnippet: string;
  devGuideSnippet: string;
}

interface DelegatedPlanStep {
  id: string;
  action: string;
  outputs?: string[];
  note?: string;
}

interface DelegatedPlan {
  mode: "delegated";
  kind: "docs" | "ambiguity";
  steps: DelegatedPlanStep[];
}

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
  executions: Array<{ tool: string; ok: boolean; text?: string; error?: string; status?: string }>
): string {
  if (executions.length === 0) {
    return "- 未执行图谱调用";
  }

  return executions
    .map((item) => {
      if (item.ok) {
        const suffix = item.status ? ` [${item.status}]` : "";
        return `- ✅ ${item.tool}${suffix}: ${(item.text || "已返回结果").replace(/\s+/g, " ").slice(0, 180)}`;
      }
      return `- ⚠️ ${item.tool}: ${(item.error || "调用失败").replace(/\s+/g, " ").slice(0, 180)}`;
    })
    .join("\n");
}

export function deriveCodeInsightStatus(result: Pick<CodeInsightBridgeResult, "available" | "ambiguities" | "executions">): CodeInsightStatus {
  if (!result.available) {
    return "degraded";
  }
  if (result.ambiguities.length > 0) {
    return "ambiguous";
  }

  const successfulStatuses = result.executions
    .filter((item) => item.ok)
    .map((item) => item.status)
    .filter((item): item is string => Boolean(item));

  if (successfulStatuses.length > 0 && successfulStatuses.every((item) => item === "not_found")) {
    return "not_found";
  }

  return "ok";
}

function formatStatusLabel(status: CodeInsightStatus): string {
  switch (status) {
    case "ambiguous":
      return "歧义";
    case "degraded":
      return "降级";
    case "not_found":
      return "未找到";
    default:
      return "可用";
  }
}

function formatAmbiguities(ambiguities: CodeInsightAmbiguity[]): string {
  if (ambiguities.length === 0) {
    return "";
  }

  return ambiguities
    .map((ambiguity) => {
      const lines = [`- ${ambiguity.tool}: ${ambiguity.message || "存在多个候选符号"}`];
      for (const candidate of ambiguity.candidates.slice(0, 5)) {
        const parts = [
          typeof candidate.uid === "string" ? `uid=${candidate.uid}` : "",
          typeof candidate.name === "string" ? `name=${candidate.name}` : "",
          typeof candidate.file_path === "string" ? `file_path=${candidate.file_path}` : "",
        ].filter(Boolean);
        lines.push(`  - ${parts.join(" | ") || JSON.stringify(candidate)}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

function createProjectDocsPlan(projectRoot: string, docsDirName: string, docsSnapshot: { markdownFilePath: string; jsonFilePath: string }): ProjectDocsPlan {
  const docsDir = path.dirname(docsSnapshot.markdownFilePath);
  return {
    docsDir,
    projectContextFilePath: toPosixPath(path.join(path.resolve(projectRoot), docsDirName, "project-context.md")),
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
}

export function buildCodeInsightDelegatedPlan(input: {
  status: CodeInsightStatus;
  ambiguities: CodeInsightAmbiguity[];
  projectDocs?: ProjectDocsPlan;
  showPlan: boolean;
}): DelegatedPlan | undefined {
  if (!input.showPlan) {
    return undefined;
  }

  if (input.status === "ambiguous" && input.ambiguities.length > 0) {
    return {
      mode: "delegated",
      kind: "ambiguity",
      steps: [
        {
          id: "consume-candidates",
          action: "消费本次 candidates 列表，确认唯一目标符号（优先 uid，其次 file_path）",
        },
        {
          id: "rerun-with-disambiguate",
          action: "重新调用 code_insight，并传入 uid 或 file_path 后继续 context/impact 分析",
        },
      ],
    };
  }

  if (!input.projectDocs) {
    return undefined;
  }

  const projectContextExists = fs.existsSync(input.projectDocs.projectContextFilePath);
  return {
    mode: "delegated",
    kind: "docs",
    steps: [
      {
        id: "consume-result",
        action: "先消费本次分析结果（processes/symbols/impact），确认是否满足当前问题",
      },
      {
        id: "optional-save",
        action: `如需保存，再写入 ${input.projectDocs.latestMarkdownFilePath}（文本）和 ${input.projectDocs.latestJsonFilePath}（结构化）`,
        outputs: [input.projectDocs.latestMarkdownFilePath, input.projectDocs.latestJsonFilePath],
        note: projectContextExists
          ? `可选同步更新 ${input.projectDocs.projectContextFilePath} 的图谱入口`
          : "若后续要持续沉淀，建议先补 init_project_context",
      },
    ],
  };
}

function renderUsageGuide(): string {
  return `## 使用场景指南
- 探索调用链: \`{ mode: "query", query: "login", goal: "理解登录认证流程" }\`
- 深入函数上下文: \`{ mode: "context", target: "login", file_path: "src/auth/login.ts" }\`
- 评估影响范围: \`{ mode: "impact", target: "login", direction: "upstream", file_path: "..." }\`
- 查看代码内容: \`{ mode: "context", target: "login", include_content: true }\`

## 下一步建议
- 查询不精确: 增加 \`goal\`（例如“理解登录认证流程”）
- 出现歧义: 传入 \`uid\` 或 \`file_path\` 重新执行
- 需要落盘: 传 \`save_to_docs: true\`，再按 delegated plan 写入 docs/graph-insights`;
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
      uid?: string;
      file_path?: string;
      repo?: string;
      project_root?: string;
      docs_dir?: string;
      goal?: string;
      task_context?: string;
      direction?: string;
      max_depth?: number;
      include_tests?: boolean;
      include_content?: boolean;
      save_to_docs?: boolean;
      delegated_plan?: boolean;
      input?: string;
    }>(args, {
      defaultValues: {
        mode: "auto",
        query: "",
        target: "",
        uid: "",
        file_path: "",
        repo: "",
        goal: "",
        task_context: "",
        direction: "",
        max_depth: 3,
        include_tests: false,
        include_content: false,
      },
      primaryField: "input",
      fieldAliases: {
        mode: ["m", "模式"],
        query: ["q", "keyword", "关键词"],
        target: ["symbol", "name", "目标符号"],
        uid: ["symbol_uid", "候选uid"],
        file_path: ["filePath", "filepath", "文件路径"],
        repo: ["repository", "仓库"],
        project_root: ["projectRoot", "project_path", "path", "dir", "directory", "项目路径", "项目根目录"],
        docs_dir: ["docsDir", "docs", "文档目录"],
        goal: ["目的", "目标"],
        task_context: ["context", "taskContext", "任务上下文"],
        direction: ["dir", "方向"],
        max_depth: ["depth", "maxDepth", "最大深度"],
        include_tests: ["includeTests", "包含测试"],
        include_content: ["includeContent", "包含代码"],
        save_to_docs: ["saveToDocs", "保存到文档"],
        delegated_plan: ["delegatedPlan", "生成计划"],
      },
    });

    const mode = normalizeMode(getString(parsedArgs.mode, "auto"));
    const query = getString(parsedArgs.query);
    const target = getString(parsedArgs.target);
    const uid = getString(parsedArgs.uid);
    const filePath = getString(parsedArgs.file_path);
    const repo = getString(parsedArgs.repo);
    const projectRoot = getString(parsedArgs.project_root);
    const docsDirName = getString(parsedArgs.docs_dir) || "docs";
    const goal = getString(parsedArgs.goal);
    const taskContext = getString(parsedArgs.task_context);
    const direction = normalizeDirection(getString(parsedArgs.direction));
    const maxDepth = Math.max(1, getNumber(parsedArgs.max_depth, 3));
    const includeTests = getBoolean(parsedArgs.include_tests, false);
    const includeContent = getBoolean(parsedArgs.include_content, false);
    const saveToDocs = getBoolean(parsedArgs.save_to_docs, Boolean(projectRoot || parsedArgs.docs_dir));
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
      uid: uid || undefined,
      filePath: filePath || undefined,
      repo: repo || undefined,
      projectRoot: projectRoot || undefined,
      goal: goal || undefined,
      taskContext: taskContext || undefined,
      direction,
      maxDepth,
      includeTests,
      includeContent,
      signal: context?.signal,
    });
    const status = deriveCodeInsightStatus(result);
    const showDelegatedPlan = getBoolean(parsedArgs.delegated_plan, saveToDocs || status === "ambiguous");

    const executionSummary = summarizeExecutions(
      result.executions.map((item) => ({
        tool: item.tool,
        ok: item.ok,
        text: item.text,
        error: item.error,
        status: item.status,
      }))
    );

    const ambiguityText = formatAmbiguities(result.ambiguities);

    const message = `# code_insight 图谱分析结果

状态: ${formatStatusLabel(status)}
模式: ${result.modeRequested} -> ${result.modeResolved}
来源: ${result.provider}
启动策略: ${result.launcherStrategy}
工作区: ${result.workspaceMode}
源目录: ${result.sourceRoot}

摘要:
${result.summary}

执行详情:
${executionSummary}

${ambiguityText ? `歧义候选:\n${ambiguityText}\n\n` : ""}\
${result.warnings.length > 0 ? `警告: ${result.warnings.join(", ")}` : ""}`.trim();
    const usageGuide = renderUsageGuide();

    const structured = {
      status,
      provider: result.provider,
      mode: {
        requested: result.modeRequested,
        resolved: result.modeResolved,
      },
      summary: result.summary,
      warnings: result.warnings,
      executions: result.executions,
      repo: result.repo || null,
      launcherStrategy: result.launcherStrategy,
      ambiguities: result.ambiguities,
      workspaceMode: result.workspaceMode,
      sourceRoot: result.sourceRoot,
      analysisRoot: result.analysisRoot,
      pathMapped: result.pathMapped,
    } as Record<string, unknown>;

    const docsProjectRoot = saveToDocs ? (projectRoot || result.sourceRoot) : "";
    const docsSnapshot = buildProjectDocsOutputs({
      projectRoot: docsProjectRoot,
      docsDirName,
      mode,
      structured,
    });

    const projectDocs = docsSnapshot
      ? createProjectDocsPlan(docsProjectRoot, docsDirName, docsSnapshot)
      : undefined;
    if (projectDocs) {
      structured.projectDocs = projectDocs;
    }
    const delegatedPlan = buildCodeInsightDelegatedPlan({
      status,
      ambiguities: result.ambiguities,
      projectDocs,
      showPlan: showDelegatedPlan,
    });
    if (delegatedPlan) {
      structured.plan = delegatedPlan;
    }
    structured.nextAction = delegatedPlan?.kind === "ambiguity"
      ? "请先选择 uid 或 file_path 重新调用 code_insight 完成消歧"
      : projectDocs
        ? `请按 delegated plan 落盘图谱文档，并更新 ${projectDocs.projectContextFilePath} 的索引入口`
        : null;

    return okStructured(
      delegatedPlan
        ? `${renderOrchestrationHeader({
            tool: "code_insight",
            goal: delegatedPlan.kind === "ambiguity"
              ? "先完成符号消歧，再继续图谱分析"
              : "完成图谱分析后，将结果按 delegated plan 落盘到 docs/graph-insights",
            tasks: delegatedPlan.kind === "ambiguity"
              ? [
                  "先阅读本次 code_insight 返回的 candidates",
                  "使用 uid 或 file_path 重新调用 code_insight",
                  "消歧完成后再继续后续分析或文档保存",
                ]
              : [
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
${renderPlanSteps(delegatedPlan.steps)}

${delegatedPlan.kind === "docs" && projectDocs ? `后续操作:
- 如需落盘，写入 ${projectDocs.latestMarkdownFilePath} 与 ${projectDocs.latestJsonFilePath}
- 如需长期沉淀，可再补充 ${projectDocs.projectContextFilePath} 的图谱入口` : `后续操作:
- 请先从 candidates 中选定唯一符号
- 重新传入 uid 或 file_path 后再继续 context / impact 分析`}

${usageGuide}`
        : `${message}

${usageGuide}`,
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
