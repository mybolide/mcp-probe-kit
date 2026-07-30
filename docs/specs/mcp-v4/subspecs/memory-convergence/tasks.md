# 子任务：记忆学习与收敛恢复

- [ ] 1.1 区分 Project Knowledge 与 Shared Experience — _需求: FR-3_
  - 证据块：检索排序测试证明项目事实优先，Qdrant 不可用降级测试通过。
  - 涉及文件：`src/lib/memory-config.ts`、`src/lib/memory-orchestration.ts`。
- [ ] 1.2 扩展成功与负面记忆数据模型 — _需求: FR-3_
  - 证据块：failed_approach、false_root_cause、regression_case 的写入、检索、更新和失效测试。
  - 涉及文件：Memory Schema、CRUD 工具和 Qdrant payload。
- [ ] 2.1 实现 Converge、Plan Heartbeat 与 resume_plan — _需求: FR-8_
  - 证据块：不完整实现被拦截、完整实现通过、会话中断后恢复到正确步骤的集成测试。
  - 涉及文件：`src/tools/converge.ts`、`src/plans/plan-heartbeat.ts`、`src/plans/plan-resume.ts`。
