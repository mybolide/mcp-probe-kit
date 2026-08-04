import type { DelegatedPlanContract } from '../lib/delegated-plan-contract.js';
import { JsonPlanStore, type PlanStoreLocation } from './plan-store.js';
import {
  PLAN_STATE_SCHEMA_VERSION,
  normalizeDelegatedPlan,
  normalizeEvidence,
  normalizePlanId,
  normalizeSkippedSteps,
  stringArray,
  type PlanEvidence,
  type PlanHeartbeatRecord,
  type PlanRunStatus,
  type SkippedPlanStep,
} from './plan-types.js';
import {
  mergeAcceptanceResults,
  mergeArtifacts,
  mergeCandidates,
  mergeRuntimeEvidence,
  normalizeAcceptanceResults,
  normalizePlanArtifacts,
  normalizePlanCandidates,
  normalizePlanJsonObject,
  normalizeRuntimeEvidence,
  type PlanAcceptanceResult,
  type PlanArtifact,
  type PlanCandidate,
  type PlanJsonObject,
  type PlanRuntimeEvidence,
} from './plan-state-metadata.js';

export interface PlanHeartbeatInput {
  planId: string;
  projectRoot?: string;
  plan?: unknown;
  status?: Exclude<PlanRunStatus, 'converged'>;
  currentStepId?: string;
  completedStepIds?: string[];
  skippedSteps?: SkippedPlanStep[] | unknown;
  unresolvedItems?: string[];
  evidence?: PlanEvidence[] | unknown;
  declaredScope?: PlanJsonObject | unknown;
  artifacts?: PlanArtifact[] | unknown;
  memoryCandidates?: PlanCandidate[] | unknown;
  architectureCandidates?: PlanCandidate[] | unknown;
  acceptanceResults?: PlanAcceptanceResult[] | unknown;
  runtimeEvidence?: PlanRuntimeEvidence[] | unknown;
  lastVerifiedRevision?: string;
}

export interface PlanHeartbeatResult {
  record: PlanHeartbeatRecord;
  location: PlanStoreLocation;
}

export async function recordPlanHeartbeat(
  input: PlanHeartbeatInput
): Promise<PlanHeartbeatResult> {
  const planId = normalizePlanId(input.planId);
  const store = new JsonPlanStore(input.projectRoot);
  const existing = await store.read(planId);
  if (existing?.status === 'converged' || existing?.status === 'cancelled') {
    throw new Error(
      `Plan 已${existing.status === 'converged' ? '收敛' : '取消'}，禁止继续写入 Heartbeat`
    );
  }
  const plan = resolvePlan(input.plan, existing?.plan, planId);
  const now = new Date().toISOString();
  const completed = mergeUnique(existing?.completedStepIds, input.completedStepIds);
  const skipped = mergeSkipped(existing?.skippedSteps, normalizeSkippedSteps(input.skippedSteps));
  const completedSet = new Set(completed);
  const normalizedSkipped = skipped.filter((item) => !completedSet.has(item.stepId));
  const evidence = mergeEvidence(existing?.evidence, normalizeEvidence(input.evidence, now));
  const declaredScope =
    input.declaredScope === undefined
      ? existing?.declaredScope ?? normalizePlanJsonObject(plan.declaredScope, 'plan.declaredScope')
      : normalizePlanJsonObject(input.declaredScope, 'declaredScope');
  const artifacts = mergeArtifacts(
    existing?.artifacts,
    normalizePlanArtifacts(input.artifacts, now),
  );
  const memoryCandidates = mergeCandidates(
    existing?.memoryCandidates,
    normalizePlanCandidates(input.memoryCandidates, 'memoryCandidates', now),
  );
  const architectureCandidates = mergeCandidates(
    existing?.architectureCandidates,
    normalizePlanCandidates(input.architectureCandidates, 'architectureCandidates', now),
  );
  const acceptanceResults = mergeAcceptanceResults(
    existing?.acceptanceResults,
    normalizeAcceptanceResults(input.acceptanceResults, now),
  );
  const runtimeEvidence = mergeRuntimeEvidence(
    existing?.runtimeEvidence,
    normalizeRuntimeEvidence(input.runtimeEvidence, now),
  );

  assertKnownStepIds(plan, [
    ...completed,
    ...normalizedSkipped.map((item) => item.stepId),
    ...(input.currentStepId ? [input.currentStepId] : []),
    ...evidence.map((item) => item.stepId).filter((item): item is string => Boolean(item)),
  ]);

  const currentStepId = input.currentStepId?.trim();
  const record: PlanHeartbeatRecord = {
    schemaVersion: PLAN_STATE_SCHEMA_VERSION,
    planId,
    plan,
    status: input.status ?? existing?.status ?? 'active',
    ...(currentStepId && !completedSet.has(currentStepId)
      ? { currentStepId }
      : {}),
    completedStepIds: completed,
    skippedSteps: normalizedSkipped,
    unresolvedItems:
      input.unresolvedItems === undefined
        ? existing?.unresolvedItems ?? []
        : stringArray(input.unresolvedItems),
    evidence,
    ...(declaredScope ? { declaredScope } : {}),
    artifacts,
    memoryCandidates,
    architectureCandidates,
    acceptanceResults,
    runtimeEvidence,
    ...(input.lastVerifiedRevision?.trim()
      ? { lastVerifiedRevision: input.lastVerifiedRevision.trim() }
      : existing?.lastVerifiedRevision
        ? { lastVerifiedRevision: existing.lastVerifiedRevision }
        : {}),
    ...(existing?.lastConvergence
      ? { lastConvergence: existing.lastConvergence }
      : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const location = await store.write(record);
  return { record, location };
}

function resolvePlan(
  rawPlan: unknown,
  existing: DelegatedPlanContract | undefined,
  planId: string
): DelegatedPlanContract {
  if (rawPlan !== undefined) {
    const plan = normalizeDelegatedPlan(rawPlan);
    if (plan.planId !== planId) {
      throw new Error(`plan.planId (${plan.planId}) 与 plan_id (${planId}) 不一致`);
    }
    return plan;
  }
  if (!existing) throw new Error('首次 plan_heartbeat 必须提供完整 plan');
  return existing;
}

function assertKnownStepIds(plan: DelegatedPlanContract, ids: string[]): void {
  const known = new Set(plan.steps.map((step) => step.id));
  const unknown = [...new Set(ids)].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`Plan 包含未知步骤: ${unknown.join(', ')}`);
}

function mergeUnique(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...stringArray(b)])];
}

function mergeSkipped(
  existing: SkippedPlanStep[] = [],
  incoming: SkippedPlanStep[] = []
): SkippedPlanStep[] {
  const map = new Map(existing.map((item) => [item.stepId, item]));
  for (const item of incoming) map.set(item.stepId, item);
  return [...map.values()];
}

function mergeEvidence(
  existing: PlanEvidence[] = [],
  incoming: PlanEvidence[] = []
): PlanEvidence[] {
  const key = (item: PlanEvidence) =>
    [item.kind, item.stepId, item.summary, item.reference, item.revision].join('|');
  const map = new Map(existing.map((item) => [key(item), item]));
  for (const item of incoming) map.set(key(item), item);
  return [...map.values()];
}
