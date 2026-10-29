# MCP Probe Kit v5：让 Agent 不必记住 74 个 action

> **状态**：v5.0.0 源码开发分支，尚未发布 npm / MCP Registry；公开稳定版仍为 v4.1.1。Node.js 22+ 与真实 Git 业务项目是 v5 研发管理的基本条件。
>
> **一句话**：对 Agent 而言只有 **一个正式研发管理 MCP 工具 `devcontrol`**；其中 `guide` 是**只读导航入口**，其他 73 个是业务操作。Agent 按意图先导航，再按 SQLite 冻结合同执行；不需要死记参数、也不在 MCP 层执行任何业务项目的测试。

## 如何避免 74 个 action 造成工具选择困难？

当 Agent 不知道下一步使用哪个动作时，先调用：

```json
{"action":"guide","input":{"intent":"feature"}}
```

这次业务操作**无需 `project_root`，不创建 SQLite 任务数据库、不创建需求或审批**。MCP 的通用启动器仍可能在已识别的工作区自动同步受托管的 Skill / AGENTS.md（这是独立的启动行为）。导航返回当前意图的步骤、动作名称、最小可复制示例以及不可绕过的审批边界。

拿到建议后，再调用相同的 `devcontrol` MCP 工具，并带上业务 Git 项目的绝对路径：

```json
{"action":"feature-create","project_root":"/ABSOLUTE/GIT/PROJECT","input":{"name":"login","description":"用户登录业务需求","layout":"flat"}}
```

不同 action 的 `input` **不是统一格式**。所有审批、租约、提交证据均以项目 SQLite 实际返回的修订号、ID、Hash、Lease 为准，严禁猜测。未知或错误的 action 会返回引导使用 `guide` 的纠错提示，而不是尝试旧 v4 工作流。

## 按业务意图导航

| `input.intent` | Agent 的意图 | 推荐先做什么 | 禁止误用 |
| --- | --- | --- | --- |
| `start` | 新会话、继续开发 | History bootstrap → `onboard` / `next` | 重新生成已有冻结任务 |
| `feature` | 新需求、Feature | `feature-create` → `feature-save` 三章节 | 用 Markdown 文件重新驱动任务 |
| `planning` | 版本计划、工作树 | `release-plan` / `plan-review` | 未经独立复审自动批准 |
| `task` | 领取一个最小任务 | `next` → `execution-contract` → `claim` | 无租约改代码、扩大允许文件 |
| `verification` | 测试、证据与验收 | `trace` / `check` / `report` / `gate-review` / `verify` | 证据存在就宣称测试通过 |
| `bug` | 缺陷跟踪 | `work-items` / `bug-get` | 将无关 Bug 塞入当前任务 |
| `idea` | 新想法 | `idea-list` / `idea-capture` → 独立复审 | 跳过 Owner 修改冻结计划 |
| `scope` | 冻结后范围、依赖变更 | `release-work-scope-get` 和相应复审 | 直接修改冻结路径 |
| `architecture` | 架构与正式工件 | `artifact-check` / `artifact-get` | 未批准修改受控 ADR |

输入空 `input` 会返回所有意图的简短导航清单。以上意图名称是帮助 Agent 选择流程，**不是新的 9 个 MCP 工具**。

## v5 正式研发闭环

1. **恢复**：Agent 新对话先 `history_session_bootstrap`，再读 `devcontrol` 的 `onboard`、`next`、`execution-contract`。有冻结任务则继续而不是重建。
2. **需求**：`feature-create` 与 `feature-save` 保存真实需求、FR/NFR、场景和验收条件；FR-1/FR-001 可以规范化关联，但原始来源必须保留。
3. **设计**：`feature-save` 单独保存架构、数据、接口、异常流、边界条件。要求能够支撑实现与测试用例；正式 PRD/ADR 可导出到 Git，但**不是任务状态库**。
4. **拆解**：`feature-task-brief` → `feature-task-review` / `feature-task-stage` / `feature-task-propose`，阶段与父任务仅负责组织，每个叶子任务**只有一个可独立验证的目标**，写清文件范围、依赖、正反测试、证据、不做事项与停止条件。新 Feature 叶子任务建议 30–60 分钟，1–2 小时须说明为什么不能安全拆分，超过 2 小时须继续拆分；旧冻结任务不能直接重写。
5. **复审和授权**：独立 Reviewer 核对方案，Owner 审批精确 Hash：`feature-task-approve` / `plan-approve`。未经审批的父子草稿可以显示在规划区，但**不得领取开发**。
6. **实施**：`next` → `execution-contract` → `claim`，Agent 只修改受批准路径，使用 Git 提交真实修改。
7. **验收**：Agent 自行执行 Python、Go、Flutter、gRPC 等真实业务测试，`complete` / `report` 提交结果；项目自定义 Gate 经 **独立** `gate-review` 记录结论，`verify` 严格依赖真实、版本绑定的证据，不能假装测试通过。
8. **交接**：`history_session_checkpoint` 保存用户原话、决策、Commit、测试、租约和下一步。

## 自动同步 Skill 和 AGENTS.md

MCP 每次启动在识别目标 Git 项目时检查 `.agents/skills/mcp-probe-kit/SKILL.md` 与 `AGENTS.md` 的 MCP 托管区。**即使包版本号仍是 5.0.0**，指导修订号过期也会更新；重复启动无变化则不改写，用户自己的 AGENTS.md 规则不会被覆盖。启动时找不到项目会跳过写入，首次显式传 `project_root` 的工具调用再检查。旧运行包不会凭空升级：需先本地安装新版构建并重新连接 MCP 客户端。

## 源码文档与任务总账回归

使用 Git 源码开发分支时，运行 `npm run docs:verify` 检查完整文档。权威 `docs/v5-agent-action-guide.md` 必须由 Git 跟踪，不能依赖开发者本机的忽略文件。缺失时应更新 MCP 的源码提交，而不是在使用项目中补一份假指南。

任务总账回归包含较多真实 Git 与 SQLite 操作。若 Agent 的单次执行窗口过短，可运行 `npm run test:ledger:batch`，按完整测试名称将全部总账测试分成独立批次，并逐批打印结果。任何单批超时、测试失败或覆盖数量不符都会返回非零退出码，不能作为通过的验收证据。完整仓库回归仍须运行 `npm test`，分批命令不能替代它。

## 工具和安全边界

- v5 主模型工具共 **24 个**；DevControl 通过一个工具暴露 **74 个 action（含只读 `guide`）**，完整分组可见 `docs/v5-sqlite-only.md` 与自动生成的 Skill；这不是 74 个并列 MCP 工具。
- 研发流程状态归 SQLite `dc_*`，会话 History 归同项目 `hs_*`。旧 Markdown History 只允许只读导入，不支持双写/回退文件式工作流。
- 开发 Agent 执行代码、SQL、测试和独立审核；DevControl 负责组织、权限边界和保存证据。MCP 不需要为每种语言实现测试执行器，也不会独立决定测试真实通过。
- v4 `start_feature`、`start_bugfix`、`resume_plan`、`plan_heartbeat`、`converge` 均不是 v5 可调用流程。
- 未经 Owner 授权不得发布 npm v5、Git Tag、Release、生产网站。源码开发分支文档不等于发布许可。

继续阅读：[v5 完整指南](v5-development-guide.md) · [DevControl 参考](devcontrol.md) · [v5 最佳实践](v5-best-practices.md) · [源码开发与迁移现状](v5-sqlite-only.md)。
