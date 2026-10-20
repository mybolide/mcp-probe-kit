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
**Project Workspace** with six navigation areas:

1. **项目总览** — mission, current eligible work package, actual task counts, onboarding links and verified delivery loop.
2. **产品与目标** — product vision, version roadmap and phase OKRs.
3. **需求管理** — PRD FR/NFR identifiers, priorities, acceptance criteria and related feature Specs.
4. **技术架构** — architecture introduction, real fenced diagrams from source documents, ownership and ADR links.
5. **任务与进度** — the *existing* SQLite-backed three-column Kanban view, embedded as a same-origin view; standalone `/board` still works.
6. **文档中心** — canonical Git documentation index, text search and a read-only viewer.

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

## Read-only board (no UI framework)

`devcontrol workspace-status --project-root /repo` resolves the automatically
started Web viewer, normally **http://127.0.0.1:38180/** on the development
computer. It shows three columns — 待开发 / 进行中 /
已完成 — using the real `dc_tasks` status, with text search, release filter,
progress counters, dependencies, parent/child links and completion details.

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
