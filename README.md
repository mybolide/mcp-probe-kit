# mcp-probe-kit v6 — 研发纪律内核

让 Claude Code / Codex CLI / Cursor / OpenCode 这些编码 Agent 在**同一套规则**里干活：
改代码前必须领任务、只能改 scope 内的文件、交付必须能在一个干净检出里重跑通过。
人只做三件事：**收件、批准、放行**；工序由 Agent 自己走完。

- **v5 记忆迁移**：`node scripts/v5-import.mjs --qdrant http://127.0.0.1:6333 --collection <v5集合>`（默认 dry-run，加 `--write` 才落库）。
- **下一步由内核决定**：`bootstrap.next` 按「收口 > 依赖已满足的 backlog > 补齐未覆盖的验收 > 等阻塞」排序；人只负责批准和放行。
- 事实源只有一份：`.mcp-probe-kit/state.db`（SQLite 单文件，WAL）。**不用 md 当事实源**，`mcp-probe-kit export` 只是只读快照。
- 契约真源在 git：`.mcp-probe-kit/contracts/<pathId>.json`，Owner 批准时写入并提交，Agent 只读。
- 这个仓库是 **v6**（`6.0.0-alpha.N`）：用这套内核重写整套体系。v5（`v5` 分支）是实验/过渡版，已冻结。
- 分支约定：`main` = v4 稳定线，`v5` = 实验版，`v6` = 本分支。
- 纪律判定口径见 `docs/03-discipline-core.md`（v8.8），v6 的取舍/协议/分期见 `docs/04-v6-architecture.md`。

---

## 1. 安装

```bash
# Node ≥ 22.5（需要内置 node:sqlite 的 DatabaseSync），git ≥ 2.30
node -v && git --version

cd mcp-probe-kit
npm link            # 之后任意目录可用 mcp-probe-kit
# 或者不 link，直接用绝对路径：node /path/to/mcp-probe-kit/bin/mcp-probe-kit.js ...
```

无需 build、无运行时依赖、不联网。

## 2. 在项目里初始化

**两种接入方式，任选**：

| 方式 | 命令 | 得到什么 | 代价 |
|---|---|---|---|
| MCP（推荐） | `mcp-probe-kit init` | Agent 在会话里直接调 `mcp-probe-kit` 工具；控制台随连接自动拉起；纪律随 `instructions` 下发 | 要在客户端注册一次（init 帮你写四端配置） |
| 纯 CLI | `mcp-probe-kit init --no-mcp` | 同样的门禁与证据链，Agent 走 `mcp-probe-kit status/commit/close` | 控制台要自己 `mcp-probe-kit serve`；工具说明靠 `AGENTS.md` |

**MCP 不是必需的**：内核的状态、契约、门禁、证据全在 `.mcp-probe-kit/state.db` + git 里，CLI 与 MCP 走的是同一套函数。MCP 只是让 Agent 不必调 shell，并把控制台生命周期挂上去。

### 初始化细节

```bash
cd <你的仓库>
mcp-probe-kit init
```

`init` 做五件事：

1. 建 `.mcp-probe-kit/`（`state.db` / `contracts/` / `runs/`），并把 `state.db*`、`runs/`、`r2-wt/` 写进 `.gitignore`。
2. 为仓库里每个顶层目录建一条 **Path 草稿**（`allowed_paths` + 预算 + 测试命令），状态 `draft`，等 Owner 批准。
3. 写四端 MCP 配置（指向本机的 `bin/mcp-probe-kit.js`，并带上 `MCP_PROBE_KIT_ROOT`）：
   `.mcp.json`（Claude Code）、`.cursor/mcp.json`（Cursor）、`opencode.json`（OpenCode）；Codex 的 `~/.codex/config.toml` 片段会打印出来，手动贴一次。
4. 在 `AGENTS.md` 里追加一段 `<!-- mcp-probe-kit:begin -->` 标记块，告诉 Agent 先 `bootstrap`、改代码前 `claim`、不许改验收。
5. 不需要你启动控制台：客户端一连上 MCP，控制台就会自动拉起/复用（见 3.3）。

`init` 会把上面这些自己写的文件**提交**成 `chore(mcp-probe-kit): init`，否则第一次 `close` 会被 `E_DIRTY_SCOPE` 拦住。
仓库被移动/复制后再跑一次 `init`：检测到 `.mcp.json` 里的 `MCP_PROBE_KIT_ROOT` 指向旧路径会**自动按新路径重写**，并保留你其他的 MCP server。

## 3. 两条工作流

### 3.1 Agent（MCP 或 CLI 等价）

MCP 只有一个工具 `mcp-probe-kit`，六个动作：

| action | 用途 | 关键约束 |
|---|---|---|
| `bootstrap` | 开局定向：**`next`（内核排好的下一件事）** + `actions` + `plan`（未覆盖的验收）+ 控制台地址 | 第一个动作必须是它；照 `next` 做，不自己挑 |
| `task.create` | 拆任务（scope / 验收 / 依赖 / 预算） | 验收命令必须落在 Path 契约白名单内 |
| `task.claim` | 领任务（45 分钟租约，WIP=1） | 与其他在办任务 scope 相交会被拒 |
| `task.close` | 收口：R0–R5，干净检出里重跑验收 | 有交付提交、全部断言 exit 0 才 `done` |
| `bug.report` | 报 Bug（现象 + 复现步骤） | 不能直接改代码 |
| `ask` | 歧义就问，不猜 | 问完任务 `parked`，Owner 回答后回到队列 |
| `memory.write` | 随时记一条通用经验（坑 / 解法 / 约定 / 片段） | 不合格会进隔离区并给出改写模板 |
| `memory.search` | 查通用记忆（跨项目） | 只读；命中累计 `hits` |
| `release.create` / `release.plan` / `release.ship` | 发布：一组任务全 done 才能 ship | 空发布 / 有未完成任务都会被拦 |

CLI 等价（不接 MCP 的客户端用这条）：

```bash
mcp-probe-kit status                     # = bootstrap
mcp-probe-kit commit -m "feat: ..."      # 只提交 scope 内文件，自动写 Task-Id / Devflow-Base trailer
mcp-probe-kit close                      # = task.close（默认取当前 actor 手上唯一在办任务）
mcp-probe-kit run -- npm test            # 采证执行，记录退出码与耗时
```

Agent 的典型一轮：

```text
bootstrap → task.claim(T-003) → 改代码 → mcp-probe-kit commit -m "..." → task.close
                                                          ↑ 内核在 .mcp-probe-kit/r2-wt 干净检出里重跑验收
```

### 3.2 Owner（只在控制台）

控制台**不用你自己起**：MCP 连上就自动拉起（见 3.3）。要手动常驻也可以：

```bash
mcp-probe-kit serve            # 前台常驻，http://127.0.0.1:7373
mcp-probe-kit serve --stop     # 停掉本项目自己的控制台（不会误杀别的项目）
```

九个 Owner 动作，**不进 MCP、不进 Agent CLI**：

`intake`（收需求/Bug）、`approve`（需求 + Path 一起冻结并提交契约）、`amend`（改验收或路径，在办任务自动回 backlog）、
`adjust`（改 scope/预算）、`reopen`（打回）、`decide`（Bug 采纳/驳回）、`answer`（回答问题，任务回队列）、
`override`（放行某个拦截码，一次性；或`force-close`）、`handoff`（生成交接卡，可粘给另一个 Agent）。

控制台是五个视图（侧栏切换）：**收件箱**（待批准需求 / 待回答提问 / 待裁决 Bug / parked 任务 / 待提炼记忆）、**任务与覆盖**、**发布**、**记忆**、**文档**、**证据**（每次重跑的命令/退出码/HEAD/指纹）。

### 3.3 控制台由 MCP 全权托管（和 v5 一样，人不用启动也不用重启）

MCP 连接就是控制台的生命周期触发器。`runMcp` 启动时调用 `ensureConsole(root)`：

1. 拿本项目锁 `.mcp-probe-kit/console.lock`（`wx` 独占创建，持锁进程死了或超过 30s 自动回收），并发 MCP 不会被互相踩；
2. 从 `MCP_PROBE_KIT_PORT`/`7373` 起逐个探测 `GET /api/meta`：
   - **是本项目自己的实例** → `SIGTERM` 杀掉、等端口释放，再用当前代码重启（同一端口）。这样升级后不会留旧进程在跑；
   - **是别的项目** → 绝不杀，换下一个端口；
   - **被非 mcp-probe-kit 服务占着** → 换下一个端口；
   - **空端口** → 直接起；
3. 新进程 `detached`，日志在 `$TMPDIR/mcp-probe-kit-console-<项目哈希>.log`，MCP 退出不影响页面；
4. `bootstrap` 把地址放进 `console` 字段，Agent 转告 Owner；`AGENTS.md` 里已写明。

没有人需要按的那几个按钮：

- **不用启动**：MCP 连上就有；
- **不用重启**：控制台被停掉/崩了，下一次 `bootstrap` 发现地址死了就**就地重建**（自愈）；
- **不用刷新页面**：控制台页面每 4s 自轮询，断线时显示「重连中…」，恢复后自己回到「已连接」；
- **不会互相杀**：刚起来 10s 内的自己人复用不重启（`MCP_PROBE_KIT_RESTART_GRACE_MS`），避免多个 MCP 连续启动把页面刷来刷去。

两个刻意的取舍：

- **独立进程**：MCP 重启不打断阅读；代价是进程活到你 `mcp-probe-kit serve --stop` 或重启机器。
- **没有实例注册表**：v5 还维护 `workspace-runtime` 记录 + 版本握手，mcp-probe-kit 只靠 `/api/meta` 里的 `root/pid/startedAt` 做身份判断——少一个可能失配的状态文件。


开关：`MCP_PROBE_KIT_CONSOLE=0` 关掉自动拉起；`MCP_PROBE_KIT_PORT=<n>` 换起始端口；`MCP_PROBE_KIT_RESTART_GRACE_MS=<ms>` 调宽限期。

### 3.4 通用记忆（memory）

**在 A 项目踩过的坑，做 B 项目时要能被检索出来**——这是 v5 memory 的真实价值，v6 保留，但换了实现：

- 真源是 `~/.mcp-probe-kit/memory.db`（一张 `pitfalls` 表）；Qdrant 只是**可重建的向量索引**，挂了不丢数据。
- 写：`memory.write` 随时可用（不要求有任务）；`task.close` 失败过必须带 `resolvedBy`（否则 `E_NEED_RESOLUTION`），内核自动记一条 pitfall。
- **不是所有问题都配进库**：内容太短、没有可观测信号、解法是一次性手滑（拼写/漏文件/改名）、写死本项目私有路径 → 进**隔离区**（`candidate`），不建索引、不召回；`mcp-probe-kit memory promote M-xxx` 才晋升。标题相同自动去重。
- 读：`bootstrap.memories` 注入当前任务命中的 top 3；`memory.search` 显式查。
- 不合格不是丢掉：命中隔离区时返回 `E_MEMORY_CANDIDATE` + 模板「当出现 X 时，用 Y（原因：Z）」，按模板用 `kind=howto` 重写一次即入库。
- 去重：标题相同直接合并；向量可用时按相似度（默认 ≥0.9）合并，不新增条目。
- 控制台收件箱会列出「待提炼的记忆」，改一句话点「收进记忆」即晋升并建索引。
- 降级：向量栈不可用 → 关键词检索（中文 bigram + LIKE），收口照常通过，`doctor` 报 `MEMORY_INDEX_FAILED`。

```bash
mcp-probe-kit memory status                    # 有多少坑、索引状态、连的哪个 embedding/Qdrant
mcp-probe-kit memory search "worktree 提交丢失"  # 跨项目检索
mcp-probe-kit close --resolved-by "r2-wt 是 detached，提交后要 cherry-pick 回主分支"
mcp-probe-kit memory reindex                   # 向量库重建（数据不丢）
mcp-probe-kit release create "v0.1" --target 2026-12-01   # 发布：plan 挂任务，ship 全部 done 才放行
mcp-probe-kit release plan R-001 T-003 T-004
mcp-probe-kit release list
```

| env | 默认 |
|---|---|
| `MEMORY_EMBEDDING_PROVIDER` / `MEMORY_EMBEDDING_URL` / `MEMORY_EMBEDDING_MODEL` | `ollama` / `http://127.0.0.1:11434` / `nomic-embed-text` |
| `MEMORY_QDRANT_URL` / `MEMORY_QDRANT_COLLECTION` | `http://127.0.0.1:6333` / `mcp-probe-kit_memory` |
| `MCP_PROBE_KIT_MEMORY` / `MCP_PROBE_KIT_MEMORY_DB` | `on` / `~/.mcp-probe-kit/memory.db` |

## 4. 拦截点（这就是"法"）

`task.close` 按顺序判定，任一失败即返回错误码并写事件：

| 阶段 | 检查 |
|---|---|
| R0 | 区间内有没有交付提交；有没有**无主提交**（既没有本任务 trailer、也不是他人带 trailer 的正常提交） |
| R1 | 越界文件、未登记新增文件、行数预算（任务级 + Path 累计）、新增 TODO 未带任务号、改测试配置、改依赖/测试目录 |
| R2 | 在 `.mcp-probe-kit/r2-wt` 干净检出中逐条重跑验收断言（600s 超时，`node_modules` 通过软链复用） |
| R3 | 重跑期间 HEAD 或 scope 指纹漂移 → `E_EVIDENCE_DRIFT` |
| R4 | 归属提交不在 HEAD 祖先链上 → `E_UNMERGED_WORK` |
| 收口 | 状态 CAS 写入 `done`；消费一次性 waive；写 `close` 事件 |

失败计数规则：环境类（`E_DIRTY_SCOPE` / `E_BUSY` / `E_TIMEOUT`）**不计** `review_round`；其余失败累计，3 次自动 `parked`，等 Owner `reopen`。

### 错误码

| 码 | 含义 |
|---|---|
| `E_NOT_REPO` / `E_SCHEMA_NEWER` / `E_ID_EXHAUSTED` | 环境与版本 |
| `E_NEED_APPROVED` / `E_NO_CONTRACT` / `E_CONTRACT` / `E_HASH_MISMATCH` | 契约没批、契约缺失、契约被改、哈希不符 |
| `E_ILLEGAL_TRANSITION` / `E_CLAIM_STALE` / `E_CLAIMED_BY_OTHER` / `E_WIP_LIMIT` / `E_SCOPE_OVERLAP` / `E_DEP_OPEN` | 状态与并发 |
| `E_SCOPE_TOO_BROAD` / `E_FILE_TOO_LARGE` | 任务切分过大 |
| `E_UNOWNED_COMMIT` / `E_NO_DELIVERY` | 提交归属 |
| `E_SCOPE_VIOLATION` / `E_UNREGISTERED_FILES` / `E_DIFF_BUDGET` / `E_LINT_TODO` / `E_TEST_CONFIG_TOUCH` / `E_DEP_OR_TEST_TOUCH` | R1 |
| `E_ASSERTION_FAILED` / `E_TIMEOUT` / `E_EVIDENCE_DRIFT` / `E_UNMERGED_WORK` | R2–R4 |
| `E_DIRTY_SCOPE` / `E_BUSY` | 环境类，不计轮次 |
| `E_INTERNAL` | 兜底 |

## 5. 数据模型（9 表 + meta）

`requirements` `paths` `tasks` `bugs` `docs` `questions` `events` `runs` `patch_ids`，外加 `meta`（schema 版本、单调 ID 计数器、一次性 waive 标记）。

- ID 单调递增不复用：`FR-xxx` / `P-xxx` / `T-xxx` / `B-xxx` / `Q-xxx` / `D-xxx`。
- `runs` 存每次验收重跑的命令、退出码、HEAD、指纹、输出（截断 20k）、耗时——可复核。
- 唯一可写入口是内核函数；库里出现 `done` 却没有 `close` 事件，`mcp-probe-kit doctor` 会报 `GHOST_DONE`。

## 6. 自检

```bash
npm test          # 42 条集成测试：门禁 6 + memory 3 + Owner/MCP(自启/协议/动作面/断线)/控制台/--stop/CLI/amend
mcp-probe-kit doctor    # 幽灵 done / 未落地提交 / 悬空 claim / 卡住的 close / 文档漂移 / 脏工作树
mcp-probe-kit export    # markdown 快照（只读，别拿去改状态）
```

测试会真的建临时 git 仓库、真的跑 `close`、真的起一个 MCP stdio 进程和一个 HTTP 控制台，不 mock。

## 7. 与设计文档的对应

| 文档（docs/03 v8.8） | 代码 |
|---|---|
| §4 数据模型、ID 单调、事件日志 | `src/db.js` |
| §5 Path 契约（批准即提交、只从 git 读） | `src/contract.js`、`src/store.js::reqApprove` |
| §6 R0–R5 判定 | `src/gates.js::taskClose` |
| §7 归属判定（trailer / patch-id / 时间窗 / scope） | `src/gates.js::decorate/validOwner`、`src/git.js::trailers/patchId` |
| §8 失败计数与 parked | `src/gates.js::taskClose` finally 块 |
| §9 Owner 面（九动作） | `src/store.js` + `src/console.js` + `public/index.html` |
| 控制台随 MCP 自启（对齐 v5） | `src/console-boot.js`、`src/mcp.js::runMcp` |
| §10 Agent 面（单工具六动作） | `src/mcp.js` |
| §11 对账与导出 | `src/report.js` |

## 8. M0-lite 明确没做（不是漏，是这一版不做）

- patch-id 兜底只用于「本任务历史提交被 rebase」的识别，不做跨分支 cherry-pick 的完整归并证明。
- 新增文件必须在 `task.scope` 里**显式列出**，或由 Path 的 `allow_new_files` 放行；`allow_new_files` 目前只能在建 Path 时设定（控制台没给开关）。
- 默认不用 worktree 隔离开发，只有 R2 重跑用临时 worktree。
- 没有审批链、没有租约恢复、没有多 Owner。Owner 是单人。
- 控制台只有本地 HTTP，不做登录、不做远程访问（`127.0.0.1`）。
- `amend` 把 Path 打回 `draft` 时，控制台只提示、不提供一键重批按钮（用 `approve` 重建）。