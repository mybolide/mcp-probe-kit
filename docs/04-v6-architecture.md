# v6 架构：把 v5 的实验收成一套体系

> v5（`mcp-probe-kit@5`，24 工具 / 118 action / 76 张 `dc_*` 表 / 5.6k 行 UI）是**实验版与过渡版**：它证明了「MCP 当项目主入口 + 本地 SQLite + 自带看板」这条路能走通，也暴露了代价——动作面太大、表太多、门禁可以绕过、控制台要人手动起。
>
> v6 不是 v5 的增量，而是**按 devflow 的内核重写一遍**：v5 只作为素材库（哪些能力真有人用）和反例（哪些坑不再踩）。老 v5 冻结为 legacy，数据一次性迁移，不做双向兼容。

## 1. 六条硬约束（v6 的验收线）

0. **两种接入面等价**：MCP（单工具 `devflow`）与 CLI（`devflow status/commit/close`）调同一套内核函数；`init --no-mcp` 是正式支持的模式，不是降级。
1. **一个进程**：一个 MCP server、一个端口、一个 `.mcp-probe-kit/state.db`；控制台由 MCP 全权托管（启动/杀掉重启/自愈/页面自轮询），人零操作。
2. **一个工具**：MCP 只暴露 `devflow`；动作用命名空间（`task.claim`、`req.approve`、`release.plan`、`ask`）。当前可用动作由 `bootstrap.actions` 按状态**渐进下发**，prompt 面永远只有十几个。
3. **门禁是内核，功能是插件**：所有写操作走同一条「契约冻结 → 归属判定 → 干净检出重跑 → 收口」；不存在绕过门禁的快捷 action。
4. **SQLite 是唯一真源**：Markdown 只是 `export` 快照；不接受「文档和库里各说各话」。
5. **控制台重写**：v5 的 5.6k 行 UI 不搬，但沿用它的设计语言（浅色、246px 侧栏、白色浮层、16px 圆角、#1769d2 主蓝）。五视图：收件箱、任务与覆盖、记忆、文档、证据（命令/退出码/HEAD/指纹）。
6. **协议不丢**：`initialize` 必须协商（认识就回显，不认识回落并声明支持列表），能力面只声明 `tools`。

## 2. 能力取舍

| v5 能力 | v6 处置 | 理由 |
|---|---|---|
| 需求 / 功能 / Bug / 任务 / 租约 | **保留重写**（现有 9 表 + R0–R5） | 这是纪律的主体 |
| 发布计划 release | **已实现**（`releases` + `release_tasks` + `release.*`，见 §4.6） | 有真实使用，但不该进内核 |
| 历史会话 / memory-cursor | **历史会话砍**；**memory 保留**（SQLite 真源 + Qdrant 可重建索引，见 §4.5） | 历史会话与客户端原生能力重复；坑库跨项目复用是真需求 |
| 代码分析 / git 代理 | **砍** | `devflow run -- <cmd>` + git 本身即可 |
| UI/UX 生成（palette / structure 检索） | **砍出内核**，独立工具包，不在 v6 主线 | 与研发纪律无关，体量最大 |
| 24 工具 / 118 action / 76 表 | **全部重来**：目标 ≤ 15 动作、≤ 15 表 | v5 的主要失败原因 |
| 无 git 的 workspace | **弱模式**：只跑验收 + 人工归属，`doctor` 标注 | 纪律的前提是归属可证，没 git 就降级 |

## 3. 数据模型（当前 9 表 + 规划）

现役：`requirements` `paths` `tasks` `bugs` `docs` `questions` `events` `runs` `patch_ids`，加上 release 插件的 `releases` / `release_tasks`，外加 `meta`（schema 版本、单调 ID、一次性 waive）。schema 版本已到 2（旧库自动补表）。

约定：
- ID 单调递增不复用（`FR-` `P-` `T-` `B-` `Q-` `D-`）；
- `runs` 存每次重跑的命令/退出码/HEAD/指纹/输出摘要，可复核；
- `events` 是审计流，`doctor` 用它抓「幽灵 done」。

规划：`releases`（beta）、`milestones`（按需），其余一律先不加。

另有一个**用户级**库（不随项目走）：`~/.mcp-probe-kit/memory.db`，见 §4.5。

## 4. 动作面

| 命名空间 | 动作 | 现在 |
|---|---|---|
| 引导 | `bootstrap` | ✅ |
| 任务 | `task.create` `task.claim` `task.close` | ✅ |
| 缺陷 | `bug.report` | ✅ |
| 协作 | `ask` | ✅ |
| 发布 | `release.create` `release.plan` `release.ship` | ✅ |
| 文档 | `devflow doc add/list`（CLI）+ 控制台文档视图 | ✅ |

**下一步由内核决定**（`src/digest.js`），优先级是固定的，不交给模型或人挑：

1. 有在办任务 → `task.close`（先收口）；
2. backlog 里依赖已满足的 → `task.claim`（按 ID 顺序，依赖未满足的进 `blockers`，并计入 `counts.blocked`）；
3. 需求验收还有没被任何任务覆盖的 → `task.create`，并在 `why` 里点名缺哪条、`args.deriveFrom` 给出索引；
4. 只剩阻塞任务 → `wait` + `next.blocked` 列表；
5. 等 Owner 批准 / 无待办 → `wait` / `task.create`。

`plan` 字段只在有缺口时出现：`[{ id, covered: "1/2", missing: ["…"] }]`。

`bootstrap.actions` 的推导规则（`src/digest.js::availableActions`）：

- 永远：`bootstrap`、`bug.report`；
- 有在办任务：`task.close`、`ask`（**不给** `task.create`，避免边做边拆）；
- 需求与 Path 都批准且无在办任务：`task.create`；有 backlog 再加 `task.claim`；
- 其余（等批准/等回答/parked）：只有基础动作。

Agent 侧纪律（`AGENTS.md` 与 MCP `instructions` 同源）：**只调用 `actions` 里出现的动作**。

### 4.5 通用记忆（memory）

目标只有一个：**在 A 项目踩过的坑，做 B 项目时能被检索出来**。

- **真源**：`~/.mcp-probe-kit/memory.db`（SQLite，一张 `pitfalls` 表：`project/title/symptom/fix/tags/index_state/hits`）。
- **索引**：Qdrant 集合 + embedding（`ollama` 或 `openai-compatible`）。向量只是缓存，**可从 SQLite 全量重建**（`devflow memory reindex`）。
- **通用，不按项目分区**：`project` 只是出处溯源，可空；`memory.write` 随时可用（不要求有任务）。
- **写入入口**：`memory.write`（主动记）+ `task.close`（失败过必须带 `resolvedBy`，否则 `E_NEED_RESOLUTION`，自动记一条 `kind=pitfall`）。一次过的任务不写卡。
- **资格判定（关键）**：不是所有问题都配进库。落库前过 `qualify()`：内容太短、没有可观测信号（错误码/报错/断言）、解法是一次性手滑（拼写/漏文件/改名）、写死了本项目私有路径 → 一律进**隔离区**（`status=candidate`），**不建索引、不参与召回**。`project` 只用于过滤，不用于分区。
- **去重**：标题规范化后相同 → 合并；向量可用时还会做语义去重（top-1 相似度 ≥ `MEMORY_DEDUPE_SCORE`，默认 0.9 → 合并正文/标签、`hits+1`，不新增条目）。候选遇到合格经验会随合并自动晋升。
- **晋升/降级**：`devflow memory promote|demote M-xxx`（Owner 操作）。晋升时补建索引。
- **Owner 面**：控制台收件箱直接列出「待提炼的记忆」，可以**改一句话再收进记忆**（`memory.edit`，自动晋升并建索引）或丢弃（`memory.drop`）。
- **不合格不是丢弃，是要求改写**：命中隔离区时，`task.close` / `memory.write` 的返回里带 `E_MEMORY_CANDIDATE` 与模板「当出现 X 时，用 Y（原因：Z）」。Agent 按模板重写后用 `kind=howto` 再 `memory.write` 一次即合格——隔离区因此是**待提炼区**，不是垃圾场。
- **读取**：`bootstrap.pitfalls` 注入当前任务命中的 top 3；`pitfall.search` 显式查；命中 `hits++`，越常用越靠前。
- **降级**：向量栈不可用时检索退化为关键词（中文 bigram + LIKE），`bootstrap` 照常工作、收口照常通过（`index_state=failed`，`doctor` 会提示）。
- **治理**：Agent 只写不改；Owner 在 CLI/控制台软删（`devflow memory delete`）。

环境变量（沿用 v5 命名，便于老配置迁移）：

| 变量 | 默认 |
|---|---|
| `MEMORY_EMBEDDING_PROVIDER` | `ollama`（或 `openai-compatible`） |
| `MEMORY_EMBEDDING_URL` | `http://127.0.0.1:11434`（openai 时 `…/v1`） |
| `MEMORY_EMBEDDING_MODEL` | `nomic-embed-text` |
| `MEMORY_QDRANT_URL` / `MEMORY_QDRANT_COLLECTION` | `http://127.0.0.1:6333` / `devflow_pitfalls` |
| `MCP_PROBE_KIT_MEMORY` | `on`（`off` 时既不强制 resolvedBy，也不落坑） |
| `MCP_PROBE_KIT_MEMORY_DB` | `~/.mcp-probe-kit/memory.db` |
| `MEMORY_MIN_SCORE` / `MEMORY_TIMEOUT_MS` | `0.55` / `2500` |

### 4.6 发布门禁（release）

- `release.create` 先建一个**草稿发布**（`planned`，可带 target date）；没挂任务的草稿不会出现在 `bootstrap.release`（不制造噪音）。
- `release.plan` 把任务挂进来（`building`），任务可以跨需求。
- `release.ship` 是门禁：**至少挂一个任务**（否则 `E_RELEASE_EMPTY`）、**全部任务 done**（否则 `E_RELEASE_OPEN`，返回 `pending[]`）。已发布不能重复 ship（`E_ILLEGAL_TRANSITION`）。
- `bootstrap.release` 只在有进行中的发布时出现：`{ id, status, pending, tasks[], ready }`，`ready=true` 就是可以 ship。
- Owner 在控制台「发布」视图点 ship（`release.ship` owner action）。

## 5. 协议

`src/protocol.js`：`SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"]`，`LATEST_PROTOCOL = 2025-06-18`。
`initialize` 回显客户端版本（若支持），否则回落 `LATEST` 并在 `_meta.negotiated=false`、`_meta.supported` 里说明；未知版本不报错。
v5 的 `2026-07-28` dual-era 属于待办：等客户端普遍升级后再加，加的时候只改这一处。

## 6. 版本与目录

- 包版本：`6.0.0-alpha.N`（`src/protocol.js::VERSION` 与 `package.json` 同步）。
- 数据目录：`.mcp-probe-kit/`（`state.db` / `contracts/` / `runs/` / `r2-wt/` / `console.lock`）。
- 契约真源：`.mcp-probe-kit/contracts/<pathId>.json` 提交进 git；数据库只存哈希与前移后的 commit。
- 控制台端口：`7373` 起 12 次探测，本机 `127.0.0.1`；自己的实例杀掉重启、别人的跳过（v5 的策略）。
- **配置随仓库走**：`init` 检测 `.mcp.json` / `.cursor/mcp.json` / `opencode.json` 里的 `MCP_PROBE_KIT_ROOT` 与本项目是否一致，不一致就按新路径重写（保留其他 server，解析失败则不动）。
- **多项目**：`devflow serve --project <path>` 可重复；`/api/state?project=<root>` 按项目取快照，`/api/owner` 带 `project` 落到对应仓库；侧栏切换，选择存 localStorage。
- **弱模式**（无 git）：`devflow init --weak` 把 `meta.mode` 记为 `weak`；契约只存在工作树（`contract_commit` 为 null），`base_head` 为空，close 跳过 R0/R1/R4 与脏树检查，只做 R2 重跑 + 指纹漂移；`doctor` 报 `WEAK_MODE`，`devflow commit` 返回 `E_WEAK_NO_GIT`。

## 7. 迁移（v5 → v6）

一次性脚本，只读 v5 库、写 v6 库、失败不写：

1. `v5: requirements/features → v6: requirements`（status 映射：`draft→draft`，`approved/building→approved`，其余归档）；
2. `v5: bugs → v6: bugs`（保留 repro/severity/source）；
3. `v5: releases → v6: releases`（beta 期才写）；
4. 不迁：AI 记忆、历史会话、UI 生成产物（它们在新体系里不是「事实」）；
5. 迁移完成后在 v5 库里写一条 `migrated_to_v6_at`，v5 只读。

在 beta 之前不做自动迁移入口，只提供 `scripts/v5-import.mjs --dry-run`。

## 8. 分期与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| v6-alpha | 内核（门禁/契约/归属/重跑）+ 协议协商 + 渐进动作面 + 控制台自启 | `npm test` 全绿；一个真实项目跑通 request→approve→claim→commit→close |
| v6-beta | release 插件 ✅、docs 注册与漂移 ✅、控制台五视图 ✅、v5 记忆迁移 dry-run ✅ | 迁移后 `doctor` 无 error；v5 数据可查 |
| v6-1.0 | 多项目切换 ✅、弱模式（无 git）✅、归档/导出（`devflow export` 已有） | 两个项目并行、一个无 git 项目走弱模式 |

## 9. 非目标（写下来是为了不再讨论）

- 不做云同步、不做多租户、不做账号体系；
- 不做 worktree 默认隔离（只有 R2 重跑用临时 worktree）；
- 不做审批链、不做租约恢复；
- 不在 v6 里兼容 v5 的工具名（谁要旧接口就继续用 v5）。