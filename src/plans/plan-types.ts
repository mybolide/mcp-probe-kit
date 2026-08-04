import {
  buildDelegatedPlanContract,
  normalizeDelegatedEvidenceKinds,
  type DelegatedPlanContract,
  type DelegatedEvidenceKind,
  type DelegatedWorkflowKind,
} from '../lib/delegated-plan-contract.js';
import type {
  PlanAcceptanceResult,
  PlanArtifact,
  PlanCandidate,
  PlanJsonObject,
  PlanRuntimeEvidence,
} from './plan-state-metadata.js';

export const PLAN_STATE_SCHEMA_VERSION = '1.0.0' as const;

export type PlanRunStatus = 'active' | 'blocked' | 'converged' | 'cancelled';
export type PlanEvidenceKind = DelegatedEvidenceKind;

export interface PlanEvidence {
  kind: PlanEvidenceKind;
  summary: string;
  stepId?: string;
  reference?: string;
  revision?: string;
  verifiedAt: string;
}

export function normalizeEvidenceKinds(value: unknown): PlanEvidenceKind[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeEvidenceKind(item)))];
}

export interface SkippedPlanStep {
  stepId: string;
  reason: string;
}

export interface PlanConvergenceSnapshot {
  checkedAt: string;
  passed: boolean;
  blockers: string[];
  requiredEvidenceKinds: PlanEvidenceKind[];
  requiredQualityGates?: string[];
  missingQualityGates?: string[];
}

export interface PlanHeartbeatRecord {
  schemaVersion: typeof PLAN_STATE_SCHEMA_VERSION;
  planId: string;
  plan: DelegatedPlanContract;
  status: PlanRunStatus;
  currentStepId?: string;
  completedStepIds: string[];
  skippedSteps: SkippedPlanStep[];
  unresolvedItems: string[];
  evidence: PlanEvidence[];
  declaredScope?: PlanJsonObject;
  artifacts: PlanArtifact[];
  memoryCandidates: PlanCandidate[];
  architectureCandidates: PlanCandidate[];
  acceptanceResults: PlanAcceptanceResult[];
  runtimeEvidence: PlanRuntimeEvidence[];
  lastVerifiedRevision?: string;
  lastConvergence?: PlanConvergenceSnapshot;
  createdAt: string;
  updatedAt: string;
}

export function normalizePlanId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error('plan_id 长度必须为 1-160');
  }
  if (!/^[a-z0-9\u4e00-\u9fff](?:[a-z0-9._\-\u4e00-\u9fff]*[a-z0-9\u4e00-\u9fff])?$/i.test(normalized)) {
    throw new Error('plan_id 只能包含字母、数字、中文、点、下划线和连字符，且不能包含路径分隔符');
  }
  return normalized;
}

export function normalizeDelegatedPlan(value: unknown): DelegatedPlanContract {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('plan 必须是 Delegated Plan Contract 对象');
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.steps)) {
    throw new Error('plan.steps 必须是数组');
  }
  return buildDelegatedPlanContract({
    planId: normalizePlanId(String(raw.planId ?? raw.plan_id ?? '')),
    workflow: normalizeWorkflow(raw.workflow),
    workflowVersion: String(raw.workflowVersion ?? raw.workflow_version ?? ''),
    objective: String(raw.objective ?? ''),
    steps: raw.steps as never,
    globalRules: stringArray(raw.globalRules ?? raw.global_rules),
    completionCriteria: stringArray(
      raw.completionCriteria ?? raw.completion_criteria
    ),
    requiredEvidenceKinds:
      raw.requiredEvidenceKinds === undefined && raw.required_evidence_kinds === undefined
        ? undefined
        : normalizeDelegatedEvidenceKinds(
            raw.requiredEvidenceKinds ?? raw.required_evidence_kinds
          ),
    qualityGates: stringArray(raw.qualityGates ?? raw.quality_gates),
    declaredScope:
      raw.declaredScope && typeof raw.declaredScope === 'object' && !Array.isArray(raw.declaredScope)
        ? (raw.declaredScope as Record<string, unknown>)
        : raw.declared_scope && typeof raw.declared_scope === 'object' && !Array.isArray(raw.declared_scope)
          ? (raw.declared_scope as Record<string, unknown>)
          : undefined,
    memoryPolicy:
      raw.memoryPolicy && typeof raw.memoryPolicy === 'object'
        ? (raw.memoryPolicy as never)
        : undefined,
    resumeContext:
      raw.resumeContext && typeof raw.resumeContext === 'object'
        ? (raw.resumeContext as never)
        : undefined,
  });
}

export function normalizeEvidence(
  items: unknown,
  now: string = new Date().toISOString()
): PlanEvidence[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`evidence[${index}] 必须是对象`);
    }
    const raw = item as Record<string, unknown>;
    const kind = normalizeEvidenceKind(raw.kind);
    const summary = String(raw.summary ?? '').trim();
    if (!summary) throw new Error(`evidence[${index}].summary 不能为空`);
    return {
      kind,
      summary,
      ...(stringValue(raw.stepId ?? raw.step_id)
        ? { stepId: stringValue(raw.stepId ?? raw.step_id) }
        : {}),
      ...(stringValue(raw.reference)
        ? { reference: stringValue(raw.reference) }
        : {}),
      ...(stringValue(raw.revision)
        ? { revision: stringValue(raw.revision) }
        : {}),
      verifiedAt: normalizeDate(raw.verifiedAt ?? raw.verified_at, now),
    };
  });
}

export function normalizeSkippedSteps(items: unknown): SkippedPlanStep[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`skipped_steps[${index}] 必须是对象`);
    }
    const raw = item as Record<string, unknown>;
    const stepId = stringValue(raw.stepId ?? raw.step_id);
    const reason = stringValue(raw.reason);
    if (!stepId || !reason) {
      throw new Error(`skipped_steps[${index}] 必须包含 step_id 和 reason`);
    }
    return { stepId, reason };
  });
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function normalizeWorkflow(value: unknown): DelegatedWorkflowKind {
  const workflow = String(value ?? '').trim() as DelegatedWorkflowKind;
  const allowed: DelegatedWorkflowKind[] = [
    'feature',
    'bugfix',
    'ui',
    'onboard',
    'product',
    'ralph',
    'refactor',
    'custom',
  ];
  if (!allowed.includes(workflow)) throw new Error(`不支持的 plan.workflow: ${workflow}`);
  return workflow;
}

function normalizeEvidenceKind(value: unknown): PlanEvidenceKind {
  const [kind] = normalizeDelegatedEvidenceKinds([value]);
  if (!kind) throw new Error(`不支持的 evidence kind: ${String(value)}`);
  return kind;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDate(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`无效日期时间: ${String(value)}`);
  return date.toISOString();
}
