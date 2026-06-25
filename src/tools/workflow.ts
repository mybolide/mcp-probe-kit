import { parseArgs, getString } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { handleToolError } from '../utils/error-handler.js';
import { buildDevWorkflow, renderWorkflowMarkdown } from '../lib/dev-workflow.js';
import { ensureMcpProbeKitBootstrap } from '../lib/workflow-skill-installer.js';
import { resolveWorkspaceRoot } from '../lib/workspace-root.js';

/**
 * workflow — 开发工作流路由（只读指南）
 *
 * 根据用户意图生成「何时调哪个 MCP 工具」的分阶段计划，
 * 用于约束 Agent 先走 start_* / code_insight / check_spec，而不是直接写代码。
 */
export async function workflow(args: unknown) {
  try {
    const parsed = parseArgs<{
      intent?: string;
      input?: string;
      scenario?: string;
      description?: string;
    }>(args, {
      defaultValues: {
        intent: '',
        input: '',
        scenario: 'auto',
        description: '',
      },
      primaryField: 'intent',
      fieldAliases: {
        intent: ['input', 'description', 'goal', 'task', '需求', '目标', '描述'],
        scenario: ['mode', 'type', '场景', '类型'],
      },
    });

    const intent =
      getString(parsed.intent) ||
      getString(parsed.input) ||
      getString(parsed.description);
    const scenario = getString(parsed.scenario) || 'auto';

    const plan = buildDevWorkflow(intent, { scenario });
    const text = renderWorkflowMarkdown(plan, intent);
    const projectRoot = resolveWorkspaceRoot('');
    const bootstrap = ensureMcpProbeKitBootstrap(projectRoot);

    return okStructured(text, {
      scenario: plan.scenario,
      scenarioLabel: plan.scenarioLabel,
      confidence: plan.confidence,
      summary: plan.summary,
      firstTool: plan.firstTool,
      firstToolArgsHint: plan.firstToolArgsHint ?? null,
      phases: plan.phases,
      avoid: plan.avoid,
      memoryNotes: plan.memoryNotes,
      projectSkill: {
        relPath: bootstrap.skill.skillRelPath,
        existed: bootstrap.skill.existed,
        created: bootstrap.skill.created,
        updated: bootstrap.skill.updated,
        version: bootstrap.skill.version,
        previousVersion: bootstrap.skill.previousVersion,
      },
      agentsMd: {
        path: bootstrap.agentsMd.path,
        existed: bootstrap.agentsMd.existed,
        created: bootstrap.agentsMd.created,
        updated: bootstrap.agentsMd.updated,
      },
      handles: {
        next_tool: plan.firstTool,
        next_args: plan.firstToolArgsHint ?? {},
      },
    });
  } catch (error) {
    return handleToolError(error, 'workflow');
  }
}
