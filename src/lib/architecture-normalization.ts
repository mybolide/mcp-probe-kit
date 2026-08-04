import type {
  ArchitectureAlternative,
  ArchitectureBaseline,
  ArchitectureDecision,
  ArchitectureFact,
  ArchitectureFactClassification,
  ArchitectureMethodInput,
  ArchitectureMode,
  ArchitectureTarget,
  ArchitectureTransitionPlan,
} from './architecture-types.js';

export function normalizeArchitectureMode(value: unknown): ArchitectureMode {
  const mode = String(value ?? 'assess').trim().toLowerCase();
  if (mode === 'assess' || mode === 'design' || mode === 'validate' || mode === 'drift') {
    return mode;
  }
  throw new Error(`architecture mode 不支持: ${String(value)}。可选值: assess, design, validate, drift`);
}

export function normalizeArchitectureBaseline(
  value: ArchitectureMethodInput['baseline'],
): ArchitectureBaseline {
  if (!value) return {};
  if (typeof value === 'object') return value;
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ArchitectureBaseline;
    }
  } catch {
    // Prose baselines remain usable as inference but do not satisfy structured design gates.
  }
  return {
    currentFacts: [{ statement: trimmed, classification: 'inference', evidence: ['baseline text'] }],
  };
}

export function normalizeArchitectureFacts(value: unknown): ArchitectureFact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const statement = String(raw.statement ?? '').trim();
    if (!statement) return [];
    return [{
      statement,
      classification: normalizeFactClassification(raw.classification),
      evidence: uniqueStrings(raw.evidence),
    }];
  });
}

export function normalizeArchitectureAlternatives(value: unknown): ArchitectureAlternative[] {
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
      boundaries: uniqueStrings(raw.boundaries),
      dependencies: uniqueStrings(raw.dependencies),
      dataOwnership: uniqueStrings(raw.dataOwnership),
      publicContracts: uniqueStrings(raw.publicContracts),
      transition: uniqueStrings(raw.transition),
      advantages: uniqueStrings(raw.advantages),
      disadvantages: uniqueStrings(raw.disadvantages),
      risks: uniqueStrings(raw.risks),
    }];
  });
}

export function normalizeArchitectureDecision(value: unknown): ArchitectureDecision {
  const raw = objectRecord(value);
  return {
    recommended: String(raw.recommended ?? '').trim(),
    rationale: uniqueStrings(raw.rationale),
    rejectedAlternatives: uniqueStrings(raw.rejectedAlternatives),
    assumptions: uniqueStrings(raw.assumptions),
  };
}

export function normalizeArchitectureTarget(value: unknown): ArchitectureTarget {
  const raw = objectRecord(value);
  return {
    boundaries: uniqueStrings(raw.boundaries),
    allowedDependencies: uniqueStrings(raw.allowedDependencies),
    forbiddenDependencies: uniqueStrings(raw.forbiddenDependencies),
    dataOwnership: uniqueStrings(raw.dataOwnership),
    publicContracts: uniqueStrings(raw.publicContracts),
    protectedBehaviors: uniqueStrings(raw.protectedBehaviors),
  };
}

export function normalizeArchitectureTransition(value: unknown): ArchitectureTransitionPlan {
  const raw = objectRecord(value);
  return {
    stages: uniqueStrings(raw.stages),
    migration: uniqueStrings(raw.migration),
    compatibility: uniqueStrings(raw.compatibility),
    rollback: uniqueStrings(raw.rollback),
    observability: uniqueStrings(raw.observability),
    cleanup: uniqueStrings(raw.cleanup),
  };
}

export function buildArchitectureWarnings(
  currentFacts: ArchitectureFact[],
  baseline: unknown,
): string[] {
  const warnings: string[] = [];
  if (currentFacts.some((fact) => fact.classification === 'unknown')) {
    warnings.push('当前事实中仍有 unknown，实施前应补充代码、图谱或运行证据');
  }
  if (typeof baseline === 'string' && baseline.trim() && !isJsonObjectString(baseline)) {
    warnings.push('baseline 为非结构化文本，仅按 inference 使用，不能单独满足设计门禁');
  }
  return warnings;
}

export function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeFactClassification(value: unknown): ArchitectureFactClassification {
  return value === 'fact' || value === 'unknown' ? value : 'inference';
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isJsonObjectString(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
  } catch {
    return false;
  }
}
