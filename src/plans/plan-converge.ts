import { JsonPlanStore } from './plan-store.js';
import {
  normalizePlanId,
  type PlanConvergenceSnapshot,
  type PlanEvidenceKind,
  type PlanHeartbeatRecord,
} from './plan-types.js';

export interface ConvergePlanInput {
  planId: string;
  projectRoot?: string;
  requiredEvidenceKinds?: PlanEvidenceKind[];
  externalBlockers?: string[];
}

function hasPassingGate(record: PlanHeartbeatRecord, gateId: string): boolean {
  return record.acceptanceResults.some(
    (item) => item.gateId === gateId && item.passed && item.summary.trim(),
  );
}

export interface ConvergePlanResult {
  passed: boolean;
  blockers: string[];
  missingEvidenceKinds: PlanEvidenceKind[];
  requiredQualityGates: string[];
  missingQualityGates: string[];
  incompleteStepIds: string[];
  memoryWriteAllowed: boolean;
  record: PlanHeartbeatRecord;
}

export async function convergePlan(
  input: ConvergePlanInput
): Promise<ConvergePlanResult> {
  const planId = normalizePlanId(input.planId);
  const store = new JsonPlanStore(input.projectRoot);
  const record = await store.read(planId);
  if (!record) throw new Error(`未找到 Plan 检查点: ${planId}`);

  const requiredEvidenceKinds = [
    ...new Set([
      ...record.plan.requiredEvidenceKinds,
      ...(input.requiredEvidenceKinds ?? []),
    ]),
  ];
  const requiredQualityGates = [...new Set(record.plan.qualityGates)];
  const completed = new Set(record.completedStepIds);
  const skipped = new Set(record.skippedSteps.map((item) => item.stepId));
  const incompleteStepIds = record.plan.steps
    .map((step) => step.id)
    .filter((stepId) => !completed.has(stepId) && !skipped.has(stepId));
  const missingEvidenceKinds = requiredEvidenceKinds.filter(
    (kind) => !hasEvidence(record, kind)
  );
  const missingQualityGates = requiredQualityGates.filter(
    (gateId) => !hasPassingGate(record, gateId)
  );
  const blockers = [
    ...(record.status === 'cancelled' ? ['计划已取消'] : []),
    ...(record.plan.completionCriteria.length === 0
      ? ['Plan 未声明 completionCriteria']
      : []),
    ...(incompleteStepIds.length > 0
      ? [`仍有未完成步骤: ${incompleteStepIds.join(', ')}`]
      : []),
    ...(record.unresolvedItems.length > 0
      ? [`仍有未关闭事项: ${record.unresolvedItems.join('；')}`]
      : []),
    ...(missingEvidenceKinds.length > 0
      ? [`缺少收敛证据: ${missingEvidenceKinds.join(', ')}`]
      : []),
    ...(missingQualityGates.length > 0
      ? [`质量闸门未通过: ${missingQualityGates.join(', ')}`]
      : []),
    ...((input.externalBlockers ?? []).map((item) => item.trim()).filter(Boolean)),
  ];
  const passed = blockers.length === 0;
  const now = new Date().toISOString();
  const snapshot: PlanConvergenceSnapshot = {
    checkedAt: now,
    passed,
    blockers,
    requiredEvidenceKinds,
    requiredQualityGates,
    missingQualityGates,
  };
  const updated: PlanHeartbeatRecord = {
    ...record,
    status: passed ? 'converged' : 'blocked',
    ...(passed ? { currentStepId: undefined } : {}),
    lastConvergence: snapshot,
    updatedAt: now,
  };
  await store.write(updated);
  return {
    passed,
    blockers,
    missingEvidenceKinds,
    requiredQualityGates,
    missingQualityGates,
    incompleteStepIds,
    memoryWriteAllowed:
      passed && updated.plan.memoryPolicy.extractAfterValidation,
    record: updated,
  };
}

function hasEvidence(
  record: PlanHeartbeatRecord,
  kind: PlanEvidenceKind
): boolean {
  return record.evidence.some((item) => {
    if (item.kind !== kind || !item.summary.trim()) return false;
    if (kind === 'requirements') return true;
    return Boolean(item.reference?.trim() || item.revision?.trim());
  });
}
