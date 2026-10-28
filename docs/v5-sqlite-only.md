# MCP Probe Kit v5 — SQLite + DevControl 唯一研发流程

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

**`devcontrol` 统一入口：73 个受控 `action`。** 每个动作的输入字段不同，必须以实际 Tool Schema / `execution-contract` 为准，不能把同一 JSON 输入套用到所有操作。它们分组如下：

| 流程领域 | 可用 `action` |
|---|---|
| 项目/任务读取（6） | `onboard`、`next`、`list`、`get`、`execution-contract`、`task-detail-audit` |
| 版本计划与审批（5） | `release-plan`、`plan-review`、`plan-propose`、`plan-revise`、`plan-approve` |
| 正式工作树（4） | `release-work-plan`、`release-work-review`、`release-work-stage`、`release-work-approve` |
| 范围变更（7） | `release-work-scope-review`、`release-work-scope-stage`、`release-work-scope-get`、`release-work-scope-independent-review`、`release-work-scope-approve`、`release-work-scope-withdraw`、`pause-for-scope` |
| 冻结后增量任务（7） | `release-work-incremental-review`、`release-work-incremental-stage`、`release-work-incremental-get`、`release-work-incremental-independent-review`、`release-work-incremental-approve`、`release-work-incremental-withdraw`、`pause-for-reviewed-incremental` |
| Feature：需求→设计→任务（13） | `features`、`feature-get`、`feature-create`、`feature-save`、`feature-validate`、`feature-export`、`feature-task-brief`、`feature-task-plan`、`feature-task-plans`、`feature-task-review`、`feature-task-stage`、`feature-task-propose`、`feature-task-approve` |
| 正式工作项与架构（3） | `work-items`、`work-record`、`architecture-sync` |
| Bug（3） | `bug-get`、`bug-step-save`、`bug-task-link` |
| Idea（6） | `idea-capture`、`idea-list`、`idea-get`、`idea-assess`、`idea-review`、`idea-decide` |
| 架构工件治理（5） | `artifact-get`、`artifact-check`、`artifact-stage`、`artifact-independent-review`、`artifact-approve` |
| 领取、执行、证据与验收（9） | `claim`、`renew`、`release`、`check`、`report`、`gate-review`、`complete`、`verify`、`trace` |
| 决策记录（2） | `decision-save`、`decision-get` |
| 本地开发与钩子（3） | `local-developer`、`hook-status`、`hook-install` |

以上分组中的数字仅用于阅读，不影响正式任务批准。DevControl 管理过程和证据，不运行 Python/Go/gRPC/Flutter 等项目业务测试；外部测试结论必须由 Agent 真实执行并独立复审记录。**原子任务只允许一个可独立验收结果**，宽泛目标必须先拆解。
