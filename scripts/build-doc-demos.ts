import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  MCP_APP_RESOURCES,
  buildMcpAppHtml,
  type McpAppKind,
} from '../src/lib/mcp-apps.js';

type Dict = Record<string, unknown>;

type DemoFrame = {
  input?: Dict;
  result?: Dict;
  memoryItems?: Dict[];
  memoryTotal?: number;
  selectedMemory?: Dict | null;
  planSnapshot?: Dict | null;
  notice?: string;
};

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'docs', 'demos');

const featurePlan = {
  planId: 'feature-checkout-v2-steady-a83f',
  objective: '升级结算流程：拆分支付、库存与回滚边界，同时保持旧客户端兼容',
  mode: 'delegated',
  steps: [
    { id: 'recall-memory', title: '召回历史经验', tool: 'search_memory', outputs: ['MemoryContext'] },
    { id: 'context', title: '读取项目上下文', tool: 'init_project_context', outputs: ['docs/project-context.md'] },
    { id: 'decompose-spec', title: '拆分父子规格', action: 'decompose_parent_child_spec', outputs: ['spec-manifest.json'] },
    { id: 'write-spec', title: '编写功能规格', tool: 'add_feature', outputs: ['requirements.md', 'design.md', 'tasks.md'] },
    { id: 'check-spec', title: '校验规格闭环', tool: 'check_spec', outputs: ['SpecGateResult'] },
    { id: 'estimate', title: '评估工作量', tool: 'estimate', outputs: ['EstimateResult'] },
    { id: 'prepare-memory-candidate-feature', title: '准备记忆候选', action: 'prepare_memory_candidate', outputs: ['MemoryCandidate'] },
  ],
};

function planFrame(
  completedStepIds: string[],
  currentStepId: string,
  nextStepId: string,
  evidence: Dict[],
  status = 'active',
): DemoFrame {
  return {
    input: {
      description: featurePlan.objective,
      project_root: '.',
    },
    result: {
      structuredContent: {
        metadata: { plan: featurePlan },
      },
    },
    planSnapshot: {
      found: true,
      nextStepId,
      record: {
        plan: featurePlan,
        status,
        currentStepId,
        completedStepIds,
        skippedSteps: [],
        evidence,
      },
    },
  };
}

const featureFrames: DemoFrame[] = [
  planFrame([], 'recall-memory', 'recall-memory', []),
  planFrame(
    ['recall-memory', 'context'],
    'decompose-spec',
    'decompose-spec',
    [{ kind: 'requirements', summary: '范围和兼容性约束已确认' }],
  ),
  planFrame(
    ['recall-memory', 'context', 'decompose-spec', 'write-spec'],
    'check-spec',
    'check-spec',
    [
      { kind: 'requirements', summary: '范围和兼容性约束已确认' },
      { kind: 'spec', summary: '父规格与 3 个子规格已生成' },
    ],
  ),
  planFrame(
    ['recall-memory', 'context', 'decompose-spec', 'write-spec', 'check-spec', 'estimate'],
    'prepare-memory-candidate-feature',
    'prepare-memory-candidate-feature',
    [
      { kind: 'requirements', summary: '需求范围已锁定' },
      { kind: 'spec', summary: '规格检查通过' },
      { kind: 'implementation', summary: '结算兼容层已落盘' },
      { kind: 'test', summary: '主链与回滚用例通过' },
      { kind: 'review', summary: '代码审查无阻断项' },
    ],
  ),
  planFrame(
    featurePlan.steps.map((step) => step.id),
    'prepare-memory-candidate-feature',
    '',
    [
      { kind: 'requirements', summary: '需求范围已锁定' },
      { kind: 'spec', summary: '规格检查通过' },
      { kind: 'implementation', summary: '结算兼容层已落盘' },
      { kind: 'test', summary: '主链与回滚用例通过' },
      { kind: 'review', summary: '代码审查无阻断项' },
      { kind: 'memory', summary: '可复用迁移模式已准备' },
    ],
    'converged',
  ),
];

const bugPlan = {
  planId: 'bug-checkout-race-src8-c11d',
  objective: '定位结算重复扣减：建立复现合同、锁定并发边界并补齐回归证据',
  mode: 'delegated',
  steps: [
    { id: 'src8-1', title: '定义问题差距', action: 'collect_facts', outputs: ['ReproContract'] },
    { id: 'src8-2', title: '分解现象', tool: 'code_insight', outputs: ['FailureBoundary'] },
    { id: 'src8-3', title: '设定调查目标', action: 'narrow_scope', outputs: ['InvestigationScope'] },
    { id: 'src8-4', title: '锁定真因', action: 'close_root_cause_worksheet', outputs: ['RootCauseWorksheet'] },
    { id: 'src8-5', title: '制定对策', action: 'design_countermeasure', outputs: ['FixPlan'] },
    { id: 'src8-6', title: '实施修复', action: 'implement_fix', outputs: ['Patch'] },
    { id: 'src8-7', title: '验证与回归', tool: 'gentest', outputs: ['RegressionEvidence'] },
    { id: 'src8-8', title: '准备经验候选', action: 'prepare_memory_candidate', outputs: ['MemoryCandidate'] },
  ],
};

function bugFrame(
  completedStepIds: string[],
  currentStepId: string,
  nextStepId: string,
  evidence: Dict[],
  status = 'active',
): DemoFrame {
  return {
    input: {
      description: bugPlan.objective,
      error_message: '同一订单在高并发重试时偶发重复扣减库存',
      project_root: '.',
    },
    result: { structuredContent: { metadata: { plan: bugPlan } } },
    planSnapshot: {
      found: true,
      nextStepId,
      record: {
        plan: bugPlan,
        status,
        currentStepId,
        completedStepIds,
        skippedSteps: [],
        evidence,
      },
    },
  };
}

const bugFrames: DemoFrame[] = [
  bugFrame([], 'src8-1', 'src8-1', []),
  bugFrame(
    ['src8-1', 'src8-2', 'src8-3'],
    'src8-4',
    'src8-4',
    [
      { kind: 'requirements', summary: '复现合同已稳定复现重复扣减' },
      { kind: 'other', summary: '影响边界收敛到库存幂等键生成路径' },
    ],
  ),
  bugFrame(
    ['src8-1', 'src8-2', 'src8-3', 'src8-4', 'src8-5', 'src8-6'],
    'src8-7',
    'src8-7',
    [
      { kind: 'implementation', summary: '幂等键改为订单+动作版本组合' },
      { kind: 'test', summary: '并发与重试回归正在执行' },
    ],
  ),
  bugFrame(
    bugPlan.steps.map((step) => step.id),
    'src8-8',
    '',
    [
      { kind: 'requirements', summary: '复现合同已关闭' },
      { kind: 'implementation', summary: '根因对策已实施' },
      { kind: 'test', summary: '并发回归 1200 次无重复扣减' },
      { kind: 'review', summary: '审查确认无新竞态窗口' },
      { kind: 'memory', summary: '回归案例候选已准备' },
    ],
    'converged',
  ),
];

const memoryItems: Dict[] = [
  {
    id: 'mem-checkout-compat',
    name: '结算接口兼容迁移模式',
    type: 'pattern',
    summary: '通过读旧写新和双口径校验完成无停机迁移。',
    content: '适用于旧系统不能停机、数据口径需要渐进收敛的场景。先引入兼容层和影子校验，再切换读流量，最后清理旧路径。',
    sourceProject: 'alphaloop',
    status: 'active',
    tags: ['migration', 'compatibility'],
    evidence: ['双写差异连续 7 天为 0', '回滚演练通过'],
    applicability: '仅在新旧模型可以建立确定映射时使用。',
    updatedAt: '2026-08-03T04:20:00Z',
  },
  {
    id: 'mem-node20-sidecar',
    name: 'Node 20 Sidecar 降级边界',
    type: 'regression_case',
    summary: '托管 GitNexus 仅在兼容 Node 版本启用，显式命令不应被提前拦截。',
    content: '显式 MCP_GITNEXUS_COMMAND/MCP_GITNEXUS_ARGS 必须优先执行；Node 20/21 仅禁用托管安装，不影响系统 CLI。',
    sourceProject: 'mcp-probe-kit',
    status: 'active',
    tags: ['gitnexus', 'node20'],
    evidence: ['Node 20.20.2 全量 435/435', '三平台 Sidecar CI 通过'],
    applicability: '适用于具有原生依赖和运行时兼容矩阵的 Sidecar。',
    updatedAt: '2026-08-03T04:44:00Z',
  },
  {
    id: 'mem-ui-quality-gate',
    name: 'UI 交付前置质量门',
    type: 'pattern',
    summary: '用可机检红线阻止占位符、低对比度和模板化 AI 风格。',
    content: '设计系统、代码审查与 UI 工作流共享同一质量约束；交付前检查 WCAG、交互状态、间距、字体层级和占位符。',
    sourceProject: 'mcp-probe-kit',
    status: 'active',
    tags: ['ui', 'quality'],
    evidence: ['quality-constraints 单源', 'UI property tests 通过'],
    applicability: '适用于 Web 和跨端 UI 交付。',
    updatedAt: '2026-08-02T13:18:00Z',
  },
];

const memoryFrames: DemoFrame[] = memoryItems.map((selectedMemory, index) => ({
  memoryItems,
  memoryTotal: memoryItems.length,
  selectedMemory,
  notice: index === 0 ? '语义检索命中 3 条已验证经验' : '',
}));

const convergenceFrames: DemoFrame[] = [
  {
    input: { plan_id: featurePlan.planId },
    result: {
      structuredContent: {
        planId: featurePlan.planId,
        passed: false,
        blockers: ['仍有未完成步骤：check-spec、estimate', '测试证据尚未写入计划检查点'],
        incompleteStepIds: ['check-spec', 'estimate'],
        missingEvidenceKinds: ['test', 'review'],
        memoryWriteAllowed: false,
      },
    },
  },
  {
    input: { plan_id: featurePlan.planId },
    result: {
      structuredContent: {
        planId: featurePlan.planId,
        passed: false,
        blockers: ['代码审查证据尚未写入计划检查点'],
        incompleteStepIds: [],
        missingEvidenceKinds: ['review'],
        memoryWriteAllowed: false,
      },
    },
  },
  {
    input: { plan_id: featurePlan.planId },
    result: {
      structuredContent: {
        planId: featurePlan.planId,
        passed: true,
        blockers: [],
        incompleteStepIds: [],
        missingEvidenceKinds: [],
        memoryWriteAllowed: true,
      },
    },
  },
];

const productPlan = {
  planId: 'product-agent-console-v1',
  objective: '为团队设计可追踪 Agent 执行状态的研发控制台',
  steps: [
    { id: 'product-brief', title: '产品定义', action: 'write_product_brief' },
    { id: 'prd', title: 'PRD', action: 'write_prd' },
    { id: 'prototype', title: '交互原型', action: 'write_prototype' },
    { id: 'design-system', title: '设计系统', tool: 'ui_design_system' },
    { id: 'html', title: 'HTML 原型', action: 'build_html_prototype' },
    { id: 'handoff', title: '进入开发', tool: 'start_feature' },
  ],
};

const productFrames: DemoFrame[] = [
  {
    input: {
      product_name: 'Agent 研发控制台',
      target_users: '研发负责人、Agent 操作者',
      constraints: '桌面优先；必须保留移动端关键操作',
    },
    result: {
      structuredContent: {
        metadata: {
          plan: productPlan,
          productBrief: {
            targetUsers: '研发负责人、Agent 操作者',
            constraints: '桌面优先；必须保留移动端关键操作',
          },
        },
      },
    },
  },
];

async function writeDemo(
  fileName: string,
  kind: McpAppKind,
  frames: DemoFrame[],
  intervalMs = 1800,
): Promise<void> {
  const resource = MCP_APP_RESOURCES.find((item) => item.kind === kind);
  if (!resource) throw new Error(`Missing MCP App resource: ${kind}`);
  const html = buildMcpAppHtml(resource, {
    demo: {
      enabled: true,
      autoplay: true,
      intervalMs,
      frames,
    },
  });
  const normalizedHtml = `${html.replace(/[ \t]+$/gm, '').trimEnd()}\n`;
  await writeFile(resolve(outputDir, fileName), normalizedHtml, 'utf8');
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeDemo('feature-workbench.html', 'feature-workbench', featureFrames, 1650),
  writeDemo('bug-workbench.html', 'bug-workbench', bugFrames, 1800),
  writeDemo('memory-center.html', 'memory-center', memoryFrames, 2100),
  writeDemo('convergence-gate.html', 'convergence', convergenceFrames, 1900),
  writeDemo('product-workbench.html', 'product-workbench', productFrames, 2500),
]);

console.log(`[build-doc-demos] wrote 5 demos to ${outputDir}`);
