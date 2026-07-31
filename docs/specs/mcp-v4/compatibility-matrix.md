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

## 5. Reference client 自动验证状态

| 验证项 | 状态 | 证据 |
|---|---|---|
| Legacy tools/resources | passed | `src/protocol/__tests__/dual-era-stdio.integration.test.ts` |
| Modern tools/resources | passed | `src/protocol/__tests__/dual-era-stdio.integration.test.ts` |
| Legacy Task wire | passed | Legacy Task integration + `npm run smoke:protocol` |
| Modern Task 同步降级 | passed | dual-era reference matrix + production smoke |
| Modern input_required | passed | 接受、拒绝、取消和无 capability 路径 |
| Plan Heartbeat / Resume / Converge | passed | Plan lifecycle tests + production smoke |
| Agent Routing / Plan Compliance / Memory Safety | passed | `npm run eval:agents` |
| 本地真实 Agent 调用 | passed | `npm run acceptance:agent`：完整摘要路由、parent-child、Heartbeat/Resume、收敛拒绝与通过 |
| npm tarball 安装调用 | passed | `npm run smoke:package`：打包、临时安装、Modern tools/list 与 workflow 调用 |
| Node.js 20 最低运行时 | passed | Node 20.20.2 下 81 个测试文件/383 项、双协议、Agent 验收与稳定性循环全部通过 |
| 真实进程稳定性循环 | passed | `npm run stability:soak`：16 个场景、81 次 Workflow 调用、冷启动/热调用/并发/Memory 降级/协议拒绝，0 失败 |
| 生产依赖安全审计 | passed | `npm audit --omit=dev --audit-level=high`：0 vulnerabilities |
| v3.7.0 回退演练 | passed | `npm run smoke:rollback`：npm 安装、Legacy 握手、30 个工具和核心工具发现通过 |

## 6. 真实客户端人工验证矩阵

Reference client 的 `passed` 不等于真实宿主客户端已验证。以下项目必须在对应客户端和版本上实机运行后才能改为 `passed`。

| 客户端 | 客户端版本 | 状态 | 验证日期 | 证据 | 备注 |
|---|---|---|---|---|---|
| MCP Inspector | 2.0.0 | passed | 2026-07-30 | `npm run smoke:inspector`；CLI 连接生产构建并发现 33 个工具 | 已验证 tools/list 与关键 Workflow/Plan 工具发现；其他交互能力继续由 reference matrix 覆盖 |
| Cursor | 3.0.16 | blocked | 2026-07-31 | `docs/specs/mcp-v4/host-compatibility-evidence-2026-07-31.md`；CLI 暴露 `--add-mcp`，但当前安装无法提供可自动化的终端 Agent 调用 | 需在 Cursor GUI 中完成工具发现、路由和同步降级的人工验收；不视为服务端失败 |
| Claude Code | 2.1.179 | passed | 2026-07-31 | `docs/specs/mcp-v4/host-compatibility-evidence-2026-07-31.md`；真实 Claude Code Agent 调用本地 RC 的 `workflow`、`plan_heartbeat`、`resume_plan`、`converge` | 已验证完整意图路由为 `start_feature` + `spec_layout=auto`，Plan 可恢复并通过 Converge；不宣称 GUI 专属行为或显式配置外的文件系统 Skill 自动安装 |
| VS Code Copilot | VS Code 1.104.1 / Copilot Chat 0.31.5 | blocked | 2026-07-31 | `docs/specs/mcp-v4/host-compatibility-evidence-2026-07-31.md`；隔离 MCP 注册成功，但日志显示 `Copilot extension not found` | 当前配置缺少基础 `github.copilot` 扩展，Agent 未进入 MCP 工具执行；补齐宿主后重跑 |
| Cline | 未安装 | blocked | 2026-07-31 | `docs/specs/mcp-v4/host-compatibility-evidence-2026-07-31.md`；VS Code 扩展列表无 Cline，`cline` CLI 不存在 | 安装并记录具名版本后再验证 Legacy/Modern 协商与 Requirements Loop |
| OpenCode | 1.17.11 | blocked | 2026-07-31 | `docs/specs/mcp-v4/host-compatibility-evidence-2026-07-31.md`；本地 RC MCP 连接成功，Agent 启动被外部 `models.dev` 超时阻断 | Transport/发现通过，尚未完成模型驱动的工具调用；依赖恢复后重跑 |

状态只允许：`pending`、`passed`、`failed`、`blocked`。任何客户端不支持扩展时，不得导致 `start_feature`、`start_bugfix`、`start_ui`、Memory 和代码分析不可用。

## 7. 发布判定

- 自动 reference matrix、全量测试、构建、生产冒烟和 Agent Evals 全部通过，是发布候选的必要条件。
- 稳定 RC 还必须通过 Node 20/22、真实进程稳定性循环、生产依赖审计、tarball 安装、v3.7.0 回退和固定版本 Inspector 验收；详细规则见 `docs/rc-stability-policy.md`。
- `4.0.0-rc.1` 只能使用 npm `next`；`latest` 与正式 MCP Registry 仅允许稳定版本。
- 真实客户端尚未验证时，允许生成内部 release candidate，但不得在发布说明中宣称这些客户端已经通过兼容认证。
- 人工矩阵出现 `failed` 时，必须记录复现步骤和降级结果；核心流程无法降级时阻断稳定版发布。
