# MCP Probe Kit v4 Compatibility Matrix

## 1. 协议时代

| 能力 | Legacy MCP | Modern MCP | 降级策略 |
|---|---|---|---|
| 工具发现 | initialize + tools/list | server/discover / tools/list | 保持同一 Tool Registry 与工具顺序 |
| 工具调用 | tools/call | tools/call | 同一业务 Handler |
| 需求澄清 | 客户端声明 elicitation 时由 SDK shim 完成多轮；否则返回 loop / ask_user | 客户端声明 form elicitation 时返回 input_required | 无能力时保留结构化问题列表；拒绝/取消时明确结束 |
| Tasks | 自管 Legacy wire store + LegacyTaskAdapter，支持 get/result/list/cancel | Modern Tasks Extension 尚未绑定 wire adapter | Modern Task 请求同步执行并返回正常工具结果；不得返回伪 Task handle |
| Progress | notifications/progress | notifications/progress | 默认关闭；无 token、客户端不消费或通知失败均不影响最终结果 |
| Resources | Legacy resources | Modern resources | 缺失时使用项目文件 |
| Apps | 可选 preview/meta | 可选 resource/meta | 默认关闭；structuredContent + Markdown 始终可用 |

## 2. 产品兼容保证

| 产品能力 | v3 Client | v4 Legacy Mode | v4 Modern Mode |
|---|---:|---:|---:|
| Canonical Skill | 支持 | 支持 | 支持 |
| start_* delegated plan | 支持 | 支持 | 支持 |
| Memory CRUD | 支持 | 支持 | 支持 |
| GitNexus code insight | 支持 | 支持 | 支持 |
| Spec Gate | 支持 | 支持 | 支持 |
| Parent-Child Spec | 支持 | 支持 | 支持 |
| SRC-8 | 支持 | 支持 | 支持 |
| input_required | 不支持 | 降级 | 支持时启用 |
| Modern Tasks | 不支持 | 不宣告 | 同步降级；待 Extension 与客户端链路成熟后显式启用 |

## 3. 运行模式

| `MCP_PROTOCOL_MODE` | 服务行为 | 适用场景 |
|---|---|---|
| `auto`（默认） | `serveStdio(factory)` 自动识别 Legacy / Modern，每条连接创建独立 Server | 正常使用与发布默认值 |
| `legacy` | 固定 2025-era initialize 路径，保留 Legacy Tasks | 某客户端与 Modern opening 不兼容时排障 |
| `modern` | 使用 Modern opening，拒绝 Legacy opening | Modern 协议和扩展开发验证 |

运行时要求 Node.js 20 或更高。SDK v2 包固定为 `@modelcontextprotocol/server`、`client`、`core` 2.0.0，升级前必须通过完整兼容矩阵。

## 4. 已自动化验证的 reference matrix

- SDK v2 Client pinned Legacy → auto Server
- SDK v2 Client pinned Modern → auto Server
- SDK v2 Client auto negotiation → Modern Server
- Legacy Client → modern-only Server（必须拒绝）
- Modern Client → legacy-only Server（必须拒绝）
- Legacy Task：tools/call → tasks/get → tasks/result
- Modern Task 请求：同步降级并返回等价业务结果
- Modern input_required：接受、拒绝和无 capability 降级
- Legacy requirements loop：SDK shim 完成同一 elicitation 流程

## 5. 待发布前人工验证

- MCP Inspector
- Cursor
- Claude Code
- VS Code Copilot
- Cline / OpenCode（按客户端实际能力记录结果）

任何客户端不支持扩展时，不得导致 `start_feature`、`start_bugfix`、`start_ui`、Memory 和代码分析不可用。
