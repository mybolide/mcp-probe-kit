# MCP Probe Kit 5.0.0 开发版使用指南 / Development guide

> **2026-10-28 重大变更**：v5 的研发管理唯一机制是 **SQLite + DevControl**，
> 不再支持 v4 文件式 Spec / Delegated Plan / Markdown History。本文旧章节中
> “保留 v4 工作流”的说明已被此破坏性架构决定取代。请优先使用
> [v5 SQLite-only 实际行为、迁移及验收状态](v5-sqlite-only.md)。
> 旧数据迁移和全量回归尚未完成，不能将当前开发分支视为可发布版本。

> **版本状态 / Release status:** 本仓库的 `feature/devcontrol-project-task-ledger` 分支是 **5.0.0 源码开发里程碑**，**尚未发布到 npm、MCP Registry，也不是 `latest`**。公开稳定版的安装文档仍适用于 **4.1.1**。不要运行 `npx mcp-probe-kit@5.0.0`，除非未来实际发布后重新验证。
>
> **English:** This branch contains the unpublished **5.0.0 source milestone**. npm `latest` still refers to the separately released stable line. Build and use this branch locally; do not assume `mcp-probe-kit@5.0.0` is available on npm.

> **从长期项目研发中整理的落地流程：** [《MCP Probe Kit v5 最佳实践》](v5-best-practices.md)——从跨会话恢复、完整 Spec、独立复审和冻结审批，到单任务真实 Gate、范围变更、批量开发及安全交接。本文侧重版本安装和 CLI 接口；最佳实践侧重日常如何正确使用。

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

## 5. v4 与 v5 到底有什么不同 / What actually changed

v4's published toolkit focuses on **Agent-level document-backed workflows**: `start_feature`, `start_bugfix`, `plan_heartbeat`, `resume_plan`, `converge` and file-backed specs. **v5 deliberately removes these workflow interfaces** and makes SQLite DevControl the sole development process authority. Independent source inspection, testing, Git/UI helpers and optional Qdrant Memory remain as stateless supporting capabilities; legacy Plan-backed Apps are historical, not v5 workflow APIs.

| Feature / 新能力 | How it works / 实现与使用 |
|---|---|
| Project-local task registry | Each Git project's SQLite `dc_*` tables own approved tasks, dependencies, current leases, completion reports, reviews and audit history |
| Release-wide planning | `plan-review` / `plan-propose` / `plan-revise` validate and version drafts; `plan-approve` freezes reviewed content by hash before creating executable tasks |
| Detailed task contracts | Spec-depth task leaves record source requirements, design, success/failure scenarios, permitted paths, real gates; new-project v3 contracts add explicit inputs, outputs, preconditions, transitions and stop conditions |
| Feature and Bug management | `start_feature` can persist proposal sections, related plans and revisions in project SQLite; `feature-save`, `feature-validate`, `feature-export`, Bug records and task links retain context |
| Ideas and decisions | `idea-capture` / `idea-assess` / `idea-review` / `idea-decide` separate a new thought from permission to change the plan; leased decision tasks use `decision-save` / `decision-get` |
| Controlled amendments | `release-work-scope-*` and `release-work-incremental-*` require proposal review, independent review and exact Owner-approved hashes; don't overwrite frozen work |
| Frozen architecture assets | `artifact-stage` / `artifact-independent-review` / `artifact-approve` / `artifact-check` protect approved versioned schemas, API contracts and security designs |
| Real acceptance and Git safety | `check`, `complete`, `report`, `verify` validate scoped, committed work with required real runners; existing dirty files and interrupted leases are preserved |
| Eight-area project workbench | Read-only project overview, product & goals, requirements, architecture, task progress, Bugs/change requests, History Session and document index; the workbench reads Git documents, not invented project metadata |
| SQLite History Session | Git/Node22+ defaults to separate `hs_*` records in the same project-local DB, including bounded `bootstrap`, idempotent `checkpoint`, `search`, `read`, `validate` |
| Recovery and setup | Automatic local workbench startup, persisted port ownership, optional trusted-LAN read access, stable task-lease recovery, generated Skill/`AGENTS.md` and local-only runtime/version checks |

**Only capabilities proven by this source branch are listed.** Windows/platform CI, protected remote identity, full device E2E, production deployment and a published npm v5 release are not implied.

## 6. 任务的实际使用步骤 / A usable project-task walkthrough

The project-root parameter below is your **application repository**, never a replacement for the MCP server checkout. Run from that project's directory and use the built absolute path when `probe` is not installed. The CLI supports both `--json` for small inputs and `--input path/to/reviewed-payload.json` for complex approved plans. The examples show the operation shape, **not a pre-approved task or plan**.

```bash
# Read the existing project without creating a fake task plan.
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol onboard --project-root /PATH/TO/PROJECT
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol next --project-root /PATH/TO/PROJECT
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol list --project-root /PATH/TO/PROJECT

# After a real review, prepare a complete release plan as JSON and check it first.
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol plan-review --project-root /PATH/TO/PROJECT --input /PATH/TO/REVIEWED_PLAN_INPUT.json
# Then plan-propose (draft only). plan-approve additionally needs the exact
# reviewed proposal hash and explicit Owner authorization, never a guessed hash.

# For an already eligible, approved task:
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol execution-contract --project-root /PATH/TO/PROJECT --json '{"id":"APPROVED-TASK-ID"}'
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol claim --project-root /PATH/TO/PROJECT --json '{"id":"APPROVED-TASK-ID","agent":"developer-id","ttlSeconds":3600}'

# Keep the returned leaseToken private. Run actual tests and a legitimate Git commit.
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol renew --project-root /PATH/TO/PROJECT --json '{"id":"APPROVED-TASK-ID","leaseToken":"RETURNED-TOKEN","ttlSeconds":3600}'
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol check --project-root /PATH/TO/PROJECT
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol complete --project-root /PATH/TO/PROJECT --json '{"id":"APPROVED-TASK-ID","leaseToken":"RETURNED-TOKEN","summary":"Observed result","implementation":"Committed changes","verification":"Tests actually executed and results","remaining":"Known limitations"}'
node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js devcontrol verify --project-root /PATH/TO/PROJECT --json '{"id":"APPROVED-TASK-ID","leaseToken":"RETURNED-TOKEN"}'
```

`report` stores additional independent review and evidence details as defined in the project task contract. Review their actual schema before submitting; **do not invent evidence**. `verify` may fail because a required runner is unavailable, the Git revision drifted, an approved path was exceeded, or a dependent task is incomplete. Investigate the real cause instead of relaxing the gate.

### Planning, Feature, Bug, Idea and architecture records

- **Plan and task status are separate.** `plan-review` checks a candidate; `plan-propose` stores a pending versioned draft; `plan-approve` creates eligible tasks only after a reviewed hash and Owner decision. A proposed item must not be shown as Verified. `plan-revise` takes the previous draft's exact hash and retains its revision history. Existing frozen releases also support the specifically reviewed `release-work-*` workflows.
- **Features live in SQLite when supported.** `feature-save`, `feature-validate`, `feature-task-review` / `feature-task-propose` / `feature-task-approve` maintain substantive requirements, design sections, child work and revisions. `feature-export` generates Markdown/JSON only when requested. `storage_mode=files` opts into legacy feature documentation. Do not confuse a delegated Plan step with an approved DevControl work item.
- **Bugs and architecture changes are visible work items.** `bug-get`, `bug-step-save`, `bug-task-link`, `work-record`, and `architecture-sync` relate investigations to existing project requirements without silently granting scope.
- **Ideas need a decision, not immediate implementation.** `idea-capture` stores the actual source request; `idea-assess` considers impact, alternatives and a suitable phase; `idea-review` records independent scrutiny; `idea-decide` requires explicit authorization and the reviewed revision. A useful idea may fit an already approved task, require a later incremental plan, or be rejected.
- **Frozen changes require review.** `release-work-scope-review` / `release-work-scope-stage` / `release-work-scope-independent-review` / `release-work-scope-approve` enforce scoped changes with both proposal and review hashes. The incremental equivalents `release-work-incremental-review` / `release-work-incremental-stage` / `release-work-incremental-independent-review` / `release-work-incremental-approve` control new work after freeze. Pausing an active task preserves its lease provenance and existing user modifications; no direct SQLite status edits or Hook bypass.
- **Architecture contracts use their own gate.** `artifact-stage` proposes the exact versioned file contents, `artifact-independent-review` checks the proposal, `artifact-approve` requires an explicit Owner decision, and `artifact-check` catches unauthorized hash drift. A newly drafted architecture document is not already an approved baseline.
- **Pure decision tasks may have no source commit.** A specially approved `sqlite_decision` task writes a versioned `decision-save` record and goes through `complete`, `report`, `verify`. Do not create unnecessary decision Markdown solely for task-progress reporting.

### Project workbench, safety and platform limits

The Web workbench reads actual Git/SQLite project data. On Node22+ Git projects it normally starts with the main MCP server on local port `38180`, reuses the same project's persisted port when safe, and avoids terminating unknown listeners. `devcontrol workspace-status` reports its address. `devcontrol lan-enable` and `lan-disable` control optional trusted-LAN viewing. The LAN mode is **unauthenticated HTTP** and should never be port-forwarded to the public Internet. Browser pages are read-only; approvals and writes run through the validated CLI/MCP operations.

The optional separate `devcontrol serve` MCP stdio interface is **not silently added to the main compact toolset**. The normal MCP model-visible surface remains 29 tools by default (24 base plus 5 History), 35 with Memory, and 39 in full compatibility mode. These counts do not include the dedicated DevControl operations as default model tools.

Node.js 20+ remains sufficient for the legacy/non-DevControl tools; DevControl and the SQLite History default need Node.js 22+ with the built-in SQLite module. Local Git Hook checks and owner labels are not a security boundary stronger than the current machine. Physical-device, real HTTP integration and complete release E2E gates must use genuine test runners; unavailable gates must remain Not Run or failed, not silently passed.

### Safe upgrade and verification checklist

1. Record the target project's current Git status, installed package version, active leases and existing history; back up ignored project-local SQLite and any legacy Markdown archives without copying secrets into Git.
2. Compile the **unpublished** v5 source in an isolated checkout and point the MCP host to its own `build/index.js`. Ensure the managed Skill, `AGENTS.md`, local launcher and package version are consistent.
3. Confirm `onboard`, `workspace-status`, `next`, an existing task's `execution-contract`, and `history_session_bootstrap` / `search` / `read` / `checkpoint` / `validate` in the **intended application project**. Old file history may be imported while the original files remain untouched.
4. Independently review a real plan or work-item amendment. Inspect the actual frozen paths, dependency states, approved hashes and required tests before claiming anything.
5. Run the applicable source tests, documentation checks and real project acceptance gates. `npm run docs:verify` checks documentation consistency; `npm run build` produces the local runtime. Neither is proof of full product E2E or a publication.
6. If migration fails, restore the previous MCP host command and local backup without deleting the user's files or rewriting verified task history. **No npm publishing, Registry registration, Git Tag or Release** is permitted just because the checkout says 5.0.0.

## 7. 中文实践说明：怎样真正使用 v5

**v5 的核心变化是直接用 SQLite + DevControl 统一跨会话、跨任务研发管理。** v4 的 `start_feature`、`resume_plan`、Delegated Plan 和 Markdown Spec 不再提供对外工作流，旧版 MCP Apps 中基于这些状态的视图尚待迁移。独立代码/测试/Git 工具与可选 Memory 仍可作为辅助能力，但不能替代 DevControl 或独立编程 Agent。

### 新项目或旧项目如何开始

项目是 Git 仓库并且运行 Node.js 22+ 时，首先用 `devcontrol onboard` 和 `workspace-status` 检查真实文件及现有 SQLite 任务。已有需求和任务不会因为重新运行 onboard 而复制。空白项目不会被自动编出需求、设计或计划。

Agent 需要阅读真实需求、架构及现有验证结果，自主制定整版任务计划。完整计划应包含需求来源、业务触发条件、成功与失败场景、依赖、交付文件和真实验收门禁。使用 `plan-review` 做结构检查，再以 `plan-propose` 留下待审草稿。**草稿不会产生可执行任务。** 独立审查之后，必须由 Owner 根据精确计划哈希批准 `plan-approve` 才能冻结。新项目的详细执行合同还规定输入、输出、前置条件、状态变更、禁止修改的内容和停止条件。

### 从任务领取到通过验收

1. 先用 `next` 查看有依赖约束的可执行任务，或恢复仍在租约中的任务；用 `execution-contract` 阅读实际冻结的文件范围、要求与 Gate。
2. 用 `claim` 领取一项已批准任务，持有返回的 `leaseToken`；任务过长时用 `renew`，不要丢弃正在进行的 Git 改动另起任务。
3. Agent 负责真正写代码、修改架构内允许的文件、独立复核风险并运行真实测试。必要时先运行 `check`，正常 Git Hook 不能通过时，应解决原因，而不是跳过。
4. 只提交本任务获准的文件。`complete` 保存实际的实现与测试结果，`report` 记录额外审核证据，然后用 `verify` 再运行规定的 Gate。即使 Git 已提交，只要 Gate 未通过或证据不足，任务仍不是 Verified。
5. 如果需要修改冻结范围，应先提出并独立复审 `release-work-scope-*` 变更。新增整版工作通过 `release-work-incremental-*` 评审。Owner 的授权必须与具体提案及审核哈希对应。

### 需求想法、Bug 和架构不是随意插队

- **新想法**：`idea-capture` 记录原始来源，`idea-assess` 判断价值、风险与合适开发阶段，`idea-review` 独立复审，`idea-decide` 记录明确决定。如果与当前已领取任务合同一致，可以纳入该任务；涉及新增任务或范围变化的，需要走正式审批；不合理则拒绝。
- **Feature**：在支持的项目中，`feature-save`、`feature-validate` 保存版本化需求和设计，再通过 `feature-task-review`、`feature-task-propose`、`feature-task-approve` 审核子任务。`feature-export` 可按需导出 Markdown/JSON，不再要求为每个中间状态创建过程文件。
- **Bug**：`bug-get` 读取问题记录，`bug-step-save` 保存排查步骤与证据，`bug-task-link` 将已确认问题关联正式任务，避免把未审批 Bug 误当成允许修改的范围。
- **架构设计**：已经正式批准的 Schema、API 契约和安全设计用 `artifact-stage`、`artifact-independent-review`、`artifact-approve` 管理版本和哈希，`artifact-check` 检查是否偏离受控文件。不能为了临时通过测试擅自改掉正式架构。
- **纯决策工作**：正式批准的 `sqlite_decision` 任务可以用 `decision-save` 留下有版本的决策与理由，并继续走 `complete/report/verify`。这类任务不必为了形式生成 Git 提交或新的 Markdown。

### 哪些数据存在哪里

| 数据 | 权威位置 | 不应混用 |
|---|---|---|
| 任务、整版规划、审批、租约、测试证据 | 当前 Git 项目的 SQLite `dc_*` | 不是业务应用数据库，也不是随手创建的每日进度 Markdown |
| 原始会话、历史检查点、跨窗口恢复 | Node.js 22+ Git 项目默认 SQLite `hs_*` | 旧 `docs/history-session/N.md` 留作迁移或显式文件模式 |
| 可跨项目复用的经验 Memory | 可选 Qdrant 服务 | 不能代替当前项目 History 或 DevControl 的任务状态 |
| 正式需求、产品架构、API 与版本文档 | Git 中经过批准的规范文档 | 不能因为 SQLite 有任务就省略必要的架构文档 |

### 版本、安全和验收边界

v5 的 DevControl 是本地项目管理机制，不是强身份认证系统。其 Web 页面只读，可信局域网模式没有密码，不能向公网开放。Git Hook 可以在本机被绕过，真正需要独立信任保证时仍应依赖受保护的远端分支和 CI。Node.js 20 可继续运行不依赖 DevControl 的老功能，但不能当作 Node.js 22 的项目 SQLite 特性已经具备。

真实 Flutter、Go HTTP、iPhone 真机和整版端到端验证不可互相替代。尚无真实运行器的 Gate 应保持失败或未运行状态。5.0.0 只能通过当前开发分支本地构建使用，**不能声称已有公开 npm 5.0.0，更不能自行创建 Tag、发布包或生产部署**。

---

## English quick reference

**Published stable:** `npx -y mcp-probe-kit@4.1.1`. **Unpublished 5.0.0:** clone `feature/devcontrol-project-task-ledger`, run `npm ci && npm run build`, point the MCP host to the absolute `build/index.js` path, and use Node.js 22+ for DevControl.

The **Agent** codes, independently reviews and runs real tests. **DevControl** plans, scopes, leases, audits and verifies real gates. **History Session** is project-local conversation continuity (SQLite by default on supported Git/Node22 projects; Markdown fallback); **Memory** is optional Qdrant. Do not confuse these data stores, bypass Git Hooks, claim unapproved tasks, or equate pushing a source branch with publishing a version.
