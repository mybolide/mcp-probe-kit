export type WorkflowScenario =
  | 'feature'
  | 'bugfix'
  | 'ui'
  | 'product'
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
    patterns: [/ui|重新设计|视觉|界面设计|页面设计|组件设计|布局|样式|tailwind|shadcn|设计系统|交互|原型|响应式|美化/i],
  },
  {
    scenario: 'product',
    patterns: [/产品规划|产品目标|用户价值|目标用户|功能范围|非目标|产品需求|prd|roadmap|路线图|商业价值/i],
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
    patterns: [/上手|onboard|新项目|熟悉项目|项目概览|项目接入|接入 MCP Probe Kit|建立项目上下文|初始化项目上下文/i],
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


const PRODUCT_DELIVERY_PATTERN =
  /(?:规划|定义|梳理|制定|输出).{0,24}(?:产品目标|用户价值|目标用户|功能范围|非目标|产品需求|PRD|roadmap|路线图)|(?:产品目标|用户价值|目标用户|功能范围|非目标|产品需求|PRD|roadmap|路线图).{0,24}(?:规划|定义|梳理|制定|输出)/i;

const ONBOARD_DELIVERY_PATTERN =
  /(?:将|把|为)?.{0,12}(?:当前|现有|这个)?项目.{0,16}(?:接入|初始化|建立).{0,16}(?:MCP Probe Kit|项目上下文|开发上下文)|(?:接入|初始化|建立).{0,16}(?:MCP Probe Kit|项目上下文|开发上下文)/i;

const UI_DELIVERY_PATTERN =
  /(?:重新设计|设计|优化|改造|美化).{0,24}(?:页面|界面|组件|布局|交互|视觉|样式)|(?:页面|界面|组件|布局|交互|视觉|样式).{0,24}(?:重新设计|设计|优化|改造|美化)|(?:新增|添加|增加|实现|开发).{0,24}(?:交互组件|设计系统|响应式布局|视觉样式)/i;

const FEATURE_DELIVERY_PATTERN =
  /新功能|功能开发|需求开发|(?:新增|添加|增加|新建|实现|开发|扩展|升级|改造|建设|接入|引入|上线|提供|支持).{0,24}(?:功能|能力|接口|服务|模块|流程|机制|系统|架构|摘要|状态|特性)|(?:为|给).{0,24}(?:新增|添加|增加|新建|实现|开发|扩展|提供|支持)/i;

const SPEC_SUBJECT_PATTERN =
  /规格|spec|requirements|验收标准|验收文档|验收条件/i;

const SPEC_ACTION_PATTERN =
  /校验|检查|审查|评审|验证|补全|完善|修订|整理|对照/i;

const SPEC_ONLY_PATTERN =
  /(?:仅|只)(?:需|要|做|进行)?(?:校验|检查|审查|评审|验证|补全|完善|修订).{0,12}(?:规格|spec|requirements|验收)|不(?:实现|开发|修改|写代码)/i;

function detectPrimaryDeliveryScenario(text: string): {
  scenario: WorkflowScenario;
  confidence: 'high' | 'medium';
} | null {
  if (ONBOARD_DELIVERY_PATTERN.test(text)) {
    return { scenario: 'onboard', confidence: 'high' };
  }

  if (PRODUCT_DELIVERY_PATTERN.test(text)) {
    return { scenario: 'product', confidence: 'high' };
  }

  if (UI_DELIVERY_PATTERN.test(text)) {
    return { scenario: 'ui', confidence: 'high' };
  }

  const hasFeatureDelivery = FEATURE_DELIVERY_PATTERN.test(text);
  const hasSpecSubject = SPEC_SUBJECT_PATTERN.test(text);
  const specOnly = hasSpecSubject && SPEC_ONLY_PATTERN.test(text);

  // “新增功能，需要先生成规格”仍然是功能开发；规格只是其中一个步骤。
  if (hasFeatureDelivery && !specOnly) {
    return { scenario: 'feature', confidence: 'high' };
  }

  // 只有检查、评审、补全既有规格时，才直接进入 check_spec。
  if (hasSpecSubject && (SPEC_ACTION_PATTERN.test(text) || specOnly)) {
    return { scenario: 'spec', confidence: specOnly ? 'high' : 'medium' };
  }

  return null;
}

export const SCENARIO_LABELS: Record<WorkflowScenario, string> = {
  feature: '新功能开发',
  bugfix: 'Bug 修复',
  ui: 'UI 开发',
  product: '产品规划',
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
    product: 'product',
    prd: 'product',
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

  const primaryDelivery = detectPrimaryDeliveryScenario(text);
  if (primaryDelivery) return primaryDelivery;

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
