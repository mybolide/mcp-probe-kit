# devflow 契约 — v8.8（r2wt 顺序、指纹形参、waive 一次性、Task-Id 全局唯一）

> 取代 01 的结论与 02 的实现方案。实测依据：macOS APFS、git 2.50.1、Node v24.18.0、`node:sqlite` 免 flag、2 进程 × 20 轮 CAS 全绿。

## 0. 目标与非目标

**目标**：本地单库，把需求、bug、任务与进度、文档集中给 Owner 在控制台看；给任意编码 Agent 7 个动作、3 个拦截点，让它在既定 Path 内改、按需求验收、自己证明做完；多 Agent 并行互不踩。
文档只做"挂到需求上的链接与快照"，不做文档系统。

**非目标**：模型驱动编排、审批链、租约与恢复、跨机器同步、内建 agent 运行时、CLI 上的 Owner 动作、仪表盘。

## 1. 三条铁律

1. 门禁结论只来自 **git 事实或内核重跑**。
2. hook 只是快速反馈：close 从 `base_head..HEAD` **重算**全部规则。
3. 验收来自需求：任务 acceptance 必须 `derive_from` 需求条目；命令只能**选自** Path 已冻结的 `test_cmds`。

## 2. 两个通道

| 通道 | 谁 | 能力 |
|---|---|---|
| Agent 面 | 任意编码 Agent | `bootstrap` `task.create` `task.claim` `task.renew` `task.close` `bug.report` `ask`（MCP stdio） |
| Owner 面 | 你 | `req.intake` `req.approve` `req.amend` `answer` `handoff` `task.adjust` `task.reopen` `bug.decide` `override`（**仅控制台**） |

`handoff` = 控制台为一任务生成"交接卡"文本（一键复制，粘到任意客户端）。**不内建 agent 运行时**，但派活成本为零。

## 3. 对象

```jsonc
Requirement { id:"FR-001", title, goal, acceptance[], status, created_at, approved_at, archived_at? }
Path { id:"P-001", requirement_id?, allowed_paths[] /*字面前缀*/,
       allow_new_files, budget_lines /*1200*/,
       test_cmds[] /*approve 时冻结*/,
       status /*draft|approved*/,
       hash /*= sha256(契约文件 .mcp-probe-kit/contracts/<id>.json 的完整内容)*/,
       approved_at }
Task { id:"T-001", requirement_id, path_id, kind, title, status, scope[],
       acceptance[] /*{derive_from,assertion}*/, depends_on[], budget_lines /*400*/,
       base_head, contract_hash, contract_commit /*批准或 amend 的提交*/, claimed_by?, claimed_at?, claim_expires_at?, review_round,
// contract_commit = 最近一次写入契约的提交（approve 或 amend 均会前移）
       closed_by, created_at, updated_at, archived_at? }
Bug { id:"B-001", requirement_id?, title, symptom, expected, repro[], attachments[],
      status /*new|fixing|verifying|closed*/, severity /*P0..P3*/, task_id?, source, created_at, closed_by? }
Doc { id:"D-001", requirement_id?, path, sha256, title, kind, registered_at }
```

**ID**：`<PREFIX>-<数字>`，前缀 `FR/P/T/B/D/Q`，序号在 **intake（建行）事务内**分配，`meta.counter:<PREFIX>` 单调、删除不回收；超 99999 → `E_ID_EXHAUSTED`。

**状态机**（完整见附录 C）：非法迁移 → `E_ILLEGAL_TRANSITION{from,to,allowed}`。

## 4. 流水线（7 段）

| # | 阶段 | 谁 | 门 |
|---|---|---|---|
| 1 | 提需求 / 提 bug / 登记文档 | Owner 或 Agent（`bug.report`） | 断言/复现必填 |
| 2 | 一键批准（需求 + Path） | Owner | 需回输 acceptance 哈希前 8 位（防橡皮图章） |
| 3 | 拆任务 | Agent | 合同完整、验收有血缘、`depends_on` 无环、命令取自 Path |
| 4 | claim / renew | Agent | **拦截点 1** |
| 5 | commit | Agent | **拦截点 2**（快速反馈） |
| 6 | close | Agent | **拦截点 3**（重算 + 重跑） |
| 7 | 看进度 / 看文档 / 打回 / 答问 / 交接 | Owner | — |

## 5. 规则

### 5.1 claim（读检查 + CAS）

| 码 | 条件 |
|---|---|
| `E_NEED_APPROVED` | 需求或 Path 未 approved |
| `E_CONTRACT` | 缺 acceptance/scope；`scope` 不是 `path.allowed_paths` 的前缀扩展；验收无 `derive_from`；命令不在契约；bugfix 无复现证据 |
| `E_CLAIMED_BY_OTHER` / `E_CLAIM_STALE` | holder 未过期 / 已过期可接管（自己持有的过期任务 → 续期接管，返回 ok） |
| `E_NO_CONTRACT` | `paths.contract_commit` 缺失，或该提交里没有 `.mcp-probe-kit/contracts/<pathId>.json`（批准未提交/被删）；`fix.action=re-approve`（Owner 重新批准即重建该提交） |
| `E_DEP_OPEN` | `depends_on` 有未 done |
| `E_SCOPE_OVERLAP` | 与 doing 任务的 scope 相交（**按路径段比较**，见 §6） |
| `E_WIP_LIMIT` | 该 Agent 已有未关闭任务 |
- **claim 时校验并冻结合同**：`sha256(<paths.contract_commit>:.mcp-probe-kit/contracts/<pathId>.json)` 必须等于 `paths.hash`（不一致 → `E_CONTRACT{fix:ask-owner}`）。通过后写入 `task.contract_hash` 与 `task.contract_commit`；**契约一律从 `contract_commit` 读**。
- **`base_head` = `paths.contract_commit`**（交付区间从契约批准/最近一次 amend 起算，**不是** claim 时的 HEAD）：这样"先提交后 claim"的提交也落在 `base..HEAD` 内，逃不掉 R0/R1；amend 后随新契约提交前移。

- **TTL = 45 分钟**（自 `claimed_at` 起，系统时钟；写操作与 `task.renew` 续期）。时钟回拨 > 60s → 记 `CLOCK_SKEW` 事件并按 `claimed_at` 重算。
- 读检查（overlap/dep/WIP）与 CAS **必须放在同一个 `BEGIN IMMEDIATE` 事务里**：先在同一事务内读 doing 集合判相交，再写 claim，否则两个 Agent 可同时抢到 scope 相交的不同任务。`SQLITE_BUSY`（errcode 5）退避 50/200/800ms 重试 3 次。
- close 进行中（`closing_token` 非空）的任务不被惰性回收。`closing_at` 是 ISO 时间戳，TTL **60 分钟**（> claim 的 45 分钟，也 > 单命令 600s 上限）。**超时的清理动作**：下次任意写操作在同一事务里把该任务重置为 `backlog`（`claimed_by=NULL`、`closing_at=NULL`、`closing_token=NULL`、`claim_expires_at=NULL`），并记 `E_CLOSE_ABANDONED`；`doctor` 报 `STALE_CLOSING` 并可 `--fix`。close 成功或失败都按 token 清空这两个字段。
- 过期回收**惰性**：任意写操作时把 `claim_expires_at < now` 的 doing 任务转 backlog（记 `E_CLAIM_STALE`）。过期任务**必须重新 `task.claim` 接管后才能 close**（不设"过期仍可 close"的旁路）。

### 5.2 commit（快速反馈）

`E_SCOPE_VIOLATION` `E_UNREGISTERED_FILES` `E_DIFF_BUDGET` `E_LINT_TODO` `E_DEP_OR_TEST_TOUCH`（含 `package.json`、`package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`）`E_TEST_CONFIG_TOUCH`，写 trailer `Task-Id`、`Devflow-Base`。
**一个提交只允许一个 `Task-Id`**（对所有提交生效，不只 scope 内）；提交作者时间**不得晚于 `claim_expires_at`**（早于 `claimed_at` 不判违规——过期重领后旧提交仍属本任务）。

### 5.3 close（真正的门禁）

| 步 | 动作 |
|---|---|
| R0 解析 | 遍历 `base..HEAD` 按序判定：① **approve/amend 提交**（内核身份 + `chore(devflow): approve|amend` 前缀 + 只碰 `.mcp-probe-kit/contracts/**`）→ 跳过；② trailer `Task-Id` = 本任务 → **owned**；③ 不满足 ①/② 且**不满足 ④**，但 patch-id 命中**本任务**记录 → **owned**；④ 其他任务的 trailer 同时满足「任务存在 + 作者 == 该任务 `claimed_by` + 时间落在其 `claimed_at..closed_at 或 claim_expires_at` + 只碰其 scope」→ 承认他人工作（不计本任务预算）；⑤ 其余（含无 trailer、伪造/借用失效、混合提交）→ **`E_UNOWNED_COMMIT`**（unowned 判定先排除 owned）。owned 为空 → `E_NO_DELIVERY` |
| R1 重算 | 用归属提交的**逐提交差异**（`git diff -m --first-parent <sha>^..<sha>`，合并提交必用）重算：scope、行数（task + path 两层）、新增 TODO、测试触碰、**未注册新增文件**、**单提交单 `Task-Id`**、**作者时间不得晚于 claim 到期**（下界由 `base..HEAD` 保证）；归属为空 → `E_NO_DELIVERY`。未注册新增文件 = `--diff-filter=A` 中既未命中 `path.allow_new_files` 也未在 `task.scope` 中显式列出的路径 → `E_UNREGISTERED_FILES` |
| R2 重跑 | 在**临时干净检出**中逐条执行 acceptance 命令：`git worktree add --detach .mcp-probe-kit/r2-wt HEAD` → `git clean -xdf` → 按 lockfile 装依赖（`npm ci`/`pnpm i --frozen-lockfile`）→ 执行（附录 B 语义）→ 生成 run。命令来源见 §14。**执行期间不持任何写事务**；仅写 run 记录时开短事务。执行前校验：diff 触及测试配置（`vitest.config.*`/`jest.config.*`/`conftest.py`/`.npmrc`/`pnpm-workspace.yaml`/`tsconfig*.json`）→ `E_TEST_CONFIG_TOUCH`（需 `override mode=waive`，否则拦） |
| R3 指纹 | R2 开始时算一次指纹，重跑结束时再算一次，两次必须一致（防重跑期间被改）。`claim` 指纹只在 `--no-rerun` 模式下作为漂移提示，**要求先有 `override mode=waive` 放行 `E_ASSERTION_FAILED`**，否则 `--no-rerun` 直接 `E_CONTRACT`。**前置的干净判定**：已跟踪文件改动（`--untracked-files=no`）+ **scope 内**未跟踪文件（见附录 J），`.mcp-probe-kit/` 与 scope 外未跟踪不计 |
| R4 落地 | 归属提交须为 HEAD 祖先；否则用记录里的 `patch-id` 在 HEAD 历史中找等价提交；都不成立 → `E_UNMERGED_WORK` |
| R5 轮次 | 失败累加 `review_round`；第 3 次 → `parked` + 收件箱一条。**环境类失败不计入**（`E_DIRTY_SCOPE`/`E_BUSY`/`E_TIMEOUT`/`E_CLAIM_STALE`） |

命令来源硬约束：命令取自契约文件；若契约指向 `package.json` 的 script，则**内联执行 `<contract_commit>:package.json` 里的版本**（不读工作树、不读 `base_head`）。

### 5.4 逃生阀

`override(taskId, code, reason, mode)`（控制台）：`reason ≥ 30 字`，写 events，计入技术债。
- `mode=waive`：**针对某个 code 放行一次**（`E_TEST_CONFIG_TOUCH`、`E_DIFF_BUDGET`、`E_SCOPE_TOO_BROAD` 的常规出口），任务继续正常 close；**一次性**，close 结束后即失效（不复用）；`fixed by override:<code>` 记在 task 上。
- `mode=force-close`：直接置 done（`closed_by=force-close`），不受其余门禁约束。
`closed_by` 取值统一为 `rerun｜waive｜force-close`（正常重跑通过 / waive 放行 / 直接强关）。

### 5.5 需求变更

`req.amend`（控制台）改已批准需求的 acceptance 或 Path 的 allowed_paths：
1. 同需求的 doing 任务 → **backlog**（不是 parked），`contract_hash` 重算，Agent 可立即重新 claim；
   - 只改 acceptance（不动 `allowed_paths`）→ Path **保持 approved**，重领即走；
   - 改了 `allowed_paths` → Path 回 `draft`，**需 Owner 重新批准**后才能 claim（`E_NEED_APPROVED`）；
2. done 任务不追溯；events 记旧/新哈希。
3. **scope 收窄/扩张不走 Agent**：由 Owner 的 `task.adjust` 执行；Agent 只能拿到 `ask-owner`。
## 6. scope 与前缀比较

- 前缀一律**按路径段**比较：`allowed_paths=["src/api"]` 覆盖 `src/api/**`，不覆盖 `src/api-v2/**`；比较前对两侧做 `realpath(dirname)` + NFC + 大小写折叠（macOS/Windows）。
- `..` 出现的路径、`mode 120000`（symlink）命中的路径 → 直接 `E_SCOPE_VIOLATION`。
- scope 内文件数 > 2000 → `E_SCOPE_TOO_BROAD`。
- scope 内单文件 > 5 MiB → `E_FILE_TOO_LARGE`（必须排除或拆分，避免指纹失控）。

## 7. scope 指纹（claim 记录；close 与"本轮 R2 开始时"的指纹比对）

```
fingerprint = sha256( anchor /*= 当前 HEAD*/ + "\0" + sorted(
    scope 内工作树文件:  path + ":" + exec + ":" + sha256(内容)   // 含未跟踪
    scope 内 HEAD 有、工作树无:  path + ":deleted"
))
```

- 枚举：`git ls-files -co --exclude-standard` 与文件系统遍历取并集；忽略 `.mcp-probe-kit/**`、`.git/**`；`git check-ignore` 命中的排除。
- 无 coarse 模式：scope 上限 2000 文件（E_SCOPE_TOO_BROAD）保证成本可控；实测 500 文件 13ms。
- 归一化：路径 NFC、内容按 LF（只由 `core.autocrlf` 造成的 CRLF 视为等价）；二进制不归一；symlink 记 `target`（`lstat`）。
- 指纹在 **claim 时记录一次**（仅用于排查），**close 时不与它比对**；close 只比对"R2 开始 vs 结束"两次（见 §5.3 R3）。commit 阶段不拦。

## 8. 数据（10 表：业务 7 + meta + runs + patch_ids）

```sql
-- PRAGMA journal_mode=WAL; busy_timeout=5000；写事务一律 BEGIN IMMEDIATE（短事务，不跨命令执行）
meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)
requirements(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, goal TEXT NOT NULL,
  acceptance_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','approved','building','done','parked')),
  created_at TEXT NOT NULL, approved_at TEXT, archived_at TEXT)
paths(
  id TEXT PRIMARY KEY, requirement_id TEXT REFERENCES requirements(id),
  allowed_paths_json TEXT NOT NULL, allow_new_files INTEGER NOT NULL DEFAULT 0,
  budget_lines INTEGER NOT NULL DEFAULT 1200, test_cmds_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('draft','approved')), hash TEXT,
  contract_commit TEXT, approved_at TEXT)
tasks(
  id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL REFERENCES requirements(id),
  path_id TEXT NOT NULL REFERENCES paths(id), kind TEXT NOT NULL CHECK(kind IN ('feature','bugfix','chore','test')),
  title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('backlog','doing','done','parked')),
  scope_json TEXT NOT NULL, acceptance_json TEXT NOT NULL, depends_on_json TEXT NOT NULL DEFAULT '[]',
  budget_lines INTEGER NOT NULL DEFAULT 400, changed_lines INTEGER NOT NULL DEFAULT 0,
  base_head TEXT NOT NULL, contract_hash TEXT NOT NULL, contract_commit TEXT NOT NULL,
  claimed_by TEXT, claimed_at TEXT, claim_expires_at TEXT,
  closing_at TEXT,      -- ISO 时间戳（TTL 判定用）
  closing_token TEXT,   -- 本次 close 的令牌（CAS 用）
  claim_fingerprint TEXT, review_round INTEGER NOT NULL DEFAULT 0, closed_by TEXT, closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, archived_at TEXT)
bugs(id TEXT PRIMARY KEY, requirement_id TEXT REFERENCES requirements(id), title TEXT NOT NULL,
     symptom TEXT NOT NULL, expected TEXT NOT NULL, repro_json TEXT NOT NULL DEFAULT '[]',
     attachments_json TEXT NOT NULL DEFAULT '[]',
     severity TEXT NOT NULL DEFAULT 'P2' CHECK(severity IN ('P0','P1','P2','P3')),
     status TEXT NOT NULL CHECK(status IN ('new','fixing','verifying','closed')),
     task_id TEXT REFERENCES tasks(id), source TEXT NOT NULL CHECK(source IN ('owner','agent')),
     closed_by TEXT, created_at TEXT NOT NULL, archived_at TEXT)
docs(id TEXT PRIMARY KEY, requirement_id TEXT REFERENCES requirements(id), path TEXT NOT NULL,
     sha256 TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, registered_at TEXT NOT NULL)
questions(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), question TEXT NOT NULL,
          options_json TEXT NOT NULL DEFAULT '[]', answer TEXT, answered_at TEXT,
          status TEXT NOT NULL CHECK(status IN ('open','answered','expired')), expires_at TEXT NOT NULL)
events(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL,
       channel TEXT NOT NULL CHECK(channel IN ('agent','owner','system')), action TEXT NOT NULL,
       task_id TEXT, code TEXT, detail TEXT)
-- 索引（收件箱/进度/claim 三项热查询）
CREATE UNIQUE INDEX ux_paths_req ON paths(requirement_id) WHERE requirement_id IS NOT NULL;
CREATE INDEX ix_tasks_status ON tasks(status);
CREATE INDEX ix_tasks_doing ON tasks(status, claim_expires_at) WHERE status='doing';
CREATE INDEX ix_tasks_req ON tasks(requirement_id);
CREATE INDEX ix_events_at ON events(at);
CREATE INDEX ix_events_task ON events(task_id, at);
CREATE INDEX ix_questions_open ON questions(status, expires_at) WHERE status='open';
CREATE INDEX ix_bugs_status ON bugs(status);
-- 取证记录（run）与 patch-id 归属（R0 兜底）
CREATE TABLE runs(
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), assertion_idx INTEGER NOT NULL,
  command TEXT NOT NULL, exit_code INTEGER NOT NULL, head TEXT NOT NULL, fingerprint TEXT NOT NULL,
  log_sha256 TEXT NOT NULL, started_at TEXT NOT NULL, duration_ms INTEGER NOT NULL);
CREATE INDEX ix_runs_task ON runs(task_id, started_at);
CREATE TABLE patch_ids(patch_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id),
  commit_sha TEXT NOT NULL, PRIMARY KEY(patch_id, task_id));
```

- **schema 版本单一权威**：`meta.schema_version`；`PRAGMA user_version` 不用。程序版本低于库版本 → `E_SCHEMA_NEWER`（拒绝启动，提示升级程序）；高于则跑迁移。
- **归档**：`archived_at` 非空即归档；控制台默认只显示未归档；`doctor --archive --older 90d` 批量归档 done 且无引用的需求/任务/bug。
- **保留**：`runs/` 90 天（`doctor --prune`）；events 永久 + 控制台分页。

## 9. bootstrap digest（≤1.2KB）

```jsonc
{ "phase":"planning|executing|handoff",
  "requirement":{id,title,status}, "path":{id,status,budget_left},
  "task":{id,title,status,claim_expires_at,review_round},
  "blockers":[{code,hint,fix}], "questions":[{id,question,expires_at}],
  "next":{action,args,why}, "counts":{todo,doing,parked},
  "recent":["3 条 ≤80 字"] }
```

## 10/11. 动作

**Agent（7）**：`bootstrap` `task.create` `task.claim` `task.renew` `task.close` `bug.report` `ask`
`ask`：每任务配额 3 次；24h 未答 → 任务自动 `parked` 并进收件箱；**超配额只记事件、不进 `review_round`**（提问不能被当成验收失败来惩罚）。

**Owner（9，仅控制台）**：`req.intake` `req.approve` `req.amend` `answer` `handoff` `task.adjust`（调 scope / 预算）`task.reopen` `bug.decide`（验收 / 打回 / wontfix）`override`（`mode=force-close | waive`）

## 12. CLI

```
devflow init [--upgrade] [--only <dirs>] [--yes] [--write-codex-config]
devflow run -- <cmd>      # 采证（含指纹）
devflow commit -m "<msg>" # 6 条快速规则 + trailer + 记 patch-id
devflow doctor [--json] [--prune] [--archive --older 90d]
devflow export
```

`init` 幂等：只增不覆盖；冲突打印 diff，非交互（`--yes`）下**跳过写入并告警**（不擅自改用户配置）；`--only` 支持渐进接入。

## 13. 控制台（M0：一页三区）

- **收件箱**（≤3 条常态；同 code 同 task 24h 一条；每条标注阻塞对象）：待批准（含哈希确认）/ 待答问题 / 被打回 / parked / 需 override。
- **进度**（按需求分组）：`已完成/总任务`、doing 任务与 Agent、阻塞点、技术债计数、最近 5 条事件；任务可展开 scope、验收与最近 run。
- **文档**（只读）：已登记文档列表（标题、sha256 前 8 位、`DOC_DRIFT` 标记），点击用系统默认应用打开。
- 归档项默认隐藏；`handoff` 按钮生成交接卡。

## 14. 断言语法与执行语义

```
<command> :: exit==0
<command> :: stdout =~ /<regex>/
```
`command` 必须**逐字**来自 Path 的冻结契约文件 `.mcp-probe-kit/contracts/<pathId>.json`。**approve 与 amend 都会写入新契约并自动提交**（`chore(devflow): approve|amend <pathId>`），每次提交的 SHA 前移 `paths.contract_commit` 并更新 `paths.hash`；scope 校验对 `.mcp-probe-kit/contracts/**` **豁免**。**claim 与 close 都只读 `git show <contract_commit>:...`**，不读工作树、不读 DB、不读 `base_head`。claim 前置：该路径不存在 → `E_NO_CONTRACT`。

## 15. 已知绕过与对策

| 绕过 | 对策 |
|---|---|
| 改 db 标 done | close event 记 head/tree/fingerprint，`doctor` 重算（`GHOST_DONE`/`MISMATCH`） |
| `--no-verify` | R0–R4 全部从 git 重算 + 重跑 |
| 伪造 run | R2 内核重跑 |
| 改 `package.json` 的 test 脚本 | R2 内联执行 `git show <contract_commit>:package.json` 的脚本；package.json/lockfile 变更强制 Owner 批 |
| `test_cmds` 塞弱命令 | approve 时冻结，Agent 只读 |
| 验收自我放宽 | 血缘 `derive_from` + 命令白名单（取自 Path） |
| 混入他人提交 | R0 归属（trailer → patch-id → foreign） |
| 指纹 coarse 作弊 | 无 coarse；scope 上限 2000 文件 |
| 前缀吃掉同级目录 / symlink 逃逸 | 按路径段 + realpath + 拒 `..` 与 120000 |
| 一键批准不看内容 | 回输 acceptance 哈希前 8 位 |
| `ask` 滥用 | 配额 3 + 24h 超时转 parked |
| 端点伪造 Owner 动作 | Owner 动作只在控制台 |
| 篡改 db 并补 events | M1：HMAC 链 + `Devflow-Head:` footer |
| 语义糊弄 | M1：语义 review（档 2） |
| 篡改契约文件（`.mcp-probe-kit/contracts/**` 被批准路径豁免 scope 校验） | claim/close 校验契约 sha256 == `paths.hash`；任务提交触及契约目录（非批准提交）→ `E_CONTRACT` |
| 篡改 `node_modules` 等 gitignore 产物（指纹与脏检都看不见） | **R2 在临时干净检出中执行**：`git worktree add --detach .mcp-probe-kit/r2-wt HEAD` → `git clean -xdf` → 按 lockfile 装依赖（`npm ci` / `pnpm i --frozen-lockfile`）→ 跑命令；结束移除（复用时重建）。工作树内直接跑一律不允许 |

## 16. 本文档的验收标准

设计评审通过 = 附录 A–J 齐全且与正文一致 + 附录 F 的 16 条自测各有一条对应的设计条款 + 红队与规格两个门禁各自 ≥95。判据是条款映射与门禁分数，不是文档自述。

## 17. M0 完成判据

1. 附录 F 全绿；2. 一条真实需求走通全链路；3. 四客户端各自 `bootstrap` 得到同一 digest；4. dogfood 记录被拦/返工/绕过三个数。

---

## 附录 A · 错误对象（含 `fix` 的机器字段）

```jsonc
{ "ok": false,
  "code": "E_SCOPE_VIOLATION",
  "hint": "1 个文件超出任务 scope",                 // 人读一句
  "fix": { "action": "ask-owner", "args": { "files": ["src/core/x.ts"] } },  // 机器可执行（Agent 不能自改 scope）
  "data": { "files": ["src/core/x.ts"] } }
```
必填：`code`、`hint`、`fix.action`。`fix.args` 依 action 定。`SQLITE_BUSY` 耗尽、断言超时、内部异常同样用此结构（`code` 分别 `E_BUSY`/`E_TIMEOUT`/`E_INTERNAL`，`fix.action` 为 `retry`/`split-command`/`report-bug`）。
| `fix.action` | 用途 | `args` |
|---|---|---|
| `ask-owner` | 需 Owner 在控制台调整：任务 scope / 预算（`task.adjust`）或需求/Path（`req.amend`） | `{hint, taskId?, requirementId?}` |
| `retry` | BUSY / 瞬时错误 | `{after_ms}` |
| `split-command` | 断言超时，拆短 | `{suggested}` |
| `req.amend` | 需求/Path 需变更 | `{requirementId}` |
| `upgrade-cli` | `E_SCHEMA_NEWER` | `{required}` |
| `report-bug` | 内核内部错误 | `{}` |
| `wait` | 等前置/冲突任务结束 | `{dependsOn?, conflictTaskId?}` |
| `task.claim` | 过期后重新领取 | `{id}` |
| `task.close` | 先释放手上的任务 | `{id}` |
| `re-approve` | 契约缺失/需求变更后重新批准 | `{pathId}` |

## 附录 B · 断言执行语义

- 执行器：`sh -lc "<command>"`（Windows `cmd /c`）；记录 `shell`、`cwd`。**命令若引用 `package.json` script，先取 `git show <contract_commit>:package.json` 的脚本文本并内联展开执行**——不读工作树、也不读 `base_head`（防"先改脚本再 claim"）。
- cwd：**`.mcp-probe-kit/r2-wt`**（R2 的临时干净检出）；`devflow run` 手工采证时用仓库根。env：继承 + `CI=1`、`MCP_PROBE_KIT_TASK`；不注入密钥。
- 超时：默认 600s，可配；超时 `exit_code=124`。
- 编码：UTF-8，非法字节替换；stdout 上限 1 MiB（截断记 `truncated`）。
- 正则：JS `RegExp` + `m`，逐行匹配；`=~` 要求退出码 0 且至少一行匹配。
- 日志：`runs/<run_id>.log` + `sha256` 入库。

## 附录 C · 状态机

| 对象 | 迁移 | 触发 |
|---|---|---|
| Requirement | draft→approved→building→done；approved/building→parked；**done→building**（走 `req.amend`）；归档只置 `archived_at`，不改 status | Owner approve/amend；系统（首个 claim→building；全部 task done→done） |
| Path | draft→approved；approved→draft（**仅当 `req.amend` 改了 `allowed_paths`**） | 系统 / Owner |
| Task | backlog→doing→done；doing→backlog（过期/stale/amend）；doing→parked（3 次失败 / ask 超时）；**done→backlog**（reopen）；parked→backlog | Agent claim/close；系统；Owner reopen |
| Bug | new→**fixing**（创建关联 task 时自动）；fixing→verifying（关联 task close 时自动）；verifying→fixing（Owner 打回）；verifying→closed（Owner 验收）；new/verifying→closed(wontfix) | 系统自动推进；Owner 只做 `bug.decide`（验收/打回/wontfix） |

非法迁移 → `E_ILLEGAL_TRANSITION`。

## 附录 D · init 与四家客户端

1. 建 `.mcp-probe-kit/{state.db,runs,contracts}`；`.gitignore` 追加 `.mcp-probe-kit/state.db*` 与 `.mcp-probe-kit/runs/`（**契约目录要提交**）。
2. Path 草稿：按顶层目录生成，`requirement_id` 为 **NULL**（草稿不属于某需求），`allowed_paths=[<dir>]`；排除 `node_modules .git dist build .mcp-probe-kit` 与 `**/fixtures`、`**/__snapshots__`；`--only` 限定目录。
3. `.gitattributes`：仅在缺失时追加 `* text=auto eol=lf`。
4. 客户端配置（只增不覆盖；冲突打印 diff；非交互跳过并告警）：
   - 服务端解析根目录顺序：`MCP_PROBE_KIT_ROOT` 环境变量 → 当前目录 `git rev-parse --show-toplevel`；都失败则返回 `E_NO_ROOT`（`fix.action=ask-owner`，提示"在 MCP 配置里设 MCP_PROBE_KIT_ROOT 或从仓库目录启动"）。上面四份片段因此**都不写死路径**。

```jsonc
// .mcp.json（Claude Code）
{ "mcpServers": { "devflow": { "command": "npx", "args": ["-y", "devflow-mcp@0.1.0"] } } }

// .cursor/mcp.json（Cursor，字段同为 mcpServers）
{ "mcpServers": { "devflow": { "command": "npx", "args": ["-y", "devflow-mcp@0.1.0"] } } }

// ~/.codex/config.toml（Codex）—— 默认只打印片段；加 --write-codex-config 才写，且备份
[mcp_servers.mcp-probe-kit]
command = "npx"
args = ["-y", "devflow-mcp@0.1.0"]

// opencode.json（OpenCode）
{ "mcp": { "devflow": { "type": "local", "command": ["npx", "-y", "devflow-mcp@0.1.0"] } } }
```

5. `AGENTS.md` 标记块（只替换块内，块外一字不动）与 MCP `instructions` 同源生成：

```md
<!-- devflow:begin -->
第一个动作必须是 devflow.bootstrap。改代码前必须 task.claim。
不许修改 acceptance，不许自选命令。完成后调 task.close（内核会重跑验收）。
遇到歧义用 ask，不要猜。
<!-- devflow:end -->
```

## 附录 E · doctor

`--json` 输出 `[{check, code, severity, detail, task_id?}]`；`severity`: error|warn。

| 检查 | 输出码 | 级别 |
|---|---|---|
| done 但 close event 与 git 不符 | `MISMATCH` | error |
| done 但无 close event | `GHOST_DONE` | error |
| 归属提交非 HEAD 祖先 | `UNMERGED` | error |
| `allowed_paths` 目录不存在 | `STALE_PATH` | warn |
| 登记文档缺失或哈希变化 | `DOC_DRIFT` | warn |
| hook 缺失/变更 | `HOOK_CHANGED` | warn |
| claim 已过期 | `STALE_CLAIM` | warn |
| close 卡住（`closing_at` 超 **60 分钟**，与 §5.1 TTL 一致） | `STALE_CLOSING` | warn |
| runs 超保留期 | `PRUNABLE` | warn |

退出码：任一 error → 1；否则 0。`--prune` 删除失败 → 仍退出 0 但输出 `severity=warn` 明细。

## 附录 F · 设计自测清单（对应条款）

| # | 断言 | 对应条款 |
|---|---|---|
| 1 | 两进程同时 claim → 只有一个成功 | §5.1 |
| 2 | scope 内改 → 指纹变；scope 外 `git add` → 不变；未跟踪新增 → 变；删文件并 commit → 变 | §7 |
| 3 | `pnpm test \|\| true` 不能充当 `pnpm test` | §5.3 R2、附录 B |
| 4 | `--no-verify` 提交后 close → 被 R1/R4 拦 | §5.3 |
| 5 | 他人 scope 内提交不抬高本任务预算 | §5.3 R0 |
| 6 | 需求改验收 → doing 任务回 backlog 且可重新 claim | §5.5 |
| 7 | `E_DEP_OR_TEST_TOUCH` 在 close 复算后仍触发 | §5.3 R1 |
| 8 | 四客户端 bootstrap 得到同一 digest | §9、附录 D |
| 9 | 伪造 run 不采信 | §5.3 R2 |
| 10 | 直接改 db 标 done → doctor 报 `GHOST_DONE` | 附录 E |
| 11 | 验收缺 `derive_from` → `E_CONTRACT`（铁律 3） | §5.1、§1 |
| 12 | 多提交被 squash 成一个 → 归属仍命中（squash 后拼接的 trailer，或 patch-id），预算不重复计 | §5.3 R0 |
| 13 | 批准后未提交契约文件就 claim → `E_NO_CONTRACT`，不会卡死 | §14 |
| 14 | 已跟踪文件有未提交改动，或 scope 内有未跟踪文件 → `E_DIRTY_SCOPE`（环境类，不计轮次）；`.mcp-probe-kit/` 与 scope 外未跟踪文件不计（已知残余风险，见 §15） | §5.3、附录 J |
| 15 | Path 累计行数（`tasks.changed_lines` 之和，含本任务）超 `path.budget_lines` → `E_DIFF_BUDGET{scope:"path"}` | §5.3 R1、§8 |
| 16 | 新增文件既未命中 `path.allow_new_files`、也未在 `task.scope` 显式列出 → `E_UNREGISTERED_FILES` | §5.3 R1 |

## 附录 G · 交接卡（`handoff`）

```text
【T-0012】修复 B-0034
需求 FR-0007 · Path P-0003 · scope: src/api/
验收: apitest :: exit==0（命令取自 P-0003.test_cmds）
前置: 无 · 预算: 400 行（已用 0）
起步: devflow mcp bootstrap → task.claim T-0012
```

## 附录 H · 动作契约（字段级）

### H.1 Agent 面（MCP 单工具 `devflow`，`action` 枚举）

**通用返回**：成功 `{ok:true, ...}`；失败 `{ok:false, code, hint, fix, data}`（附录 A）。所有 action 必带 `action`；`actor` 由 MCP 会话注入（`client/sessionId`），不由参数传入。

```jsonc
// bootstrap  request: { action:"bootstrap" }
// response: 附录 §9 的 digest（≤1.2KB）

// task.create
request: { action:"task.create", requirementId:"FR-001", pathId:"P-001",
           kind:"feature", title:"string(1..200)",
           acceptance:[{deriveFrom:0, assertion:"pnpm test :: exit==0"}],
           scope:["src/api"], dependsOn:["T-0003"]? }
response:{ ok:true, id:"T-0004", contractHash:"sha256:…", budgetLines:400 }
errors:   E_NEED_APPROVED | E_CONTRACT | E_ILLEGAL_TRANSITION

// task.claim
request: { action:"task.claim", id:"T-0004" }
response:{ ok:true, id, baseHead:"<sha>", linkBase:"<sha>",
           scope:["src/api"], acceptance:[…], budgetLines:400,
           claimExpiresAt:"ISO", contractHash:"sha256:…", contractCursor:0 }
errors:   E_NEED_APPROVED | E_NO_CONTRACT | E_CONTRACT | E_DEP_OPEN |
          E_SCOPE_OVERLAP | E_CLAIMED_BY_OTHER | E_WIP_LIMIT |
          E_SCOPE_TOO_BROAD | E_FILE_TOO_LARGE | E_CLAIM_STALE

// task.renew
request: { action:"task.renew", id:"T-0004" }
response:{ ok:true, claimExpiresAt:"ISO" }
errors:   E_CLAIM_STALE（已被回收，需重新 claim）

// task.close（R0–R5 见 §5.3；返回不含长文本）
request: { action:"task.close", id:"T-0004", mode:"rerun"|"no-rerun" }
response:{ ok:true, id, closedBy:"rerun", runs:[{assertionIdx:0, runId:"r-…", exit:0}],
           fingerprint:"sha256:…", commits:[…] }
errors:   E_NO_DELIVERY | E_UNOWNED_COMMIT | E_SCOPE_VIOLATION | E_DIFF_BUDGET |
          E_LINT_TODO | E_UNREGISTERED_FILES | E_DEP_OR_TEST_TOUCH | E_TEST_CONFIG_TOUCH |
          E_TIMEOUT | E_EVIDENCE_DRIFT | E_DIRTY_SCOPE | E_ASSERTION_FAILED | E_CONTRACT | E_CLAIM_STALE | E_UNMERGED_WORK | E_ILLEGAL_TRANSITION

// bug.report
request: { action:"bug.report", title, symptom, expected, repro:["…"],
           requirementId?:"FR-001", severity:"P0|P1|P2|P3" }
response:{ ok:true, bugId:"B-0007", taskDraft:{ kind:"bugfix", scope:[…], acceptance:[…] } }
errors:   E_CONTRACT（缺复现）

// ask
request: { action:"ask", taskId:"T-0004", question:"string(1..300)",
           options:["A","B"]? }
response:{ ok:true, questionId:"Q-0003", expiresAt:"ISO", quotaLeft:2 }
errors:   E_QUOTA（超 3 次，只记事件，不阻塞）
```

### H.2 Owner 面（控制台 HTTP，仅本机）

所有请求 `POST`，`Content-Type: application/json`，带一次性 CSRF token（页面注入）；响应同附录 A。

```jsonc
req.intake   { type:"requirement", title, goal, acceptance:[{assertion}] }
             { type:"bug", title, symptom, expected, repro:[…], attachments? }
             { type:"doc", requirementId?, path }         // 登记仓库内已有文件
             → { ok:true, id }

req.approve  { requirementId:"FR-001", pathId:"P-001", acceptanceHashPrefix:"ab12cd34" }
             → { ok:true, approvedAt, contractCommit:"<sha>" }   // 内核自动提交契约文件
             errors: E_HASH_MISMATCH（前 8 位不符）

req.amend    { requirementId, acceptance?, allowedPaths?, budgetLines? }
             → { ok:true, affectedTasks:["T-0004"], resetTo:"backlog" }

answer       { questionId:"Q-0003", answer:"A" }
             → { ok:true, taskResumed:"T-0004" }

handoff      { taskId:"T-0004" }
             → { ok:true, text:"附录 G 的交接卡" }

task.reopen  { taskId, reason:"string(≥10)" }
             → { ok:true, status:"backlog" }

bug.decide   { bugId, decision:"accept"|"reject"|"wontfix", reason? }
             → { ok:true, status: decision === "reject" ? "fixing" : "closed" }
override     { taskId, code, reason:"string(≥30)", mode:"waive"|"force-close" }
             → { ok:true, taskStatus:"doing"|"done" }

task.adjust  { taskId, scope?:string[], budgetLines?:number, reason:string }
             → { ok:true, taskId, scope, budgetLines }
```

**控件映射**：收件箱每条 → 一个按钮 + 一个短表单；批准弹窗内展示全部断言原文与命令，下方输入框要求粘贴哈希前 8 位。进度区每个任务一个"交接卡"按钮与"打回"按钮。文档区只读列表 + "用默认应用打开"。

## 附录 I · 错误码 → `fix.action` 全表

| code | fix.action | args |
|---|---|---|
| `E_NEED_APPROVED` | `ask-owner` | `{requirementId}` |
| `E_NO_CONTRACT` | `re-approve` | `{pathId}` |
| `E_CONTRACT` | `ask-owner` | `{missing[]}` |
| `E_DEP_OPEN` | `wait` | `{dependsOn:[{id,status}]}` |
| `E_SCOPE_OVERLAP` | `wait` / `ask-owner` | `{conflictTaskId}` |
| `E_CLAIMED_BY_OTHER` | `retry` | `{after_ms, holder}` |
| `E_CLAIM_STALE` | `task.claim` | `{id}` |
| `E_WIP_LIMIT` | `task.close` | `{id:"T-0004"}`（先关手上的任务） |
| `E_SCOPE_TOO_BROAD` | `ask-owner` | `{paths[], fileCount}` |
| `E_FILE_TOO_LARGE` | `ask-owner` | `{path, size}` |
| `E_SCOPE_VIOLATION` | `ask-owner` | `{files[]}`（Agent 不能自改 scope） |
| `E_UNREGISTERED_FILES` | `ask-owner` | `{files[]}` |
| `E_DIFF_BUDGET` | `ask-owner` | `{used, budget}` |
| `E_LINT_TODO` | `retry` | `{files[]}` |
| `E_DEP_OR_TEST_TOUCH` | `ask-owner` | `{files[]}` |
| `E_TEST_CONFIG_TOUCH` | `ask-owner` | `{files[]}` |
| `E_NO_DELIVERY` | `retry` | `{hint:"devflow commit"}` |
| `E_UNOWNED_COMMIT` | `ask-owner` | `{commits[]}`（缺 `Task-Id`，需补 trailer 或回滚） |
| `E_EVIDENCE_DRIFT` | `retry` | `{changedFiles[]}` |
| `E_ASSERTION_FAILED` | `retry` | `{assertionIdx, runId, exit}` |
| `E_DIRTY_SCOPE` | `wait` | `{files[]}` |
| `E_UNMERGED_WORK` | `retry` | `{commits[]}` |
| `E_TIMEOUT` | `split-command` | `{command, timeoutSec}` |
| `E_BUSY` | `retry` | `{after_ms}` |
| `E_ILLEGAL_TRANSITION` | `ask-owner` | `{from, to, allowed[]}` |
| `E_HASH_MISMATCH` | `ask-owner` | `{expectedPrefix}` |
| `E_SCHEMA_NEWER` | `upgrade-cli` | `{required}` |
| `E_NO_ROOT` | `ask-owner` | `{hint:"set MCP_PROBE_KIT_ROOT"}` |
| `E_ID_EXHAUSTED` | `report-bug` | `{prefix}` |
| `E_QUOTA` | `ask-owner` | `{taskId, quota}` |
| `E_INTERNAL` | `report-bug` | `{traceId}` |

> `E_CLOSE_ABANDONED` 只写入 `events`（清理动作的记录），**不返回给调用方**，因此不在上表。

## 附录 J · 指纹与 close 伪代码

```js
// ── 枚举与指纹 ───────────────────────────────────────────────────────────
function scopeFiles(root, scope) {                 // scope: 字面前缀数组
  // 并集：文件系统遍历 + git 跟踪/未跟踪清单（两边都过滤，与 §7 一致）
  const cand = new Set([...walk(root), ...gitLsFiles(root)]);
  const out = [];
  for (const rel of cand) {
    if (isIgnored(rel)) continue;                  // git check-ignore -q -- rel
    const p = toPosix(rel);
    if (scope.some(s => p === s || p.startsWith(s + "/"))) out.push(p);
  }
  return out.sort();                               // 排序键 = 归一化 posix 路径
}

function fingerprint(root, scope, anchor) {
  const parts = [];
  for (const p of scopeFiles(root, scope)) {
    const abs = path.join(root, p);
    let st; try { st = fs.lstatSync(abs); } catch { parts.push(`${p}:missing`); continue; }  // 枚举后消失 → 记 missing
    if (st.isSymbolicLink()) { parts.push(`${p}:link:${fs.readlinkSync(abs)}`); continue; }
    const buf = fs.readFileSync(abs);
    const body = buf.includes(0) ? buf
      : Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8");   // 文本按 LF 归一
    parts.push(`${p}:${st.mode & 0o111 ? "x" : "-"}:${sha256(body)}`);
  }
  for (const p of gitLsTree(anchor, scope))        // anchor 有、工作树无 → deleted
    if (!fs.existsSync(path.join(root, p))) parts.push(`${p}:deleted`);
  return sha256(Buffer.from(anchor + "\0" + parts.join("\n")));
}

// ── close：R0 归属 → R1 重算 → R2 重跑 → R3 指纹 → R4 落地 → R5 轮次 ──────
// approve/amend 提交的唯一判定：内核身份 + 提交信息前缀 + 只碰契约目录（三者同时满足）
const isApproveCommit = (c) =>
  /^chore\(devflow\): (approve|amend) /.test(c.subject) &&
  c.author === "devflow@localhost" &&
  c.files.length > 0 &&
  c.files.every(f => f.startsWith(".mcp-probe-kit/contracts/"));
async function close(taskId, mode = "rerun") {
  if (!["rerun", "no-rerun"].includes(mode)) return { ok: false, code: "E_CONTRACT", data: { missing: ["invalid mode"] } };
  const t = getTask(taskId);
  let lastFailCode = null;
  // 本地 fail：所有失败出口统一记录 code，R5 才有依据（否则 return 分支绕过 catch）
  const fail = (code, data) => { lastFailCode = code; return { ok: false, code, data }; };
  if (t.status !== "doing") return fail("E_ILLEGAL_TRANSITION", { from: t.status, to: "done" });
  const closeToken = randomId();
  if (Date.parse(t.claimExpiresAt) < Date.now())
    return fail("E_CLAIM_STALE", { hint: "task.claim 续期后再 close" });   // 过期必须重新接管
  if (!casMarkClosing(t.id, closeToken)) return fail("E_BUSY", { after_ms: 500 });  // 写 closing_at=now, closing_token=token
  try {
    if (mode === "no-rerun" && !waivedFor(t.id, "E_ASSERTION_FAILED"))
      return fail("E_CONTRACT", { missing: ["override mode=waive"] });

    const head0 = git("rev-parse HEAD");
    const commits = gitLog(`${t.baseHead}..HEAD`).map(c => ({
    // 统一取每个提交的"逐提交差异"：`git diff -m --first-parent <sha>^..<sha>`
    // files / lines / addedFiles / TODO / patch-id 全部基于同一份输出——合并提交的 combined diff 常为空，直接算会漏检
      sha: c.sha, subject: c.subject, author: c.author,
      trailer: firstTrailer(c.body, "Task-Id"),
      trailerCount: allTrailers(c.body, "Task-Id").length,
      patchId: git(`diff -m --first-parent ${c.sha}^..${c.sha} | git patch-id --stable`).split(" ")[0],
      files: numstatFiles(c.sha),        // 合并提交用 `git show -m --first-parent --numstat`（否则 diff 为空）
      authorTime: c.authorTime,          // R1 校验：不得晚于 claimExpiresAt，否则 E_CLAIM_STALE
    }));

    // 只对**触及本任务 scope** 且含**多个不同** Task-Id 的提交报错（squash 拼接同一 id 不算）
    const multiTrailer = commits.filter(c =>
      c.trailerCount > 1 && intersects(c.files, t.scope) && distinctTaskIds(c.body).length > 1);
    if (multiTrailer.length)
      return fail("E_CONTRACT", { missing: ["multiple distinct Task-Id in one commit"], commits: multiTrailer.map(c => c.sha) });
    // R0 归属（validOwner 提前定义，供 owned / unowned 共用）
    const validOwner = (c) => {                     // 他人工作：任务存在 + 时间窗覆盖 + 只碰它的 scope
      if (!c.trailer || !taskExists(c.trailer)) return false;
      const o = getTask(c.trailer);
      const at = Date.parse(c.authorTime);
      return at >= Date.parse(o.claimedAt) && at <= Date.parse(o.closedAt ?? o.claimExpiresAt)
        && c.author === o.claimedBy                       // 身份也要对：只能由该任务的领取者提交
        && c.files.every(f => inScope(f, o.scope));
    };
    const owned = commits.filter(c =>
      c.trailer === t.id || (!validOwner(c) && metaHasPatchId(c.patchId, t.id)));
    // 契约完整性：claim 时校验 == paths.hash 并写入 task.contract_hash；close 时校验 == task.contract_hash
    const contractSha = sha256(git(`show ${t.contractCommit}:.mcp-probe-kit/contracts/${t.pathId}.json`));
    if (contractSha !== t.contractHash) return fail("E_CONTRACT", { missing: ["contract hash mismatch"] });
    // 任务提交不得改动契约文件（只允许批准提交本身）
    const contractTouches = owned.filter(c =>
      c.files.some(f => f.startsWith(".mcp-probe-kit/contracts/")) && !isApproveCommit(c));
    if (contractTouches.length)
      return fail("E_CONTRACT", { missing: ["contract file modified by task commits"], commits: contractTouches.map(c => c.sha) });
    // 无主 = 非 approve、无有效 owner（本人/他人/时间窗）、且 patch-id 未命中本任务
    const unowned = commits.filter(c =>
      !isApproveCommit(c) && !owned.includes(c) && !validOwner(c) && !metaHasPatchId(c.patchId, t.id));
    if (unowned.length) return fail("E_UNOWNED_COMMIT", { commits: unowned.map(c => c.sha) });
    if (!owned.length) return fail("E_NO_DELIVERY", { hint: "devflow commit" });
    // 其他任务的提交（带别的 Task-Id）不属于本任务，也不计预算；无主提交已在上面拦掉
    // R1 的一部分：归属提交的作者时间必须落在 claim 窗口内（窗口外 → 视为他人工作）
    // 下界由 base..HEAD 天然保证（过期重领不追溯旧提交），只校验上界：不得晚于本次 claim 到期
    // 统一转 epoch 比较（ISO 字符串带时区，直接比较会恒假）；超时提交需重新 claim 后重试 close
    const outsideWindow = owned.filter(c => Date.parse(c.authorTime) > Date.parse(t.claimExpiresAt));
    // （违例返回 E_CLAIM_STALE，fix.action=task.claim：先续/重领再 close）
    if (outsideWindow.length)
      return fail("E_CLAIM_STALE", { commits: outsideWindow.map(c => c.sha), reason: "commit after claim expiry" });

    // R1 重算（不信任 hook，也不信任 DB 里已写的统计）
    const files = [...new Set(owned.flatMap(c => c.files))];
    const outOfScope = files.filter(f => !inScope(f, t.scope));
    const allowNew = getPath(t.pathId).allowNewFiles;
    const unregistered = owned.flatMap(c => addedFiles(c.sha))          // git diff --diff-filter=A
      .filter(f => !isExplicitScope(f, t) && !(allowNew && inScope(f, allowedPathsOf(t.pathId))));
    if (unregistered.length) return fail("E_UNREGISTERED_FILES", { files: unregistered });
    if (outOfScope.length) return fail("E_SCOPE_VIOLATION", { files: outOfScope });
    const lines = owned.reduce((n, c) => n + numstatLines(c.sha), 0);
    const pathBudget = getPath(t.pathId).budgetLines;
    const pathUsed = linesForPath(t.pathId);           // 该 Path 下所有任务累计（done + doing）
    if (pathUsed + lines > pathBudget && !waivedFor(t.id, "E_DIFF_BUDGET"))   // 权威判定在 updateTaskCas 内
      return fail("E_DIFF_BUDGET", { scope: "path", used: pathUsed + lines, budget: pathBudget });
    if (lines > t.budgetLines && !waivedFor(t.id, "E_DIFF_BUDGET"))
      return fail("E_DIFF_BUDGET", { used: lines, budget: t.budgetLines });
    const todo = owned.flatMap(c => addedTodoLines(c.sha)).filter(l => !l.includes(t.id));
    if (todo.length) return fail("E_LINT_TODO", { lines: todo });
    const cfg = files.filter(isTestConfig);                       // vitest.config.* / conftest.py / tsconfig*.json
    if (cfg.length && !waivedFor(t.id, "E_TEST_CONFIG_TOUCH"))
      return fail("E_TEST_CONFIG_TOUCH", { files: cfg });
    // 测试文件与依赖清单都没有 kind 豁免：一律需 Owner waive（防"建个 test 任务改测试"）
    const depOrTest = files.filter(f => isPkgManifest(f) || isTestPath(f));   // 无 kind 豁免：测试类任务同样需 Owner waive
    if (depOrTest.length && !waivedFor(t.id, "E_DEP_OR_TEST_TOUCH"))
      return fail("E_DEP_OR_TEST_TOUCH", { files: depOrTest });

    // R2 重跑（不持写事务）
    const r2wt = ".mcp-probe-kit/r2-wt";                 // 每次 close 重建：rm -rf + git worktree add --detach
    // 1) 重建干净检出 → 2) 按 lockfile 装依赖 → 3) 才算 fp0（顺序不可换）
    sh(`rm -rf ${r2wt} && git worktree add --detach ${r2wt} HEAD && git -C ${r2wt} clean -xdf`);
    installDeps(r2wt);                                 // npm ci / pnpm i --frozen-lockfile
    const fp0 = fingerprint(r2wt, t.scope, head0);
    // 工作树判脏：已跟踪文件的改动（含暂存）+ scope 内的未跟踪文件；**忽略他人 scope 外的未跟踪文件**
    const dirtyTracked = git("status --porcelain --untracked-files=no -- . ':(exclude).mcp-probe-kit'").trim();
    const dirtyUntracked = git(`status --porcelain --untracked-files=all -- ${t.scope.join(" ")}`).trim();
    const dirty = [dirtyTracked, dirtyUntracked].filter(Boolean).join("\n");
    if (dirty) return fail("E_DIRTY_SCOPE", { files: dirty.split("\n").map(l => l.slice(3)) });
    if (mode === "rerun") {
      for (const [i, a] of t.acceptance.entries()) {
        // 断言逐字一致（命令与谓词都不许改写）；脚本取自 contract_commit 的 package.json
        if (!contractAssertions(t.contractCommit).includes(a.assertion))   // 读 contract_commit 的契约文件，不读 DB
          return fail("E_CONTRACT", { missing: [`assertion not in contract: ${a.assertion}`] });
        const cmd = parseCommand(a.assertion);
        const run = await execAssertion(cmd, a.assertion, { scriptsFrom: "contract_commit" });   // 脚本取契约提交，防"先改脚本再 claim"
        insertRun({ ...run, taskId: t.id, assertionIdx: i, fingerprint: fp0 });
        touchClosing(t.id, closeToken);        // 每条断言后续期 closing_at，避免长重跑被 TTL 回收
        if (!run.passed) return run.exit === 124
          ? fail("E_TIMEOUT", { command: cmd, timeoutSec: 600 })
          : fail("E_ASSERTION_FAILED", { assertionIdx: i, runId: run.id, exit: run.exit });
      }
    } else {
      for (const [i, a] of t.acceptance.entries())
        if (!hasPassingRun(t.id, i, fp0))
          return fail("E_EVIDENCE_DRIFT", { assertionIdx: i, changedFiles: [] });
    }
    // R3 指纹两端一致
    // R2 期间不许有提交：HEAD 必须仍是 head0（否则测试跑的是旧树、close 却记新 HEAD）
    if (git("rev-parse HEAD").trim() !== head0)
      return fail("E_EVIDENCE_DRIFT", { reason: "HEAD moved during R2" });
    if (fingerprint(r2wt, t.scope, head0) !== fp0)
      return fail("E_EVIDENCE_DRIFT", { changedFiles: files });

    // R4 落地
    if (!owned.every(c => isAncestor(c.sha, head0) || patchIdInHead(c.patchId, head0)))
      return fail("E_UNMERGED_WORK", { commits: owned.map(c => c.sha) });

    // 通过
    // Path 预算的**权威校验在 CAS 事务内**完成（`pathUsed + lines <= pathBudget`），并发 close 不会超支
    if (updateTaskCas(t.id, closeToken, { status: "done", changed_lines: lines,
                                         closed_by: mode === "rerun" ? "rerun" : "waive",
                                         closing_at: null, closing_token: null, updated_at: now() }) !== 1)
      return fail("E_BUSY", { after_ms: 500 });      // 已被回收/接管：本次 close 作废，不返回 ok
    logEvent("close", t.id, null, `d ${lines}L / ${files.length}F`);
    return { ok: true, id: t.id, closedBy: mode === "rerun" ? "rerun" : "waive",
             runs: owned.length ? acceptanceRuns(t.id) : [], fingerprint: fp0,
             commits: owned.map(c => c.sha), lines, files: files.length };
  } catch (e) {
    lastFailCode = e.code ?? "E_INTERNAL";
    return fail(lastFailCode, e.data ?? { traceId: newId() });
  } finally {
    // R5：环境类失败（脏树 / BUSY / 超时）不累加轮次；其余失败累加，第 3 次转 parked
    const ENV_ONLY = new Set(["E_DIRTY_SCOPE", "E_BUSY", "E_TIMEOUT"]);   // 注意：E_CLAIM_STALE 是违规，不是环境问题
    const cur = getTask(taskId);
    if (cur.status === "doing" && cur.closing_at !== null && lastFailCode && !ENV_ONLY.has(lastFailCode)) {
      const n = cur.review_round + 1;
      updateTask(taskId, { review_round: n, ...(n >= 3 ? { status: "parked" } : {}) });
    }
    clearClosing(taskId, closeToken);                 // WHERE closing_token = token，防覆盖他人新 claim
  }
}
```

**不变量**：`closing_at` 在 `finally` 里必被清空；`review_round` 只在失败路径递增；`parked` 只能由系统置位、由 Owner 的 `task.reopen` 复位。