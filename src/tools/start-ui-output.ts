import type { DelegatedPlanContract, DelegatedPlanStep } from '../lib/delegated-plan-contract.js';
import type { UIReport, WorkflowStep } from '../schemas/structured-output.js';
import type { VisualDirectionContract } from '../utils/visual-direction-engine.js';
import { renderCraftPlaybook, type CraftMotionPolicy } from '../utils/ui-craft.js';

const STEP_LABELS: Record<string, string> = {
  'recall-memory': '召回历史 UI 经验',
  'skill-bridge': '读取 UI Skill 约束',
  'loop-1': '收集 UI 需求',
  'loop-2': '关闭剩余问题',
  context: '检查项目上下文',
  'design-system': '生成或读取设计系统',
  catalog: '生成组件目录',
  'emit-theme': '写入设计系统 theme CSS',
  structure: '选择页面结构',
  'save-structure': '保存页面结构',
  'shadcn-components': '选择组件原语',
  render: '实施关键页面',
  'capture-desktop': '生成桌面截图',
  'craft-audit': '审计源码工艺门禁',
  'capture-mobile': '生成移动端截图',
  'visual-review': '执行截图视觉评审',
  'visual-iterate': '根据评审迭代',
  'visual-acceptance': '完成视觉与响应式验收',
  'state-acceptance': '验证状态与可访问性',
  test: '运行 UI 测试与回归',
  review: '执行代码审查',
  'architecture-drift': '核验架构漂移',
  'update-context': '更新项目上下文',
  'prepare-memory': '准备 UI MemoryCandidate',
};

function labelForStep(step: DelegatedPlanStep): string {
  return STEP_LABELS[step.id]
    ?? step.action
    ?? step.tool
    ?? step.id;
}

export function renderUiAuthoritySection(input?: {
  motionPolicy?: CraftMotionPolicy;
  screenType?: string;
}): string {
  const motionPolicy = input?.motionPolicy ?? 'minimal';
  const screenType = input?.screenType ?? 'product-interface';
  return `## 唯一依据

1. **视觉与配色**只认 \`ui_design_system\` 落盘的 \`docs/design-system.json\` / \`docs/design-system.md\` / \`docs/design-system.theme.css\`（已有则沿用）。\`start_ui\` 只编排步骤，不另定色盘。
2. 内嵌 craft 门禁（分层线、press scale、禁止 Inter / \`transition: all\` / \`scale(0)\`）。不要调用外部 UI Skill，也不要用跨项目记忆改视觉。

${renderCraftPlaybook({ motionPolicy, screenType })}`;
}

function descriptionForStep(step: DelegatedPlanStep): string {
  if (step.note?.trim()) return step.note.trim();
  const expected = step.expectedOutputs ?? step.outputs ?? [];
  if (expected.length > 0) return `预期输出：${expected.join('；')}`;
  if (step.tool) return `调用 ${step.tool}`;
  return '由 Agent 使用宿主能力完成并写入真实证据';
}

export function buildUiWorkflowSteps(plan: DelegatedPlanContract): WorkflowStep[] {
  return plan.steps.map((step) => ({
    name: labelForStep(step),
    status: 'pending',
    description: descriptionForStep(step),
  }));
}

function buildUiNextSteps(plan: DelegatedPlanContract, projectRoot: string): string[] {
  return [
    `调用 plan_heartbeat，传入 plan_id=${plan.planId}、完整 metadata.plan 与 project_root=${projectRoot}`,
    ...plan.steps.map((step) => {
      const action = step.tool
        ? `调用 ${step.tool}`
        : `由 Agent 执行 ${step.action ?? step.id}`;
      return `${action}；完成、跳过或阻断后立即累计回写 plan_heartbeat`;
    }),
    `调用 converge --plan_id=${plan.planId} --project_root=${projectRoot}`,
  ];
}

/** start_ui 编排报告不得附带色盘；token 只认 ui_design_system。 */
export function omitPaletteFromVisualContract(
  contract: VisualDirectionContract,
): VisualDirectionContract {
  return {
    ...contract,
    visualLanguage: {
      ...contract.visualLanguage,
      color: {
        strategy: 'Deferred to ui_design_system; start_ui does not assign palettes.',
        tokens: {
          canvas: '',
          text: '',
          muted: '',
          accent: '',
        },
        accentUsage: contract.visualLanguage.color.accentUsage,
      },
    },
    craft: {
      ...contract.craft,
      themeCss: '',
    },
  };
}

export function buildUiReport(input: {
  mode: 'auto' | 'manual';
  description: string;
  framework: string;
  projectRoot: string;
  plan: DelegatedPlanContract;
  visualContract: VisualDirectionContract;
  reviewMaxRounds: number;
  templateMeta: Record<string, string>;
}): UIReport {
  const {
    mode,
    description,
    framework,
    projectRoot,
    plan,
    visualContract,
    reviewMaxRounds,
    templateMeta,
  } = input;
  const orchestrationContract = omitPaletteFromVisualContract(visualContract);
  return {
    summary: mode === 'auto'
      ? `智能 UI 开发：${description}`
      : `UI 开发工作流：${description}`,
    status: 'pending',
    steps: buildUiWorkflowSteps(plan),
    artifacts: [],
    nextSteps: buildUiNextSteps(plan, projectRoot),
    designSystem: {
      colors: { source: 'ui_design_system' },
      typography: { source: 'ui_design_system' },
      spacing: { source: 'ui_design_system' },
    },
    renderedCode: {
      framework: framework as 'react' | 'vue' | 'html',
      code: '待生成',
    },
    consistencyRules: [
      '先读现有页面和 design-system，禁止调用外部 UI Skill 或套用落地页模板',
      '颜色、字体、圆角和间距只认 ui_design_system 落盘文件；禁止使用 start_ui 报告里的预览 token',
      '源码 craft-audit 阻断项未通过不得进入视觉验收',
      `真实截图评分不得低于 ${visualContract.acceptance.targetScore}/10`,
      '加载、空态、错误、无权限、交互和可访问性状态必须有真实验收证据',
      '测试、代码审查和必要的 architecture drift 未完成前不得 converge',
    ],
    metadata: {
      plan,
      template: templateMeta,
      visualDirection: orchestrationContract,
      reviewPolicy: {
        maxRounds: reviewMaxRounds,
        targetScore: visualContract.acceptance.targetScore,
        requiredViewports: visualContract.acceptance.requiredViewports,
        dimensions: visualContract.acceptance.dimensions,
        blockingFailures: visualContract.acceptance.blockingFailures,
      },
      skills: {
        policy: 'inline-craft-only',
        externalSkills: [],
      },
    },
  };
}
