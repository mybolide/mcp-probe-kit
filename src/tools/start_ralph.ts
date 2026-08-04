import { okStructured } from '../lib/response.js';
import { attachHandles } from '../lib/handles.js';
import { renderOrchestrationHeader } from '../lib/orchestration-guidance.js';
import {
  renderDelegatedPlanStateProtocol,
  renderDelegatedPlanSteps,
} from '../lib/delegated-plan-renderer.js';
import {
  buildOrchestrationHandles,
  loadMemoryInjectionContext,
  renderMemoryGuideSection,
} from '../lib/memory-orchestration.js';
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from '../lib/tool-execution-context.js';
import type { DelegatedPlanStep } from '../lib/delegated-plan-contract.js';
import { RalphLoopReportSchema } from '../schemas/structured-output.js';
import { normalizeRalphConfig } from './start-ralph-config.js';
import { generateRalphFiles } from './start-ralph-templates.js';
import {
  buildRalphPlan,
  buildRalphReport,
  createRalphPlanId,
} from './start-ralph-plan.js';

function renderGeneratedFiles(files: ReturnType<typeof generateRalphFiles>): string {
  const safeLanguage = files.safeScriptPath.endsWith('.ps1') ? 'powershell' : 'bash';
  return `## Generated Control Files

### .ralph/PROMPT.md

\`\`\`markdown
${files.prompt}
\`\`\`

### .ralph/@fix_plan.md

\`\`\`markdown
${files.fixPlan}
\`\`\`

### .ralph/PROGRESS.md

\`\`\`markdown
${files.progress}
\`\`\`

### ${files.safeScriptPath}

\`\`\`${safeLanguage}
${files.safeScript}
\`\`\`

### ${files.normalScriptPath}

\`\`\`bash
${files.normalScript}
\`\`\``;
}

export async function startRalph(args: unknown, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, 'start_ralph 已取消');
    await reportToolProgress(context, 10, 'start_ralph: 解析有界循环配置');

    const normalized = normalizeRalphConfig(args);
    if (!normalized.ok) return normalized.response as any;
    const config = normalized.value;
    const planId = createRalphPlanId(config);
    const files = generateRalphFiles(config, planId);
    const memoryContext = await loadMemoryInjectionContext(
      `有界循环开发 小步修改 测试失败 卡死 停止条件 ${config.goal}`,
      'default',
    );
    const memoryRecallSteps: DelegatedPlanStep[] = memoryContext.enabled
      ? [{
          id: 'recall-memory',
          type: 'tool',
          tool: 'search_memory',
          args: {
            query: `有界循环开发 小步修改 测试失败 卡死 停止条件 ${config.goal}`,
            limit: 5,
          },
          expectedOutputs: ['相关实现模式、失败方案、回归经验和停止策略'],
          completionEvidence: ['记录采用、拒绝和必须用当前仓库复核的记忆'],
          outputs: [],
          note: '历史经验只作为候选；不得替代当前仓库基线和真实测试',
        }]
      : [];

    const plan = buildRalphPlan({
      config,
      files,
      memoryEnabled: memoryContext.enabled,
      memoryRecallSteps,
    });
    const report = buildRalphReport(plan, config, files);

    throwIfAborted(context?.signal, 'start_ralph 已取消');
    await reportToolProgress(context, 80, 'start_ralph: 生成有界轮次计划与前台辅助模板');

    const header = renderOrchestrationHeader({
      tool: 'start_ralph',
      goal: `有界循环开发：${config.goal}`,
      tasks: [
        `最多 ${config.maxIterations} 轮、${config.maxMinutes} 分钟`,
        '每轮一个聚焦改动、真实测试、diff/revision 证据和 plan_heartbeat',
        '最终测试、code_review、按需 architecture drift 和 converge',
      ],
      notes: [
        `模式：${config.mode}`,
        '工具只生成 Plan 和模板，不启动脚本、不创建后台进程',
      ],
    });
    const guidance = `${header}${renderMemoryGuideSection(memoryContext)}
# Ralph 有界循环交付

${files.guide}

${renderDelegatedPlanStateProtocol({
  planId: plan.planId,
  projectRoot: config.projectRoot,
})}

## Formal Delegated Plan

${renderDelegatedPlanSteps(plan.steps)}

${renderGeneratedFiles(files)}

## Execution Boundary

- Agent may write the generated control files with normal host file tools.
- Running a helper script requires an explicit foreground action by the user or Agent.
- Every actual round must update the managed Plan through \`plan_heartbeat\`.
- A safety stop is not success. Only real final evidence may allow \`converge passed=true\`.`;

    await reportToolProgress(context, 95, 'start_ralph: 输出已生成');
    return okStructured(
      guidance,
      attachHandles(report, buildOrchestrationHandles(memoryContext)),
      {
        schema: RalphLoopReportSchema,
        note: 'start_ralph 只生成有界 Plan、控制文件模板和可选前台脚本；不执行循环或后台任务。',
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `start_ralph 生成失败：${message}` }],
      isError: true,
      structuredContent: { error_code: 'START_RALPH_FAILED', message },
    };
  }
}
