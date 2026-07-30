# 子规格：记忆学习与收敛恢复

## 范围

升级 Project Knowledge 与 Shared Experience 的分层记忆机制，支持成功和失败经验、阶段化检索、最终 Converge 以及会话中断后的轻量计划恢复。

## 需求回链

- FR-3
- FR-8

## 验收标准（EARS）

1. WHEN `start_*` 启动研发任务 THEN 系统 SHALL 先检索相关项目事实与历史经验，并优先服从当前项目代码和规格。
2. WHEN Agent 需要完整历史资产 THEN 系统 SHALL 先返回摘要候选，再通过 `read_memory_asset` 按需读取全文。
3. WHEN 修复方案失败、根因被证伪或出现回归 THEN 系统 SHALL 允许沉淀 `failed_approach`、`false_root_cause` 或 `regression_case` 负面记忆。
4. WHEN 需求、Spec、实现、测试或 Review 尚未对齐 THEN `converge` SHALL 拒绝完成并返回未关闭事项。
5. WHEN 会话中断或上下文被压缩 THEN `resume_plan` SHALL 依据结构化恢复状态返回当前步骤、已完成项和下一动作。

## 涉及文件

- `src/lib/memory-*`
- `src/tools/search_memory.ts`
- `src/tools/read_memory_asset.ts`
- `src/tools/memorize_asset.ts`
- `src/tools/scan_and_extract_patterns.ts`
- `src/tools/converge.ts`
- `src/plans/plan-resume.ts`

## 不做项

- 本子规格不负责 MCP wire protocol 版本协商。
- 本子规格不把所有对话内容无差别写入共享记忆。

## 设计要点

- 项目事实覆盖跨项目经验。
- 记忆对象增加证据、适用边界、置信度、失效时间和替代关系。
- 正式写入应在验证或 Converge 通过后发生。
- Qdrant 不可用时降级但不得阻断核心 Workflow。
