import { parseArgs, getString } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { attachHandles } from '../lib/handles.js';
import { renderOrchestrationHeader } from '../lib/orchestration-guidance.js';
import {
  renderDelegatedPlanStateProtocol,
  renderDelegatedPlanSteps,
} from '../lib/delegated-plan-renderer.js';
import { OnboardingReportSchema } from '../schemas/structured-output.js';
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from '../lib/tool-execution-context.js';
import {
  buildOrchestrationHandles,
  loadMemoryInjectionContext,
  renderMemoryGuideSection,
} from '../lib/memory-orchestration.js';
import {
  buildProjectRootRetryHint,
  isLikelyProjectNamedRelativePath,
  resolveWorkspaceRoot,
} from '../lib/workspace-root.js';
import type { DelegatedPlanStep } from '../lib/delegated-plan-contract.js';
import { buildOnboardPlan, buildOnboardingReport } from './start-onboard-plan.js';

function normalizeDocsDir(value: string): string {
  const normalized = (value || 'docs').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error('docs_dir 必须是项目根目录下的相对路径');
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('docs_dir 不能包含空路径、. 或 ..');
  }
  return normalized;
}

export async function startOnboard(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, 'start_onboard 已取消');
    await reportToolProgress(context, 10, 'start_onboard: 解析参数');

    const parsed = parseArgs<{
      project_path?: string;
      project_root?: string;
      docs_dir?: string;
    }>(args, {
      defaultValues: { project_path: '.', docs_dir: 'docs' },
      primaryField: 'project_path',
      fieldAliases: {
        project_path: ['project_root', 'projectRoot', 'path', 'dir', 'directory', '路径', '项目路径'],
        docs_dir: ['docs', 'output', '目录', '文档目录'],
      },
    });

    const rawProjectRoot = getString(parsed.project_root)
      || getString(parsed.project_path)
      || '.';
    if (isLikelyProjectNamedRelativePath(rawProjectRoot)) {
      return {
        content: [{
          type: 'text',
          text: `拒绝执行项目上手编排：project_root 不能传带项目名的半相对路径，例如 ${rawProjectRoot}。请改为传项目根目录绝对路径。`,
        }],
        isError: true,
        structuredContent: {
          error_code: 'INVALID_PROJECT_ROOT',
          rejected_project_root: rawProjectRoot,
          retry_hint: buildProjectRootRetryHint(rawProjectRoot),
        },
      };
    }

    const projectRoot = resolveWorkspaceRoot(rawProjectRoot).replace(/\\/g, '/');
    const docsDir = normalizeDocsDir(getString(parsed.docs_dir) || 'docs');
    const skillBridgeStep: DelegatedPlanStep = {
      id: 'skill-bridge',
      type: 'agent_action',
      action: 'read_project_instructions_and_local_skills',
      requiredInputs: ['AGENTS.md、项目 Skill、README 和仓库级开发约束（存在时）'],
      expectedOutputs: ['当前项目必须遵守的命令、目录、测试、生成文件和禁止事项清单'],
      completionEvidence: ['记录实际读取的指令文件路径；不存在时明确记录'],
      outputs: [],
      note: '使用 Agent 宿主文件能力读取，不假设项目一定安装专用 Skill',
    };
    const memoryContext = await loadMemoryInjectionContext(
      `项目上手 架构 入口 构建 测试 运行命令 已知问题 ${projectRoot}`,
      'default',
    );
    const memoryRecallSteps: DelegatedPlanStep[] = memoryContext.enabled
      ? [{
          id: 'recall-memory',
          type: 'tool',
          tool: 'search_memory',
          args: {
            query: `项目上手 架构 入口 构建 测试 运行命令 已知问题 ${projectRoot}`,
            limit: 5,
          },
          expectedOutputs: ['与当前项目或技术栈相关的历史决策、坑和运行经验'],
          completionEvidence: ['记录采用、拒绝和需要当前仓库复核的记忆'],
          outputs: [],
          note: 'Memory 只作为候选经验；所有结论仍需用当前仓库事实复核',
        }]
      : [];
    const plan = buildOnboardPlan({
      projectRoot,
      docsDir,
      memoryEnabled: memoryContext.enabled,
      memoryRecallSteps,
      skillBridgeStep,
    });

    throwIfAborted(context?.signal, 'start_onboard 已取消');
    await reportToolProgress(context, 85, 'start_onboard: 生成完整上手计划');

    const header = renderOrchestrationHeader({
      tool: 'start_onboard',
      goal: `建立项目心智模型与可验证快速开始：${projectRoot}`,
      tasks: [
        '按 delegated plan 顺序建立上下文、图谱、入口、命令和风险清单',
        '生成可让新 Agent 脱离旧对话继续工作的快速开始与项目导航',
      ],
    });
    const guide = `${header}${renderMemoryGuideSection(memoryContext)}
# 项目上手交付

## 职责边界

- MCP 提供项目上下文、代码证据、计划和状态能力。
- Agent 负责读取真实文件、运行安全命令、整理文档和记录证据。
- 未执行的命令不得写成“已验证”；不得自动安装依赖或启动长期服务。

${renderDelegatedPlanStateProtocol({ planId: plan.planId, projectRoot })}

## 执行步骤

${renderDelegatedPlanSteps(plan.steps)}`;
    const report = buildOnboardingReport(plan, projectRoot, docsDir);

    await reportToolProgress(context, 95, 'start_onboard: 输出已生成');
    return okStructured(
      guide,
      attachHandles(report, buildOrchestrationHandles(memoryContext)),
      {
        schema: OnboardingReportSchema,
        note: 'Agent 应按计划执行并将真实项目事实、命令结果和文档产物累计写入 Plan 状态。',
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `❌ 项目上手编排失败: ${message}` }],
      isError: true,
    };
  }
}
