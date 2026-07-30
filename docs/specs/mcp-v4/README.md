# MCP Probe Kit v4.0

## 原则

本规格采用 parent-child 结构。母规格维护产品边界、FR 注册、跨模块架构、兼容策略和里程碑；子规格维护各能力域的详细验收标准、实施任务与证据。MCP 负责提供规范和 delegated plan，Agent 使用宿主能力完成真实开发。

## 子规格索引

| ID | 标题 | FR | 依赖 |
|---|---|---|---|
| core-governance | 核心治理与编排 | FR-1、FR-2、FR-7 | 无 |
| memory-convergence | 记忆学习与收敛恢复 | FR-3、FR-8 | core-governance |
| protocol-compatibility | SDK v2 与双协议兼容 | FR-4、FR-5 | core-governance |
| task-runtime | 内部任务运行时与协议适配 | FR-6 | protocol-compatibility |

## 依赖关系

- `core-governance` 先稳定 Tool Registry、Canonical Skill 和 Delegated Plan Contract。
- `memory-convergence` 在统一 Plan Contract 上实现分阶段检索、负面记忆、Converge 和恢复。
- `protocol-compatibility` 在共享业务核心外增加 Legacy / Modern 协议适配。
- `task-runtime` 依赖协议能力模型，但内部状态模型不得依赖某一协议时代。

## 里程碑

1. M1：核心治理与 Plan Contract 基线完成。
2. M2：Tool Registry 与 Server 解耦完成。
3. M3：Memory 2.0、Converge 和恢复能力完成。
4. M4：SDK v2 双协议与 Task Adapter 完成。
5. M5：客户端矩阵、Evals、迁移说明和 v4.0.0 发布完成（`release-readiness`）。
