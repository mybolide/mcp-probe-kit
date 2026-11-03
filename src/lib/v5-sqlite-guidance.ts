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

- v5 checks the target MCP workspace for its managed Skill and AGENTS.md
  section at startup and before each project tool call. It refreshes stale
  guidance **even when the installed package is still version 5.0.0**.
  If the project was unknown at startup, pass the correct explicit
  project_root on the first tool call, never the MCP installation path.
- Read the synchronized Skill and user-written AGENTS.md rules before work.
  From the MCP workspace root, run \`probe status\` and
  \`probe install-agent --project-root .\` if guidance is stale. Generated
  guidance must reference project files relative to that workspace root. If the
  MCP server cannot discover the workspace, pass its real absolute
  \`project_root\` only as a call-time locator, never as a stored repository identity.
  Do not fetch unpublished v5 from npm or silently downgrade to v4.
- Resume SQLite History and frozen DevControl task state BEFORE planning.

## The only project-development workflow

Use the main MCP tool \`devcontrol\` with \`{action,project_root,input}\`.
If uncertain, call \`devcontrol\` action=\`guide\` with
\`input={intent:"feature"}\` first; this is a read-only orientation call
which needs no project_root and never authorizes work.
\`project_root\` is the **MCP-managed application workspace**, not the MCP
installation directory. Git is OPTIONAL: a workspace may have no Git at all,
one Git repository, or several independent child Git repositories.
Source files and optional repository identities use workspace-relative paths. Node.js
22+ is required. The project database is at
\`.mcp-probe-kit/state/devcontrol.sqlite3\` (existing Neyna projects retain
their existing \`.neyna/state/devcontrol.sqlite3\`).

1. At conversation start call \`history_session_bootstrap\` and inspect its bounded
   SQLite project history (\`hs_*\`). Then \`devcontrol\` action=\`onboard\`,
   \`next\`, \`list\`, \`execution-contract\` to recover actual task state,
   source evidence (Git commits when present, SHA-256 files otherwise),
   existing files, dependency graph and lease.
2. New requirements, Features, Bugs, Ideas and decisions are versioned in the
   project SQLite \`dc_*\` tables via the appropriate \`devcontrol\` actions.
   Real PRD, ADR, API/Schema contracts and software source remain in project
   files; Git is optional. The application database stays separate from DevControl.
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
   independently reviews software and runs real tests. Only Git projects
   require actual approved commits. Never create a Git repository implicitly.
5. Use \`check\`, then \`complete\` / \`report\`. Git projects require the original
   committed task changes; Git-free projects use exact claim-time and
   completion-time SHA-256 file manifests, without Git binaries or commits.
   Neither evidence format waives approved file scope or real test Gates.
   Then read task-closure-status. The responsible developer AI runs genuine
   tests and reviews the frozen atomic delivery. Ordinary tasks use ONE verify
   call with acceptance={evidenceReference,findings,gates:[{gate,evidenceReference,findings}]}
   covering every real Gate. One transaction records all-or-nothing acceptance.
   The legacy self-review and gate-review actions remain optional compatibility;
   no separate Agent or Owner approval is required for routine task closeout.
   DevControl NEVER
   executes project-specific tests, including docs, Go, Flutter, Xcode,
   PostgreSQL or physical device tests; it never decides business correctness.
   DevControl is project management, not an acceptance or testing Agent.
   The current development AI runs real tests and reviews its own technical
   delivery; never introduce or require third-party Agents for routine tasks.
   Requirements analysis, architecture, one independently verifiable outcome
   per leaf and prerequisite Verified status BEFORE dependent claim remain
   mandatory. Positive, negative and recovery acceptance lists for the same
   outcome must not be mistaken for several tasks.
   A commit, file hash, progress claim or synthetic test alone is never Verified.
   Missing actual test evidence, substantive review or a Gate fails closed.
   When a required physical/external Gate is unavailable after a completed
   completion, use \`defer-verification\` with the current lease token, exact
   Gate and reason. This frees the task lease but NEVER passes the Gate.
   After the real runner/device returns use the resume-verification action.
   Then call read-only task-closure-status to identify the next required
   operation and missing evidence instead of endlessly waiting for Owner.
   The reviewer inspects the original immutable delivery. In Git projects
   preserve exact commits and ancestry. In Git-free projects preserve the
   tested SHA-256 file manifest and reject changed source content.
   Post-resume real Gate evidence may be reported without replacing the
   original delivery. One verify with complete acceptance
   still enforces every frozen Gate. Legacy reviewer records remain readable.
   Never rewrite SQLite task states or silently discard user files.
   Pre-existing unrelated tracked/untracked files at claim are protected by
   automatic SHA-256 snapshots, not by demanding that the user delete them.
   MCP itself may regenerate AGENTS.md and its managed SKILL.md after a task
   was claimed. Only bytes exactly matching the current MCP generator and
   the committed user-owned AGENTS instructions are tool maintenance, not
   post-claim foreign work. Never request a new lease, ask the user to delete
   those canonical files, or blindly ignore the .agents directory. A staged
   file, changed user rule or noncanonical Skill still fails the normal checks.
   If a protected tracked file has been restored to exact Git HEAD bytes,
   the Owner may call \`refresh-protected-worktree\` with id, actor,
   explicitAuthorization:true and concrete reason before a completion report.
   This no longer requires a secret or configured Owner recovery password.
   The operation appends an audited reduction of active protection, never overwrites
   the original snapshot and never edits Git files or passes a real Gate.
   Missing untracked files, symlinks, staged or new unrelated WIP never qualify.
   An optional local worktree-ignore file is stored in each repository's real
   Git directory at info/devcontrol-worktree-ignore. Its patterns add to Git's
   standard ignore layers. Explicit entries can exempt tracked, staged or
   untracked LOCAL non-business tool configuration (AGENTS.md, generated
   Skill, .cursor/mcp.json) and safe temporary output from DevControl
   worktree-noise checks. They NEVER alter Git tracking or index; never
   exempt business code, frozen task scope, committed delivery or symlinks.
   Applied paths and SHA-256 fingerprints are audited in DevControl SQLite.
   An explicit /docs/history-session/ rule can exempt local legacy History
   Markdown, index and scratch notes; /docs/** cannot hide reviewed PRD,
   ADR, approved scope sources, code, or any frozen task path.
   Multi-repository report and complete can accept deliveryHeads, a map from
   every Git prefix to the exact tested commit SHA (root prefix is "").
   Gate reviews and verify bind to this immutable delivery rather than later
   unrelated merges. Inspect merge commits against their FIRST parent only:
   another parent's older file tree does not count as a post-delivery edit.
   Any real first-parent scoped change (even if later reverted) invalidates
   original review and requires fresh verified evidence.
   For an already completed multi-repository task at in_review, a legacy
   receipt may have no usable frozen repository digest. Do NOT bypass Gate
   checks or invent an extra test run. Inspect the real original test log,
   calculate its SHA-256, and call rebind-legacy-evidence with the existing
   evidenceReference, the complete FROZEN deliveryHeads, a safe project-relative
   artifactPath, artifactSha256, original developer leaseToken, responsible
   actor, concrete reason and detailed findings. This appends a provenance
   record and a derived digest binding; original evidence is never rewritten,
   and no tests or Gates are marked passed. If the original test log does not
   demonstrate testing of those commits, rerun the real project tests.
   When the original output has been LOST, use record-rerun-evidence, not
   report, defer-verification or a fabricated legacy rebind. The host Agent
   runs real tests from exact detached Git worktrees for EVERY frozen Git
   prefix, with unchanged tracked/index source. Provide existing
   supersedesEvidenceId, complete frozen deliveryHeads and testedCheckouts
   maps, commandCwd (one of the frozen test checkouts), actual command,
   real numeric exitCode, new project-local artifactPath, artifactSha256,
   original review leaseToken, actor, reason and detailed findings.
   DevControl verifies Git HEADs and SHA-256 but does NOT run the test or
   approve any Gate. Failed reruns are audited, never passing test evidence.
   A successful rerun appends a NEW version-bound evidence reference;
   preserve the old evidence and use the new reference in a separate verify.
   A descendant HEAD is NOT the same tested code even when the scoped test
   file is unchanged; do not certify a descendant checkout as frozen.
   An in_review task with a committed delivery can review and verify using
   its unchanged original token even after the writer lease expires; changing
   code, completing a new delivery or ordinary report still needs a valid
   writing lease. Neither reviewing nor recording a frozen-code rerun needs
   a new exclusive writer lease. Never automatically approve a Gate.
   Normal Git pull, merge, clone and moving the entire workspace need no
   Owner key, per-machine rebind or SQLite update. Git metadata locations
   are identified relative to the current workspace root (".git" and
   child/.git). Legacy absolute-path v5 task baselines and evidence hashes
   remain unchanged in SQLite and are interpreted as those same portable
   relative Git locations when read. An independent repository must retain
   the original frozen base commit in its ancestry. Subsequent commits and
   normal collaborator merges never rewrite earlier tested delivery SHAs.
   A completed, evidenced in_review task may retain its own management lease
   while next/claim let a Ready task with no dependency or frozen-scope
   overlap take the one shared Git writer. Unsubmitted or staged work cannot
   yield. Read next.parkedReviews for older tasks awaiting the responsible
   AI's technical review. They are NOT Verified until genuine acceptance is
   recorded. A failed review must reclaim the Git writer before coding.
   No extra Agent or Owner key is needed for normal non-overlapping work.
   In_progress tasks with an EXPIRED shared writer may be blocked by other
   explicitly approved Agent WIP. A different Agent's bytes are NOT
   automatically safe. WORKTREE_CHANGED reports exact conflicting paths,
   kind and SHA-256 of expected/current state and whether in frozen scope.
   review-recovery-worktree requires explicit Owner approval, the exact
   reviewedPaths and a different approved sourceTaskId with DISJOINT frozen
   scope; it records an append-only provenance snapshot and does not modify
   Git, source or the original claim baseline. Unknown or overlapping files
   remain blocked. If an unrelated Ready task must use the same index,
   park-expired-writer requires an expired in_progress writer, explicit
   approval, nextTaskId with Verified dependencies and disjoint scope,
   no staged files, and byte-exact preserved local WIP. The successor must
   complete its own actual delivery/Gates; only then can the original task
   resume at the original frozen base with intervening Git commits attributed
   to the other task. Neither action tests source or auto-verifies a task.
   Shared-index parking does NOT yet apply to multi-independent-Git child
   repositories. execution-contract.eligible means approved business scope;
   claimableNow and writerBlocker are separate runtime Writer readiness.
   Always inspect next.selectedTaskWriterStatus instead of claiming blindly.
   Do not use any Neyna-specific state directory as a universal Git worktree
   path: the project's Agent chooses safe ignored local test directories.
   Historical SQLite claim/completion Owner worktree snapshots may have
   been serialized with precisely one nested snapshot_json string envelope.
   The ledger reads that legacy form strictly as its inner array, without
   rewriting the original SQLite bytes. Nonempty file fingerprints still
   require exact path, type, byte size and SHA-256, and valid local ignore
   rules may exempt only explicitly approved paths outside task scope.
   Malformed or multiply nested snapshots are rejected, never mapped to [].
   Do not bypass verify, project tests or any frozen Gate to fix a snapshot.
   When resuming a deferred single-Git task after later commits touched the
   frozen allowed paths, the Agent must review the COMPLETE set of later
   changed paths inside the frozen scope, not only the files the original
   delivery edited. The audit identifies those changed original delivery
   files separately; it does not transfer ownership of later changes.
   Supply the exact current Git HEAD as reviewedHead, every affected frozen
   path as overlappingPaths, substantive diff findings and the original
   frozen-version test artifact reference in resume-verification. The
   changedDeliveryPaths audit separately identifies changed original files.
   The same HEAD-bound audited paths must be accepted
   by report, Gate review, re-deferral and verify. A new commit invalidates
   that approval; review the new HEAD again. Even if the original patch
   still cleanly applies to current source, this does NOT waive
   the later-file review or authorize stale audit records.
   Evidence must come from actual
   testing of the original frozen delivery, not tests of current HEAD, and
   no resume/reconciliation by itself passes ios_device_e2e or other Gates.
   On Windows the generated CMD/PowerShell launcher must use the exact pinned
   local package version and must NOT fall back to npm when localOnly is set.
   local.env fills only undefined or empty variables. The explicit
   MCP_PROJECT_ROOT has precedence over cwd, then auto-discovered workspaces;
   nonempty process/IDE env values always win over local.env.
   A batch timeout means FAILED, never passed. Run
   npm run test:ledger:batch and the complete npm test separately; inspect
   retained per-batch JSON and stdout logs. For GP/AlphaLoop/DAP real
   projects, first use read-only next/execution-contract/trace to identify
   each of the exact conflicting paths and the approved disjoint source
   task. Do not attribute files to a task merely from similar filenames.
   Only an explicitly approved, audited review-recovery-worktree or
   park-expired-writer may mutate the task ledger; never change a live
   GP database or Git worktree just to make a regression test pass.
   Registered linked Git worktrees share one canonical project SQLite ledger
   while keeping separate Git indexes. The current development AI creates
   and integrates worktrees using ordinary Git commands, passing the exact
   linked checkout as project-root when claiming an independent Ready task.
   Prerequisites must be Verified, unverified task scopes must not overlap,
   and task evidence must stay bound to its original checkout. A linked
   delivery MUST be integrated into canonical Git history before its task
   can become Verified. DevControl never merges Git or tests code.
   Root worktrees do not contain independent child Git repositories; those
   multi-repository projects retain their stricter existing workflow.
   Cross-computer SQLite files cannot be safely combined by copying bytes
   or INSERT OR REPLACE. Use sqlite-merge-preview with the explicitly
   transferred sourcePath to inspect semantic row conflicts. For a clean
   shared-ancestry preview, sqlite-merge-candidate requires the unchanged
   fingerprint and a NEW outputPath, and never overwrites the local or
   imported SQLite. Transient leases and machine-specific Git baseline
   paths never come from the other machine. Conflicting task states,
   evidence identities and source-only Verified deliveries must be
   investigated by the current AI against the original Git commits and
   real tests; do NOT invent an acceptance result or silently select
   the later timestamp. A candidate is NOT automatically active, and this
   is NOT yet automatic multi-computer state synchronization or a global
   offline-exclusive claim service. No central host or third-party Agent.
   When available, pass a genuine common-ancestor SQLite snapshot as
   basePath on BOTH sqlite-merge-preview and sqlite-merge-candidate.
   Three-way comparison auto-applies a source-only edit ONLY if the same
   existing task stays unapproved draft in all three versions. Divergent
   draft changes need an AI-reviewed resolutions array with exact table/key,
   source/target choice, responsible actor and a substantial reason. The
   selected choices bind into expectedFingerprint and are written to the
   separate candidate's dc_audit for later explanation. Never use this
   choice to override Ready, in_progress, in_review or Verified tasks,
   Git completion/evidence identities, or historical audits. Candidate
   also rejects any merged task dependency cycle or a task marked
   in_progress/in_review/Verified whose prerequisite is not Verified.
   Candidate remains inactive until separately reviewed and safely adopted.
   Only exceptional forensic physical-location audit correction needs the
   Owner-key-authorized relocate-repository-baselines operation.
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
   Developer: complete + report, then ONE verify with current lease and a
   substantive acceptance object for every frozen test Gate. Old self-review
   and gate-review actions are compatibility only, not mandatory extra steps.
   Losing a session does not erase the recorded completion. An expired
   in_progress task can use recover-task to issue a new short-term lease,
   preserving the original Git base so the Owner can record complete/report.
   An already in_review task uses one verify with existing genuine test
   receipts and current AI findings; do not require another Agent.
   Ordinary expired task leases can be recovered using recover-task with
   a responsible actor and detailed reason. Optional legacy review handoffs
   from expired leases use explicitAuthorization:true, with no password.
   Neither recovery requires an Owner secret or environment variable.
   An active lease may not be seized; the original Git and test evidence
   checks remain strict.
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
- CLI fallback from the MCP workspace root:
  \`probe exec devcontrol --stdin\` or
  \`./.mcp-probe-kit/bin/probe devcontrol next --project-root .\`.
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

**多 Agent 过期任务安全恢复**：任务领取后其他 Agent 有合法未提交文件，并不意味着需要删除或 stash。先用 recover-task；如果返回 WORKTREE_CHANGED，查看 details.conflicts 中的 path、type、expected/observed SHA-256 和冻结范围标识。只有能够归属另一项已批准且文件范围不重叠的任务时，才由 Owner 明确授权 review-recovery-worktree，逐个提供 sourceTaskId、reviewedPaths、actor、具体 reason。此动作只追加快照审计，不改原任务 Git 基线或任何源文件。若原任务仍在 in_progress，Writer 已过期，且必须让另一项无依赖且不重叠的 Ready 任务继续，显式执行 park-expired-writer，提供 id、nextTaskId、actor、reason 和 explicitAuthorization。它保存所有未提交文件真实哈希和原 HEAD，不自动执行测试或通过 Gate。原任务恢复时继续严格识别其他任务的 Git 提交，不将它们记入原任务交付。请分别检查 execution-contract.eligible（规格是否批准）与 claimableNow/writerBlocker（当前是否可领取），以及 next.selectedTaskWriterStatus。单 Git 工作区支持这一受审停放；多独立子 Git 仓库尚不支持，不得直接绕过。MCP 通用功能不能固定使用 .neyna/state 等 Neyna 专属路径；隔离测试目录由各项目自行选择。

**旧 SQLite 快照的严格兼容**：如果原任务已经提交代码和真实测试，但 verify 被旧 worktree 快照阻断，先检查领取时的 snapshot_json 和完成记录中的 preserved_worktree_json。老版本可能保存恰好一层 [{"snapshot_json":"[]"}] 包装。最新版只读展开这一严格格式，不直接改写 SQLite，不覆盖真实的非空 Owner 文件保护。非空快照必须包含完整的 path、kind、size、sha256 并校验当前文件；只对既有本地 ignore 明确豁免且不在冻结任务范围内的路径按原规则排除。格式畸形或多层嵌套依然拒绝，测试和 Gate 仍需要正式 verify。

**Windows 与 GP 协作验收**：本机 Windows 运行前先核对启动器的精确本地版本，local-only 模式禁止自动下载 npm 包，4.x 不得冒充 5.0.0。local.env 只补充未设置或空值变量，现有系统和 IDE 环境变量始终优先；明确设置的 MCP_PROJECT_ROOT 优先于运行目录，运行目录优先于自动发现的其他项目。台账测试必须执行完整批次，超时或失败必定拒绝通过，并保留每批 JSON 与日志。GP 实际恢复先只读检查 next、execution-contract、trace 和冲突路径归属；没有已批准且范围不重叠的源任务和 Owner 显式确认时，不得调用 review-recovery-worktree 或 park-expired-writer，也不得修改数据库或其他 Agent 的文件。

**延期验收统一文件审查**：单 Git 任务经 defer-verification 后，如果后续提交修改过原冻结允许范围内的文件，resume-verification 的 overlappingPaths 应包含当前 HEAD 相对原完成提交的全部受影响冻结路径，不只是原任务实际交付的文件。Agent 需要对完整差异逐文件审核，并提交当前 reviewedHead、100 字以上 findings 和原冻结版本真实测试证据引用。MCP 在审计中另外记录 changedDeliveryPaths，明确哪些后续改动碰到原任务实际交付文件。report、技术 Review、再次延期和 verify 均按同一份冻结路径集合与 Git HEAD 检查，新的 HEAD 会让旧审核失效。即使原冻结补丁仍能无冲突应用，也不能跳过对后续变更的审核，或继续使用旧 HEAD 的审核记录。恢复和审查不替代真实设备测试，不会自动通过 Gate，也不改原提交、旧证据、SQLite 历史审计或其他 Agent 未提交代码。

**审核租约与旧多仓证据**：开发写入租约默认 30 分钟，最长 60 分钟，长时间编码或测试时要在过期前 renew；已经提交并处于 in_review 的任务即使开发租约过期，只要保留原 leaseToken 和冻结提交，仍可直接执行技术自审、Gate 审核和 verify，不再因倒计时要求 recover-task。过期租约绝不能继续改源码或提交新的 report。旧多仓测试记录如缺少准确的冻结版本向量，先用 task-closure-status 取得 frozenDeliveryHeads 和原 evidenceReference；有可核验的旧真实测试日志时，使用 rebind-legacy-evidence 提交原 leaseToken、actor、reason、完整 deliveryHeads、原 evidenceReference、项目内实际日志 artifactPath 及 artifactSha256 和详细 findings。仅追加审计与派生证据关联，不改原测试记录、不运行测试、更不会自动通过 Gate；原日志不能证明该冻结代码受测时，必须重新运行真正的项目测试，不得补造证明。

**旧日志遗失后的真实重跑登记**：已经处于 in_review 且原测试输出丢失的多仓任务，不要反复调用 report、recover-task 或不支持多仓的 defer-verification。先从 task-closure-status 取得原 evidenceId 和完整 frozenDeliveryHeads；在每个独立 Git 仓库的原始冻结提交上准备干净、隔离的 worktree，Agent 真正运行项目测试并保存新日志和 SHA-256。然后调用 record-rerun-evidence，填写 supersedesEvidenceId、完整 deliveryHeads、每个冻结仓库的 testedCheckouts、实际执行目录 commandCwd、真实 command/exitCode、artifactPath/artifactSha256、原 leaseToken、actor、reason 和详细 findings。此动作仅追加测试运行事实和来源关联，不占用独占代码写入租约，不改旧证据、不修改代码、不自动通过 Gate。测试失败也要如实记录，不能作为通过证据；成功后使用新返回的 evidenceReference 对每个原始 Gate 做正式 verify。后续提交即使没有改动测试文件，也不能把当前 HEAD 冒充原冻结代码。

${skillRef}

${managedRevision}

- **三方 SQLite 冲突处理**：如有两台电脑共同的旧数据库快照，当前 AI 应将其作为 basePath 同时传给 sqlite-merge-preview 和 sqlite-merge-candidate。仅同一任务始终是未批准 draft 的单边修改可以自动纳入候选库；两边都修改了 draft 时，当前 AI 根据需求与差异提交 resolutions，其中包含 table、key、choice（source 或 target）、actor 和详细 reason，选择与预检指纹绑定，并写入候选库 dc_audit。绝不能用这种选择覆盖 Ready、进行中、待审核、Verified 的任务或不可变测试记录。候选库仍不是正式项目状态。

- **跨电脑 SQLite 安全合并**：当前 AI 使用 sqlite-merge-preview 对比两份本地 SQLite，按任务状态、依赖、测试证据和历史记录识别冲突，不按时间戳自动覆盖。只有同项目来源、表结构兼容、无冲突且预检指纹未变化，才用 sqlite-merge-candidate 生成新的候选 SQLite，两份原文件均不修改。租约和另一台电脑的 Git 工作树路径不合并，已执行或已验收的外部任务需要当前 AI 审核原始 Git 提交与真实测试。候选文件不会自动成为正式项目状态，也不代表已经完成跨电脑自动同步或离线独占领取。不要求权威主机，不引入其他 Agent。

- **独立 Git Worktree 开发**：Git 正式注册的不同工作树拥有各自的 Git 暂存区，同时共享主仓库的同一份 DevControl SQLite 项目数据。当前 AI 使用普通 Git 创建、合并工作树；领取任务时把对应工作树路径传为 project-root。前置依赖仍必须 Verified，未验收任务的冻结文件范围不得重叠。任务报告、测试与技术自审绑定原工作树；独立工作树的准确提交被合并进主 Git 历史后，才允许记为 Verified。DevControl 不执行代码测试、Git 合并，也不引入第三方 Agent。独立子仓库组合暂不支持根 Worktree 并行。

- **启动文档自检**：MCP 每次启动检查目标项目工作区的 Skill、AGENTS.md 托管区；即使版本仍是 5.0.0，指导修订过期也必须同步。Agent 每轮先阅读最新 Skill 与项目自定义规则；从 MCP 工作区根目录执行 \`probe status\` / \`probe install-agent --project-root .\`。父目录可以没有 Git，子项目可以分别使用独立 Git；生成的项目文件引用和 Git 仓库身份必须相对 MCP 工作区根目录。若服务启动时未识别目标工作区，首次工具调用才显式传入该机器真实的绝对 \`project_root\` 作为运行时定位参数，不得把它写作持久仓库身份，也不得写入 MCP 安装目录。
- **管理操作**：当前 24 个模型工具，唯一正式研发入口 \`devcontrol\` 提供 ${V5_DEVC_ACTIONS.length} 个 SQLite action，完整分组见 Skill 的 DevControl operation reference；不要将 action 当作独立 MCP 工具。
- **必须先恢复**：新对话先 \`history_session_bootstrap\`（Node22+ 项目唯一实时 History = SQLite \`hs_*\`，不需要 Git），再调用主 MCP \`devcontrol\` 的 \`onboard\` / \`next\` / \`execution-contract\` 核实冻结任务与租约；用户说“继续”时不重新生成计划。
- **唯一项目状态**：需求、Feature、Bug、Idea、计划、任务、依赖、租约、审批、测试证据、决策全部归本项目 SQLite \`dc_*\`；代码与正式 PRD/ADR/API/Schema 保存在项目文件中，Git 仅为可选的版本管理工具，业务数据库独立。
- **质量与责任边界**：DevControl 只是项目管理工具，保存需求、架构、原子任务、依赖、进度和当前 AI 上报的测试及完成记录，不是测试或验收 Agent。当前研发 AI 自己完成设计、开发、测试、技术自审和逐项验收，不引入任何第三方 Agent。每项叶子任务只有一个独立可验收成果；正向、异常和恢复测试可以是同一任务的多条验收标准。前置任务必须已真实验收并记录 Verified，才能领取依赖任务；其他无依赖任务不应被全局阻塞。
- **正式任务一次验收**：正式版本规划仍必须完成 plan-review、plan-propose 和精确 Hash 的 plan-approve；当前 AI 通过 claim 领取已批准且前置全部 Verified 的任务，自己负责真实开发、项目测试和技术自审。有 Git 时提交批准范围内的真实代码；没有 Git 时 DevControl 比对领取时与完成时的 SHA-256 文件清单，不需要 Git 命令、安装 Git 或自动创建 .git。通过 complete/report 登记实际测试证据，处于 in_review 时一次 verify，acceptance 逐项包含冻结 Gate 的真实证据及检查结论。DevControl 审核文件范围、Git 提交（若有）或文件清单、全部测试条件、依赖和验收记录，合格才标 Verified。旧 self-review/gate-review/reviewed-verify 仅作历史兼容，不强制额外 Agent 或逐项 Owner 审批。
- **三阶段 SQLite 规格**：先用 \`feature-create\` → \`feature-save\` 形成需求、设计、任务三部分；第一轮完成 \`feature-validate\`、\`feature-task-brief\` / \`feature-task-review\` / \`feature-task-propose\` 并结束规划轮次。下一轮重读提案，使用 \`feature-task-second-review\` 单独记录覆盖、依赖、失败场景、文件范围和验收五项审查，再以精确 Hash \`feature-task-approve\` 确认。开发 Agent 可以自行做第二轮 Review，不强制另一名 Agent，也不逐项要求 Owner 批准；重大冻结范围变更仍须 Owner 明确授权。草稿不可领取。
- **MCP 自动更新文件不阻断研发**：领取任务以后 MCP 可自动同步 AGENTS.md 和 .agents/skills/mcp-probe-kit/SKILL.md。只有内容完全符合正式生成器，而且 AGENTS.md 中用户原有规则没有变化时，这两份文件才属于 MCP 自身维护，不算作领取后新增的外部业务改动。不能放行被手工修改的 Skill、用户自定义 AGENTS 内容、已暂存内容或整个 .agents 目录。无须因此恢复租约、删除文件或重做验收。
- **任务原子性强制**：不怕任务多，只怕目标太泛。每个叶子只有一个可独立验收成果，清晰列出来源、设计、依赖、负责人、精确文件范围、输入输出、正反测试、证据、不做内容、停止条件。新 Feature 叶子任务以 30–60 分钟为主，必须填写预计工时；1–2 小时需具体说明无法继续安全拆分的原因，超过 2 小时须拆分。新整版计划可采用 task-detail-v2 执行相同严格规则；旧已冻结计划不得直接重写。父任务只组织阶段，Agent 不得自行扩散、偷换验收或跳过任务。
- **真实验收 Gate**：docs、go_contract、flutter_test、ios_device_e2e 等只是产品测试条件标识，不是 MCP 测试执行器。开发 AI 必须实际运行或检查项目测试及原始输出，verify 的 acceptance.gates 必须逐项绑定准确 Git 交付（有 Git 时）或冻结的 SHA-256 文件清单（无 Git 时）与已登记测试报告；缺失或版本变化不能自动通过。
- **延期验收与会话恢复**：真机或外部 Gate 不可用时使用 defer-verification 释放任务写入权，但不能标记通过。恢复后通过 resume-verification，补充实际测试报告，再用一次带 acceptance 的 verify 完成登记；其他无依赖任务继续开发，原 Git 提交（若有）或原文件快照、冻结 Gate 与 Verified 前置任务始终严格。
- **原工作树已有后续未提交研发**：只有 Owner 明确要求保护当前 main 工作目录并经过代码归属确认后，才向 \`defer-verification\` 提交 \`preserveExistingWorktree:true\`；MCP 只读计算所有已修改和未跟踪普通文件的 SHA-256 与类型、数量，拒绝 index 中已暂存内容、软链和越界路径，不执行 stash/reset/删除。这些文件不是待验证旧任务的验收证据，更不能用于替代真实 Gate。
- **无密钥任务恢复与工作树保护**：普通任务租约到期后，当前 AI 用 \`recover-task\` 提供 \`actor\` 和具体 \`reason\` 即可恢复原任务，不再要求 Owner 密钥或环境变量。Git 项目检查原 Git 历史和工作树；无 Git 项目检查原 SHA-256 文件清单和冻结范围。旧多仓特殊迁移只有明确 \`explicitAuthorization:true\` 和原有双开关才能继续；Git 项目受保护文件回到 Git HEAD 后，\`refresh-protected-worktree\` 需要 \`id\`、\`actor\`、\`reason\` 与 \`explicitAuthorization:true\`；异常仓库位置迁移还需精确映射和明确授权。原保护快照与操作审计保留，绝不因此自动通过测试和验收。
- **多开发者与跨设备工作区**：MCP 项目根可以完全没有 Git，所有文件引用相对项目工作区；使用 Git 时才记录仓库相对身份，根仓库为 \`.git\`，独立子仓库如 \`apw-life/.git\`。正常 git pull、merge、clone 和移动目录无需 Owner 密钥、无需每台机器手动搬迁，也无需改 SQLite。旧 v5 的绝对 git_dir 冻结记录及历史完成证据保留原值，读取时自动解析成相对位置。后续正常提交不会修改历史基线，安全检查仅要求真正独立的 Git 仓库保有原始基线提交，旧测试证据仍绑定旧任务的交付 SHA。只有异常历史位置审计纠正才使用 Owner 授权 relocate-repository-baselines。
- **已交付任务让出 Git 写入权**：一个任务已经提交代码和真实测试记录，处于 in_review 待审核时，可保留自己的管理租约，让没有前置依赖、文件范围不重叠的 Ready 任务使用同一个 Git 工作区继续开发。任何时候最多一个实际写入任务，暂存代码、未提交工作或范围重叠时不得切换。用 \`next.parkedReviews\` 查看待审任务；当前 AI 继续负责真实自审和结果登记，绝不能因让出写入权就把任务当作 Verified。若自审失败，要先重新领取 Git 写入权才能修改代码。正常切换无需 Owner 密钥和其他 Agent。
- **本地配置豁免与精确交付**：使用 Git 的项目可在各独立仓库真实 Git 目录的 info/devcontrol-worktree-ignore 填写本机非业务配置文件的匹配规则。明确填写的 AGENTS.md、Skill、.cursor/mcp.json，以及 /docs/history-session/ 下旧 History Markdown/索引等，即使已被 Git 跟踪或暂存，也可从 DevControl 工作树噪声检查中排除；不改变 Git 跟踪、暂存、提交和原始交付证据。**禁止以 /docs/** 豁免正式 PRD/ADR/冻结 scopeSource、业务代码、冻结任务路径、软链、不安全路径和实际测试 Gate**。本机实际使用豁免时写入 dc_audit，记录规则及文件 SHA-256，不保存私有配置正文。多仓 \`report\`、\`complete\` 可通过 \`deliveryHeads\` 指定完整的仓库路径前缀及实际提交 SHA，证据、Review、Gate 和 \`verify\` 只承认这些交付提交。后续 merge 只将相对第一父真正改变的冻结路径视为新改动，不能因为第二父缺少原文件就误判；但第一父路径发生真实改动，即使后续恢复原内容，也不能复用旧验收证据。MCP 自动生成的 Skill 和 AGENTS.md 只有符合真实生成器内容才可单独或与合法业务提交一起通过。
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
- On every MCP startup, check the target Git or Git-free workspace's managed Skill and
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
  task, implement and run genuine project tests. Git projects commit approved
  paths; Git-free projects submit their scoped SHA-256 file manifest.
  Record complete/report; consult task-closure-status, then use ONE verify
  with acceptance evidenceReference, findings and a gate record for every
  frozen real acceptance test. Current AI runs tests and examines code,
  DevControl only validates and records one atomic outcome. Old separate
  self-review/gate-review actions remain optional for legacy sessions.
- When a task is deferred, resume-verification preserves the original
  submitted Git commit or immutable file delivery snapshot. Follow the
  closure checklist to report later real evidence and complete reviews;
  do not rerun business tests from DevControl or reset other Agent work.
- When later Git commits changed files inside a deferred task's frozen
  allowed scope, resume-verification must review ALL affected frozen paths,
  not only the original delivery files. Supply the current reviewedHead,
  exact overlappingPaths, substantive diff findings and real tests bound to
  the original frozen delivery. The same HEAD-bound review applies to report,
  Gate review, re-deferral and verify. Any new HEAD invalidates the review,
  even when the original patch still applies cleanly. Never treat a resumed
  review as a successful test or as permission to bypass frozen Gates.
- Writer leases expire after 30 minutes by default and can be renewed up
  to 60 minutes. A committed in_review delivery does NOT need to reclaim
  an expired writer lease for self-review, Gate inspection or verify:
  use the original retained task token and unchanged reviewed source.
  New code and ordinary report still need an active writer lease.
  An old multi-Git receipt with missing/stale repository binding may use
  rebind-legacy-evidence, but ONLY after inspecting the real original test
  artifact (relative path plus SHA-256) and matching every frozen delivery
  commit. Record the original evidenceReference, exact deliveryHeads, actor,
  detailed reason and technical findings. This action appends an audited
  binding without rewriting the original report, running tests or approving
  any Gate. If the original receipt cannot establish these commits, rerun
  the real project tests; never create a synthetic passing test or Gate.
- If the old multi-Git test output was LOST, run genuine tests again using
  isolated, clean Git worktrees at EVERY originally frozen delivery HEAD.
  Then record-rerun-evidence with supersedesEvidenceId, complete frozen
  deliveryHeads and testedCheckouts, commandCwd, actual command/exitCode,
  new test log artifactPath/artifactSha256 and substantive findings.
  This narrow evidence-only action uses the original in_review token after
  the writer lease expires, never grabs another task's Git index, and never
  overwrites original evidence. Nonzero results are audited but cannot pass
  Gate. Successful results must still pass all original Gates via verify;
  testing a descendant checkout is not proof of frozen source behavior.
- Optional local-only info/devcontrol-worktree-ignore in each real Git-dir
  adds to standard Git ignore. Explicit patterns exempt tracked, staged and
  untracked non-business LOCAL tool configurations (e.g. AGENTS.md, managed
  SKILL.md, .cursor/mcp.json), and a precisely listed /docs/history-session/
  legacy History archive from worktree noise checks. The rules DO NOT
  change Git's index, commit history, frozen task scope or real Gate checks;
  broad /docs/**, approved PRD/ADR/scope source, business code, symlinks
  and unsafe files cannot be exempted. DevControl
  audits exact paths and SHA-256 fingerprints whenever the exemption is used.
- Multi-Git report and complete can specify deliveryHeads for every Git
  prefix (root key is ""), to bind test evidence and Gates to the original
  commits. Later unrelated merges never enlarge the frozen delivery diff;
  inspect merge changes against their first parent only. A real scoped
  change, including a later revert, invalidates the original approval.
- Multi-developer Git pull/merge/clone and moving a whole workspace need no
  Owner key, per-machine action or SQLite rewrite. Git metadata identities
  are project-root-relative. Legacy v5 absolute-path baselines are read
  compatibly and retain their original evidence hashes and tested commits.
  Only exceptional historical audit correction uses Owner-key-authorized
  \`relocate-repository-baselines\`.
- A completed and evidenced in_review task can yield the one shared Git writer
  to a Ready task only if all prerequisites are Verified, the frozen scopes
  do not overlap and no Git index changes are staged. Review retains its
  own task lease, original commit and evidence without being marked Verified.
  next.parkedReviews lists such work for the current development AI. After
  failed review, reclaim the single writer before editing new code; never
  demand an Owner key or another Agent for normal disjoint collaboration.
- Registered linked Git worktrees keep separate Git indexes but share the
  canonical main project's SQLite. The current development AI uses ordinary
  Git to create worktrees and integrate exact commits; claim in that checkout
  with project-root pointing to it. Existing atomic task prerequisites
  must be Verified, and unverified tasks must never have overlapping scopes.
  The original checkout owns its submitted test evidence and technical
  review. An isolated delivery cannot be Verified before main Git contains
  its exact commit. Multi-Git child repository projects require the existing
  stricter workflow. DevControl runs neither Git merges nor tests.
- When a real common-ancestor SQLite snapshot exists, provide basePath on
  both preview and candidate requests. Three-way reconciliation can
  automatically apply only a one-sided edit to the same unapproved draft
  task. Two divergent drafts need the current AI's resolutions specifying
  exact table/key, source or target choice, actor and substantive reason.
  The choice is fingerprint-bound and durably audited in the candidate's
  dc_audit. Never resolve a Ready, running, in_review or Verified task,
  evidence identity or historical audit by arbitrary AI preference.
- For two independently modified SQLite files, the responsible AI uses
  sqlite-merge-preview to inspect task, dependency, evidence and history
  conflicts. Only if both files have shared project ancestry, compatible
  schemas and no conflicting rows can sqlite-merge-candidate create a NEW
  candidate after the exact preview fingerprint is confirmed. Never
  overwrite either original DB or copy local leases/device Git paths.
  Source-only running or Verified task states require real Git and test
  evidence review, not timestamp-based promotion. Candidate is not active
  project state and not a global cross-computer synchronization service.
  No always-on host and no third-party Agent is required.
- DevControl is project management only, not a testing or acceptance Agent.
  The current development AI owns requirements analysis, architecture,
  implementation, real project tests and technical self-review. Never
  introduce or require third-party Agents for routine development. Each
  approved leaf delivers ONE independently testable outcome and may have
  positive, negative and recovery criteria. All prerequisites must be
  Verified before claiming a dependent task; unrelated work remains available.
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
- New ideas use idea-capture, idea-assess, the current AI's idea-self-review
  and exact Owner idea-decide for material changes. Another Agent is not
  required, and frozen scope must not expand without authorization.
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
