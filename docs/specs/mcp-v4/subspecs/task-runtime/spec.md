# 子规格：内部任务运行时与协议适配

## 范围

建立与 SDK wire format 解耦的 Internal Task Runtime，并提供 Legacy Task Adapter、Modern Task Adapter 和 Synchronous Fallback。

## 需求回链

- FR-6

## 验收标准（EARS）

1. WHEN `start_*` 只生成 delegated plan THEN 系统 SHALL 同步返回计划，不得无意义创建 Task。
2. WHEN GitNexus 深度分析、全量测试或批量记忆处理需要长时间执行 THEN 系统 SHALL 根据客户端 capability 选择 Modern Task、Legacy Task 或同步降级。
3. WHEN Task 被取消 THEN Runtime SHALL 中止可取消工作并保留明确的 cancelled 状态。
4. WHEN Progress 通知晚到或客户端不消费 THEN 系统 SHALL 以 tool/task result 为最终状态，不得产生流程错误。
5. WHEN服务进程重启且任务配置要求持久化 THEN Runtime SHALL 能恢复必要状态或明确报告不可恢复原因。

## 涉及文件

- `src/tasks/task-runtime.ts`
- `src/tasks/legacy-task-adapter.ts`
- `src/tasks/modern-task-adapter.ts`
- `src/tasks/sync-task-adapter.ts`
- Task 与 Progress 测试

## 不做项

- 本子规格不把整个 Feature 或 Bugfix Workflow 建模成单一 MCP Task。
- 本子规格不以 Progress 百分比作为任务完成判据。

## 设计要点

- `workflow/planId` 与 `taskId` 分开。
- 一个 delegated plan 可包含零个或多个异步 Task。
- Task Adapter 只转换协议语义，任务状态机和执行核心共用一套实现。
- 现代 Tasks 首版可标记 experimental，但同步路径必须始终可用。
