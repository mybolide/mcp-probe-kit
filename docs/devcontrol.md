# DevControl V0.2 — optional project task ledger

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
- CLI: mcp-probe-kit devcontrol verify --project-root /path --json '{...}'
- CLI: mcp-probe-kit devcontrol trace --project-root /path --json '{...}'
- MCP: mcp-probe-kit devcontrol serve --project-root /path/to/project

Project tasks are proposed as drafts, approved, claimed, developed, reported for
review, verified by runnable gates, and audited. Fields include stable task ID,
parent ID, dependencies, priority, release, file scope, acceptance gates and
optional links to existing mcp-probe-kit Plan/Spec IDs.

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
