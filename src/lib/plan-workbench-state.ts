export type PlanWorkbenchDict = Record<string, unknown>;

function asDict(value: unknown): PlanWorkbenchDict {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as PlanWorkbenchDict)
    : {};
}

export function planSnapshotNeedsReconciliation(snapshotValue: unknown): boolean {
  const snapshot = asDict(snapshotValue);
  const record = asDict(snapshot.record);
  if (!planSnapshotHasRecord(snapshot)) return false;
  const completed = Array.isArray(record.completedStepIds) ? record.completedStepIds : [];
  const skipped = Array.isArray(record.skippedSteps) ? record.skippedSteps : [];
  const currentStepId = text(record.currentStepId);
  const runtimeEvidence = Array.isArray(record.runtimeEvidence) ? record.runtimeEvidence : [];
  const workbenchBootstrap = runtimeEvidence.some((item) => {
    const evidence = asDict(item);
    return text(evidence.kind) === 'workbench_checkpoint_bootstrap';
  });
  return workbenchBootstrap
    && completed.length === 0
    && skipped.length === 0
    && !currentStepId;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstText(values: unknown[]): string {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return '';
}

export function planSnapshotHasRecord(snapshotValue: unknown): boolean {
  const snapshot = asDict(snapshotValue);
  const record = asDict(snapshot.record);
  return snapshot.found === true && Object.keys(record).length > 0;
}

export function resolvePlanProjectRoot(input: {
  lastInput?: unknown;
  lastResult?: unknown;
  plan?: unknown;
  planSnapshot?: unknown;
}): string {
  const lastInput = asDict(input.lastInput);
  const lastResult = asDict(input.lastResult);
  const structured = asDict(lastResult.structuredContent);
  const metadata = asDict(structured.metadata);
  const bootstrapState = asDict(metadata.bootstrapState ?? structured.bootstrapState);
  const plan = asDict(input.plan);
  const planScope = asDict(plan.declaredScope ?? plan.declared_scope);
  const snapshot = asDict(input.planSnapshot);
  const record = asDict(snapshot.record);
  const recordScope = asDict(record.declaredScope ?? record.declared_scope);
  const recordPlan = asDict(record.plan);
  const recordPlanScope = asDict(recordPlan.declaredScope ?? recordPlan.declared_scope);

  return firstText([
    lastInput.project_root,
    lastInput.projectRoot,
    recordScope.projectRoot,
    recordScope.project_root,
    recordPlanScope.projectRoot,
    recordPlanScope.project_root,
    planScope.projectRoot,
    planScope.project_root,
    bootstrapState.projectRoot,
    bootstrapState.project_root,
  ]);
}

export function buildInitialPlanHeartbeatArgs(
  planValue: unknown,
  projectRoot: string,
): PlanWorkbenchDict {
  const plan = asDict(planValue);
  const planId = firstText([plan.planId, plan.plan_id]);
  if (!planId || !Array.isArray(plan.steps)) return {};
  return {
    plan_id: planId,
    ...(projectRoot ? { project_root: projectRoot } : {}),
    plan,
    status: 'active',
    completed_step_ids: [],
    unresolved_items: [],
    runtime_evidence: [{
      kind: 'workbench_checkpoint_bootstrap',
      summary: 'Workbench 在未找到检查点时补建初始状态；实际完成情况仍需 Agent 核验并通过 plan_heartbeat 回写',
    }],
  };
}
