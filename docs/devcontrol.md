<!-- v5-agent-action-guide:start -->
> **当前 v5 Agent 调用提示**：主 MCP 只有一个 `devcontrol` 研发管理工具，包含 **83 个 SQLite action（含零副作用 `guide` 导航）**。不知道怎样调用时先用
> `{"action":"guide","input":{"intent":"feature"}}`（无需 project_root），然后根据返回的示例与真实 Git 项目合同调用下一步。
> [完整 Agent 调用指南](v5-agent-action-guide.md) · [官网导航页](pages/v5-action-guide.html)。启动自动检查并同步 Skill / AGENTS.md 的指导修订号，保留用户规则。
<!-- v5-agent-action-guide:end -->

# DevControl — MCP Probe Kit 5.0.0 source-development reference

> **Current branch contract:** This document describes implemented project governance in the unpublished 5.0.0 feature branch. Dated Neyna V0.1 observations and original migration decisions below are historical examples, not default plans for another project or evidence of release acceptance. For a complete source install, read the [v5 guide](v5-development-guide.md); v4/V1 frozen specs remain historical baselines.

> **Availability:** This page documents the **unpublished 5.0.0 development
> branch**, not the npm `latest` / published 4.1.1 installation. Follow the
> [5.0.0 source installation and migration guide](v5-development-guide.md).
> DevControl is a task/project management and verification system. The **Agent**
> independently implements and reviews changes, runs actual application/SQL
> work only under its approved scope, and provides evidence. DevControl itself
> does not take over SQL execution or act as the independent reviewer.

For an end-to-end, field-tested way to apply this interface to a real project,
see **[v5 Best Practices / v5 最佳实践](v5-best-practices.md)**: frozen plans,
independent Agent review, task leases, real gates, scope changes, batch delivery,
and History handoff. This reference remains the detailed command/contract source.

DevControl is a Jira-style **project task registry**, distinct from MCP protocol
Tasks (short-lived tool executions) and Delegated Plans (feature workflow steps).
The main v5 MCP exposes a single `devcontrol` tool for all supported SQLite operations. The separate local DevControl server remains optional.

## Project memory ownership (never confuse the two memory systems)

**Project memory is mcp-probe-kit History Session**, provided by
`history_session_bootstrap`, `history_session_checkpoint`,
`history_session_search` and `history_session_read`. Its archive contents,
pagination, redaction, original user input and continuity state retain their
existing semantics. DevControl exposes the same records in the local
`项目历史会话` workspace section. History Session uses the **same project-local
SQLite database**, in separate `hs_*` tables. A default Git project with Node22
no longer creates numbered `docs/history-session/N.md` files. Existing
numbered archives are imported once transactionally, left on disk untouched for
rollback, and subsequent updates go to SQLite only. Returned archive paths are
virtual locators for the History Session read API, not instructions to create
Markdown. Node.js 22+ and standard project SQLite History are required for v5. Custom live History directories and `MCP_HISTORY_STORAGE=files` are rejected; Markdown numbered archives may only be read-imported.

The `memorize_asset`/`search_memory` tools are a **different**, optional,
cross-project Qdrant vector-memory service. They are not modified, migrated,
queried by the project workspace, or silently written by the new SQLite
feature workflow.

## Native Feature, Bug and design records

On Node22+ Git projects, `devcontrol` `feature-create`/`feature-save` store the full
feature proposal, parent-child task draft, approved plan and revision history in
the local `dc_features` tables, **without generating requirements.md,
design.md or tasks.md**. The Agent first reviews SQLite History and existing normative documents, then calls `devcontrol feature-save` and
`devcontrol feature-validate`. A proposal does not bypass task approval.
There is no `storage_mode=files` bypass in v5; exported Markdown is a human-readable artifact only.
`feature-export` exposes Markdown or JSON on demand; the workspace includes
download actions for individual feature records.

`devcontrol` `work-record` and `bug-step-save` register and update a project-local issue, preserving
its SRC-8 analysis workflow. `dc_work_items` contains Bugs and proposed
architecture changes **only**, not History Session memory. Items and tasks
capture creator and local device labels. Task deduplication evaluates
name/track/release/parent/dependencies/scopes/gates rather than matching
ambiguous short titles alone.

When a feature design changes, its author must explicitly declare whether it
affects the top-level architecture. Impacting changes open an architecture
sync request, and `feature-validate` blocks until the required top-level
design file has a real new Git commit plus explicit review. The system does
not quietly rewrite approved ADRs/architecture docs.

## MCP auto-start, high ports and LAN workbench

The **existing MCP server** automatically ensures the current Git project's
Web workspace is running. Its Node process serves the same project-local
SQLite and HTML view for Windows, macOS and other Node22 hosts. A detached
child process is reused across MCP reconnects; startup does not open a browser.
No Finder app, Windows CMD/EXE client, desktop package, frontend framework,
system daemon or OS installer is built or maintained. For diagnostic purposes
only, `devcontrol workspace-status --project-root .` reports its selected URL.
To disable automatic startup, set `MCP_DEVCONTROL_AUTOSTART=0`.

The default base port is **38180**, and independent projects scan up to the
next 79 ports (`38181`, `38182`, etc.). The startup probe only reuses a
service presenting the matching project root, schema version and LAN mode.
The SQLite remains inside **each Git project**, not in a central shared DB.

The selected port now persists in the project's `dc_workspace_runtime` SQLite
table together with its PID, random process instance ID, creation timestamp,
workspace schema and LAN mode. On reconnect, the MCP prioritizes the recorded
port; an existing server is terminated and restarted there **only** when its
loopback-only instance metadata matches the project's SQLite record. When
ownership cannot be proven, no process is terminated and the next port is
probed instead. An atomic per-project startup lock prevents competing MCP
initializations from spawning duplicate workbenches. Legacy access key and
cookie fields are removed from the ignored project-local network configuration
when it is next read. Foreign listeners, including older unverifiable
workbench processes, must never be killed on the basis of a port number alone.
An older schema version can also be restarted on the *recorded* port if its
reported version, PID, instance ID, creation time and project path match the
old SQLite record. An unknown legacy process is never terminated.

## New project and existing repository onboarding

For Git projects running Node22+, `init_project` now invokes the same
SQLite-backed, read-only inspection as `devcontrol onboard --project-root .`.
Managed Skill and AGENTS.md bootstrap is preserved. The standard initialization
does not generate another `requirements.md`, `tasks.md`, repetitive report or
unapproved task backlog. Non-Git and Node20 cases retain the legacy
initialization instructions.

The new `GET /api/onboarding` endpoint shows goal/context, constitution,
requirements, architecture and approved task plan from **actual files and
approved SQLite tasks**. It recognizes several established document paths
without replacing existing documents. On empty projects it displays missing
baselines rather than imaginary completed planning; on existing projects it
preserves source code, task IDs, dependencies, History Session and previous
approval state. Running the inspection again does not duplicate tasks.

The workspace overview displays the missing-baseline checklist without
creating an additional navigation area or enabling Web writes. The owner
must review the scope, requirements and plan before new work is approved.
Draft tasks do not count as an executable plan. Actual execution priority and
gates still come exclusively from the existing SQLite ledger.

## Full-version plan: Spec-depth quality and change review

**Acceptance target:** planning depth must not regress relative to the older
three-part Feature Spec (requirements, design, tasks). A Kanban card title,
estimated percentage or workflow template is not a complete specification.
The older canonical Git Spec is retained; project SQLite stores actual Feature
sections, plans, child relationships and task evidence. Web readers display
these verbatim rather than silently discarding the saved plan or masking blank
sections.

For new Git projects, the **whole release plan is proposed before development**:

1. `devcontrol plan-review --json '{"plan":{...}}'` checks stable in-scope
   FR/NFR IDs, a complete group/leaf tree, dependency cycles and coverage.
   Leaf tasks must have a reviewed design reference, requirement traceability,
   exact expected deliverables, positive and negative test cases, independently
   verifiable acceptance, bounded file paths and approved execution Gates.
   As a planning heuristic only, a newly proposed leaf is estimated at no more
   than one workday (8 hours); this is **not** a speed, quality or completion
   metric. Larger work must be split; smaller estimates do not imply correctness.
2. `devcontrol plan-propose --json '{"plan":{...},"actor":"..."}'`
   validates canonical committed requirements and existing product task
   coverage, then persists only a **review_pending** proposal in SQLite. It
   creates **zero executable tasks**. An incomplete or duplicated proposal
   fails without partial task creation.
3. `devcontrol plan-approve --json '{"release":"V0.1",
   "expectedHash":"<reviewed SHA-256>","approvedBy":"<reviewer>"}'` matches
   the exact proposal and atomically imports all new task IDs and detailed
   specifications into SQLite. Only then can Agent task execution start.
   `approvedBy` is an auditable local label, **not independently authenticated
   Owner identity**. A protected remote reviewer/CI is still required for a
   trust boundary stronger than local machine permissions.
4. Once frozen, plans cannot silently replace, remove or reorder task
   definitions. New work is added through a reviewed additive proposal on
   the previous revision. Existing task IDs, verification results and Spec
   fields remain untouched. Changing already approved work needs a separately
   reviewed scope decision; no Agent may quietly rewrite the frozen plan.
5. Only a leaf of a frozen release is executable; parent progress is derived
   from all children passing their real Gate. HTTP/Web endpoints
   `/api/release-plan?release=V0.1` and `/api/tasks/ID` are read-only.
   The same operations are exposed via the DevControl MCP/CLI, with
   validation enforced by the SQLite ledger rather than tool descriptions.

**Migration boundary:** projects imported from the former Python task ledger
retain their old task-state behavior until that release receives its first
reviewed frozen plan. Historical F0/F1 verification is not reversed or
fabricated. A historical task without any acceptance Gate is not claimable.
Once a release is frozen, all subsequent eligible work must occur in the
frozen tree. A brand-new Git project has no migration exemption.

All Gate names (including legacy `docs`, `go_contract`,
`go_http_integration`, `go_postgres_live`, `flutter_test`, `ios_device_e2e`,
`v01_release_e2e`) identify frozen acceptance conditions, **not programs
DevControl runs**. The development Agent runs tests using the project's own
toolchain and records the original run evidence. The responsible development
Agent performs a substantive, version-bound `self-review` and submits a
`gate-review` outcome with evidence references (`reviewMode=self`). A separate
reviewer is optional for ordinary task completion, not a blocking dependency.
DevControl records and enforces the workflow but does not judge business tests.
`sqlite_decision` is a structured internal DevControl decision record; it
is not a business test runner. Missing or failed reviews remain blocked.

## Work item visibility and substantive task quality

### Shared operating policy: planning freedom, frozen execution

This contract is **project-independent**; no example project, release number,
implementation language, filename layout or particular reviewer is implicitly
part of the rules. The three UI tabs are a projection of real state, not three
separate tables.

**Discovery / product design / task decomposition** is the stage in which
alternative solutions, task decomposition and dependency changes may be
proposed. Each proposed leaf must reference the authoritative requirement
and design, describe the external trigger, the exact workflow and domain
constraints, positive and failure cases, allowed file scope, required tests,
deliverables and concrete completion evidence. Open decisions remain
visible, not silently answered by an implementing Agent.

**Review / freeze** accepts an exact plan-content hash and preserves the
previous draft in project-local SQLite. Approved content cannot be replaced
by free-form later chat or a new Agent session. Task ownership is only a
**lightweight record of which developer workstation performed the work**.
`local-developer` reads this checkout's *currently effective* Git identity
(repository/global/system settings, environment, or Git's OS fallback), never
historical commits or the most frequent author. When a task is created, its
owner and device are recorded automatically; on another workstation's claim,
the task's current owner/device are updated with an audit trail. Neither event
needs a separate assignment or reviewer approval. If no Git name is available,
use the host's device label. `GET /api/local-developer` displays this
host-local developer; a LAN viewer does not become the host's developer.
The read-only API does not expose raw Git email addresses. A task pending in
the plan has no executable SQLite row, so the list labels the *current host*
as the prospective developer without falsely backfilling historical owners.

**New-project v3 execution contract (existing SQLite databases preserve
their current plan profile):** New independently created projects require
`spec-depth-v3` at the first version freeze. Each leaf must specify
reviewed `inputs`, `outputs`, `preconditions`, `stateTransitions`,
`forbiddenChanges`, `stopConditions` and exact `allowedChangedFiles`.
The latter must be inside the original approved `allowedPaths`; both
`check` and final `verify` reject staged/committed changes to any other
file. Review can store a pending draft with open questions; the *freeze*
rejects unresolved product decisions, while `claim` automatically records
the executing workstation. Field presence and passing gates do not establish semantic product
correctness; owner review still examines original sources and expected
observable behavior. Existing project databases and frozen plans are not
silently rewritten or auto-approved.

**Local commit guard:** `hook-status` inspects project Git hook configuration.
`hook-install` is an explicit opt-in for an empty hook slot. It installs a
thin pre-commit wrapper over the same `devcontrol check`, uses exclusive
creation, and refuses to overwrite another team's pre-commit hook or an
existing `core.hooksPath`. On repos already using a custom hook, the operator
must deliberately chain the check. This is bypassable with `--no-verify`
or Git configuration; trusted CI and protected branches remain required
for an external enforcement boundary. Windows has not been independently
verified.

**Execution** is constrained: `next` and `claim` inspect the frozen leaf
contract. For a reviewed Spec-depth release, an
open design decision, missing workflow/invariants, or source drift blocks
claiming. A claim returns the full immutable contract, including scope,
dependency and acceptance cases, alongside the lease. Agents should
implement the stated solution and may not silently alter the product goal,
external interfaces, non-goals or acceptance denominator. If implementation
reveals an ambiguity or a missing capability, stop that task and submit a
change proposal for product/design review; do not improvise a new product
scope. Additional requests go into the pending plan and respect prior
dependencies, rather than automatically preempting the active task.

**Inspection / verification** use project-local Git and SQLite evidence.
`check` validates staged file paths. `report` and `complete` attach
committed implementation and test evidence to the leased task; `verify`
rechecks the contract, clean Git state, changed-path scopes, and configured
quality Gates. Missing physical-device, third-party or acceptance runners
are failures/Not Run, not a shortcut to Verified. Parent progress derives
from actually verified children. An execution Agent's own assertions are
not sufficient product acceptance.

#### What is enforced today versus what still needs independent security

The code enforces plan hashes, dependency blocks, single-worktree leases,
the reviewed task scope and configured quality gates. Developer names/device
are **tracking metadata, not authentication** and never block a task solely
for lacking an earlier assignment. Plan approval remains a separate decision;
`approvedBy` is a caller-provided audit label, not an authenticated signature.
Git hooks are bypassable; stronger CI/role systems are possible future
integrations but are NOT prerequisites of basic task creation and claiming.
The product priority is actionable, correctly decomposed tasks, not an
additional permission-management subsystem.

#### Language, viewer identity and source text

Workbench UI locale is per reader. `?lang=zh-CN` or `?lang=en` overrides
the browser's Accept-Language. The MCP `workspace-link` tool accepts a
host-provided `language` taken from the **current chat** and returns a
matching local/LAN link. This interface does not read ChatGPT conversations
directly; without an explicit host hint it falls back to the browser
language. UI strings live in a common catalog independent of project names.
Canonical Git specs, task names, original evidence and user-entered fields
remain in their authored language. Initial English chrome translation is
not yet a guarantee that every dynamic page/notification or source document
is localized. Other languages need catalogs and independent browser tests.

**Examples only (not generic rules):** In a warehouse receiving workflow,
the owner may explore carrier scan formats and assign the import subtask
before freezing it; the coder may not redesign shipment reconciliation
because an unexpected barcode appears. In a scientific dataset export,
the reviewer may choose anonymization and provenance requirements; the
coder may not remove privacy checks or change the measurement units to
improve a test result. Each example exercises the same owner/change-control/
source-evidence rule despite having unrelated domain entities.

The Work Items view presents exactly **three tabs: 未开始 / 开发中 / 已完成**.
Each tab contains individual clickable tasks, not planning-stage containers.
`draft`, `ready` and pending release proposals display under 未开始;
pending proposals retain a separate **待审核** badge and cannot be executed.
`in_progress` and `in_review` display under 开发中 (review is not completion),
while only `verified` displays under 已完成. Cancelled tasks do not enter
these three active-work tabs. The detailed drawer still exposes requirements,
ownership, dependencies, acceptance, source references and unresolved
decisions; unknown owners/dates remain unknown. The SQLite plan and task
ledger stay authoritative; the simplified UI never rewrites actual states.

**Field presence is not substantive approval.** Before a plan can be frozen
for production development, its reviewer should check the user/system
trigger, actual business flow, design decision and boundary, dependent
external decisions, responsibility, testable success and failure branches,
precise deliverables, and reproducible proof. A title, an estimated number
of hours, and one happy-path and failure-path sentence are not enough to
establish equivalence with a full Spec.

Examples of the transferable rule (not project tasks): a document-import
feature must distinguish permitted files, incomplete parsing, page/source
anchors and retries; a billing integration must distinguish authorization,
idempotent callbacks, settlement, refund failure and reconciliation.

**Current Neyna V0.1 pending-proposal audit (2026-10-20):** The 53 new leaves
all lack a dedicated business-context/trigger description, recorded
assignee, and actual schedule; each contains only one positive and one
negative scenario and the same broad out-of-scope statement. This is a
source-data quality finding, not a UI problem and not a reason to invent
owners, dates or new approved requirements. The proposal remains
`review_pending` until deepened and reviewed; previous syntax/coverage
checks do not mean that the Spec-depth acceptance criterion was met.

### Pending draft content review, never silent plan replacement

`plan-revise` is the **only** way to replace an unapproved plan with richer
task content. Its JSON input includes `plan`, `actor`, and exact
`expectedPreviousHash` read from `release-plan`. A different hash,
missing previous proposal, changed release/scope/requirements, or edits to a
previously approved historical task all cause a transaction rollback.
The old proposal snapshot and both hashes are saved in SQLite
`dc_release_proposal_drafts` and `dc_audit`. Revision does **not** create,
approve, claim or verify any executable task. Proposed task IDs and approved
releases remain separate, and Web access stays read-only.

`qualityProfile: "spec-depth-v2"` requires **for each new leaf**, beyond
title and file paths: a concrete event trigger and user outcome, an ordered
domain workflow, at least two nonempty business invariants, source links,
the actual unresolved decisions, review notes, two positive and two
adversarial scenarios, plus an independent list of evidence. Structural
validation proves only these fields and plan dependencies are well-formed:
it does **not** prove accurate business requirements or runnable tests.
The plan approval API now rejects old shallow proposals without this profile.
The Owner must review content, dependencies, correctness, actual ownership,
and scope before the frozen-plan transaction may be invoked.

For this V0.1 draft, the prior `apps/mobile/` paths contradicted accepted
ADR-0002's `apps/client/` single Flutter client. The candidate content
revision corrects those unapproved paths only, without rewriting F0/F1
verified milestones. Audio thresholds/ASR provider and storage/identity
remain unresolved and are disclosed as blockers, not invented as approved
architecture.

The proposed V0.1 plan is displayed as individual unstarted task cards
without increasing verified progress or auto-creating executable tasks.
Existing verified F0/F1 milestones remain historical evidence; they are not
retrospective proof of V0.1 feature tests. The user must review the exact
proposal hash and unresolved architecture/runner blockers before approving.

The Web Spec viewer now separates **unfilled templates** from approved
`requirements/design/tasks` and shows the original complete Plan JSON,
step prerequisites, required inputs, outputs, evidence, child-spec details and
draft guidance on demand. A template with placeholder fields remains draft,
even if its saved JSON is long. UI visibility never substitutes for the
review/approval and implementation Gate.

Network mode is **explicitly project-scoped**. New projects enable
private LAN by default; an existing explicit `lanEnabled:false` remains off.
Disable with `devcontrol lan-disable --project-root .` at any time. Its
configuration remains in the project's Git-ignored state. DevControl accepts
private IPv4 sources and recognized local Host headers. FRPC forwarding with
a custom domain requires explicitly setting
`DEVCONTROL_ALLOWED_HOSTS=devcontrol.example.com` (or `FRPC_DOMAIN`) in the
board process environment before starting it. Simply enabling LAN does not
authorize an arbitrary proxy Host: unknown domains fail closed.

**There is no password, login screen, access key or cookie**; the dashboard's
**局域网连接** view shows the actual URLs and central browsers open them
directly. All workspace pages, Feature proposals, Bug details, architecture
and History Session are readable to every device allowed on that LAN.

Important: LAN mode is intentionally **unauthenticated HTTP**. Private IP
checks are not an identity or authorization system and a forwarded/NAT
connection can also appear to originate from private space. Only use it on a
trusted LAN, do not forward the port to the Internet, and disable LAN on
untrusted networks. Protect remote access via network/VPN controls if needed.
The Web API remains read-only.

Windows and macOS must still be validated by platform-specific CI **for
the same Node MCP package**; no OS-specific client build or release is needed.

## Runtime and entry points

Node.js 22+ is required **only for DevControl**, because SQLite is provided by
the Node built-in experimental node:sqlite module. Other mcp-probe-kit tools
continue to support Node 20+. No database server or native npm addon is needed.

- CLI: mcp-probe-kit devcontrol next --project-root /path/to/project
- CLI: mcp-probe-kit devcontrol onboard --project-root /path/to/project
- CLI: mcp-probe-kit devcontrol list --project-root /path/to/project
- CLI: mcp-probe-kit devcontrol create --project-root /path --json '{...}'
- CLI: mcp-probe-kit devcontrol approve --project-root /path --json '{...}'
- CLI: mcp-probe-kit devcontrol claim --project-root /path --json '{...}'
- CLI: mcp-probe-kit devcontrol renew --project-root /path --json '{"id":"TASK-1","leaseToken":"...","ttlSeconds":1800}'
- CLI: mcp-probe-kit devcontrol release --project-root /path --json '{"id":"TASK-1","leaseToken":"..."}'
- CLI: mcp-probe-kit devcontrol report --project-root /path --json '{...}'
- CLI: mcp-probe-kit devcontrol complete --project-root /path --json '{"id":"TASK-1","leaseToken":"...","summary":"What was delivered","implementation":"Concrete implementation details","verification":"Tests and outcomes","remaining":"Known limitations"}'
- CLI: mcp-probe-kit devcontrol verify --project-root /path --json '{...}'
- CLI: mcp-probe-kit devcontrol trace --project-root /path --json '{...}'
- CLI: mcp-probe-kit devcontrol board-data --project-root /path/to/project
- Workbench diagnostics: mcp-probe-kit devcontrol workspace-status --project-root /path/to/project
- LAN enable: mcp-probe-kit devcontrol lan-enable --project-root /path/to/project
- LAN access info: mcp-probe-kit devcontrol lan-access --project-root /path/to/project
- LAN disable: mcp-probe-kit devcontrol lan-disable --project-root /path/to/project
- MCP: mcp-probe-kit devcontrol serve --project-root /path/to/project

## Unified project workspace: a newcomer sees the complete development context

The local viewer at `/` is no longer just an isolated task board. It is a
**Project Workspace** with eight navigation areas:

1. **项目总览** — mission, current eligible work package, actual task counts, onboarding links and verified delivery loop.
2. **产品与目标** — product vision, version roadmap and phase OKRs.
3. **需求管理** — PRD FR/NFR identifiers, priorities, acceptance criteria and related feature Specs.
4. **技术架构** — architecture introduction, real fenced diagrams from source documents, ownership and ADR links.
5. **任务与进度** — exactly three task tabs (未开始 / 开发中 / 已完成) populated by existing SQLite ledger and pending plan. Clicking a task shows its entire reviewed/unreviewed Spec; standalone `/board` is retained only for compatibility, not linked in the normal task UI.
6. **Bug 与架构变更** — SQLite Bug records and explicit architecture reconciliation.
7. **项目历史会话** — real project-local History Session search and read.
8. **文档中心** — canonical Git documentation index, text search and a read-only viewer.

Only source documents are rendered. No project metadata, goal, architectural
status or requirement completion is fabricated by a model. If the project lacks
`docs/product/vision.md`, `docs/product/requirements.md`, etc., the workspace
shows a missing-source state rather than inventing information.

`GET /api/project` dynamically reads the current project docs index;
`GET /api/docs?path=...` reads only approved Markdown from the repo. Git and
SQLite stay separate single sources of truth. Responses are read-only and
limited to the local loopback server; private `docs/history-session/`, unsafe
paths, symlink escapes, oversized files and paths outside indexed project docs
are denied. The browser inserts arbitrary document content using
`textContent`, not `innerHTML`.

## No client and no repeated command

The main MCP startup and the optional dedicated DevControl MCP stdio server
both trigger idempotent workbench startup. This is the whole user-facing
installation lifecycle. Open the reported URL in any browser or on the
trusted central LAN machine; there is no separate desktop executable.

Project tasks are proposed as drafts, approved, claimed, developed, reported for
review, verified by runnable gates, and audited. Fields include stable task ID,
parent ID, dependencies, priority, release, file scope, acceptance gates and
optional links to existing mcp-probe-kit Plan/Spec IDs.

## Stop generating task-progress Markdown

**Authoritative task lifecycle and detailed completion records belong in
SQLite, not in new ad-hoc Markdown documents.** After a task has actual Git
commits and evidence, the Agent calls `devcontrol complete` with:

- `summary`: outcome in a few sentences,
- `implementation`: what changed and why,
- `verification`: executed commands, observed results, and evidence,
- `remaining`: limitations, risks, follow-ups (empty when there are none).

These records are append-only revisions in `dc_completion_notes`, associated
with task ID, Agent and exact committed Git SHA. `verify` **rejects** an
in-review task without a completion record or if its latest note points to an
earlier Git revision. Detailed task trace and the board drawer read from the
same database. Previously verified tasks are not assigned invented summaries.

Only durable specifications, normative ADRs, public API contracts and essential
user/operational documentation should be tracked in Git. Temporary status
reports, checklists, testing logs and Agent handoff reports belong in the task
ledger. Existing required `spec.md`, version roadmap and ADR processes still
apply; this rule does not justify omitting essential design documentation.

The Git Hook and final verification both reject **new Markdown files** unless
their exact path was approved in the task's `allowedPaths`, or they are a
canonical feature `docs/specs/<feature>/{spec,design,test-plan,evidence}.md`
inside an approved feature scope. Broad `docs/**` permission by itself does
**not** authorize new daily summaries or handoff files. Editing an existing,
scoped document remains permitted. This is a *document creation policy*, not
a reason to avoid maintaining approved normative design documents.

## Read-only project workbench (no new UI framework)

`devcontrol workspace-status --project-root /repo` resolves the automatically
started Web viewer, normally **http://127.0.0.1:38180/** on the development
computer. The default Work Items view uses three compact tabs — 未开始 /
开发中 / 已完成 — over real `dc_tasks` and pending proposal data. Historical
F0/F1 completed milestones remain visible, stage-only planning containers
are hidden, and the source/drill-down paths are preserved.

With LAN disabled, the server only binds to `127.0.0.1`. With LAN enabled,
private LAN readers access it without login. Strict Host validation, private
source filtering, Content Security Policy and read-only API routes remain in
force. No independent Kanban status table is introduced.

## Interrupted sessions and safe recovery

The CLI/MCP `next` operation shows the **active leased task first** so a second
Agent cannot silently start a different task in the same worktree. An eligible
parent is held back while any child remains unverified. Use `renew` before a
long-running task lease expires; it requires the original lease token.

After expiry the same task may be re-claimed; DevControl preserves the original
Git base SHA, including committed work from the previous session. Expired leases
for **another unfinished task** block task switching. `release` only succeeds
before any Git changes have occurred; release never abandons committed evidence.
An expired `in_review` task can be reclaimed and re-verified without reopening
the task or losing the review evidence.

**External device unavailable (not a successful verification):** After a
real scoped Git commit, structured completion and reported test evidence,
an active `in_review` lease may use `defer-verification` with its lease token,
the exact required physical/external Gate and a concrete reason. The task
remains `in_review` and appears as **待设备/外部验收** on the workbench.
DevControl records an immutable Git submission, retains the original Gate,
and releases **only the singleton task lease** so independent work can move
forward. It never marks the Gate passed or increases Verified. Staged,
untracked, or changed Owner files are not silently discarded; resolve
uncommitted code provenance before deferring.
If subsequent work already exists in the same main worktree, use the explicit
`preserveExistingWorktree:true` option only after reviewing the current
Git status and task provenance. This does not count the uncommitted code
toward the deferred task: the tool records an exact SHA-256 snapshot of all
regular tracked/untracked changes, rejects staged files and symlinks, and
leaves every file and the index untouched. The normal `verify` path remains
strict; the snapshot cannot satisfy any Gate.
For an already **committed, scoped** task, the same explicitly approved
preservation option also works during `complete`: it records all unrelated
tracked/untracked WIP byte fingerprints without changing Git or source files.
The later `defer-verification` must match that exact snapshot. Neither
completion nor deferral passes the real device Gate.
Once the project-owned acceptance dependency is available, use
`resume-verification` to reclaim the old task and inspect original version-bound
evidence with `self-review`, `gate-review` and `verify` (or the optional
separate Reviewer flow). If the actual retry still cannot meet the frozen
Gate, `defer-verification` may safely re-defer that same immutable completion
under its active original developer lease, with a concrete updated reason;
it releases the singleton without passing any Gate. Later commits cannot be
counted as the original frozen diff, and any later modifications to original
delivery files still block direct resumption until reconciled.

**Device and project-specific acceptance evidence:** `ios_device_e2e`
is a requirement label, not a DevControl XCTest command. The development
Agent is responsible for the applicable physical-device tests, CI and
receipts and explicitly reviews whether the results cover the frozen
acceptance; a second Reviewer is optional for ordinary tasks. DevControl stores who ran and reviewed them,
the evidence reference, Git commit and outcome, and moves state to
`Verified` only when the workflow is complete. It does not select a device,
launch Xcode/Flutter/Go, parse XCTest bundles, create tunnels or execute
project-specific validation commands. Use read-only `task-closure-status`
to identify a missing report, independent review, Gate review or final
confirmation rather than wait indefinitely.

The `import-spec` operation uses stable manifest subspec IDs rather than array
positions, and its full task/dependency import is **transactional**. Reordering
subspec entries cannot silently rename existing project tasks. A conflicting
import rolls back without leaving partially created child tasks.

`verify` requires the original claimed Git base to remain an ancestor of
HEAD and verifies that HEAD and the working tree remain stable throughout the
acceptance-record validation. Changing code during checks rejects verification.

The optional standalone MCP server exposes one command per project task action.
Agents must explicitly register it; installing the main package does **not**
silently enable project management.

## Parent-child spec integration

An existing spec-manifest.json created by start_feature can be imported with
the import-spec operation. Subspecs become **draft** tasks, retaining their
dependsOn edges, Plan ID and Spec ID. A parent-child relationship is not a
precedence dependency. Parent verification is blocked until all children
are verified. Imported tasks require approval before execution.

Feature planning, plan_heartbeat, resume_plan and converge remain in their
existing modules. DevControl alone owns project task approval and status.

## Neyna trial and migration

At first use, new dc_* SQLite tables are created in the existing Neyna local
database. Legacy task_state/lease/audit/gate_evidence tables are preserved.
The old Git JSON plan is imported once as historical task definitions, with
actual SQLite task statuses preserved where available.

Migration is non-destructive but the Python and Node managers must **not**
both be used to mutate live task assignments. First compare imported tasks,
then explicitly switch the client/Hook/Agent entrypoints with a rollback plan.

An approvedBy string is an auditable local identity claim, **not strong human
authentication**. Hooks are bypassable, local SQLite is writable by its owner.
Production enforcement requires a protected remote branch and independent CI.

This experimental code should not be published into the main stable version
without real Neyna F1/F2 usage evidence and a release review.
