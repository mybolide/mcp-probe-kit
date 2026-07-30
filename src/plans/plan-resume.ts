import { JsonPlanStore } from './plan-store.js';
import { normalizePlanId, type PlanHeartbeatRecord } from './plan-types.js';

export interface PlanResumeResult {
  found: boolean;
  record?: PlanHeartbeatRecord;
  readyStepIds: string[];
  blockedSteps: Array<{ stepId: string; missingDependencies: string[] }>;
  nextStepId?: string;
  nextAction: string;
}

export async function resumePlan(
  planId: string,
  projectRoot?: string
): Promise<PlanResumeResult> {
  const normalizedId = normalizePlanId(planId);
  const record = await new JsonPlanStore(projectRoot).read(normalizedId);
  if (!record) {
    return {
      found: false,
      readyStepIds: [],
      blockedSteps: [],
      nextAction: '未找到检查点；请用 plan_heartbeat 提供完整 plan 创建首个状态',
    };
  }
  if (record.status === 'converged' || record.status === 'cancelled') {
    return {
      found: true,
      record,
      readyStepIds: [],
      blockedSteps: [],
      nextAction:
        record.status === 'converged'
          ? '计划已收敛，无需继续执行'
          : '计划已取消；需要新任务时重新生成 plan',
    };
  }

  const completed = new Set(record.completedStepIds);
  const skipped = new Set(record.skippedSteps.map((item) => item.stepId));
  const satisfied = new Set([...completed, ...skipped]);
  const pending = record.plan.steps.filter((step) => !satisfied.has(step.id));
  const ready = pending.filter((step) =>
    (step.dependsOn ?? []).every((dependency) => satisfied.has(dependency))
  );
  const blockedSteps = pending
    .filter((step) => !ready.some((candidate) => candidate.id === step.id))
    .map((step) => ({
      stepId: step.id,
      missingDependencies: (step.dependsOn ?? []).filter(
        (dependency) => !satisfied.has(dependency)
      ),
    }));
  const nextStepId =
    record.currentStepId && ready.some((step) => step.id === record.currentStepId)
      ? record.currentStepId
      : ready[0]?.id;

  return {
    found: true,
    record,
    readyStepIds: ready.map((step) => step.id),
    blockedSteps,
    ...(nextStepId ? { nextStepId } : {}),
    nextAction: nextStepId
      ? `继续执行步骤 ${nextStepId}，完成后调用 plan_heartbeat 更新证据与状态`
      : record.unresolvedItems.length > 0
        ? '没有可执行步骤；先关闭 unresolvedItems 或将计划标记 blocked'
        : '没有可执行步骤；检查依赖、跳过理由或调用 converge 评估是否可关闭',
  };
}
