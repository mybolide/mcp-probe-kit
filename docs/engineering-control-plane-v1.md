# MCP Probe Kit Engineering Control Plane V1

> 状态：设计评审稿，尚未进入生产代码实施  
> 目标：把 MCP Probe Kit 从“Agent 开发工具集合”升级为跨模型、跨 IDE、跨 Agent 的软件工程控制面。  
> 核心约束：解决真实交付问题，不生成无执行力的架构文档，不强迫小改动走重型流程，不依赖某一个模型或宿主。

---

## 1. 产品定位

MCP Probe Kit 不负责替 Agent 写业务代码，也不与 Claude、Codex、Cursor 的代码生成能力竞争。

它负责让不同模型、不同 IDE、不同 Agent 在任何项目中按照一致的工程纪律交付软件：

- 修改前理解项目和影响范围；
- 根据真实风险决定流程深度；
- 明确架构边界、数据所有权和公共契约；
- 长任务可恢复，切换 Agent 不丢状态；
- 每个完成结论都有证据；
- 修改后检查功能回归和架构漂移；
- 只有证据闭环后才允许收敛和沉淀长期记忆；
- 所有判断与执行过程可审计、可复现、可回滚。

一句话定位：

> **MCP Probe Kit 是 Agent 软件交付的 Engineering Control Plane，而不是另一个代码生成器。**

---

## 2. 要解决的实际问题

### 2.1 当前 Agent 开发的常见失败模式

1. 用户提出需求后，Agent 直接搜索几个文件并开始写代码。
2. Agent 只修改最先找到的调用点，没有识别完整影响链。
3. 同一业务事实在多个模块、脚本、文档和缓存中分别维护。
4. 新功能暂时可用，但数据所有权、状态模型和依赖方向没有定义。
5. 单元测试通过，但真实 Host、CLI、安装包或运行时入口仍失败。
6. 修复一个问题后，另一个层面的旧约定没有同步更新。
7. 会话切换或更换 Agent 后，执行状态、已验证证据和未决问题丢失。
8. 项目积累到一定规模后，只能整体重构。

### 2.2 V1 必须直接改善的结果

V1 不是以“新增多少工具”为成功标准，而以以下结果为标准：

- L0/L1 小改动不会被重型流程拖慢；
- L2/L3 改动在写代码前必须得到影响范围和工程约束；
- Agent 不再自行决定是否需要架构分析；
- 新增或修改公共契约时，相关实现、测试、审计和文档不会遗漏；
- 修改数据流时，必须明确唯一数据所有者；
- 修改后能够发现越界依赖、重复事实源和契约漂移；
- 任何 Agent 都能从本地状态恢复，而不是依赖对话记忆；
- `converge` 不再仅检查“步骤完成”，而是检查“工程交付闭环”。

---

## 3. 关键概念

### 3.1 任务类型与任务等级是两回事

任务类型描述“要做什么”：

- feature
- bugfix
- ui
- refactor
- onboard
- product
- release
- custom

任务等级描述“改动风险和治理深度”：

- L0：局部、低风险、无公开行为变化
- L1：模块内变化，影响可控
- L2：跨模块、契约或数据流变化
- L3：系统级、迁移级或高风险变化

因此同一个类型可以有不同等级：

- 一个文案 Bug 可以是 `bugfix/L0`；
- 一个涉及数据库迁移的 Bug 可以是 `bugfix/L3`；
- 一个局部 UI 样式修改可以是 `ui/L0`；
- 一个重做全站状态管理的 UI 需求可以是 `ui/L2` 或 `ui/L3`。

### 3.2 Project Digital Twin

项目数字孪生是对当前项目事实的版本化、可查询模型，包含：

- 代码结构和调用关系；
- 模块边界和依赖方向；
- 数据实体、所有者和读写路径；
- 公共契约及其消费者；
- 运行时入口、副作用和外部依赖；
- 需求、Spec、任务和 ADR；
- 测试、真实 Agent 验收和发布闸门；
- Git revision、构建身份、运行入口；
- 已验证的历史决策与长期记忆。

代码图谱是数字孪生的一部分，不等于完整数字孪生。

### 3.3 Engineering Control Plane

工程控制面根据任务、项目事实和证据决定：

- 当前任务是什么等级；
- 哪些步骤必须执行；
- 当前是否允许进入实现；
- 哪些修改范围被授权；
- 哪些证据仍然缺失；
- 是否发生范围越界或风险升级；
- 是否允许最终收敛。

---

## 4. 谁判断 L0、L1、L2、L3

### 4.1 最终判断者

最终等级由 MCP Probe Kit 服务端内部的 `TaskRiskClassifier` 判定。

不是由以下任何一方单独决定：

- 不是用户手动从菜单选择；
- 不是 Agent 凭感觉决定；
- 不是大模型输出一段自然语言后直接采信；
- 不是仅按修改文件数量判断；
- 不是仅按“功能 / Bug / UI”任务类型判断。

Agent 的职责是提供事实和执行计划，分类器的职责是依据规则和项目证据给出最终等级。

### 4.2 判断分为三次

#### 第一次：快速预判

由 `workflow` 根据以下信息生成 provisional level：

- 用户完整意图；
- 明确约束；
- 当前项目类型；
- 当前是否存在活动 Plan；
- 是否提及迁移、协议、数据库、权限、发布、架构等高风险信号；
- 仓库是否有可用项目上下文和图谱基线。

这一步必须快，不运行重型全仓分析。

输出示例：

```json
{
  "taskKind": "feature",
  "provisionalLevel": "L2",
  "confidence": "medium",
  "reasonCodes": [
    "cross_module_signal",
    "public_contract_possible"
  ],
  "nextAction": "start_feature"
}
```

#### 第二次：影响确认

由 `start_*` 内部调用项目模型和影响分析，得到 final level：

- 实际受影响模块；
- 公共契约变化；
- 数据所有权变化；
- 运行时副作用；
- 外部服务和凭证；
- 数据迁移和兼容要求；
- 当前图谱置信度；
- 现有测试保护范围。

预判可以被证据升级或降级，但必须记录原因。

#### 第三次：执行期重判

`plan_heartbeat`、变更扫描和 `converge` 会根据真实 diff 重新判断：

- 修改是否超出授权范围；
- 是否意外触及公共契约；
- 是否新增数据写路径；
- 是否新增外部依赖；
- 是否修改构建、发布或运行入口；
- 是否出现分类时未知的高风险事实。

发现风险升级时，原 Implementation Permit 失效，计划返回设计或影响分析阶段。

### 4.3 大模型在分类中的作用

大模型只负责提取候选信号，例如：

- 用户是否表达了迁移需求；
- 哪些模块可能相关；
- 是否存在语义上的公共行为变化。

这些信号必须由确定性规则、仓库事实或用户确认验证后才能成为分类依据。

模型输出不得直接成为最终等级。

---

## 5. 风险分类模型

### 5.1 评估维度

每个维度取 0-3：

| 维度 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| 影响广度 | 单文件局部 | 单模块 | 多模块 | 多服务/系统级 |
| 公共契约 | 无变化 | 向后兼容扩展 | 行为变化 | 破坏性变化/移除 |
| 数据影响 | 无数据变化 | 模块内状态 | 数据所有权/口径变化 | 迁移、删除、不可逆变化 |
| 运行时影响 | 纯静态 | 模块内部执行 | 新副作用/外部调用 | 启动、发布、权限或关键运行链 |
| 兼容影响 | 无 | 单版本内部 | 多 Host/多协议/多客户端 | 双轨迁移或长期兼容 |
| 可逆性 | 可直接撤销 | 普通 Git 回滚 | 需要迁移回滚 | 难以回滚或数据不可逆 |
| 不确定性 | 事实完整 | 少量未知 | 图谱/测试缺失 | 项目边界或生产行为不明 |

### 5.2 硬升级规则

出现以下任一情况，最低为 L3：

- 数据库或持久化模型需要迁移；
- 认证、授权、密钥、隐私或安全边界变化；
- 删除或破坏公共 API / Tool / CLI / Event / Schema；
- 修改生产启动入口、发布链、回滚链或包安装链；
- 跨服务数据一致性、分布式事务或双写；
- 数据删除、不可逆转换或大规模回填；
- 核心协议版本迁移；
- 用户明确标注为关键生产系统且无法提供可靠回滚。

出现以下任一情况，最低为 L2：

- 修改两个以上有独立职责的模块；
- 新增或修改公共契约，但保持向后兼容；
- 改变数据所有权、业务口径或缓存失效规则；
- 新增网络、文件、子进程或长期状态副作用；
- 新增外部服务集成；
- 影响多个 Host、CLI、Apps 或协议面；
- 修改 Tool Registry、Schema、运行时路由等控制面核心模块。

### 5.3 等级计算

初始规则：

- L0：所有维度为 0，或只有一个维度为 1，且无公开行为变化；
- L1：最高维度不超过 1，累计分不超过 4；
- L2：存在维度 2，或累计分 5-9；
- L3：命中硬升级规则、存在维度 3，或累计分不低于 10。

文件数量只能作为辅助信号，不能作为单独判据。

### 5.4 证据不足时怎么办

不采用“看不清就全部判 L3”的粗暴策略。

分类器返回：

```json
{
  "level": "L2",
  "confidence": "low",
  "missingEvidence": [
    "runtime_entry_unknown",
    "data_owner_unknown"
  ],
  "implementationAllowed": false,
  "requiredNextAction": "impact_analysis"
}
```

先补最小必要证据，再完成最终分类。

### 5.5 用户和 Agent 的覆盖权限

- 用户和 Agent 可以随时建议升级等级；
- Agent 不能自行降低最终等级；
- 用户可以要求更快流程，但降低等级必须生成 Risk Waiver；
- 命中安全、数据不可逆、破坏性协议变化等硬规则时，不允许降级；
- 普通 L2 最多可由用户明确降为 L1，必须记录接受的风险和缺失证据；
- Risk Waiver 会进入最终收敛报告，不能静默跳过。

---

## 6. 各等级到底执行什么

| 阶段 / 证据 | L0 | L1 | L2 | L3 |
|---|---:|---:|---:|---:|
| 任务意图 | 必须 | 必须 | 必须 | 必须 |
| 运行身份 | 最小 | 必须 | 必须 | 必须 |
| 项目基线 | 轻量 | 轻量 | 完整 | 完整 + 可恢复快照 |
| 影响分析 | 可选 | 必须 | 必须 | 必须 |
| 架构影响 | 不需要 | 可选 | 必须 | 必须 |
| 数据所有权 | 不需要 | 变化时 | 必须检查 | 必须设计和迁移 |
| Spec | 不需要 | 简化验收 | 必须 | 必须 + ADR |
| 迁移方案 | 不需要 | 不需要 | 变化时 | 必须 |
| 回滚方案 | Git 回滚 | 简单回滚 | 必须 | 必须 + 演练 |
| 测试 | 定向 | 受影响模块 | 受影响主链 + 回归 | 全量 + 兼容 + 灰度/双轨 |
| Claude 本地 build 验收 | 可选 | 关键行为 | 必须 | 必须，多场景 |
| 架构漂移检查 | 不需要 | 轻量 | 必须 | 必须 |
| Converge | 轻量 | 标准 | 严格 | 严格 + 用户确认 |

### 6.1 L0 示例

- 修正文案；
- 调整非公开样式；
- 修改注释；
- 不改变行为的局部命名修正。

流程：

```text
Intent → Minimal Baseline → Implement → Targeted Verify → Lightweight Converge
```

### 6.2 L1 示例

- 修复单模块参数校验；
- 模块内部重构但公共输出不变；
- 增加单模块内部日志；
- 修复有明确根因的局部 Bug。

流程：

```text
Intent → Baseline → Local Impact → Implement → Module Tests → Review → Converge
```

### 6.3 L2 示例

- 新增 MCP Tool；
- 新增跨模块业务能力；
- 修改工具可见性；
- 改变数据口径、缓存规则或状态归属；
- 同时影响 CLI、Host、Apps、测试和文档。

流程：

```text
Intent → Baseline → Impact Subgraph → Architecture Impact → Spec
→ Implementation Permit → Implement → Tests/Agent Acceptance
→ Drift Check → Converge
```

### 6.4 L3 示例

- 数据库渐进迁移；
- 协议时代迁移；
- 认证授权系统调整；
- 发布和运行入口改造；
- 关键系统架构拆分。

流程：

```text
Intent → Full Baseline → Impact Graph → Target Architecture → ADR
→ Migration/Rollback → User Approval → Phased Implementation
→ Dual-run/Compatibility Verification → Drift Check → Strict Converge
```

---

## 7. 统一交付状态机

所有任务使用同一状态机，不同等级只决定哪些状态可以轻量化或跳过。

```text
INTAKE
  ↓
PROFILED
  ↓
BASELINED
  ↓
IMPACT_ANALYZED
  ↓
DESIGNED
  ↓
SPECIFIED
  ↓
PLANNED
  ↓
IMPLEMENTATION_ALLOWED
  ↓
IMPLEMENTING
  ↓
VERIFYING
  ↓
DRIFT_CHECKED
  ↓
CONVERGED
  ↓
LEARNED
```

### 7.1 状态不是 Agent 自己声明的

状态转换由 `GateEngine` 根据证据完成。

例如，Agent 不能只说“架构已经设计完成”。它必须提供：

- 目标模块边界；
- 数据所有权变化；
- 公共契约变化；
- 迁移和回滚要求；
- 与影响子图匹配的变更范围。

`ArchitecturePolicy` 校验通过后，状态才进入 `DESIGNED`。

### 7.2 Implementation Permit

L1-L3 在进入实现前生成 Implementation Permit：

```json
{
  "permitId": "permit-abc123",
  "planId": "feature-tool-contract-xxx",
  "taskLevel": "L2",
  "baselineRevision": "9c34bb5",
  "impactSnapshotHash": "sha256:...",
  "allowedScopes": [
    "src/server/**",
    "scripts/tool-contract-*.mjs",
    "src/protocol/__tests__/**"
  ],
  "protectedBehaviors": [
    "compact_tool_count=23",
    "memory_tool_count=29",
    "app_only_not_in_tools_list"
  ],
  "requiredGates": [
    "spec",
    "tests",
    "agent_acceptance",
    "drift"
  ]
}
```

Permit 不是安全沙箱，但它提供统一的执行边界和事后验证依据。

### 7.3 MCP 能否阻止 Agent 直接写代码

必须诚实区分两种能力：

1. 支持 pre-write hook 或权限控制的 Host：可以在未获得 Permit 时阻止写操作；
2. 不支持强制 hook 的 Host：无法物理阻止 Agent 绕过 MCP 写文件。

对第二种 Host，MCP Probe Kit 通过以下方式治理：

- AGENTS.md / Skill 明确执行协议；
- Plan 状态显示 `implementationAllowed=false`；
- 记录 baseline revision；
- `plan_heartbeat` 和 `converge` 比较真实 diff；
- 未授权修改进入 `out_of_policy_changes`；
- 未补做影响分析、设计和验证时禁止收敛；
- 提供“接管既有修改”修复路径，而不是假装修改没有发生。

因此 V1 的承诺是“可检测、可阻断收敛、可恢复”，而不是虚假宣称所有 IDE 中都能拦截写盘。

---

## 8. Project Digital Twin 设计

### 8.1 不建立一个巨大、持续重算的全仓数据库

V1 采用：

- 版本化 Project Snapshot；
- 按任务生成 Impact Subgraph；
- 内容哈希和增量更新；
- 需要时才扩展一阶、二阶依赖；
- 图谱不可用时降级到本地静态证据；
- 所有推断标记来源和置信度。

### 8.2 节点类型

```text
project
package
module
file
symbol
runtime_entry
data_entity
data_store
contract
tool
api
cli_command
host_capability
external_dependency
requirement
spec
decision
test
acceptance_scenario
release_gate
memory_asset
```

### 8.3 关系类型

```text
contains
imports
calls
registers
exposes
accepts
returns
owns
reads
writes
caches
invalidates
generates
implements
verifies
protects
depends_on
compatible_with
supersedes
runs_as
has_side_effect
```

### 8.4 每条事实必须带来源

```ts
interface ProjectFact {
  source: 'gitnexus' | 'local_static' | 'manifest' | 'spec' | 'test' | 'runtime_probe' | 'user_confirmed';
  confidence: 'high' | 'medium' | 'low';
  observedAt: string;
  revision?: string;
  evidenceRef?: string;
}
```

禁止在本地降级模式下伪造调用图或运行时关系。

### 8.5 三类图

#### Actual Graph

代码和运行证据表明项目目前实际上如何工作。

#### Target Graph

架构契约和当前设计要求系统应该如何工作。

#### Drift Graph

Actual 与 Target 的差异：

- 越界依赖；
- 循环依赖；
- 数据所有权冲突；
- 重复事实源；
- 未登记公共契约变化；
- 新增副作用；
- 缺少测试保护。

### 8.6 影响子图

每次任务只提取与当前需求相关的子图：

```text
User Intent
  → Entry Points
  → Affected Symbols/Modules
  → Data Reads/Writes
  → Public Contracts
  → Runtime Side Effects
  → Tests / Host / CLI / Apps
```

影响子图是任务分类、计划编译和漂移检查的共同输入。

---

## 9. 架构规则从哪里来

### 9.1 架构契约

项目可以维护一个简洁的机器可读契约：

```text
docs/architecture/architecture-contract.yaml
```

示例：

```yaml
version: 1

modules:
  tool-registry:
    owns:
      - tool-definition
      - tool-visibility
    may_depend_on:
      - schemas
      - tool-catalog
    must_not_depend_on:
      - docs-rendering
      - host-specific-ui

  protocol:
    owns:
      - protocol-negotiation
      - legacy-modern-adaptation
    must_not_own:
      - business-tool-behavior

data_ownership:
  tool-contract:
    owner: tool-registry
    generated_consumers:
      - audit
      - docs
      - inspector
      - compatibility-matrix

policies:
  - id: ARCH-001
    type: no-cycle
  - id: ARCH-002
    type: single-source-of-truth
  - id: ARCH-003
    type: no-cross-layer-write
```

### 9.2 老项目没有架构契约怎么办

系统根据 Actual Graph 生成 observed draft：

- 自动识别当前模块、入口、数据读写和公共契约；
- 标记为 `observed`，不假装它是正确架构；
- 只要求用户或 Agent 确认关键边界；
- 不自动生成几十页文档；
- 后续通过 ADR 小步修正。

### 9.3 架构文档不是闸门本身

只有能被机器检查的规则才进入 GateEngine。

自然语言文档可以解释原因，但不能仅凭“文档存在”判定架构通过。

---

## 10. 内部核心模块

公开工具面保持克制，内部服务解耦。

### 10.1 IntakeNormalizer

负责：

- 从当前对话和已有计划恢复完整任务意图；
- 识别用户明确限制；
- 合并 project_root、活动 Plan 和仓库状态；
- 禁止把“继续”“开始”等短确认直接当作任务描述。

不负责风险判断和代码分析。

### 10.2 TaskRiskClassifier

负责：

- provisional / final / runtime 三阶段分类；
- 风险维度、硬规则和置信度；
- 输出 reasonCodes 和 missingEvidence。

不负责生成架构设计。

### 10.3 ProjectModelBuilder

负责：

- 聚合 GitNexus、本地静态扫描、Manifest、Spec、测试和运行探针；
- 生成 Project Snapshot；
- 标记来源、版本和置信度。

### 10.4 ImpactAnalyzer

负责：

- 生成 Impact Subgraph；
- 识别公共契约、数据读写、运行时和测试影响；
- 输出允许范围候选。

### 10.5 ArchitecturePolicyEngine

负责：

- 校验模块依赖；
- 校验数据所有权；
- 校验公共契约真源；
- 比较 Actual / Target；
- 生成架构阻断项和警告。

### 10.6 PlanCompiler

负责：

- 根据 task kind、level 和 policy 编译 Delegated Plan；
- 决定哪些步骤必需；
- 生成 completionEvidence、onFailure 和回滚步骤；
- 生成 Implementation Permit。

### 10.7 GateEngine

负责状态转换：

- baseline gate；
- impact gate；
- architecture gate；
- spec gate；
- implementation permit；
- verification gate；
- drift gate；
- convergence gate。

### 10.8 EvidenceStore

在现有 Plan Store 基础上保存：

- 任务 Profile；
- 快照和哈希；
- Gate 结果；
- 证据；
- Permit；
- Risk Waiver；
- 运行身份；
- 漂移结果。

状态继续存放在项目本地 `.mcp-probe-kit/`，避免依赖单个对话或远程服务。

### 10.9 ValidationRunner

负责组织而不是复制测试实现：

- 项目自动化测试；
- 协议/安装包/运行时烟测；
- Claude 使用本地 build 的真实 Agent 验收；
- 不同等级的验证矩阵；
- 结果标准化为 Evidence。

### 10.10 HostAdapter

负责：

- MCP 原生调用；
- CLI fallback；
- Host 能力投影；
- 可用时接入 pre-write / permission hook。

HostAdapter 不拥有任务分类、架构规则和收敛规则。

---

## 11. 与现有工具如何结合

V1 第一阶段不急于增加大量公开工具。

### 11.1 `workflow`

从“场景路由器”升级为“任务入口和快速 Profile”：

```json
{
  "taskProfile": {
    "kind": "feature",
    "provisionalLevel": "L2",
    "confidence": "medium",
    "reasonCodes": ["cross_module_signal"]
  },
  "requiredGates": ["baseline", "impact", "architecture", "spec"],
  "implementationAllowed": false,
  "firstTool": "start_feature"
}
```

### 11.2 `code_insight`

继续承担代码和图谱分析，但输出统一 Project Snapshot / Impact Subgraph：

- 不再只返回自然语言摘要；
- 提供事实来源和置信度；
- 提供公共契约、数据路径和测试关系；
- 结果可被分类器和 GateEngine 直接消费。

### 11.3 `start_feature` / `start_bugfix` / `start_ui` / `refactor`

负责第二阶段分类和 Plan 编译：

- 获取影响子图；
- 得到 final level；
- 根据等级插入必要步骤；
- 未通过前置 Gate 时不返回“立即写代码”的指导；
- 对 L2/L3 生成架构影响和 Permit 流程。

### 11.4 `check_spec`

保持规格检查职责，不把所有架构逻辑塞入其中。

它需要验证 Spec 是否引用：

- Task Profile；
- Impact Snapshot；
- 公共契约变化；
- 数据所有权变化；
- 验收和回滚要求。

### 11.5 `plan_heartbeat`

从“记录完成步骤”升级为：

- 存储 Gate 和证据；
- 检查当前状态允许的下一动作；
- 记录真实 revision；
- 发现范围越界时触发 runtime reclassification；
- Permit 失效时明确返回修复路径。

### 11.6 `resume_plan`

返回：

- 当前状态；
- Task Profile；
- Permit 是否有效；
- 下一必需 Gate；
- 缺失证据；
- 最近验证 revision；
- 风险升级和未决事项。

### 11.7 `converge`

依据等级动态确定证据，不再固定要求同一组 evidence：

- L0：实现 + 定向验证；
- L1：需求 + 实现 + 测试 + Review；
- L2：增加 baseline、impact、architecture、spec、drift、Agent acceptance；
- L3：增加迁移、回滚、兼容、用户确认和严格验收。

### 11.8 是否增加 `architecture` 工具

第一阶段不增加。

先把架构能力作为内部服务接入现有流程，证明分类、规则和误报稳定后，再考虑公开一个：

```text
architecture mode=assess|design|validate|drift
```

避免再次出现“缺一个能力就新增一个工具，但工具之间仍然松散”的问题。

---

## 12. Evidence 模型

现有 Evidence 类型需要扩展为：

```text
intent
baseline
impact
architecture
spec
implementation
test
review
runtime
compatibility
migration
rollback
drift
agent_acceptance
user_approval
risk_waiver
memory
```

每条 Evidence 至少包含：

```ts
interface DeliveryEvidence {
  kind: EvidenceKind;
  summary: string;
  status: 'passed' | 'failed' | 'partial' | 'not_applicable';
  reference?: string;
  revision?: string;
  command?: string;
  fingerprint?: string;
  verifiedAt: string;
  verifier: 'system' | 'agent' | 'claude' | 'user' | 'host';
}
```

Agent 自述“已完成”只能形成低置信度声明，不能替代测试、文件、Git revision 或真实运行证据。

---

## 13. 运行身份

每个工具结果和 Evidence 应携带统一 Runtime Fingerprint：

```json
{
  "serverVersion": "4.0.0-rc.8",
  "gitRevision": "9c34bb5",
  "buildFingerprint": "sha256:...",
  "buildTime": "...",
  "entryPath": "E:/workspace/github/mcp-probe-kit/build/index.js",
  "projectRoot": "E:/workspace/project",
  "nodeVersion": "22.21.1",
  "protocolEra": "modern",
  "toolset": "compact",
  "hostCapabilities": ["tools", "resources", "apps"]
}
```

验证结果只有在 fingerprint 与计划要求一致时才有效。

这可以直接解决“测试通过的是本地 build，但 Cursor 实际加载的是旧 npm 包”这类问题。

---

## 14. Agent 实际如何执行

### 14.1 普通请求

用户：

> 给现有系统增加订单导出功能。

Agent 必须先调用：

```text
workflow(intent=<完整需求>, project_root=<项目>)
```

返回 provisional `feature/L2` 后，Agent 调 `start_feature`。

`start_feature` 获取实际影响图，确认涉及 API、任务队列、存储和 UI，生成：

- final level=L2；
- required gates；
- Impact Subgraph；
- 架构影响模板；
- Spec 步骤；
- 当前 `implementationAllowed=false`。

Agent 完成架构影响和 Spec，调用 heartbeat 附证据。GateEngine 通过后发放 Permit，才进入实现。

### 14.2 Agent 已经先写了代码

系统不假装可以回到过去，而是进入 `UNPLANNED_CHANGES`：

```json
{
  "status": "blocked",
  "reason": "out_of_policy_changes",
  "changedScopes": ["src/api/**", "src/db/**"],
  "requiredRecovery": [
    "capture_current_diff",
    "reclassify_task",
    "generate_impact_snapshot",
    "validate_or_revert_changes"
  ]
}
```

Agent可以选择：

- 回滚未授权修改；
- 将现有 diff 接管为候选实现，补做影响、架构、Spec 和验证。

### 14.3 切换 Agent 或 IDE

新 Agent 调 `resume_plan`：

- 不需要依赖旧对话；
- 获得当前状态和下一动作；
- 看到 Permit、基线、证据和未决项；
- 使用相同策略继续执行。

---

## 15. 降级策略

### 15.1 GitNexus 不可用

- 使用本地 import/export、symbol、Manifest、Git diff 和文件证据；
- 明确 `callGraph=false`、`confidence=low/medium`；
- 对 L0/L1 可继续；
- 对依赖真实调用链的 L2/L3，要求补运行证据或用户确认；
- 不伪造图谱。

### 15.2 Memory 不可用

- 主流程继续；
- 不影响任务分类和 Gate；
- 只失去历史经验召回与最终沉淀。

### 15.3 Host 不支持 MCP Apps

- 使用纯文本和 structuredContent；
- UI 只做展示增强，不参与核心决策。

### 15.4 Host 不暴露 MCP 工具

- 使用项目内版本锁定 CLI fallback；
- CLI 必须复用同一分类器、项目模型、Plan Store 和 GateEngine。

---

## 16. V1 不做什么

- 不自动重构整个项目；
- 不为每次小改生成完整架构文档；
- 不建立必须联网的中央平台；
- 不要求用户手动维护庞大图谱；
- 不把所有任务都判成 L2/L3；
- 不仅凭文件数量评估风险；
- 不让大模型独立决定等级；
- 不把 UI 工作台当作核心能力；
- 不一次性替换现有 workflow、Plan、Memory 和 Graph 实现；
- 不宣称能在所有 IDE 中物理阻止 Agent 写文件。

---

## 17. 渐进式实施计划

### Phase 0：冻结行为基线

目标：确保治理功能开发不会改变现有功能。

记录：

- 现有工具面 23 / 29 / 33；
- MCP Apps、CLI、Legacy/Modern 行为；
- 当前 463 项测试和契约审计；
- Claude 本地 build 33/33 验收；
- 当前 Plan、Memory、Graph 数据格式；
- 当前 Host 兼容矩阵。

此阶段不改变生产行为。

### Phase 1：Task Profile 观察模式

增加内部：

- `TaskRiskClassifier`；
- `TaskProfile` Schema；
- reasonCodes；
- provisional/final 分类；
- 分类测试语料。

只在 structuredContent 中报告建议等级，不改变现有 Plan，不阻断执行。

通过真实历史任务评估误判率。

### Phase 2：Project Snapshot 与 Impact Subgraph

在现有 GitNexus / local fallback 上增加统一适配层：

- 标准节点、边和 Fact 来源；
- 公共契约和数据读写关系；
- 任务级影响子图；
- 快照 revision/hash。

不改变现有工具数量。

### Phase 3：Plan 与 Evidence 升级

升级 Plan State Schema：

- Task Profile；
- Gate 状态；
- Runtime Fingerprint；
- Permit；
- 新 Evidence 类型；
- Risk Waiver；
- 向后兼容读取旧 Plan。

### Phase 4：L2/L3 警告闸门

`start_*` 和 `converge` 开始输出：

- missing gates；
- implementationAllowed；
- out-of-scope diff；
- drift report。

先警告，不硬阻断，收集真实项目反馈。

### Phase 5：L2/L3 强制闸门

经过误报校准后：

- L0/L1 保持轻量；
- L2 缺架构/Spec/验证时禁止收敛；
- L3 缺迁移/回滚/用户确认时禁止进入实现或收敛；
- 支持 Risk Waiver，但硬规则不可绕过。

### Phase 6：跨 Host 强制与可视化

- 对支持 hook 的 Host 增加 pre-write 验证；
- Architecture/Delivery Workbench 仅用于展示状态和影响图；
- UI 不拥有规则和事实。

---

## 18. 每个阶段的回滚原则

- 新能力先通过 feature flag 开启；
- 旧字段继续读取；
- 新 Schema 使用版本号；
- 分类观察模式可单独关闭；
- Gate 警告和强制模式可独立切换；
- 不在同一提交中同时改分类、Plan Store、Graph 和 Host Adapter；
- 每个阶段完成自动测试和 Claude 本地 build 验收后独立提交；
- 工具数量、名称、输入输出兼容和 Host 行为变化必须单独审批。

---

## 19. 验收标准

### 19.1 分类准确性

建立至少 100 个真实任务样本，覆盖：

- feature / bugfix / ui / refactor；
- L0-L3；
- 中英文；
- 模糊短指令和完整需求；
- 图谱可用和降级场景。

目标：

- 硬规则漏判为 0；
- L0 被误判为 L2/L3 的比例低于 5%；
- L2/L3 被低估的比例低于 2%；
- 所有分类都有可理解 reasonCodes。

### 19.2 流程一致性

同一任务分别由 Claude Code、Cursor、CLI fallback 执行：

- Task Profile 一致；
- required gates 一致；
- Plan ID 和状态语义一致；
- 不同 Host 只影响展示和能力降级，不影响规则结论。

### 19.3 恢复能力

- 中断后新 Agent 可从本地状态恢复；
- 能识别最后验证 revision；
- 能识别 Permit 是否失效；
- 不依赖原对话正文才能继续。

### 19.4 防回归能力

构造一个类似 `list_memory_assets` 的契约变化：

- 系统必须识别 Tool Registry、tools/list、MCP Apps、审计、Inspector、文档和测试影响；
- 遗漏任一必要消费者时，drift/converge 必须阻断；
- 不能再次出现单元测试和 release static 全绿，但契约审计维护旧事实的情况。

### 19.5 不过度治理

- 文案修改不要求架构设计；
- 单模块局部 Bug 不要求 ADR；
- L0/L1 的额外执行时间可控；
- 图谱不可用时小改动仍可继续；
- 治理产生的文档和状态数量保持最小。

---

## 20. 成功指标

上线后持续观察：

- 修复后出现同链路新回归的比例；
- 因遗漏消费者造成的契约漂移次数；
- L2/L3 实施前完成影响分析的比例；
- Agent 绕过 Plan 后被发现的比例；
- 切换 Agent 后无损恢复成功率；
- 重构任务中计划外文件修改比例；
- Claude 本地 build 验收首次通过率；
- 用户手动提醒“先看架构 / 先看影响”的次数。

最终目标不是让流程看起来更正规，而是让最后一项显著下降：

> 用户不再需要反复提醒 Agent 先理解项目、先分析影响、不要直接乱写。

---

## 21. V1 核心决策摘要

1. MCP Probe Kit 定位为 Agent 软件工程控制面，不是代码生成工具。
2. 任务类型与风险等级分离。
3. L0-L3 由服务端确定性分类器判定，模型只提供候选信号。
4. 分类分预判、影响确认和执行期重判三次。
5. 图谱扩展为 Project Digital Twin，但 V1 使用增量快照和影响子图，不建设重型中央数据库。
6. 架构能力优先作为内部服务接入现有工具，不立即增加大量公开工具。
7. Plan 从步骤列表升级为状态、证据、Gate 和 Permit 的统一交付记录。
8. 不支持强制 hook 的 Host 中，至少做到可检测、阻断收敛和可恢复。
9. L0/L1 保持轻量，L2/L3 才启用完整架构和漂移治理。
10. 全部实施必须小步、可回滚，并使用本地新编译版本进行自动化和 Claude 真实 Agent 验收。

