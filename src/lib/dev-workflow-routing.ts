import type {
  WorkflowRouteResult,
  WorkflowRoutingCandidate,
  WorkflowRoutingDecision,
  WorkflowRoutingSource,
  WorkflowScenario,
} from './workflow-routing-contract.js';

export type {
  WorkflowRouteResult,
  WorkflowRoutingCandidate,
  WorkflowRoutingCandidateStatus,
  WorkflowRoutingDecision,
  WorkflowRoutingSource,
  WorkflowScenario,
} from './workflow-routing-contract.js';

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
  routingDecision?: WorkflowRoutingDecision;
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
    scenario: 'architecture',
    patterns: [/架构设计|目标架构|架构评审|架构迁移|架构漂移|模块边界|数据所有权|依赖方向|公共契约|ADR|architecture design|architecture review/i],
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
  /新功能|功能开发|需求开发|(?:新增|添加|增加|新建|实现|开发|扩展|升级|改造|建设|接入|引入|上线|提供|支持).{0,24}(?:功能|能力|接口|服务|模块|流程|机制|系统|架构|摘要|状态|特性|页面|组件)|(?:为|给).{0,24}(?:新增|添加|增加|新建|实现|开发|扩展|提供|支持)/i;

const ARCHITECTURE_DELIVERY_PATTERN =
  /(?:评估|设计|规划|审查|评审|验证|迁移|拆分|收口|核验).{0,24}(?:架构|模块边界|依赖方向|数据所有权|公共契约|系统拆分|架构漂移)|(?:架构|模块边界|依赖方向|数据所有权|公共契约|系统拆分|架构漂移).{0,24}(?:评估|设计|规划|审查|评审|验证|迁移|拆分|收口|核验)/i;

const BUGFIX_DELIVERY_PATTERN =
  /(?:修复|排查|定位|解决|复现).{0,24}(?:bug|错误|异常|报错|失败|崩溃|crash|不生效|回归|500|typeerror|referenceerror)|(?:bug|错误|异常|报错|失败|崩溃|crash|不生效|回归|500|typeerror|referenceerror).{0,24}(?:修复|排查|定位|解决|复现)/i;

const SPEC_SUBJECT_PATTERN =
  /规格|spec|requirements|验收标准|验收文档|验收条件/i;

const SPEC_ACTION_PATTERN =
  /校验|检查|审查|评审|验证|补全|完善|修订|整理|对照/i;

const SPEC_ONLY_PATTERN =
  /(?:仅|只)(?:需|要|做|进行)?(?:校验|检查|审查|评审|验证|补全|完善|修订).{0,12}(?:规格|spec|requirements|验收)|不(?:实现|开发|修改|写代码)/i;

type RoutableScenario = Exclude<WorkflowScenario, 'unknown'>;

interface DeliveryRule {
  id: string;
  scenario: RoutableScenario;
  matches: (text: string) => boolean;
  reason: string;
}

const DELIVERY_RULES: DeliveryRule[] = [
  {
    id: 'onboard-delivery',
    scenario: 'onboard',
    matches: (text) => ONBOARD_DELIVERY_PATTERN.test(text),
    reason: '命中项目接入或上下文初始化交付信号',
  },
  {
    id: 'product-delivery',
    scenario: 'product',
    matches: (text) => PRODUCT_DELIVERY_PATTERN.test(text),
    reason: '命中产品目标、用户价值或范围规划交付信号',
  },
  {
    id: 'ui-delivery',
    scenario: 'ui',
    matches: (text) => UI_DELIVERY_PATTERN.test(text),
    reason: '命中页面、组件、视觉或交互实施信号',
  },
  {
    id: 'architecture-delivery',
    scenario: 'architecture',
    matches: (text) => ARCHITECTURE_DELIVERY_PATTERN.test(text),
    reason: '命中架构边界、依赖、数据所有权或漂移交付信号',
  },
  {
    id: 'bugfix-delivery',
    scenario: 'bugfix',
    matches: (text) => BUGFIX_DELIVERY_PATTERN.test(text),
    reason: '命中问题复现、定位或修复交付信号',
  },
  {
    id: 'feature-delivery',
    scenario: 'feature',
    matches: (text) => {
      const hasSpecSubject = SPEC_SUBJECT_PATTERN.test(text);
      const specOnly = hasSpecSubject && SPEC_ONLY_PATTERN.test(text);
      return FEATURE_DELIVERY_PATTERN.test(text) && !specOnly;
    },
    reason: '命中新功能、增强、模块或服务实施信号',
  },
  {
    id: 'spec-only',
    scenario: 'spec',
    matches: (text) => SPEC_SUBJECT_PATTERN.test(text) && SPEC_ONLY_PATTERN.test(text),
    reason: '明确限定为只检查或完善规格，不进入实现',
  },
  {
    id: 'spec-review',
    scenario: 'spec',
    matches: (text) =>
      SPEC_SUBJECT_PATTERN.test(text)
      && SPEC_ACTION_PATTERN.test(text)
      && !FEATURE_DELIVERY_PATTERN.test(text),
    reason: '命中既有规格检查、评审或补全信号',
  },
];

const DELIVERY_DOMINANCE: Partial<Record<RoutableScenario, RoutableScenario[]>> = {
  onboard: ['feature', 'explore'],
  product: ['feature', 'ui', 'spec'],
  ui: ['feature', 'spec'],
  architecture: ['explore', 'review'],
  feature: ['spec'],
  bugfix: ['explore'],
};

const EXPLICIT_SCENARIO_MAP: Record<string, WorkflowScenario> = {
  feature: 'feature',
  bugfix: 'bugfix',
  bug: 'bugfix',
  ui: 'ui',
  product: 'product',
  prd: 'product',
  architecture: 'architecture',
  arch: 'architecture',
  explore: 'explore',
  commit: 'commit',
  review: 'review',
  refactor: 'refactor',
  onboard: 'onboard',
  spec: 'spec',
  memory: 'memory',
  auto: 'unknown',
};

export const SCENARIO_LABELS: Record<WorkflowScenario, string> = {
  feature: '新功能开发',
  bugfix: 'Bug 修复',
  ui: 'UI 开发',
  product: '产品规划',
  architecture: '架构评估 / 设计 / 漂移核验',
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

function mergeDeliveryMatches(text: string): WorkflowRoutingCandidate[] {
  const merged = new Map<RoutableScenario, WorkflowRoutingCandidate>();
  for (const rule of DELIVERY_RULES) {
    if (!rule.matches(text)) continue;
    const current = merged.get(rule.scenario);
    if (current) {
      current.score += 1;
      current.matchedRuleIds.push(rule.id);
      current.reason = `${current.reason}；${rule.reason}`;
      continue;
    }
    merged.set(rule.scenario, {
      scenario: rule.scenario,
      score: 1,
      matchedRuleIds: [rule.id],
      status: 'conflict',
      reason: rule.reason,
    });
  }
  return [...merged.values()].sort(compareRoutingCandidates);
}

function applyDeliveryDominance(
  candidates: WorkflowRoutingCandidate[],
): WorkflowRoutingCandidate[] {
  const present = new Set(candidates.map((candidate) => candidate.scenario));
  return candidates.map((candidate) => {
    const suppressors = candidates
      .filter((other) => other.scenario !== candidate.scenario)
      .filter((other) => DELIVERY_DOMINANCE[other.scenario]?.includes(candidate.scenario))
      .sort(compareRoutingCandidates);
    const suppressor = suppressors[0];
    if (!suppressor || !present.has(suppressor.scenario)) return candidate;
    return {
      ...candidate,
      status: 'suppressed' as const,
      suppressedBy: suppressor.scenario,
      reason: `${candidate.reason}；作为 ${suppressor.scenario} 的嵌套步骤被抑制`,
    };
  });
}

function compareRoutingCandidates(
  a: WorkflowRoutingCandidate,
  b: WorkflowRoutingCandidate,
): number {
  return b.score - a.score || a.scenario.localeCompare(b.scenario);
}

function buildSelectedDecision(
  source: WorkflowRoutingSource,
  selected: WorkflowRoutingCandidate,
  candidates: WorkflowRoutingCandidate[],
  reason: string,
  confidence: 'high' | 'medium',
): WorkflowRouteResult {
  const normalized = candidates.map((candidate) => ({
    ...candidate,
    status: candidate.scenario === selected.scenario
      ? 'selected' as const
      : candidate.status,
  }));
  return {
    scenario: selected.scenario,
    confidence,
    routingDecision: {
      source,
      selectedScenario: selected.scenario,
      conflict: false,
      requiresClarification: false,
      reason,
      candidates: normalized,
    },
  };
}

function buildConflictDecision(
  source: WorkflowRoutingSource,
  candidates: WorkflowRoutingCandidate[],
  reason: string,
): WorkflowRouteResult {
  return {
    scenario: 'unknown',
    confidence: 'low',
    routingDecision: {
      source,
      selectedScenario: null,
      conflict: true,
      requiresClarification: true,
      reason,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        status: candidate.status === 'suppressed' ? 'suppressed' : 'conflict',
      })),
    },
  };
}

export function detectWorkflowRoute(intent: string, explicit?: string): WorkflowRouteResult {
  const normalizedExplicit = (explicit || '').trim().toLowerCase();
  const explicitScenario = EXPLICIT_SCENARIO_MAP[normalizedExplicit];
  if (normalizedExplicit && normalizedExplicit !== 'auto' && explicitScenario && explicitScenario !== 'unknown') {
    const candidate: WorkflowRoutingCandidate = {
      scenario: explicitScenario,
      score: Number.MAX_SAFE_INTEGER,
      matchedRuleIds: [`explicit:${normalizedExplicit}`],
      status: 'selected',
      reason: `用户显式指定 scenario=${normalizedExplicit}`,
    };
    return buildSelectedDecision(
      'explicit',
      candidate,
      [candidate],
      candidate.reason,
      'high',
    );
  }

  const text = intent.trim();
  if (!text) {
    return {
      scenario: 'unknown',
      confidence: 'low',
      routingDecision: {
        source: 'fallback',
        selectedScenario: null,
        conflict: false,
        requiresClarification: true,
        reason: '未提供完整任务摘要，无法选择第一个工具',
        candidates: [],
      },
    };
  }

  const deliveryCandidates = applyDeliveryDominance(mergeDeliveryMatches(text));
  const activeDelivery = deliveryCandidates
    .filter((candidate) => candidate.status !== 'suppressed')
    .sort(compareRoutingCandidates);
  if (activeDelivery.length === 1) {
    return buildSelectedDecision(
      'delivery-rules',
      activeDelivery[0],
      deliveryCandidates,
      `唯一主交付意图为 ${activeDelivery[0].scenario}；嵌套步骤按显式支配表处理`,
      'high',
    );
  }
  if (activeDelivery.length > 1) {
    return buildConflictDecision(
      'delivery-rules',
      deliveryCandidates,
      `同时命中多个独立主交付意图：${activeDelivery.map((item) => item.scenario).join(', ')}`,
    );
  }

  const keywordCandidates = SCENARIO_PATTERNS
    .map((entry) => ({
      scenario: entry.scenario as RoutableScenario,
      score: scoreScenario(text, entry.scenario),
      matchedRuleIds: [`keyword:${entry.scenario}`],
      status: 'conflict' as const,
      reason: `命中 ${entry.scenario} 关键词规则`,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(compareRoutingCandidates);
  if (keywordCandidates.length === 0) {
    return {
      scenario: 'unknown',
      confidence: 'low',
      routingDecision: {
        source: 'fallback',
        selectedScenario: null,
        conflict: false,
        requiresClarification: true,
        reason: '未检测到足够稳定的任务类型信号，不默认猜测为 feature',
        candidates: [],
      },
    };
  }

  const topScore = keywordCandidates[0].score;
  const topCandidates = keywordCandidates.filter((candidate) => candidate.score === topScore);
  if (topCandidates.length > 1) {
    return buildConflictDecision(
      'keyword-scores',
      topCandidates,
      `关键词评分并列：${topCandidates.map((item) => item.scenario).join(', ')}`,
    );
  }
  return buildSelectedDecision(
    'keyword-scores',
    topCandidates[0],
    keywordCandidates,
    `${topCandidates[0].scenario} 的关键词评分唯一最高`,
    topScore >= 2 ? 'high' : 'medium',
  );
}

export function detectWorkflowScenario(intent: string, explicit?: string): {
  scenario: WorkflowScenario;
  confidence: 'high' | 'medium' | 'low';
} {
  const route = detectWorkflowRoute(intent, explicit);
  return { scenario: route.scenario, confidence: route.confidence };
}
