
# MCP Probe Kit 升级 PRD（vNext）

**项目**：mcp-probe-kit
**背景版本**：当前 README 描述 49 工具（37 基础 + 9 智能编排 + UI/UX 工具）
**核心模式**：指令生成器模式（工具不直接操作文件系统/不执行命令，只生成清晰指令给 AI 在客户端执行）
**本 PRD 目标**：在不破坏现有用户使用方式的前提下，让 AI “更聪明地选工具、更稳定地跑工作流、更可控地补齐信息、更可靠地产出结构化结果”。

---

## 1. 背景与问题定义

当前 mcp-probe-kit 提供大量工具覆盖开发全流程，并引入 UI/UX Pro Max 与多种 start_* 编排工作流。随着工具数增长（49），出现以下典型问题：

1. **工具选择成本上升**：模型更容易“选错工具/犹豫/反复试探”。
2. **编排链路不稳定**：start_* 涉及多步骤，耗时长、需要中途补信息，容易出现超时、信息缺失、输出格式不一致。
3. **输出不可机器消费**：多数工具以长文本形式输出，后续编排需要模型解析文本，稳定性差。
4. **客户端能力差异**：不同 MCP 客户端对结构化输出、表单式提问、长任务等支持不一，需要兼容策略。
5. **核心入口不够聚焦**：真正高频价值工具（例如 start_*、gencommit）需要在体验上“更容易被选中、更可靠闭环”。

---

## 2. 升级目的（Goals）

### G1：让 AI 更聪明地“选对工具”

* 通过 **Toolset（工具集）**收敛“对外暴露面”，在不删能力的情况下减少误选概率。
* 确保用户/模型更容易发现高价值入口（尤其是 P0 start_* 与 gencommit）。

### G2：让工作流更稳、更可追踪

* 把复杂的 start_* 工作流升级为**可持续/可轮询/可中断**的长任务（Tasks），并统一进度与阶段产物结构化输出。

### G3：让输出可机器消费（Structured Output）

* 为核心工具和编排输出提供 `outputSchema + structuredContent + text fallback`，避免“靠模型解析长文”造成的随机性。

### G4：让“缺信息就补齐”标准化

* 将 `interview` / `ask_user` 升级为 **原生 Elicitation（表单/选项）优先**，并对不支持的客户端提供回退（fallback）。

### G5：不破坏现有用户（兼容优先）

* 默认行为保持全量工具可用（`full`），新增的收敛与增强通过配置启用。
* 所有工具仍保证 `content[].text` 有可读输出（旧客户端兼容）。

---

## 3. 非目标（Non-goals）

* **不改变“指令生成器模式”本质**：不新增直接读写文件系统/执行命令/联网执行等高权限行为。
* 不追求一次性对 49 个工具全部结构化/Task 化；按优先级分批交付。
* 不强制依赖某个单一客户端能力（Cursor/Claude Desktop/Cline/Continue 等差异必须兼容）。

---

## 4. 范围（Scope）

### 4.1 P0（必须优先完成）

* SDK 升级到 `@modelcontextprotocol/sdk` v1.x
* Toolset 机制（full/core/ui/workflow）
* **5 个 P0 编排入口**：

  * `start_feature`
  * `start_onboard`
  * `start_bugfix`
  * `start_ui`
  * `start_ralph`
* `gencommit`（必须保留，并强化结构化输出）
* 统一结构化输出封装 + 关键 schema
* Elicitation：`interview` / `ask_user`（支持则用表单，不支持则回退）
* Tasks：P0 start_*（支持则长任务，不支持则回退同步）

### 4.2 P1（随后完成）

* 其它 start_*（start_review/start_release/start_refactor/start_api/start_doc 等）Task 化与结构化增强
* 更多基础工具结构化输出覆盖面扩展
* 文档与示例完善、兼容矩阵与回归自动化增强

---

## 5. 关键约束与设计原则

1. **兼容原则**：所有工具始终返回 `content[].text`，structured 只是增强。
2. **收敛原则**：不删工具能力，主要通过 toolset 控制“默认暴露面”。
3. **一致性原则**：P0 start_* 输出必须统一 `WorkflowReport` 结构，便于二次消费与继续迭代。
4. **安全原则**：不引入高权限执行能力；对于需要敏感信息的场景，必须走安全输入/URL 引导，不允许在普通表单直接收集密钥。
5. **可测试原则**：关键工具必须有契约测试（输出字段/类型/兼容性）。

---

## 6. 用户故事（User Stories）

* US-1：作为用户，我希望一键执行 `start_bugfix`，能得到清晰步骤、测试建议和可直接复制的 commit message。
* US-2：作为用户，我希望 `start_ui` 能把设计系统/组件目录/最终代码生成串起来，并保证多个页面风格一致。
* US-3：作为模型，我希望工具输出可机器解析，便于在下一步准确调用工具并复用中间产物。
* US-4：作为用户/模型，当需求不完整时，希望工具能以表单方式询问，并校验输入。
* US-5：作为老用户，我不希望升级后工具突然消失或客户端读不到输出。

---

## 7. 功能需求（Functional Requirements）

### FR-1：SDK 升级（必须）

**要求**：

* 升级到 `@modelcontextprotocol/sdk` v1.x。
* 服务启动、tool 注册与 stdio transport 正常工作。
* 兼容主流客户端（Cursor、Claude Desktop、Cline、Continue）。

**验收**：

* `npm run build` 通过；`npx mcp-probe-kit@beta` 可运行；至少 1 个客户端能列出工具并调用成功。

---

### FR-2：Toolset（工具集）收敛机制（必须）

新增环境变量：`MCP_TOOLSET=full|core|ui|workflow`

* 默认：`full`（兼容现有用户）
* `tools/list` 根据 toolset 过滤返回

#### FR-2.1 toolset 清单（最终版）

**workflow（推荐给 agent）必须包含**：

* P0 编排入口：`start_feature, start_onboard, start_bugfix, start_ui, start_ralph`
* 编排常用：`start_review, start_release, start_refactor, start_api, start_doc`（即便 P1 才 task 化，也可先作为入口保留）
* 关键依赖基础工具（最小闭环）：
  `interview, ask_user, init_project_context, analyze_project, add_feature, estimate, code_review, security_scan, perf, debug, fix, gentest, gencommit, genpr, genchangelog, genapi, gen_mock, design2code, ui_design_system, ui_search`

**core（≤15，日常手动入口）必须包含 `gencommit`**：

1. `interview`
2. `ask_user`
3. `init_project_context`
4. `analyze_project`
5. `code_review`
6. `security_scan`
7. `perf`
8. `debug`
9. `fix`
10. `gentest`
11. `genapi`
12. `genpr`
13. `gencommit`
14. `estimate`
15. `start_bugfix`（你也可以改成 `start_feature`，但必须保留一个高价值编排入口）

**ui（≤10）主推**：

* `start_ui`
* `ui_search`
* `ui_design_system`
* `design2code`
* （可选）`genui`
* 其余 UI pipeline 步骤（`init_component_catalog/render_ui/sync_ui_data`）默认不在 ui toolset 暴露，但 full 可用。

**full**：49 工具全量

**验收**：

* `tools/list` 在不同 toolset 下返回数量符合约束；
* `workflow` 中 P0 五个 start_* 必出现；
* `core` 中 `gencommit` 必出现。

---

### FR-3：统一结构化输出封装（必须）

新增统一 helper（不要求一次性改完所有工具，但 P0 必须接入）：

* `okText(text, meta?)`
* `okStructured({schema, data, textFallback?})`

  * 必须同时返回：

    * `structuredContent: data`
    * `content: [{ type:"text", text: textFallback 或 人类可读摘要 }]`

**验收**：

* P0 工具在旧客户端仍可读（`content.text` 存在且有意义）；
* 新客户端可稳定解析 `structuredContent`。

---

### FR-4：核心 Schema（必须，至少两类）

#### FR-4.1 `WorkflowReportSchema`（供 start_* 输出统一格式）

字段建议（最小必需）：

* `workflowName`（如 start_bugfix）
* `summary`（一句话总结）
* `steps[]`（每步：name/status/input/outputs/notes）
* `artifacts[]`（产物：type/path/description/contentPreview?）
* `risks[]`
* `assumptions[]`
* `nextActions[]`（下一步建议，按优先级）
* `timestamps`（可选）

#### FR-4.2 `InstructionPackageSchema`（供“指令生成器模式”统一承载）

字段建议：

* `goal`
* `context`（可选）
* `constraints[]`
* `steps[]`（可执行步骤）
* `checklist[]`
* `validation[]`（验证清单）
* `rollbackPlan`（可选）

**验收**：

* P0 start_* 全部输出 `WorkflowReportSchema`；
* P0 基础工具（如 code_review/security_scan/perf/debug/fix/gentest）输出可嵌入 WorkflowReport 的结构化片段。

---

### FR-5：P0 工作流结构化（必须）

对以下 5 个工具输出必须统一 WorkflowReport：

#### FR-5.1 `start_bugfix`（P0）

必须包含：

* `rootCause`（结构化摘要）
* `fixPlan`（步骤/影响面/风险）
* `testPlan`（建议生成/补充哪些测试）
* `commitDraft`（对接 `gencommit` 的结构化结果或可复制文本）
* `nextActions`

#### FR-5.2 `start_feature`（P0）

必须包含：

* `specArtifacts`（由 `add_feature` 产出的 requirements/design/tasks 信息）
* `estimate`（故事点/时间范围/风险）
* `dependencies`（可能涉及模块）
* `nextActions`

#### FR-5.3 `start_onboard`（P0）

必须包含：

* `projectSummary`（技术栈/入口/目录结构摘要）
* `architectureNotes`（关键模块/边界）
* `quickstart`（最短上手路径）
* `contextDoc`（init_project_context 产物引用）

#### FR-5.4 `start_ui`（P0）

必须包含：

* `designSystem`（规则/风格/关键 token）
* `catalog`（组件目录摘要）
* `renderedCode`（最终代码片段或生成指令）
* `consistencyRules`（保证多页面一致性的关键约束）
* `nextActions`

#### FR-5.5 `start_ralph`（P0）

必须包含：

* `loopPolicy`（安全模式脚本/保护策略摘要）
* `iterations[]`（每轮：goal/changes/risks/nextPrompt）
* `stopConditions`（停止条件，避免无限循环）
* `safetyChecks`（每轮校验清单）

**验收**：

* 五个 P0 start_* 的结构字段一致、可复用；
* 任意 P0 start_* 的 report 可作为下一次调用输入上下文（机器可消费）。

---

### FR-6：Tasks 长任务（P0 start_* 必须，带回退）

为 P0 的 5 个 start_* 增加长任务支持：

* `createTask`：启动任务，返回 taskId
* `pollTask`：查询进度，返回当前 step 与累计 report
* `cancelTask`：取消任务

任务状态机（最小必需）：

* `queued → running → input_required → running → succeeded/failed/canceled`

回退策略：

* 不支持 tasks 的客户端：仍返回同步的 `WorkflowReport`（可能是简化版，但字段必须齐全）。

**验收**：

* P0 五个 start_* 均可 task 模式运行；
* `input_required` 时能明确缺什么信息，并走 FR-7 补齐。

---

### FR-7：Elicitation（访谈/提问）原生化（必须，带回退）

`interview` / `ask_user`：

* 若客户端支持 elicitation：使用表单/选项进行结构化提问与校验；
* 不支持：回退为原有文本提问工具。

安全要求：

* **敏感信息**（token/key/账号密码）不得使用普通表单直接采集；应提示用户在客户端安全输入或使用 URL 引导方式（若客户端支持）。

**验收**：

* 支持的客户端：能弹出表单并校验；
* 不支持的客户端：仍能完成问答且产出结构化 `answers`（工具内部整理为 structuredContent）。

---

### FR-8：`gencommit` 必须保留并强化（P0）

**硬性要求**：

* `gencommit` 永远属于 Core toolset；
* 任何收敛/重构不得移除 `gencommit`，仅允许增强参数与输出结构。

输出要求（结构化 + 文本）：

* `structuredContent` 至少包含：

  * `type`（feat/fix/docs/refactor/chore/test/style/perf/build/ci/revert…）
  * `scope`（可空）
  * `subject`
  * `body[]`
  * `breaking`（boolean）
  * `footers[]`（Closes # / BREAKING CHANGE 等）
  * `finalMessage`（可直接复制的 commit message）
* `content.text` 必须输出 `finalMessage`（兼容旧客户端）

与 start_* 集成：

* `start_bugfix`、`start_feature` 在 report 中必须包含 `commitDraft.finalMessage` 或明确可复制的提交信息建议。

**验收**：

* 调用 gencommit 在任意客户端都能得到可复制的 commit message；
* workflow 内可直接消费 structured 字段，不需要解析长文本。

---

### FR-9：工具清单与契约测试（必须）

* 自动生成 `tools-manifest.json`（用于工具分类、toolset 过滤、文档同步）
* 契约测试至少覆盖：

  * P0 五个 start_*
  * `gencommit`
  * 以及核心基础依赖：`init_project_context / analyze_project / add_feature / estimate / gentest / code_review`

契约测试断言（最低要求）：

* 始终包含 `content[].text`
* structured 模式下包含 `structuredContent` 且字段符合 schema（至少做轻量校验）

---

## 8. 非功能需求（Non-functional Requirements）

### NFR-1：兼容性

* 默认 `full` 行为与当前一致；
* 所有工具均有可读文本输出；
* structured/tasks/elicitation 的增量能力必须可回退。

### NFR-2：稳定性与可观察性

* 任务与工具调用必须输出可诊断信息（至少内部日志：toolName、阶段、耗时、错误栈摘要）
* P0 工作流若失败，必须在 report 中给出：

  * failure reason（结构化）
  * nextActions（如何恢复/重试）

### NFR-3：性能

* `tools/list` 在 toolset 模式下响应不明显变慢；
* 长任务通过 poll 获取进度，避免一次性超长输出造成阻塞。

### NFR-4：安全

* 不新增高权限执行能力；
* 提问收集敏感信息必须受控；
* 提供清晰的安全提示与最佳实践文档。

---

## 9. 交付物（Deliverables）

代码交付物（建议路径）：

* `src/lib/response.ts`（统一输出封装）
* `src/schemas/*`（WorkflowReport / InstructionPackage / gencommit schema 等）
* `tools-manifest.json`（自动生成）
* toolset 过滤逻辑（server 的 tools/list）
* tasks 管理与 P0 start_* 接入
* elicitation 接入与 fallback

文档交付物：

* `docs/UPGRADE_PRD.md`（本文档）
* `docs/TOOLSET.md`（core/ui/workflow/full 清单与使用方式）
* `docs/OUTPUT_SCHEMAS.md`（schema 字段定义与示例）
* `docs/CLIENT_COMPAT.md`（各客户端能力差异与 fallback 策略）
* README：加入 toolset 配置示例（含 env）

---

## 10. 里程碑与验收（按交付顺序，不给时间承诺）

### M1：SDK v1.x + 基础回归

* 验收：能启动、能列工具、能调用基础工具，契约测试通过。

### M2：Toolset + 统一输出封装

* 验收：`core/ui/workflow/full` 切换有效；P0 工具保持 `content.text` 输出。

### M3：P0 start_* 结构化 WorkflowReport

* 验收：五个 P0 start_* 输出字段一致且可机器消费。

### M4：P0 start_* Tasks 化 + 回退

* 验收：可轮询进度；失败可诊断；不支持 tasks 的客户端仍能同步输出。

### M5：Elicitation（interview/ask_user）+ 回退

* 验收：支持的客户端表单可用；不支持的仍可完成问答。

### M6：gencommit 强化 + start_* 集成

* 验收：gencommit 结构化字段稳定；start_feature/start_bugfix 报告中包含 commitDraft。

---

## 11. 测试计划（最低要求）

* 单元/契约测试：P0 工具输出与 schema 校验
* 兼容回归：至少在 2 个客户端验证（Cursor + Claude Desktop 或 Cline/Continue）
* 端到端场景：

  1. `start_bugfix`：缺信息 → input_required → 补齐 → 产出测试 + commitDraft
  2. `start_ui`：生成设计系统 → 多页面一致性验证（至少输出一致性规则）
  3. `start_ralph`：至少两轮 iteration，能看到 stopConditions/safetyChecks

---

## 12. 风险与对策

* 风险：结构化输出导致旧客户端“看不到内容”

  * 对策：强制 `content.text` fallback 为必填验收项（契约测试兜底）。
* 风险：toolset 收敛引发“用户找不到工具”

  * 对策：默认仍 full；README 推荐 toolset；提供 env 配置示例。
* 风险：Tasks/elicitation 客户端支持不一致

  * 对策：能力探测 + 回退；同步模式输出完整 report。

---

## 13. 配置需求（对外文档必须写清）

* `MCP_TOOLSET=full|core|ui|workflow`（默认 full）
* （可选）`MCP_SHOW_ALL=1` 或 `MCP_SHOW_DEPRECATED=1`（调试/过渡期）
* beta 发布说明：建议先用 `mcp-probe-kit@beta` 试用新能力

---

如果你希望我把这份 PRD 再“落地一步”，我可以继续输出两份附录（直接可复制）：

1. `tools-manifest.json` 初稿（按你 README 49 工具，含 core/ui/workflow 归属与默认隐藏策略）
2. `WorkflowReportSchema` + `gencommit` schema 的完整 JSON Schema 示例（可直接挂到 `outputSchema`）
