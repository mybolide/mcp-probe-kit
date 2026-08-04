import {
  buildDelegatedPlanContract,
  createDelegatedPlanId,
  type DelegatedPlanContract,
  type DelegatedPlanStep,
} from '../lib/delegated-plan-contract.js';
import { buildMemoryPlanStep } from '../lib/memory-orchestration.js';
import type { Artifact, WorkflowReport, WorkflowStep } from '../schemas/structured-output.js';

export interface BuildProductPlanInput {
  projectRoot: string;
  docsDir: string;
  productName: string;
  productType: string;
  description: string;
  requirementsSource: string;
  targetUsers: string;
  constraints: string;
  includeDesignSystem: boolean;
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

export function buildProductPlan(input: BuildProductPlanInput): DelegatedPlanContract {
  const projectRoot = input.projectRoot.replace(/\\/g, '/');
  const docsDir = input.docsDir.replace(/\\/g, '/');
  const prdPath = `${docsDir}/prd/product-requirements.md`;
  const prototypeIndexPath = `${docsDir}/prototype/prototype-index.md`;
  const designSystemJson = `${docsDir}/design-system.json`;
  const designSystemMd = `${docsDir}/design-system.md`;
  const htmlIndexPath = `${docsDir}/html-prototype/index.html`;
  const acceptancePath = `${docsDir}/product/product-acceptance.md`;
  const recallSteps = chainSteps(input.memoryRecallSteps);
  const lastRecallId = recallSteps.at(-1)?.id;
  const skillBridgeStep = lastRecallId
    && (!input.skillBridgeStep.dependsOn || input.skillBridgeStep.dependsOn.length === 0)
    ? { ...input.skillBridgeStep, dependsOn: [lastRecallId] }
    : { ...input.skillBridgeStep };

  const designSteps: DelegatedPlanStep[] = input.includeDesignSystem
    ? [
        {
          id: 'design-contract',
          type: 'tool',
          tool: 'ui_design_system',
          dependsOn: ['prd-review'],
          args: {
            product_type: input.productType,
            description: input.productName,
            target_audience: input.targetUsers,
            stack: 'html',
          },
          expectedOutputs: ['结构化视觉方向契约'],
          completionEvidence: ['保存 ui_design_system 的 structuredContent 和 contractVersion'],
          outputs: [],
          note: '该工具返回视觉契约，不直接写文件',
        },
        {
          id: 'save-design-system',
          type: 'agent_action',
          action: 'persist_product_design_system',
          dependsOn: ['design-contract'],
          requiredInputs: ['ui_design_system 的结构化视觉契约和文档文本'],
          expectedOutputs: [designSystemJson, designSystemMd],
          completionEvidence: ['JSON 与 Markdown 来自同一 contractVersion，且没有自行补造未返回字段'],
          outputs: [designSystemJson, designSystemMd],
        },
      ]
    : [];
  const prototypeDependencies = [
    'prototype-docs',
    ...(input.includeDesignSystem ? ['save-design-system'] : []),
  ];
  const memoryStep = input.memoryEnabled
    ? [{
        ...buildMemoryPlanStep('default'),
        dependsOn: ['update-context'],
      } as DelegatedPlanStep]
    : [];

  return buildDelegatedPlanContract({
    planId: createDelegatedPlanId('product', `${input.productName}:${input.description}`),
    workflow: 'product',
    workflowVersion: '4.0.0',
    objective: `完成 ${input.productName} 的需求、页面流程、设计系统、可交互原型与产品验收`,
    declaredScope: {
      projectRoot,
      docsDir,
      productName: input.productName,
      productType: input.productType,
      targetUsers: input.targetUsers,
      constraints: input.constraints,
      requirementsSource: input.requirementsSource,
      includeDesignSystem: input.includeDesignSystem,
      softwareImplementationRequired: false,
    },
    qualityGates: [
      'product-brief-complete',
      'product-requirements-accepted',
      'product-prototype-consistent',
      'product-visual-accepted',
      'product-package-reviewed',
    ],
    globalRules: [
      '本流程交付产品定义和原型，不要求生产代码实现、软件测试或代码审查证据',
      'PRD、页面原型、HTML 原型和设计系统必须使用同一目标用户、范围和约束口径',
      '不得将 ui_design_system 返回结构化契约描述成已写入文件；文件由 Agent 明确落盘',
      'start_ui 返回的是子 Delegated Plan；父步骤只有在子 Plan converge passed=true 且产物存在后才能完成',
      '首次执行前建立 plan_heartbeat；每完成、跳过或阻断一步立即累计回写',
    ],
    completionCriteria: [
      '产品目标、问题、用户、范围、非目标、约束和成功指标已明确',
      'PRD 已通过产品需求验收且所有关键页面、流程、状态和验收标准可追溯',
      '页面原型文档与 PRD 的页面、任务流和状态一致',
      'HTML 原型子 Plan 已独立 converge，并完成桌面/移动视觉验收',
      '产品包评审已覆盖一致性、范围、可测试性、约束、风险和未决项',
      '项目上下文已索引产品文档、原型、设计系统和验收报告',
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
        when: `缺少 AGENTS.md 或 ${docsDir}/project-context.md`,
        args: { docs_dir: docsDir, project_root: projectRoot },
        expectedOutputs: ['AGENTS.md', `${docsDir}/project-context.md`],
        completionEvidence: ['项目上下文指向当前真实项目根目录'],
        outputs: ['AGENTS.md', `${docsDir}/project-context.md`],
      },
      {
        id: 'brief',
        type: 'agent_action',
        action: 'normalize_and_validate_product_brief',
        dependsOn: ['context'],
        requiredInputs: [
          input.requirementsSource,
          '产品目标、用户问题、目标用户、约束、非目标、成功指标和关键假设',
        ],
        expectedOutputs: ['经核验的产品 Brief 和仍需用户确认的问题'],
        completionEvidence: [
          'acceptanceResults 包含 gateId=product-brief-complete',
          '事实、假设和未知项已分开记录',
        ],
        qualityGates: ['product-brief-complete'],
        outputs: [],
      },
      {
        id: 'clarify',
        type: 'user_input',
        action: 'close_material_product_questions',
        dependsOn: ['brief'],
        when: '产品目标、目标用户、范围、约束或成功指标仍存在会改变方案的未决问题',
        requiredInputs: ['只询问会实质改变产品范围或验收的最少问题'],
        expectedOutputs: ['已确认答案，或用户明确接受的假设/延期项'],
        completionEvidence: ['所有重大未决项已关闭、接受或标记为阻断'],
        outputs: [],
      },
      {
        id: 'prd',
        type: 'agent_action',
        action: 'generate_product_requirements_document',
        dependsOn: ['clarify'],
        requiredInputs: [input.requirementsSource, '已确认产品 Brief'],
        expectedOutputs: [prdPath],
        completionEvidence: ['PRD 包含目标、用户、问题、范围、非目标、页面、流程、状态、验收、指标、风险和未决项'],
        outputs: [prdPath],
      },
      {
        id: 'prd-review',
        type: 'agent_action',
        action: 'review_product_requirements',
        dependsOn: ['prd'],
        requiredInputs: [prdPath, '已确认产品 Brief'],
        expectedOutputs: ['PRD 一致性、完整性、可验证性和范围评审结果'],
        completionEvidence: [
          'acceptanceResults 包含 gateId=product-requirements-accepted',
          '高优先级问题已关闭或明确阻断',
        ],
        qualityGates: ['product-requirements-accepted'],
        outputs: [],
      },
      {
        id: 'prototype-docs',
        type: 'agent_action',
        action: 'generate_prototype_documents',
        dependsOn: ['prd-review'],
        requiredInputs: [prdPath],
        expectedOutputs: [prototypeIndexPath, `${docsDir}/prototype/page-*.md`],
        completionEvidence: ['页面、任务流、状态、数据和权限均回链到 PRD'],
        outputs: [prototypeIndexPath, `${docsDir}/prototype/page-*.md`],
      },
      ...designSteps,
      {
        id: 'html-prototype',
        type: 'tool',
        tool: 'start_ui',
        dependsOn: prototypeDependencies,
        args: {
          description: `根据 ${prototypeIndexPath} 与页面原型文档，为 ${input.productName} 生成可交互 HTML 原型；输出到 ${docsDir}/html-prototype/，并遵守产品范围、状态和设计系统`,
          framework: 'html',
          project_root: projectRoot,
          mode: 'manual',
        },
        expectedOutputs: ['子 UI Delegated Plan', htmlIndexPath, `${docsDir}/html-prototype/page-*.html`],
        completionEvidence: [
          '记录子 plan_id',
          '子 Plan converge passed=true',
          '桌面与移动视觉验收结果及真实原型文件',
        ],
        outputs: [htmlIndexPath, `${docsDir}/html-prototype/page-*.html`],
        note: '调用 start_ui 只会生成子 Plan；Agent 必须执行并收敛子 Plan，不能把工具返回当成原型已完成',
      },
      {
        id: 'prototype-acceptance',
        type: 'agent_action',
        action: 'verify_product_prototype_consistency',
        dependsOn: ['html-prototype'],
        requiredInputs: [prdPath, prototypeIndexPath, htmlIndexPath, ...(input.includeDesignSystem ? [designSystemJson] : [])],
        expectedOutputs: ['需求—页面—流程—状态—原型一致性矩阵和视觉验收摘要'],
        completionEvidence: [
          'acceptanceResults 包含 gateId=product-prototype-consistent',
          'acceptanceResults 包含 gateId=product-visual-accepted',
        ],
        qualityGates: ['product-prototype-consistent', 'product-visual-accepted'],
        outputs: [],
      },
      {
        id: 'package-review',
        type: 'agent_action',
        action: 'review_product_delivery_package',
        dependsOn: ['prototype-acceptance'],
        requiredInputs: [prdPath, prototypeIndexPath, htmlIndexPath, '产品 Brief、约束、验收结果和未决项'],
        expectedOutputs: [acceptancePath],
        completionEvidence: [
          'acceptanceResults 包含 gateId=product-package-reviewed',
          '报告覆盖范围一致性、用户任务、状态、验收、风险、依赖和未决项',
        ],
        qualityGates: ['product-package-reviewed'],
        outputs: [acceptancePath],
      },
      {
        id: 'update-context',
        type: 'agent_action',
        action: 'update_project_context',
        dependsOn: ['package-review'],
        requiredInputs: [prdPath, prototypeIndexPath, htmlIndexPath, acceptancePath],
        expectedOutputs: [`${docsDir}/project-context.md 中已加入产品文档、原型、设计系统和验收索引`],
        completionEvidence: ['项目上下文链接均指向本轮真实产物'],
        outputs: [`${docsDir}/project-context.md`],
      },
      ...memoryStep,
    ],
  });
}

const STEP_LABELS: Record<string, string> = {
  'recall-memory': '召回产品经验',
  'skill-bridge': '读取产品设计 Skill',
  context: '建立项目上下文',
  brief: '规范化产品 Brief',
  clarify: '关闭重大产品问题',
  prd: '生成 PRD',
  'prd-review': '评审 PRD',
  'prototype-docs': '生成页面原型文档',
  'design-contract': '生成视觉方向契约',
  'save-design-system': '保存设计系统',
  'html-prototype': '执行 HTML 原型子计划',
  'prototype-acceptance': '验收产品原型一致性',
  'package-review': '评审产品交付包',
  'update-context': '更新项目上下文',
  'prepare-memory': '准备产品经验候选',
};

function reportSteps(plan: DelegatedPlanContract): WorkflowStep[] {
  return plan.steps.map((step) => ({
    name: STEP_LABELS[step.id] ?? step.action ?? step.tool ?? step.id,
    status: 'pending',
    description: step.note
      ?? (step.expectedOutputs?.length ? `预期输出：${step.expectedOutputs.join('；')}` : '待执行'),
  }));
}

export function buildProductReport(input: {
  plan: DelegatedPlanContract;
  projectRoot: string;
  docsDir: string;
  productName: string;
  includeDesignSystem: boolean;
  requirementsSource: string;
  targetUsers: string;
  constraints: string;
  skills: unknown;
}): WorkflowReport {
  const artifacts: Artifact[] = [
    { path: `${input.docsDir}/prd/product-requirements.md`, type: 'doc', purpose: '产品需求文档' },
    { path: `${input.docsDir}/prototype/prototype-index.md`, type: 'doc', purpose: '原型索引' },
    { path: `${input.docsDir}/prototype/page-*.md`, type: 'doc', purpose: '页面原型文档' },
    { path: `${input.docsDir}/html-prototype/index.html`, type: 'doc', purpose: '可交互原型入口' },
    { path: `${input.docsDir}/product/product-acceptance.md`, type: 'doc', purpose: '产品交付验收报告' },
    ...(input.includeDesignSystem
      ? [
          { path: `${input.docsDir}/design-system.json`, type: 'doc' as const, purpose: '设计系统配置' },
          { path: `${input.docsDir}/design-system.md`, type: 'doc' as const, purpose: '设计系统文档' },
        ]
      : []),
  ];
  return {
    summary: `产品设计工作流：${input.productName}`,
    status: 'pending',
    steps: reportSteps(input.plan),
    artifacts,
    nextSteps: [
      `调用 plan_heartbeat，传入 plan_id=${input.plan.planId}、完整 metadata.plan 与 project_root=${input.projectRoot}`,
      ...input.plan.steps.map((step) => `${step.tool ? `调用 ${step.tool}` : `执行 ${step.action ?? step.id}`}，随后累计回写 plan_heartbeat`),
      `调用 converge --plan_id=${input.plan.planId} --project_root=${input.projectRoot}`,
    ],
    metadata: {
      plan: input.plan,
      skills: input.skills,
      projectRoot: input.projectRoot,
      requirementsSource: input.requirementsSource,
      productBrief: {
        targetUsers: input.targetUsers || null,
        constraints: input.constraints || null,
      },
    },
  };
}
