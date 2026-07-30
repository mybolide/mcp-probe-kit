# MCP Probe Kit v4.0 Requirements

## 功能概述

MCP Probe Kit v4.0 将继续作为跨 Agent 的研发治理与执行规范层，而不是源码编辑器。它通过一个 canonical Skill 告诉 Agent 何时调用哪些 MCP 工具，通过 `start_*` 动态生成 delegated plan，并由 Agent 使用宿主文件、终端和 Git 能力完成真实开发。

v4.0 的目标是让不同客户端、不同模型和不同开发者在同一项目中获得一致、规范、可恢复、可验证且能持续学习的研发体验。

## 范围边界

1. canonical Skill 只负责 MCP 工具路由和调用纪律，不承载完整业务 Workflow。
2. `start_*` 继续返回 delegated plan，不直接替 Agent 修改业务源码。
3. Agent 负责读取文件、修改代码、执行命令和 Git 操作。
4. Memory、GitNexus、Spec、质量约束和 Workflow 编排继续作为核心能力。
5. v4.0 必须同时支持 Legacy MCP 与 Modern MCP，不允许因客户端未升级而失效。
6. Modern 扩展不可用时，核心工具必须自动降级到 Legacy 或同步路径。

## 需求列表

### FR-1 Canonical Skill

- 保留一个 `.agents/skills/mcp-probe-kit/SKILL.md`。
- Skill 必须明确区分编排入口与原子工具。
- Skill 必须说明 delegated plan 由 Agent 执行，而非 MCP 已执行。
- Skill 必须覆盖 Memory 的检索、读取、写入、更新和删除规则。
- Skill 内容应支持渐进披露，详细方法可拆入 references，但仍属于同一个 Skill。

### FR-2 Delegated Plan Contract v2

- 所有 `start_*` 最终应返回统一 Plan Contract。
- 必须保留 `mode: delegated` 与 `steps`，兼容 v3 客户端和测试。
- 新结构应包含 planId、workflow、workflowVersion、objective、全局规则、完成条件和记忆策略。
- 每个步骤可表达类型、依赖、输入、输出、完成证据、质量门禁和失败处理。
- Plan Contract 只描述和约束执行，不自动执行 Agent action。
- `start_feature` 的 `spec_layout` 默认为 `auto`：简单局部需求使用 flat，复杂多模块或多阶段需求自动选择 parent-child。
- 显式 `flat` 或 `parent-child` 必须覆盖自动判断；已提供 `subspecs` 时自动选择 parent-child。
- 自动选择 parent-child 但尚未提供 `subspecs` 时，Plan 必须先生成 `decompose-spec` 步骤，不得静默退回 flat。

### FR-3 Memory Learning Loop

- 任务开始前按场景检索历史经验。
- 搜索结果只注入摘要，全文按需读取。
- 完成并验证后提取可复用模式。
- 支持成功经验与失败方案、错误根因、回归案例等负面记忆。
- 项目事实优先于跨项目共享记忆。
- Memory 不可用时必须降级，不得阻断核心 Workflow。

### FR-4 双协议兼容

- v4 业务核心只实现一份。
- Protocol Adapter 负责 Legacy 与 Modern wire format 转换。
- 默认运行模式为自动协商。
- Legacy 客户端继续支持 initialize、现有结构化结果及旧任务路径。
- Modern 客户端支持 2026-07-28 时代能力。
- 用户必须能够显式强制 legacy、modern 或 auto。

### FR-5 能力级降级

- `input_required` 不可用时退回 `interview`、`ask_user` 或 clarification 结果。
- Modern Tasks 不可用时退回 Legacy Tasks 或同步执行。
- Apps 不可用时退回 structuredContent 与 Markdown。
- Progress 不可用或客户端不稳定时，不影响最终结果。
- Resources 不可用时，Skill 与项目上下文仍可通过项目文件提供。

### FR-6 Internal Task Runtime

- Task 核心状态不得与某一 SDK 协议实现耦合。
- LegacyTaskAdapter、ModernTaskAdapter 和 SynchronousFallback 共用内部任务模型。
- `start_*` 仅生成计划时不得强制创建 Task。
- Task 主要用于 GitNexus 深度分析、批量测试、扫描、记忆处理等耗时操作。

### FR-7 Tool Registry

- 工具名称、描述、Schema、Annotation、Toolset、Handler、Task 策略和协议能力应来自单一注册源。
- `tools/list`、工具分发、manifest、Skill 路由表和文档应由 Registry 派生。
- 不得长期维护大型手工 switch 作为唯一分发方式。

### FR-8 Converge 与恢复

- 系统 SHALL 提供统一收敛检查，对照目标、Spec、实现、测试、Review 和记忆写入许可。
- 长流程 SHALL 通过轻量 Plan Heartbeat 持久化步骤、证据、未决事项和最后验证 revision。
- `resume_plan` SHALL 依据持久化 Plan 与依赖恢复下一可执行步骤，不依赖原始完整对话。
- `converge` 未通过前，系统 SHALL 拒绝将本次结论作为正式长期记忆写入。

## 非功能需求

- v3 工具名称和主要输入输出在 v4 首个稳定版本中保持兼容。
- 核心流程不依赖 Qdrant、GitNexus、Apps 或现代 Tasks 才能运行。
- 所有协议与能力降级必须有自动化测试。
- Tool Annotation 必须与实际副作用一致。
- 全量测试不得重复扫描 build 产物。
- 新架构应逐步拆分 `src/index.ts`，避免单文件继续承担全部职责。

## 依赖关系

- FR-1、FR-2 与 FR-7 由 `core-governance` 子规格负责，是其他能力域的基础。
- FR-3 与 FR-8 依赖统一 Plan Contract，由 `memory-convergence` 子规格负责。
- FR-4 与 FR-5 依赖共享业务核心，由 `protocol-compatibility` 子规格负责。
- FR-6 依赖协议能力模型，由 `task-runtime` 子规格负责。
- 详细依赖以 `spec-manifest.json` 为机器可读 SSOT。

## 发布硬门槛

1. Legacy 与 Modern reference client 均能完成 tools/list、tools/call 和 resources/read。
2. `start_feature`、`start_bugfix`、`start_ui` 的 delegated 语义不变。
3. Memory 全链路在 Legacy 和 Modern 下均可调用。
4. 不支持 Tasks、Progress、Apps、input_required 的客户端仍能完成核心流程。
5. v3 回归测试、v4 协议测试和客户端兼容测试全部通过。
