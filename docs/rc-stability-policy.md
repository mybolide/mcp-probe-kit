# MCP Probe Kit v4 稳定 RC 资格策略

## 目标

本策略定义“可发布的稳定 RC”。RC 只能发布到 npm `next`，不得覆盖 `latest`，也不得写入正式 MCP Registry。

## 硬闸门

候选版本只有同时满足以下条件才可发布：

1. package、Git Tag、package-lock、server metadata、Tool Manifest 与 CHANGELOG 版本完全一致。
2. Node.js 20 最低运行时与 Node.js 22 当前运行时均通过构建、测试和协议冒烟。
3. 全量测试、Legacy/Modern 双协议、直接 Tool Contract Audit、真实 Agent 全工具契约审计、Agent Evals 与 Parent-Child Spec Gate 全部通过。
4. 稳定性循环保持 0 失败，覆盖冷启动、热调用、并发客户端、Memory 故障降级和协议模式拒绝。
5. npm tarball 能在干净临时项目中安装并启动。
6. npm 生产依赖高危漏洞为 0。
7. 固定回退版本 `3.7.0` 可从 npm 安装，并能通过 Legacy 客户端发现核心工具。
8. 固定版本 MCP Inspector 必须连接生产构建并验证：
   - 默认 compact 模型工具面为 23；
   - `MCP_TOOLSET=full` 兼容工具面为 33；
   - 关键 Workflow 与 Plan 工具存在；
   - MCP Apps 专项测试验证 23 个模型工具加 1 个 App-only 动作，而不是把 App-only 动作暴露给模型。
9. MCP Apps 必须通过能力协商、标准 MIME、资源读取、App-only visibility、普通客户端降级测试。
10. 未完成真实验证的宿主必须保持 `pending` 或 `blocked`，不能在发布说明中写成已验证。

## 工具面口径

发布报告必须区分以下数字，禁止笼统写“工具总数”：

| 口径 | 数量 |
|---|---:|
| 默认模型可见工具 | 23 |
| 完整配置 Memory 后模型可见工具 | 29 |
| `MCP_TOOLSET=full` 兼容模型工具 | 33 |
| 当前 App-only 动作 | 1 |

Apps-capable Host 的原始 `tools/list` 可以包含 App-only 动作，但 `_meta.ui.visibility` 必须仅为 `app`，合规 Host 不得将其交给模型选择。

## 真实客户端验证

Claude Code、Cursor、VS Code Copilot、Cline、OpenCode 和 MCP Inspector 必须按具体版本记录状态。Reference client 与自动化协议测试不能替代真实 Host 验收。

发布说明只能使用以下状态：

- `passed`：完成真实客户端调用并保存证据；
- `pending`：尚未完成；
- `blocked`：受宿主、安装或环境问题阻塞。

## RC 发布后观察

RC 发布后，在升级稳定版 `4.0.0` 前至少满足：

- 一个完整观察窗口内无 P0/P1 回归；
- 记录实际安装、启动、工具发现、MCP Apps 协商和核心 Workflow 结果；
- 对失败记录复现步骤、影响范围、宿主版本和解决状态；
- 对计划支持的真实客户端完成验证或明确标注不支持。

未满足观察窗口要求时，只能继续发布新的 `rc.N`，不能晋升为 `latest`。

## 发布与回退

- RC：`npm publish --tag next`，GitHub Release 标记 prerelease。
- 稳定版：无 prerelease 后缀，使用 npm `latest`，并发布 MCP Registry。
- 协议级回退：`MCP_PROTOCOL_MODE=legacy`。
- 工具面回退：`MCP_TOOLSET=full`。
- 包版本回退：固定安装 `mcp-probe-kit@3.7.0`。
