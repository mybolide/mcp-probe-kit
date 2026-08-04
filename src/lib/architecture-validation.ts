import {
  ARC8_STEP_DEFINITIONS,
  type ArchitectureAlternative,
  type ArchitectureDecision,
  type ArchitectureFact,
  type ArchitectureMethodStep,
  type ArchitectureMode,
  type ArchitectureTarget,
  type ArchitectureTransitionPlan,
} from './architecture-types.js';
import { uniqueStrings } from './architecture-normalization.js';

export interface ArchitectureValidationInput {
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
}

export function evaluateArchitectureGaps(input: ArchitectureValidationInput): string[] {
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
    input.targetArchitecture.dataOwnership.length > 0
    || input.targetArchitecture.publicContracts.length > 0;
  if ((mode === 'design' || mode === 'validate') && changesDataOrContracts) {
    if (input.transitionPlan.migration.length === 0) {
      gaps.push('ARC-6 涉及数据或契约变化但缺少迁移方案');
    }
    if (input.transitionPlan.rollback.length === 0) {
      gaps.push('ARC-6 涉及数据或契约变化但缺少回滚方案');
    }
  }

  if (mode === 'drift') {
    if (!input.diff.trim()) gaps.push('ARC-8 缺少真实 diff 或 revision 证据');
    if (input.runtimeEvidence.length === 0) gaps.push('ARC-8 缺少图谱或运行证据');
    if (input.targetArchitecture.boundaries.length === 0) gaps.push('ARC-8 缺少已确认目标架构');
  }
  return gaps;
}

export function detectArchitectureDrift(input: {
  diff: string;
  observedDrift: string[];
  targetArchitecture: ArchitectureTarget;
  transitionPlan: ArchitectureTransitionPlan;
}): string[] {
  const findings = [...input.observedDrift];
  const diff = input.diff;

  for (const rule of input.targetArchitecture.forbiddenDependencies) {
    const [source, target] = rule
      .split(/\s*(?:->|=>|→)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (!source || !target) continue;
    const mentionsSource = diff.toLowerCase().includes(source.toLowerCase());
    const importsTarget = new RegExp(
      `(?:import|from|require\\s*\\()[^\\n]*${escapeRegex(target)}`,
      'i',
    ).test(diff);
    if (mentionsSource && importsTarget) {
      findings.push(`检测到可能违反禁止依赖规则：${rule}`);
    }
  }

  if (/TODO\s*[:：]?\s*(remove|delete|cleanup)|temporary compatibility|临时兼容|待清理旧/i.test(diff)) {
    findings.push('实现中仍存在临时兼容或待清理旧路径标记');
  }
  if (
    input.transitionPlan.cleanup.length > 0
    && /deleted file mode|^-.*legacy|^-.*deprecated/im.test(diff) === false
  ) {
    findings.push('设计声明需要清理旧路径，但 diff 中没有可识别的清理证据');
  }

  return uniqueStrings(findings);
}

export function buildArchitectureSteps(
  mode: ArchitectureMode,
  gaps: string[],
): ArchitectureMethodStep[] {
  const hasGaps = gaps.length > 0;
  let previousBlocked = false;
  return ARC8_STEP_DEFINITIONS.map((definition) => {
    const relevant = definition.modes.includes(mode);
    let status: ArchitectureMethodStep['status'] = relevant ? 'pending' : 'completed';
    if (relevant && previousBlocked) status = 'blocked';
    if (relevant && hasGaps && isStepBlockedByGaps(definition.id, gaps)) {
      status = 'blocked';
      previousBlocked = true;
    } else if (relevant && !hasGaps) {
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
