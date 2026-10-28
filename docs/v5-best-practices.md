# MCP Probe Kit v5 最佳实践：让 Agent 持续、受控地交付真实项目

> **适用版本：** `feature/devcontrol-project-task-ledger` 分支的 **5.0.0 源码开发版**，尚未发布到 npm、MCP Registry，也不是 `latest`。公开稳定版仍为 `4.1.1`。
>
> **文档性质：** 从长期项目研发和 Neyna 试点归纳的可迁移工作方式；不是 Neyna 项目任务清单、Owner 授权记录、真机验收报告或替其他项目预设的冻结计划。实际功能以当前源码、[v5 安装与使用指南](v5-development-guide.md)及 [DevControl 参考](devcontrol.md)为准。

## 一、先理解 v5：工具负责约束，Agent 负责结果

v4 已提供 `start_feature`、`start_bugfix`、MCP Apps、Plan/Heartbeat/Resume/Converge、代码与测试工具、可选 Memory。**v5 保留这些能力**，新增的是更完整的**项目研发治理层**：项目本地 SQLite 任务账本、整版计划审批、任务冻结合同、开发租约、真实验收 Gate、Idea 和架构变更复审、History Session SQLite 默认存储，以及只读项目工作台。

最重要的分工是：

| 参与者 / 系统 | 负责什么 | 不负责什么 |
|---|---|---|
| **Owner / 审核者** | 明确目标和取舍，实质性审核需求、设计、计划与需要授权的范围变更；按精确提案哈希批准 | 不因口头“继续”而自动扩大被冻结的文件或验收范围 |
| **编码 Agent** | 理解原始需求、提出方案、进行独立工程审查、编写代码、运行真实测试、解释失败并提交证据 | 不能把 MCP 状态返回当作代码审查或真实测试的替代品 |
| **DevControl** | 保存项目批准状态、依赖、文件范围、租约、证据、审计与验收 Gate，并约束违规流程 | **不代替 Agent 写代码、操作业务数据库或独立评审业务正确性** |
| **History Session** | 记录用户原话、当前事实、决定、阻碍及可恢复的会话交接 | 不等于正式任务台账或跨项目向量记忆 |
| **业务项目** | 自己的业务逻辑、业务数据库、部署和产品权限 | 不应把业务数据塞进 DevControl SQLite |

**实践结论：** v5 的价值不在“自动生成更多任务”，而在于让每一项真实工作有来源、有明确边界、有可复核的验收结果，并且换一个 Agent 或聊天窗口后仍能继续。

## 二、新会话第一轮：恢复事实，不要从头规划

适用于正在开发的 Git 项目。首次进入**新对话**时，先调用 `history_session_bootstrap`，传入真实首条用户输入，保存返回的 `session_key` 和 `expected_path`。只在有需要时调用 `history_session_search` / `history_session_read` 追溯旧判断；每轮结束用 `history_session_checkpoint` 保存真实结果。`expected_path` 可能只是 SQLite 虚拟定位符，不要自行创建对应 Markdown。

随后按这个顺序核对：

1. **项目是否正确**：当前 Git 根目录、分支、HEAD、已有改动、项目实际使用的 MCP 版本。MCP 的源码仓库与使用 MCP 的**业务项目仓库**可能不同。
2. **项目资料是否正确**：`AGENTS.md`、受管理的 Skill、正式 PRD、架构/ADR、当前版本计划和真实配置，检查它们与已有代码是否一致。
3. **任务是否正确**：DevControl 的 `next`、`list`、`execution-contract`、租约状态、依赖和已批准 Gate；优先恢复同一项在途任务，不要重复领取另一项。
4. **证据是否正确**：区分 *已写代码*、*已测试*、*已 Git commit*、*已 report*、*已 verify*；只把真正通过 Gate 的任务计入 Verified。
5. **环境是否正确**：先验证实际可执行环境；不要把工具的精简 `PATH` 误判为缺少 SDK，也不要假定真机、网络或数据库已经可用。

在一个**已经存在**的项目上，`devcontrol onboard` 是只读式检查和引导，**不是**让 Agent 重建项目、覆盖已有计划或凭空补写任务的许可。

### 常用只读检查命令

以下命令在**目标业务 Git 仓库**执行。`probe` 只是项目配置好的启动器的代称；如果未安装，请将它换成 `node /ABSOLUTE/PATH/mcp-probe-kit/build/index.js`。占位路径、ID 和令牌都必须替换。

```bash
git status --short --branch
git log -1 --oneline
probe devcontrol onboard --project-root .
probe devcontrol next --project-root .
probe devcontrol list --project-root .
probe devcontrol workspace-status --project-root .
```

**不要**因为工具提示“已完成”就跳过阅读源文件、Git 和实际运行证据。项目工作台是**只读的事实视图**，不是能绕过受控 API 的审批按钮。

## 三、需求到冻结计划：先评质量，再评执行数量

新项目或新增正式版本计划，应先完成真实需求/设计复审，再进入 `plan-review → plan-propose → plan-approve`。其中 `plan-review` 检查结构与依赖；`plan-propose` 只保存待审核草稿；**只有明确的 Owner 决定与匹配的计划哈希才能批准并创建可执行任务**。`approvedBy` 是本机审计标签，不是强身份认证。

每个可执行叶子任务至少应回答：

| 任务合同字段 | 独立复审要问的问题 |
|---|---|
| 来源与目标 | 对应哪条真实 FR/NFR、ADR 或产品要求？谁触发，用户能观察到什么结果？ |
| 输入、输出与流程 | 输入/输出是什么？正常、失败、重试、取消和状态变化如何发生？ |
| 边界与依赖 | 依赖哪些已验证任务？哪些架构、数据所有权和安全规则不能改？ |
| 修改范围 | `allowedPaths` / `allowedChangedFiles` 是否覆盖**实际必需**的源码、测试及配置文件，且没有不必要的宽授权？ |
| 验收证据 | 有哪些正常与对抗用例？哪一个**真实 Gate**运行它们？谁能独立复核结果？ |
| 终止条件 | 依赖缺失、需要超范围修改、外部服务不可用或方案有歧义时，必须在哪里停止？ |

**来源和质量比字段数量重要。** 只填满 Spec 字段，不代表需求正确；所有任务都写相同的“1 正向 + 1 反向测试”也不等于深度复审。新项目的 `spec-depth-v3` 合同应明确 `inputs`、`outputs`、`preconditions`、`stateTransitions`、`forbiddenChanges`、`stopConditions` 与 `allowedChangedFiles`。规模较大的任务先拆成独立可验收的子任务，避免用一个巨大任务跨越整个版本。

### 一次合理的计划变更

收到“新增 AI 总结”这样的想法时，不要立刻改正在开发的 Flutter/Go 任务。先识别是否已经存在相关需求、是否需要新的产品/API/数据存储设计、是否影响现有冻结范围，再判断：

- **属于原任务已批准合同的细节**：在原有约束内完善，仍要真测试。
- **是合理但超出已批准范围的新增功能**：评估价值、依赖与风险，留在后续版本或走正式增量提案。
- **触及冻结架构或 API 契约**：先做独立设计复审和匹配哈希的 Owner 授权。
- **是不合理、重复或冲突的建议**：记录判断和原因，不为凑任务数强行纳入。

相关受控命令：`idea-capture → idea-assess → idea-review → idea-decide`。**Idea 的同意不自动等于已批准执行路径**，仍要匹配现有合同或完成相应计划修订。

## 四、单任务交付闭环：一件事只有一个可核验结论

按照实际源码中的 `dispatchDevControl`，完整的任务闭环是：

1. `next` 推荐合规任务；`execution-contract` 返回**准确的冻结执行合同**。Agent 再检查源码和需求，而不只看卡片标题。
2. `claim` 获得任务租约和 `leaseToken`；长任务及时 `renew`。不能冒用过期令牌、跨越冻结范围或跳过依赖。
3. Agent 在允许文件范围内实现并独立检查：业务行为、错误路径、兼容性、架构一致性、隐私、安全与回滚方式。DevControl **不替 Agent 审核**。
4. 运行**本任务要求的真正测试**。`check` 用于 Git 暂存范围校验；可选 Git Hook 只起本地防线作用，失败不得用 `--no-verify` 粉饰。
5. **仅暂存并提交获准文件**，保留用户原先的其他未提交修改。Commit 后以 `complete` 记录具体实施、真实验证和已知不足。
6. 以 `report` 记录对应的测试/审核证据及是否可进入复审，再用 `verify` 重跑 Gate。只有正式通过后才报告 **Verified**。

### 任务命令示范（占位值，不代表已获授权）

```bash
# 首先确认这是已经批准、当前可执行的任务。
probe devcontrol execution-contract --project-root . --json '{"id":"APPROVED-TASK-ID"}'
probe devcontrol claim --project-root . --json '{"id":"APPROVED-TASK-ID","agent":"developer-id","ttlSeconds":3600}'

# 执行真实开发；长时间运行前续租。
probe devcontrol renew --project-root . --json '{"id":"APPROVED-TASK-ID","leaseToken":"RETURNED-TOKEN","ttlSeconds":3600}'

# 只 stage 获批文件，运行真实 Gate 所要求的测试，正常 Git commit。
probe devcontrol check --project-root .

probe devcontrol complete --project-root . --json '{"id":"APPROVED-TASK-ID","leaseToken":"RETURNED-TOKEN","summary":"Observed behavior","implementation":"What changed and why, with commit SHA","verification":"Actual test commands, outcomes and evidence","remaining":"Known limitations"}'
probe devcontrol report --project-root . --json '{"id":"APPROVED-TASK-ID","leaseToken":"RETURNED-TOKEN","kind":"test","reference":"Actual test command/result and review evidence","readyForReview":true}'
probe devcontrol verify --project-root . --json '{"id":"APPROVED-TASK-ID","leaseToken":"RETURNED-TOKEN"}'
```

**反例：** “单测通过 10 项 → 任务完成 10 项”，但未逐项 `claim`、未记录每项的 commit 与证据、未运行各自要求的 Gate。正确报告应是“本轮修改/已测 N 项，正式 Verified M 项；其余分别说明阻碍”，并以 DevControl 当前状态为准。

## 五、真实 Gate 要对得上真实风险

常见项目会分别要求文档、单测、HTTP 集成、数据库约束、Flutter 和真机验证。它们不能互相顶替：

| 工作类型 | 适用的真实证据 | 不能用什么代替 |
|---|---|---|
| 文档/配置 | 实际文档检查、链接与脚本验证、Git diff；必要时构建 | 只看 README 是否存在 |
| Go 服务/API | 真实 Go 测试与要求的 HTTP 集成请求、错误路径、持久化行为 | 只跑静态编译或孤立 contract fixture 代替 `go_http_integration` |
| Flutter 客户端 | **真实 Flutter SDK** 的分析和测试；`flutter_test` 必须在冻结任务指定的客户端包中执行 | 假的 Flutter 可执行文件、空测试套件、仅编译其他目录 |
| PostgreSQL/数据安全 | 经授权的测试库上真实权限、RLS、迁移和回滚证据 | 模拟 SQL、生产库直接试错或声称执行了未运行的 Gate |
| iOS 权限/音频/设备 | `ios_device_e2e` 要求真机上实际系统授权、拒绝/恢复、录制状态及设备 E2E 证据 | 模拟器或单元测试冒充真机，UI 的开关文案冒充真实系统权限 |
| 发布与跨平台 | 对应平台 CI、实际发布制品和整版 E2E Gate | Git commit、文档验证或某一个子模块测试 |

**设备不可用怎么办？** 保留正确的 `Ready` / `In Progress` / `Not Run` 状态；可先推进没有该设备依赖的**其他已批准任务**，但不改掉原验收条件，不凭空伪造真机截图、测试结果或 release Gate。缺少真实 runner 的 Gate 应当 fail closed。

## 六、冻结任务缺文件：先暂停，别越权补救

Neyna 的一次典型教训是：任务只批准了某个目录，却需要改动范围外的配置或测试依赖。**技术上能修改文件，不等于开发合同允许**。

推荐处置：

1. 停止超范围修改。确认当前任务合同、真实 Git HEAD、暂存区和用户原有未提交文件；识别是原需求遗漏还是新的产品变更。
2. 如果任务还没有领取，先按 `release-work-scope-review` / `release-work-scope-stage` 提出最小变更，再经 `release-work-scope-independent-review` 和明确 Owner 授权的 `release-work-scope-approve`。
3. 若任务已领取且有合法未完成工作，依据当前状态使用 `pause-for-scope` / `pause-for-reviewed-incremental` 所适用的安全流程；保留原租约、已提交结果和既有修改证明，不得随意 `release`、reset、stash 或丢弃历史。
4. 获得**精确 proposal hash 与 review hash** 对应的批准后，重新检查 `execution-contract`，才恢复实现、测试、报告和 `verify`。
5. 如果 Gate 前提本身不可写、依赖未满足或提案无法获批，应显式标记阻塞，而不是扩大 `allowedPaths`、修改 Gate 或以自填“审核已通过”绕过约束。

### 安全处理用户已有修改

每次开始先 `git status`。用户在工作树中留下的未提交代码、Agent Skill、运行器配置和其他项目文件都具有独立所有权：**保留、辨认、局部暂存，不得以 `git add .` 将其混入自己的任务**。有冲突时按受控的 scope amendment 或任务暂停流程处理。即使 Owner 说“可以提交”，也要核实该批准是否覆盖具体文件、任务和 Git Hook 约束。

## 七、Bug、Feature、架构与决策的正确入口

| 场景 | 建议入口 | 保持的边界 |
|---|---|---|
| 单次 Feature 编排 | `start_feature`、`plan_heartbeat`、`resume_plan`、`converge` | Delegated Plan 步骤不等于 DevControl 冻结任务；项目 SQLite Feature 记录与正式任务批准分开 |
| 需求与子任务精化 | `feature-save`、`feature-validate`、`feature-task-review` / `feature-task-propose` / `feature-task-approve` | 评审 Feature 正文、依赖和变更影响；导出文件只在必要时用 `feature-export` |
| 实际 Bug 调查 | `start_bugfix` 或 `bug-get` / `bug-step-save` / `bug-task-link` | 先用证据定位根因、回归和影响范围，再争取获准的修复任务 |
| 架构/Schema/API 变化 | `artifact-stage`、`artifact-independent-review`、`artifact-approve`、`artifact-check` | 正式工件的 hash 变更需要真正独立审查及授权，不能“自动修文档”绕过 |
| 纯 SQLite 决策任务 | `decision-save` / `decision-get` | 仅适用于相应的**已批准**决策任务，仍须报告与验收；不要生成无意义的过程 Markdown |

**一条关键原则：** 不是所有新想法都立刻进入开发，也不是一律丢进未来 Backlog。必须结合来源、风险、冻结合同和依赖做**有理由的判断**。如果沉淀出具有跨项目价值的规则，应再评估是否通过受控流程同步到生成的 Skill / `AGENTS.md`；不能把某个业务项目的局部偏好硬编码为所有项目的强制规范。

## 八、批量推进：追求吞吐量，但不牺牲每个任务的 Gate

在依赖充足、工具环境可靠时，一轮处理多个小任务比一次只做半项更高效。Neyna 试点经常采用**10～12 项为目标，分成几个可复核的小组**的方法；这是经验性的工作节奏，**不是 v5 产品规定的数量或验收标准**。

- 每个任务仍独立读取合同、领取租约、测试、合法提交和正式 Verify。批量只减少重复检查与汇报成本，不合并批准范围。
- 优先把同一层/同一依赖链中可并行验证的工作安排在一起；存在强依赖时按顺序进行。
- 对高风险、跨语言、数据库、设备和安全任务增加独立复审和相应真实测试，不为了数量扩大 File Scope。
- 当本轮遇到未批准的变更、真机缺失、验收 runner 不可用或租约冲突，就报告**实际已 Verified 数**与仍阻塞数，停止冒进。
- 工具调用设置合理超时，并对长任务设置可恢复点。出现挂起时检查会话/进程状态，不要无限等待，也不要用超时后的不确定状态冒充通过。

一个有用的批次总结包含：起始/结束 Git SHA、各任务 ID 与状态、真正执行的测试及结果、成功的 Verify 数、被保留的既有修改、阻碍与下一可执行任务。

## 九、History / DevControl / Memory 的三条数据线

| 数据 | 存储与读取 | 最佳实践 |
|---|---|---|
| **研发任务与审批** | 业务 Git 项目的 SQLite `dc_*`；`devcontrol *` | 将要求、租约、完成记录、已通过 Gate 和审计留在账本里，而不是每日新建 `tasks-progress.md` |
| **当前项目会话历史** | Node.js 22+ Git 项目默认 SQLite `hs_*`；`history_session_*` | Bootstrap 一次、按需 Search/Read、每轮 Checkpoint；保存用户原话、发现、测试和下一步；旧 Markdown 可迁移或显式文件模式 |
| **跨项目可复用经验** | 可选 Qdrant Memory；`search_memory` / `memorize_asset` | 只沉淀经验证、适合复用的知识；不要用它代替项目审批或原始会话 |
| **业务数据库** | 应用自己选用的 PostgreSQL/其他存储 | 与 DevControl 的开发任务账本隔离；最小权限，仅在获准环境操作，避免泄露连接凭证 |

History Checkpoint 最少记录：**原始用户输入、实际目的、关键发现、已作决策、实际改动、真实测试、Git/运行状态、剩余风险、下一步**。不能只写“继续开发”，也不能将隐私信息、密码、数据库访问令牌或用户真实业务数据复制进去。

## 十、版本与环境：正确构建，正确验证，不误发布

本分支 v5 **仅作为源码开发候选**。需要 Node.js 22+ 才能运行 DevControl 和 Git 项目默认的 SQLite History；Node.js 20+ 仍可支持旧的非 DevControl 工具。默认模型工具面为 **29**（24 基础 + 5 History）、配置 Memory 后 **35**；兼容模式 `MCP_TOOLSET=full` 为 **39**。专用 DevControl MCP 入口需显式注册，不能把它当成 29 个默认工具之一。

```bash
git clone --branch feature/devcontrol-project-task-ledger https://github.com/mybolide/mcp-probe-kit.git
cd mcp-probe-kit
npm ci
npm run build
npm run docs:verify
```

本机有 Node 但 `node` / `npm` 提示找不到时，**先确认 PATH**。例如已安装 Homebrew Node 的 macOS 环境可以验证：

```bash
env PATH=/opt/homebrew/bin:/usr/bin:/bin node --version
env PATH=/opt/homebrew/bin:/usr/bin:/bin npm run docs:verify
```

这一示例是**针对安装在 `/opt/homebrew/bin` 的 macOS 环境**，不是 Windows/Linux 的通用路径。Windows 的 CLI、Host、Hook 与真机 E2E 不能因 macOS 测试成功就声称全部通过。运行 DevControl 只读工作台时，默认从本机 `127.0.0.1:38180` 附近选择可用端口；可信 LAN 模式是**无认证 HTTP**，不可转发到公网。

使用 v5 开发分支，不意味着可以运行 `npm publish`、打 Tag、创建 Release 或将版本说成 npm `latest`。**Git push 是源码同步，不是版本发布。**

## 十一、常见误区：应当立即纠正

| 错误做法 | 正确做法 |
|---|---|
| “DevControl 已审查通过，所以 Agent 不必复审” | DevControl 约束流程；Agent 仍要依据原始需求独立评审内容、运行测试，Owner 审批属于另一层决定 |
| “用户说继续了，所以可以改所有文件” | 核对具体冻结合同与授权哈希，超范围先走独立复审和变更审批 |
| “前面已有旧 History，直接复制计划接着做” | Bootstrap 当前会话，并读取**实时** Git、DevControl 与实际环境；历史是线索，不是当前状态 |
| “测试脚本存在/模拟器过了，即真机通过” | 必须实际跑指定平台 Gate；不可用就标记 Not Run 或阻塞 |
| “Git commit 完成了，任务就是 Verified” | 继续 complete/report/verify，使用该任务指定的真实 Gate |
| “写更多过程 Markdown 更安全” | 状态和证据归项目 SQLite，规范性需求/架构/API 文档仍进 Git；避免冗余报告文件 |
| “历史 Markdown 不见了，说明 History 丢了” | v5 Git/Node22+ 默认 `hs_*` SQLite，虚拟 `expected_path` 应通过 History API 读取 |
| “一轮做 12 个，任何时候都必须凑满” | 依赖、范围、安全和真实验收优先；阻塞时报告实际完成数 |
| “官网/README 改了就是 v5 发布” | 源码与文档构建验证、开发分支 push、npm/Registry 正式发布是不同的阶段 |

## 十二、一轮研发真正完成时应交付什么

每轮结束，按下面的结构向 Owner 汇报（根据实际结果填写，绝不预填“通过”）：

1. **目标与范围**：本轮哪些批准任务、哪个版本计划、是否有经批准的变更。
2. **实际产出**：修改了哪些受控文件，具体功能有什么可观察变化，Commit SHA 是什么。
3. **真实测试**：执行的命令、环境、通过/失败/未运行情况，真机与模拟器分开。
4. **DevControl 状态**：每项的 Ready / In Progress / In Review / Verified 真实结果；不要把任务数量当成验收数量。
5. **已有工作保护**：记录本轮保留的用户既有修改、未解决冲突及安全风险。
6. **History 交接**：使用 `history_session_checkpoint` 保存本轮原话、决定、证据、阻碍和下一项可执行任务；检查调用结果成功。

**可操作的完成标准**：下一位 Agent 不需要凭猜测恢复进度，Owner 可以追溯每项任务为什么做、谁批准、改了什么、哪些测试真正运行，以及为什么算完成或尚未完成。

---

### Related references / 相关资料

- [5.0.0 源码安装与完整命令指南](v5-development-guide.md)
- [DevControl 命令、任务合同、变更与 Gate 参考](devcontrol.md)
- [v4 / V1 历史交付系统基线](mcp-probe-kit-delivery-system-v1.md)（保留历史要求，不等于 v5 的当前验收）
- [README：v5 新特性与 v4 保留功能](../README.md)

**English summary:** v5 keeps the v4 Agent workflows while adding project-local DevControl governance. Inspect real Git/project state and History first; independently review requirements and plans; obtain explicit hash-bound Owner approval; claim only eligible frozen tasks; implement and test within approved paths; commit, report and run the real verify gate for each task. Preserve user edits and interrupted work, evaluate new ideas before scope changes, keep `dc_*` task state separate from `hs_*` session History and optional Qdrant Memory, and never confuse an unpublished source milestone with an npm release.
