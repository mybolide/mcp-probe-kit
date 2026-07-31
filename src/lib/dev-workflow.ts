/** Model-facing workflow router. Every referenced tool must exist on the active surface. */
import {
  SCENARIO_LABELS,
  detectWorkflowScenario,
  type DevWorkflowPlan,
  type WorkflowPhase,
  type WorkflowScenario,
} from './dev-workflow-routing.js';

export {
  detectWorkflowScenario,
  type DevWorkflowPlan,
  type WorkflowPhase,
  type WorkflowScenario,
  type WorkflowToolStep,
} from './dev-workflow-routing.js';

export interface BuildDevWorkflowOptions {
  scenario?: string;
  memoryAvailable?: boolean;
}

function contextPhase(): WorkflowPhase {
  return {
    id: 'context',
    title: '补齐项目上下文（写代码前）',
    when: '缺少 AGENTS.md、project-context 或 graph-insights/latest.*',
    steps: [{
      tool: 'init_project_context',
      required: true,
      when: '项目索引或图谱缺失',
      note: '先建立并读取项目上下文，再进行大范围修改',
    }],
  };
}

function memoryPhase(memoryAvailable: boolean): WorkflowPhase | null {
  if (!memoryAvailable) return null;
  return {
    id: 'memory',
    title: '记忆检索与沉淀',
    when: '需要历史经验，或收敛后存在可复用结论',
    steps: [
      {
        tool: 'search_memory',
        required: false,
        when: '需要补查历史 Bug、负面经验或模式',
      },
      {
        tool: 'memorize_asset',
        required: false,
        when: 'converge passed=true 且已有验证过的 MemoryCandidate',
      },
    ],
  };
}

function withMemory(phases: WorkflowPhase[], available: boolean): WorkflowPhase[] {
  const phase = memoryPhase(available);
  return phase ? [...phases, phase] : phases;
}

function commonAvoid(): string[] {
  return [
    '不要跳过 start_* 返回的 delegated plan 直接写实现代码',
    '不要在未读取项目上下文和图谱的情况下进行大范围修改',
    '不要把 delegated plan 当成已经完成的实现',
  ];
}

function commonMemoryNotes(available: boolean): string[] {
  return available
    ? [
        'start_* 会按配置注入历史记忆；仍可用 search_memory 补查',
        '只有 converge 通过后才能用 memorize_asset 正式写入长期记忆',
      ]
    : ['Memory 后端未完整配置，本计划不会引用任何 Memory 工具'];
}

function buildPlan(
  scenario: WorkflowScenario,
  intent: string,
  memoryAvailable: boolean,
): DevWorkflowPlan {
  const base = {
    scenario,
    scenarioLabel: SCENARIO_LABELS[scenario],
    confidence: 'high' as const,
  };

  switch (scenario) {
    case 'bugfix':
      return {
        ...base,
        summary: '使用 start_bugfix 执行 SRC-8：证据收敛、根因分析、最小修复、回归测试与收敛',
        firstTool: 'start_bugfix',
        firstToolArgsHint: { error_message: intent },
        phases: withMemory([
          contextPhase(),
          {
            id: 'orchestrate',
            title: 'Bug 修复编排',
            when: '任何 Bug、异常、失败或回归问题',
            steps: [
              {
                tool: 'start_bugfix',
                required: true,
                when: '先建立 SRC-8 delegated plan',
                note: '根因分析由 Agent 按计划完成，不调用 compact 模式隐藏的 fix_bug',
              },
              {
                tool: 'code_insight',
                required: false,
                when: '需要调用链、影响面或跨模块边界',
              },
              {
                tool: 'gentest',
                required: false,
                when: '修复后需要生成或补充回归测试',
              },
            ],
          },
          {
            id: 'finish',
            title: '验证与收敛',
            when: '修复、测试和审查完成后',
            steps: [
              { tool: 'converge', required: true, when: '证据已通过 plan_heartbeat 记录' },
              { tool: 'gencommit', required: false, when: 'converge 通过且准备提交' },
            ],
          },
        ], memoryAvailable),
        avoid: [...commonAvoid(), '不要在真因未闭合前修改代码', '不要只修症状而不补回归测试'],
        memoryNotes: commonMemoryNotes(memoryAvailable),
      };

    case 'ui':
      return {
        ...base,
        summary: '使用 start_ui 统一编排设计系统、模板选择、组件目录与真实 UI 实施',
        firstTool: 'start_ui',
        firstToolArgsHint: { description: intent },
        phases: withMemory([
          contextPhase(),
          {
            id: 'orchestrate',
            title: 'UI 开发编排',
            when: '页面、组件、交互、样式或原型开发',
            steps: [{
              tool: 'start_ui',
              required: true,
              when: '先取得闭环 UI delegated plan',
              note: '组件目录和代码实施属于 Agent 宿主操作，不作为 MCP 工具调用',
            }],
          },
        ], memoryAvailable),
        avoid: [...commonAvoid(), '不要跳过设计系统和交互状态约束'],
        memoryNotes: commonMemoryNotes(memoryAvailable),
      };

    case 'explore':
      return {
        ...base,
        summary: '先用 code_insight 收敛调用链、上下文和影响面，再决定后续入口',
        firstTool: 'code_insight',
        firstToolArgsHint: { mode: 'auto', query: intent },
        phases: [
          contextPhase(),
          {
            id: 'insight',
            title: '代码洞察',
            when: '理解架构、入口、调用链或影响范围',
            steps: [{ tool: 'code_insight', required: true, when: '执行 query/context/impact 分析' }],
          },
          {
            id: 'continue',
            title: '进入具体研发流程',
            when: '洞察结果已经明确任务类型',
            steps: [
              { tool: 'start_feature', required: false, when: '确认是新功能或增强' },
              { tool: 'start_bugfix', required: false, when: '确认是 Bug 或异常' },
            ],
          },
        ],
        avoid: [...commonAvoid(), '不要在影响面不明时大范围读写文件'],
        memoryNotes: [],
      };

    case 'commit':
      return {
        ...base,
        summary: '使用 gencommit 获取 Conventional Commits 生成规则和输出模板',
        firstTool: 'gencommit',
        phases: [{
          id: 'commit',
          title: '生成提交信息',
          when: '变更已经验证并准备提交',
          steps: [{ tool: 'gencommit', required: true, when: '需要 commit message' }],
        }],
        avoid: ['不要提交未验证或与当前任务无关的变更'],
        memoryNotes: [],
      };

    case 'review':
      return {
        ...base,
        summary: '使用 code_review 获取代码审查清单并输出结构化问题',
        firstTool: 'code_review',
        phases: [{
          id: 'review',
          title: '代码审查',
          when: '审查指定文件、代码或 diff',
          steps: [{ tool: 'code_review', required: true, when: '检查质量、安全或维护性' }],
        }],
        avoid: ['不要在未说明审查结论前直接修改代码'],
        memoryNotes: [],
      };

    case 'refactor':
      return {
        ...base,
        summary: '使用 refactor 形成重构计划，必要时先用 code_insight 收敛影响面',
        firstTool: 'refactor',
        phases: [
          {
            id: 'impact',
            title: '影响面分析',
            when: '重构范围不明确或涉及多模块',
            steps: [{ tool: 'code_insight', required: false, when: '使用 impact 模式确认边界' }],
          },
          {
            id: 'refactor',
            title: '形成重构方案',
            when: '目标和边界明确',
            steps: [{ tool: 'refactor', required: true, when: '输出分步重构计划' }],
          },
        ],
        avoid: [...commonAvoid(), '不要在无测试保护时执行大规模重构'],
        memoryNotes: [],
      };

    case 'onboard':
      return {
        ...base,
        summary: '使用 start_onboard 生成新仓库或新成员的项目理解路径',
        firstTool: 'start_onboard',
        phases: [{
          id: 'onboard',
          title: '项目上手',
          when: '新成员、新仓库或需要系统理解项目',
          steps: [
            { tool: 'start_onboard', required: true, when: '生成上手计划' },
            { tool: 'init_project_context', required: false, when: '项目上下文仍缺失' },
          ],
        }],
        avoid: ['不要未读上下文就直接修改业务代码'],
        memoryNotes: [],
      };

    case 'spec':
      return {
        ...base,
        summary: '先用 check_spec 校验；规格缺失或需重构时回到 start_feature',
        firstTool: 'check_spec',
        phases: [{
          id: 'spec',
          title: '规格闸门',
          when: '已有 docs/specs/<feature> 或准备进入实现',
          steps: [
            { tool: 'check_spec', required: true, when: '验证 requirements/design/tasks 完整性' },
            {
              tool: 'start_feature',
              required: false,
              when: '规格缺失、布局需重判或需要重新生成内嵌规格草稿',
            },
          ],
        }],
        avoid: ['不要在 check_spec 未通过时进入实现'],
        memoryNotes: [],
      };

    case 'memory':
      if (!memoryAvailable) {
        return {
          ...base,
          confidence: 'high',
          summary: 'Memory 后端未完整配置，当前没有可执行的 Memory 工具',
          firstTool: null,
          phases: [],
          avoid: ['不要生成或调用 tools/list 中不可见的 Memory 工具'],
          memoryNotes: ['配置 MEMORY_QDRANT_URL、MEMORY_EMBEDDING_URL 和 MEMORY_EMBEDDING_MODEL 后重试'],
        };
      }
      return {
        ...base,
        summary: '使用 search_memory 检索历史资产，再按需读取、更新或删除',
        firstTool: 'search_memory',
        firstToolArgsHint: { query: intent },
        phases: [memoryPhase(true)!],
        avoid: ['删除前先 read_memory_asset 确认，并显式 confirm=true'],
        memoryNotes: commonMemoryNotes(true),
      };

    case 'unknown':
      return {
        ...base,
        confidence: 'low',
        summary: '意图不足，先由 Agent 使用原生对话澄清；当前不建议调用任何 MCP 工具',
        firstTool: null,
        phases: [],
        avoid: ['不要猜测任务类型后直接写代码', '不要调用 compact 模式不可见的 ask_user'],
        memoryNotes: [],
      };

    case 'feature':
    default:
      return {
        ...base,
        scenario: 'feature',
        scenarioLabel: SCENARIO_LABELS.feature,
        summary: '使用 start_feature 获取内嵌规格草稿、规格闸门和估算的闭环计划',
        firstTool: 'start_feature',
        firstToolArgsHint: { description: intent, spec_layout: 'auto' },
        phases: withMemory([
          contextPhase(),
          {
            id: 'orchestrate',
            title: '功能开发编排',
            when: '任何新功能、增强、版本升级或跨模块研发',
            steps: [
              {
                tool: 'start_feature',
                required: true,
                when: '先判定 flat/parent-child 并取得内嵌 specDraft',
                note: '规格草稿由 start_feature 内部生成并返回',
              },
              { tool: 'code_insight', required: false, when: '涉及多模块或不熟悉代码' },
            ],
          },
          {
            id: 'gate',
            title: '规格闸门',
            when: '按内嵌草稿落盘后、写实现前',
            steps: [{ tool: 'check_spec', required: true, when: '未通过则补全并重跑' }],
          },
        ], memoryAvailable),
        avoid: [...commonAvoid(), '不要在 check_spec 未通过时进入实现'],
        memoryNotes: commonMemoryNotes(memoryAvailable),
      };
  }
}

export function buildDevWorkflow(
  intent: string,
  options: BuildDevWorkflowOptions = {},
): DevWorkflowPlan {
  const detection = detectWorkflowScenario(intent, options.scenario);
  const plan = buildPlan(detection.scenario, intent, options.memoryAvailable === true);
  plan.confidence = detection.confidence;
  return plan;
}

export function renderWorkflowMarkdown(plan: DevWorkflowPlan, intent: string): string {
  const firstTool = plan.firstTool
    ? `**第一步应调用**: \`${plan.firstTool}\`${plan.firstToolArgsHint ? `\n**参数提示**: \`${JSON.stringify(plan.firstToolArgsHint)}\`` : ''}`
    : '**第一步**: 暂不调用 MCP 工具，由 Agent 先使用原生对话澄清或补齐配置';
  const phases = plan.phases.length > 0
    ? plan.phases.map((phase, index) => {
        const steps = phase.steps.map((step) =>
          `  - ${step.required ? '**必须**' : '可选'} \`${step.tool}\` — ${step.when}${step.note ? `（${step.note}）` : ''}`
        ).join('\n');
        return `### ${index + 1}. ${phase.title}\n**时机**: ${phase.when}\n${steps}`;
      }).join('\n\n')
    : '_当前没有可执行工具步骤。_';

  return `# 开发工作流 · ${plan.scenarioLabel}

**识别场景**: ${plan.scenario}（置信度: ${plan.confidence}）
**摘要**: ${plan.summary}
${firstTool}

**用户意图**: ${intent || '(未提供)'}

---

## 阶段与 MCP 工具

${phases}

## 禁止事项

${plan.avoid.map((item) => `- ${item}`).join('\n')}
${plan.memoryNotes.length > 0 ? `\n## 记忆\n${plan.memoryNotes.map((item) => `- ${item}`).join('\n')}` : ''}

---

*本指南由 \`workflow\` 生成，只引用当前配置下可执行的工具。*`;
}
