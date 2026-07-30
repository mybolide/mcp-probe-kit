import { okStructured } from '../lib/response.js';
import { resumePlan } from '../plans/plan-resume.js';
import { handleToolError } from '../utils/error-handler.js';
import { getString, parseArgs } from '../utils/parseArgs.js';

export async function resumePlanTool(args: unknown) {
  try {
    const parsed = parseArgs<{ plan_id?: string; project_root?: string }>(args, {
      fieldAliases: {
        plan_id: ['planId'],
        project_root: ['projectRoot'],
      },
    });
    const planId = getString(parsed.plan_id);
    if (!planId) throw new Error('缺少必填参数: plan_id');
    const result = await resumePlan(
      planId,
      getString(parsed.project_root) || undefined
    );
    if (!result.found) {
      return okStructured(result.nextAction, result);
    }

    const record = result.record!;
    return okStructured(
      [
        `已恢复 Plan: ${record.planId}`,
        `状态: ${record.status}`,
        `已完成: ${record.completedStepIds.length}/${record.plan.steps.length}`,
        `下一步: ${result.nextStepId ?? '无'}`,
        `动作: ${result.nextAction}`,
      ].join('\n'),
      {
        ...result,
        resumeContext: {
          currentStepId: result.nextStepId,
          completedStepIds: record.completedStepIds,
          unresolvedItems: record.unresolvedItems,
          lastVerifiedRevision: record.lastVerifiedRevision,
        },
      }
    );
  } catch (error) {
    return handleToolError(error, 'resume_plan');
  }
}
