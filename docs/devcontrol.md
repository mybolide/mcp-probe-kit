# DevControl V0.7 candidate — MCP-managed project Web workspace

DevControl is a Jira-style **project task registry**, distinct from MCP protocol
Tasks (short-lived tool executions) and Delegated Plans (feature workflow steps).
It is developed as an opt-in experiment and does not alter the main MCP toolset.

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
Markdown. If Node22 is unavailable, the directory is customized, or
`MCP_HISTORY_STORAGE=files`, the old Markdown backend remains available.

The `memorize_asset`/`search_memory` tools are a **different**, optional,
cross-project Qdrant vector-memory service. They are not modified, migrated,
queried by the project workspace, or silently written by the new SQLite
feature workflow.

## Native Feature, Bug and design records

On Node22+ Git projects, `start_feature` now defaults to storing the full
feature proposal, parent-child draft, delegated Plan and revision history in
the local `dc_features` tables, **without generating requirements.md,
design.md or tasks.md**. The plan first reviews History Session and existing
normative documents, then uses `devcontrol feature-save` and
`devcontrol feature-validate`. A proposal does not bypass task approval.
`storage_mode=files` explicitly opts into the original document workflow.
`feature-export` exposes Markdown or JSON on demand; the workspace includes
download actions for individual feature records.

`start_bugfix` can register a deduplicated project-local issue, preserving
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

Product-specific acceptance gates are deliberately distinct from the initial
document and schema-contract checks. `go_http_integration` requires actual
Core HTTP integration tests, `flutter_test` requires a real Flutter test
suite, and `ios_device_e2e` / `v01_release_e2e` currently **fail closed**
until a genuine physical-device and complete product-flow evidence runner is
defined. They are valid pending plan-gate IDs, not a claim that platform
testing or release verification already exists. A passed `go_contract`
fixture cannot satisfy `go_http_integration`.

## Work item visibility and substantive task quality

### Shared operating policy: planning freedom, frozen execution

This contract is **project-independent**; no example project, release number,
implementation language, filename layout or particular reviewer is implicitly
part of the rules. The three UI tabs are a projection of real state, not three
separate tables.

**Discovery / product design / assignment** is the only stage in which
alternative solutions, task decomposition and dependency changes may be
proposed. Each proposed leaf must reference the authoritative requirement
and design, describe the external trigger, the exact workflow and domain
constraints, positive and failure cases, allowed file scope, required tests,
deliverables and concrete completion evidence. Open decisions remain
visible, not silently answered by an implementing Agent.

**Review / freeze** accepts an exact plan-content hash and preserves the
previous draft in project-local SQLite. Approved content cannot be replaced
by free-form later chat or a new Agent session. An accountable task owner is
assigned *explicitly*, separately from the execution agent, using a reviewer
name and decision reference. `git-contributors` returns history-derived
**suggestions only**: a Git author, committer or current Git configuration
never automatically becomes a responsible owner.

**Execution** is constrained: `next` and `claim` inspect the frozen leaf
contract. For a new `spec-depth-v2` release, missing task ownership, an
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

The code enforces scope hashes, dependency blocks, single active worktree
lease, the reviewed task scope, owner presence on frozen Spec-depth tasks,
explicit recorded ownership decisions and configured quality-gate results.
However, the current CLI/MCP transports accept a *caller-supplied*
`assignedBy`/`approvedBy` string: this is audit metadata, **not proof of
an authenticated human reviewer**. A full multi-user product still needs
identity-backed roles and reviewer authentication, plus a required CI
pipeline / Git hooks or branch protection; otherwise an Agent that bypasses
MCP and commits directly can evade the pre-commit check. This must not be
represented as a completed mandatory approval barrier.

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

Network mode is **explicitly project-scoped**. To let a central computer
view the project, enable LAN once using `devcontrol lan-enable --project-root .`;
disable with `lan-disable`. The configuration is in the project's
Git-ignored SQLite state directory. In LAN mode, DevControl accepts only
private IPv4 sources (RFC1918) and Host headers belonging to this computer.
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

The `import-spec` operation uses stable manifest subspec IDs rather than array
positions, and its full task/dependency import is **transactional**. Reordering
subspec entries cannot silently rename existing project tasks. A conflicting
import rolls back without leaving partially created child tasks.

`verify` requires the original claimed Git base to remain an ancestor of
HEAD and verifies that HEAD and the working tree remain stable throughout the
actual gate execution. Changing code during checks rejects verification.

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
