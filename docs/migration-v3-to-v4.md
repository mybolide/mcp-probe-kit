# MCP Probe Kit v3 → v4 迁移指南

## 适用范围

本指南面向从 MCP Probe Kit v3.x 升级到 v4.x 的用户。v4 保留现有项目数据与主要工具名称，重点升级底层协议、Agent 编排、计划恢复、Memory 生命周期和 MCP Apps 交互能力。

v4 不要求重写业务代码，但要求运行环境使用 Node.js 20 或更高版本。

## RC 安装

候选版本发布到 npm `next` 标签，不覆盖稳定版 `latest`：

```bash
npm install -g mcp-probe-kit@next
npm install -g mcp-probe-kit@4.0.0-rc.2
```

MCP 客户端测试 RC：

```json
{
  "command": "npx",
  "args": ["-y", "mcp-probe-kit@next"]
}
```

只有稳定版 `4.0.0` 发布后，才建议生产环境改用：

```json
{
  "command": "npx",
  "args": ["-y", "mcp-probe-kit@4"]
}
```

RC 不更新 npm `latest`，也不会写入正式 MCP Registry。

## Node.js 与 SDK

v4 的最低运行环境为 Node.js 20，推荐 Node.js 22。服务端使用 MCP TypeScript SDK v2 拆分包：

- `@modelcontextprotocol/server@2.0.0`
- `@modelcontextprotocol/client@2.0.0`
- `@modelcontextprotocol/core@2.0.0`
- `@modelcontextprotocol/ext-apps@1.7.2`

普通 npx 用户不需要单独安装这些 SDK。

## 默认工具面变化

v3 与 v4 RC1 默认直接暴露全部工具。v4.0.0-rc.2 改为默认 `compact` 工具面，减少相似工具竞争和上下文占用。

| 配置 | 模型可见工具数 | 用途 |
|---|---:|---|
| 默认或 `MCP_TOOLSET=compact` | 23 | 推荐日常使用 |
| `compact` 且完整配置 Memory | 29 | 增加 6 个 Memory 工具 |
| `MCP_TOOLSET=full` | 33 | 兼容、诊断和旧流程 |

默认 23 个工具包括：

```text
workflow
start_feature
start_bugfix
start_ui
start_onboard
start_product
start_ralph
init_project
init_project_context
check_spec
estimate
code_insight
gentest
code_review
refactor
gencommit
git_work_report
ui_design_system
ui_search
interview
plan_heartbeat
resume_plan
converge
```

完整配置 Memory 后动态增加：

```text
search_memory
read_memory_asset
memorize_asset
update_memory_asset
delete_memory_asset
scan_and_extract_patterns
```

以下四个工具仍保留实现，但不再出现在默认模型工具面：

- `add_feature`：由 `start_feature` 编排，`full` 模式仍可直接调用。
- `fix_bug`：根因分析规则由 `start_bugfix` 使用，`full` 模式仍可直接调用。
- `sync_ui_data`：主要作为构建和维护脚本使用，`full` 模式保留兼容入口。
- `ask_user`：普通澄清由 Agent 原生对话完成；复杂访谈使用 `interview`。

不要用工具总数判断能力是否被删除。v4 的原则是保留明确独立意图，隐藏容易绕过流程的重复入口。

## Legacy 与 Modern 双协议

默认配置：

```text
MCP_PROTOCOL_MODE=auto
```

可选值：

| 模式 | 行为 | 使用场景 |
|---|---|---|
| `auto` | 自动协商 Legacy 或 Modern 客户端 | 默认生产配置 |
| `legacy` | 固定旧协议和 Legacy Tasks | 客户端兼容诊断 |
| `modern` | 拒绝 Legacy opening | Modern 协议验证 |

Modern 客户端尚未使用原生 Modern Tasks 扩展时，工具调用会同步降级并返回正常结果，不会返回无效的 Legacy Task handle。

## MCP Apps

v4.0.0-rc.2 接入正式 MCP Apps 扩展：

```text
Extension: io.modelcontextprotocol/ui
MIME: text/html;profile=mcp-app
```

MCP Apps 默认启用，可显式关闭：

```text
MCP_ENABLE_UI_APPS=0
```

只有客户端在初始化能力中声明支持上述 MIME，服务端才会：

1. 在相关工具上附加 `_meta.ui.resourceUri`；
2. 暴露对应的 `ui://` 资源；
3. 允许 App 调用 App-only 动作。

本 RC 包含五个界面：

- Memory Center
- Feature Workbench
- Bug Workbench
- Product Workbench
- Convergence Gate

Memory Center 支持浏览历史记忆、语义搜索、查看完整内容、标记过期和确认删除。

`list_memory_assets` 是 App-only 动作，使用：

```json
{
  "ui": {
    "resourceUri": "ui://mcp-probe-kit/memory-center",
    "visibility": ["app"]
  }
}
```

因此 Apps 客户端的原始 `tools/list` 可能比模型可见数量多 1 项。合规 Host 不应把该动作提供给模型。未支持 MCP Apps 的客户端继续使用原有文本和 `structuredContent`，不影响功能。

## Delegated Plan 状态与恢复

`start_*` 工具返回 delegated Plan Contract，由 Agent 执行具体代码和文件操作。三个计划生命周期工具必须保持模型可见：

```text
plan_heartbeat
resume_plan
converge
```

执行规则：

1. 首次执行计划时调用 `plan_heartbeat` 保存计划；
2. 每完成、跳过或阻塞一步，更新检查点和证据；
3. 会话中断或 Agent 切换后先调用 `resume_plan`；
4. 实现、测试和审查完成后调用 `converge`；
5. 只有 `converge passed=true` 后才允许正式写入长期 Memory。

计划状态默认保存在：

```text
.mcp-probe-kit/plans/
```

## Memory 配置与写入顺序

只配置 `MEMORY_QDRANT_URL` 时，Memory Center 可以读取和浏览现有资产。语义搜索、写入和内容更新还需要 embedding 服务：

```text
MEMORY_QDRANT_URL
MEMORY_EMBEDDING_URL
MEMORY_EMBEDDING_MODEL
```

推荐写入顺序：

```text
完成实现与验证
→ 准备 MemoryCandidate
→ plan_heartbeat 记录证据
→ converge passed=true
→ memorize_asset 正式写入
```

Memory 支持状态和关系：

```text
active
stale
expired
superseded
retracted
```

并支持 `failed_approach`、`false_root_cause`、`regression_case` 等负向经验类型。

## 验证清单

升级后至少确认：

1. 未配置 Memory 时，默认模型工具数为 23；
2. 完整配置 Memory 时，默认模型工具数为 29；
3. `MCP_TOOLSET=full` 时，模型工具数为 33；
4. `workflow` 能把新增功能路由到 `start_feature`；
5. `start_feature` 返回 `mode=delegated` 的 Plan Contract；
6. Legacy 与 Modern 客户端都能读取 `probe://status`；
7. 未协商 MCP Apps 的客户端看不到 `ui://` 资源；
8. 已协商 MCP Apps 的客户端能读取 `text/html;profile=mcp-app` 资源；
9. App-only 工具的 visibility 仅包含 `app`；
10. Memory 服务不可用时，非 Memory 工作流仍可正常运行。

项目维护者可运行：

```bash
npm run eval:agents
npm run release:verify
```

## 回退

先尝试协议级回退：

```text
MCP_PROTOCOL_MODE=legacy
```

如果只是工具选择问题，可临时恢复完整工具面：

```text
MCP_TOOLSET=full
```

只有确认 SDK v2 或协议兼容层无法接受时，才回退到已固定的 v3.x 版本。回退不会自动删除 `.mcp-probe-kit/plans/`，这些文件可用于恢复未完成计划。

## 真实客户端验证

Reference client 自动测试不能替代真实 Host 验收。Cursor、Claude Code、VS Code Copilot、Cline、OpenCode 和 MCP Inspector 的状态，以 `docs/specs/mcp-v4/compatibility-matrix.md` 为准；未完成实机验证的项目继续标记为 `pending` 或 `blocked`。
