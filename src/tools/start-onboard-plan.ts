import {
  buildDelegatedPlanContract,
  createDelegatedPlanId,
  type DelegatedPlanContract,
  type DelegatedPlanStep,
} from '../lib/delegated-plan-contract.js';
import { buildMemoryPlanStep } from '../lib/memory-orchestration.js';
import type { OnboardingReport, WorkflowStep } from '../schemas/structured-output.js';

export interface BuildOnboardPlanInput {
  projectRoot: string;
  docsDir: string;
  memoryEnabled: boolean;
  memoryRecallSteps: DelegatedPlanStep[];
  skillBridgeStep: DelegatedPlanStep;
}

function chainSteps(
  steps: DelegatedPlanStep[],
  initialDependency?: string,
): DelegatedPlanStep[] {
  let dependency = initialDependency;
  return steps.map((step) => {
    const result = dependency && (!step.dependsOn || step.dependsOn.length === 0)
      ? { ...step, dependsOn: [dependency] }
      : { ...step };
    dependency = step.id;
    return result;
  });
}

export function buildOnboardPlan(input: BuildOnboardPlanInput): DelegatedPlanContract {
  const projectRoot = input.projectRoot.replace(/\\/g, '/');
  const docsDir = input.docsDir.replace(/\\/g, '/');
  const projectContextPath = `${docsDir}/project-context.md`;
  const quickstartPath = `${docsDir}/onboarding/quickstart.md`;
  const navigationPath = `${docsDir}/onboarding/project-navigation.md`;
  const recallSteps = chainSteps(input.memoryRecallSteps);
  const lastRecallId = recallSteps.at(-1)?.id;
  const skillBridgeStep = lastRecallId
    && (!input.skillBridgeStep.dependsOn || input.skillBridgeStep.dependsOn.length === 0)
    ? { ...input.skillBridgeStep, dependsOn: [lastRecallId] }
    : { ...input.skillBridgeStep };
  const memoryStep = input.memoryEnabled
    ? [{
        ...buildMemoryPlanStep('default'),
        dependsOn: ['acceptance'],
      } as DelegatedPlanStep]
    : [];

  return buildDelegatedPlanContract({
    planId: createDelegatedPlanId('onboard', projectRoot),
    workflow: 'onboard',
    workflowVersion: '4.0.0',
    objective: `建立可验证、可恢复的项目上手资料：${projectRoot}`,
    declaredScope: {
      projectRoot,
      docsDir,
      projectContextPath,
      quickstartPath,
      navigationPath,
      readOnlyAnalysis: true,
    },
    requiredEvidenceKinds: [],
    qualityGates: [
      'onboard-context-ready',
      'onboard-command-verified',
      'onboard-navigation-ready',
    ],
    globalRules: [
      '所有项目结论必须来自当前仓库文件、配置、代码图谱或真实命令结果，不得根据技术栈名称猜测',
      '区分已验证事实、基于证据的推断和仍未知事项',
      '不得修改业务代码、安装依赖或启动长期驻留服务，除非用户另行明确授权',
      '命令验证必须记录真实命令、工作目录、退出码和限制；未运行的命令只能标记为候选',
      '首次执行前建立 plan_heartbeat，之后每完成、跳过或阻断一步立即累计回写',
    ],
    completionCriteria: [
      '项目上下文已存在并指向当前项目根目录',
      '核心入口、主要模块、关键调用链和数据/状态流已形成可导航摘要',
      '安装、开发、构建、测试和检查命令均从真实项目配置提取，并完成至少一个安全验证或记录不能执行的原因',
      '关键文件、配置、环境变量入口和已知风险已形成清单',
      'quickstart 与 project-navigation 文档能够让新 Agent 在无旧对话时继续工作',
      '三个 onboarding quality gates 均有 acceptanceResults 证据',
    ],
    memoryPolicy: {
      recallBeforeExecution: input.memoryEnabled,
      extractAfterValidation: input.memoryEnabled,
    },
    steps: [
      ...recallSteps,
      skillBridgeStep,
      {
        id: 'context',
        type: 'tool',
        tool: 'init_project_context',
        dependsOn: [skillBridgeStep.id],
        args: {
          docs_dir: docsDir,
          project_root: projectRoot,
        },
        expectedOutputs: [projectContextPath],
        completionEvidence: ['项目上下文和 layout manifest 指向当前真实项目根目录'],
        outputs: [projectContextPath],
      },
      {
        id: 'code-map',
        type: 'tool',
        tool: 'code_insight',
        dependsOn: ['context'],
        args: {
          mode: 'context',
          query: '项目整体架构 核心入口 主要模块 关键调用链 数据流 状态流 外部依赖',
          project_root: projectRoot,
          include_tests: true,
          include_content: false,
          save_to_docs: false,
        },
        expectedOutputs: ['图谱或明确 degraded 的本地源码证据'],
        completionEvidence: ['记录 graph status、证据来源、歧义和未知项'],
        outputs: [],
      },
      {
        id: 'manifest-inventory',
        type: 'agent_action',
        action: 'inspect_project_manifests_and_runtime_configuration',
        dependsOn: ['code-map'],
        requiredInputs: [
          'README、AGENTS、Skill、package/build manifests、锁文件和主要配置',
          '环境变量示例、容器/进程配置和 CI 文件（存在时）',
        ],
        expectedOutputs: ['技术栈、包管理器、运行时、构建/测试工具、环境配置和外部服务清单'],
        completionEvidence: ['每项结论包含文件路径或配置键证据'],
        outputs: [],
      },
      {
        id: 'entrypoints',
        type: 'agent_action',
        action: 'map_entrypoints_modules_and_runtime_flows',
        dependsOn: ['manifest-inventory'],
        requiredInputs: ['code_insight 结果', '项目 manifests 和源码目录'],
        expectedOutputs: ['入口、模块职责、依赖方向、关键流程、数据/状态所有权和外部边界摘要'],
        completionEvidence: ['关键结论可回链到文件、符号或图谱证据'],
        outputs: [],
      },
      {
        id: 'commands',
        type: 'agent_action',
        action: 'extract_and_safely_verify_project_commands',
        dependsOn: ['entrypoints'],
        requiredInputs: ['package scripts、Makefile、任务文件、README、CI 和项目配置'],
        expectedOutputs: ['安装、开发、构建、测试、Lint、类型检查和常见维护命令'],
        completionEvidence: [
          '命令来源文件和工作目录',
          '至少一个安全命令的真实退出码，或无法执行的明确原因',
        ],
        qualityGates: ['onboard-command-verified'],
        outputs: [],
        note: '不得自动安装依赖、启动长期服务或执行破坏性命令',
      },
      {
        id: 'risks',
        type: 'agent_action',
        action: 'identify_project_constraints_and_known_risks',
        dependsOn: ['commands'],
        requiredInputs: ['上下文、图谱、配置、测试结果、TODO/FIXME 和文档'],
        expectedOutputs: ['架构约束、兼容要求、生成文件、危险操作、已知问题和证据缺口清单'],
        completionEvidence: ['风险按事实/推断/未知分类，并提供证据位置'],
        outputs: [],
      },
      {
        id: 'documentation',
        type: 'agent_action',
        action: 'write_onboarding_quickstart_and_navigation',
        dependsOn: ['risks'],
        requiredInputs: ['前述全部事实、命令、入口、关键文件和风险'],
        expectedOutputs: [quickstartPath, navigationPath, projectContextPath],
        completionEvidence: ['文档只包含已验证事实，未知项明确标记且项目上下文链接完整'],
        outputs: [quickstartPath, navigationPath, projectContextPath],
      },
      {
        id: 'acceptance',
        type: 'agent_action',
        action: 'verify_onboarding_artifacts',
        dependsOn: ['documentation'],
        requiredInputs: [quickstartPath, navigationPath, projectContextPath],
        expectedOutputs: ['项目上下文、命令和导航三项验收结果'],
        completionEvidence: [
          'acceptanceResults 包含 gateId=onboard-context-ready',
          'acceptanceResults 包含 gateId=onboard-command-verified',
          'acceptanceResults 包含 gateId=onboard-navigation-ready',
        ],
        qualityGates: [
          'onboard-context-ready',
          'onboard-command-verified',
          'onboard-navigation-ready',
        ],
        outputs: [],
      },
      ...memoryStep,
    ],
  });
}

const STEP_LABELS: Record<string, string> = {
  'recall-memory': '召回项目经验',
  'skill-bridge': '读取项目 Skill',
  context: '建立项目上下文',
  'code-map': '重建代码图谱',
  'manifest-inventory': '检查清单与运行配置',
  entrypoints: '梳理入口、模块与关键流程',
  commands: '提取并验证项目命令',
  risks: '识别约束与已知风险',
  documentation: '生成快速开始与导航',
  acceptance: '验收上手资料',
  'prepare-memory': '准备项目知识候选',
};

function workflowSteps(plan: DelegatedPlanContract): WorkflowStep[] {
  return plan.steps.map((step) => ({
    name: STEP_LABELS[step.id] ?? step.action ?? step.tool ?? step.id,
    status: 'pending',
    description: step.note
      ?? (step.expectedOutputs?.length ? `预期输出：${step.expectedOutputs.join('；')}` : '待执行'),
  }));
}

export function buildOnboardingReport(
  plan: DelegatedPlanContract,
  projectRoot: string,
  docsDir: string,
): OnboardingReport {
  return {
    summary: `项目上手工作流：${projectRoot}`,
    status: 'pending',
    steps: workflowSteps(plan),
    artifacts: [],
    nextSteps: [
      `调用 plan_heartbeat，传入 plan_id=${plan.planId}、完整 metadata.plan 与 project_root=${projectRoot}`,
      ...plan.steps.map((step) => `${step.tool ? `调用 ${step.tool}` : `由 Agent 执行 ${step.action ?? step.id}`}，随后累计回写 plan_heartbeat`),
      `调用 converge --plan_id=${plan.planId} --project_root=${projectRoot}`,
    ],
    projectSummary: {
      name: '待基于项目 manifest 确认',
      description: '待基于 README 和源码确认',
      techStack: [],
      architecture: '待基于 code_insight 和当前源码确认',
    },
    architectureNotes: '未执行前不推断项目架构；执行后应区分事实、推断和未知项。',
    quickstart: {
      setup: [`阅读 ${docsDir}/onboarding/quickstart.md`],
      commonTasks: [],
    },
    keyFiles: [],
    metadata: { plan },
  };
}
