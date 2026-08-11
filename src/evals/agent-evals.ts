import { buildDelegatedPlanContract } from '../lib/delegated-plan-contract.js';
import { buildDevWorkflow } from '../lib/dev-workflow.js';
import { buildMemoryPlanStep } from '../lib/memory-orchestration.js';
import {
  isMemorySearchEligible,
  isNegativeMemoryType,
  type MemorySearchResult,
} from '../lib/memory-model.js';
import { classifyMemoryScope, rankMemorySearchResults } from '../lib/memory-ranking.js';
import { buildSrc8DelegatedPlan } from '../lib/src8-plan.js';
import type { MemoryConfig } from '../lib/memory-config.js';
import { TOOL_CATALOG } from '../server/tool-catalog.js';
import { WORKFLOW_SELECTION_GUIDE } from '../lib/workflow-selection-guide.js';
import type {
  AgentEvalCaseResult,
  AgentEvalCategory,
  AgentEvalReport,
} from './agent-eval-types.js';

interface EvalDefinition {
  id: string;
  category: AgentEvalCategory;
  description: string;
  expected: unknown;
  evaluate: () => unknown;
  matches: (actual: unknown) => boolean;
}

const memoryConfig: MemoryConfig = {
  qdrantUrl: '',
  qdrantApiKey: '',
  qdrantCollection: 'eval',
  embeddingUrl: '',
  embeddingApiKey: '',
  embeddingModel: 'eval',
  embeddingProvider: 'ollama',
  searchLimit: 3,
  summaryMaxChars: 280,
  searchShowSource: false,
  searchMinScore: 0,
  repoId: 'acme/orders',
  projectPriorityBoost: 0.08,
  injectionContentMaxChars: 1500,
  injectionTotalMaxChars: 9000,
  searchContentMaxChars: 1500,
  searchTotalMaxChars: 12000,
};

export function runAgentEvals(now: Date = new Date()): AgentEvalReport {
  const cases = evalDefinitions().map(runCase);
  const categories = [...new Set(cases.map((item) => item.category))].map((category) => {
    const categoryCases = cases.filter((item) => item.category === category);
    const failed = categoryCases.filter((item) => !item.passed).length;
    return {
      category,
      passed: failed === 0,
      total: categoryCases.length,
      failed,
    };
  });
  const failed = cases.filter((item) => !item.passed).length;
  return {
    passed: failed === 0,
    generatedAt: now.toISOString(),
    totals: {
      cases: cases.length,
      passed: cases.length - failed,
      failed,
    },
    categories,
    cases,
  };
}

function runCase(definition: EvalDefinition): AgentEvalCaseResult {
  try {
    const actual = definition.evaluate();
    return {
      id: definition.id,
      category: definition.category,
      description: definition.description,
      passed: definition.matches(actual),
      expected: definition.expected,
      actual,
    };
  } catch (error) {
    return {
      id: definition.id,
      category: definition.category,
      description: definition.description,
      passed: false,
      expected: definition.expected,
      actual: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function evalDefinitions(): EvalDefinition[] {
  return [
    {
      id: 'workflow-auto-is-guide-only',
      category: 'routing',
      description: 'workflow auto 必须只提供 Agent 选择指南，不得从自然语言猜 firstTool',
      expected: { scenario: 'unknown', firstTool: null, source: 'guide' },
      evaluate: () => {
        const plan = buildDevWorkflow('实现订单导出功能，同时修复支付错误');
        return {
          scenario: plan.scenario,
          firstTool: plan.firstTool,
          source: plan.routingDecision?.source,
        };
      },
      matches: (actual) => {
        const value = actual as Record<string, unknown>;
        return value.scenario === 'unknown'
          && value.firstTool === null
          && value.source === 'guide';
      },
    },
    {
      id: 'workflow-selection-guide-core-coverage',
      category: 'tool-triggering',
      description: 'workflow 兜底指南必须覆盖主要工具选择分支，而不是依赖中央意图分类',
      expected: ['start_feature', 'start_bugfix', 'start_ui', 'architecture', 'code_insight', 'gentest', 'code_review', 'refactor', 'search_memory', 'resume_plan'],
      evaluate: () => WORKFLOW_SELECTION_GUIDE.map((item) => item.firstTool).join('\n'),
      matches: (actual) => [
        'start_feature',
        'start_bugfix',
        'start_ui',
        'architecture',
        'code_insight',
        'gentest',
        'code_review',
        'refactor',
        'search_memory',
        'resume_plan',
      ].every((tool) => String(actual).includes(tool)),
    },
    routeCase('route-feature', 'feature', 'start_feature'),
    {
      id: 'route-feature-with-spec-phase',
      category: 'routing',
      description: 'Agent 已选择 feature 场景后，规格等内部步骤仍由 start_feature 编排',
      expected: { scenario: 'feature', firstTool: 'start_feature' },
      evaluate: () => {
        const plan = buildDevWorkflow(
          '为现有 TypeScript 项目新增一个只读的健康检查摘要功能，需要先生成规格、评估影响范围、补充测试，并在完成后进行收敛检查。',
          { scenario: 'feature' },
        );
        return { scenario: plan.scenario, firstTool: plan.firstTool };
      },
      matches: (actual) => {
        const value = actual as Record<string, unknown>;
        return value.scenario === 'feature' && value.firstTool === 'start_feature';
      },
    },
    routeCase('route-bugfix', 'bugfix', 'start_bugfix'),
    routeCase('route-ui', 'ui', 'start_ui'),
    routeCase('route-explore', 'explore', 'code_insight'),
    routeCase('route-review', 'review', 'code_review'),
    routeCase('route-refactor', 'refactor', 'refactor'),
    routeCase('route-onboard', 'onboard', 'start_onboard'),
    routeCase('route-spec', 'spec', 'check_spec'),
    routeCase('route-memory', 'memory', 'search_memory', true),
    {
      id: 'route-memory-disabled',
      category: 'routing',
      description: 'Memory 未配置时不得路由到不可见的 search_memory',
      expected: null,
      evaluate: () => buildDevWorkflow('eval memory disabled', { scenario: 'memory', memoryAvailable: false }).firstTool,
      matches: (actual) => actual === null,
    },
    {
      id: 'feature-args-complete',
      category: 'parameter-construction',
      description: '复杂功能参数必须保留完整摘要并启用自动规格布局',
      expected: { description: '完整任务摘要', spec_layout: 'auto' },
      evaluate: () => {
        const description = '升级认证架构：覆盖 API、客户端兼容、Memory 和分阶段迁移';
        return buildDevWorkflow(description, { scenario: 'feature' }).firstToolArgsHint;
      },
      matches: (actual) => {
        const value = actual as Record<string, unknown> | undefined;
        return value?.spec_layout === 'auto' && String(value.description).includes('升级认证架构');
      },
    },
    {
      id: 'feature-does-not-route-to-add-feature',
      category: 'parameter-construction',
      description: '复杂需求不得把 add_feature 当作首入口',
      expected: 'start_feature',
      evaluate: () => buildDevWorkflow('实现跨模块协议和记忆升级', { scenario: 'feature' }).firstTool,
      matches: (actual) => actual === 'start_feature',
    },
    {
      id: 'plan-state-policy',
      category: 'plan-compliance',
      description: 'Delegated Plan 必须声明 Heartbeat、Resume 与 Converge 纪律',
      expected: ['plan_heartbeat', 'resume_plan', 'converge'],
      evaluate: () => {
        const plan = buildDelegatedPlanContract({
          planId: 'eval-plan',
          workflow: 'feature',
          workflowVersion: '4.0.0',
          objective: '验证计划状态纪律',
          completionCriteria: ['测试通过'],
          steps: [{ id: 'implement', action: '实施', outputs: ['代码'] }],
        });
        return {
          policy: plan.executionStatePolicy,
          rules: plan.globalRules,
        };
      },
      matches: (actual) => {
        const value = actual as {
          policy?: Record<string, unknown>;
          rules?: string[];
        };
        const rules = value.rules?.join('\n') ?? '';
        return value.policy?.heartbeatTool === 'plan_heartbeat'
          && value.policy?.resumeTool === 'resume_plan'
          && value.policy?.convergenceTool === 'converge'
          && rules.includes('converge')
          && rules.includes('长期记忆');
      },
    },
    {
      id: 'feature-memory-after-converge',
      category: 'plan-compliance',
      description: 'Feature 计划只能准备记忆候选，不能在收敛前直接写长期记忆',
      expected: 'prepare_memory_candidate without memorize_asset tool',
      evaluate: () => buildMemoryPlanStep('feature'),
      matches: (actual) => {
        const step = actual as Record<string, unknown>;
        return step.action === 'prepare_memory_candidate'
          && step.tool === undefined
          && String(step.note).includes('converge passed=true');
      },
    },
    {
      id: 'src8-memory-after-converge',
      category: 'plan-compliance',
      description: 'SRC-8 第八步只准备候选并等待 Converge',
      expected: 'candidate only',
      evaluate: () => buildSrc8DelegatedPlan({ error_message: 'eval error' }).steps.at(-1),
      matches: (actual) => {
        const step = actual as Record<string, unknown> | undefined;
        return step?.id === 'src8-8'
          && step.tool === undefined
          && String(step.note).includes('converge passed=true');
      },
    },
    {
      id: 'memory-project-priority',
      category: 'memory-safety',
      description: '同等相关度时当前项目事实优先于共享经验',
      expected: ['project', 'shared'],
      evaluate: () => rankMemorySearchResults([
        memoryResult('shared', 0.84, 'other/repo'),
        memoryResult('project', 0.8, 'acme/orders'),
      ], { config: memoryConfig }).map((item) => item.id),
      matches: (actual) => JSON.stringify(actual) === JSON.stringify(['project', 'shared']),
    },
    {
      id: 'memory-relevance-not-masked',
      category: 'memory-safety',
      description: '项目优先不能掩盖明显更高相关的共享经验',
      expected: 'shared',
      evaluate: () => rankMemorySearchResults([
        memoryResult('project', 0.55, 'acme/orders'),
        memoryResult('shared', 0.95, 'other/repo'),
      ], { config: memoryConfig })[0]?.id,
      matches: (actual) => actual === 'shared',
    },
    {
      id: 'memory-inactive-filter',
      category: 'memory-safety',
      description: '过期和被替代记忆不能进入正常研发检索',
      expected: [false, false, true],
      evaluate: () => [
        isMemorySearchEligible({ status: 'active', expiresAt: '2020-01-01T00:00:00.000Z' }),
        isMemorySearchEligible({ status: 'active', supersededBy: 'asset-new' }),
        isMemorySearchEligible({ status: 'active' }),
      ],
      matches: (actual) => JSON.stringify(actual) === JSON.stringify([false, false, true]),
    },
    {
      id: 'negative-memory-types',
      category: 'memory-safety',
      description: '三种负面经验必须被数据模型识别',
      expected: [true, true, true],
      evaluate: () => ['failed_approach', 'false_root_cause', 'regression_case'].map(isNegativeMemoryType),
      matches: (actual) => JSON.stringify(actual) === JSON.stringify([true, true, true]),
    },
    catalogCase('catalog-start-feature', 'start_feature', ['完整范围', 'spec_layout=auto', 'parent-child']),
    catalogCase('catalog-add-feature', 'add_feature', ['不得', '首个入口', 'start_feature']),
    catalogCase('catalog-plan-heartbeat', 'plan_heartbeat', ['完整 plan', '证据', 'revision']),
    catalogCase('catalog-resume-plan', 'resume_plan', ['中断', '下一可执行步骤']),
    catalogCase('catalog-converge', 'converge', ['需求', '测试', '审查', '沉淀记忆']),
    catalogCase('catalog-memorize', 'memorize_asset', ['MemoryCandidate', 'converge passed=true']),
  ];
}

function routeCase(
  id: string,
  scenario: string,
  expectedTool: string,
  memoryAvailable = false
): EvalDefinition {
  return {
    id,
    category: 'routing',
    description: `${scenario} 场景必须路由到 ${expectedTool}`,
    expected: expectedTool,
    evaluate: () => buildDevWorkflow(`eval ${scenario}`, { scenario, memoryAvailable }).firstTool,
    matches: (actual) => actual === expectedTool,
  };
}

function catalogCase(id: string, toolName: string, requiredTerms: string[]): EvalDefinition {
  return {
    id,
    category: 'tool-triggering',
    description: `${toolName} 顶层调用说明必须包含关键触发条件`,
    expected: requiredTerms,
    evaluate: () => TOOL_CATALOG.find((item) => item.name === toolName)?.skillRoute.whenToCall ?? '',
    matches: (actual) => requiredTerms.every((term) => String(actual).includes(term)),
  };
}

function memoryResult(id: string, score: number, sourceProject: string): MemorySearchResult {
  return {
    id,
    score,
    name: id,
    type: 'bugfix',
    description: id,
    summary: id,
    content: id,
    tags: ['root-cause'],
    confidence: 0.8,
    sourceProject,
  };
}

export function describeMemoryScope(result: MemorySearchResult): string {
  return classifyMemoryScope(result, memoryConfig);
}
