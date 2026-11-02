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
   Then read \`task-closure-status\`. By default the responsible Agent
   performs a separate substantive \`self-review\` of the exact committed
   code and real test evidence. For EACH real acceptance Gate (except internal
   \`sqlite_decision\`), run actual project tests, report version-bound
   evidence, and use \`gate-review\` with \`reviewMode:"self"\` and concrete
   findings. Finally call \`verify\`. A separate Reviewer is OPTIONAL:
   choose \`review-handoff\` → \`review-submit\` → \`reviewed-verify\` with
   reviewed \`gate-review\` evidence only when a separate reviewer is wanted.
   DevControl NEVER
   executes project-specific tests, including docs, Go, Flutter, Xcode,
   PostgreSQL or physical device tests; it never decides business correctness.
   A commit, progress claim or synthetic test is never Verified.
   Missing actual test evidence, substantive review or a Gate fails closed.
   When a required physical/external Gate is unavailable after a committed
   completion, use \`defer-verification\` with the current lease token, exact
   Gate and reason. This frees the task lease but NEVER passes the Gate.
   After the real runner/device returns use the resume-verification action.
   Then call read-only task-closure-status to identify the next required
   operation and missing evidence instead of endlessly waiting for Owner.
   The reviewer inspects the original immutable delivery
   Commit; later unrelated HEAD commits may coexist but may never touch
   the submitted files. Post-resume real Gate evidence can be reported
   without rewriting the old commit. A real gate-review and verify (or
   optional reviewed-verify) still enforce the originally required Gate.
   Never rewrite SQLite task states or silently discard user files.
   Pre-existing unrelated tracked/untracked files at claim are protected by
   automatic SHA-256 snapshots, not by demanding that the user delete them.
   If a protected tracked file has been restored to exact Git HEAD bytes,
   the Owner may call \`refresh-protected-worktree\` with id, actor, configured
   ownerRecoveryKey and concrete reason before a completion report. This
   appends an audited reduction of active protection, never overwrites
   the original snapshot and never edits Git files or passes a real Gate.
   Missing untracked files, symlinks, staged or new unrelated WIP never qualify.
   An optional local worktree-ignore file is stored in each repository's real
   Git directory at info/devcontrol-worktree-ignore. Its patterns add to Git's
   standard ignore layers and only exempt unrelated untracked regular files.
   It cannot hide staged or tracked files, frozen task paths or symlinks.
   Multi-repository report and complete can accept deliveryHeads, a map from
   every Git prefix to the exact tested commit SHA (root prefix is "").
   Gate reviews and verify bind to this immutable delivery rather than later
   unrelated merges. A later commit touching frozen scope invalidates review.
   When a whole workspace moves to another filesystem path or workstation,
   NEVER edit SQLite baselines directly or use recover-task to overwrite them.
   The Owner may run devcontrol action=relocate-repository-baselines with a
   configured DEVCONTROL_OWNER_RECOVERY_KEY, actor, concrete reason, unique
   taskIds and exact complete mappings (taskId, prefix, fromGitDir, toGitDir,
   expectedBaseHead). Include root prefix "" and every child for each task;
   batch historical Verified tasks and unfinished tasks together. The action
   verifies actual independent Git roots, frozen base ancestry and no staged
   changes; it appends audited physical-location aliases without altering
   original baselines, delivery snapshots, evidence, Gates or Verified state.
   Read trace.repositoryBaselineRelocations to audit the old/new paths.
   MCP-generated Skill and AGENTS.md changes are exempt only when their staged
   and committed bytes match the trusted canonical generator.
   For an unstarted, Ready task whose frozen contract is missing human or
   implementation detail, use task-spec-supplement-get then
   task-spec-supplement-review. Only previously empty purpose, scenario,
   workflow, testCases, negativeCases and sourceRefs may be appended.
   Bind the original exact frozen plan hash and revision, stage using
   task-spec-supplement-stage and complete a substantive developer review via
   task-spec-supplement-self-review with cited evidence. Independent review via
   task-spec-supplement-independent-review is optional when risks justify it.
   Never claim an external review occurred unless it truly did. Then Owner approval via
   task-spec-supplement-approve with both exact proposal and review hashes.
   The approved addendum appears separately in execution-contract and the
   human task view. It NEVER replaces frozen acceptance, file scope, Gates,
   dependencies or original history and is not executable before approval.
   Withdraw stale proposals with task-spec-supplement-withdraw. Material
   scope or acceptance changes require the usual reviewed release amendment.
   For frozen scope, incremental tasks or governed artifacts use real developer
   self-review with sources and concrete safety, dependency and test findings:
   release-work-scope-self-review, release-work-incremental-self-review or
   artifact-self-review. Separate independent review remains optional.
   For new ideas use idea-self-review after idea-assess; idea-review is available
   only when a separate reviewer is actually used. Material changes still
   need Owner approval of exact proposal/review hashes.
   Old leases can use preserveExistingWorktree:true on complete to capture
   read-only legacy snapshots, never reset/stash/claiming that work.
   The matching manifest is required again at defer-verification; verified
   status still demands an evidence-bound real Gate.
   Developer: complete + report, then self-review with the current lease.
   Passing self-review enables gate-review reviewMode=self, then verify.
   An optional separate Reviewer instead uses review-handoff/review-submit;
   both methods reject unverified claims and failed test evidence.
   Losing a session does not erase the recorded completion. An expired
   in_progress task can use recover-task to issue a new short-term lease,
   preserving the original Git base so the Owner can record complete/report.
   An already in_review task can self-review with a valid lease, or choose
   review-handoff for an optional separate Reviewer.
   Both recoveries require the separately configured
   DEVCONTROL_OWNER_RECOVERY_KEY, not an unverified claimed Owner label.
   Never give an optional external Reviewer the developer lease or fake test results.
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
- **逐任务闭环**：新版本基线使用 \`plan-review\` / \`plan-propose\` 和精确 Hash 的 \`plan-approve\`；规划与 Review 分轮完成。按冻结合同 \`claim\`、真实编码、项目自己的工具执行测试、合法 Git 提交，以 \`complete\` / \`report\` 登记。先用 \`task-closure-status\` 核对缺失记录。开发 Agent 默认自行执行独立的 \`self-review\` 步骤，审查原始提交、真实测试和冻结范围；再按实际冻结 Gate 使用 \`gate-review\` 的 \`reviewMode=self\` 写入实质审核结论，最后 \`verify\`。另一名 Reviewer 是可选加强审核，明确需要时才使用 \`review-handoff\`、\`review-submit\` 和 \`reviewed-verify\`。DevControl 只检查证据、审核、审批和 Git 版本，**不执行 Gate 对应的项目测试命令**；失败明确返回下一步，不得伪造 Verified。
- **三阶段 SQLite 规格**：先用 \`feature-create\` → \`feature-save\` 形成需求、设计、任务三部分；第一轮完成 \`feature-validate\`、\`feature-task-brief\` / \`feature-task-review\` / \`feature-task-propose\` 并结束规划轮次。下一轮重读提案，使用 \`feature-task-second-review\` 单独记录覆盖、依赖、失败场景、文件范围和验收五项审查，再以精确 Hash \`feature-task-approve\` 确认。开发 Agent 可以自行做第二轮 Review，不强制另一名 Agent，也不逐项要求 Owner 批准；重大冻结范围变更仍须 Owner 明确授权。草稿不可领取。
- **任务原子性强制**：不怕任务多，只怕目标太泛。每个叶子只有一个可独立验收成果，清晰列出来源、设计、依赖、负责人、精确文件范围、输入输出、正反测试、证据、不做内容、停止条件。新 Feature 叶子任务以 30–60 分钟为主，必须填写预计工时；1–2 小时需具体说明无法继续安全拆分的原因，超过 2 小时须拆分。新整版计划可采用 task-detail-v2 执行相同严格规则；旧已冻结计划不得直接重写。父任务只组织阶段，Agent 不得自行扩散、偷换验收或跳过任务。
- **真实验收 Gate**：\`docs\`、\`go_contract\`、\`flutter_test\`、\`ios_device_e2e\` 等只是验收条件标识，不是 MCP 测试执行器。项目测试由开发 Agent 或项目 CI 执行，开发 Agent 将实际输出与 Git Commit 绑定入账。开发 Agent 可在通过 \`self-review\` 后使用 \`gate-review\` 的 \`reviewMode=self\` 对每项真实 Gate 自行审核，不能借此伪造测试或自动通过。可选另一个 Reviewer，但不再强制要求不同的人执行正式任务复审。
- **延期验收与会话恢复**：代码已提交、完成说明和证据入账的 \`in_review\` 任务，可用 \`defer-verification\`（当前租约、精确 Gate、真实原因）释放租约但绝不通过 Gate；真机/CI 恢复后使用 \`resume-verification\`、\`task-closure-status\`，按提示补录真实 \`report\`、\`self-review\`、\`gate-review\`（\`reviewMode=self\`）和 \`verify\`。只有主动选择独立 Reviewer 时才采用 \`review-handoff\` → \`review-submit\` → \`reviewed-verify\`。后续无冲突任务可以推进 Git HEAD，审核仍绑定冻结的原始 Commit；禁止为了验收 reset、stash、删除别人文件或直接改 SQLite。
- **原工作树已有后续未提交研发**：只有 Owner 明确要求保护当前 main 工作目录并经过代码归属确认后，才向 \`defer-verification\` 提交 \`preserveExistingWorktree:true\`；MCP 只读计算所有已修改和未跟踪普通文件的 SHA-256 与类型、数量，拒绝 index 中已暂存内容、软链和越界路径，不执行 stash/reset/删除。这些文件不是待验证旧任务的验收证据，更不能用于替代真实 Gate。
- **受保护文件恢复 Git HEAD**：已跟踪的保护文件若恢复为所在仓库 HEAD 原始字节，Owner 可使用 \`refresh-protected-worktree\`，提供任务 \`id\`、\`actor\`、\`ownerRecoveryKey\` 和具体 \`reason\`，追加只读审计刷新，再继续完成登记。旧快照保持不变；不允许 staged、软链、越界、未跟踪保护文件丢失及其他保护文件改动，不提供测试和 Gate 通过资格。
- **跨设备工作区搬迁**：根仓库和独立子仓库整体移动后，旧绝对 \`git_dir\` 只代表历史位置，不允许直接 UPDATE SQLite，也不得用 \`recover-task\` 改写冻结基线。使用 \`relocate-repository-baselines\`，要求 Owner 预先配置 \`DEVCONTROL_OWNER_RECOVERY_KEY\`，提交 \`actor\`、完整原因、\`taskIds\` 和每个任务全部仓库的精确 \`mappings\`（\`taskId\`、\`prefix\`、\`fromGitDir\`、\`toGitDir\`、\`expectedBaseHead\`）。根仓库 \`prefix\` 为空字符串；支持历史 Verified 与未完成任务同批迁移。先核对独立 Git 根、原始提交祖先关系及暂存区，再追加不可覆盖的搬迁审计；原始基线、完成证据、审核、Gate、任务状态完全不变。使用 \`trace\` 查看原路径和迁移历史。
- **本地 Git 忽略与精确交付**：每个独立仓库可在真实 Git 目录的 info/devcontrol-worktree-ignore 添加本机未跟踪普通文件例外，与标准 Git ignore 叠加，不允许忽略 staged、tracked、软链或冻结任务范围。多仓 \`report\`、\`complete\` 可通过 \`deliveryHeads\` 指定完整的仓库路径前缀及实际提交 SHA（根仓库键为空字符串），证据、Review、Gate 和 \`verify\` 只承认这些交付提交，后续无关 merge 不算入原任务交付。MCP 自动生成的 Skill 和 AGENTS.md 只有符合真实生成器内容才可单独或与合法业务提交一起通过。
- **冻结任务规格补充**：先用 \`task-spec-supplement-get\` / \`task-spec-supplement-review\` 检查原冻结来源及真正空缺的字段。只允许为 Ready 且尚未领取的任务追加原来缺失的业务目的、使用场景、步骤、正反测试和来源，绝不能借此修改验收目标、文件范围、Gate 或依赖。由 \`task-spec-supplement-stage\` 记录准确原计划修订及 Hash，再通过 \`task-spec-supplement-self-review\` 完成有来源的实质开发者自审（可选 \`task-spec-supplement-independent-review\`，不强制第二人），最后 Owner 明确批准精确提案及复审双 Hash 后才可 \`task-spec-supplement-approve\` 生效。不批准的草案对 AI 不可执行；过期草案使用 \`task-spec-supplement-withdraw\`。批准补充作为独立版本呈现在 \`execution-contract\` 与人类任务详情，原冻结历史不变；实际范围或验收变更继续走正式 Release Amendment。
- **冻结变更与架构评审**：不强制第三名审核人。范围变更使用 \`release-work-scope-self-review\`，新增任务使用 \`release-work-incremental-self-review\`，受控工件使用 \`artifact-self-review\`，并提交真实来源、范围、依赖和安全测试审查。独立复审按风险选用。涉及冻结范围或受控工件变更时，仍须 Owner 明确批准精确 proposalHash/reviewHash，未批准不得执行。
- **变更评估**：新想法依次使用 \`idea-capture\` / \`idea-assess\` / \`idea-self-review\` / \`idea-decide\` 进行真实自审与决策，\`idea-review\` 保留为可选独立复审；不得擅自修改冻结范围、架构与依赖；重大改变由 Owner 明确批准。
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
  Record complete/report; consult task-closure-status, then use self-review
  to separately examine the committed delivery and actual test evidence.
  For each real acceptance Gate, call gate-review with reviewMode=self and
  concrete findings, then verify. A separate Reviewer is OPTIONAL, using
  review-handoff, review-submit and reviewed-verify when explicitly chosen.
  Neither review path automatically passes a Gate or replaces actual tests.
- When a task is deferred, resume-verification preserves the original
  submitted Git Commit while unrelated tasks may advance HEAD. Follow the
  closure checklist to report later real evidence and complete reviews;
  do not rerun business tests from DevControl or reset other Agent work.
- Optional local-only info/devcontrol-worktree-ignore in each real Git-dir
  adds to standard Git ignore. It only exempts unrelated untracked regular
  files; never hide staged/tracked edits, frozen scope or symlinks.
- Multi-Git report and complete can specify deliveryHeads for every Git
  prefix (root key is ""), to bind test evidence and Gates to the original
  commits. Later unrelated merges never enlarge the frozen delivery diff.
- When moving an entire multi-Git workspace, never rewrite SQLite baselines.
  Use Owner-key-authorized \`relocate-repository-baselines\` with a concrete
  actor/reason, taskIds and complete per-task original/new Git directory and
  exact base commit mappings. This appends auditable physical path changes,
  not modifications to task delivery, evidence, reviews, Gates or status.
- Canonical generator-produced Skill and AGENTS.md upgrades can accompany
  legitimate task changes; manually altered guidance is not exempt.
- To clarify an approved frozen task, first use task-spec-supplement-get and
  task-spec-supplement-review. Only missing purpose, scenario, workflow,
  testCases, negativeCases and sourceRefs can be appended. Stage against the
  precise frozen plan SHA/revision via task-spec-supplement-stage. Perform
  substantive task-spec-supplement-self-review as the actual developer with
  cited sources and findings. Optional task-spec-supplement-independent-review
  is available when risks demand a separate reviewer; never mandatory.
  Then explicit Owner
  task-spec-supplement-approve with BOTH hashes. Use
  task-spec-supplement-withdraw for stale drafts. An approved addendum is separately visible in
  execution-contract and the human view, never rewrites the original
  acceptance, allowedPaths, requiredGates or dependencies. Unapproved
  additions are not actionable; material changes use a reviewed amendment.
- For frozen scope, incremental work or governed artifacts, the actual
  developer performs substantive release-work-scope-self-review,
  release-work-incremental-self-review or artifact-self-review with source-backed
  findings. A separate independent reviewer is optional, not a universal gate.
  For new ideas, use idea-self-review after idea-assess. Optional idea-review
  records a real separate assessment. Material changes still require Owner
  authorization of both exact hashes.
- If protected tracked Owner WIP was restored to exact Git HEAD bytes, use
  Owner-key-authorized \`refresh-protected-worktree\` with task id, actor and
  concrete reason before completion. This only appends an audited snapshot
  reduction, never exempts removed untracked files or passes real tests/Gates.
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
