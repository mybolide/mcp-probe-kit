# 子任务：SDK v2 与双协议兼容

- [x] 1.1 建立 protocol capability model 与双协议入口 — _需求: FR-4_
  - 证据块：`MCP_PROTOCOL_MODE=auto|legacy|modern`；SDK v2 `serveStdio(factory)` 在 auto 下分别与 Legacy、Modern reference client 完成 tools/list、tools/call、resources/read；固定模式会拒绝不匹配 opening。
  - 涉及文件：`src/protocol/protocol-capabilities.ts`、`src/index.ts`、`dual-era-stdio.integration.test.ts`。
- [x] 1.2 升级 SDK v2 并实现 Legacy / Modern Adapter — _需求: FR-4_
  - 证据块：拆分 SDK v2 包锁定为 2.0.0；Node 最低版本 20；旧 SDK experimental Task Store 被自管 Legacy wire store 替换；71 个测试文件全绿且旧工具/资源语义无未审核差异。
  - 涉及文件：`package.json`、`package-lock.json`、`src/protocol/`、Server factory 与 v2 Schema 边界。
- [x] 2.1 实现能力级降级与客户端兼容矩阵 — _需求: FR-5_
  - 证据块：Modern/Legacy `input_required`、无 elicitation 的结构化 loop、拒绝回答、Legacy Tasks、Modern Task 同步降级、Resources、Apps/Progress 默认关闭均有自动化验证；status 只报告实际可用能力。
  - 涉及文件：`requirements-input-bridge.ts`、`protocol-capabilities.ts`、兼容测试与 `compatibility-matrix.md`。
