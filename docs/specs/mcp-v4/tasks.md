# MCP Probe Kit v4.0 Tasks

## 交付物清单

- `docs/specs/mcp-v4/` 母规格、manifest 与五组子规格。
- Tool Registry、Delegated Plan Contract、Memory、Protocol 和 Task Runtime 实现。
- Legacy / Modern reference client 与能力降级测试。
- 客户端兼容矩阵、Evals、迁移说明和发布产物。

## 任务列表

- [x] 0.1 建立 v4 基线与 parent-child 规格 — _需求: FR-1, FR-2, FR-7_
  - 证据块：`docs/specs/mcp-v4/spec-manifest.json` 与 `check_spec` 结果。
  - 子任务引用：core-governance/1.1、core-governance/1.2、core-governance/1.3。
- [x] 0.2 完成核心治理与 Server 解耦 — _需求: FR-1, FR-2, FR-7_
  - 证据块：Tool Registry 生成物一致性测试、`src/index.ts` 28 行职责收敛、stdio initialize/list/read/call 冒烟验证。
  - 子任务引用：core-governance/2.1、core-governance/2.2、core-governance/2.3。
- [x] 0.3 完成 Memory 2.0、Converge 与恢复 — _需求: FR-3, FR-8_
  - 证据块：项目/共享记忆排序、负面经验生命周期、失败经验召回、Plan Heartbeat、resume_plan 与 Converge 证据闸门均有自动化和生产冒烟验证；正式记忆写入严格位于 Converge 之后。
  - 当前进度：memory-convergence/1.1、1.2、2.1 全部完成。
  - 最终验证：78 个测试文件、375 项全部通过；生产构建、33 工具 Canonical Skill、功能校验、Legacy/Modern 双协议冒烟与 8 FR/4 子规格闸门通过。
  - 子任务引用：memory-convergence/1.1、memory-convergence/1.2、memory-convergence/2.1。
- [x] 0.4 完成 SDK v2 双协议兼容 — _需求: FR-4, FR-5_
  - 证据块：SDK v2 双时代 stdio、Legacy Task wire、自适应 input_required、协议模式拒绝和 capability 降级矩阵自动化测试。
  - 子任务引用：protocol-compatibility/1.1、protocol-compatibility/1.2、protocol-compatibility/2.1。
- [x] 0.5 完成 Task Runtime 与适配器 — _需求: FR-6_
  - 证据块：Legacy、Modern、同步三路径等价测试；真实 Legacy Task 协议集成；取消/断线/晚到 Progress/并发状态竞态与 JSON 重启恢复测试。
  - 子任务引用：task-runtime/1.1、task-runtime/1.2、task-runtime/2.1。
- [x] 0.6 完成 Agent Evals 与发布就绪自动化 — _需求: FR-9_
  - 证据块：25 项 Agent Evals 全部通过；直接 Tool Contract Audit 38/38；Claude Code 2.1.179 真实 Agent 调用 33/33 工具、7/7 批次通过、0 契约失败；`npm run release:verify` 完成 85 个测试文件/400 项测试、构建、Legacy/Modern 双协议、23/29/33 工具面、本地 Agent 验收、81 次稳定性调用、rc.2 tarball 安装、v3.7.0 回退、Inspector 2.0.0、MCP Apps 协商与生产依赖审计；`4.0.0-rc.2` 对应 npm `next`，不发布正式 MCP Registry。
  - 子任务引用：release-readiness/1.1、release-readiness/1.2、release-readiness/2.1、release-readiness/2.2。

## 需求覆盖矩阵

| FR ID | 子规格 | 任务引用 | 状态 |
|---|---|---|---|
| FR-1 | core-governance | core-governance/1.1、core-governance/2.3 | 已完成 |
| FR-2 | core-governance | core-governance/1.2、core-governance/1.3 | 已完成 |
| FR-3 | memory-convergence | memory-convergence/1.1、memory-convergence/1.2 | 已完成 |
| FR-4 | protocol-compatibility | protocol-compatibility/1.1、protocol-compatibility/1.2 | 已完成 |
| FR-5 | protocol-compatibility | protocol-compatibility/2.1 | 已完成 |
| FR-6 | task-runtime | task-runtime/1.1、task-runtime/1.2、task-runtime/2.1 | 已完成 |
| FR-7 | core-governance | core-governance/2.1、core-governance/2.2 | 已完成 |
| FR-8 | memory-convergence | memory-convergence/2.1 | 已完成 |
| FR-9 | release-readiness | release-readiness/1.1、release-readiness/1.2、release-readiness/2.1、release-readiness/2.2 | 已完成 |

## 文件变更清单

| 范围 | 主要路径 | 操作 |
|---|---|---|
| 核心治理 | `src/lib/`、`src/server/`、`src/tools/start_*` | 重构 / 新增 |
| 记忆与收敛 | `src/lib/memory-*`、`src/plans/`、`src/tools/*memory*`、Plan 三工具 | 增强 / 新增 |
| 协议适配 | `src/protocol/`、启动入口 | 新增 / 重构 |
| Task Runtime | `src/tasks/` | 新增 |
| 测试 | `src/**/__tests__/`、reference clients、scripts | 新增 / 调整 |
| 文档 | `docs/specs/mcp-v4/`、README、迁移说明 | 新增 / 更新 |
| 发布就绪 | `src/evals/`、`src/release/`、Agent/协议/包安装验收脚本、发布校验脚本 | 新增 / 增强 |

## 子规格任务覆盖矩阵

子规格 `tasks.md` 是任务明细的唯一来源；母任务只维护阶段、FR 覆盖和引用。每个子任务以 `子规格 ID/任务 ID` 回链到本文件。
