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
  firstTool: string | null;
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
    patterns: [/规格|spec|requirements|check_spec|验收标准|规格验收|验收文档|验收条件/i],
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

export const SCENARIO_LABELS: Record<WorkflowScenario, string> = {
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
  if (!entry) return 0;
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
  if (!text) return { scenario: 'unknown', confidence: 'low' };

  const scores = SCENARIO_PATTERNS.map((item) => ({
    scenario: item.scenario,
    score: scoreScenario(text, item.scenario),
  })).sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];
  if (!top || top.score === 0) return { scenario: 'feature', confidence: 'low' };
  if (second && top.score === second.score) {
    return { scenario: top.scenario, confidence: 'medium' };
  }
  return { scenario: top.scenario, confidence: top.score >= 2 ? 'high' : 'medium' };
}
