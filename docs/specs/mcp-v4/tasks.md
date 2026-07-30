# MCP Probe Kit v4.0 Tasks

## 交付物清单

- `docs/specs/mcp-v4/` 母规格、manifest 与四组子规格。
- Tool Registry、Delegated Plan Contract、Memory、Protocol 和 Task Runtime 实现。
- Legacy / Modern reference client 与能力降级测试。
- 客户端兼容矩阵、Evals、迁移说明和发布产物。

## 任务列表

- [x] 0.1 建立 v4 基线与 parent-child 规格 — _需求: FR-1, FR-2, FR-7_
  - 证据块：`docs/specs/mcp-v4/spec-manifest.json` 与 `check_spec` 结果。
  - 子任务引用：core-governance/1.1、core-governance/1.2、core-governance/1.3。
- [ ] 0.2 完成核心治理与 Server 解耦 — _需求: FR-1, FR-2, FR-7_
  - 证据块：Tool Registry 生成物一致性测试、`src/index.ts` 职责收敛报告。
  - 子任务引用：core-governance/2.1、core-governance/2.2、core-governance/2.3。
- [ ] 0.3 完成 Memory 2.0、Converge 与恢复 — _需求: FR-3, FR-8_
  - 证据块：Memory relevance eval、失败经验召回测试、resume_plan 恢复测试。
  - 子任务引用：memory-convergence/1.1、memory-convergence/1.2、memory-convergence/2.1。
- [ ] 0.4 完成 SDK v2 双协议兼容 — _需求: FR-4, FR-5_
  - 证据块：Legacy / Modern reference client 集成测试和 capability 降级矩阵。
  - 子任务引用：protocol-compatibility/1.1、protocol-compatibility/1.2、protocol-compatibility/2.1。
- [ ] 0.5 完成 Task Runtime 与适配器 — _需求: FR-6_
  - 证据块：Legacy、Modern、同步三路径测试及取消/进度竞态测试。
  - 子任务引用：task-runtime/1.1、task-runtime/1.2、task-runtime/2.1。

## 需求覆盖矩阵

| FR ID | 子规格 | 任务引用 | 状态 |
|---|---|---|---|
| FR-1 | core-governance | core-governance/1.1、core-governance/2.3 | 进行中 |
| FR-2 | core-governance | core-governance/1.2、core-governance/1.3 | 进行中 |
| FR-3 | memory-convergence | memory-convergence/1.1、memory-convergence/1.2 | 未开始 |
| FR-4 | protocol-compatibility | protocol-compatibility/1.1、protocol-compatibility/1.2 | 未开始 |
| FR-5 | protocol-compatibility | protocol-compatibility/2.1 | 未开始 |
| FR-6 | task-runtime | task-runtime/1.1、task-runtime/1.2、task-runtime/2.1 | 未开始 |
| FR-7 | core-governance | core-governance/2.1、core-governance/2.2 | 未开始 |
| FR-8 | memory-convergence | memory-convergence/2.1 | 未开始 |

## 文件变更清单

| 范围 | 主要路径 | 操作 |
|---|---|---|
| 核心治理 | `src/lib/`、`src/server/`、`src/tools/start_*` | 重构 / 新增 |
| 记忆与收敛 | `src/lib/memory-*`、`src/tools/*memory*`、`src/tools/converge.ts` | 增强 / 新增 |
| 协议适配 | `src/protocol/`、启动入口 | 新增 / 重构 |
| Task Runtime | `src/tasks/` | 新增 |
| 测试 | `src/**/__tests__/`、reference clients、scripts | 新增 / 调整 |
| 文档 | `docs/specs/mcp-v4/`、README、迁移说明 | 新增 / 更新 |

## 子规格任务覆盖矩阵

子规格 `tasks.md` 是任务明细的唯一来源；母任务只维护阶段、FR 覆盖和引用。每个子任务以 `子规格 ID/任务 ID` 回链到本文件。
