# 子任务：内部任务运行时与协议适配

- [x] 1.1 定义 InternalTask 状态机与持久化接口 — _需求: FR-6_
  - 证据块：queued/working/input_required/completed/failed/cancelled 状态转换、幂等创建、并发 start、失败重试、取消和恢复测试；JSON Store 使用原子替换持久化并以条件写入阻止旧状态覆盖新状态。
  - 涉及文件：`src/tasks/task-types.ts`、`task-store.ts`、`task-runtime.ts`、`task-runtime.unit.test.ts`、`task-store.unit.test.ts`。
- [x] 1.2 实现 Legacy、Modern 与同步 Adapter — _需求: FR-6_
  - 证据块：相同 executor 在 Sync、Legacy、Modern 三路径返回等价结果；Legacy Adapter 已接入真实 Tool Handler，Task Store 缺失时自动同步降级。
  - 涉及文件：`src/tasks/legacy-task-adapter.ts`、`modern-task-adapter.ts`、`sync-task-adapter.ts`、`src/server/register-tool-handlers.ts`。
- [x] 2.1 完成 Progress、Cancellation 与断线恢复测试 — _需求: FR-6_
  - 证据块：晚到 Progress 不再外发；请求断开与客户端取消均保留 cancelled；JSON 重启遗留任务明确标记不可恢复；真实 MCP Client 完成 tools/call → tasks/get → tasks/result。
  - 涉及文件：`task-adapters.unit.test.ts`、`legacy-task-protocol.integration.test.ts`、`task-store.unit.test.ts`。
