# mcp-probe-kit v5 — 内置单项目研发工作台

> 开发分支预览设计；不是 npm v5 发布说明，也不是项目数据库的新事实源。

## 产品边界

**mcp-probe-kit 是唯一对外品牌和版本号来源**；DevControl 是包内的研发治理能力，不再使用独立的「DevControl 产品」名称、D 字母图标或独立版本号。左侧使用仓库 `docs/assets/logo.png` 的官方标志（构建时生成轻量的 `brand-mark.webp`），旁边显示从本地 MCP 包读取的 `mcp-probe-kit vX.Y.Z`，设置里的版本与之完全相同。工作台内部协议修订仅供安全识别和旧进程重启，不再向用户冒充第二个产品版本。

内置工作台是**当前一个 Git 项目**的只读研发管理视图，项目数据由 SQLite `dc_*`、History `hs_*` 与受控的 Git 正式文档提供。没有项目切换器、多租户运营界面、统计中心，也不需要为工作台启动额外的前端构建服务。

一级菜单严格对应已经实现的业务领域，固定八项：**工作台、需求管理、技术架构、任务管理、Bug 管理、历史会话、研发指南、设置**。其中：

- **需求管理**包含 Feature 三阶段规格和需求变更；Idea 作为候选需求在该业务流程里评估，不单设一个一级菜单。
- **技术架构**为统一项目架构中心，读取 Git 架构文档和 ADR；Feature 变更架构须经过工件治理与 Owner 审批。
- **任务管理**直接引用 SQLite 的冻结工作树、父子关系、待审核草稿、真实执行状态和测试证据；任务 Verified 不等于项目发布 Gate 通过。
- **Bug 管理**只管理 Bug，不混入普通需求/架构变更。
- **历史会话**只读取 SQLite History，不回退文件式实时状态。
- **研发指南**面向 Agent 和研发人员，调用只读 `/api/guide?intent=...`，按九种研发阶段显示操作顺序、复制示例和审批边界。
- **设置**是当前项目 **`mcpServers.mcp-probe-kit.env` 对应的参数编辑器**，不是独立的 Token 管理产品或通用 OS 环境变量编辑器。可设置 Qdrant URL、Collection、Qdrant API Key、Embedding Provider/URL/Model/API Key、MEMORY_SEARCH_LIMIT、MEMORY_SUMMARY_MAX_CHARS、MCP Apps 和 GitNexus 开关。仅本机同源 + CSRF 校验 POST 可以写入；从私有局域网连接的用户不能查看或改写配置。设置保存在 Git 排除的项目本地状态中，API Key 使用 AES-256-GCM 加密，密钥分离保存在本机用户目录，GET 仅显示是否已配置、绝不回显凭据。

  **重要的生效边界**：页面不会直接修改 Cursor、Claude 或其他 MCP 客户端的 `mcpServers` JSON 文件。项目覆盖设置在 MCP **重新连接**时由启动代码加载；客户端 `mcpServers.env` 已显式传入的同名变量总是优先，界面明确提示覆盖来源。这避免编辑一个设置却误以为已经覆盖客户端配置，或冒险修改未知客户端的全局文件。

## 构建与路由

源代码已按职责拆分：

| 文件 | 负责内容 |
| --- | --- |
| `src/devcontrol/workbench/page.html` | 页面布局和八菜单内容，不编写业务状态 |
| `src/devcontrol/workbench/styles.css` | 原有能力所需的基础布局与任务详情 |
| `src/devcontrol/workbench/light.css` | 现代简约浅色主题，系统字体、响应式布局 |
| `src/devcontrol/workbench/overview.css` | 官方品牌与任务优先首页、统一进度及可折叠基线 |
| `src/devcontrol/workbench/design-system.css` | 全站统一字体比例、内容宽度、间距、阅读组件及 1500/1024/390px 响应式规则 |
| `src/devcontrol/workbench/brand-mark.webp` | 从仓库官方 Logo 衍生的轻量标志，编译为 CSP 安全的内联图片 |
| `src/devcontrol/workbench/router.js` | 原生 Hash 路由、深链接及浏览器前进后退 |
| `src/devcontrol/workbench/app.js`、`state.js` | 最小启动外壳、当前项目状态和导航 |
| `src/devcontrol/workbench/guide.js`、`tasks.js` | Agent/开发者指南、任务投影/父子关系/审核与详情 |
| `src/devcontrol/workbench/attention.js` | 真实 SQLite 的任务关注区、优先级与导航，不修改正式任务状态 |
| `src/devcontrol/workbench/records.js`、`features.js` | Bug/历史会话读取与 Feature 需求、设计、任务详情 |
| `src/devcontrol/workbench/markdown.js`、`documents.js` | 安全文档渲染、需求与架构索引 |
| `src/devcontrol/workbench/runtime.js` | 数据同步、可见状态刷新、事件绑定 |
| `scripts/build-workbench.mjs` | 构建时检查 JS、压缩 CSS，生成 CSP nonce 安全的内联资源 |
| `scripts/workbench-browser-acceptance.mjs` | 真实 Chrome 对八主页面的布局、溢出、首页一键待验收、跨状态搜索及手机更多导航回归，并保存截图 |
| `src/devcontrol/project-html.ts` | 极薄的安全模板装配层 |

`npm run build:workbench` 单独编译页面，`npm run build` 的 prebuild 会自动执行。多份按职责维护的浏览器源码在**构建时按声明的顺序组合、执行 JS 语法校验并压缩 CSS**；没有额外浏览器依赖或生产模块请求。构建后的 `workbench/generated.ts` 为生成物，**不要直接修改**。

Hash 页面路由例子：`/#overview`、`/#requirements`、`/#architecture`、`/#tasks`、`/#issues`、`/#history`、`/#guide`、`/#settings`。无需浏览器刷新；浏览器前进/后退和直接打开 Hash 均可定位对应菜单。

**任务更新是数据更新，不是页面刷新：** 当前任务页可见时按用户设置的 5/10/30/60 秒间隔请求真实任务、Feature 规划与版本冻结数据；所有接口返回后才重新倒计时。内容没有变化则不重绘，内容变化仅更新任务列表和进度，保留 Hash、任务筛选、任务状态 Tab、滚动位置及正在查看的详情。页面恢复焦点和全局同步继续采用项目 API 最新状态。

本地工作台不依赖 React、Vue、外部图标/字体/CDN。SQLite、审批和任务逻辑均由既有 DevControl 后端保证；Web UI **不会绕开 Agent 执行、开发者自审（可选独立 Reviewer）或 Owner 精确哈希授权**。

## 任务详情双视角

主工作台每张任务卡都可以打开只读详情，默认进入**任务概览**，按用户可理解的顺序展示真实业务背景、验收目标、当前进展、阻塞及下一步。没有来源的解释会明确标为未记录，不能根据标题编造进度或已通过 Gate。规划中任务标记为未批准，历史任务没有冻结来源也不能冒充最新合同。

切换到**执行合同**，将 SQLite 原有冻结字段分为需求与设计、执行范围、步骤、验收测试、执行约束等可折叠分组。**执行记录**另行展示完成报告、Git HEAD、测试证据及审计事件，不把实际结果混进原合同。

详情底部的共用**任务关联**提供已记录的父任务、前置依赖、子任务与下游任务，已有清单中的关联节点可直接打开。关系区不生成不存在的关联。

只读 \`GET /api/tasks/:id\` 同时返回 \`contract\`（原始审批快照及来源）与 \`executionContract\`（和正式 MCP \`execution-contract\` 动作相同的 \`ledger.executionContract(id)\`）。用户可以在执行合同内展开两份原始 JSON，检查 UI 与实际 AI 合同一致。仍只有一个 SQLite 正式数据源，不暴露 Lease Token，也不允许通过 UI 审批或通过任何 Gate。

实际浏览器验收可使用 \`node scripts/task-detail-browser-acceptance.mjs --url=http://127.0.0.1:38182/\`，直接读取 Neyna 正式项目任务，验证桌面和手机 Tab，逐字段比对原始 MCP 执行合同 JSON 并保存本机截图。界面改造不修改任务生命周期、任务规格或 Skill/AGENTS.md 自动生成规则。

### 人类任务说明与信息完整性审计

任务概览会优先使用已批准合同中的明确业务目的；如果没有该字段，则尝试从任务明确关联的需求 ID 读取项目原始 PRD 中的需求名称，**标记为关联需求参考**，不能冒充已批准的任务目的。验收目标只拆分明确的句子，不自行增加业务动作。关联需求的标题来自已有 Git PRD 的只读索引，不是新 Markdown 任务管理来源；SQLite 仍负责正式任务状态、合同、审批与 Gate。

只读 GET \`/api/tasks/:id\` 新增 \`readability\`，包括来源、现有验收要点、关联需求说明，以及面向当前任务类型的规格缺项。任务管理在工作项列表之后，通过「查看版本进度与质量检查」入口提供可展开的**任务说明完整性检查**，按需 GET \`/api/task-readability\` 对 SQLite 正式任务进行一次非破坏性盘点，按业务说明待补充、合同字段需评估、原始冻结来源缺失、现有说明较完整四类展示数量和代表性任务。该检查不产生或修改审批、任务冻结快照、Verified 或测试证据；不自动补写原始合同。

如果只缺少业务表达，应从现有批准需求和合同整理可核对说明；如果确实缺少实施、正反测试或证据要求，则通过正常的规划变更与 Owner 审批补充，不能直接覆盖历史冻结版本，也不能追溯撤销已通过的真实验收。

### 尚未开始任务的规格补充评审批次

任务说明完整性检查区域可继续展开**下一批 12 项规格补充评审**。只读 GET \`/api/task-spec-review\` 从真实 SQLite 台账中筛选尚未开始（ready/draft）、拥有可追溯原始冻结版本、且实际有缺项的任务，按真实待审批范围/新增工作、前置依赖实际 Verified 情况、未完成依赖数量、申报优先级与任务 ID 稳定排序。即使依赖全部 Verified，只要范围变更或增量工作还在正式审查中，也必须后置并标明 Owner 审批阻塞。已开始、待验证、已完成或冻结来源缺失的任务不会被误加入可改写的未开始工作列表。

每项只提供已有冻结验收条件、允许修改文件、Gate、关联批准需求、计划 ID/修订/审批哈希、真实前置任务状态，并将未知的场景、执行步骤、正反测试和设计来源列成需要人工评估的问题。**这些问题并不是自动生成的正式新要求或审批建议**，不能直接覆盖已有冻结节点。依赖未验证或未在台账中找到时，页面明确标记，先核对/完成真实依赖，不提前领取任务。

该界面仅用于整理待审核材料，没有写入端点、没有批量修改任务规格、没有改变 Verified 或 Gate。若要让补充条件正式生效，需要独立提交并遵循 DevControl 已有的范围评审、审批版本和 Owner 授权流程；已提交/验证的历史合同不会追溯重写。

已经正式登记的补充提案在 12 项评审批次中显示独立状态，包括待审核、审核被拒、复审通过待 Owner 授权以及已批准，关联当前准确的 proposalHash。显示状态仅从正式 SQLite 提案表读取，不能把用户允许继续研发视为对某个精确 Hash 的审批。

待审核项还可以在原冻结验收条件下面展开**本次补充草案**，逐字段阅读业务目的、场景、实际步骤、正反测试和来源。展示内容直接读取正式 SQLite 里的 \`task-spec-supplement-stage\` 草案，所有文字均明确标为未批准，并且只读取既定六种允许补充的字段，不把未审草案合并进入 AI 正式 \`execution-contract\`。

真实审核者可通过任务管理中的**下载本批审核核对材料**获取只读 GET \`/api/task-spec-review-packet?format=markdown\`。亦可指定 \`format=json\` 获取同源数据。导出含每项原批准计划与验收、范围、Gate、真实前置状态、待审六字段、独立提案 Hash，并有不预填结论的审核者核对清单。整个导出不触发 stage、review 或 approve，也不能代替开发者实质自审，独立复审按风险选用。 Markdown 只是一份阅读及交接导出，SQLite 仍是唯一任务与审批事实源。

### 开发者实质自审的任务附加规格（独立复审可选）

正式任务原先确实缺少业务目的、场景、实施步骤、正向或异常测试及来源时，Agent 可提出严格限定在**原来空字段**的补充。该操作不会改变冻结验收、文件范围、依赖或 Gate，也不得用于已有租约、待完成验证、已 Verified 或范围变更待审批的任务。

按顺序使用 \`task-spec-supplement-get\` / \`task-spec-supplement-review\` 查看精确原批准 Hash 及版本并检查草案，随后 \`task-spec-supplement-stage\`，由开发者本人通过 `task-spec-supplement-self-review` 实质自审；必要时才由不同 Reviewer 使用 \`task-spec-supplement-independent-review\` 记录有来源的额外复审，并非强制前置。 最后只有在 Owner 明确授权**提案及复审两个精确 Hash** 后才能调用 \`task-spec-supplement-approve\`。未批准的草案不改变 AI 执行要求。过期或被拒草案可由 \`task-spec-supplement-withdraw\` 撤回。

SQLite \`dc_task_spec_supplement_proposals\` 只保存当前待审批记录，\`dc_task_spec_supplements\` 追加保存每次批准历史。原冻结任务快照保持原样，批准附加规格在 AI \`execution-contract.approvedSupplement\` 和人类执行合同的单独区域可见，且带提案、复审 Hash 和批准修订。正文说明会明确区分原始冻结内容和后来批准的补充，不能把补充冒充原合同。涉及验收、范围或 Gate 实质变化必须走原有正式 Release Amendment。

### 重大冻结变更不默认引入第三名审核人

正式范围变更、新增依赖任务和受控架构工件依次经过提案、开发者实质自审、Owner 精确 Hash 授权。分别使用 `release-work-scope-self-review`、`release-work-incremental-self-review`、`artifact-self-review`，审核内容必须覆盖原始来源、实际文件范围、前置依赖、权限安全和正反测试。普通想法评估也用 `idea-self-review`，不必额外找独立审核员。原来的独立审核动作保留为可选加强审核，但不再是所有任务的强制条件。没有 Owner 批准时绝不改变已冻结的正式合同；测试 Gate 未通过时绝不记为 Verified。

## 安全与验收

除单独的 `POST /api/settings`（仅本机同源、CSRF Token、白名单 env 字段及严格格式校验）外，所有 DevControl 治理 / 需求 / 任务 / 验证 API 仍然只读。原 Host/LAN、CSP nonce、No-store 和 Source of Truth 门禁均保留。敏感凭据从不写入 DevControl SQLite、History、Git 或浏览器回显。`/api/guide` 只返回支持动作的规范说明，没有数据库写入副作用；服务工作台协议版本提升后不允许复用旧前端进程。禁用对任务结论的猜测；缺真实 Gate 不会展示为 Verified。

测试覆盖：八菜单及 Hash 路由、CSP、页面 gzip 尺寸、保留现有任务统计/详情回归、真实 HTTP 指引接口、仅本地访问默认行为与非 GET 拒绝。实际 Windows 浏览器和浏览器视觉回归仍须在具备环境后追加验收。

## v5 全站视觉回归（开发版）

### 面向真实用户操作的第二轮体验调整

首页的第一屏现在是**工作重点**，不再先展示产品宣言和介绍。四个快捷入口分别呈现当前版本中真实的待验收、前置依赖受阻、候选规划待确认以及已 Ready 且无已知依赖阻断的任务数。点击入口直接进入任务管理的相应聚焦视图；推荐工作项可直接打开同一份只读 SQLite 任务详情。尚未正式通过的规划不得称为可领取，`in_review` 或延期验收不得称为 Verified。Idea 决策提醒只根据已有 SQLite 中没有最终决定的真实记录显示；信息无法读取时不伪造零条。

任务管理默认展示**需要关注**，并保留原有未开始、开发中/待验证、已验证三个正式状态视图。关注分类按真实来源显示待验收、开发中、依赖受阻、规划待确认、可继续，自动优先展示最需要查看的任务，初始仅呈现前 12 项以避免长列表；后续可逐批展开，不改变冻结任务和审批。搜索任务编号、目标及验收条件时，**跨所有状态查找**，避免当前状态筛选导致误以为任务消失。按 `/` 可在其他页面一键聚焦任务搜索。任务详情打开时将键盘焦点带到关闭按钮，Esc 关闭后恢复原先的任务位置，Tab 不会跳到遮罩后方。自动刷新仍只从真实 API 重新读取，不修改任务状态或抹掉用户当前筛选。

手机端保留工作台、任务管理、需求管理、Bug 管理四个高频入口，其余四个通过有明确展开状态的**更多功能**进入。项目文档与 GitHub 仍在导航底部。任务页将工作项和搜索放在版本统计、规格完整性检查之前；后者仍可通过一键入口展开，不删除审核能力。手机使用原生选择框切换关注类型，低频阶段/类型筛选按需展开。桌面保持完整导航、四列关注统计及分组任务，所有控件都保留实际触发和键盘路径。

新的用户路径回归必须至少覆盖四项实际任务：从首页一键定位待验收任务并读取证据；从任务页跨状态检索已 Verified 的历史任务；在手机中展开低频菜单及筛选并返回原位置；在手机首屏看到第一条聚焦工作项。还需验证操作中真实任务数据不被编辑、没有虚假的审批或 Gate、无浏览器异常，且局域网服务是通过 `devcontrol workspace-link` 的托管持久进程启动，不能只测回环地址或临时终端进程。Playwright 属于开发期视觉验收工具，不会成为工作台运行时依赖，也不能代替真实使用者的盲测评分。

### 2026-11-03 页面体验优化与 Playwright 真机浏览器回归

本轮先使用 Chrome 实际截图对照原工作台，再修复问题并逐项复测。侧栏「本地工作台」下新增**项目文档**与官方 [GitHub 仓库](https://github.com/mybolide/mcp-probe-kit) 链接，使用 `target="_blank"` 和 `rel="noopener noreferrer"`，不依赖远程脚本或字体。手机和平板都保留这两个入口。平板 621–850px 把八个菜单完整排为两行，不再让前面的页面隐藏在横向滚动之外；390px 及 360px 手机仍有八个可直接点击的入口。

首页侧边的纯装饰区域改为真实的 SQLite 正式工作项 **Verified 数、总数和进度条**，手机改为紧凑的卡片底部信息。界面再次强调 Verified 不代表产品发布 Gate 已通过。任务页增加与其他页面一致的标题、筛选结果数量、清除全部筛选以及无结果时的可操作说明；切页恢复页面顶部，但任务列表自动刷新仍保留筛选与滚动位置。设置等不执行自动刷新的页面不再占用顶部空间显示无意义的倒计时。

Playwright 实际检查还查到两个原先未被静态测试捕获的问题：360px 需求统计卡存在 350px 最小宽度，使页面扩大到 387px；当前固定宽度已改为可收缩双列。原 HTML 和部分文档组件使用 `style=""` 或动态 `element.style`，在正式工作台的严格 CSP 下会被 Chrome 拦截；本轮已改为由 nonce 样式表提供 CSS 类，不放宽 CSP。

使用本机 Chrome、Playwright 和只读的本地项目 API，覆盖九个页面（含项目文档中心）、2560/1920/1500/1024/768/390/360px 七档宽度，实际操作导航、任务搜索与清除、三个任务状态、详情弹层和设置页。**98 项 Playwright 浏览器检查全部通过**，另有导航、HTTP 指引、刷新、文档和国际化等 **15 项 Vitest 回归通过**。检查包含横向溢出、所有菜单可见、首页数据非占位符、GitHub URL 和安全属性、详情内容与可视宽度，以及 Chrome 控制台 CSP/JS 错误。每次视觉改动仍需人工审阅实际截图，不能只相信代码或静态 DOM。该测试使用已安装的本机 Chrome，不启动外部网站、不发布 npm，也不写入 DevControl 任务状态。

以已编译的工作台实例为对象，而不是只检查 CSS。全站统一的 15px 正文基准、清晰的标题层级、任务卡片、响应式表单与文档阅读器，共同支持八个一级菜单。冻结任务、验收依据、父子关系及 Gate 仍来自 DevControl SQLite。

先执行 `npm run build`，用真实 Git 项目启动 `node build/index.js devcontrol board --project-root /path/to/git-project --port 38182`，再运行 `npm run smoke:workbench:browser -- --url=http://127.0.0.1:38182/`。

需要本机 Chrome。覆盖八个菜单与 1500/1920/2560/1024/768/390px 视口，共 48 次检查；验证页面活动状态、字号、主内容占满可用宽度、横向溢出、八项导航、可见产品规划和架构变更区；1920px 及以上必须显示多列任务，检查任务数据确实渲染。默认截图输出到本机临时目录，可通过 `--out=/path/to/ignored/screenshots` 指定。测试不会更改任务数据。

自动检查不能代替人工验收，需实际查看各页数据加载后的布局，尤其注意长路径、任务详情与手机窄屏。

## 八个菜单与规划的逐项对应

工作台不再把已读取的产品目标留在没有导航入口的独立页面，直接显示权威产品愿景、版本路线图、阶段 OKR、实际下一任务和已验证进度。版本工作项完成与发布 Gate 仍明确区别。

需求管理同时呈现 Git PRD 的 FR/NFR、从数据库读取的 Feature 三阶段规格、正式工作项关联与 Git 已发布 Spec。Idea 属于需求变更评估，不是已冻结任务；当前项目 API 没有提供候选 Idea 列表，因此只解释审批边界，不伪造数据。

技术架构包括 Git 总体架构 / ADR 文档和 SQLite 中的实际架构变更条目。Bug 管理只显示 kind=bug，不再把架构变更混入 Bug 记录。任务管理保留真实筛选、待审、待验证、已完成以及精确任务详情。历史会话展示实际搜索结果数量，依旧从 hs_* 读取。研发指南包含受 DevControl 约束的真实阶段和只读调用示例。设置仍是项目的 MCP env 可视化配置，不是 Token 管理或任意操作系统环境编辑器。

大屏不再通过 main.max-width 将内容锁在中间。1500px 以内优先信息阅读，宽屏采用多列任务、架构文档、Bug、History 和产品规划模块；小屏采用响应式压缩，390px 导航完整可见，不横向滚动整个页面。真实项目数据不因布局变化而被复制、审批或改写。

样式通过工程内维护的 fluid-layout.css 与现有设计层在构建时合并，保持 CSP nonce 内联与零前端运行时依赖。本次曾评估 Tailwind v4 的构建时方案，开发环境依赖获取无法可靠完成，暂不引入未锁定的 CLI 或 CDN；相同断点需求由原生 CSS Grid 与媒体查询实现。未来如果引入 Tailwind，必须先保证离线可重复构建、锁定工具链和包大小回归通过。
