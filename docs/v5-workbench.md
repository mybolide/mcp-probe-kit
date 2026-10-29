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
| `src/devcontrol/workbench/records.js`、`features.js` | Bug/历史会话读取与 Feature 需求、设计、任务详情 |
| `src/devcontrol/workbench/markdown.js`、`documents.js` | 安全文档渲染、需求与架构索引 |
| `src/devcontrol/workbench/runtime.js` | 数据同步、可见状态刷新、事件绑定 |
| `scripts/build-workbench.mjs` | 构建时检查 JS、压缩 CSS，生成 CSP nonce 安全的内联资源 |
| `scripts/workbench-browser-acceptance.mjs` | 真实 Chrome 对八页面、桌面/平板/手机视口做字体、布局与横向溢出回归，并保存逐页截图 |
| `src/devcontrol/project-html.ts` | 极薄的安全模板装配层 |

`npm run build:workbench` 单独编译页面，`npm run build` 的 prebuild 会自动执行。多份按职责维护的浏览器源码在**构建时按声明的顺序组合、执行 JS 语法校验并压缩 CSS**；没有额外浏览器依赖或生产模块请求。构建后的 `workbench/generated.ts` 为生成物，**不要直接修改**。

Hash 页面路由例子：`/#overview`、`/#requirements`、`/#architecture`、`/#tasks`、`/#issues`、`/#history`、`/#guide`、`/#settings`。无需浏览器刷新；浏览器前进/后退和直接打开 Hash 均可定位对应菜单。

**任务更新是数据更新，不是页面刷新：** 当前任务页可见时每 12 秒请求真实任务、Feature 规划与版本冻结数据；内容没有变化则不重绘，内容变化仅更新任务列表和进度，保留 Hash、任务筛选、任务状态 Tab、滚动位置及正在查看的详情。页面恢复焦点和全局同步继续采用项目 API 最新状态。

本地工作台不依赖 React、Vue、外部图标/字体/CDN。SQLite、审批和任务逻辑均由既有 DevControl 后端保证；Web UI **不会绕开 Agent 执行、独立 Reviewer 或 Owner 精确哈希授权**。

## 安全与验收

除单独的 `POST /api/settings`（仅本机同源、CSRF Token、白名单 env 字段及严格格式校验）外，所有 DevControl 治理 / 需求 / 任务 / 验证 API 仍然只读。原 Host/LAN、CSP nonce、No-store 和 Source of Truth 门禁均保留。敏感凭据从不写入 DevControl SQLite、History、Git 或浏览器回显。`/api/guide` 只返回支持动作的规范说明，没有数据库写入副作用；服务工作台协议版本提升后不允许复用旧前端进程。禁用对任务结论的猜测；缺真实 Gate 不会展示为 Verified。

测试覆盖：八菜单及 Hash 路由、CSP、页面 gzip 尺寸、保留现有任务统计/详情回归、真实 HTTP 指引接口、仅本地访问默认行为与非 GET 拒绝。实际 Windows 浏览器和浏览器视觉回归仍须在具备环境后追加验收。

## v5 全站视觉回归（开发版）

以已编译的工作台实例为对象，而不是只检查 CSS。全站统一的 15px 正文基准、清晰的标题层级、任务卡片、响应式表单与文档阅读器，共同支持八个一级菜单。冻结任务、验收依据、父子关系及 Gate 仍来自 DevControl SQLite。

先执行 `npm run build`，用真实 Git 项目启动 `node build/index.js devcontrol board --project-root /path/to/git-project --port 38182`，再运行 `npm run smoke:workbench:browser -- --url=http://127.0.0.1:38182/`。

需要本机 Chrome。覆盖八个菜单与 1500/1024/390px 视口，共 24 次检查；验证页面活动状态、字号和横向溢出，检查任务数据确实渲染。默认截图输出到本机临时目录，可通过 `--out=/path/to/ignored/screenshots` 指定。测试不会更改任务数据。

自动检查不能代替人工验收，需实际查看各页数据加载后的布局，尤其注意长路径、任务详情与手机窄屏。
