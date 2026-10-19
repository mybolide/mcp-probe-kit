# DevControl V0.4 — optional project task ledger and Kanban board

DevControl is a Jira-style **project task registry**, distinct from MCP protocol
Tasks (short-lived tool executions) and Delegated Plans (feature workflow steps).
It is developed as an opt-in experiment and does not alter the main MCP toolset.

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
- MCP: mcp-probe-kit devcontrol serve --project-root /path/to/project

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
