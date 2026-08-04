export const ARCHITECTURE_METHODOLOGY = 'arc8' as const;
export const ARCHITECTURE_METHOD_VERSION = '1.0.0' as const;

export type ArchitectureMode = 'assess' | 'design' | 'validate' | 'drift';
export type ArchitectureFactClassification = 'fact' | 'inference' | 'unknown';
export type ArchitectureStepStatus = 'completed' | 'pending' | 'blocked';

export interface ArchitectureFact {
  statement: string;
  classification: ArchitectureFactClassification;
  evidence: string[];
}

export interface ArchitectureAlternative {
  id: string;
  name: string;
  summary: string;
  boundaries: string[];
  dependencies: string[];
  dataOwnership: string[];
  publicContracts: string[];
  transition: string[];
  advantages: string[];
  disadvantages: string[];
  risks: string[];
}

export type ArchitectureAlternativeInput = Partial<ArchitectureAlternative> & {
  name: string;
};

export interface ArchitectureDecision {
  recommended: string;
  rationale: string[];
  rejectedAlternatives: string[];
  assumptions: string[];
}

export interface ArchitectureTarget {
  boundaries: string[];
  allowedDependencies: string[];
  forbiddenDependencies: string[];
  dataOwnership: string[];
  publicContracts: string[];
  protectedBehaviors: string[];
}

export interface ArchitectureTransitionPlan {
  stages: string[];
  migration: string[];
  compatibility: string[];
  rollback: string[];
  observability: string[];
  cleanup: string[];
}

export interface ArchitectureBaseline {
  currentFacts?: ArchitectureFact[];
  structuralCauses?: string[];
  protectedInvariants?: string[];
  alternatives?: ArchitectureAlternativeInput[];
  decision?: Partial<ArchitectureDecision>;
  targetArchitecture?: Partial<ArchitectureTarget>;
  transitionPlan?: Partial<ArchitectureTransitionPlan>;
  successCriteria?: string[];
  constraints?: string[];
  nonGoals?: string[];
}

export interface ArchitectureMethodInput {
  mode: ArchitectureMode;
  description: string;
  scope?: string[];
  constraints?: string[];
  nonGoals?: string[];
  baseline?: ArchitectureBaseline | string;
  currentFacts?: ArchitectureFact[];
  structuralCauses?: string[];
  protectedInvariants?: string[];
  alternatives?: ArchitectureAlternativeInput[];
  decision?: Partial<ArchitectureDecision>;
  targetArchitecture?: Partial<ArchitectureTarget>;
  transitionPlan?: Partial<ArchitectureTransitionPlan>;
  diff?: string;
  runtimeEvidence?: string[];
  observedDrift?: string[];
}

export interface ArchitectureMethodStep {
  id: `arc-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
  title: string;
  status: ArchitectureStepStatus;
  requiredEvidence: string[];
  outputs: string[];
  gate?: string;
}

export interface ArchitectureMethodResult {
  mode: ArchitectureMode;
  methodology: typeof ARCHITECTURE_METHODOLOGY;
  methodologyVersion: typeof ARCHITECTURE_METHOD_VERSION;
  summary: string;
  arc8Status: {
    completedSteps: string[];
    blockedSteps: string[];
    nextStep: string | null;
  };
  problem: {
    goal: string;
    scope: string[];
    nonGoals: string[];
    successCriteria: string[];
    constraints: string[];
  };
  currentFacts: ArchitectureFact[];
  structuralCauses: string[];
  protectedInvariants: string[];
  alternatives: ArchitectureAlternative[];
  tradeoffDimensions: string[];
  decision: ArchitectureDecision;
  targetArchitecture: ArchitectureTarget;
  transitionPlan: ArchitectureTransitionPlan;
  validation: {
    passed: boolean;
    gaps: string[];
    driftFindings: string[];
  };
  steps: ArchitectureMethodStep[];
  architectureCandidate: Record<string, unknown>;
  adrCandidate: Record<string, unknown>;
  memoryCandidate: Record<string, unknown>;
  warnings: string[];
}

export interface ArchitectureStepDefinition {
  id: ArchitectureMethodStep['id'];
  title: string;
  modes: ArchitectureMode[];
  requiredEvidence: string[];
  outputs: string[];
  gate?: string;
}

export const ARC8_STEP_DEFINITIONS: ArchitectureStepDefinition[] = [
  {
    id: 'arc-1',
    title: '明确架构问题',
    modes: ['assess', 'validate'],
    requiredEvidence: ['完整目标', '范围与非目标', '成功标准', '业务与技术约束'],
    outputs: ['architecture problem statement'],
  },
  {
    id: 'arc-2',
    title: '重建当前架构事实',
    modes: ['assess', 'validate', 'drift'],
    requiredEvidence: ['当前代码或图谱证据', '数据流与契约证据', 'fact/inference/unknown 分类'],
    outputs: ['current architecture facts'],
    gate: '当前事实未建立时不得进入目标设计',
  },
  {
    id: 'arc-3',
    title: '定位结构性根因与保护不变量',
    modes: ['assess', 'validate'],
    requiredEvidence: ['结构性根因', '贡献因素', '必须保护的不变量'],
    outputs: ['structural causes', 'protected invariants'],
    gate: '结构性根因和保护不变量未明确时不得选择方案',
  },
  {
    id: 'arc-4',
    title: '形成候选方案',
    modes: ['design', 'validate'],
    requiredEvidence: ['至少两个可比较方案，或明确说明为何单一方案足够'],
    outputs: ['architecture alternatives'],
  },
  {
    id: 'arc-5',
    title: '权衡并作出决策',
    modes: ['design', 'validate'],
    requiredEvidence: ['权衡矩阵', '推荐方案', '被拒绝方案及理由', '关键假设'],
    outputs: ['architecture decision', 'ADR candidate'],
    gate: '未记录方案权衡和选择依据时不得确认设计',
  },
  {
    id: 'arc-6',
    title: '设计目标架构与过渡路径',
    modes: ['design', 'validate'],
    requiredEvidence: ['目标边界', '依赖规则', '数据所有权', '契约', '迁移与回滚'],
    outputs: ['target architecture', 'transition plan'],
    gate: '数据、契约或持久化变化缺少迁移与回滚时 validate 必须失败',
  },
  {
    id: 'arc-7',
    title: '实施前与阶段性验证',
    modes: ['validate', 'drift'],
    requiredEvidence: ['业务场景走查', '影响矩阵', '测试与观测', '回滚可行性'],
    outputs: ['validation checklist'],
  },
  {
    id: 'arc-8',
    title: '漂移核验与经验固化',
    modes: ['drift'],
    requiredEvidence: ['已确认设计', '真实 diff 或 revision', '图谱或运行证据'],
    outputs: ['drift findings', 'architecture result', 'memory candidate'],
    gate: '正式架构交付未执行 drift 时不得最终收敛',
  },
];

export const TRADEOFF_DIMENSIONS = [
  'correctness',
  'consistency',
  'maintainability',
  'evolvability',
  'performance',
  'observability',
  'compatibility',
  'implementation-cost',
  'rollback-difficulty',
] as const;
