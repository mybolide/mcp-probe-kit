import { parseArgs, getBoolean, getString } from '../utils/parseArgs.js';
import { okStructured, type ToolResponse } from '../lib/response.js';
import { handleToolError } from '../utils/error-handler.js';
import {
  buildArchitectureMethod,
  normalizeArchitectureMode,
  type ArchitectureFact,
  type ArchitectureMethodInput,
} from '../lib/architecture-method.js';
import { codeInsight } from './code_insight.js';
import {
  loadMemoryInjectionContext,
  type MemoryInjectionContext,
} from '../lib/memory-orchestration.js';
import {
  buildProjectRootRetryHint,
  isLikelyProjectNamedRelativePath,
  resolveWorkspaceRoot,
} from '../lib/workspace-root.js';
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from '../lib/tool-execution-context.js';
import { ArchitectureResultSchema } from '../schemas/output/architecture-tools.js';

interface ArchitectureArgs {
  mode?: string;
  description?: string;
  project_root?: string;
  scope?: unknown;
  constraints?: unknown;
  non_goals?: unknown;
  baseline?: unknown;
  current_facts?: unknown;
  structural_causes?: unknown;
  protected_invariants?: unknown;
  alternatives?: unknown;
  decision?: unknown;
  target_architecture?: unknown;
  transition_plan?: unknown;
  diff?: string;
  runtime_evidence?: unknown;
  observed_drift?: unknown;
  save_to_docs?: boolean;
  collect_evidence?: boolean;
}

export async function architecture(
  args: unknown,
  context?: ToolExecutionContext,
): Promise<ToolResponse> {
  try {
    throwIfAborted(context?.signal, 'architecture 已取消');
    await reportToolProgress(context, 5, 'architecture: 解析 ARC-8 输入');

    const parsed = parseArgs<ArchitectureArgs>(args, {
      defaultValues: {
        mode: 'assess',
        description: '',
        project_root: '',
        save_to_docs: false,
        collect_evidence: true,
      },
      primaryField: 'description',
      fieldAliases: {
        description: ['goal', 'objective', 'task', '需求', '目标'],
        project_root: ['projectRoot', 'project_path', 'projectPath', 'root', '项目路径', '项目根目录'],
        non_goals: ['nonGoals', '不做'],
        current_facts: ['currentFacts', 'facts'],
        structural_causes: ['structuralCauses', 'causes'],
        protected_invariants: ['protectedInvariants', 'invariants'],
        target_architecture: ['targetArchitecture', 'target'],
        transition_plan: ['transitionPlan', 'migration_plan'],
        runtime_evidence: ['runtimeEvidence', 'evidence'],
        observed_drift: ['observedDrift', 'drift_findings'],
        save_to_docs: ['saveToDocs'],
        collect_evidence: ['collectEvidence'],
      },
    });

    const description = getString(parsed.description).trim();
    if (!description) throw new Error('architecture 缺少完整 description');
    const mode = normalizeArchitectureMode(parsed.mode);
    const explicitProjectRoot = getString(parsed.project_root).trim();
    if (isLikelyProjectNamedRelativePath(explicitProjectRoot)) {
      return {
        content: [{
          type: 'text' as const,
          text: `拒绝执行架构分析：project_root 可能是带项目名的半相对路径（${explicitProjectRoot}）。请传目标项目根目录绝对路径。`,
        }],
        isError: true,
        structuredContent: {
          error_code: 'INVALID_PROJECT_ROOT',
          rejected_project_root: explicitProjectRoot,
          retry_hint: buildProjectRootRetryHint(explicitProjectRoot),
        },
      };
    }
    const projectRoot = resolveWorkspaceRoot(explicitProjectRoot);
    const collectEvidence = getBoolean(parsed.collect_evidence, true);

    await reportToolProgress(context, 20, 'architecture: 收集项目与历史证据');
    const suppliedFacts = normalizeFacts(parsed.current_facts);
    const [insightContext, memoryContext] = await Promise.all([
      collectEvidence && suppliedFacts.length === 0
        ? collectArchitectureInsight(description, projectRoot, context)
        : Promise.resolve({ facts: [] as ArchitectureFact[], status: 'skipped', warnings: [] as string[] }),
      collectEvidence
        ? loadMemoryInjectionContext(description, 'default')
        : Promise.resolve<MemoryInjectionContext>({
            enabled: false,
            available: false,
            degraded: false,
            query: description,
            results: [],
            assetsById: {},
            error: undefined,
          }),
    ]);

    throwIfAborted(context?.signal, 'architecture 已取消');
    await reportToolProgress(context, 55, `architecture: 执行 ${mode} / ARC-8 门禁`);

    const methodInput: ArchitectureMethodInput = {
      mode,
      description,
      scope: stringArray(parsed.scope),
      constraints: stringArray(parsed.constraints),
      nonGoals: stringArray(parsed.non_goals),
      baseline: normalizeObjectOrString(parsed.baseline),
      currentFacts: suppliedFacts.length > 0 ? suppliedFacts : insightContext.facts,
      structuralCauses: stringArray(parsed.structural_causes),
      protectedInvariants: stringArray(parsed.protected_invariants),
      alternatives: objectArray(parsed.alternatives) as ArchitectureMethodInput['alternatives'],
      decision: objectValue(parsed.decision) as ArchitectureMethodInput['decision'],
      targetArchitecture: objectValue(parsed.target_architecture) as ArchitectureMethodInput['targetArchitecture'],
      transitionPlan: objectValue(parsed.transition_plan) as ArchitectureMethodInput['transitionPlan'],
      diff: getString(parsed.diff),
      runtimeEvidence: stringArray(parsed.runtime_evidence),
      observedDrift: stringArray(parsed.observed_drift),
    };
    const result = buildArchitectureMethod(methodInput);
    const saveToDocs = getBoolean(parsed.save_to_docs, false);
    const documentPlan = saveToDocs ? buildArchitectureDocumentPlan(description, mode, projectRoot, result) : null;
    const memoryHits = memoryContext.results.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      summary: item.summary,
      score: item.score,
      applicability: item.applicability,
    }));
    const warnings = [
      ...result.warnings,
      ...insightContext.warnings,
      ...(memoryContext.degraded && memoryContext.error
        ? [`Memory 召回降级：${memoryContext.error}`]
        : []),
    ];
    const structured = {
      ...result,
      warnings,
      metadata: {
        projectRoot,
        evidenceCollection: collectEvidence,
        graphStatus: insightContext.status,
        memoryContext: {
          enabled: memoryContext.enabled,
          available: memoryContext.available,
          degraded: memoryContext.degraded,
          hits: memoryHits,
        },
        documentPlan,
      },
    };

    await reportToolProgress(context, 95, 'architecture: 生成结构化 ARC-8 结果');
    return okStructured(renderArchitectureResult(structured), structured, {
      schema: ArchitectureResultSchema,
      note: 'architecture 负责 ARC-8 方法、门禁和证据结构；Agent 负责架构判断、代码实施和真实验证。',
    });
  } catch (error) {
    return handleToolError(error, 'architecture') as ToolResponse;
  }
}

async function collectArchitectureInsight(
  description: string,
  projectRoot: string,
  context?: ToolExecutionContext,
): Promise<{ facts: ArchitectureFact[]; status: string; warnings: string[] }> {
  const response = await codeInsight({
    mode: 'auto',
    query: description,
    goal: '为 ARC-8 架构分析建立当前代码与影响面证据',
    task_context: description,
    project_root: projectRoot,
  }, context);
  const structured = response.structuredContent as Record<string, unknown> | undefined;
  if (!structured || response.isError) {
    return {
      facts: [],
      status: response.isError ? 'unavailable' : 'degraded',
      warnings: ['code_insight 未返回可用结构化证据；ARC-2 需要 Agent 补充当前架构事实'],
    };
  }

  const status = String(structured.status ?? 'degraded');
  const summary = getString(structured.summary).trim();
  const facts: ArchitectureFact[] = [];
  if (summary) {
    facts.push({
      statement: summary,
      classification: status === 'ok' ? 'fact' : 'inference',
      evidence: [`code_insight status=${status}`],
    });
  }
  const localFallback = objectValue(structured.localFallback);
  const files = Array.isArray(localFallback.files)
    ? localFallback.files
        .map((item) => objectValue(item))
        .map((item) => getString(item.path).trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  if (files.length > 0) {
    facts.push({
      statement: `code_insight 识别到 ${files.length} 个与架构目标相关的文件`,
      classification: 'fact',
      evidence: files,
    });
  }
  return {
    facts,
    status,
    warnings: stringArray(structured.warnings),
  };
}

function buildArchitectureDocumentPlan(
  description: string,
  mode: string,
  projectRoot: string,
  result: ReturnType<typeof buildArchitectureMethod>,
) {
  const slug = makeSlug(description);
  return {
    mode: 'delegated',
    projectRoot,
    steps: [
      {
        id: 'write-architecture-result',
        type: 'agent_action',
        action: 'write_architecture_document',
        requiredInputs: ['structuredContent', '真实项目证据'],
        expectedOutputs: [`docs/architecture/${slug}-${mode}.md`],
        outputs: [`docs/architecture/${slug}-${mode}.md`],
        note: '由 Agent 使用宿主文件能力落盘；MCP 不直接重写项目架构文档',
      },
      ...(result.decision.recommended
        ? [{
            id: 'write-adr-candidate',
            type: 'agent_action',
            action: 'write_adr_candidate',
            dependsOn: ['write-architecture-result'],
            requiredInputs: ['adrCandidate'],
            expectedOutputs: [`docs/adr/${slug}.md`],
            outputs: [`docs/adr/${slug}.md`],
          }]
        : []),
    ],
  };
}

function renderArchitectureResult(result: ReturnType<typeof buildArchitectureMethod> & {
  metadata: Record<string, unknown>;
}): string {
  const lines = [
    `# ARC-8 架构${modeLabel(result.mode)}`,
    '',
    `- 结论：${result.summary}`,
    `- 当前 mode：${result.mode}`,
    `- 下一阶段：${result.arc8Status.nextStep ?? '当前阶段已完成'}`,
    `- 门禁：${result.validation.passed ? '通过' : '未通过'}`,
  ];
  if (result.validation.gaps.length > 0) {
    lines.push('', '## 证据缺口', ...result.validation.gaps.map((item) => `- ${item}`));
  }
  if (result.validation.driftFindings.length > 0) {
    lines.push('', '## 漂移发现', ...result.validation.driftFindings.map((item) => `- ${item}`));
  }
  lines.push('', '## ARC-8 步骤');
  for (const step of result.steps) {
    lines.push(`- [${step.status === 'completed' ? 'x' : ' '}] ${step.id.toUpperCase()} ${step.title} — ${step.status}`);
  }
  lines.push(
    '',
    '## 边界',
    '- 结构化结果是架构工作表和门禁，不代表代码或迁移已经实施。',
    '- fact、inference、unknown 必须保持区分。',
    '- 托管交付只有在真实实施、测试、drift、review 和 converge 后才能沉淀长期 Memory。',
  );
  return lines.join('\n');
}

function normalizeFacts(value: unknown): ArchitectureFact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const raw = objectValue(item);
    const statement = getString(raw.statement).trim();
    if (!statement) return [];
    const classification = raw.classification === 'fact' || raw.classification === 'unknown'
      ? raw.classification
      : 'inference';
    return [{ statement, classification, evidence: stringArray(raw.evidence) }];
  });
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => getString(item).trim()).filter(Boolean))];
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown>[]
    : [];
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function normalizeObjectOrString(value: unknown): ArchitectureMethodInput['baseline'] {
  if (typeof value === 'string') return value;
  return objectValue(value) as ArchitectureMethodInput['baseline'];
}

function makeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'architecture';
}

function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    assess: '评估',
    design: '设计',
    validate: '校验',
    drift: '漂移核验',
  };
  return labels[mode] ?? mode;
}
