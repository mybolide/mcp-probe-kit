# MCP Probe Kit v4 Compatibility Matrix

## 1. 协议时代

| 能力 | Legacy MCP | Modern MCP | 降级策略 |
|---|---|---|---|
| 工具发现 | initialize + tools/list | server/discover / tools/list | 保持同一 Tool Registry |
| 工具调用 | tools/call | tools/call | 同一业务 Handler |
| 需求澄清 | interview / ask_user / loop | input_required | Modern 不支持时退回 Legacy 问题列表 |
| Tasks | Legacy experimental adapter | Tasks extension adapter | 均不可用时同步或 delegated action |
| Progress | notifications/progress | negotiated progress | 默认非关键、失败不影响结果 |
| Resources | Legacy resources | Modern resources | 缺失时使用项目文件 |
| Apps | preview/meta | standard app resource | structuredContent + Markdown |

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
| Modern Tasks | 不支持 | 降级 | 实验启用 |

## 3. 首批验证客户端

- MCP Inspector Legacy Client
- SDK v1 reference client
- SDK v2 Legacy-era client
- SDK v2 Modern-era client
- Cursor
- Claude Code
- VS Code Copilot
- Cline / OpenCode（按可用能力验证）

任何客户端不支持扩展时，不得导致 `start_feature`、`start_bugfix`、`start_ui`、Memory 和代码分析不可用。
