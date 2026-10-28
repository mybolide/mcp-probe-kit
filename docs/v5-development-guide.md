# MCP Probe Kit 5.0.0 开发版使用指南 / Development guide

> **版本状态 / Release status:** 本仓库的 `feature/devcontrol-project-task-ledger` 分支是 **5.0.0 源码开发里程碑**，**尚未发布到 npm、MCP Registry，也不是 `latest`**。公开稳定版的安装文档仍适用于 **4.1.1**。不要运行 `npx mcp-probe-kit@5.0.0`，除非未来实际发布后重新验证。
>
> **English:** This branch contains the unpublished **5.0.0 source milestone**. npm `latest` still refers to the separately released stable line. Build and use this branch locally; do not assume `mcp-probe-kit@5.0.0` is available on npm.

## 1. 安装：先区分两条渠道 / Pick the right channel

**稳定版 / Published stable (4.1.1):**

```bash
npx -y mcp-probe-kit@4.1.1 install-agent
```

**开发版 / 5.0.0 source only:**

```bash
git clone --branch feature/devcontrol-project-task-ledger https://github.com/mybolide/mcp-probe-kit.git
cd mcp-probe-kit
npm ci
npm run build
node build/index.js --version
```

Use **Node.js 22+ for DevControl and the SQLite-backed default History Session**. The older non-DevControl MCP tools still support Node.js 20+. Build in the source checkout; do not redirect `npm` to an unpublished version or install the source globally. `npm run build` also invokes the project's prebuild checks.

To launch this source build as an MCP server, configure your host's MCP server entry with `command: "node"` and `args: ["/ABSOLUTE/PATH/mcp-probe-kit/build/index.js"]`, and restart the host. **Replace the absolute path**; relative paths depend on the host's current working directory. For a normal published stable installation, continue using `npx -y mcp-probe-kit@4.1.1`.

## 2. DevControl 管理什么 / What DevControl governs

DevControl is the **project-local task ledger and Web workbench**, **not the agent that writes code, executes business SQL, or judges its own review**. The coding Agent remains responsible for implementation, independent review, running real tests, and reporting actual evidence. DevControl enforces the approved task contract, lease, file scope, dependencies, and registered gates.

On a **Git project with Node.js 22+**, the MCP server automatically starts or reuses a **read-only project workbench** (normally from port `38180`, scanning forward for occupied ports). It stores project task state in **that project's SQLite**, not in a shared server or ad-hoc task-progress Markdown files. To inspect the address or stop the automatic startup:

```bash
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol workspace-status --project-root /PATH/TO/PROJECT
```

`MCP_DEVCONTROL_AUTOSTART=0` disables automatic workbench startup. The workbench does not authorize changing other projects or databases.

### Approved development cycle / 任务生命周期

Run these **from the project directory** when using the `probe` launcher installed for that project; otherwise use `node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js` in place of `probe`. In this guide, `probe` is only a placeholder for that configured launcher, **not a command guaranteed to be on your PATH**.

```bash
probe devcontrol onboard --project-root .
probe devcontrol next --project-root .
probe devcontrol list --project-root .
probe devcontrol workspace-status --project-root .
```

1. **Plan and review:** review the requirement/design and propose tasks; a proposed task is **not** an approved executable task. `devcontrol plan-review` → `plan-propose` → **explicit Owner review and `plan-approve`** freezes its requirements, permitted paths, dependencies, and real acceptance gates.
2. **Claim:** `devcontrol claim --project-root . --json '{"id":"TASK-ID","agent":"agent-id","ttlSeconds":3600}'`. Do not reuse an expired lease or work outside the approved paths.
3. **Implement and independently review:** the Agent edits code, runs actual tests and checks the diff; the ledger does **not** execute SQL, deploy migrations, replace the reviewer, or make unreviewed changes safe. Preserve pre-existing user edits.
4. **Commit and report:** stage **only the allowed files**, commit without bypassing hooks, then call `devcontrol complete` with the task ID, lease token, `summary`, `implementation`, `verification` and `remaining`. Use `devcontrol report` for evidence and review status. A local Agent label is not an authenticated Owner approval.
5. **Verify:** `devcontrol verify --project-root . --json '{"id":"TASK-ID","leaseToken":"..."}'` reruns the configured Gate. Only **passed real gates** can mark the task Verified. Do not invent test results or count in-progress work as verified.

The exact JSON schemas and the full planner/migration rules are in [DevControl reference](devcontrol.md). `devcontrol renew` extends a live lease; `release` relinquishes one. **Changes to frozen scope need their own reviewed amendment**; a user's intention to commit does not silently override the Git Hook.

### Real acceptance / 门禁真实性

The required Gate depends on the task: for example `flutter_test` runs the **real Flutter SDK**, `go_http_integration` runs **real Core HTTP integration tests**, and a platform/device Gate needs its own actual runner. A mock command or an unrelated unit test is not interchangeable with the required Gate. For Flutter installed outside `PATH`, set `FLUTTER_ROOT` or an absolute `FLUTTER_BIN`; never substitute a fake Flutter executable.

## 3. History Session、项目文档和 Memory 不是同一个存储

- **History Session** (`history_session_bootstrap`, `checkpoint`, `search`, `read`, `validate`) tracks exact user inputs and project-chat continuity. With the supported Node.js 22+ Git-project default, the project-local **SQLite `hs_*` tables** are authoritative. Historical `docs/history-session/N.md` files can be imported without deletion. With Node.js 20, a nonstandard history directory, or `MCP_HISTORY_STORAGE=files`, it uses the earlier Markdown backend. A returned archive path may be a **virtual locator**.
- **DevControl task ledger** is separate project-local SQLite data for planned, approved, in-progress, reviewed, and verified work, plus completion notes. Do not manufacture task-progress Markdown reports.
- **Memory tools** (`search_memory`, `memorize_asset` etc.) are **optional cross-project Qdrant/vector-memory functionality**. Neither History nor DevControl requires configuring Qdrant. Don't expose passwords or sensitive records in history, Git, output or logs.

**Agent handoff:** call `history_session_bootstrap` at the beginning of a new conversation, carry its returned `session_key` and `expected_path`, and checkpoint the user's original input, actual changes, tests, decisions, blockers, and next steps. Query older history only as needed.

## 4. 升级现有项目 / Migrating a pre-5 project

1. Back up the project's ignored `.mcp-probe-kit/` and `.neyna/` state, existing agent rules, and any old History files; identify unrelated changes with `git status`. **Do not reset or overwrite the owner's dirty files.**
2. Build 5.0.0 in an **isolated source checkout**, then point your MCP host to that built absolute path. Keep your old stable MCP configuration as a rollback option.
3. Confirm `devcontrol onboard`, `next`, `workspace-status` and History retrieval against **the intended Git project root**, not the MCP source repository. Importing an old ledger does not make draft tasks automatically approved.
4. Review and explicitly approve any new frozen task plan. Re-run actual acceptance gates and preserve the commit/verification audit trail; **do not** treat `next` or a Web card as permission to edit arbitrary files.
5. Switch back to the last known-good host command if the source build fails; **do not deploy production schema, publish an npm package, push a Git Tag, or release** as a side effect of this development migration.

More details: [DevControl reference](devcontrol.md), [v3 → v4 published-stable migration](migration-v3-to-v4.md), [Changelog](../CHANGELOG.md), and [source branch](https://github.com/mybolide/mcp-probe-kit/tree/feature/devcontrol-project-task-ledger).

---

## English quick reference

**Published stable:** `npx -y mcp-probe-kit@4.1.1`. **Unpublished 5.0.0:** clone `feature/devcontrol-project-task-ledger`, run `npm ci && npm run build`, point the MCP host to the absolute `build/index.js` path, and use Node.js 22+ for DevControl.

The **Agent** codes, independently reviews and runs real tests. **DevControl** plans, scopes, leases, audits and verifies real gates. **History Session** is project-local conversation continuity (SQLite by default on supported Git/Node22 projects; Markdown fallback); **Memory** is optional Qdrant. Do not confuse these data stores, bypass Git Hooks, claim unapproved tasks, or equate pushing a source branch with publishing a version.
