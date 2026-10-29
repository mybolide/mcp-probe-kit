/**
 * Canonical agent-facing guidance for the breaking v5 SQLite-only workflow.
 * Keep the full DevControl task schema in SQLite; no parallel Markdown Plans.
 */
import { V5_DEVC_ACTIONS } from '../devcontrol/action-catalog.js';
import { renderV5DevControlActionReference } from './v5-agent-action-reference.js';
import { SKILL_GUIDANCE_MARKER, SKILL_GUIDANCE_REVISION } from './workflow-skill-version.js';

export function renderV5Skill(version: string): string {
  return `# MCP Probe Kit v5 — SQLite + DevControl

> Version ${version}, source development. **Breaking change:** v4 file-backed Spec,
> Delegated Plan, Heartbeat, Resume, Converge and start_* workflows are **not
> supported**. Never suggest a hidden v4 operation or a Markdown state fallback.

## On every MCP startup and new Agent conversation

- v5 checks the target Git project for its managed Skill and AGENTS.md
  section at startup and before each project tool call. It refreshes stale
  guidance **even when the installed package is still version 5.0.0**.
  If the project was unknown at startup, pass the correct explicit
  project_root on the first tool call, never the MCP installation path.
- Read the synchronized Skill and user-written AGENTS.md rules before work.
  For mismatches run local probe status and probe install-agent
  --project-root /ABSOLUTE/GIT/PROJECT; do not fetch unpublished v5 from
  npm or silently downgrade to v4.
- Resume SQLite History and frozen DevControl task state BEFORE planning.

## The only project-development workflow

Use the main MCP tool \`devcontrol\` with \`{action,project_root,input}\`.
If uncertain, call \`devcontrol\` action=\`guide\` with
\`input={intent:"feature"}\` first; this is a read-only orientation call
which needs no project_root and never authorizes work.
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
   For Feature planning, use feature-create then feature-save for three
   versioned SQLite chapters (**requirements → design → tasks**) followed by
   feature-validate, feature-task-brief, feature-task-review,
   feature-task-propose. STOP this planning round after staging the hash.
   In a later work round re-open the saved plan, perform a real
   feature-task-second-review (coverage, dependency, failure, file scope and
   verification) and only then feature-task-approve with that same hash.
   The same Agent may review in the later round. No second Agent or per-leaf
   Owner approval is required; material frozen-scope changes still need Owner.
   Unapproved proposals remain visible in planning, never executable.
   Canonical FR-001 links to legacy FR-1 but original text remains intact.
   ONE independently testable outcome per leaf: source requirement, reviewed
   design, parent and dependencies, one responsible role, exact file scope,
   inputs/outputs, positive/negative tests, evidence, exclusions and stop
   conditions. New Feature leaves target 0.5–1h, allow reasoned 1–2h
   exceptions, and reject work above 2h rather than broadening scope.
   Prefer hundreds of well-defined tasks to a handful of vague objectives.
3. Agent reads real requirements and code, reviews complete plan/Spec and risks.
   Use \`plan-review\` → \`plan-propose\`, then a separate evidence-bearing
   Review round and exact-hash plan confirmation. The same Agent can review;
   Owner authorization is reserved for material scope changes, not each leaf.
   Proposed work is NOT executable.
4. For an approved task, use \`next\` → \`execution-contract\` → \`claim\`
   and, as needed, \`renew\`. Edit only frozen paths. The Agent, not DevControl,
   independently reviews software, runs real tests and commits approved files.
5. Use \`check\` → real Git commit → \`complete\` / \`report\`.
   Then read \`task-closure-status\` and arrange \`review-handoff\` → independent
   \`review-submit\`. For EACH declared acceptance Gate except the internal
   \`sqlite_decision\` record, the development Agent executes actual tests
   using its own project toolchain, reports version-bound evidence and a
   distinct Reviewer supplies \`gate-review\`. Only then call
   \`reviewed-verify\` to validate the complete workflow. DevControl NEVER
   executes project-specific tests, including docs, Go, Flutter, Xcode,
   PostgreSQL or physical device tests; it never decides business correctness.
   A commit, progress claim or synthetic test is never Verified.
   Missing actual test evidence or independent review fails closed.
   When a required physical/external Gate is unavailable after a committed
   completion, use \`defer-verification\` with the current lease token, exact
   Gate and reason. This frees the task lease but NEVER passes the Gate.
   After the real runner/device returns use the resume-verification action.
   Then call read-only task-closure-status to identify the next required
   operation and missing evidence instead of endlessly waiting for Owner.
   The independent Reviewer inspects the original immutable delivery
   Commit; later unrelated HEAD commits may coexist but may never touch
   the submitted files. Post-resume real Gate evidence can be reported
   without rewriting the old commit. A distinct gate-review and
   reviewed-verify still enforce the originally required real Gate.
   Never rewrite SQLite task states or silently discard user files.
   Pre-existing unrelated tracked/untracked files at claim are protected by
   automatic SHA-256 snapshots, not by demanding that the user delete them.
   Old leases can use preserveExistingWorktree:true on complete to capture
   read-only legacy snapshots, never reset/stash/claiming that work.
   The matching manifest is required again at defer-verification; verified
   status still demands the original independently reviewed real Gate.
   Developer: complete + report, then review-handoff with current lease token.
   A distinct Reviewer records findings/evidence via review-submit; reject
   returns to in_progress, pass allows reviewed-verify to run all original Gates.
   Losing a session does not erase the recorded completion. An expired
   in_progress task can use recover-task to issue a new short-term lease,
   preserving the original Git base so the Owner can record complete/report.
   An already in_review task can use review-handoff directly for review.
   Both recoveries require the separately configured
   DEVCONTROL_OWNER_RECOVERY_KEY, not an unverified claimed Owner label.
   Never give a Reviewer the developer lease or fake independent test results.
   If later task code is already uncommitted in main, a specifically approved
   \`preserveExistingWorktree:true\` deferral fingerprints regular changed
   files including untracked source but refuses a staged index. Never count
   those files as evidence for the old task or as a passing Gate.
6. New ideas enter \`idea-capture\` → Agent \`idea-assess\` → independent
   \`idea-review\` → explicit Owner \`idea-decide\`. Scope or dependency
   changes need separately reviewed \`release-work-scope-*\` or
   \`release-work-incremental-*\` revisions. Frozen schemas/API/security
   files use \`artifact-stage\` / independent review / approve / check.
7. All approved Feature tasks and whole-release work items use the SAME
   frozen task contract for reading and auditing. Use \`execution-contract\`
   for eligibility and \`task-detail-audit\` for advisory quality, and
   GET /api/tasks/:id for a normalized full contract with original source
   type, exact approval hash and revision. Do not treat the smaller
   dc_task_specs summary as the complete contract. Missing fields must stay
   missing; never fabricate scenarios, tests or file scope. Approval and
   historical Verified remain immutable, even when an advisory audit finds
   gaps. New projects enable private LAN access by default; explicit disable
   persists. For FRPC custom hostnames, set DEVCONTROL_ALLOWED_HOSTS or
   FRPC_DOMAIN in the board environment; do not disable Host validation.
8. Before replying with a session handoff, checkpoint real user text, findings,
   decisions, paths, tests, Git/lease state, blockers and next actions using
   \`history_session_checkpoint\`. Search/read earlier History on demand.

${renderV5DevControlActionReference()}

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
  const managedRevision = `<!-- ${SKILL_GUIDANCE_MARKER}: ${SKILL_GUIDANCE_REVISION} -->`;
  if (locale === 'zh-CN') {
    return `## MCP（必须先调）

### MCP Probe Kit v5 — SQLite + DevControl 唯一研发流程

${skillRef}

${managedRevision}

- **启动文档自检**：MCP 每次启动检查目标 Git 项目的 Skill、AGENTS.md 托管区；即使版本仍是 5.0.0，指导修订过期也必须同步。若启动时无法找到项目，首次调用显式传入正确的 \`project_root\`；不得写入 MCP 安装目录。Agent 每轮先阅读最新 Skill 与项目自定义规则，可用本地 \`probe status\` / \`probe install-agent --project-root /ABSOLUTE/GIT/PROJECT\` 核对。
- **管理操作**：当前 24 个模型工具，唯一正式研发入口 \`devcontrol\` 提供 ${V5_DEVC_ACTIONS.length} 个 SQLite action，完整分组见 Skill 的 DevControl operation reference；不要将 action 当作独立 MCP 工具。
- **必须先恢复**：新对话先 \`history_session_bootstrap\`（Git/Node22+ 项目唯一实时 History = SQLite \`hs_*\`），再调用主 MCP \`devcontrol\` 的 \`onboard\` / \`next\` / \`execution-contract\` 核实冻结任务与租约；用户说“继续”时不重新生成计划。
- **唯一项目状态**：需求、Feature、Bug、Idea、计划、任务、依赖、租约、审批、测试证据、决策全部归本项目 SQLite \`dc_*\`；代码/正式 PRD/ADR/API/Schema 仍归 Git，业务数据库独立。
- **逐任务闭环**：新版本基线使用 \`plan-review\` / \`plan-propose\` 和精确 Hash 的 \`plan-approve\`；规划与 Review 分轮完成。按冻结合同 \`claim\`、真实编码、项目自己的工具执行测试、合法 Git 提交，以 \`complete\` / \`report\` 登记。用 \`task-closure-status\` 逐步确认缺失记录：开发 Agent 发起 \`review-handoff\`，**不同的独立 Reviewer** 用 \`review-submit\` 检查实现和证据，再由独立 Reviewer 按每个冻结验收条件填写 \`gate-review\`，之后才能 \`reviewed-verify\`。DevControl 仅检查证据、审核、审批和 Git 版本，**不执行 Gate 对应的项目测试命令**；失败明确返回下一步，不得伪造 Verified。
- **三阶段 SQLite 规格**：先用 \`feature-create\` → \`feature-save\` 形成需求、设计、任务三部分；第一轮完成 \`feature-validate\`、\`feature-task-brief\` / \`feature-task-review\` / \`feature-task-propose\` 并结束规划轮次。下一轮重读提案，使用 \`feature-task-second-review\` 单独记录覆盖、依赖、失败场景、文件范围和验收五项审查，再以精确 Hash \`feature-task-approve\` 确认。开发 Agent 可以自行做第二轮 Review，不强制另一名 Agent，也不逐项要求 Owner 批准；重大冻结范围变更仍须 Owner 明确授权。草稿不可领取。
- **任务原子性强制**：不怕任务多，只怕目标太泛。每个叶子只有一个可独立验收成果，清晰列出来源、设计、依赖、负责人、精确文件范围、输入输出、正反测试、证据、不做内容、停止条件。新 Feature 叶子任务以 30–60 分钟为主，必须填写预计工时；1–2 小时需具体说明无法继续安全拆分的原因，超过 2 小时须拆分。新整版计划可采用 task-detail-v2 执行相同严格规则；旧已冻结计划不得直接重写。父任务只组织阶段，Agent 不得自行扩散、偷换验收或跳过任务。
- **真实验收 Gate**：\`docs\`、\`go_contract\`、\`flutter_test\`、\`ios_device_e2e\` 等只是验收条件标识，不是 MCP 测试执行器。项目测试由开发 Agent 或项目 CI 执行，开发 Agent 将实际输出与 Git Commit 绑定入账；**不同于开发者和实际测试执行者的独立 Reviewer** 对每项 Gate 使用 \`gate-review\` 审核。Feature 规划的分轮二次 Review 可由原 Agent 完成，但正式任务和验收 Gate 的独立审核不能由开发 Agent 冒充。
- **延期验收与会话恢复**：代码已提交、完成说明和证据入账的 \`in_review\` 任务，可用 \`defer-verification\`（当前租约、精确 Gate、真实原因）释放租约但绝不通过 Gate；真机/CI 恢复后使用 \`resume-verification\`、\`task-closure-status\`，按提示补录真实 \`report\`、正式 \`review-handoff\` → \`review-submit\`，以及各个必要的独立 \`gate-review\`，最后 \`reviewed-verify\` 核对状态。后续无冲突任务可以推进 Git HEAD，审核仍绑定冻结的原始 Commit；禁止为了验收 reset、stash、删除别人文件或直接改 SQLite。
- **原工作树已有后续未提交研发**：只有 Owner 明确要求保护当前 main 工作目录并经过代码归属确认后，才向 \`defer-verification\` 提交 \`preserveExistingWorktree:true\`；MCP 只读计算所有已修改和未跟踪普通文件的 SHA-256 与类型、数量，拒绝 index 中已暂存内容、软链和越界路径，不执行 stash/reset/删除。这些文件不是待验证旧任务的验收证据，更不能用于替代真实 Gate。
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

${managedRevision}

- Bootstrap project SQLite History (\`hs_*\`) and inspect Git/DevControl
  \`onboard\`, \`next\`, \`execution-contract\` before work.
- On every MCP startup, check the target Git project's managed Skill and
  AGENTS.md block for package version AND guidance revision; auto-sync
  stale guidance even when the installed version is still 5.0.0.
  When project root is unknown, pass explicit project_root on the first
  call; never update the MCP installation folder. Read the synced Skill
  and user rules; use local probe status / probe install-agent to inspect.
- The sole official management tool is devcontrol, with
  ${V5_DEVC_ACTIONS.length} source-derived SQLite actions. Read the full
  DevControl operation reference in the Skill; never use retired v4 names.
- Requirements → design → atomic tasks: feature-create, feature-save,
  feature-validate, feature-task-brief/review/stage/propose in the first round.
  End planning, then re-open the staged proposal in a later work round and
  submit feature-task-second-review with concrete findings and real leaf IDs.
  The same Agent may perform second Review; a separate Agent is not required.
  Confirm the exact hash with feature-task-approve, without per-leaf Owner
  requests. Unapproved children remain
  visible but are not executable. Each leaf has a single verifiable goal,
  exact files, dependencies, positive/negative tests and stop conditions. New Feature leaves target 0.5–1h, require a specific reason for any 1–2h exception, and reject tasks over 2h; new whole-release planning can opt into task-detail-v2 without invalidating existing frozen tasks.
- Agents or project CI run Python/Go/Flutter/XCTest and other actual project
  tests. All legacy Gate names are acceptance criteria, not executable MCP
  test commands. DevControl only checks version-bound evidence and decisions.
- Plan/review/propose and approve the exact reviewed hash. Claim an approved
  task, implement, run genuine project tests and commit approved paths.
  Record complete/report; consult task-closure-status, hand off using
  review-handoff, have a DIFFERENT reviewer perform review-submit and
  gate-review for each required acceptance criterion, then reviewed-verify.
  Never treat a task self-review as a passed independent Gate review.
- When a task is deferred, resume-verification preserves the original
  submitted Git Commit while unrelated tasks may advance HEAD. Follow the
  closure checklist to report later real evidence and complete reviews;
  do not rerun business tests from DevControl or reset other Agent work.
- Persist requirements, Features, Bugs, Ideas, approvals, leases and evidence
  only to project-local SQLite \`dc_*\`. Git still owns source and formal
  specs; application data remains separate.
- Evaluate ideas before modifying frozen scope; require reviewed amendments
  and explicit Owner authorization. Keep user dirty files and never fake gates.
- New ideas use idea-capture, idea-assess, independent idea-review and
  exact Owner idea-decide; never expand a frozen scope without review.
- No v4 file-backed Specs, start_* workflows, plan_heartbeat, resume_plan,
  converge or Markdown History. Old archives are read-imported only.
- On every new session call history_session_bootstrap and before handoff call
  history_session_checkpoint; only SQLite is live project History.
- Checkpoint the original user input, real changes/tests, decisions, blockers,
  lease/Git state and next actions before ending each session. Node.js 22+;
  unpublished v5 runs locally (\`MCP_PROBE_LOCAL_ONLY=1\`), never silently
  falls back to npm v4.
`;
}
