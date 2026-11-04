# v5 同一任务的双内容契约（H / E）

本功能属于 **DevControl v5 本地研发版**。内容、修订、审查和关联全部保存在现有项目 SQLite `dc_*` 表中，没有第二套任务台账，也不产生 Markdown 状态文件。它补充已经存在的冻结执行合同，不替代正式需求、审批、任务状态、真实验收或测试证据。此迭代不发布 npm。

## 解决什么

- **H，人读概览**：让业务负责人不看代码也能判断为什么做、具体做什么、预期效果、业务验收和不做的事。
- **E，AI 实施说明**：让接手 Agent 不猜技术上下文、前置检查、输入输出、不变规则、实施步骤、失败恢复、测试及停止条件。
- **共同事实**：任务 ID、冻结需求来源、`allowedPaths`、`requiredGates`、依赖、实际状态、审批与审计事件仍由旧 SQLite Task 和获批冻结计划提供。H/E 不另行维护这些权威字段。

`acceptance` 始终表示**独立的正式验收标准**，不再用拆句得到 H.work。对于没有已审查 H 版本的历史任务，工作台会明确显示缺少独立的业务工作说明，保留原冻结验收供审计，绝不冒充新审批。

## 独立字段与填写指引

每个字段有固定类型。全部字段都需要出现；可选的数组允许为空，但不能填 `TBD`、`同上` 等占位值。工作目标、预期效果与业务验收是三种不同语义。

| H 人读字段 | 类型 | 具体用途 |
| --- | --- | --- |
| `why` | 字符串，必填 | 现有用户问题和为什么值得做 |
| `work` | 字符串数组，非空 | 本次实际交付哪些业务行为 |
| `effects` | 字符串数组，非空 | 业务使用后的可见效果 |
| `scenarios` | 字符串数组 | 具体使用情境和例子 |
| `businessAcceptance` | 字符串数组，非空 | 业务负责人怎样确认效果 |
| `exclusions` | 字符串数组 | 明确不做的业务内容 |

| E AI 字段 | 类型 | 具体用途 |
| --- | --- | --- |
| `context` | 字符串数组，非空 | 准确的技术上下文和已批准的来源 |
| `prerequisites` | 字符串数组 | 实施前需核对的依赖和条件 |
| `inputs`、`outputs` | 字符串数组 | 已存在的输入输出约束 |
| `invariants` | 字符串数组，非空 | 不得违反的现有业务/技术规则 |
| `steps` | 字符串数组，非空 | 可定位、受冻结范围约束的实施动作 |
| `failureRecovery` | 字符串数组 | 超时、旧请求、切换账户、回滚等异常处理 |
| `tests` | 字符串数组，非空 | 正反与异常场景的可验证测试 |
| `evidence` | 字符串数组，非空 | 需要保存的真实测试证据 |
| `stopConditions` | 字符串数组，非空 | 遇到哪些问题应停止并报告 |

E 文档不能自己授权新文件范围、新 Gate 或新需求。实际 AI 在 `execution-contract` 中同时得到旧冻结合同与经过 H/E 审查的 `audiencePair.aiBrief`。其中 **冻结的 `spec`、`allowedPaths`、`requiredGates` 和审批状态始终优先**。若缺失、版本不一致或 SQLite 内容哈希异常，则只显示 `legacy-unpaired` / `integrity-invalid`，不把未审文档作为可执行依据。

## 版本数据和一致性审核

有四种追加型 SQLite 记录。

| 表 | 内容 | 约束 |
| --- | --- | --- |
| `dc_task_content_revisions` | H/E 各自的内容版本与 SHA-256 | 已批准才正式写入，版本只增加 |
| `dc_task_content_drafts` | 逐受众的待审文本 | 每受众每任务最多一份；不能覆盖已批准版本 |
| `dc_task_content_pair_reviews` | 开发者针对精确 H/E Hash 的对应审查 | 新修订会使旧待审检查失效 |
| `dc_task_content_pairs` | H 与 E 两个版本及其正式审查对应关系 | 附源计划 Hash、审查 Hash、批准者、批准类型 |

当 H.work、H.effects、H.businessAcceptance 和 H.exclusions 有具体条目时，审查中的 `coverage` 必须逐条指向 E 的某个字段与数组序号，并解释一致的理由。业务验收至少对应 AI tests/evidence，不做内容至少对应 AI invariants/stopConditions。审查人还必须独立核对真正的冻结需求来源，明确是否有漏项或额外业务范围。

**工具只能检查条目覆盖和版本哈希，不能自动证明两个自然语言文本语义相同。** `sourceReviewed`、`noOmittedCommitments`、`noAddedBusinessScope` 是实名审查人的实质性结论，不是任何规则引擎自动审批。若审查人员不能给出证据，应选择 revise，不能签署 aligned。

## 例子（内容示意，不属于正式任务事实）

人读 H：

```json
{
  "why": "已经解锁睡眠健康的用户，不应因为本周数据不足丢失之前的结果。",
  "work": ["数据不足时保留上次已解锁结果"],
  "effects": ["首页继续显示原分数和原日期"],
  "scenarios": ["本周数据不足", "本周网络请求失败"],
  "businessAcceptance": ["用户刷新后仍看到原分数和原日期"],
  "exclusions": ["本次不重新评估首次基线"]
}
```

AI E：

```json
{
  "context": ["已批准的睡眠历史解锁状态和冻结需求来源"],
  "prerequisites": ["先核对当前任务真实允许文件范围及原任务冻结条件"],
  "inputs": ["会话标识", "请求版本", "本期数据可用性"],
  "outputs": ["已解锁历史结果与原日期"],
  "invariants": ["数据不足不得重置 everUnlocked 或覆盖原日期"],
  "steps": ["区分传输状态、本期评估和历史解锁事实"],
  "failureRecovery": ["旧请求晚到与切换账号时拒绝错误回写"],
  "tests": ["本期数据不足、请求超时、旧响应晚到、切换账号均保留原有效结果"],
  "evidence": ["记录当前冻结提交对应的真实测试输出"],
  "stopConditions": ["若实现需要原批准范围外的新文件或改动规则，停止并申请正式范围评审"]
}
```

## MCP 操作顺序

1. 读取 `task-content-get` 和原 `execution-contract`，核对任务状态必须是 `ready`、已获批、无有效租约、无待审范围变更；以 `frozenTaskContract.source.planHash` 为准确来源。
2. 分别调用两次 `task-content-stage`，指定 `id`、`audience`、完整 `content`、`expectedRevision`、`expectedSourceHash`、`changeKind`、真实 `actor` 和具体 `reason`。首次 H/E 的 `expectedRevision` 都是 0；内容 Hash 由接口返回。
3. 使用 `task-content-check` 阅读覆盖问题，再使用 `task-content-review` 记录包含 `reviewer`、`outcome:"aligned"`、实质 `rationale`、三个来源/范围审查布尔结论和每条对应 `coverage` 的实名审查。`coverage` 一项格式是 `{ "humanField":"work", "humanIndex":0, "aiField":"steps", "aiIndex":0, "rationale":"具体证据与条款对应说明..." }`。不能因为存在一条相似关键字就声称审核成功。
4. 实质性新组合执行 `task-content-approve`，指定精确 H Hash、E Hash、审查 Hash、原计划 Hash、`approvedBy`、具体 `reason`、`explicitAuthorization:true`。审批后才出现正式 H1/E1 版本关联。
5. 如果只对**已经获批的 H 版本**做纯措辞优化，`changeKind:"editorial"` 必须保持所有列表条目数量不变，E 的上一批准版本不变；审查中再提供 `editorialMeaningUnchanged:true`，由真正完成审查的同一 `reviewer` 承认编辑版本，不再反复要求 Owner 重走整套批准，记录新的 H2/E1 版本绑定和具体证据。工具不能自行判断语义是否真不变。
6. 审批前发现问题，使用 `task-content-withdraw` 撤回指定受众的精确草案 Hash。已批准历史不可删除、覆盖或直接回滚。若有新增业务内容、修改原正式验收标准、文件范围、依赖或 Gate，直接走已有正式 Feature/Release 范围变更，不允许 `changeKind:"material"` 在内容更新中直接通过。

只有**获批、未领取且 Ready** 的任务允许在当前迭代中创建新版本。开发中、`in_review`、已 Verified 的历史任务保留原批准、测试和 SQLite 审计内容；目前未强制旧任务补录 H/E，也未把缺少 H/E 当成额外 Gate。此阶段先建立可复审的双版本契约、管理能力和工作台只读展示；之后如果要将 H/E 设为**新规划任务冻结前的强制条件**，必须另行审核 Feature/Release 的写入契约和历史兼容切换点，不能借上线自动改变当前已批准任务的可领取状态。
