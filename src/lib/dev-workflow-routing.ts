import type {
  WorkflowRouteResult,
  WorkflowRoutingCandidate,
  WorkflowRoutingDecision,
  WorkflowRoutingSource,
  WorkflowScenario,
} from './workflow-routing-contract.js';

export type {
  WorkflowRouteResult,
  WorkflowRoutingCandidate,
  WorkflowRoutingCandidateStatus,
  WorkflowRoutingDecision,
  WorkflowRoutingSource,
  WorkflowScenario,
} from './workflow-routing-contract.js';

export interface WorkflowToolStep {
  tool: string;
  required: boolean;
  when: string;
  note?: string;
}

export interface WorkflowPhase {
  id: string;
  title: string;
  when: string;
  steps: WorkflowToolStep[];
}

export interface DevWorkflowPlan {
  scenario: WorkflowScenario;
  scenarioLabel: string;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  firstTool: string | null;
  firstToolArgsHint?: Record<string, unknown>;
  phases: WorkflowPhase[];
  avoid: string[];
  memoryNotes: string[];
  routingDecision?: WorkflowRoutingDecision;
  selectionGuide?: Array<{ signal: string; firstTool: string; note?: string }>;
  agentSelectionRules?: readonly string[];
}

const EXPLICIT_SCENARIO_MAP: Record<string, WorkflowScenario> = {
  feature: 'feature',
  bugfix: 'bugfix',
  bug: 'bugfix',
  ui: 'ui',
  product: 'product',
  prd: 'product',
  ralph: 'ralph',
  architecture: 'architecture',
  arch: 'architecture',
  explore: 'explore',
  commit: 'commit',
  work_report: 'work_report',
  report: 'work_report',
  test: 'test',
  review: 'review',
  refactor: 'refactor',
  onboard: 'onboard',
  spec: 'spec',
  memory: 'memory',
  auto: 'unknown',
};

export const SCENARIO_LABELS: Record<WorkflowScenario, string> = {
  feature: '新功能开发',
  bugfix: 'Bug 修复',
  ui: 'UI 开发',
  product: '产品规划',
  ralph: '有界 Ralph 迭代',
  architecture: '架构评估 / 设计 / 漂移核验',
  explore: '代码探索 / 影响分析',
  commit: '生成提交',
  work_report: 'Git 工作报告',
  test: '测试设计 / 补测试',
  review: '代码审查',
  refactor: '重构',
  onboard: '项目上手',
  spec: '规格校验',
  memory: '记忆检索 / 沉淀',
  unknown: '工具选择指南',
};

function buildExplicitDecision(
  scenario: Exclude<WorkflowScenario, 'unknown'>,
  alias: string,
): WorkflowRouteResult {
  const candidate: WorkflowRoutingCandidate = {
    scenario,
    score: Number.MAX_SAFE_INTEGER,
    matchedRuleIds: [`explicit:${alias}`],
    status: 'selected',
    reason: `Agent 已显式指定 scenario=${alias}`,
  };
  return {
    scenario,
    confidence: 'high',
    routingDecision: {
      source: 'explicit',
      selectedScenario: scenario,
      conflict: false,
      requiresClarification: false,
      reason: candidate.reason,
      candidates: [candidate],
    },
  };
}

/**
 * workflow is not a natural-language intent classifier.
 *
 * Explicit scenarios remain deterministic for compatibility and for Agents
 * that already know which workflow guide they want. `auto` (or omitted
 * scenario) deliberately returns a guide-only result and never infers a tool
 * from the arbitrary wording of `intent`.
 */
export function detectWorkflowRoute(_intent: string, explicit?: string): WorkflowRouteResult {
  const normalizedExplicit = (explicit || '').trim().toLowerCase();
  const explicitScenario = EXPLICIT_SCENARIO_MAP[normalizedExplicit];
  if (
    normalizedExplicit
    && normalizedExplicit !== 'auto'
    && explicitScenario
    && explicitScenario !== 'unknown'
  ) {
    return buildExplicitDecision(explicitScenario, normalizedExplicit);
  }

  return {
    scenario: 'unknown',
    confidence: 'low',
    routingDecision: {
      source: 'guide',
      selectedScenario: null,
      conflict: false,
      requiresClarification: false,
      reason: 'workflow 不执行自然语言意图识别；请由 Agent 根据 Skill、tool descriptions 和选择指南自行选择工具，必要时再向用户澄清。',
      candidates: [],
    },
  };
}

export function detectWorkflowScenario(intent: string, explicit?: string): {
  scenario: WorkflowScenario;
  confidence: 'high' | 'medium' | 'low';
} {
  const route = detectWorkflowRoute(intent, explicit);
  return { scenario: route.scenario, confidence: route.confidence };
}
