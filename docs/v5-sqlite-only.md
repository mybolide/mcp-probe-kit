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

**Node.js 22+ 与 Git 项目根目录是 v5 的强制前提。** 新项目数据库位于 `.mcp-probe-kit/state/devcontrol.sqlite3`；已有 Neyna 项目保留 `.neyna/state/devcontrol.sqlite3`。数据库、WAL、SHM、活跃租约与机密不能提交 Git。

## 启动检查与 Agent 指引自动同步

MCP 每次启动时，若能识别真实 Git 业务项目，就检查
`.agents/skills/mcp-probe-kit/SKILL.md` 和 `AGENTS.md` 中的 MCP
托管区；内容缺失、版本过旧，或者**同为 v5.0.0 但指导修订号过期**
都会自动同步。启动无法定位项目时，不向 MCP 安装目录写入文件；
首次 `devcontrol` 调用传入明确的 `project_root` 后补做检查。

Skill 自动生成源码定义的 83 个 DevControl 操作索引（含只读 guide），以及需求→设计→
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

完整研发路径：新会话 `history_session_bootstrap` → 检查 `onboard`、`list`、`next`、`execution-contract` → Agent 独立需求/风险复审 → `plan-review`、`plan-propose`、独立 Review 与精确哈希的 Owner `plan-approve` → `claim`、`renew`、合法编码与真实测试 → `check`、Git commit、`complete`、`report`、`verify` → `history_session_checkpoint`。

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

**`devcontrol` 统一入口：84 个受控 `action`，其中 `guide` 只读导航。** 每个动作的输入字段不同，必须以实际 Tool Schema / `execution-contract` 为准，不能把同一 JSON 输入套用到所有操作。它们分组如下：

| 流程领域 | 可用 `action` |
|---|---|
| 操作导航 / Read-only agent navigation (1) | `guide` |
| 项目与当前任务 / Project and task discovery (6) | `onboard`、`next`、`list`、`get`、`execution-contract`、`task-detail-audit` |
| 版本计划 / Release plan approval (5) | `release-plan`、`plan-review`、`plan-propose`、`plan-revise`、`plan-approve` |
| 正式工作树 / Frozen release work (4) | `release-work-plan`、`release-work-review`、`release-work-stage`、`release-work-approve` |
| 范围变更 / Reviewed scope amendments (7) | `release-work-scope-review`、`release-work-scope-stage`、`release-work-scope-get`、`release-work-scope-independent-review`、`release-work-scope-approve`、`release-work-scope-withdraw`、`pause-for-scope` |
| 增量任务 / Reviewed incremental work (7) | `release-work-incremental-review`、`release-work-incremental-stage`、`release-work-incremental-get`、`release-work-incremental-independent-review`、`release-work-incremental-approve`、`release-work-incremental-withdraw`、`pause-for-reviewed-incremental` |
| Feature：需求 → 设计 → 任务 / Requirements to design to atomic tasks (14) | `features`、`feature-get`、`feature-create`、`feature-save`、`feature-validate`、`feature-export`、`feature-task-brief`、`feature-task-plan`、`feature-task-plans`、`feature-task-review`、`feature-task-stage`、`feature-task-propose`、`feature-task-second-review`、`feature-task-approve` |
| 工作项和架构 / Work items and architecture (3) | `work-items`、`work-record`、`architecture-sync` |
| Bug / Defect management (3) | `bug-get`、`bug-step-save`、`bug-task-link` |
| Idea / Proposed change governance (6) | `idea-capture`、`idea-list`、`idea-get`、`idea-assess`、`idea-review`、`idea-decide` |
| 工件 / Governed artifacts (5) | `artifact-get`、`artifact-check`、`artifact-stage`、`artifact-independent-review`、`artifact-approve` |
| 领取、报告与验收 / Execution and evidence (18) | `claim`、`renew`、`recover-task`、`release`、`defer-verification`、`resume-verification`、`check`、`report`、`gate-review`、`review-worktree`、`complete`、`review-handoff`、`review-submit`、`self-review`、`reviewed-verify`、`task-closure-status`、`verify`、`trace` |
| 决策 / Decision records (2) | `decision-save`、`decision-get` |
| 本地工具 / Local developer and hooks (3) | `local-developer`、`hook-status`、`hook-install` |

以上分组中的数字仅用于阅读，不影响正式任务批准。DevControl 管理过程和证据，不运行 Python/Go/gRPC/Flutter 等项目业务测试；外部测试结论必须由 Agent 真实执行并独立复审记录。**原子任务只允许一个可独立验收结果**，宽泛目标必须先拆解。

## GitNexus 代码图谱的项目初始化

GitNexus 是可选代码分析提供者，不是 DevControl 的研发状态库。安装 GitNexus 托管运行时，不等于当前 Git 仓库已经建立图谱。查询若出现 `index_missing`，在实际 Git 项目根目录执行：

```sh
mcp-probe-kit doctor gitnexus --index --project-root /path/to/git-project
```

CLI 要求 Node.js 22+、有效的托管运行时及 Git 仓库根目录，分析上限为 180 秒，使用一名受控 Worker；不会发布版本或改写用户的 AGENTS.md。完成后重试代码查询。若仍不可用，应明确降级到 Git / 其他静态分析，不应把缺失图谱的结果当作已验证的依赖分析。
