# MCP Probe Kit v3 → v4 迁移指南

## 适用范围

本指南面向从 MCP Probe Kit v3.x 升级到 v4.x 的用户。v4 保留现有工具名称、主要输入输出、Canonical Skill、`start_*` delegated workflow、Memory、GitNexus、Spec Gate、Parent-Child Spec 和 SRC-8。

v4 的核心变化是底层治理能力升级，而不是要求用户重写项目代码。

## 升级前检查

1. Node.js 必须为 20 或更高版本。
2. 保存当前 MCP 客户端配置和项目内 `.agents/skills/mcp-probe-kit/SKILL.md`。
3. 确认 v3 项目中的 `docs/specs/`、`docs/project-context/` 和 Memory 配置可正常读取。
4. 生产环境建议先记录当前 v3 版本，以便紧急回退。

## 安装升级

使用 npx 的配置通常无需修改命令，只需将版本更新到 v4：

```json
{
  "command": "npx",
  "args": ["-y", "mcp-probe-kit@4"]
}
```

全局安装用户：

```bash
npm install -g mcp-probe-kit@4
```

## Node.js 与 SDK

v4 使用 MCP TypeScript SDK v2 拆分包，并要求 Node.js 20+。这是服务端内部迁移；正常使用 npx 的客户端不需要自行安装 SDK 包。

SDK 依赖在 v4 首个稳定版中使用经过验证的精确版本，不使用 `latest` 或宽松范围自动漂移。

## Legacy 与 Modern 双协议

默认配置：

```text
MCP_PROTOCOL_MODE=auto
```

可选值：

| 模式 | 行为 | 使用场景 |
|---|---|---|
| `auto` | 自动识别 Legacy 或 Modern 客户端 | 默认生产配置 |
| `legacy` | 固定旧协议时代与 Legacy Tasks | 某客户端升级不完整时排障 |
| `modern` | 仅接受 Modern opening | 新协议和扩展开发验证 |

客户端不支持 Modern 协议时，v4 会继续走 Legacy 路径，不需要改回 v3。

## Tasks 与能力降级

- Legacy 客户端继续支持旧 Task handle、`tasks/get`、`tasks/result`、`tasks/list` 和 `tasks/cancel`。
- Modern Tasks Extension 当前未默认宣告支持；Modern 客户端请求 Task 时同步执行并返回正常工具结果。
- `input_required` 仅在客户端声明表单 elicitation 能力时启用；否则保留现有 Requirements Loop、`ask_user` 或结构化问题列表。
- Progress、Apps、Resources 等增强能力不可用时，不得阻断核心 `start_*`、Memory 和代码分析。

## Delegated Plan 状态与恢复

v4 的 `start_*` Plan Contract 增加以下工具：

```text
plan_heartbeat
resume_plan
converge
```

执行纪律：

1. 首次执行计划时调用 `plan_heartbeat`，附完整 plan。
2. 每完成、跳过或阻塞一个步骤后更新检查点。
3. 会话中断或切换 Agent 后先调用 `resume_plan`。
4. 实现、测试和审查完成后调用 `converge`。

检查点默认保存在项目本地：

```text
.mcp-probe-kit/plans/
```

它不是中心化 Workflow 数据库，也不会代替 Agent 修改代码。

## Memory 写入顺序

v3 中部分流程会在验证完成后直接提示 `memorize_asset`。v4 统一改为：

```text
验证完成
→ 准备 MemoryCandidate
→ plan_heartbeat 记录证据
→ converge passed=true
→ memorize_asset 正式写入
```

`converge` 未通过时，不应将本次结论写成长期记忆。

v4 同时支持：

- `failed_approach`
- `false_root_cause`
- `regression_case`
- 失效时间、替代关系和撤回状态
- 当前项目事实优先、共享经验补充

## 工具与 Skill

v4 当前提供 33 个工具。Canonical Skill 仍只有一个，由 Tool Registry 自动生成和同步。

复杂功能继续以 `start_feature` 为首入口：

```json
{
  "description": "结合当前对话整理的完整任务摘要",
  "spec_layout": "auto",
  "project_root": "项目根目录绝对路径"
}
```

不要把用户最后一句“继续”原样作为完整需求，也不要绕过 `start_feature` 直接调用 `add_feature` 处理跨模块需求。

## 验证升级

升级后至少确认：

1. `tools/list` 返回 33 个工具。
2. `workflow` 能把 Feature 路由到 `start_feature`。
3. `start_feature` 返回 `mode=delegated` 和 Plan Contract。
4. Legacy 或 Modern 客户端可调用 `resources/list` 与 `resources/read`。
5. Memory 未配置时，核心 Workflow 仍然可运行。

项目维护者可运行：

```bash
npm run eval:agents
npm run release:verify
```

## 回退

优先采用协议级回退：

```text
MCP_PROTOCOL_MODE=legacy
```

只有确认 SDK v2 运行时存在无法规避的严重回归时，才回退到已固定的 v3.x 包版本或 `release/v3` 维护分支。

回退不会自动删除 v4 生成的 `.mcp-probe-kit/plans/`；这些是本地状态文件，可按项目策略保留或清理。

## 尚需人工验证的客户端

Reference client 自动化不能替代真实宿主客户端。Cursor、Claude Code、VS Code Copilot、Cline、OpenCode 和 MCP Inspector 的状态以 `docs/specs/mcp-v4/compatibility-matrix.md` 为准；未实机验证的项目保持 `pending`。
