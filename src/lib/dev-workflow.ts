/**
 * 开发工作流路由：根据用户意图生成「何时调哪个 MCP 工具」的委托式指南。
 * 解决 Agent 直接写代码、跳过 start_* / code_insight / check_spec 的问题。
 */

export type WorkflowScenario =
  | 'feature'
  | 'bugfix'
  | 'ui'
  | 'explore'
  | 'commit'
  | 'review'
  | 'refactor'
  | 'onboard'
  | 'spec'
  | 'memory'
  | 'unknown';

export interface WorkflowToolStep {
  tool: string;
  required: boolean;
  when: string;
  note?: string;
}

export interface WorkflowPhase {
  id: string;
  title: string;
  when: string;
  steps: WorkflowToolStep[];
}

export interface DevWorkflowPlan {
  scenario: WorkflowScenario;
  scenarioLabel: string;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  firstTool: string;
  firstToolArgsHint?: Record<string, unknown>;
  phases: WorkflowPhase[];
  avoid: string[];
  memoryNotes: string[];
}

const SCENARIO_PATTERNS: Array<{ scenario: WorkflowScenario; patterns: RegExp[] }> = [
  {
    scenario: 'bugfix',
    patterns: [/bug|错误|异常|报错|修复|排查|回归|失败|crash|堆栈|stack|不生效|白屏|typeerror|referenceerror|error/i],
  },
  {
    scenario: 'ui',
    patterns: [/ui|界面|页面|组件|布局|样式|tailwind|shadcn|设计系统|交互/i],
  },
  {
    scenario: 'explore',
    patterns: [/架构|调用链|影响面|不熟|读懂|图谱|依赖|入口|code_insight|上下文/i],
  },
  {
    scenario: 'commit',
    patterns: [/提交|commit|changelog|写提交/i],
  },
  {
    scenario: 'review',
    patterns: [/审查|review|代码评审|安全检查/i],
  },
  {
    scenario: 'refactor',
    patterns: [/重构|refactor|整理代码|降复杂度/i],
  },
  {
    scenario: 'onboard',
    patterns: [/上手|onboard|新项目|熟悉项目|项目概览/i],
  },
  {
    scenario: 'spec',
    patterns: [/规格|spec|requirements|check_spec|验收/i],
  },
  {
    scenario: 'memory',
    patterns: [/记忆|沉淀|memorize|search_memory|历史经验|踩坑/i],
  },
  {
    scenario: 'feature',
    patterns: [/新功能|添加|实现|开发|feature|需求|做一?个/i],
  },
];

const SCENARIO_LABELS: Record<WorkflowScenario, string> = {
  feature: '新功能开发',
  bugfix: 'Bug 修复',
  ui: 'UI 开发',
  explore: '代码探索 / 影响分析',
  commit: '生成提交',
  review: '代码审查',
  refactor: '重构',
  onboard: '项目上手',
  spec: '规格校验',
  memory: '记忆检索 / 沉淀',
  unknown: '未明确（需先澄清）',
};

function scoreScenario(text: string, scenario: WorkflowScenario): number {
  const entry = SCENARIO_PATTERNS.find((item) => item.scenario === scenario);
  if (!entry) {
    return 0;
  }
  return entry.patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

export function detectWorkflowScenario(intent: string, explicit?: string): {
  scenario: WorkflowScenario;
  confidence: 'high' | 'medium' | 'low';
} {
  const normalizedExplicit = (explicit || '').trim().toLowerCase();
  const explicitMap: Record<string, WorkflowScenario> = {
    feature: 'feature',
    bugfix: 'bugfix',
    bug: 'bugfix',
    ui: 'ui',
    explore: 'explore',
    commit: 'commit',
    review: 'review',
    refactor: 'refactor',
    onboard: 'onboard',
    spec: 'spec',
    memory: 'memory',
    auto: 'unknown',
  };

  if (normalizedExplicit && normalizedExplicit !== 'auto' && explicitMap[normalizedExplicit]) {
    return { scenario: explicitMap[normalizedExplicit], confidence: 'high' };
  }

  const text = intent.trim();
  if (!text) {
    return { scenario: 'unknown', confidence: 'low' };
  }

  const scores = SCENARIO_PATTERNS.map((item) => ({
    scenario: item.scenario,
    score: scoreScenario(text, item.scenario),
  })).sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];
  if (!top || top.score === 0) {
    return { scenario: 'feature', confidence: 'low' };
  }
  if (second && top.score === second.score) {
    return { scenario: top.scenario, confidence: 'medium' };
  }
  return { scenario: top.scenario, confidence: top.score >= 2 ? 'high' : 'medium' };
}

function baseContextPhase(): WorkflowPhase {
  return {
    id: 'context',
    title: '补齐项目上下文（写代码前）',
    when: '缺少 AGENTS.md / docs/project-context / graph-insights/latest.*',
    steps: [
      {
        tool: 'init_project_context',
        required: true,
        when: '索引或图谱缺失',
        note: '生成 AGENTS.md 与 project-context；Agent 应先读再动手',
      },
    ],
  };
}

function memoryPhase(): WorkflowPhase {
  return {
    id: 'memory',
    title: '记忆（可选但推荐）',
    when: '需要历史坑或可复用模式',
    steps: [
      {
        tool: 'search_memory',
        required: false,
        when: 'start_* 未覆盖、或中途补查',
      },
      {
        tool: 'memorize_asset',
        required: false,
        when: 'Bug 验证通过 / 有可复用产出后沉淀',
        note: 'Bug → type=bugfix；功能/UI → pattern/component',
      },
    ],
  };
}

function buildPlanForScenario(scenario: WorkflowScenario, intent: string): DevWorkflowPlan {
  const commonAvoid = [
    '不要跳过 start_* 返回的 delegated plan 直接写实现代码',
    '不要在不读 project-context / graph-insights 的情况下做大改',
    '不要用 source_project/source_path 做跨仓库记忆沉淀',
  ];

  const commonMemory = [
    'start_* 会自动注入记忆；仍可用 search_memory 补查',
    'Bug 修完验证通过 → 必须 memorize_asset type=bugfix',
  ];

  switch (scenario) {
    case 'bugfix':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: '先 TBP 真因分析再修，修复后回归测试 + 可选规格闸门 + 沉淀记忆',
        firstTool: 'start_bugfix',
        firstToolArgsHint: { error_message: intent },
        phases: [
          baseContextPhase(),
          {
            id: 'orchestrate',
            title: 'Bug 修复编排（必须先调）',
            when: '收到错误描述后第一步',
            steps: [
              {
                tool: 'start_bugfix',
                required: true,
                when: '任何 Bug / 异常 / 排查任务',
                note: '返回 delegated plan；按 steps 调用 fix_bug → gentest',
              },
              {
                tool: 'code_insight',
                required: false,
                when: '需要调用链 / 影响面 / 不熟模块',
                note: 'mode=impact 或 context',
              },
            ],
          },
          {
            id: 'verify',
            title: '验证与闸门',
            when: '修复与测试通过后',
            steps: [
              {
                tool: 'check_spec',
                required: false,
                when: 'Bug 关联 docs/specs/<feature>/ 时（可传 feature_name）',
              },
              {
                tool: 'gencommit',
                required: false,
                when: '准备提交时',
              },
            ],
          },
          memoryPhase(),
        ],
        avoid: [...commonAvoid, '不要未闭合真因就改代码', '不要修完不跑测试'],
        memoryNotes: commonMemory,
      };

    case 'ui':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: 'UI 任务统一走 start_ui，按设计系统 → 模板 → 实现',
        firstTool: 'start_ui',
        firstToolArgsHint: { description: intent },
        phases: [
          baseContextPhase(),
          {
            id: 'orchestrate',
            title: 'UI 编排（必须先调）',
            when: '任何页面/组件/样式任务',
            steps: [{ tool: 'start_ui', required: true, when: 'UI 相关需求', note: '不要直接手写大段 UI 跳过设计系统' }],
          },
          memoryPhase(),
        ],
        avoid: [...commonAvoid, '不要跳过 ui_design_system / 一致性约束'],
        memoryNotes: [...commonMemory, '可复用 UI 模式 → memorize_asset type=component'],
      };

    case 'explore':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: '先图谱/上下文理解，再决定改动范围',
        firstTool: 'code_insight',
        firstToolArgsHint: { mode: 'auto', query: intent },
        phases: [
          baseContextPhase(),
          {
            id: 'insight',
            title: '代码洞察',
            when: '不熟代码、评估影响、找入口',
            steps: [
              {
                tool: 'code_insight',
                required: true,
                when: '探索架构/调用链/影响面',
                note: '长耗时默认 Task；save_to_docs=true 可落盘',
              },
            ],
          },
          {
            id: 'next',
            title: '再进入具体任务',
            when: '理解清楚后',
            steps: [
              { tool: 'start_feature', required: false, when: '确认要开发新功能' },
              { tool: 'start_bugfix', required: false, when: '确认是 Bug 修复' },
            ],
          },
        ],
        avoid: [...commonAvoid, '不要没读图谱就大范围改文件'],
        memoryNotes: commonMemory,
      };

    case 'commit':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: '用 gencommit 生成规范提交信息',
        firstTool: 'gencommit',
        phases: [
          {
            id: 'commit',
            title: '提交信息',
            when: '变更已完成、准备提交',
            steps: [{ tool: 'gencommit', required: true, when: '需要 commit message' }],
          },
        ],
        avoid: ['不要编造未发生的变更'],
        memoryNotes: [],
      };

    case 'review':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: 'code_review 出结构化审查报告',
        firstTool: 'code_review',
        phases: [
          {
            id: 'review',
            title: '代码审查',
            when: '需要评审质量/安全',
            steps: [{ tool: 'code_review', required: true, when: '审查指定文件或 diff' }],
          },
        ],
        avoid: ['不要审查时直接改代码而不说明'],
        memoryNotes: [],
      };

    case 'refactor':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: 'refactor 出计划；大改前先 code_insight',
        firstTool: 'refactor',
        phases: [
          {
            id: 'insight',
            title: '影响面（推荐）',
            when: '重构范围不清晰',
            steps: [{ tool: 'code_insight', required: false, when: 'mode=impact', note: '评估上下游' }],
          },
          {
            id: 'refactor',
            title: '重构计划',
            when: '明确重构目标后',
            steps: [{ tool: 'refactor', required: true, when: '需要分步重构方案' }],
          },
        ],
        avoid: [...commonAvoid, '不要无测试覆盖的大重构'],
        memoryNotes: commonMemory,
      };

    case 'onboard':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: 'start_onboard 生成上手路径',
        firstTool: 'start_onboard',
        phases: [
          {
            id: 'onboard',
            title: '项目上手',
            when: '新成员或新仓库',
            steps: [
              { tool: 'start_onboard', required: true, when: '需要快速理解项目' },
              { tool: 'init_project_context', required: false, when: '缺少上下文文档' },
            ],
          },
        ],
        avoid: ['不要跳过文档直接改业务代码'],
        memoryNotes: [],
      };

    case 'spec':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: '规格闸门：check_spec 通过前不写实现',
        firstTool: 'check_spec',
        phases: [
          {
            id: 'spec',
            title: '规格校验',
            when: '已有 docs/specs/<feature>/',
            steps: [
              { tool: 'check_spec', required: true, when: '实现前或修复后', note: '未通过则补全再重跑' },
              { tool: 'add_feature', required: false, when: '规格尚不存在', note: '通常由 start_feature 触发' },
            ],
          },
        ],
        avoid: ['不要 check_spec 未通过就写实现代码'],
        memoryNotes: [],
      };

    case 'memory':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'high',
        summary: '主动检索或沉淀共享记忆',
        firstTool: 'search_memory',
        firstToolArgsHint: { query: intent },
        phases: [memoryPhase()],
        avoid: ['删除记忆前不 confirm'],
        memoryNotes: [
          'delete_memory_asset 默认预览，confirm=true 才删除',
          'update_memory_asset 保留原 asset_id',
        ],
      };

    case 'unknown':
      return {
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario],
        confidence: 'low',
        summary: '意图不明确：先用 ask_user 澄清，或按最可能场景重试 workflow',
        firstTool: 'ask_user',
        phases: [
          {
            id: 'clarify',
            title: '澄清意图',
            when: '无法判断 feature / bugfix / ui / explore',
            steps: [
              {
                tool: 'ask_user',
                required: true,
                when: '缺少目标描述',
                note: '问清：新功能、修 Bug、UI、还是只读探索',
              },
              {
                tool: 'workflow',
                required: false,
                when: '澄清后带 scenario 重跑',
              },
            ],
          },
        ],
        avoid: ['不要猜测意图后直接写大量代码'],
        memoryNotes: commonMemory,
      };

    case 'feature':
    default:
      return {
        scenario: 'feature',
        scenarioLabel: SCENARIO_LABELS.feature,
        confidence: 'high',
        summary: '规格驱动开发：start_feature → add_feature → check_spec → 再实现',
        firstTool: 'start_feature',
        firstToolArgsHint: { description: intent },
        phases: [
          baseContextPhase(),
          {
            id: 'orchestrate',
            title: '功能开发编排（必须先调）',
            when: '任何新功能 / 需求实现',
            steps: [
              {
                tool: 'start_feature',
                required: true,
                when: '新功能、增强、模块开发',
                note: '返回 plan：add_feature → check_spec → estimate',
              },
              {
                tool: 'code_insight',
                required: false,
                when: '涉及多模块 / 不熟代码',
              },
            ],
          },
          {
            id: 'gate',
            title: '规格闸门',
            when: 'add_feature 完成后、写实现前',
            steps: [
              {
                tool: 'check_spec',
                required: true,
                when: 'check_spec 未通过不得写实现',
              },
            ],
          },
          memoryPhase(),
        ],
        avoid: [...commonAvoid, '不要 check_spec 未通过就写实现', '不要跳过 estimate/tasks.md'],
        memoryNotes: [...commonMemory, '可复用实现 → memorize_asset type=pattern'],
      };
  }
}

export function buildDevWorkflow(intent: string, options?: { scenario?: string }): DevWorkflowPlan {
  const detection = detectWorkflowScenario(intent, options?.scenario);
  const plan = buildPlanForScenario(detection.scenario, intent);
  plan.confidence = detection.confidence;
  return plan;
}

export function renderWorkflowMarkdown(plan: DevWorkflowPlan, intent: string): string {
  const phaseBlocks = plan.phases
    .map((phase, index) => {
      const steps = phase.steps
        .map((step) => {
          const req = step.required ? '**必须**' : '可选';
          return `  - ${req} \`${step.tool}\` — ${step.when}${step.note ? `（${step.note}）` : ''}`;
        })
        .join('\n');
      return `### ${index + 1}. ${phase.title}\n**时机**: ${phase.when}\n${steps}`;
    })
    .join('\n\n');

  const avoid = plan.avoid.map((item) => `- ${item}`).join('\n');
  const memory = plan.memoryNotes.length > 0
    ? `\n## 记忆\n${plan.memoryNotes.map((item) => `- ${item}`).join('\n')}`
    : '';

  return `# 开发工作流 · ${plan.scenarioLabel}

**识别场景**: ${plan.scenario}（置信度: ${plan.confidence}）
**摘要**: ${plan.summary}
**第一步应调**: \`${plan.firstTool}\`${plan.firstToolArgsHint ? `\n**参数提示**: \`${JSON.stringify(plan.firstToolArgsHint)}\`` : ''}

**用户意图**: ${intent || '(未提供)'}

---

## 阶段与 MCP 工具

${phaseBlocks}

## 禁止事项

${avoid}
${memory}

---

*本指南由 \`workflow\` 工具生成。请按 \`${plan.firstTool}\` 返回的 delegated plan 逐步执行，不要跳过 MCP 编排直接写代码。*`;
}
