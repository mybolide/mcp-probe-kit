import { createHash } from 'node:crypto';
import type { PlanStep } from '../schemas/structured-output.js';

export const DELEGATED_PLAN_CONTRACT_VERSION = '2.0.0' as const;

export type DelegatedWorkflowKind =
  | 'feature'
  | 'bugfix'
  | 'ui'
  | 'onboard'
  | 'product'
  | 'ralph'
  | 'refactor'
  | 'custom';

export type DelegatedStepType =
  | 'tool'
  | 'agent_action'
  | 'user_input'
  | 'async_task';

export type DelegatedEvidenceKind =
  | 'requirements'
  | 'spec'
  | 'implementation'
  | 'test'
  | 'review'
  | 'memory'
  | 'other';

export interface DelegatedPlanStep extends PlanStep {
  type?: DelegatedStepType;
  requiredInputs?: string[];
  expectedOutputs?: string[];
  completionEvidence?: string[];
  qualityGates?: string[];
  onFailure?: {
    strategy: 'retry' | 'fallback' | 'ask_user' | 'stop';
    instruction?: string;
  };
}

export interface DelegatedExecutionStatePolicy {
  heartbeatTool: 'plan_heartbeat';
  resumeTool: 'resume_plan';
  convergenceTool: 'converge';
  heartbeatAfterEachStep: boolean;
  persistPlanOnFirstHeartbeat: boolean;
}

export interface DelegatedMemoryPolicy {
  recallBeforeExecution: boolean;
  extractAfterValidation: boolean;
  writeOnlyReusableKnowledge: boolean;
  allowNegativeMemory: boolean;
}

export interface DelegatedResumeContext {
  currentStepId?: string;
  completedStepIds?: string[];
  unresolvedItems?: string[];
  lastVerifiedRevision?: string;
  declaredScope?: Record<string, unknown>;
  artifacts?: Array<Record<string, unknown>>;
  memoryCandidates?: Array<Record<string, unknown>>;
  architectureCandidates?: Array<Record<string, unknown>>;
  acceptanceResults?: Array<Record<string, unknown>>;
  runtimeEvidence?: Array<Record<string, unknown>>;
}

export interface DelegatedPlanContract {
  planId: string;
  mode: 'delegated';
  contractVersion: typeof DELEGATED_PLAN_CONTRACT_VERSION;
  workflow: DelegatedWorkflowKind;
  workflowVersion: string;
  objective: string;
  steps: DelegatedPlanStep[];
  globalRules: string[];
  completionCriteria: string[];
  requiredEvidenceKinds: DelegatedEvidenceKind[];
  qualityGates: string[];
  declaredScope?: Record<string, unknown>;
  memoryPolicy: DelegatedMemoryPolicy;
  executionStatePolicy: DelegatedExecutionStatePolicy;
  resumeContext?: DelegatedResumeContext;
}

export interface BuildDelegatedPlanContractInput {
  planId: string;
  workflow: DelegatedWorkflowKind;
  workflowVersion: string;
  objective: string;
  steps: DelegatedPlanStep[];
  globalRules?: string[];
  completionCriteria?: string[];
  requiredEvidenceKinds?: DelegatedEvidenceKind[];
  qualityGates?: string[];
  declaredScope?: Record<string, unknown>;
  memoryPolicy?: Partial<DelegatedMemoryPolicy>;
  resumeContext?: DelegatedResumeContext;
}

const DEFAULT_MEMORY_POLICY: DelegatedMemoryPolicy = {
  recallBeforeExecution: true,
  extractAfterValidation: true,
  writeOnlyReusableKnowledge: true,
  allowNegativeMemory: true,
};

const DEFAULT_EXECUTION_STATE_POLICY: DelegatedExecutionStatePolicy = {
  heartbeatTool: 'plan_heartbeat',
  resumeTool: 'resume_plan',
  convergenceTool: 'converge',
  heartbeatAfterEachStep: true,
  persistPlanOnFirstHeartbeat: true,
};

const DEFAULT_STATE_RULES = [
  '首次执行计划时调用 plan_heartbeat 并附完整 plan，建立本地检查点',
  '每完成、跳过或阻塞一个步骤后调用 plan_heartbeat 更新证据与状态',
  '会话中断或切换 Agent 后先调用 resume_plan，再继续未完成步骤',
  '只有 converge 返回 passed=true 后，才能将本次结论正式写入长期记忆',
];

const EVIDENCE_KINDS: DelegatedEvidenceKind[] = [
  'requirements',
  'spec',
  'implementation',
  'test',
  'review',
  'memory',
  'other',
];

const DEFAULT_EVIDENCE_BY_WORKFLOW: Record<DelegatedWorkflowKind, DelegatedEvidenceKind[]> = {
  feature: ['requirements', 'spec', 'implementation', 'test', 'review'],
  bugfix: ['requirements', 'implementation', 'test', 'review'],
  ui: ['requirements', 'implementation', 'test', 'review'],
  onboard: [],
  product: ['requirements', 'review'],
  ralph: ['implementation', 'test', 'review'],
  refactor: ['requirements', 'implementation', 'test', 'review'],
  custom: [],
};

export function normalizeDelegatedEvidenceKinds(value: unknown): DelegatedEvidenceKind[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => {
    const kind = String(item ?? '').trim() as DelegatedEvidenceKind;
    if (!EVIDENCE_KINDS.includes(kind)) {
      throw new Error(`不支持的 required evidence kind: ${String(item)}`);
    }
    return kind;
  }))];
}

export function defaultEvidenceKindsForWorkflow(
  workflow: DelegatedWorkflowKind,
): DelegatedEvidenceKind[] {
  return [...DEFAULT_EVIDENCE_BY_WORKFLOW[workflow]];
}

export function createDelegatedPlanId(
  workflow: DelegatedWorkflowKind,
  seed: string
): string {
  const normalizedSeed = seed.trim() || 'plan';
  const slug = normalizedSeed
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'plan';
  const digest = createHash('sha256').update(`${workflow}:${normalizedSeed}`).digest('hex').slice(0, 10);
  return `${workflow}-${slug}-${digest}`;
}

/**
 * 将现有 start_* 生成的 delegated steps 包装为 v4 Plan Contract。
 * 该函数只增强结构，不执行步骤，也不改变 Agent 负责实施的边界。
 */
export function buildDelegatedPlanContract(
  input: BuildDelegatedPlanContractInput
): DelegatedPlanContract {
  if (!input.planId.trim()) {
    throw new Error('planId 不能为空');
  }
  if (!input.workflowVersion.trim()) {
    throw new Error('workflowVersion 不能为空');
  }
  if (!input.objective.trim()) {
    throw new Error('objective 不能为空');
  }

  const normalizedSteps = input.steps.map((step) => ({
    ...step,
    type: step.type ?? (step.tool ? 'tool' : step.action ? 'agent_action' : 'agent_action'),
    expectedOutputs: step.expectedOutputs ?? step.outputs ?? [],
  })) satisfies DelegatedPlanStep[];

  const stepIds = new Set<string>();
  for (const step of normalizedSteps) {
    if (!step.id?.trim()) {
      throw new Error('Delegated plan step id 不能为空');
    }
    if (stepIds.has(step.id)) {
      throw new Error(`Delegated plan step id 重复: ${step.id}`);
    }
    stepIds.add(step.id);
  }

  for (const step of normalizedSteps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!stepIds.has(dependency)) {
        throw new Error(`Delegated plan step ${step.id} 依赖未知步骤: ${dependency}`);
      }
    }
  }

  return {
    planId: input.planId,
    mode: 'delegated',
    contractVersion: DELEGATED_PLAN_CONTRACT_VERSION,
    workflow: input.workflow,
    workflowVersion: input.workflowVersion,
    objective: input.objective,
    steps: normalizedSteps,
    globalRules: [...new Set([...DEFAULT_STATE_RULES, ...(input.globalRules ?? [])])],
    completionCriteria: input.completionCriteria ?? [],
    requiredEvidenceKinds:
      input.requiredEvidenceKinds === undefined
        ? defaultEvidenceKindsForWorkflow(input.workflow)
        : normalizeDelegatedEvidenceKinds(input.requiredEvidenceKinds),
    qualityGates: [...new Set((input.qualityGates ?? []).map((item) => item.trim()).filter(Boolean))],
    ...(input.declaredScope ? { declaredScope: { ...input.declaredScope } } : {}),
    memoryPolicy: {
      ...DEFAULT_MEMORY_POLICY,
      ...input.memoryPolicy,
    },
    executionStatePolicy: DEFAULT_EXECUTION_STATE_POLICY,
    ...(input.resumeContext ? { resumeContext: input.resumeContext } : {}),
  };
}
