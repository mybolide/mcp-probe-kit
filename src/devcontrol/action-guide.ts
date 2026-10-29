import { V5_DEVC_ACTIONS, V5_DEVC_ACTION_GROUPS } from './action-catalog.js';

/**
 * Zero-side-effect discovery. Project root is intentionally unnecessary here:
 * agents can orient themselves before choosing a target Git repository.
 */
const FLOWS = {
  start: {
    description: '恢复项目：先读 SQLite History，再确认已有任务和审批',
    actions: ['onboard','next','list','execution-contract'],
    example: {action:'onboard',project_root:'/ABSOLUTE/GIT/PROJECT',input:{}},
    caution: 'Existing tasks take precedence. Do not regenerate a plan on resume.',
  },
  feature: {
    description: '新需求 → 设计 → 原子任务规划 → 下一轮二次 Review → 精确哈希确认',
    actions: ['feature-create','feature-save','feature-validate','feature-task-brief','feature-task-review','feature-task-stage','feature-task-propose','feature-task-second-review','feature-task-approve'],
    example: {action:'feature-create',project_root:'/ABSOLUTE/GIT/PROJECT',input:{name:'short-feature-slug',description:'One explicit user goal',layout:'flat'}},
    caution: 'The same development Agent may perform the second Review, but ONLY as a new host action and a later work round after the proposal was staged. Record concrete findings tied to the exact plan hash; do not plan and review in one pass. Ordinary leaf tasks need no separate Owner approval. Frozen scope changes still need Owner authorization. Draft children are not claimable.',
  },
  planning: {
    description: '完整版本计划审核与冻结',
    actions: ['release-plan','plan-review','plan-propose','plan-approve','release-work-review','release-work-stage','release-work-approve'],
    example: {action:'release-plan',project_root:'/ABSOLUTE/GIT/PROJECT',input:{}},
    caution: 'One development Agent can complete a documented self-review tied to the exact plan hash. Owner decides new version scope or material changes, not each ordinary leaf task.',
  },
  task: {
    description: '领取当前已批准任务，按冻结合同逐项开发',
    actions: ['next','execution-contract','claim','check','renew','release'],
    example: {action:'next',project_root:'/ABSOLUTE/GIT/PROJECT',input:{}},
    caution: 'Inspect exact task ID, dependencies and allowedPaths before claim; no scope expansion.',
  },
  verification: {
    description: '代码提交、报告真实证据、核查并验证',
    actions: ['check','complete','report','gate-review','verify','trace'],
    example: {action:'trace',project_root:'/ABSOLUTE/GIT/PROJECT',input:{id:'APPROVED-TASK-ID'}},
    caution: 'Agent executes real tests; custom gate-review records independent outcome, not a test executed by MCP. Evidence alone is not Verified.',
  },
  bug: {
    description: '缺陷记录、调查步骤和关联获批任务',
    actions: ['work-record','bug-get','bug-step-save','bug-task-link'],
    example: {action:'work-items',project_root:'/ABSOLUTE/GIT/PROJECT',input:{kind:'bug'}},
    caution: 'Do not modify an active frozen task to accommodate an unrelated bug without review.',
  },
  idea: {
    description: '新想法评估 → 独立审核 → Owner 决定',
    actions: ['idea-capture','idea-assess','idea-review','idea-decide'],
    example: {action:'idea-list',project_root:'/ABSOLUTE/GIT/PROJECT',input:{}},
    caution: 'An idea never automatically modifies a frozen execution contract.',
  },
  scope: {
    description: '冻结范围变更或新增任务的独立评审',
    actions: ['release-work-scope-review','release-work-scope-stage','release-work-scope-independent-review','release-work-scope-approve','release-work-incremental-review','release-work-incremental-stage','release-work-incremental-independent-review','release-work-incremental-approve'],
    example: {action:'release-work-scope-get',project_root:'/ABSOLUTE/GIT/PROJECT',input:{release:'V0.1'}},
    caution: 'No unapproved added files, dependencies or extra objectives.',
  },
  architecture: {
    description: '架构文档/契约变更及不可变工件审批',
    actions: ['architecture-sync','artifact-get','artifact-check','artifact-stage','artifact-independent-review','artifact-approve'],
    example: {action:'artifact-check',project_root:'/ABSOLUTE/GIT/PROJECT',input:{}},
    caution: 'Never invent approval or overwrite an Owner-controlled ADR.',
  },
} as const;

export function devControlGuide(input: Record<string, unknown> = {}): Record<string, unknown> {
  const requested = typeof input.intent === 'string' ? input.intent.trim().toLowerCase() : '';
  const alias: Record<string, keyof typeof FLOWS> = {
    '开始':'start','继续':'start','恢复':'start','需求':'feature','功能':'feature',
    '设计':'feature','任务':'task','开发':'task','测试':'verification','验收':'verification',
    '缺陷':'bug','新想法':'idea','评估':'idea','变更':'scope','架构':'architecture',
    '计划':'planning',
  };
  const key = (requested in FLOWS ? requested : alias[requested]) as keyof typeof FLOWS | undefined;
  return {
    kind:'read-only-v5-action-guide',
    hasSideEffects:false,
    tool:'devcontrol',
    callShape:{action:'guide',input:{intent:'feature | task | verification | ...'}},
    selectedIntent:key ?? null,
    ...(key ? {flow:{intent:key,...FLOWS[key]}} : {
      intents:Object.entries(FLOWS).map(([intent,flow])=>({intent,description:flow.description,firstAction:flow.actions[0]})),
    }),
    actionCount:V5_DEVC_ACTIONS.length,
    groups:V5_DEVC_ACTION_GROUPS.map(g=>({title:g.title,actions:g.actions})),
    note:'Call guide first when unsure. Get project-specific frozen task details with next/execution-contract. This is guidance, never authorization.',
  };
}
