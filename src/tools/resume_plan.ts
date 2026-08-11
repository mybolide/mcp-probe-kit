import { okStructured } from '../lib/response.js';
import { resumePlan } from '../plans/plan-resume.js';
import { JsonPlanStore } from '../plans/plan-store.js';
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
    const projectRoot = getString(parsed.project_root) || undefined;
    const explicitPlanId = getString(parsed.plan_id);
    const latestRecord = explicitPlanId
      ? null
      : await new JsonPlanStore(projectRoot).readLatestResumable();
    const planId = explicitPlanId || latestRecord?.planId || '';
    if (!planId) {
      return okStructured(
        '当前项目未找到可恢复的 active/blocked Plan；请先建立 plan_heartbeat 检查点。',
        {
          found: false,
          readyStepIds: [],
          blockedSteps: [],
          nextAction: '未找到可恢复的 active/blocked Plan；请先建立 plan_heartbeat 检查点',
          selection: 'latest-resumable',
          mustContinue: false,
        },
      );
    }
    const result = await resumePlan(planId, projectRoot);
    const selection = explicitPlanId ? 'explicit' : 'latest-resumable';
    if (!result.found) {
      return okStructured(result.nextAction, {
        ...result,
        selection,
        mustContinue: false,
      });
    }

    const record = result.record!;
    const nextStep = result.nextStepId
      ? record.plan.steps.find((step) => step.id === result.nextStepId)
      : undefined;
    const nextTool = nextStep && typeof nextStep.tool === 'string'
      ? nextStep.tool
      : undefined;
    const nextArgs = nextStep && nextStep.args && typeof nextStep.args === 'object'
      ? nextStep.args
      : {};
    const nextAgentAction = nextStep && typeof nextStep.action === 'string'
      ? nextStep.action
      : undefined;
    const mustContinue = Boolean(result.nextStepId);
    const executionLine = nextTool
      ? `立即调用工具: ${nextTool}，参数: ${JSON.stringify(nextArgs)}`
      : nextAgentAction
        ? `立即执行 Agent 动作: ${nextAgentAction}`
        : mustContinue
          ? `立即执行步骤: ${result.nextStepId}`
          : '当前没有可执行步骤';

    return okStructured(
      [
        `已恢复 Plan: ${record.planId}`,
        `状态: ${record.status}`,
        `已完成: ${record.completedStepIds.length}/${record.plan.steps.length}`,
        `下一步: ${result.nextStepId ?? '无'}`,
        executionLine,
        `动作: ${result.nextAction}`,
        ...(mustContinue
          ? [
              '恢复 Plan 不是本轮任务完成。禁止只汇报“已恢复”后停止。',
              '完成、跳过或阻断下一步后立即调用 plan_heartbeat，并继续推进后续可执行步骤；只有 blocked、cancelled 或 converge 通过时才能停。',
            ]
          : []),
      ].join('\n'),
      {
        ...result,
        selection,
        mustContinue,
        nextStep: nextStep ?? null,
        nextTool: nextTool ?? null,
        nextArgs,
        nextAgentAction: nextAgentAction ?? null,
        continuationContract: {
          stopAfterResume: false,
          heartbeatAfterEveryStep: true,
          continueUntil: ['blocked', 'cancelled', 'converged'],
          prohibitResumeOnlyReport: true,
        },
        handles: nextTool
          ? { next_tool: nextTool, next_args: nextArgs }
          : {},
        resumeContext: {
          currentStepId: result.nextStepId,
          completedStepIds: record.completedStepIds,
          unresolvedItems: record.unresolvedItems,
          lastVerifiedRevision: record.lastVerifiedRevision,
          declaredScope: record.declaredScope,
          artifacts: record.artifacts,
          memoryCandidates: record.memoryCandidates,
          architectureCandidates: record.architectureCandidates,
          acceptanceResults: record.acceptanceResults,
          runtimeEvidence: record.runtimeEvidence,
        },
      }
    );
  } catch (error) {
    return handleToolError(error, 'resume_plan');
  }
}
