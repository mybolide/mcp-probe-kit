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

const ARC8_STEP_DEFINITIONS: Array<{
  id: ArchitectureMethodStep['id'];
  title: string;
  modes: ArchitectureMode[];
  requiredEvidence: string[];
  outputs: string[];
  gate?: string;
}> = [
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

const TRADEOFF_DIMENSIONS = [
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

export function normalizeArchitectureMode(value: unknown): ArchitectureMode {
  const mode = String(value ?? 'assess').trim().toLowerCase();
  if (mode === 'assess' || mode === 'design' || mode === 'validate' || mode === 'drift') {
    return mode;
  }
  throw new Error(`architecture mode 不支持: ${String(value)}。可选值: assess, design, validate, drift`);
}

export function buildArchitectureMethod(input: ArchitectureMethodInput): ArchitectureMethodResult {
  const mode = normalizeArchitectureMode(input.mode);
  const description = input.description.trim();
  if (!description) throw new Error('architecture 缺少完整 description');

  const baseline = normalizeBaseline(input.baseline);
  const currentFacts = normalizeFacts(input.currentFacts ?? baseline.currentFacts);
  const structuralCauses = strings(input.structuralCauses ?? baseline.structuralCauses);
  const protectedInvariants = strings(input.protectedInvariants ?? baseline.protectedInvariants);
  const alternatives = normalizeAlternatives(input.alternatives ?? baseline.alternatives);
  const decision = normalizeDecision(input.decision ?? baseline.decision);
  const targetArchitecture = normalizeTarget(input.targetArchitecture ?? baseline.targetArchitecture);
  const transitionPlan = normalizeTransition(input.transitionPlan ?? baseline.transitionPlan);
  const constraints = strings([...(baseline.constraints ?? []), ...(input.constraints ?? [])]);
  const nonGoals = strings([...(baseline.nonGoals ?? []), ...(input.nonGoals ?? [])]);
  const successCriteria = strings(baseline.successCriteria);
  const runtimeEvidence = strings(input.runtimeEvidence);
  const gaps = evaluateGaps({
    mode,
    currentFacts,
    structuralCauses,
    protectedInvariants,
    alternatives,
    decision,
    targetArchitecture,
    transitionPlan,
    diff: input.diff ?? '',
    runtimeEvidence,
  });
  const driftFindings = mode === 'drift'
    ? detectDrift({
        diff: input.diff ?? '',
        observedDrift: strings(input.observedDrift),
        targetArchitecture,
        transitionPlan,
      })
    : [];
  const steps = buildSteps(mode, gaps);
  const completedSteps = steps.filter((step) => step.status === 'completed').map((step) => step.id);
  const blockedSteps = steps.filter((step) => step.status === 'blocked').map((step) => step.id);
  const nextStep = steps.find((step) => step.status !== 'completed')?.id ?? null;
  const passed = gaps.length === 0 && (mode !== 'drift' || driftFindings.length === 0);
  const warnings = buildWarnings(currentFacts, input.baseline);

  const candidate = {
    methodology: ARCHITECTURE_METHODOLOGY,
    problem: description,
    currentFacts,
    structuralCauses,
    protectedInvariants,
    alternatives,
    decision,
    targetArchitecture,
    transitionPlan,
    validation: { passed, gaps, driftFindings },
  };

  return {
    mode,
    methodology: ARCHITECTURE_METHODOLOGY,
    methodologyVersion: ARCHITECTURE_METHOD_VERSION,
    summary: buildSummary(mode, passed, gaps, driftFindings),
    arc8Status: { completedSteps, blockedSteps, nextStep },
    problem: {
      goal: description,
      scope: strings(input.scope),
      nonGoals,
      successCriteria,
      constraints,
    },
    currentFacts,
    structuralCauses,
    protectedInvariants,
    alternatives,
    tradeoffDimensions: [...TRADEOFF_DIMENSIONS],
    decision,
    targetArchitecture,
    transitionPlan,
    validation: { passed, gaps, driftFindings },
    steps,
    architectureCandidate: candidate,
    adrCandidate: buildAdrCandidate(candidate, decision),
    memoryCandidate: buildMemoryCandidate(mode, candidate, passed),
    warnings,
  };
}

function evaluateGaps(input: {
  mode: ArchitectureMode;
  currentFacts: ArchitectureFact[];
  structuralCauses: string[];
  protectedInvariants: string[];
  alternatives: ArchitectureAlternative[];
  decision: ArchitectureDecision;
  targetArchitecture: ArchitectureTarget;
  transitionPlan: ArchitectureTransitionPlan;
  diff: string;
  runtimeEvidence: string[];
}): string[] {
  const gaps: string[] = [];
  const { mode } = input;

  if ((mode === 'design' || mode === 'validate' || mode === 'drift') && input.currentFacts.length === 0) {
    gaps.push('ARC-2 缺少当前架构事实；先执行 assess 或提供等价事实证据');
  }
  if ((mode === 'design' || mode === 'validate') && input.structuralCauses.length === 0) {
    gaps.push('ARC-3 缺少结构性根因');
  }
  if ((mode === 'design' || mode === 'validate') && input.protectedInvariants.length === 0) {
    gaps.push('ARC-3 缺少保护不变量');
  }
  if ((mode === 'design' || mode === 'validate') && input.alternatives.length < 2) {
    gaps.push('ARC-4 缺少至少两个可比较候选方案');
  }
  if ((mode === 'design' || mode === 'validate') && !input.decision.recommended) {
    gaps.push('ARC-5 缺少推荐方案和选择依据');
  }
  if ((mode === 'design' || mode === 'validate') && input.targetArchitecture.boundaries.length === 0) {
    gaps.push('ARC-6 缺少目标模块边界');
  }

  const changesDataOrContracts =
    input.targetArchitecture.dataOwnership.length > 0 || input.targetArchitecture.publicContracts.length > 0;
  if ((mode === 'design' || mode === 'validate') && changesDataOrContracts) {
    if (input.transitionPlan.migration.length === 0) gaps.push('ARC-6 涉及数据或契约变化但缺少迁移方案');
    if (input.transitionPlan.rollback.length === 0) gaps.push('ARC-6 涉及数据或契约变化但缺少回滚方案');
  }

  if (mode === 'drift') {
    if (!input.diff.trim()) gaps.push('ARC-8 缺少真实 diff 或 revision 证据');
    if (input.runtimeEvidence.length === 0) gaps.push('ARC-8 缺少图谱或运行证据');
    if (input.targetArchitecture.boundaries.length === 0) gaps.push('ARC-8 缺少已确认目标架构');
  }
  return gaps;
}

function detectDrift(input: {
  diff: string;
  observedDrift: string[];
  targetArchitecture: ArchitectureTarget;
  transitionPlan: ArchitectureTransitionPlan;
}): string[] {
  const findings = [...input.observedDrift];
  const diff = input.diff;

  for (const rule of input.targetArchitecture.forbiddenDependencies) {
    const [source, target] = rule.split(/\s*(?:->|=>|→)\s*/).map((part) => part.trim()).filter(Boolean);
    if (!source || !target) continue;
    const mentionsSource = diff.toLowerCase().includes(source.toLowerCase());
    const importsTarget = new RegExp(`(?:import|from|require\\s*\\()[^\\n]*${escapeRegex(target)}`, 'i').test(diff);
    if (mentionsSource && importsTarget) {
      findings.push(`检测到可能违反禁止依赖规则：${rule}`);
    }
  }

  if (/TODO\s*[:：]?\s*(remove|delete|cleanup)|temporary compatibility|临时兼容|待清理旧/i.test(diff)) {
    findings.push('实现中仍存在临时兼容或待清理旧路径标记');
  }
  if (input.transitionPlan.cleanup.length > 0 && /deleted file mode|^-.*legacy|^-.*deprecated/im.test(diff) === false) {
    findings.push('设计声明需要清理旧路径，但 diff 中没有可识别的清理证据');
  }

  return strings(findings);
}

function buildSteps(mode: ArchitectureMode, gaps: string[]): ArchitectureMethodStep[] {
  const blocked = gaps.length > 0;
  let previousBlocked = false;
  return ARC8_STEP_DEFINITIONS.map((definition) => {
    const relevant = definition.modes.includes(mode);
    let status: ArchitectureStepStatus = relevant ? 'pending' : 'completed';
    if (relevant && previousBlocked) status = 'blocked';
    if (relevant && blocked && isStepBlockedByGaps(definition.id, gaps)) {
      status = 'blocked';
      previousBlocked = true;
    } else if (relevant && !blocked) {
      status = 'completed';
    }
    return {
      id: definition.id,
      title: definition.title,
      status,
      requiredEvidence: [...definition.requiredEvidence],
      outputs: [...definition.outputs],
      ...(definition.gate ? { gate: definition.gate } : {}),
    };
  });
}

function isStepBlockedByGaps(stepId: ArchitectureMethodStep['id'], gaps: string[]): boolean {
  const number = stepId.slice(4);
  return gaps.some((gap) => gap.includes(`ARC-${number}`));
}

function normalizeBaseline(value: ArchitectureMethodInput['baseline']): ArchitectureBaseline {
  if (!value) return {};
  if (typeof value === 'object') return value;
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ArchitectureBaseline;
  } catch {
    // A prose baseline is valid evidence, but cannot satisfy structured design gates by itself.
  }
  return {
    currentFacts: [{ statement: trimmed, classification: 'inference', evidence: ['baseline text'] }],
  };
}

function normalizeFacts(value: unknown): ArchitectureFact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const statement = String(raw.statement ?? '').trim();
    if (!statement) return [];
    const classification = normalizeClassification(raw.classification);
    return [{ statement, classification, evidence: strings(raw.evidence) }];
  });
}

function normalizeClassification(value: unknown): ArchitectureFactClassification {
  return value === 'fact' || value === 'unknown' ? value : 'inference';
}

function normalizeAlternatives(value: unknown): ArchitectureAlternative[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const name = String(raw.name ?? raw.id ?? '').trim();
    if (!name) return [];
    return [{
      id: String(raw.id ?? `alternative-${index + 1}`),
      name,
      summary: String(raw.summary ?? '').trim(),
      boundaries: strings(raw.boundaries),
      dependencies: strings(raw.dependencies),
      dataOwnership: strings(raw.dataOwnership),
      publicContracts: strings(raw.publicContracts),
      transition: strings(raw.transition),
      advantages: strings(raw.advantages),
      disadvantages: strings(raw.disadvantages),
      risks: strings(raw.risks),
    }];
  });
}

function normalizeDecision(value: unknown): ArchitectureDecision {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    recommended: String(raw.recommended ?? '').trim(),
    rationale: strings(raw.rationale),
    rejectedAlternatives: strings(raw.rejectedAlternatives),
    assumptions: strings(raw.assumptions),
  };
}

function normalizeTarget(value: unknown): ArchitectureTarget {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    boundaries: strings(raw.boundaries),
    allowedDependencies: strings(raw.allowedDependencies),
    forbiddenDependencies: strings(raw.forbiddenDependencies),
    dataOwnership: strings(raw.dataOwnership),
    publicContracts: strings(raw.publicContracts),
    protectedBehaviors: strings(raw.protectedBehaviors),
  };
}

function normalizeTransition(value: unknown): ArchitectureTransitionPlan {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    stages: strings(raw.stages),
    migration: strings(raw.migration),
    compatibility: strings(raw.compatibility),
    rollback: strings(raw.rollback),
    observability: strings(raw.observability),
    cleanup: strings(raw.cleanup),
  };
}

function buildSummary(
  mode: ArchitectureMode,
  passed: boolean,
  gaps: string[],
  driftFindings: string[],
): string {
  if (passed) return `ARC-8 ${mode} 已满足当前阶段门禁`;
  if (driftFindings.length > 0) return `ARC-8 ${mode} 发现 ${driftFindings.length} 项架构漂移`;
  return `ARC-8 ${mode} 尚有 ${gaps.length} 项证据缺口`;
}

function buildWarnings(currentFacts: ArchitectureFact[], baseline: unknown): string[] {
  const warnings: string[] = [];
  if (currentFacts.some((fact) => fact.classification === 'unknown')) {
    warnings.push('当前事实中仍有 unknown，实施前应补充代码、图谱或运行证据');
  }
  if (typeof baseline === 'string' && baseline.trim() && !isJsonObjectString(baseline)) {
    warnings.push('baseline 为非结构化文本，仅按 inference 使用，不能单独满足设计门禁');
  }
  return warnings;
}

function buildAdrCandidate(
  candidate: Record<string, unknown>,
  decision: ArchitectureDecision,
): Record<string, unknown> {
  return {
    status: decision.recommended ? 'proposed' : 'draft',
    decision: decision.recommended,
    rationale: decision.rationale,
    rejectedAlternatives: decision.rejectedAlternatives,
    architectureCandidate: candidate,
  };
}

function buildMemoryCandidate(
  mode: ArchitectureMode,
  candidate: Record<string, unknown>,
  passed: boolean,
): Record<string, unknown> {
  return {
    type: mode === 'drift' ? 'architecture_drift' : 'architecture_decision',
    status: 'candidate',
    validated: passed,
    content: candidate,
    persistenceRule: '托管交付仅在 converge passed=true 后调用 memorize_asset',
  };
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function isJsonObjectString(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
  } catch {
    return false;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
