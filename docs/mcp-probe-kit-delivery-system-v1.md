# MCP Probe Kit 软件交付系统 V1 需求

> 状态：最终设计基线，后续实现以本文为准  
> 目标：让不同模型、不同 IDE、不同 Agent，在任何项目中都按照一致、可恢复、可验证、可审计、可维护、可学习的工程纪律交付软件。  
> 核心原则：Agent 负责工程判断和实施，MCP Probe Kit 负责提供统一方法、项目证据、过程状态、验证闭环和长期记忆。

---

## 1. 产品定位

MCP Probe Kit 不是代码生成器，也不替代 Agent 的工程判断。

它解决的是以下实际问题：

1. Agent 收到需求后直接写代码，没有先理解项目和影响范围。
2. 不同模型、IDE 和 Agent 的工作方式不一致，交付质量依赖模型临场发挥。
3. 长任务中断或切换 Agent 后，计划、进度、证据和未决问题丢失。
4. Agent 只证明“代码写完”，没有证明需求、测试、审查和真实运行已经闭环。
5. 已经验证过的架构决策、Bug 根因、失败方案和兼容经验无法被后续 Agent 复用。
6. 同一个问题在不同会话中重复排查、重复踩坑、重复破坏既有约束。

产品最终提供四项核心能力：

```text
指导：让 Agent 先理解、分析影响、制定计划。
状态：让任务可中断、可恢复、可追踪。
验证：让完成结论有规格、测试、审查和运行证据。
记忆：让验证过的经验被后续任务和其他 Agent 复用。
```

---

## 2. V1 明确不做什么

- 不由 MCP 自动判断需求属于 L0、L1、L2 或 L3。
- 不让规则引擎替 Agent 判断业务复杂度和架构优劣。
- 不要求所有任务都走重型流程。
- 不建立庞大的中央 Project Digital Twin 数据库。
- 不新增一组 `start_architecture`、`check_architecture`、`architecture_drift` 等彼此割裂的工具；只新增一个统一的 `architecture` 工具，使用不同 mode 覆盖评估、设计、校验和漂移检查。
- 不宣称可以在所有 IDE 中阻止 Agent 直接修改文件。
- 不把普通调试过程、临时日志和未经验证的猜测写入长期记忆。
- 不改名、不删除现有 33 个工具；目标工具面在独立兼容阶段新增 1 个 `architecture`，最终为 34 个。

---

## 3. Agent、MCP 和用户的职责

### 3.1 Agent 负责

- 理解用户真正要解决的问题；
- 阅读项目上下文、代码、图谱、历史记忆和现有测试；
- 判断受影响模块、接口、数据和兼容范围；
- 提出实现方案、迁移方案和回滚方案；
- 实际修改代码、运行测试和修复问题；
- 对自己的判断提供证据；
- 在确实缺少业务事实时询问用户。

### 3.2 MCP Probe Kit 负责

- 告诉 Agent 当前任务应该先做什么；
- 自动召回与当前任务相关的历史经验；
- 提供项目上下文、调用链和影响范围证据；
- 要求 Agent 完成统一的任务分析；
- 将分析编译成可恢复的执行计划；
- 保存每个步骤的状态、证据、revision 和未决项；
- 检查规格、测试、审查和收敛证据是否齐全；
- 发现 Agent 声明与真实 diff、契约或测试不一致时提出阻断；
- 只在收敛通过后允许正式沉淀长期记忆。

### 3.3 用户负责

- 提供业务目标和关键限制；
- 确认代码和项目中无法推导的业务事实；
- 对重大取舍、不可逆变化和高风险迁移作出决定；
- 不需要选择流程等级，也不需要记住所有 MCP 工具。

---

## 4. 工具总体设计

V1 先冻结现有 33 个公开工具的兼容基线，再以独立提交新增 1 个统一架构工具 `architecture`。目标工具面为 34 个。

工具职责和调用方式必须分开理解，禁止把“原子能力”“可组合能力”和“必须被编排”混为一谈：

```text
workflow
  仅在 Agent 不确定首个工具时提供路由建议

start_*
  场景流程编排器：只组合该场景实际需要的能力，生成 Delegated Plan

fix_bug / code_insight / architecture / check_spec / gentest / code_review ...
  原子或领域能力：可以被 Agent 直接调用；其中一部分也可以被 start_* 组合

plan_heartbeat / resume_plan / converge
  跨流程通用的状态与收敛能力

Memory 工具
  跨流程通用的召回、候选、沉淀和维护能力
```

其中 `start_*` 不是意图识别器，也不是所有工具的总入口。任务类型由 Agent 根据用户上下文和 Skill 判断；`workflow` 只是可选兜底。`start_*` 只在用户需要完整交付流程时，把已经选定场景所需的部分能力按顺序组合起来。

三个概念必须严格区分：

```text
原子能力
  工具职责单一，可以独立完成一次明确任务

可组合能力
  既可以独立调用，也可以作为某个 start_* 流程中的一个步骤

被编排能力
  仅指在某一次具体 Delegated Plan 中实际被 start_* 选中的能力
```

因此，原子能力不等于必须被编排，可组合也不等于每次都要进入 `start_*`。

典型关系：

```text
start_bugfix 编排 fix_bug
start_feature 编排 add_feature / check_spec / estimate / gentest / code_review
start_ui 编排 ui_search / ui_design_system / gentest / code_review
```

但以下直接调用同样是正常路径，不需要先经过任何 `start_*`：

```text
只想理解代码或影响范围 → code_insight
只想做根因分析 → fix_bug
只想检查现有规格 → check_spec
只想做架构评估或设计 → architecture
只想生成测试建议 → gentest
只想审查当前 diff → code_review
只想查询或维护记忆 → Memory 工具
只想生成 Git 工作报告 → git_work_report
```

Agent 是否使用 `start_*`，取决于当前目标是“完成一个完整交付流程”，还是“执行一个明确的单项能力”。

总计：目标 34 个。当前兼容基线仍为 33 个，新增 `architecture` 必须独立验收。

---

## 5. 编排、路由与架构入口

### 5.1 `start_feature`

用途：新功能、功能增强、跨模块能力和大版本功能改造的首选入口。

输入必须包含当前对话已经确认的完整需求，而不是“继续”“开始”等短句。

内部流程：

```text
恢复完整任务意图
→ 自动检索相关 Memory
→ 检查项目上下文是否可用
→ 必要时使用 code_insight 获取影响证据
→ 要求 Agent 完成 Task Assessment
→ 确定规格布局和验收标准
→ 生成 Delegated Plan
→ 首次 plan_heartbeat 建立检查点
```

Task Assessment 至少回答：

1. 当前行为和目标行为分别是什么？
2. 涉及哪些入口、模块、调用链和数据路径？
3. 是否改变公共接口、Schema、数据口径或状态所有权？
4. 是否需要兼容、迁移、回滚或用户确认？
5. 哪些测试和真实场景必须保持正常？

`start_feature` 不替 Agent 判断答案，只确保这些问题没有被跳过，并把答案写入计划和规格。

标准后续链路：

```text
start_feature
→ plan_heartbeat
→ add_feature
→ check_spec
→ Agent 实现
→ gentest
→ 运行测试
→ code_review
→ converge
→ memorize_asset
→ gencommit
```

### 5.2 `start_bugfix`

用途：Bug、报错、异常、不生效、回归和行为不一致。

`start_bugfix` 是完整 Bug 交付流程的编排器，不拥有 SRC-8 方法论本身。

SRC-8（Software Root-Cause 8-step，受丰田 TBP 启发）的唯一能力归属是 `fix_bug`。`start_bugfix` 负责组合：

```text
Memory Recall
→ 项目上下文与图谱
→ fix_bug / SRC-8 子流程
→ 规格闸门（按需）
→ Plan 状态
→ code_review
→ converge
→ Memory 正式沉淀
```

实现上可以把 `fix_bug` 返回的 SRC-8 子步骤展开到顶层 Delegated Plan，便于 Agent 顺序执行和 heartbeat；但步骤定义、门禁、工作表和输出 Schema 必须来自 `fix_bug` 的同一事实源，`start_bugfix` 不得维护另一份八步法。

下面列出的 SRC-1 至 SRC-8，是 `start_bugfix` 所编排的 `fix_bug` 子流程；规范性定义见 6.3。

#### SRC-1 明确差距

- 写清理想行为、实际行为和可观察差距；
- 区分失败、停滞、性能下降、回归和未生效；
- 禁止只记录“坏了”“卡了”“有问题”。

#### SRC-2 收敛边界

- 建立发生前、发生中、发生后的时间线；
- 读取日志、堆栈、源码和运行证据；
- 必要时调用 `code_insight` 定位入口、调用链和影响范围；
- 从 code、runtime、data_contract、integration、agent_behavior、environment 六层收敛问题边界。

#### SRC-3 验收契约

- 在修复前定义“什么叫修好”；
- 优先建立 failing test，或者可重复的复现命令、手动步骤；
- 明确回归范围和不得破坏的现有行为。

#### SRC-4 把握真因

Agent 必须完成真因工作表：

```text
4a 假设清单：至少 2 个候选假设
4b 排除矩阵：证据、反证和结论
4c 对比分叉：成功样本 vs 失败样本；没有样本则记录 evidence gap
4d 5 Why：至少 3 层，每层绑定观察事实
4e 真因陈述：形成可验证的因果句；复杂问题记录主因和贡献因子
```

SRC-4 没有闭合前禁止修改代码。猜测、症状描述和“某 SDK 有 Bug”不能直接作为真因。

#### SRC-5 制定对策

- 对策必须针对真因，而不是增加兜底掩盖症状；
- 优先最小 patch、最少文件和最少新概念；
- 评估有效性、可行性、副作用和回归风险；
- 如果对策改变模块边界、数据所有权或公共契约，调用 `architecture mode=assess|design`。

#### SRC-6 贯彻修复

- SRC-1 至 SRC-5 和复现门禁完成后才能改代码；
- 一次只验证一个主要假设；
- 实际修改必须限制在已确认的 Bug 范围；
- 连续三次修复仍失败时返回 SRC-2 或 SRC-4，不得继续盲试。

#### SRC-7 评价双轨

- 结果轨：重跑原复现、failing test 和回归测试；
- 过程轨：复盘哪条假设可以更早排除、哪一步证据不足；
- 对涉及架构的修复调用 `architecture mode=validate|drift`；
- 未验证不得声明修复完成。

#### SRC-8 巩固传播

- 补回归测试锁定边界；
- 排查同类模块和相同路径是否存在同源问题；
- 生成 MemoryCandidate，至少包含【现象】【根因】【修复】【验证】；
- 失败方案、被证伪根因和新发现的回归同样形成负面候选；
- 只有 `converge passed=true` 后才能调用 `memorize_asset` 正式沉淀。

整体内部流程：

```text
恢复错误现象和预期行为
→ 自动检索相似 Bug、负面经验和历史根因
→ 生成 SRC-8 Delegated Plan
→ 首次 plan_heartbeat 附完整 Plan 建立检查点
→ SRC-1 明确差距
→ plan_heartbeat
→ SRC-2 收敛边界（code_insight 按需）
→ plan_heartbeat
→ SRC-3 建立验收契约
→ plan_heartbeat
→ SRC-4 真因工作表闭合
→ plan_heartbeat
→ SRC-5 制定最小对策（architecture 按需）
→ plan_heartbeat
→ SRC-6 贯彻修复
→ plan_heartbeat
→ SRC-7 结果与过程双评（architecture validate/drift 按需）
→ plan_heartbeat
→ SRC-8 回归保护与 MemoryCandidate
→ plan_heartbeat
```

Bug 未能复现时，不允许直接把猜测当作根因。可以记录假设，但必须明确验证方式。

标准后续链路：

```text
start_bugfix
→ plan_heartbeat
→ 严格执行 SRC-1~SRC-5
→ architecture（架构根因或架构对策时）
→ SRC-6 Agent 修复
→ gentest + SRC-7 回归验证
→ code_review
→ converge
→ SRC-8 memorize_asset（根因、修复、失败方案或错误根因）
→ gencommit
```

### 5.3 `start_ui`

用途：页面、组件、交互、响应式、视觉优化和设计系统相关开发。

内部流程：

```text
恢复完整 UI 目标
→ 自动检索项目设计规范、历史 UI 决策和已知问题
→ 读取现有页面和组件结构
→ 需要时调用 ui_search / ui_design_system
→ Agent 明确内容层级、交互状态、响应式和无障碍要求
→ 生成实现与验收计划
→ plan_heartbeat 建立检查点
```

UI 验收不只检查代码，还应包含：

- 关键页面截图或视觉证据；
- 交互状态；
- 空状态、加载状态和错误状态；
- 移动端或响应式表现；
- 不破坏现有设计系统。

标准后续链路：

```text
start_ui
→ plan_heartbeat
→ ui_search / ui_design_system（可选）
→ Agent 实现
→ gentest
→ 视觉与交互验收
→ code_review
→ converge
→ memorize_asset
→ gencommit
```

### 5.4 `architecture`

用途：当任务涉及模块边界、依赖方向、数据所有权、公共契约、系统拆分、迁移方案或架构漂移时，提供统一的架构工作流。

只增加一个工具，避免把架构能力拆成多个孤立入口。工具使用以下 mode：

| mode | 作用 | 典型调用时机 |
|---|---|---|
| `assess` | 基于当前代码、图谱和 Memory 判断架构影响与问题边界 | 新功能、Bug 或重构发现跨模块影响时 |
| `design` | 形成目标边界、依赖方向、数据所有权、契约、迁移和回滚方案 | 实施前需要作架构设计时 |
| `validate` | 检查拟定方案是否覆盖影响范围、兼容和约束 | 方案完成、写代码前或重大阶段完成后 |
| `drift` | 对照已确认设计和真实 diff，检查越界依赖、重复事实源和未登记变化 | 实施后、`converge` 前 |

`architecture` 不替 Agent 决定哪个方案绝对最优。它负责：

- 自动检索相关架构决策、失败重构和兼容经验；
- 调用或消费 `code_insight` 的当前结构和影响证据；
- 要求 Agent 明确当前问题、目标结构和选择依据；
- 结构化记录模块边界、依赖方向、数据所有权和公共契约；
- 明确必须保护的既有行为；
- 给出迁移、回滚、验证和旧代码清理要求；
- 生成 ADR/ArchitectureCandidate，并写入 Plan；
- 在 `converge` 通过后沉淀经过验证的架构决策或反模式。

标准输出至少包含：

```text
当前架构事实与证据
→ 当前问题和根因
→ 目标模块边界
→ 允许与禁止的依赖方向
→ 数据所有者和读写路径
→ 公共契约及兼容要求
→ 必须保护的行为
→ 实施阶段、迁移与回滚
→ 验证清单
→ MemoryCandidate / ADR Candidate
```

标准后续链路：

```text
search_memory
→ code_insight mode=impact
→ architecture mode=assess
→ architecture mode=design
→ plan_heartbeat
→ Agent 实施
→ architecture mode=validate|drift
→ code_review
→ converge
→ memorize_asset（架构决策、迁移经验或反模式）
```

以下情况不要求调用 `architecture`：

- 单文件文案或样式修改；
- 不改变公共行为的局部实现；
- 根因和影响范围明确的单模块修复；
- 纯只读查询。

### 5.5 `refactor`

用途：整理代码、拆分模块、降低耦合、收口数据所有权和渐进式架构调整。

大范围重构前必须先调用 `code_insight mode=impact`。

内部流程：

```text
检索历史架构决策和失败重构经验
→ code_insight 获取当前结构和影响范围
→ architecture mode=assess 描述当前问题和架构影响
→ architecture mode=design 定义目标边界、数据所有权和必须保护的行为
→ 拆分为可独立验证、可回滚的小步骤
→ 生成阶段计划
→ 每步完成后 plan_heartbeat
```

重构不能只以“代码更整洁”为完成标准，必须证明：

- 外部行为未意外变化；
- 数据口径和唯一事实源没有被破坏；
- 依赖方向得到改善或至少没有恶化；
- 每个阶段可以独立回滚；
- 旧代码在替代完成后有明确清理计划。

标准后续链路：

```text
code_insight
→ architecture mode=assess|design
→ refactor
→ plan_heartbeat
→ 分阶段实现
→ 每阶段测试与 heartbeat
→ architecture mode=validate|drift
→ code_review
→ converge
→ memorize_asset（架构决策和反模式）
→ gencommit
```

### 5.6 `start_onboard`

用途：新仓库、新成员或 Agent 第一次进入项目时建立可靠心智模型。

内部流程：

```text
检查 AGENTS.md 和 docs/project-context
→ init_project_context（缺失或过期时）
→ code_insight 获取入口、模块和关键调用链
→ 读取构建、测试、运行和发布命令
→ 检索项目 Memory
→ 输出项目导航和已知约束
```

可使用 `scan_and_extract_patterns` 生成候选模式，但未经验证不得直接写入长期记忆。

### 5.7 `workflow`

用途：Agent 不确定应该使用哪个入口时提供路由建议。

它只负责：

- 根据完整意图选择第一个工具；
- 给出参数提示；
- 展示建议流程和禁止事项。

它不负责：

- 判断需求风险等级；
- 作为所有任务的强制主入口；
- 替代 `start_*` 的项目分析；
- 阻止 Agent 直接调用明确的入口工具。

---

## 6. 十七个核心执行与记忆工具

### 6.1 `init_project_context`

作用：为现有项目生成或刷新 `AGENTS.md`、项目上下文和图谱基线。

何时使用：

- 第一次进入项目；
- 现有上下文明显过期；
- 大改前找不到可信入口、模块边界和测试命令。

它生成项目事实，不判断架构一定正确。

### 6.2 `code_insight`

作用：提供代码入口、调用链、依赖、影响范围和相关测试证据。

要求：

- 图谱可用时返回图谱证据；
- 图谱不可用时明确降级，不伪造调用关系；
- 输出来源和置信度；
- 结果用于 Agent 判断，不直接替 Agent决定方案。

### 6.3 `fix_bug`

作用：Bug 修复领域能力，拥有 SRC-8 的唯一规范性定义，包括八步清单、真因工作表、门禁、结构化输出和子流程计划。它可以被 Agent 独立调用，也通常由 `start_bugfix` 编排。

职责边界：

- `fix_bug` 定义“Bug 应该怎样分析和修复”；
- `start_bugfix` 定义“完整 Bug 交付还要组合哪些上下文、状态、审查、收敛和记忆步骤”；
- `workflow` 只在 Agent 不确定入口时建议调用 `start_bugfix`；
- 三者不得重复维护 SRC-8 规则。

至少要求：

- SRC-1 理想行为、实际行为和可观察差距；
- SRC-2 时间线、问题边界和归因层；
- SRC-3 failing test、复现命令或手动验收契约；
- SRC-4 至少两个候选假设、排除证据、成功/失败对比、至少三层 5 Why 和真因因果句；
- SRC-5 最小对策、有效性、可行性和回归风险；
- SRC-6 复现门禁通过后再实施；
- SRC-7 结果和过程双轨评价；
- SRC-8 回归保护和 MemoryCandidate。

真因工作表未闭合前不得进入修复；连续三次修复失败后必须退回边界或真因步骤。

`fix_bug` 的规范性产物至少包括：

```text
src8Checklist
rootCauseWorksheet
src8Gate
BugAnalysis Schema
SRC-1~SRC-8 子计划
MemoryCandidate 模板
```

`start_bugfix` 只能复用或展开这些产物，不能在自己的模块中重新定义一套步骤标题、依赖、门禁或证据要求。

### 6.4 `add_feature`

作用：在范围和规格布局已确定后生成规格模板。

它不是大型需求的第一个入口，也不替代 `start_feature`。

规格至少包含：

- 目标与非目标；
- 当前行为与目标行为；
- 功能需求；
- 影响模块；
- 接口和数据变化；
- 兼容、迁移和回滚；
- 验收标准；
- 测试范围；
- 历史经验与已知坑。

小型任务可以使用紧凑规格，不强制生成大量文档。

### 6.5 `check_spec`

作用：写实现代码前检查规格是否足以指导开发和验收。

检查重点：

- 需求是否明确；
- 验收标准是否可测试；
- Agent 是否说明影响范围；
- 接口、数据、兼容和回滚是否遗漏；
- 是否引用了相关历史记忆和项目证据；
- 是否存在未关闭的关键问题。

它检查完整性和一致性，不判断方案是否绝对最优。

### 6.6 `gentest`

作用：为功能、Bug 和重构生成测试策略与测试候选。

应区分：

- 单元测试；
- 受影响模块测试；
- 主链回归；
- 协议、CLI、Host 或 Apps 测试；
- 真实运行或 Agent 验收。

测试文件生成后仍必须真实执行，不能把“已生成测试”当作“测试通过”。

### 6.7 `code_review`

作用：审查实际 diff，而不是只审查 Agent 的计划。

重点检查：

- 实际修改是否超出声明范围；
- 根因是否真正关闭；
- 是否新增重复事实源；
- 接口、Schema 和数据口径是否同步；
- 测试是否覆盖关键行为；
- 是否留下死代码、临时兼容和未处理风险；
- 是否存在安全、权限或隐私问题。

### 6.8 `plan_heartbeat`

作用：保存当前任务的可恢复检查点。

首次调用必须附完整 Delegated Plan，之后每完成、跳过或阻塞一个步骤都要更新。

保存内容：

- 当前步骤；
- 已完成步骤；
- 跳过原因；
- 未决问题；
- 需求、规格、实现、测试和审查证据；
- 当前 Git revision；
- MemoryCandidate；
- 下一步动作。

### 6.9 `resume_plan`

作用：在会话中断、IDE 重启或切换 Agent 后恢复任务。

返回：

- 完整目标；
- 当前步骤；
- 已完成和未完成步骤；
- 最近验证 revision；
- 未决问题；
- 已有证据；
- MemoryCandidate；
- 下一可执行动作。

新 Agent 不应依赖旧对话正文才能继续。

### 6.10 `converge`

作用：最终交付收敛闸门。

至少检查：

- 计划步骤已完成或有合理跳过说明；
- 关键未决问题已关闭；
- 需求或修复目标有证据；
- 规格要求已满足；
- 实现 revision 已记录；
- 测试真实执行且结果可追溯；
- code_review 已完成；
- 真实 Host、CLI、协议或本地 build 验收在需要时已完成；
- MemoryCandidate 只包含可复用且已验证的内容。

只有 `converge passed=true` 后：

- 才允许正式调用 `memorize_asset`；
- 才建议生成最终提交；
- 才能对用户声明任务已完成。

### 6.11 `gencommit`

作用：根据已收敛的实际 diff、测试和计划生成提交信息。

提交说明应包含：

- 修改目标；
- 关键范围；
- 重要兼容或迁移信息；
- 测试摘要；
- 对应 plan/spec 标识。

工具只生成提交信息，不自动 push、tag 或发布。

### 6.12 `search_memory`

作用：按任务、项目、模块、错误和技术栈检索历史记忆。

使用方式：

- `start_feature`、`start_bugfix`、`start_ui` 应自动注入少量高相关记忆；
- 中途需要更多案例时 Agent 主动调用；
- 当前项目代码和规格永远优先于历史记忆；
- 搜索结果必须显示来源、适用范围和更新时间。

### 6.13 `read_memory_asset`

作用：读取命中的单条记忆全文及其证据、版本和适用范围。

Agent 不应仅根据搜索摘要执行高影响决策。

### 6.14 `memorize_asset`

作用：将已验证的 MemoryCandidate 正式写入长期记忆。

只允许在 `converge passed=true` 后调用。

优先沉淀：

- 架构决策；
- Bug 根因和回归保护；
- 稳定实现模式；
- 失败方案和负面经验；
- 数据所有权和业务口径；
- Host、协议和发布兼容经验；
- 经过验证的测试与验收方法。

不沉淀：

- 临时日志；
- 未验证猜测；
- 普通任务步骤；
- 可直接从当前代码读取的低价值事实；
- 已经过期的版本数量和临时状态。

### 6.15 `update_memory_asset`

作用：修正、补充或取代已有记忆，保留资产身份和变更关系。

新事实推翻旧事实时，应使用更新或 supersede，而不是留下两个互相冲突的有效结论。

### 6.16 `delete_memory_asset`

作用：删除错误、重复、无价值或不应保留的记忆。

删除前应先读取确认，并要求 `confirm=true`。应保留最小审计记录，避免错误内容被无意恢复。

### 6.17 `scan_and_extract_patterns`

作用：从代码库批量发现可复用模式、反模式和候选经验。

输出只能是 MemoryCandidate，不能自动写入长期记忆。候选必须经过人工或任务验证，再由 `memorize_asset` 正式沉淀。

---

## 7. 十个可选辅助工具

| 工具 | 作用 | 在主流程中的位置 |
|---|---|---|
| `start_product` | 产品目标、用户价值、范围和 PRD 编排 | 产品需求尚未形成可开发范围时使用 |
| `start_ralph` | 长周期自主迭代和循环任务 | 复杂长任务的执行外壳，内部仍使用 heartbeat/converge |
| `init_project` | 空目录初始化项目 | 仅用于新项目，不用于现有仓库重构 |
| `estimate` | 故事点、工时和风险估算 | 规格明确后使用，不能替代工程判断 |
| `git_work_report` | 基于 Git 历史生成工作报告 | 交付管理辅助，不参与质量闸门 |
| `ui_design_system` | 生成设计 token 和组件规则 | `start_ui` 需要建立或补全设计系统时使用 |
| `ui_search` | 检索 UI/UX 模式和模板 | UI 方案探索阶段使用 |
| `sync_ui_data` | 更新内嵌 UI 数据 | UI 数据源维护，不进入普通开发主链 |
| `ask_user` | 向用户询问单个关键问题 | Host 缺少原生 elicitation 时使用 |
| `interview` | 结构化需求访谈 | 需求高度模糊时使用，不应成为每个任务的强制步骤 |

---

## 8. 统一任务生命周期

所有工程任务使用同一条逻辑链，但小任务可以简化规格和影响分析深度。

```text
1. Intake
   恢复用户完整意图和项目位置

2. Recall
   自动检索相关成功经验、失败经验和架构约束

3. Understand
   读取项目上下文，必要时使用 code_insight

4. Assess
   Agent 回答影响、接口、数据、兼容、回滚和测试问题

5. Specify & Plan
   生成紧凑或完整规格，check_spec 后形成 Delegated Plan

6. Execute
   Agent 实施；每个步骤后 plan_heartbeat

7. Verify
   gentest、真实测试、运行时或 Host 验收

8. Review
   code_review 检查实际 diff、遗漏和回归风险

9. Converge
   检查计划、证据、未决问题和实际结果

10. Learn
    converge 通过后，将 MemoryCandidate 正式沉淀或更新

11. Commit
    生成可审计提交信息；是否提交由用户或 Agent 权限决定
```

---

## 9. Memory 的完整闭环

Memory 必须贯穿任务，而不是任务结束后临时想起来才写。

```text
Recall
→ Apply with verification
→ Capture MemoryCandidate
→ Validate
→ Converge
→ Memorize / Update
→ Reuse
→ Supersede / Delete when stale
```

### 9.1 开始前召回

入口工具自动检索：

- 同项目相似任务；
- 同模块历史改动；
- 相同错误和根因；
- 架构决策；
- 失败方案；
- Host、协议和测试经验。

只注入少量高相关内容，避免用大量旧信息污染上下文。

### 9.2 执行中产生候选

Agent 发现可复用结论时，将其加入 Plan 的 `MemoryCandidate`：

```json
{
  "type": "bug_root_cause",
  "summary": "App-only Tool 不应出现在模型 tools/list",
  "evidence": ["protocol test", "contract audit", "agent validation"],
  "status": "candidate"
}
```

### 9.3 收敛后正式写入

`converge` 验证通过后返回 `memoryWriteAllowed=true`，Agent 再调用 `memorize_asset`。

### 9.4 后续维护

- 新证据补充旧记忆：`update_memory_asset`；
- 新结论取代旧结论：更新并标记 superseded；
- 错误或重复内容：`delete_memory_asset`；
- 当前代码与记忆冲突：当前代码优先，并触发记忆复核。

---

## 10. MCP 可以可靠检查的内容

MCP 不判断需求“强弱”，但可以检查客观工程事实：

- Agent 是否读取项目上下文；
- 不熟代码时是否获得调用链和影响证据；
- Task Assessment 是否回答完整；
- 规格是否包含可测试验收标准；
- 是否声明接口、Schema、数据和兼容变化；
- 实际 diff 是否超出 Agent 声明范围；
- 是否修改公共契约但遗漏测试和文档；
- 是否修改持久化结构但没有迁移或回滚说明；
- 是否修改权限和安全边界但没有审查；
- 测试是否真实执行；
- code_review 是否完成；
- 未决问题是否关闭；
- 记忆候选是否有证据且具备复用价值。

发现不一致时，MCP 返回明确缺口和修复动作，不自行重写业务方案。

---

## 11. 不同场景的组合方式

### 11.1 新功能

```text
start_feature
→ 自动 Memory Recall
→ init_project_context / code_insight（按需）
→ Agent Task Assessment
→ architecture mode=assess|design（涉及模块边界、数据所有权、公共契约或迁移时）
→ add_feature
→ check_spec
→ plan_heartbeat
→ Agent 实现
→ gentest + 真实测试
→ architecture mode=validate|drift（本任务使用过 architecture 时）
→ code_review
→ converge
→ memorize_asset / update_memory_asset
→ gencommit
```

### 11.2 Bug 修复

```text
start_bugfix
→ 自动检索相似 Bug 和失败方案
→ SRC-1 明确差距
→ SRC-2 code_insight 收敛边界
→ SRC-3 验收契约
→ SRC-4 完成真因工作表（fix_bug 可见时作为辅助）
→ SRC-5 最小对策（architecture assess/design 按需）
→ plan_heartbeat
→ SRC-6 Agent 修复
→ SRC-7 gentest + 回归测试 + architecture validate/drift（按需）
→ code_review
→ converge
→ SRC-8 memorize_asset（根因、回归、失败方案或被证伪根因）
```

### 11.3 UI 开发

```text
start_ui
→ 自动检索设计规范和历史 UI 经验
→ ui_search / ui_design_system（按需）
→ plan_heartbeat
→ Agent 实现
→ 测试 + 截图/交互验收
→ code_review
→ converge
→ memorize_asset
```

### 11.4 大重构

```text
search_memory
→ code_insight mode=impact
→ architecture mode=assess|design
→ refactor
→ plan_heartbeat
→ 分阶段实现、测试和 heartbeat
→ architecture mode=validate|drift
→ code_review
→ converge
→ memorize_asset（架构决策、反模式、迁移经验）
```

### 11.5 独立架构设计或审查

```text
architecture mode=assess
→ 自动 Memory Recall
→ code_insight mode=impact
→ Agent 核对现状和问题
→ architecture mode=design
→ plan_heartbeat
→ 方案评审或实施
→ architecture mode=validate|drift
→ code_review / converge
→ memorize_asset（验证后的架构决策或反模式）
```

### 11.6 会话中断或切换 Agent

```text
resume_plan
→ 读取当前状态、证据、MemoryCandidate 和下一步
→ 继续执行
→ plan_heartbeat
→ converge
```

### 11.7 新项目上手

```text
start_onboard
→ init_project_context
→ code_insight
→ search_memory
→ 输出项目导航、命令、边界和已知问题
→ scan_and_extract_patterns（可选，仅生成候选）
```

---

## 12. 统一输出要求

入口和计划工具的 structuredContent 应逐步统一包含：

```json
{
  "taskSummary": "完整任务摘要",
  "currentState": "planned",
  "memoryContext": {
    "enabled": true,
    "hits": [],
    "warnings": []
  },
  "projectEvidence": {
    "contextAvailable": true,
    "graphAvailable": true,
    "confidence": "high"
  },
  "assessmentQuestions": [],
  "plan": {},
  "nextAction": {},
  "evidenceRequired": [],
  "warnings": []
}
```

这不是新工具，而是让不同入口返回一致结构，便于任何 Host 和 Agent 按相同方式执行。

---

## 13. 异常和降级处理

### 13.1 用户只说“继续”

Agent 必须从当前对话、活动 Plan、已有 Spec 和 history 恢复完整任务，不能把“继续”直接传入入口工具。

### 13.2 Memory 不可用

主流程继续，明确标记未召回历史经验；不得假装完成记忆检索。

### 13.3 图谱不可用

使用本地静态文件、import/export、Git diff 和 Manifest 证据，明确置信度降低；不得伪造调用链。

### 13.4 Agent 已经先修改了代码

不假装修改不存在：

- 捕获当前 diff；
- 让 Agent 补做影响分析和计划；
- 检查是否需要回滚；
- 未补齐测试和审查前不得 converge。

### 13.5 记忆与当前代码冲突

当前项目事实优先。冲突记忆进入复核，任务完成后更新或删除。

### 13.6 Host 不支持 MCP Apps

使用 text 和 structuredContent，核心流程不依赖 UI。

### 13.7 MCP 工具在 Host 中不可见

使用项目内版本锁定的 CLI fallback，但必须复用同一 Plan、Memory 和验证规则。

---

## 14. 渐进式实施顺序

### Phase 0：冻结兼容基线

- 固定现有 23 / 29 / 33 工具面；
- 固定 Legacy / Modern、CLI、Apps 和 Memory 行为；
- 固定现有自动化、协议和 Claude 本地 build 验收；
- 不修改生产行为。

### Phase 1：统一工具职责和主流程

- 以本文更新 Skill、Catalog 和文档；
- 明确 `workflow`、`start_*`、原子能力、Plan 和 Memory 的分层职责；
- 明确 `start_*` 是流程编排器，不承担意图识别；
- 将 `fix_bug` 确立为 SRC-8 八步法的唯一事实源，`start_bugfix` 只负责编排和展开；
- 修正互相冲突的调用说明；
- 不新增工具、不改 Schema。

### Phase 2：新增统一 `architecture` 工具

- 只新增一个 `architecture` 工具，不拆成多工具家族；
- 支持 `assess|design|validate|drift` 四种 mode；
- 复用 `code_insight`、Memory、Plan 和 Converge，不复制其实现；
- 接入 `start_feature`、`start_bugfix`、`refactor` 和独立架构任务；
- 保持现有 33 个工具名称、输入输出和可见性不变；
- 完成后目标工具面为 34 个，并单独进行协议、Host、CLI 和 Claude 本地 build 验收。

### Phase 3：Task Assessment 与 MemoryCandidate

- 在现有 `start_*` Plan 中加入统一的影响分析问题；
- 将 MemoryCandidate 写入 Plan 状态；
- 不做自动风险分级。

### Phase 4：增强 Heartbeat、Resume 和 Converge

- Heartbeat 保存统一证据和候选记忆；
- Resume 无需旧对话即可恢复；
- Converge 根据实际任务检查证据，返回 memoryWriteAllowed。

### Phase 5：实际 Diff 与验证一致性

- code_review 对照 Agent 声明和真实 diff；
- 对公共契约、数据结构、运行入口和权限变化增加客观检查；
- 继续使用本地 build 和真实 Agent 场景验收。

### Phase 6：Memory 质量治理

- 去重；
- 冲突提示；
- supersede；
- 过期标记；
- 错误删除；
- 检索质量和注入长度校准。

每个 Phase 独立提交、独立测试、可单独回滚。

---

## 15. 验收标准

### 15.1 跨 Agent 一致性

同一个任务由 Claude Code、Cursor 和 CLI fallback 执行时：

- 进入相同类型的入口流程；
- 得到相同的 Task Assessment 问题；
- 使用同一 Plan 状态语义；
- 使用同一 Memory 召回和沉淀规则；
- 使用同一 Converge 证据要求。

### 15.2 可恢复性

- 任意步骤中断后可通过 `resume_plan` 继续；
- 新 Agent 能看到目标、完成步骤、证据、revision 和未决项；
- 不依赖旧对话正文。

### 15.3 可验证性

- 未运行测试不能声称测试通过；
- 未完成 review 不能通过收敛；
- 关键未决问题未关闭不能通过收敛；
- 需要 Host、协议或本地 build 验收时必须有真实证据。
- `start_bugfix` 未完成 SRC-1 至 SRC-5 不得进入修改代码步骤；
- SRC-8 未生成回归保护和 MemoryCandidate 时，Bug 流程不得完整收敛；
- 使用过 `architecture` 的任务，缺少 validate/drift 结果时不得通过最终收敛。

### 15.4 记忆有效性

- `start_*` 能召回高相关历史经验；
- 未经验证的候选不能进入长期记忆；
- 旧记忆与当前代码冲突时能够提示；
- 错误、重复和过期记忆可以修正或删除；
- 同一根因在后续任务中不需要从零重复排查。

### 15.5 不过度治理

- 小型改动可使用紧凑规格和定向测试；
- 不强制所有任务调用 `architecture`，但架构任务必须使用统一架构流程；
- 不强制风险等级；
- 只读查询不要求建立完整 Plan；
- Memory 或图谱不可用时主流程仍可降级执行；
- 用户不需要理解全部 34 个工具才能使用系统。

---

## 16. 成功指标

- Agent 在影响分析前直接大段写代码的次数下降；
- 用户重复提醒“先看项目、先看架构、先测试”的次数下降；
- 会话中断后的恢复成功率提高；
- 同类 Bug 重复发生和重复排查的比例下降；
- 公共契约遗漏消费者的次数下降；
- Converge 缺证据却误报完成的次数为零；
- Memory 检索命中后真正帮助当前任务的比例提高；
- 错误或过期记忆造成误导的次数可追踪并持续下降。

---

## 17. 最终结论

MCP Probe Kit V1 不再追求替 Agent 自动判断需求等级，也不建设庞大的自动控制平台。

它在保护现有 33 个工具兼容性的基础上，只增加一个统一 `architecture` 工具，形成目标 34 个工具的完整但克制的交付系统：

```text
正确入口
→ 历史记忆召回
→ 项目和代码理解
→ Agent 影响判断
→ 必要时完成架构评估、设计和漂移验证
→ 规格和可恢复计划
→ 实际实施
→ 测试和审查
→ 证据收敛
→ 长期记忆沉淀
→ 后续 Agent 复用
```

最终价值不是“工具更多”，而是让每个 Agent 都必须先理解、再实施、用证据完成，并把经过验证的经验留给下一次任务。
