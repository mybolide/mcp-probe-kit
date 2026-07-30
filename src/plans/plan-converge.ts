import { JsonPlanStore } from './plan-store.js';
import {
  normalizePlanId,
  type PlanConvergenceSnapshot,
  type PlanEvidenceKind,
  type PlanHeartbeatRecord,
} from './plan-types.js';

export const DEFAULT_CONVERGENCE_EVIDENCE: PlanEvidenceKind[] = [
  'requirements',
  'spec',
  'implementation',
  'test',
  'review',
];

export interface ConvergePlanInput {
  planId: string;
  projectRoot?: string;
  requiredEvidenceKinds?: PlanEvidenceKind[];
  externalBlockers?: string[];
}

export interface ConvergePlanResult {
  passed: boolean;
  blockers: string[];
  missingEvidenceKinds: PlanEvidenceKind[];
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

  const requiredEvidenceKinds =
    input.requiredEvidenceKinds && input.requiredEvidenceKinds.length > 0
      ? [...new Set(input.requiredEvidenceKinds)]
      : DEFAULT_CONVERGENCE_EVIDENCE;
  const completed = new Set(record.completedStepIds);
  const skipped = new Set(record.skippedSteps.map((item) => item.stepId));
  const incompleteStepIds = record.plan.steps
    .map((step) => step.id)
    .filter((stepId) => !completed.has(stepId) && !skipped.has(stepId));
  const missingEvidenceKinds = requiredEvidenceKinds.filter(
    (kind) => !hasEvidence(record, kind)
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
    ...((input.externalBlockers ?? []).map((item) => item.trim()).filter(Boolean)),
  ];
  const passed = blockers.length === 0;
  const now = new Date().toISOString();
  const snapshot: PlanConvergenceSnapshot = {
    checkedAt: now,
    passed,
    blockers,
    requiredEvidenceKinds,
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
