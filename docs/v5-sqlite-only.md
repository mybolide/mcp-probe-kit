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
- **旧 MCP Apps**：v4 Delegated Plan/Feature/Bug/Converge 的界面尚未全部迁移到新 SQLite；不能把旧 UI 当成已适配 v5 的工作台。SQLite DevControl 项目工作台是权威状态视图。
- **备份和并发**：迁移/跨电脑恢复应使用一致性的 SQLite 备份，验证锁、租约及中断恢复，不能复制正在写入的 WAL/SHM 后声称备份完整。

## 当前研发阶段验收

已落地：主 MCP `devcontrol` 查询真实项目 SQLite、对外禁用旧研发流程、History SQLite-only、Node22 门禁、生成的 Skill/AGENTS.md 采用 v5 唯一研发流程。**全量旧契约测试、跨机器迁移和旧 Apps 改造仍需完成**，不能称为已发布或生产可用。没有 Owner 独立发布批准，不创建 npm 5.0.0、Git Tag、Registry 版本或线上部署。
