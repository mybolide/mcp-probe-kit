import { okStructured } from '../lib/response.js';
import { recordPlanHeartbeat } from '../plans/plan-heartbeat.js';
import { handleToolError } from '../utils/error-handler.js';
import { getString, parseArgs } from '../utils/parseArgs.js';

export async function planHeartbeat(args: unknown) {
  try {
    const parsed = parseArgs<{
      plan_id?: string;
      project_root?: string;
      plan?: unknown;
      status?: 'active' | 'blocked' | 'cancelled';
      current_step_id?: string;
      completed_step_ids?: string[];
      skipped_steps?: unknown;
      unresolved_items?: string[];
      evidence?: unknown;
      last_verified_revision?: string;
    }>(args, {
      fieldAliases: {
        plan_id: ['planId'],
        project_root: ['projectRoot'],
        current_step_id: ['currentStepId'],
        completed_step_ids: ['completedStepIds'],
        skipped_steps: ['skippedSteps'],
        unresolved_items: ['unresolvedItems'],
        last_verified_revision: ['lastVerifiedRevision', 'revision'],
      },
    });
    const planId = getString(parsed.plan_id);
    if (!planId) throw new Error('缺少必填参数: plan_id');

    const { record, location } = await recordPlanHeartbeat({
      planId,
      projectRoot: getString(parsed.project_root) || undefined,
      plan: parsed.plan,
      status: parsed.status,
      currentStepId: getString(parsed.current_step_id) || undefined,
      completedStepIds: parsed.completed_step_ids,
      skippedSteps: parsed.skipped_steps,
      unresolvedItems: parsed.unresolved_items,
      evidence: parsed.evidence,
      lastVerifiedRevision:
        getString(parsed.last_verified_revision) || undefined,
    });

    return okStructured(
      `已记录 Plan Heartbeat: ${record.planId}\n状态: ${record.status}\n完成步骤: ${record.completedStepIds.length}/${record.plan.steps.length}\n检查点: ${location.statePath}`,
      {
        stored: true,
        planId: record.planId,
        status: record.status,
        currentStepId: record.currentStepId,
        completedStepIds: record.completedStepIds,
        skippedSteps: record.skippedSteps,
        unresolvedItems: record.unresolvedItems,
        evidenceCount: record.evidence.length,
        lastVerifiedRevision: record.lastVerifiedRevision,
        statePath: location.statePath,
        updatedAt: record.updatedAt,
      }
    );
  } catch (error) {
    return handleToolError(error, 'plan_heartbeat');
  }
}
