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
  memoryPolicy: DelegatedMemoryPolicy;
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
  memoryPolicy?: Partial<DelegatedMemoryPolicy>;
  resumeContext?: DelegatedResumeContext;
}

const DEFAULT_MEMORY_POLICY: DelegatedMemoryPolicy = {
  recallBeforeExecution: true,
  extractAfterValidation: true,
  writeOnlyReusableKnowledge: true,
  allowNegativeMemory: true,
};

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
    globalRules: input.globalRules ?? [],
    completionCriteria: input.completionCriteria ?? [],
    memoryPolicy: {
      ...DEFAULT_MEMORY_POLICY,
      ...input.memoryPolicy,
    },
    ...(input.resumeContext ? { resumeContext: input.resumeContext } : {}),
  };
}
