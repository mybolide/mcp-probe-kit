# SRC-8：软件真因分析八步法

**SRC-8**（Software Root-Cause 8-step）是 mcp-probe-kit 面向 **代码 + AI Agent** 场景的 Bug 真因分析协议。

它**受丰田 TBP（Toyota Business Practice）八步法与 PDCA 启发**，但不是制造业八步的逐字翻译，而是继承其科学思维纪律，并用软件世界的语言完成升华。

---

## 我们借鉴了什么（丰田 TBP）

参考：[Toyota Business Practice — Art of Lean](https://artoflean.com/reference/tbp/)

| 丰田 TBP 不变量 | SRC-8 如何继承 |
|-----------------|----------------|
| 问题 = 理想状态 − 实际状态（gap） | Step 1 **明确差距** |
| 大问题须分解，找 priority point | Step 2 **收敛边界** |
| 先设定可衡量目标再分析 | Step 3 **验收契约**（failing test / repro） |
| 现地现物、5 Why、基于事实 | Step 4 **把握真因**（真因工作表） |
| countermeasure 针对真因 | Step 5 **制定对策** |
| 贯彻实施并监控 | Step 6 **贯彻修复** |
| 评价结果 **和** 过程 | Step 7 **评价双轨** |
| 标准化与横向展开（yokoten） | Step 8 **巩固传播**（memorize + 测试） |

**丰田最常见失败**（我们明确禁止）：**直接从「分析真因」开始**，未明确问题、未分解、未设目标。

---

## 我们的升华（相对 TBP）

| 维度 | 制造业 TBP | SRC-8 |
|------|------------|-------|
| 观察现场 | 车间现地现物 | **现码现志**：日志、堆栈、复现、读源码、`code_insight` |
| 分解维度 | 4M / 工序 | **归因六层**：code / runtime / data_contract / integration / **agent_behavior** / environment |
| 真因形态 | 常假设单链因果 | 简单 Bug：因果句；复杂 Bug：**主因 + contributingFactors** |
| 验收 | 合格率、周期 | **验收契约**：failing test 变绿、repro 通过 |
| Step 4 深度 | 5 Why 为主 | **真因工作表** 4a~4e（假设/排除/对比/5Why/陈述） |
| 巩固 | 标准作业、横展 | 回归测试 + **`memorize_asset` 跨仓库记忆** |
| 执行者 | 人 | **MCP 发指南 + Agent 执行**（guidance-only） |

其中 **`agent_behavior`** 是 MCP-probe-kit 特有：工具未调、参数空、把 guidance 当结论、跳步改代码等。

---

## SRC-8 八步一览

| 步 | 名称 | PDCA | 核心产出 |
|----|------|------|----------|
| 1 | 明确差距 | Plan | 理想 / 实际 / gap |
| 2 | 收敛边界 | Plan | 时间线、归因层、priority point |
| 3 | 验收契约 | Plan | SMART 验收标准 |
| **4** | **把握真因** | Plan | **`rootCauseAnalysis`（真因工作表）** |
| 5 | 制定对策 | Plan | 最小 patch 方案与风险评估 |
| 6 | 贯彻修复 | Do | 在复现门禁通过后改代码 |
| 7 | 评价双轨 | Check | 结果 + 过程复盘 |
| 8 | 巩固传播 | Act | 测试 + memorize |

**Plan 约占 60–70% 精力；Step 4 是核心（建议占 Plan 的 40–50%）。**

---

## Step 4 真因工作表（亮点）

`fix_bug` 在 `structuredContent.rootCauseWorksheet` 注入空模板，Agent 必须填满后输出 `rootCauseAnalysis`：

| 子步 | 内容 |
|------|------|
| **4a** | 假设清单（2~5 条，含 agent_behavior） |
| **4b** | 排除矩阵（证据 / 反证 / ruled_out\|pending\|confirmed） |
| **4c** | 对比分叉（success_sample；无则 evidenceGaps） |
| **4d** | 5 Why 链（≥3 层，每层绑定观察事实） |
| **4e** | 真因陈述（simple 因果句 \| complex 主因+贡献因子） |

### Step 4 硬门禁

- 假设 ≥ 2；有证据的排除 ≥ 2
- 5 Why ≥ 3 层
- 无成功样本 → 必须写 `evidenceGaps`
- `confidence: low` → 补证据或 `code_insight`，不得直接改代码
- 不得以「超时 / SDK bug / 网络慢」单独作为因果句

---

## 工具映射

| 工具 | SRC-8 角色 |
|------|------------|
| `start_bugfix` | 编排整趟 SRC-8（`metadata.plan` delegated，与 `start_feature` 同模式） |
| `fix_bug` | 单工具场景下的 SRC-8 delegated plan + 真因工作表 |
| `code_insight` | plan 中 **src8-2**：边界与假设验证 |
| `gentest` | plan 中 **src8-7**：回归测试 |
| `memorize_asset` | plan 中 **src8-8**：【现象】【根因】【修复】【验证】 |
| `search_memory` | 开干前查历史同类真因 |

### delegated plan（v3.6.11+）

`start_bugfix` / `fix_bug` 返回 `structuredContent.metadata.plan`：

| 步骤 ID | 类型 | 说明 |
|---------|------|------|
| `src8-1` | action | 明确差距 |
| `src8-2` | `code_insight` | 收敛边界 |
| `src8-3` | action | 验收契约 |
| `src8-4` | action | 真因工作表 4a~4e → `rootCauseAnalysis`（闭合前禁止改代码） |
| `src8-5` | action | 制定对策 |
| `src8-6` | action | 贯彻修复 |
| `src8-7` | `gentest` | 评价双轨（结果轨） |
| `src8-8` | `memorize_asset` | 巩固传播 |

Agent 应严格按 `plan.steps` 顺序执行。**MCP 工具输出的 prompt 内嵌计划与门禁，不引用本 markdown 文件**（npm 用户端看不到仓库 docs）。本文件供人类阅读与 GitHub 文档站。

---

## 结构化输出

Agent 最终输出 `BugAnalysis` JSON，关键字段：

- `analysisMode`: `"src8"`（`tbp8` 为兼容别名）
- `rootCauseAnalysis`: Step 4 真因工作表产出（**必填**）
- `tbp`: 历史兼容字段名，语义对齐 SRC-8 各步

---

## 与 guidance-only 设计的关系

MCP **不**做静态真因扫描、**不**自动改代码。价值在于：

1. 强制 Step 顺序与 Step 4 工作表  
2. 注入代码/日志/样本/验收目标  
3. 用门禁降低 Agent 跳步与幻觉修复概率  

真因由 **Agent 分析后写入 JSON**，人可审查 `rootCauseAnalysis` 是否闭合。

---

## 参考

- [Toyota Business Practice (TBP)](https://artoflean.com/reference/tbp/)
- [Practical Problem Solving / PDCA — AllAboutLean](https://www.allaboutlean.com/practical-problem-solving-introduction/)
- [SRE Postmortem Culture](https://sre.google/sre-book/postmortem-culture/)（贡献因子、blameless）

实现：`src/lib/src8-guidance.ts`
