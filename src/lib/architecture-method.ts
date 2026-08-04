import {
  ARCHITECTURE_METHODOLOGY,
  ARCHITECTURE_METHOD_VERSION,
  TRADEOFF_DIMENSIONS,
  type ArchitectureDecision,
  type ArchitectureMethodInput,
  type ArchitectureMethodResult,
} from './architecture-types.js';
import {
  buildArchitectureWarnings,
  normalizeArchitectureAlternatives,
  normalizeArchitectureBaseline,
  normalizeArchitectureDecision,
  normalizeArchitectureFacts,
  normalizeArchitectureMode,
  normalizeArchitectureTarget,
  normalizeArchitectureTransition,
  uniqueStrings,
} from './architecture-normalization.js';
import {
  buildArchitectureSteps,
  detectArchitectureDrift,
  evaluateArchitectureGaps,
} from './architecture-validation.js';

export {
  ARCHITECTURE_METHODOLOGY,
  ARCHITECTURE_METHOD_VERSION,
  normalizeArchitectureMode,
};
export type {
  ArchitectureAlternative,
  ArchitectureAlternativeInput,
  ArchitectureBaseline,
  ArchitectureDecision,
  ArchitectureFact,
  ArchitectureFactClassification,
  ArchitectureMethodInput,
  ArchitectureMethodResult,
  ArchitectureMethodStep,
  ArchitectureMode,
  ArchitectureStepStatus,
  ArchitectureTarget,
  ArchitectureTransitionPlan,
} from './architecture-types.js';

export function buildArchitectureMethod(input: ArchitectureMethodInput): ArchitectureMethodResult {
  const mode = normalizeArchitectureMode(input.mode);
  const description = input.description.trim();
  if (!description) throw new Error('architecture 缺少完整 description');

  const baseline = normalizeArchitectureBaseline(input.baseline);
  const currentFacts = normalizeArchitectureFacts(input.currentFacts ?? baseline.currentFacts);
  const structuralCauses = uniqueStrings(input.structuralCauses ?? baseline.structuralCauses);
  const protectedInvariants = uniqueStrings(input.protectedInvariants ?? baseline.protectedInvariants);
  const alternatives = normalizeArchitectureAlternatives(input.alternatives ?? baseline.alternatives);
  const decision = normalizeArchitectureDecision(input.decision ?? baseline.decision);
  const targetArchitecture = normalizeArchitectureTarget(
    input.targetArchitecture ?? baseline.targetArchitecture,
  );
  const transitionPlan = normalizeArchitectureTransition(
    input.transitionPlan ?? baseline.transitionPlan,
  );
  const constraints = uniqueStrings([...(baseline.constraints ?? []), ...(input.constraints ?? [])]);
  const nonGoals = uniqueStrings([...(baseline.nonGoals ?? []), ...(input.nonGoals ?? [])]);
  const successCriteria = uniqueStrings(baseline.successCriteria);
  const runtimeEvidence = uniqueStrings(input.runtimeEvidence);
  const gaps = evaluateArchitectureGaps({
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
    ? detectArchitectureDrift({
        diff: input.diff ?? '',
        observedDrift: uniqueStrings(input.observedDrift),
        targetArchitecture,
        transitionPlan,
      })
    : [];
  const steps = buildArchitectureSteps(mode, gaps);
  const completedSteps = steps
    .filter((step) => step.status === 'completed')
    .map((step) => step.id);
  const blockedSteps = steps
    .filter((step) => step.status === 'blocked')
    .map((step) => step.id);
  const nextStep = steps.find((step) => step.status !== 'completed')?.id ?? null;
  const passed = gaps.length === 0 && (mode !== 'drift' || driftFindings.length === 0);

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
      scope: uniqueStrings(input.scope),
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
    warnings: buildArchitectureWarnings(currentFacts, input.baseline),
  };
}

function buildSummary(
  mode: ArchitectureMethodResult['mode'],
  passed: boolean,
  gaps: string[],
  driftFindings: string[],
): string {
  if (passed) return `ARC-8 ${mode} 已满足当前阶段门禁`;
  if (driftFindings.length > 0) return `ARC-8 ${mode} 发现 ${driftFindings.length} 项架构漂移`;
  return `ARC-8 ${mode} 尚有 ${gaps.length} 项证据缺口`;
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
  mode: ArchitectureMethodResult['mode'],
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
