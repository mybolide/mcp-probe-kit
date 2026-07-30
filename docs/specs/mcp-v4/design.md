# MCP Probe Kit v4.0 Design

## 概述

**对应需求：** FR-1、FR-2、FR-3、FR-4、FR-5、FR-6、FR-7、FR-8

```text
Canonical SKILL.md
        ↓
Tool Registry / Router
        ↓
Delegated Workflow Builders (start_*)
        ↓
Agent Native Execution
        ↓
Spec / Review / Memory / GitNexus

Protocol Compatibility Layer
├── Legacy Adapter
└── Modern Adapter

Task Runtime
├── Legacy Task Adapter
├── Modern Task Adapter
└── Synchronous Fallback
```

## 技术方案

### D-1 单 Skill 而非多 Workflow Skill

保留 canonical Skill。它是 mcp-probe-kit 的工具调用手册，不是 Feature、Bugfix、UI 等流程的正文。具体流程由 `start_*` 根据当前任务动态生成。

### D-2 保留 delegated orchestration

MCP 不接管宿主 Agent 的文件和终端能力。Plan Contract 负责：

- 告诉 Agent 当前目标；
- 给出工具调用和 Agent action；
- 表达顺序、证据、门禁和失败路径；
- 提供恢复和记忆策略。

### D-3 Workflow 与 Task 分离

完整研发流程是 delegated plan；Task 只是其中某个耗时操作的异步载体。一个 plan 可包含零个或多个 Task。

### D-4 Memory 是主链路

Memory 不作为附加插件处理。所有主要 `start_*` 都应具有：

```text
recall → consume → execute → validate → extract → memorize
```

Memory 不可用时返回明确降级状态，但不得阻断开发计划。

### D-5 双协议、一套业务核心

业务代码不直接判断协议时代。连接和扩展差异收敛到适配层：

```ts
createProbeCore()
createLegacyServer(core)
createModernServer(core)
```

### D-6 复杂需求自动采用子母 Spec

`start_feature` 是智能编排入口，默认使用 `spec_layout=auto`。布局决策遵循：

1. 显式 `flat` / `parent-child` 优先；
2. 已提供 `subspecs` 时直接采用 parent-child；
3. 根据多阶段、结构化需求项、跨能力域和架构级关键词评分；
4. 达到复杂度阈值时选择 parent-child；
5. 缺少具体子规格定义时，先返回 `decompose-spec` Agent action，再调用 `add_feature`；
6. 原子工具 `add_feature` 仍保持显式布局，避免缺少上下文时意外扩大输出。

布局决策必须放入结构化 metadata，便于 Agent、测试和客户端解释为什么采用某种规格结构。

## 文件结构

```text
src/
  server/
    create-server.ts
    tool-registry.ts
    tool-dispatcher.ts
  protocol/
    capability-resolver.ts
    legacy-adapter.ts
    modern-adapter.ts
  tasks/
    task-runtime.ts
    legacy-task-adapter.ts
    modern-task-adapter.ts
    sync-task-adapter.ts
  plans/
    delegated-plan-contract.ts
    spec-layout-decision.ts
    plan-heartbeat.ts
    plan-resume.ts
  resources/
    project-resources.ts
    graph-resources.ts
    app-resources.ts
```

迁移过程中允许旧文件与新模块并存，但新业务不再继续堆入 `src/index.ts`。

## 4. Delegated Plan Contract

```ts
interface DelegatedPlanContract {
  planId: string;
  mode: 'delegated';
  contractVersion: '2.0.0';
  workflow: string;
  workflowVersion: string;
  objective: string;
  steps: DelegatedPlanStep[];
  globalRules: string[];
  completionCriteria: string[];
  memoryPolicy: DelegatedMemoryPolicy;
  resumeContext?: DelegatedResumeContext;
}
```

v4 初期采用“增量增强”方式：保留现有 `mode` 和 `steps`，增加字段，不改变旧客户端读取路径。

## 5. Protocol Compatibility

### Legacy

- 兼容现有 initialize 流程；
- 保留传统 tools/list、tools/call、resources；
- 保留现有 clarification、interview、ask_user；
- 保留 Legacy Task Adapter。

### Modern

- 支持 server/discover 与无状态请求；
- 支持 `input_required`；
- 支持现代 Tasks 扩展，但首个版本默认 experimental；
- 支持现代 Apps 和扩展能力协商。

### 降级优先级

```text
Modern extension
→ Legacy equivalent
→ synchronous or structured fallback
```

## 6. 测试架构

- 单元测试仅扫描 `src/**/*.test.ts`；
- build 产物使用独立 smoke test；
- Legacy reference client 集成测试；
- Modern reference client 集成测试；
- capability 降级矩阵测试；
- Tool route 与 Plan Compliance eval；
- Memory relevance 与污染防护 eval。
