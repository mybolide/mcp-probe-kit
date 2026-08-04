import { parseArgs, getString } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { handleToolError } from '../utils/error-handler.js';
import { buildDevWorkflow, renderWorkflowMarkdown } from '../lib/dev-workflow.js';
import { ensureMcpProbeKitBootstrap } from '../lib/workflow-skill-installer.js';
import { resolveWorkspaceRoot } from '../lib/workspace-root.js';
import { isMemoryEnabled } from '../lib/memory-config.js';
import type { ToolExecutionContext } from '../lib/tool-execution-context.js';

const SUPPORTED_SCENARIO_INPUTS = new Set([
  'auto',
  'feature',
  'bugfix',
  'bug',
  'ui',
  'product',
  'prd',
  'explore',
  'commit',
  'review',
  'refactor',
  'onboard',
  'spec',
  'memory',
]);

function normalizeScenarioInput(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'auto';
  if (typeof value !== 'string') {
    throw new Error(`参数 scenario 必须是字符串，当前类型: ${typeof value}`);
  }
  const scenario = value.trim().toLowerCase();
  if (!scenario) return 'auto';
  if (!SUPPORTED_SCENARIO_INPUTS.has(scenario)) {
    throw new Error(
      `参数 scenario 不支持: ${value}。可选值: ${[...SUPPORTED_SCENARIO_INPUTS].join(', ')}`,
    );
  }
  return scenario;
}

/**
 * workflow — 可选的首工具路由（只读指南）
 *
 * 仅在 Agent 阅读 Skill 后仍不确定首工具时，根据完整任务摘要返回建议。
 * 它不执行工具、不维护任务生命周期，也不要求明确的单项能力先经过 workflow。
 */
export async function workflow(args: unknown, context?: ToolExecutionContext) {
  try {
    const parsed = parseArgs<{
      intent?: string;
      input?: string;
      scenario?: string;
      description?: string;
      project_root?: string;
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
        project_root: ['projectRoot', 'project_path', 'projectPath', 'root', '项目路径', '项目根目录'],
      },
    });

    const intent =
      getString(parsed.intent) ||
      getString(parsed.input) ||
      getString(parsed.description);
    const scenario = normalizeScenarioInput(parsed.scenario);

    const plan = buildDevWorkflow(intent, { scenario, memoryAvailable: isMemoryEnabled() });
    const text = renderWorkflowMarkdown(plan, intent);
    const projectRoot = resolveWorkspaceRoot(getString(parsed.project_root));
    const bootstrap = context?.bootstrap ?? ensureMcpProbeKitBootstrap(projectRoot);

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
      handles: plan.firstTool
        ? {
            next_tool: plan.firstTool,
            next_args: plan.firstToolArgsHint ?? {},
          }
        : {
            next_tool: null,
            next_args: {},
            next_action: 'clarify_or_configure',
          },
    });
  } catch (error) {
    return handleToolError(error, 'workflow');
  }
}
