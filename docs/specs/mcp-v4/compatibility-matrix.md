# MCP Probe Kit v4 Compatibility Matrix

## 1. 协议能力

| 能力 | Legacy MCP | Modern MCP | v4.0.0-rc.3 行为 |
|---|---|---|---|
| 工具发现 | initialize + tools/list | Modern opening + tools/list | 共用 Tool Registry 与工具顺序 |
| 工具调用 | tools/call | tools/call | 共用业务 Handler |
| 需求澄清 | SDK shim 或结构化 loop | 客户端声明 form elicitation 后使用 input_required | 未声明能力时自动降级，不伪造交互 |
| Tasks | Legacy Task wire：get/result/list/cancel | Modern Tasks 尚未接入原生 wire adapter | Modern Task 请求同步执行并返回正常工具结果 |
| Progress | notifications/progress | notifications/progress | 默认关闭；通知失败不影响最终工具结果 |
| Resources | 支持 | 支持 | 普通资源始终可用 |
| MCP Apps | 不支持时文本降级 | 协商 `io.modelcontextprotocol/ui` 后启用 | 使用 `text/html;profile=mcp-app` 与稳定 `ui://` 资源 |

## 2. 工具面

| 配置 | 模型可见工具 | Apps-capable Host 原始 tools/list | 说明 |
|---|---:|---:|---|
| 默认 / `MCP_TOOLSET=compact` | 23 | 24 | 23 个模型工具 + `list_memory_assets` App-only 动作 |
| `compact` + 完整 Memory 配置 | 29 | 30 | 增加 6 个模型可见 Memory 工具 |
| `MCP_TOOLSET=full` | 33 | 34 | 33 个兼容模型工具 + 1 个 App-only 动作 |

App-only 动作使用 `_meta.ui.visibility=["app"]`，不计入模型可见工具数，也不得由合规 Host 提供给模型选择。

## 3. 产品能力

| 产品能力 | v3 Client | v4 Legacy Mode | v4 Modern Mode |
|---|---:|---:|---:|
| Canonical Skill | 支持 | 支持 | 支持 |
| `start_*` delegated plan | 支持 | 支持 | 支持 |
| Plan Heartbeat / Resume / Converge | 不支持 | 支持 | 支持 |
| Memory CRUD | 支持 | 支持 | 支持 |
| Memory Center | 不支持 | Host 支持 Apps 时可用 | Host 支持 Apps 时可用 |
| GitNexus code insight | 支持 | 支持 | 支持 |
| Spec Gate / Parent-Child Spec | 支持 | 支持 | 支持 |
| SRC-8 | 支持 | 支持 | 支持 |
| input_required | 不支持 | 通过 shim/loop 降级 | Host 声明能力时启用 |
| Modern Tasks | 不支持 | 不适用 | 同步降级，原生扩展待接入 |

## 4. 运行模式

| 环境变量 | 行为 | 使用场景 |
|---|---|---|
| `MCP_PROTOCOL_MODE=auto` | 自动协商 Legacy / Modern | 默认生产配置 |
| `MCP_PROTOCOL_MODE=legacy` | 固定 Legacy opening 和 Legacy Tasks | 兼容诊断 |
| `MCP_PROTOCOL_MODE=modern` | 拒绝 Legacy opening | Modern 协议验证 |
| `MCP_TOOLSET=compact` | 23/29 个模型工具 | 默认推荐 |
| `MCP_TOOLSET=full` | 33 个模型工具 | 兼容和诊断 |
| `MCP_ENABLE_UI_APPS=0` | 禁用 Apps metadata、资源和 App-only 调用 | Host Apps 兼容诊断 |

运行时要求 Node.js 20 或更高。SDK v2 精确锁定 `@modelcontextprotocol/server`、`client`、`core` 2.0.0；MCP Apps 构建 SDK 精确锁定 1.7.2。

## 5. Reference client 自动验证状态

| 验证项 | 状态 | v4.0.0-rc.3 证据 |
|---|---|---|
| Legacy tools/resources | passed | `src/protocol/__tests__/dual-era-stdio.integration.test.ts` |
| Modern tools/resources | passed | 同上 |
| Legacy Task wire | passed | Legacy Task integration + `npm run smoke:protocol` |
| Modern Task 同步降级 | passed | dual-era integration + production smoke |
| Modern input_required | passed | 接受、拒绝、取消、无 capability 分支 |
| Plan Heartbeat / Resume / Converge | passed | Plan lifecycle tests + production smoke |
| MCP Apps 能力协商与普通客户端降级 | passed | `src/protocol/__tests__/mcp-apps.integration.test.ts` |
| App-only visibility | passed | `list_memory_assets` 为 `visibility=["app"]` |
| Memory Center 浏览动作 | passed | `src/tools/__tests__/list_memory_assets.unit.test.ts` |
| Agent Routing / Plan Compliance / Memory Safety | passed | Agent Evals 25/25 |
| 本地真实 Agent 调用 | passed | `npm run acceptance:agent`，默认 23 个模型工具；Claude Code 33/33 逐工具审计通过 |
| Tool Contract Audit | passed | 38/38 调用；compact 23、Memory 29、full 33、App-only 与 Legacy sample 全部闭环 |
| Claude Code 全工具真实 Agent 审计 | passed | 33/33 工具、7/7 批次、0 契约失败、0 missing/unexpected |
| npm tarball 安装启动 | passed | 374 entries，安装后 23 个模型工具 |
| 稳定性循环 | passed | 16 场景、81 次 Workflow 调用、0 失败 |
| MCP Inspector 2.0.0 | passed | compact 24 raw/23 model；full 34 raw/33 model |
| 生产依赖安全审计 | passed | 0 vulnerabilities |
| v3.7.0 回退 | passed | Legacy 发现 30 个工具及核心工具 |
| 完整发布闸门 | passed | 85 个测试文件、401 项测试、38/38 Tool Contract Audit、25/25 Agent Evals，`npm run release:verify` exit 0 |

详细自动化证据见 `docs/specs/mcp-v4/rc3-release-evidence-2026-07-31.md`；rc.2 历史证据保留在同目录。

## 6. 真实客户端人工验证矩阵

Reference client、Inspector 和本地脚本通过，不等同于所有真实编辑器 Host 已通过当前 RC。状态必须绑定候选版本。

| 客户端 | 客户端版本 | 当前 rc.3 状态 | 已有证据 | 备注 |
|---|---|---|---|---|
| MCP Inspector | 2.0.0 | passed | `npm run smoke:inspector` | 已验证 Apps 协商、App-only 与 compact/full 工具面 |
| Claude Code | 2.1.179 | passed | `npm run audit:tools:agent`：全部 33 个模型工具真实调用，7/7 批次通过 | 0 契约失败、0 missing/unexpected；一次非阻塞重复 `start_ralph`；Host 未协商 MCP Apps，未宣称 GUI 通过 |
| Cursor | 3.0.16 | pending | rc.2 已真实调用 `workflow`、`start_feature`、`start_bugfix`、Memory CRUD，并成功渲染 Feature Workbench 与 Memory Center | rc.3 已重做视觉与进度交互，发布后需复核新界面；不得用 rc.2 截图冒充 rc.3 通过证据 |
| VS Code Copilot | VS Code 1.104.1 / Copilot Chat 0.31.5 | blocked | 同上 | 当前配置缺少基础 Copilot 扩展 |
| Cline | 未安装 | blocked | 同上 | 需安装具体版本后验证 |
| Codex CLI | 0.144.1 | passed | 本地 rc.2 `workflow` 实际调用 | 返回 `scenario=feature`、`firstTool=start_feature`；文本与 structuredContent 对称且下一步可执行 |
| OpenCode | 1.17.11 | blocked | 本地 rc.2 MCP 显示 connected | 直连 `models.dev` 超时、代理访问成功；`openzen-1/deepseek-v4-flash-free` 等 Provider 仍无模型响应，未进入工具调用 |

允许状态：`pending`、`passed`、`failed`、`blocked`。只有当前候选版本在命名 Host 中完成实际工具调用后，才能标记为 `passed`。

## 7. 发布判断

- `v4.0.0-rc.3` 本地自动发布闸门已经通过。
- RC 只能发布到 npm `next` 并创建 GitHub prerelease；不得更新 `latest` 或正式 MCP Registry。
- MCP Inspector 2.0.0 已通过当前候选版本。
- Claude Code 2.1.179 的 33/33 工具审计与 Codex CLI 0.144.1 的 `workflow` 调用来自 rc.2 基线；rc.3 未改变模型工具面与协议契约，自动回归已通过，但命名 Host 的 rc.3 复核仍应单独记录。
- Cursor 的 rc.2 核心工具与 MCP Apps 基础渲染已通过，rc.3 新视觉待发布后复核；VS Code Copilot、Cline 和 OpenCode 仍为 `blocked`，OpenCode 仅确认 MCP 连接成功。
