/**
 * Canonical agent-facing guidance for the breaking v5 SQLite-only workflow.
 * Keep the full DevControl task schema in SQLite; no parallel Markdown Plans.
 */
export function renderV5Skill(version: string): string {
  return `# MCP Probe Kit v5 — SQLite + DevControl

> Version ${version}, source development. **Breaking change:** v4 file-backed Spec,
> Delegated Plan, Heartbeat, Resume, Converge and start_* workflows are **not
> supported**. Never suggest a hidden v4 operation or a Markdown state fallback.

## The only project-development workflow

Use the main MCP tool \`devcontrol\` with \`{action,project_root,input}\`.
\`project_root\` is the **target application Git repository**, not the MCP
installation. Node.js 22+ is required. The project database is at
\`.mcp-probe-kit/state/devcontrol.sqlite3\` (existing Neyna projects retain
their existing \`.neyna/state/devcontrol.sqlite3\`).

1. At conversation start call \`history_session_bootstrap\` and inspect its bounded
   SQLite project history (\`hs_*\`). Then \`devcontrol\` action=\`onboard\`,
   \`next\`, \`list\`, \`execution-contract\` to recover actual task state,
   Git branch, existing dirty files, dependency graph and lease.
2. New requirements, Features, Bugs, Ideas and decisions are versioned in the
   project SQLite \`dc_*\` tables via the appropriate \`devcontrol\` actions.
   Real PRD, ADR, API/Schema contracts and software source remain in Git; the
   application database is separate and must never be confused with DevControl.
3. Agent reads real requirements and code, reviews complete plan/Spec and risks.
   Use \`plan-review\` → \`plan-propose\` → independent review → explicit
   Owner hash-bound \`plan-approve\`. Proposed work is NOT executable.
4. For an approved task, use \`next\` → \`execution-contract\` → \`claim\`
   and, as needed, \`renew\`. Edit only frozen paths. The Agent, not DevControl,
   independently reviews software, runs real tests and commits approved files.
5. Use \`check\` → real Git commit → \`complete\` → \`report\` →
   \`verify\`. A commit, progress claim or simulated test is never Verified.
   Missing device, SQL/HTTP, Flutter or other required runner fails closed.
6. New ideas enter \`idea-capture\` → Agent \`idea-assess\` → independent
   \`idea-review\` → explicit Owner \`idea-decide\`. Scope or dependency
   changes need separately reviewed \`release-work-scope-*\` or
   \`release-work-incremental-*\` revisions. Frozen schemas/API/security
   files use \`artifact-stage\` / independent review / approve / check.
7. Before replying with a session handoff, checkpoint real user text, findings,
   decisions, paths, tests, Git/lease state, blockers and next actions using
   \`history_session_checkpoint\`. Search/read earlier History on demand.

## Storage, migration and security

- SQLite \`dc_*\` is the **only** authority for project process state.
- SQLite \`hs_*\` is the **only** live History backend; historical
  \`docs/history-session/N.md\` archives may be **read-imported once**, never
  written as the current state store. \`MCP_HISTORY_STORAGE=files\` and custom
  history directories are rejected.
- Optional Qdrant Memory is for validated cross-project knowledge only, not
  approvals, task state or checkpoint continuity.
- Preserve user dirty files; never stage unapproved paths, bypass hooks,
  invent independent reviewers or impersonate Owner approval.
- Back up SQLite with a consistent SQLite backup, including before upgrading
  old projects. Do not put a live DB, WAL, secret or active lease in Git.
- CLI fallback: \`probe exec devcontrol --stdin\` or
  \`node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol next --project-root .\`.
  For unpublished 5.0.0 builds use the correct local entry, never download
  \`mcp-probe-kit@5.0.0\` from npm or silently fall back to v4.
- Non-stateful helpers remain callable: \`code_review\`, \`code_insight\`,
  \`refactor\`, \`fix_bug\`, \`gentest\`, \`architecture\`, \`gencommit\`,
  \`git_work_report\`, \`ui_design_system\`, \`ui_search\`,
  \`sync_ui_data\`, \`ask_user\`. These never create a parallel Plan,
  Spec file or acceptance status.
- Optional Qdrant knowledge helpers are \`search_memory\`,
  \`read_memory_asset\`, \`memorize_asset\`, \`delete_memory_asset\`,
  \`update_memory_asset\`, \`scan_and_extract_patterns\`. They cannot
  approve tasks or replace SQLite process history.
- SQLite History tools are \`history_session_bootstrap\`,
  \`history_session_checkpoint\`, \`history_session_validate\`,
  \`history_session_search\`, \`history_session_read\`.
`;
}

export function renderV5AgentsMd(locale: 'zh-CN' | string, skillRef: string): string {
  if (locale === 'zh-CN') {
    return `## MCP（必须先调）

### MCP Probe Kit v5 — SQLite + DevControl 唯一研发流程

${skillRef}

- **必须先恢复**：新对话先 \`history_session_bootstrap\`（Git/Node22+ 项目唯一实时 History = SQLite \`hs_*\`），再调用主 MCP \`devcontrol\` 的 \`onboard\` / \`next\` / \`execution-contract\` 核实冻结任务与租约；用户说“继续”时不重新生成计划。
- **唯一项目状态**：需求、Feature、Bug、Idea、计划、任务、依赖、租约、审批、测试证据、决策全部归本项目 SQLite \`dc_*\`；代码/正式 PRD/ADR/API/Schema 仍归 Git，业务数据库独立。
- **逐任务闭环**：Agent 独立审查需求，\`plan-review\` → \`plan-propose\` → 精确 Hash 的 Owner 批准 \`plan-approve\`；然后 \`claim\` → 真正编码、审查、测试与合法 Git 提交 → \`complete\` / \`report\` / \`verify\`。DevControl 只是管控与证据门禁，不替 Agent 编码/跑 SQL/独立审核。
- **变更评估**：新想法先 \`idea-capture\` / \`idea-assess\` / \`idea-review\` / \`idea-decide\`，冻结范围、架构与新增依赖需独立复审并由 Owner 明确批准。
- **不支持 v4**：不得调用 \`start_feature\`、\`start_bugfix\`、\`plan_heartbeat\`、\`resume_plan\`、\`converge\`，不得写文件式任务/Spec/History，也不得用 \`MCP_TOOLSET=full\` 绕过。旧 Markdown 仅做安全导入，正式运行只用 SQLite。
- **会话结束**：\`history_session_checkpoint\` 记录用户原话、发现、决策、改动、真实测试、分支/租约、阻碍及下一步。保留用户未提交修改，真机/真实数据库 Gate 缺失就报告未通过。
- MCP 工具不可见时可用本地已锁版本 \`probe exec devcontrol --stdin\` 或 \`probe devcontrol ...\`；v5 未发布，禁止自动退回 v4 npm 或发布 5.0.0。
- 仅使用受控开发分支的本地入口；需要本地运行时可设置 \`MCP_PROBE_LOCAL_ONLY=1\`，不得从网络拉取未发布的 v5 或退回 v4。
`;
  }
  return `## MCP (call first)

### MCP Probe Kit v5 — SQLite + DevControl as sole workflow

${skillRef}

- Bootstrap project SQLite History (\`hs_*\`) and inspect Git/DevControl
  \`onboard\`, \`next\`, \`execution-contract\` before work.
- Plan/review/propose, obtain exact hash-bound Owner approval; claim an
  approved task, independently implement/review/run genuine tests, commit
  approved paths, complete/report/verify via the main MCP \`devcontrol\`.
- Persist requirements, Features, Bugs, Ideas, approvals, leases and evidence
  only to project-local SQLite \`dc_*\`. Git still owns source and formal
  specs; application data remains separate.
- Evaluate ideas before modifying frozen scope; require reviewed amendments
  and explicit Owner authorization. Keep user dirty files and never fake gates.
- No v4 file-backed Specs, start_* workflows, plan_heartbeat, resume_plan,
  converge or Markdown History. Old archives are read-imported only.
- Checkpoint the original user input, real changes/tests, decisions, blockers,
  lease/Git state and next actions before ending each session. Node.js 22+;
  unpublished v5 runs locally (\`MCP_PROBE_LOCAL_ONLY=1\`), never silently
  falls back to npm v4.
`;
}
