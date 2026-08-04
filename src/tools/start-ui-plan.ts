import {
  buildDelegatedPlanContract,
  createDelegatedPlanId,
  type DelegatedPlanContract,
  type DelegatedPlanStep,
} from '../lib/delegated-plan-contract.js';
import { buildMemoryPlanStep } from '../lib/memory-orchestration.js';
import { isShadcnStack } from '../lib/shadcn-ui.js';
import type { VisualDirectionContract } from '../utils/visual-direction-engine.js';

export type UiPlanMode = 'loop' | 'auto' | 'manual';

export interface BuildUiPlanInput {
  mode: UiPlanMode;
  description: string;
  framework: string;
  templateName: string;
  projectRoot: string;
  visualContract: VisualDirectionContract;
  reviewMaxRounds: number;
  designSystemArgs: Record<string, unknown>;
  memoryEnabled: boolean;
  memoryRecallSteps: DelegatedPlanStep[];
  skillBridgeStep: DelegatedPlanStep;
  requirementSteps?: DelegatedPlanStep[];
}

function chainSteps(
  steps: DelegatedPlanStep[],
  initialDependency?: string,
): DelegatedPlanStep[] {
  let dependency = initialDependency;
  return steps.map((step) => {
    const chained = dependency && (!step.dependsOn || step.dependsOn.length === 0)
      ? { ...step, dependsOn: [dependency] }
      : { ...step };
    dependency = step.id;
    return chained;
  });
}

function buildShadcnComponentsStep(
  description: string,
  framework: string,
): DelegatedPlanStep[] {
  if (!isShadcnStack(framework)) return [];
  return [{
    id: 'shadcn-components',
    type: 'tool',
    tool: 'ui_search',
    dependsOn: ['save-structure'],
    when: '页面结构已经锁定后，为 React/Next 实现选择基础组件',
    args: {
      mode: 'search',
      query: `${description} table drawer sheet select button tooltip form`,
      category: 'shadcn-components',
      stack: framework,
      limit: 8,
    },
    expectedOutputs: ['与页面结构匹配的组件原语候选'],
    completionEvidence: ['记录最终采用和拒绝的组件原语'],
    outputs: [],
    note: '只复用组件原语，不使用整页 block 覆盖 page-structure.json 或视觉方向契约',
  }];
}

function buildUiDeliverySteps(input: BuildUiPlanInput): DelegatedPlanStep[] {
  const {
    description,
    framework,
    templateName,
    projectRoot,
    visualContract,
    reviewMaxRounds,
  } = input;
  const reviewRoot = `artifacts/ui-review/${templateName}`;
  const desktopScreenshot = `${reviewRoot}/desktop-1440x900.png`;
  const mobileScreenshot = `${reviewRoot}/mobile-390x844.png`;
  const reviewReport = `${reviewRoot}/visual-review.json`;
  const renderDependency = isShadcnStack(framework)
    ? 'shadcn-components'
    : 'save-structure';

  return [
    {
      id: 'structure',
      type: 'tool',
      tool: 'ui_search',
      dependsOn: ['catalog'],
      args: {
        mode: 'structure',
        query: description,
        screen_type: visualContract.objective.screenType,
        density: visualContract.objective.density,
        limit: 3,
      },
      expectedOutputs: ['页面信息架构、任务流和响应式结构候选'],
      completionEvidence: ['记录选定结构及未采用候选的理由'],
      outputs: [],
      note: '选择信息架构和任务流，不搜索或套用表面风格标签',
    },
    {
      id: 'save-structure',
      type: 'agent_action',
      action: 'save_selected_page_structure',
      dependsOn: ['structure'],
      requiredInputs: ['ui_search structure 模式返回的候选', 'docs/design-system.json'],
      expectedOutputs: ['docs/ui/page-structure.json'],
      completionEvidence: ['页面区域、主任务流、响应式变化和禁用项已落盘'],
      outputs: ['docs/ui/page-structure.json'],
      note: '只保留与当前任务匹配的区域、流程、响应式和禁用项',
    },
    ...buildShadcnComponentsStep(description, framework),
    {
      id: 'render',
      type: 'agent_action',
      action: 'implement_key_ui_screen',
      dependsOn: [renderDependency],
      requiredInputs: [
        'docs/design-system.json',
        'docs/ui/page-structure.json',
        `目标框架：${framework}`,
        '现有组件和真实业务内容',
      ],
      expectedOutputs: ['可运行的关键页面代码、必要交互和状态实现'],
      completionEvidence: ['实际变更文件', '页面能够在目标项目中启动并访问'],
      outputs: [],
      note: '先完成一个关键页面，不得先批量复制到全部页面',
    },
    {
      id: 'capture-desktop',
      type: 'agent_action',
      action: 'capture_ui_screenshot',
      dependsOn: ['render'],
      requiredInputs: ['已启动的真实页面', 'viewport=1440x900', '稳定的测试数据和页面状态'],
      expectedOutputs: [desktopScreenshot],
      completionEvidence: ['截图来自本轮真实构建和运行结果'],
      outputs: [desktopScreenshot],
      note: '必须截取真实渲染结果，不接受设计稿、代码推断或历史截图',
    },
    {
      id: 'capture-mobile',
      type: 'agent_action',
      action: 'capture_ui_screenshot',
      dependsOn: ['render'],
      requiredInputs: ['已启动的真实页面', 'viewport=390x844', '与桌面图相同的核心任务状态'],
      expectedOutputs: [mobileScreenshot],
      completionEvidence: ['移动端主任务流和关键操作均可见且可用'],
      outputs: [mobileScreenshot],
      note: '移动端必须重新组织任务流，不得仅缩小桌面布局',
    },
    {
      id: 'visual-review',
      type: 'agent_action',
      action: 'score_ui_screenshots',
      dependsOn: ['capture-desktop', 'capture-mobile'],
      requiredInputs: [
        desktopScreenshot,
        mobileScreenshot,
        'docs/design-system.json 中的 acceptance.dimensions、avoid 和 blockingFailures',
      ],
      expectedOutputs: [reviewReport],
      completionEvidence: ['7 个维度评分、阻断项和具体视觉问题均有截图证据'],
      outputs: [reviewReport],
      note: `代码规范不能替代截图评审，目标 ${visualContract.acceptance.targetScore}/10`,
    },
    {
      id: 'visual-iterate',
      type: 'agent_action',
      action: 'iterate_ui_from_visual_review',
      dependsOn: ['visual-review'],
      when: `总分低于 ${visualContract.acceptance.targetScore}/10、任一阻断项命中或任一维度低于 7.5`,
      requiredInputs: [reviewReport, '页面源码', 'docs/design-system.json', 'docs/ui/page-structure.json'],
      expectedOutputs: ['修正后的关键页面', desktopScreenshot, mobileScreenshot, reviewReport],
      completionEvidence: ['每轮均基于新截图重新评分'],
      outputs: [desktopScreenshot, mobileScreenshot, reviewReport],
      note: `最多 ${reviewMaxRounds} 轮。每轮必须基于新截图重新评分，禁止只改评分文本或伪造通过。`,
    },
    {
      id: 'visual-acceptance',
      type: 'agent_action',
      action: 'verify_visual_acceptance',
      dependsOn: ['visual-iterate'],
      requiredInputs: [desktopScreenshot, mobileScreenshot, reviewReport],
      expectedOutputs: ['visual passed=true 或明确列出仍未通过的原因'],
      completionEvidence: ['acceptanceResults 包含 gateId=ui-visual-acceptance'],
      qualityGates: ['ui-visual-acceptance', 'ui-responsive-acceptance'],
      outputs: [],
      note: `只有总分 ≥ ${visualContract.acceptance.targetScore}/10、无阻断项且截图为本轮真实结果时才允许通过`,
    },
    {
      id: 'state-acceptance',
      type: 'agent_action',
      action: 'verify_ui_states_and_accessibility',
      dependsOn: ['visual-acceptance'],
      requiredInputs: ['真实页面', '页面需求', 'docs/ui/page-structure.json'],
      expectedOutputs: ['加载、空态、错误、无权限和核心交互状态验收结果'],
      completionEvidence: [
        'acceptanceResults 包含 gateId=ui-state-coverage',
        '键盘操作、焦点、语义标签和主要响应式断点已检查',
      ],
      qualityGates: ['ui-state-coverage'],
      outputs: [],
    },
    {
      id: 'test',
      type: 'agent_action',
      action: 'run_ui_tests_and_regression',
      dependsOn: ['state-acceptance'],
      requiredInputs: ['本次 UI 变更', '项目现有测试与构建命令'],
      expectedOutputs: ['组件/交互测试、构建检查和受影响回归结果'],
      completionEvidence: [
        '真实命令、退出码和通过数量',
        'acceptanceResults 包含 gateId=ui-test-suite',
      ],
      qualityGates: ['ui-test-suite'],
      outputs: [],
    },
    {
      id: 'review',
      type: 'tool',
      tool: 'code_review',
      dependsOn: ['test'],
      args: {
        project_root: projectRoot,
        focus: 'all',
      },
      expectedOutputs: ['UI 变更范围、交互、可维护性和回归风险审查结果'],
      completionEvidence: [
        '高优先级问题已关闭或转为明确阻断项',
        'acceptanceResults 包含 gateId=ui-code-review',
      ],
      qualityGates: ['ui-code-review'],
      outputs: [],
    },
    {
      id: 'architecture-drift',
      type: 'tool',
      tool: 'architecture',
      dependsOn: ['review'],
      when: '本任务生成或引用了 ArchitectureCandidate/ADR，或改变模块边界、公共契约、数据所有权时',
      args: {
        mode: 'drift',
        description: `核验 UI 交付是否偏离已确认架构：${description}`,
        project_root: projectRoot,
        baseline: '[填入已确认 ArchitectureCandidate/ADR；不适用时按理由跳过本步骤]',
        diff: '[填入真实 Git diff 或 revision 摘要]',
        collect_evidence: true,
      },
      expectedOutputs: ['架构漂移检查结果，或不适用的明确跳过理由'],
      completionEvidence: ['存在架构证据时已完成 drift；不存在时记录 skip reason'],
      outputs: [],
    },
    {
      id: 'update-context',
      type: 'agent_action',
      action: 'update_project_context',
      dependsOn: ['architecture-drift'],
      requiredInputs: ['视觉方向、页面结构、真实实现、测试和截图评审报告'],
      expectedOutputs: ['docs/project-context.md 中的 UI 文档索引已更新'],
      completionEvidence: ['项目上下文链接指向本轮真实产物'],
      outputs: ['docs/project-context.md'],
    },
  ];
}

export function buildUiPlan(input: BuildUiPlanInput): DelegatedPlanContract {
  const projectRoot = input.projectRoot.replace(/\\/g, '/');
  const recallSteps = chainSteps(input.memoryRecallSteps);
  const lastRecallId = recallSteps.at(-1)?.id;
  const skillBridgeStep = lastRecallId
    && (!input.skillBridgeStep.dependsOn || input.skillBridgeStep.dependsOn.length === 0)
    ? { ...input.skillBridgeStep, dependsOn: [lastRecallId] }
    : { ...input.skillBridgeStep };
  const requirementSteps = chainSteps(
    input.requirementSteps ?? [],
    skillBridgeStep.id,
  );
  const contextDependency = requirementSteps.at(-1)?.id ?? skillBridgeStep.id;
  const memoryPreparation = input.memoryEnabled
    ? [{
        ...buildMemoryPlanStep('ui'),
        dependsOn: ['update-context'],
      } as DelegatedPlanStep]
    : [];

  return buildDelegatedPlanContract({
    planId: createDelegatedPlanId(
      'ui',
      `${input.templateName}:${input.mode}:${input.description}`,
    ),
    workflow: 'ui',
    workflowVersion: '4.0.0',
    objective: `设计、实施并验证 UI：${input.description}`,
    declaredScope: {
      projectRoot,
      framework: input.framework,
      templateName: input.templateName,
      mode: input.mode,
      requiredViewports: input.visualContract.acceptance.requiredViewports,
      targetScore: input.visualContract.acceptance.targetScore,
    },
    globalRules: [
      'Agent 必须按 metadata.plan.steps 顺序执行真实文件、代码、运行、截图、测试和审查操作',
      '首次执行前用完整 plan 建立 plan_heartbeat；每完成、跳过或阻断一步立即累计回写',
      '不得把计划、设计稿或历史截图当作本轮真实实现与验收证据',
      '视觉验收、交互状态验收、测试和代码审查缺一不可',
      '使用过 architecture 时必须完成 validate 或 drift；不适用时写明跳过理由',
    ],
    completionCriteria: [
      '页面结构和设计系统已落盘并与真实实现一致',
      '关键页面在桌面与移动视口完成真实截图和视觉验收',
      '加载、空态、错误、无权限、核心交互和可访问性已验证',
      '项目构建、UI 测试和受影响回归真实通过',
      'code_review 已完成且高优先级问题已关闭或明确阻断',
      '所有步骤、证据、验收结果和 revision 已通过 plan_heartbeat 写入检查点',
    ],
    qualityGates: [
      'ui-visual-acceptance',
      'ui-responsive-acceptance',
      'ui-state-coverage',
      'ui-test-suite',
      'ui-code-review',
    ],
    memoryPolicy: {
      recallBeforeExecution: input.memoryEnabled,
      extractAfterValidation: input.memoryEnabled,
    },
    steps: [
      ...recallSteps,
      skillBridgeStep,
      ...requirementSteps,
      {
        id: 'context',
        type: 'tool',
        tool: 'init_project_context',
        dependsOn: [contextDependency],
        when: '缺少 docs/project-context.md',
        args: { project_root: projectRoot },
        expectedOutputs: ['docs/project-context.md'],
        outputs: ['docs/project-context.md'],
      },
      {
        id: 'design-system',
        type: 'tool',
        tool: 'ui_design_system',
        dependsOn: ['context'],
        when: '缺少 docs/design-system.json 或 docs/design-system.md',
        args: input.designSystemArgs,
        expectedOutputs: ['docs/design-system.json', 'docs/design-system.md'],
        outputs: ['docs/design-system.json', 'docs/design-system.md'],
      },
      {
        id: 'catalog',
        type: 'agent_action',
        action: 'create_component_catalog',
        dependsOn: ['design-system'],
        when: '缺少 docs/ui/component-catalog.json',
        requiredInputs: ['docs/design-system.json 或当前设计系统结果', '现有组件与页面需求'],
        expectedOutputs: ['docs/ui/component-catalog.json'],
        completionEvidence: ['组件目录基于当前项目真实组件和页面需求'],
        outputs: ['docs/ui/component-catalog.json'],
        note: '由 Agent 使用宿主文件能力生成组件目录；该步骤不是 MCP 工具调用',
      },
      ...buildUiDeliverySteps({ ...input, projectRoot }),
      ...memoryPreparation,
    ],
  });
}
