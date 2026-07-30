# 子规格：SDK v2 与双协议兼容

## 范围

在一套共享业务核心之外实现 Legacy 与 Modern MCP 协议适配、能力协商、`input_required` 降级和客户端兼容矩阵。

## 需求回链

- FR-4
- FR-5

## 验收标准（EARS）

1. WHEN Legacy MCP 客户端连接 THEN 系统 SHALL 保持 initialize、现有 tools/resources 和旧结构化结果可用。
2. WHEN Modern MCP 客户端连接 THEN 系统 SHALL 使用 2026-07-28 协议能力，并根据客户端声明启用扩展。
3. WHEN 客户端不支持 `input_required` THEN 系统 SHALL 降级为 `interview`、`ask_user` 或结构化 clarification，而不丢失需求澄清语义。
4. WHEN Apps、Progress、Resources 或现代 Tasks 不可用 THEN 核心 `start_*`、Memory 与代码分析 SHALL 继续运行。
5. WHEN 用户设置协议模式 THEN 系统 SHALL 支持 `auto|legacy|modern`，默认使用 auto。

## 涉及文件

- `src/protocol/capability-resolver.ts`
- `src/protocol/legacy-adapter.ts`
- `src/protocol/modern-adapter.ts`
- stdio 与 HTTP 启动入口
- reference client 测试

## 不做项

- 本子规格不删除 v3 维护分支或紧急旧运行时。
- 本子规格不把 Modern 扩展设为核心 Workflow 的强制依赖。

## 设计要点

- 业务核心不散布 `if (modern)` 分支。
- 协议时代与具体 capability 分开判断。
- Modern extension → Legacy equivalent → synchronous / structured fallback。
- v4 使用 SDK v2 双协议能力，v3 SDK v1 作为发布级紧急回退。
