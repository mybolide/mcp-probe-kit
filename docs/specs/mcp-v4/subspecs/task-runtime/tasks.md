# 子任务：内部任务运行时与协议适配

- [ ] 1.1 定义 InternalTask 状态机与持久化接口 — _需求: FR-6_
  - 证据块：状态转换、重复请求、失败、取消和恢复单元测试。
  - 涉及文件：`src/tasks/task-runtime.ts`、Task Store。
- [ ] 1.2 实现 Legacy、Modern 与同步 Adapter — _需求: FR-6_
  - 证据块：相同内部任务在三种路径下返回等价业务结果。
  - 涉及文件：`src/tasks/legacy-task-adapter.ts`、`modern-task-adapter.ts`、`sync-task-adapter.ts`。
- [ ] 2.1 完成 Progress、Cancellation 与断线恢复测试 — _需求: FR-6_
  - 证据块：晚到 progress 不报协议错误，取消与断线场景结果确定。
  - 涉及文件：Task 集成测试与 reference client 测试。
