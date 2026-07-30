# 子任务：记忆学习与收敛恢复

- [x] 1.1 区分 Project Knowledge 与 Shared Experience — _需求: FR-3_
  - 证据块：当前项目记忆在相近相关度下优先，但不会压过明显更高相关的共享经验；Qdrant 不可用时返回 degraded 状态且不阻断主流程。
  - 实现：新增 `memory-ranking.ts`，以 `MEMORY_REPO_ID` 识别当前项目，以 `MEMORY_PROJECT_PRIORITY_BOOST` 控制有限加权；搜索文本和结构化结果明确标注 project/shared 范围。
  - 验证：Memory 定向 7 文件/22 项、全量 74 文件/354 项、生产构建通过。
  - 涉及文件：`src/lib/memory-config.ts`、`src/lib/memory-ranking.ts`、`src/lib/memory-client.ts`、`src/lib/memory-orchestration.ts`、`src/tools/search_memory.ts`。
- [ ] 1.2 扩展成功与负面记忆数据模型 — _需求: FR-3_
  - 证据块：failed_approach、false_root_cause、regression_case 的写入、检索、更新和失效测试。
  - 涉及文件：Memory Schema、CRUD 工具和 Qdrant payload。
- [ ] 2.1 实现 Converge、Plan Heartbeat 与 resume_plan — _需求: FR-8_
  - 证据块：不完整实现被拦截、完整实现通过、会话中断后恢复到正确步骤的集成测试。
  - 涉及文件：`src/tools/converge.ts`、`src/plans/plan-heartbeat.ts`、`src/plans/plan-resume.ts`。
