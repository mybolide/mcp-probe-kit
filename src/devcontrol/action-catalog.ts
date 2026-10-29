/**
 * Source of truth for supported v5 SQLite DevControl actions.
 *
 * Keep this small module pure so the MCP registry, generated Agent Skill,
 * startup guidance and contract tests all describe the same live interface.
 * A group documents one responsibility, not a separate MCP tool.
 */
export const V5_DEVC_ACTION_GROUPS = [
  {
    title: '操作导航 / Read-only agent navigation',
    actions: ['guide'],
  },
  {
    title: '项目与当前任务 / Project and task discovery',
    actions: ['onboard', 'next', 'list', 'get', 'execution-contract', 'task-detail-audit'],
  },
  {
    title: '版本计划 / Release plan approval',
    actions: ['release-plan', 'plan-review', 'plan-propose', 'plan-revise', 'plan-approve'],
  },
  {
    title: '正式工作树 / Frozen release work',
    actions: ['release-work-plan', 'release-work-review', 'release-work-stage', 'release-work-approve'],
  },
  {
    title: '范围变更 / Reviewed scope amendments',
    actions: ['release-work-scope-review', 'release-work-scope-stage', 'release-work-scope-get',
      'release-work-scope-independent-review', 'release-work-scope-approve',
      'release-work-scope-withdraw', 'pause-for-scope'],
  },
  {
    title: '增量任务 / Reviewed incremental work',
    actions: ['release-work-incremental-review', 'release-work-incremental-stage',
      'release-work-incremental-get', 'release-work-incremental-independent-review',
      'release-work-incremental-approve', 'release-work-incremental-withdraw',
      'pause-for-reviewed-incremental'],
  },
  {
    title: 'Feature：需求 → 设计 → 任务 / Requirements to design to atomic tasks',
    actions: ['features', 'feature-get', 'feature-create', 'feature-save', 'feature-validate',
      'feature-export', 'feature-task-brief', 'feature-task-plan', 'feature-task-plans',
      'feature-task-review', 'feature-task-stage', 'feature-task-propose',
      'feature-task-second-review', 'feature-task-approve'],
  },
  {
    title: '工作项和架构 / Work items and architecture',
    actions: ['work-items', 'work-record', 'architecture-sync'],
  },
  {
    title: 'Bug / Defect management',
    actions: ['bug-get', 'bug-step-save', 'bug-task-link'],
  },
  {
    title: 'Idea / Proposed change governance',
    actions: ['idea-capture', 'idea-list', 'idea-get', 'idea-assess', 'idea-review', 'idea-decide'],
  },
  {
    title: '工件 / Governed artifacts',
    actions: ['artifact-get', 'artifact-check', 'artifact-stage', 'artifact-independent-review',
      'artifact-approve'],
  },
  {
    title: '领取、报告与验收 / Execution and evidence',
    actions: ['claim', 'renew', 'recover-task', 'release', 'defer-verification','resume-verification',
      'check', 'report', 'gate-review', 'complete',
      'review-handoff','review-submit','reviewed-verify','task-closure-status',
      'verify', 'trace'],
  },
  {
    title: '决策 / Decision records',
    actions: ['decision-save', 'decision-get'],
  },
  {
    title: '本地工具 / Local developer and hooks',
    actions: ['local-developer', 'hook-status', 'hook-install'],
  },
] as const;

export const V5_DEVC_ACTIONS = V5_DEVC_ACTION_GROUPS.flatMap(group => [...group.actions]);
