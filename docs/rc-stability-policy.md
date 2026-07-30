# MCP Probe Kit v4 Stable RC Qualification Policy

## 目标

本策略定义“可发布的稳定 RC”，而不是稳定版 `latest`。RC 只能发布到 npm `next`，不得更新 `latest` 或正式 MCP Registry。

## 硬闸门

候选版本只有同时满足以下条件才可发布：

1. 版本、Git Tag、package-lock、server metadata、Tool Manifest 和 Changelog 完全一致。
2. Node.js 20 最低运行时与 Node.js 22 当前运行时均通过测试、构建和协议冒烟。
3. 全量测试、Legacy/Modern 双协议、真实 Agent 调用、Agent Evals 和 Parent-Child Spec 闸门全部通过。
4. 稳定性循环必须 0 失败，覆盖冷启动、连续调用、并发客户端、Memory 故障降级和协议模式拒绝。
5. npm tarball 必须能够在干净临时项目中安装并启动。
6. npm 生产依赖高危审计必须为 0。
7. 固定回退版本 `3.7.0` 必须仍可从 npm 安装、完成 Legacy 握手并暴露核心工具。
8. 固定版本 MCP Inspector 必须真实连接生产构建并发现 33 个工具。
9. 未实机验证的宿主客户端必须保持 `pending`，不得在发布说明中宣称已认证。

## 当前 RC 允许的 pending

Cursor、Claude Code、VS Code Copilot、Cline 和 OpenCode 可在 RC 发布时保持 `pending`，前提是：

- Reference client、MCP Inspector 和协议降级路径已通过；
- 对应客户端不支持扩展时核心 `start_*`、Memory、Spec Gate 和代码分析仍有同步或 Legacy 降级；
- 发布说明明确这些宿主尚未认证。

这些 pending 会阻断稳定版 `4.0.0` 的兼容性宣传，但不阻断内部或公开 RC 的 `next` 发布。

## RC 发布后观察

RC 发布后，升级稳定版 `4.0.0` 前至少需要：

- 一个完整观察窗口内无 P0/P1 回归；
- 记录实际安装、启动、工具发现和核心 Workflow 的结果；
- 对出现的失败记录复现步骤、影响范围和回退结果；
- 至少完成目标宿主客户端矩阵中计划支持项的实机验证，或明确降级/不支持声明。

未满足观察要求时只能继续发布新的 `rc.N`，不能提升为 `latest`。

## 发布与回退

- RC：`npm publish --tag next`，GitHub Release 标记 prerelease。
- 稳定版：仅无 prerelease 后缀版本使用 `latest` 并发布 MCP Registry。
- 紧急回退：优先设置 `MCP_PROTOCOL_MODE=legacy`；仍无法恢复时固定安装 `mcp-probe-kit@3.7.0`。
