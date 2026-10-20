# DevControl V0.6 candidate — per-project SQLite, native Feature and History Session

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

## macOS and Windows distribution

The same local workbench has a macOS Finder `.app` entry and Windows
`.cmd` double-click entry. `desktop-install` creates the host-appropriate
launcher. `desktop-open` reuses the same project-specific loopback server,
without a shared global SQLite instance.

The separate CI workflow `.github/workflows/devcontrol-desktop.yml` builds
and tests on actual `macos-latest` and `windows-latest` runners, then produces
bundles with a bundled official Node22 runtime. The packaging script rejects
Homebrew's 84 KiB dynamically linked Node shim rather than advertising an
unusable "standalone Mac build". Windows release compatibility is **pending a
successful Windows CI run**; writing a Windows launcher is not proof of
Windows runtime verification. These are bundled-runtime distributions, not
single native `.exe` builds.

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
- Board: mcp-probe-kit devcontrol board --project-root /path/to/project --port 4765
- macOS one-time launcher install: mcp-probe-kit devcontrol desktop-install --project-root /path/to/project
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

## No repeated command on macOS

Run **once during project installation** (the Agent can do this for the user):

```sh
mcp-probe-kit devcontrol desktop-install --project-root /path/to/project
```

This creates a visible local `<Project> Workbench.app` in the project root.
From then on, double-click it in Finder or drag it to the Dock. The app:

- locates the Git project relative to itself,
- uses the installed (not auto-downloaded) mcp-probe-kit CLI with Node 22,
- reuses an existing workbench for that **same** project if one is running,
- otherwise launches the loopback-only server on an available localhost port,
- opens the system default browser, with no Terminal window.

It does **not** register launchd at login, install a system daemon, expose
an HTTP listener to the LAN or start a background cloud service. The lightweight
Node HTTP process remains available for subsequent clicks until the user logs
out or terminates it. Each project gets its own local launcher. Finder bundles
are generated locally and ignored in the developer's Git exclude file; they
are not source artifacts. The launcher is currently macOS-only. Other clients
can still use CLI/MCP, and MCP Apps can later reuse the same presentation data.

For CLI-based troubleshooting the `desktop-open --no-browser` operation
returns the local URL without opening a browser.

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

`devcontrol board --project-root /repo --port 4765` starts a local web viewer:
**http://127.0.0.1:4765/**. It shows three columns — 待开发 / 进行中 /
已完成 — using the real `dc_tasks` status, with text search, release filter,
progress counters, dependencies, parent/child links and completion details.

The server only binds to `127.0.0.1`, rejects unexpected Host headers, uses
strict Content Security Policy and provides GET-only read endpoints
`/api/board` and `/api/tasks/:id`. No API writes, login, external CSS/JS,
framework, database server, or independent Kanban status table are introduced.
Do not expose this prototype externally or use it to display sensitive notes
on a shared machine.

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
