<!-- v5-agent-action-guide:start -->
> **当前 v5 Agent 调用提示**：主 MCP 只有一个 `devcontrol` 研发管理工具，包含 **84 个 SQLite action（含零副作用 `guide` 导航）**。不知道怎样调用时先用
> `{"action":"guide","input":{"intent":"feature"}}`（无需 project_root），然后根据返回的示例与真实 Git 项目合同调用下一步。
> [完整 Agent 调用指南](v5-agent-action-guide.md) · [官网导航页](pages/v5-action-guide.html)。启动自动检查并同步 Skill / AGENTS.md 的指导修订号，保留用户规则。
<!-- v5-agent-action-guide:end -->

# MCP Probe Kit v5 — SQLite + DevControl 唯一研发流程

> **DevControl v5 工作台已按单 Git 项目重构**：八个一级菜单（工作台、需求管理、技术架构、任务管理、Bug 管理、历史会话、研发指南、设置），使用轻量编译资源、原生 Hash 路由与**只更新任务数据**的定时同步，不刷新整页。详见 [轻量工作台实现与安全边界](v5-workbench.md)。

> **2026-10-28 开发状态**：这是当前 `feature/devcontrol-project-task-ledger` 分支的**破坏性重构**，不是已发布的 npm 5.0.0。公开 `4.1.1` 是独立稳定旧版本。本阶段已经建立新的对外接口与存储硬边界，旧项目迁移和全量回归尚未完成。

## 唯一研发管理架构

| 领域 | 唯一权威 | 管理内容 |
|---|---|---|
| SQLite DevControl `dc_*` | 项目本地数据库 | 需求、Feature、Bug、Idea、版本、任务、依赖、租约、审批、决策、验收证据与 Gate |
| SQLite History `hs_*` | 同一个项目数据库的独立表 | 用户原话、历史检查点、会话交接与恢复 |
| Git | 应用仓库 | 真正的源码、正式 PRD、ADR、API、Schema、安全设计文档 |
| 应用业务数据库 | 应用自己的 PostgreSQL 等 | 业务数据，与研发过程账本隔离 |
| 可选 Memory | Qdrant | 经验证的跨项目知识，不拥有任务状态与审批 |

**Node.js 22+ 是 v5 的运行前提，Git 可选，项目根目录是 MCP 工作区。** 新项目数据库位于 `.mcp-probe-kit/state/devcontrol.sqlite3`；已有 Neyna 项目保留 `.neyna/state/devcontrol.sqlite3`。数据库、WAL、SHM、活跃租约与机密不能提交 Git。

**正式研发数据并不等于把所有原始文档自动同步到 SQLite。**
需求、Feature、任务、审批和验收的正式管理状态保存在 `dc_*`；
History 的新会话检查点写入 `hs_*`，并不实时生成或反向同步 Markdown。
但受控的正式 PRD、ADR、API、Schema、版本范围说明等仍可保留在 Git
工作目录，已批准的版本计划可能将 `scopeSource` 指向其中某份文档，
并在 SQLite 保存其 SHA-256。MCP 在计划复审/执行时重新读取这份源文件
验证哈希，并没有用可编辑的本地历史文件覆盖数据库任务。
已有 `docs/history-session/N.md` 是旧 History 导入原件或归档，不等于
现行 History 同时写入 SQLite 和 Markdown；对原件的本机豁免也不等于
绕过对正式需求来源和真实测试证据的校验。

**时间显示约定。** DevControl 工作台、任务看板、History、Bug/Feature 详情、
审核事件和同步时间统一按北京时间（`Asia/Shanghai`，UTC+8）展示，
与浏览器或运行主机时区无关。SQLite 与 API 继续保留带时区的 UTC
原始时刻，保证审计先后顺序、Gate、任务租约及跨机器比较正确；
原始 JSON 导出和日志不会为了页面展示而篡改时间戳。

## 启动检查与 Agent 指引自动同步

MCP 每次启动时，若能识别真实 Git 业务项目，就检查
`.agents/skills/mcp-probe-kit/SKILL.md` 和 `AGENTS.md` 中的 MCP
托管区；内容缺失、版本过旧，或者**同为 v5.0.0 但指导修订号过期**
都会自动同步。启动无法定位项目时，不向 MCP 安装目录写入文件；
首次 `devcontrol` 调用传入明确的 `project_root` 后补做检查。

Monorepo 中若 MCP 进程的 cwd 指向子仓库，而希望统一管理父仓库，可在
MCP 服务配置中设置绝对路径 `MCP_PROJECT_ROOT=/ABSOLUTE/PARENT/REPO`。
项目根目录选择顺序是工具参数 `project_root`、明确配置的
`MCP_PROJECT_ROOT`、其他用户工作区覆盖、客户端
`WORKSPACE_FOLDER_PATHS`、cwd 等自动探测。配置的
`MCP_PROJECT_ROOT` 无效时启动会报错并拒绝回退写入子目录。
启动 stderr 会显示 `workspace=...` 和 `source=explicit-env`。
Cursor、Claude 及其他自动生成的 Harness 规则只提示使用 v5
`devcontrol`，不建议从当前工作目录再次安装。

### 同一个工作区的多个独立 Git 仓库

DevControl v5 允许一个显式工作区根目录及一个 SQLite 账本管理多个独立
Git 仓库，包括根 `.gitignore` 排除的子仓库和独立 `.git` 文件的 Worktree。
自动发现对工作区前三层目录采用有界、无符号链接遍历；更深层的仓库
必须位于冻结任务的明确路径前缀下。常见依赖和编译产物目录不自动发现。
找不到、被替换或改写历史的仓库不能用根 Git 提交替代它的代码证据。

任务领取会冻结各仓库 Git 元数据身份及独立 Base SHA。提交检查按每个
Git index 获取真实文件清单，并将文件名统一表示成工作区相对路径。
任务完成报告另外保存各仓库 HEAD 快照及 SHA-256 摘要；测试证据和
Gate Review 必须与对应的完整提交快照一致。验收前重新检查所有仓库的
版本、提交祖先关系、原始文件范围、未提交修改及证据摘要；根 Git 的
gitlink 只能作为引用，不能代替子仓库文件级审计。

`devcontrol hook-install` 会先审查所有发现的 Git 仓库的 Hook 位置。
只在没有 Hook 的仓库安装，并统一指向父项目根账本；如果任何仓库
已有团队 Hook 且不能安全接入，整个安装会先拒绝，不覆盖原有 Hook。
Git Hook 仅为本地提示，CI 与最终 DevControl 验收仍需独立检查。

**旧活动任务的 Owner 授权迁移。** 旧的单仓库任务继续沿用原格式。
如果升级前的任务已处于 `in_progress` 或 `in_review`，原租约已过期，
并且已有多个独立 Git 仓库，可使用带显式审核开关的
`devcontrol recover-task`。异常迁移需要
`explicitAuthorization: true`、负责人的 `actor`、具体 `reason` 和
`preserveExistingWorktree: true`、
`rebaselineLegacyRepositories: true`。这不是普通任务领取流程。
缺少授权、缺少任一开关、租约尚未过期或者重复迁移都会被拒绝。

迁移仅冻结原根仓库 Base 和当前根 HEAD，并为子仓库登记**迁移当时**
Git 身份与 HEAD。由于升级前没有子仓库历史 Base，绝不能将这个新
快照冒充旧任务最初领取时的 Git 证据。子仓库的历史已提交代码不会
自动算作恢复后交付，后续必须有实际的范围内提交、完成报告及
独立 Gate 审核。任务状态不会因迁移自动变成 Verified。

原始领取时的受保护工作树快照继续保留。原有文件必须逐字节一致；
新增的无关根仓库脏文件经过只读指纹检查后单独作为新的受保护快照，
后续仍会被验证。子仓库采用同一原则。任务范围内的未提交文件可
保留并在恢复后正常暂存、提交；范围外的普通已跟踪修改和未跟踪
文件则按每个独立 Git 仓库的身份及 SHA-256 单独存入只读保护快照。
任务完成、最终验收及写入 Verified 前都会重新检查这些文件。
受保护文件被修改、删除、暂存或新增了未经审核的范围外文件，
均不得视为任务交付，也不能通过验收。任一仓库存在 staged 文件、
符号链接、越界路径或原始受保护文件漂移时均拒绝迁移。所有租约轮换、
仓库基线、保护快照和审计事件在同一个 SQLite 事务中写入。该操作
绝不执行 stash、reset、checkout，也不会篡改任何用户文件。

**安全限制。** 当前多仓库流程尚不支持沿用原本只保存根 Git 的
Gate 延期和范围暂停功能。这两种操作会明确拒绝，不能靠重新执行
check 或直接修改 SQLite 绕过。未满足真实验收条件的任务始终保持未验证。

**合法恢复受保护文件到 Git HEAD。** 当受保护的已跟踪本地文件恢复为所在
Git 仓库 HEAD 的原始字节后，旧保护清单不应永久阻断任务完成登记。
Owner 可以在任务尚未产生完成报告时，使用 `refresh-protected-worktree`，
提交 \`id\`、\`actor\`、\`explicitAuthorization: true\` 和至少 30 字符的具体
\`reason\`。DevControl 只读检查原始 Git 身份、提交版本及剩余
受保护文件指纹。只有确实恢复到 HEAD 的 tracked 文件允许从当前有效
保护清单移出，原始领取和迁移快照保持不变；每次操作追加 SQLite
保护快照记录及审计事件。

该操作不执行 Git restore、stash、reset 或任何用户文件写入，
也不更改任务租约、范围、测试或 Gate。staged 内容、软链、越界路径、
新出现的无关修改、受保护的其他文件漂移、未跟踪文件丢失、Git 历史
不可信，以及已有完成报告，均会拒绝刷新。清空后的有效保护清单
仍必须在后续完成和验收中接受核验。

### 本地 worktree-ignore 与 Git ignore

每个独立 Git 仓库的真实 Git 目录下可选建
`info/devcontrol-worktree-ignore`，语法沿用 Git exclude patterns，
包括 Git worktree 使用 `.git` 文件的情况。该本地文件不加入 Git
提交，也不会更改标准 `.gitignore`、`.git/info/exclude` 或全局忽略。
DevControl 先执行 Git 标准忽略，再读取本机附加规则。**本机附加规则
不仅适用于 untracked，也适用于 Git 已跟踪、已修改和已暂存的文件。**
例如需要排除本机 AI 工具配置时，可以写入：

```gitignore
/AGENTS.md
/.agents/skills/mcp-probe-kit/SKILL.md
/.cursor/mcp.json
/docs/history-session/
```

规则只影响 DevControl 对本机工作树噪声的检查，不修改 Git 的 index、
tracked 状态或历史提交。只有明确配置的 AI 工具、编辑器设置与临时
输出，以及明确限定的旧 History 文本、索引或本机笔记可以豁免。
`/docs/history-session/` 只允许旧归档格式文件，而不是整个 `docs/**`；
正式 PRD、ADR、范围源文件、业务代码、冻结任务路径、软链、路径逃逸
和大文件**仍然禁止豁免**。即使暂存了豁免文件，Git 也不会自动将其移出索引；
提交任务代码时应仅提交实际批准的文件，不把本地配置混入任务交付。
本机豁免不代表 Git commit 内容获得豁免，也不会通过任何测试 Gate。
在领取、检查和完成/验收时，DevControl 将实际应用的豁免记录在
`dc_audit`，包括路径、规则文件和文件内容的 SHA-256，不保存私有
配置正文；历史原始 SHA-256 保护快照保留不变。

### 多仓库精确 delivery HEAD

一个工作区包含多个独立 Git 仓库时，`complete` 和 `report` 的
`input.deliveryHeads` 可以显式传入各仓库**实际交付提交**的完整映射。
例如 `{"": "ROOT_DELIVERY_SHA", "service": "CHILD_DELIVERY_SHA"}`，
键必须覆盖所有发现的仓库，其中空字符串是根仓库。这是说明结构，
实际 SHA 必须是合法提交值。完成报告保存交付版本向量和摘要，
证据与正式验收记录均绑定原 Git 提交。普通任务只需一次带完整 acceptance 的 verify；旧 self-review、gate-review 记录仅用于历史兼容。
后续无关合并可以前进 HEAD，但不能追加进原交付文件列表。后续 Merge
必须只相对第一父检查实际集成的更改，不能因第二父没有旧文件而误判。
若第一父合并差异或后续主线提交真实触及冻结范围，即使最终又恢复
原内容，旧证据也必须拒绝；交付提交不再是当前 HEAD 的祖先时同样拒绝。
不能把当前合并后的 HEAD 默认为过去交付的版本。

MCP 自动生成的 Skill 和 AGENTS.md 若内容与生成器在对应提交
的预期完全一致，属于受管理的规则维护，可以和合法业务文件一起
暂存与提交，不作为业务交付文件计入验收范围。同名的手工修改、
生成器版本不匹配或其他目录文件仍按正常冻结范围拒绝。

Skill 自动生成源码定义的 DevControl 操作索引（含只读 guide），以及需求→设计→
原子任务、独立审批、外部 Gate 证据、SQLite History 的执行规范。
AGENTS.md 提供简短入口，**只更新受管理的 MCP 区块**，保留项目其他
自定义规则。同版本、同修订内容重复启动不改写文件；旧 MCP 不降级
覆盖更高版本指导。可通过本地 `probe status` 与
`probe install-agent --project-root /ABSOLUTE/GIT/PROJECT` 诊断、
修复，不需要自动从公网下载未发布的 v5。

## 主 MCP 唯一任务入口

主 MCP 提供 `devcontrol`，入参为 `{action, project_root, input}`。`project_root` 是要开发的**业务 Git 项目**，并非 MCP 自己的源码仓库：

```json
{
  "action": "next",
  "project_root": "/ABSOLUTE/PATH/TO/APPLICATION/GIT-PROJECT",
  "input": {}
}
```

完整研发路径：新会话先恢复 History 和已批准的任务及依赖，需求和架构明确后，当前 AI 领取单一可验收任务，实际编码、测试并提交 Git，再通过 complete/report 登记真实证据。任务处于 in_review 时，调用一次 verify，携带 acceptance 的证据引用、具体技术自审结论以及每个真实 Gate 的证据与检查结论。DevControl 在一个 SQLite 事务中核对冻结目标、Git 版本和全部真实验收条件并登记 Verified，不再要求依次调用 self-review、gate-review、verify 三个管理动作。旧三步仅作历史兼容。真机 Gate 缺失不能自动通过，前置任务未验收仍不得领取后续任务。不需要其他 Agent 或常在线权威主机。

**生成规则同步检查（每次 MCP 研发修改都必须做）**：检查实际业务流程是否改变，核对 `src/lib/v5-sqlite-guidance.ts`（Skill/AGENTS.md）、`src/lib/v5-agent-action-reference.ts`、`src/lib/harness-adapters.ts`、`src/lib/workflow-skill-installer.ts` 的生成与写入规则；如规则改变，应更新 `SKILL_GUIDANCE_REVISION`。运行 `verify-workflow-skill` 和 Skill/AGENTS bootstrap 回归，确认旧版同版本托管块会被更新，用户自定义 AGENTS.md 内容不会覆盖，第二次启动保持幂等。`prebuild` 自动运行一致性检查及 Skill 同步，但不应自动重写其他开发者正在工作的真实项目文件。

Feature、Bug、Idea、范围变更、架构保护与决策通过相同 `devcontrol` 工具的对应 `action` 进入项目 SQLite。**DevControl 只管理状态与验证契约，Agent 自己分析需求、写代码、独立审核、执行真正的测试和业务 SQL。** 未实际运行的 Gate 不算通过。

## 不再支持 v4 文件式研发过程

`start_feature`、`start_bugfix`、`start_ui`、`workflow`、`plan_heartbeat`、`resume_plan`、`converge`、`init_project_context`、`add_feature`、`check_spec` 和 `interview` 等旧流程入口已从 v5 MCP/CLI 对外工具面移除；即使 `MCP_TOOLSET=full` 也无法重新调用它们。

保留的代码洞察、架构分析、测试建议、代码审查、Git 和独立 UI 工具都是**辅助工程能力**，不得建立或更新第二套正式任务状态。

当前 Registry 工具面为：**10 基础工具 + 5 SQLite History = 默认 15；配置 Memory 后 21；full 为 24 个活跃模型工具**。另有 1 个 App-only Memory 操作。项目研发过程通过一个统一 DevControl MCP 工具提供，不因数据库动作众多而膨胀模型工具清单。

## 从 v4 安全升级：单向导入，不双写

升级前先停止旧 MCP 进程，备份 Git 仓库、现有数据库及旧 `docs/specs/`、`.mcp-probe-kit/plans/`、`docs/history-session/`。任何导入不得覆盖用户原有修改、删除源文件或伪造审批。

- **History**：已具备把旧 `docs/history-session/N.md` 读入 `hs_*` 的逻辑，原文件保留；新的 History 只写 SQLite。`MCP_HISTORY_STORAGE=files|markdown`、自定义实时 History 目录均被拒绝。
- **旧 Plan、Spec、Feature、Bug**：目前尚无经过验收的自动任务迁移器。不能把旧 Markdown 的“完成”直接改为新 SQLite 的 Verified 或 Owner 批准；后续迁移必须记录原始文件哈希、来源、风险、未运行 Gate 和待审状态。
- **MCP Apps**：原 v4 Feature/Bug/Plan/Product/Convergence 文件工作台已从运行时移除。v5 仅暴露直接读取 SQLite DevControl 的只读项目工作台和独立 Memory Center；草稿不得被 UI 自动提升成已批准或可领取任务。
- **备份和并发**：迁移/跨电脑恢复应使用一致性的 SQLite 备份，验证锁、租约及中断恢复，不能复制正在写入的 WAL/SHM 后声称备份完整。

## 当前研发阶段验收

已落地：主 MCP `devcontrol` 查询真实项目 SQLite、对外禁用旧研发流程、History SQLite-only、Node22 门禁、生成的 Skill/AGENTS.md 采用 v5 唯一研发流程；旧 App 资源已被两个 v5 App 取代。**2026-10-28 开发分支回归：622 项、618 通过、0 失败、4 跳过**，覆盖历史 Markdown 只读安全导入/冲突、SQLite 多会话、Modern/Legacy Host 与 v5 Task 协议。尚未完成旧 Plan/Spec/Feature/Bug 的完整安全迁移器、跨机器数据库备份/恢复及真实 Windows 主机验收，不能将它当作已发布版本。没有 Owner 独立发布批准，不创建 npm 5.0.0、Git Tag、Registry 版本或线上部署。

## v5 对外能力清单（按源码工具 Registry 维护）

**主 MCP：24 个活跃模型工具**；默认 compact 使用其中 15 个（10 基础 + 5 History），按配置附加 Memory 后 21 个，full 24 个。另有 **1 个 MCP App-only 工具** `list_memory_assets`，不会以模型工具身份暴露。对外工具的数量不等于 DevControl 的业务操作数量。

| 领域 | MCP 工具 |
|---|---|
| 研发管理（唯一正式状态） | `devcontrol` |
| Git、代码和审核辅助 | `gencommit`、`git_work_report`、`code_review`、`code_insight`、`architecture`、`gentest`、`refactor`、`fix_bug` |
| 人机交互与 UI 辅助 | `ask_user`、`ui_design_system`、`ui_search`、`sync_ui_data` |
| SQLite History | `history_session_bootstrap`、`history_session_checkpoint`、`history_session_validate`、`history_session_search`、`history_session_read` |
| 可选跨项目 Memory | `search_memory`、`read_memory_asset`、`memorize_asset`、`update_memory_asset`、`delete_memory_asset`、`scan_and_extract_patterns` |

**多仓库与跨设备开发**：每个仓库用项目根目录下的相对 Git 元数据路径标识，例如 `.git`、`apw-life/.git`。正常拉取、合并、克隆、移动整个项目都不要求 Owner 密钥，也不要求修改 SQLite。旧 v5 中保存的绝对路径和完成证据哈希保持原样，在读取时自动按相对位置解析。后续新的 Git 提交不会更改历史任务的原始交付 SHA。只有确实需要纠正历史审计记录时，才使用需要 Owner 密钥的 `relocate-repository-baselines`。

**单工作区的独立任务继续开发**：DevControl 仍保持同一 Git 暂存区同时只有一个写入任务。如果当前任务已经提交原子交付和测试记录、正在等待 AI 自审，且没有暂存修改，领取一个不存在前置依赖且文件范围不重叠的 Ready 任务时，可自动保留前者的独立任务租约并让出 Git 写入权。旧任务保持 `in_review`，`next.parkedReviews` 显示待审核任务；只有当前 AI 依据真实测试与既定验收条件完成后才可记为 Verified。自审失败要先重新领取写入权才能修改该任务代码。依赖未验收、范围重叠、未提交或暂存的场景继续拒绝切换。该功能不启动项目测试，也不需要独立第三方 Agent。

**`devcontrol` 统一入口：99 个受控 `action`，其中 `guide` 只读导航。** 每个动作的输入字段不同，必须以实际 Tool Schema / `execution-contract` 为准，不能把同一 JSON 输入套用到所有操作。它们分组如下：

**独立 Git Worktree 开发（单根 Git 仓库）**：当前 AI 可通过普通 Git 命令创建独立工作树，在领取任务时把其路径作为 project-root。工作树各有自己的 Git 暂存区，但共享主仓库原有的同一份 DevControl SQLite。只有全部前置任务 Verified、不同未验收任务的冻结文件范围不重叠，才允许独立领取。测试记录与技术自审绑定执行任务的工作树，独立交付的准确 Git 提交必须先被 AI 集成进主仓库，才可把任务记为 Verified。DevControl 不运行测试、不替 AI 合并 Git，也不要求其他 Agent。含独立子 Git 仓库的组合项目暂不支持此模式；这里的共享 SQLite 仅限同一台机器，不等于跨电脑同步。

**两份 SQLite 的安全合并（第一阶段）**：当前 AI 调用 `devcontrol` 的 `sqlite-merge-preview`，输入 `sourcePath` 为明确传入的另一份 SQLite 文件，读取本地项目库和源库，生成结构、记录数量、任务状态及测试证据冲突报告。无共享项目来源、结构不一致、行内容冲突、另一台电脑新增已执行或 Verified 的任务时，不允许自动合并。只有预检全部通过，才能用 `sqlite-merge-candidate` 输入相同 `sourcePath`、预检返回的 `expectedFingerprint` 以及全新 `outputPath` 生成候选数据库。两个原始 SQLite 保持不变，本机租约和设备相关 Git 路径不复制。候选结果必须由当前研发 AI 检查、完成真实 Git 及验收核对后才能正式使用。**这不是自动同步、在线冲突协调或可直接替换项目数据库的功能**，后续还需要完成同步协议和冲突解决机制。无需常在线权威主机或其他 Agent。

**三方合并与 AI 冲突判断（第二阶段）**：如果保留了两份 SQLite 分叉前的共同快照，额外传入 `basePath` 进行三方对比。只有未审批的同一草稿任务发生单边修改时，才自动使用该修改。如果两台电脑都修改了同一草稿，预检会给出 `table`、`key`、修改字段和原始版本。当前 AI 可在 `resolutions` 中逐条提供 `choice`（`source` 或 `target`）、`actor` 和详细 `reason`，重新预检并使用新的 `expectedFingerprint` 创建候选库。AI 的决定会写入候选库的 `dc_audit`。已批准的任务、领取中的任务、Verified、历史与测试证据冲突不支持这种偏好选择，继续要求真实 Git 与验收核对。没有共同快照时保持原来的严格双库预检；候选库不会自动投入使用。

**项目不以 Git 为前提（v5 Git 可选）**：项目根目录是 MCP 工作区，不需要 `.git`。可以完全没有 Git，也可以由普通父目录统一管理多个独立 Git 子项目。Skill、AGENTS.md、SQLite 任务与 History 均存放于工作区。任务、批准的范围、需求版本、真实测试与验收前置不变。Git 项目继续以原始提交审计；无 Git 项目在 claim 时保留 SHA-256 文件基线，在 complete 时冻结交付文件清单，report 与 verify 必须绑定同一份文件内容和实际测试记录，不能把哈希冒充 Git 提交。真实生成器同步的 Skill 与 AGENTS.md，只有在用户原有规则未改变、内容字节级匹配时才作为工具维护，不属于业务交付。无 Git 项目同样支持延期验收、租约恢复和基于 SQLite 的历史恢复。MCP 从已确认的项目工作区解析 `project_root`，找不到时才由调用者传入本机实际目录，不得回退到 MCP 安装目录。无需安装 Git 或执行 git init。

**跨设备 SQLite 与工作台运行态隔离**：工作台进程的 PID、端口、实例身份和启动时间属于当前机器，不是可合并的业务项目状态。新版本将其写入当前用户目录的 `.mcp-probe-kit-runtime/workspaces/` 私有 SQLite 文件，项目 SQLite 不再新建 `dc_workspace_runtime`。历史数据库中已存在的同名表只保留，不读取为当前机器进程，也不执行跨机导入。两方或三方合并在比较业务表结构之前排除所有已登记的机器本地表，所以表缺失、结构差异、两端不同 PID 都不会阻断真实项目任务数据合并；候选数据库仅保留目标端原有机器本地数据。其它实际业务表的不兼容结构仍严格拒绝。非 Git 项目可由 MCP 自动启动本地 HTTP 工作台，不创建 Git 仓库。

**合并能力边界**：当前 `sqlite-merge-preview/candidate` 只处理 `dc_*` 项目管理业务表。History Session 的 `hs_archive`、`hs_derived` 和 `hs_meta` 不会从源库复制进候选库，仍保留目标端版本；不能将本次机器本地表的兼容修复描述为跨电脑 History 已经完成同步。History 的独立编号冲突与真实内容合并仍需专门审核后设计。

| 流程领域 | 可用 `action` |
|---|---|
| 冻结任务说明补充 / Reviewed additive task specification (7) | `task-spec-supplement-get`、`task-spec-supplement-review`、`task-spec-supplement-stage`、`task-spec-supplement-self-review`、`task-spec-supplement-independent-review`、`task-spec-supplement-approve`、`task-spec-supplement-withdraw` |
| 操作导航 / Read-only agent navigation (1) | `guide` |
| 项目与当前任务 / Project and task discovery (6) | `onboard`、`next`、`list`、`get`、`execution-contract`、`task-detail-audit` |
| SQLite 项目状态差异及安全候选合并 / Local database merge (2) | `sqlite-merge-preview`、`sqlite-merge-candidate` |
| 版本计划 / Release plan approval (5) | `release-plan`、`plan-review`、`plan-propose`、`plan-revise`、`plan-approve` |
| 正式工作树 / Frozen release work (4) | `release-work-plan`、`release-work-review`、`release-work-stage`、`release-work-approve` |
| 范围变更 / Reviewed scope amendments (8) | `release-work-scope-review`、`release-work-scope-stage`、`release-work-scope-get`、`release-work-scope-self-review`、`release-work-scope-independent-review`、`release-work-scope-approve`、`release-work-scope-withdraw`、`pause-for-scope` |
| 增量任务 / Reviewed incremental work (8) | `release-work-incremental-review`、`release-work-incremental-stage`、`release-work-incremental-get`、`release-work-incremental-self-review`、`release-work-incremental-independent-review`、`release-work-incremental-approve`、`release-work-incremental-withdraw`、`pause-for-reviewed-incremental` |
| Feature：需求 → 设计 → 任务 / Requirements to design to atomic tasks (14) | `features`、`feature-get`、`feature-create`、`feature-save`、`feature-validate`、`feature-export`、`feature-task-brief`、`feature-task-plan`、`feature-task-plans`、`feature-task-review`、`feature-task-stage`、`feature-task-propose`、`feature-task-second-review`、`feature-task-approve` |
| 工作项和架构 / Work items and architecture (3) | `work-items`、`work-record`、`architecture-sync` |
| Bug / Defect management (3) | `bug-get`、`bug-step-save`、`bug-task-link` |
| Idea / Proposed change governance (7) | `idea-capture`、`idea-list`、`idea-get`、`idea-assess`、`idea-self-review`、`idea-review`、`idea-decide` |
| 工件 / Governed artifacts (6) | `artifact-get`、`artifact-check`、`artifact-stage`、`artifact-self-review`、`artifact-independent-review`、`artifact-approve` |
| 领取、报告与验收 / Execution and evidence (20) | `claim`、`renew`、`recover-task`、`refresh-protected-worktree`、`relocate-repository-baselines`、`release`、`defer-verification`、`resume-verification`、`check`、`report`、`gate-review`、`review-worktree`、`complete`、`review-handoff`、`review-submit`、`self-review`、`reviewed-verify`、`task-closure-status`、`verify`、`trace` |
| 决策 / Decision records (2) | `decision-save`、`decision-get` |
| 本地工具 / Local developer and hooks (3) | `local-developer`、`hook-status`、`hook-install` |

以上分组中的数字仅用于阅读，不影响正式任务批准。DevControl 管理过程和证据，不运行 Python/Go/gRPC/Flutter 等项目业务测试；外部测试结论必须由 Agent 真实执行并实质自审（独立复审可选）记录。**原子任务只允许一个可独立验收结果**，宽泛目标必须先拆解。

## GitNexus 代码图谱的项目初始化

GitNexus 是可选代码分析提供者，不是 DevControl 的研发状态库。安装 GitNexus 托管运行时，不等于当前 Git 仓库已经建立图谱。查询若出现 `index_missing`，在实际 Git 项目根目录执行：

```sh
mcp-probe-kit doctor gitnexus --index --project-root /path/to/git-project
```

CLI 要求 Node.js 22+、有效的托管运行时及 Git 仓库根目录，分析上限为 180 秒，使用一名受控 Worker；不会发布版本或改写用户的 AGENTS.md。完成后重试代码查询。若仍不可用，应明确降级到 Git / 其他静态分析，不应把缺失图谱的结果当作已验证的依赖分析。
