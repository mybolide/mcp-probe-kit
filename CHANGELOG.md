# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [3.6.11] - 2026-07-10

### 🐛 修复

- **`code_review` / `gentest` / `refactor` 指南型输入注入**：将 `code` / `file_path` 读入并注入 `*Input` 结构化字段；移除易误导的「已完成分析」脚手架，明确由 Agent 产出 issues / 测试 / 重构计划
- **MCP progress 通知**：默认关闭工具进度通知（`MCP_PROGRESS_NOTIFICATIONS=1` 可开启），避免 Cursor 等客户端因 sync 路径上的 progress token 报 `unknown token` 并断开连接

### 🔧 改进

- **SRC-8 方法论（TBP-inspired）**：新增 `src/lib/src8-guidance.ts` 与 `docs/src8-methodology.md` / `docs/src8-methodology.zh-CN.md`；归因六层、验收契约、真因工作表 4a~4e、`tbp8` 兼容别名
- **`fix_bug` / `start_bugfix` delegated plan**：与 `start_feature` 同模式，返回 `metadata.plan.steps`（src8-1~8）；Agent 侧 prompt 内嵌计划与门禁，**不引用** npm 包内不可见的 `docs/*.md`
- **`start_bugfix`**：`mergeBugfixOrchestrationPlan` 合并 context → SRC-8 八步 → 可选 `check_spec` / `memorize`；loop 模式同样走 src8 plan
- **文档与 i18n**：README / `docs/i18n` / `all-tools` 统一 SRC-8 表述

### 🧪 测试

- 新增 `src8-guidance`、`code_review`、`gentest`、`refactor` 单元测试与 `scripts/smoke-src8-tools.mjs` 冒烟脚本

### 📚 文档

- 提交 `docs/src8-methodology.md` / `zh-CN.md`（此前被 `.gitignore` 忽略）；补充 delegated plan（src8-1~8）与「MCP prompt 不引用 docs」说明
- README / all-tools 更新 delegated plan 表述

---

## [3.6.10] - 2026-07-10

### 🐛 修复

- **`code_insight` 默认不再自动升级为 MCP Task**：多数 Agent 客户端不会轮询 task 结果，导致图谱工具调用“报错/无内容”；需异步 Task 时显式设置 `MCP_ENABLE_AUTO_TASK=1`（仍可用 `MCP_DISABLE_AUTO_TASK=1` 强制关闭）
- **GitNexus 索引刷新失败降级**：`gitnexus analyze` 失败时不再让整个 `code_insight` 硬错误，改为 `index_refresh_failed` 警告后继续尝试 bridge 查询

---

## [3.6.9] - 2026-06-25

### 🔧 改进

- **`init_project` delegated 输出**：`summary` 改为「写作计划」表述；`nextSteps` 首项明确 MCP 仅写 Skill + AGENTS.md、Agent 须手动落盘 pendingFiles
- **`init_project_context` delegated 输出**：`summary` 改为「写作计划」表述；`documentation[]` 增加 `exists` / `written` / `agent_action_required`；`nextSteps` 明确 Agent 须按 plan 手动落盘
- **`add_feature` delegated 输出**：`summary` 改为「已生成功能规格写作计划」表述，与 `pendingFiles` / `_meta.note` 一致表明 MCP 不代写 specs
- **`file-delivery`**：新增共用 `buildFileStatusEntries`，供文档路径状态计算

---

## [3.6.8] - 2026-06-25

### 🔧 改进

- **Harness layout 补丁**：`patchLayoutManifestHarness` 仅更新 `harness` 字段，保留 `generatedAt` / `generatedBy`；内容无变化时不写盘
- **Harness adapters 记录**：`layout.harness.adapters` 反映磁盘上已存在的适配文件，而非仅当次写入
- **自定义 indexPath**：灵码/Comate/CLAUDE 薄适配使用 `layout.indexPath`，不再硬编码 `AGENTS.md`
- **文档与版本号**：站点 i18n、README、manifest 统一为 **v3.6.8**

---

## [3.6.7] - 2026-06-25

### 🔧 改进

- **Harness 单源策略**：`AGENTS.md` 与 canonical Skill（`.agents/skills/mcp-probe-kit/SKILL.md`）内容不再随 harness 分叉；`@` 引用固定 canonical 路径
- **薄适配层（零配置）**：项目内已有 `.trae/`、`.lingma/`、`.comate/`、`.codebuddy/`、`.claude/` 等目录时，自动写对应 Skill 镜像或规则指针；无需环境变量
- **layout.json**：记录 `harness.detected`、`skillCanonical`、已写适配层路径

---

## [3.6.6] - 2026-06-25

### 🔧 改进

- **Skill 标准 frontmatter**：`.agents/skills/mcp-probe-kit/SKILL.md` 生成 `name` / `description` / `mcp-probe-kit-version`，支持 Agent Skill 自动发现；仍兼容旧版 HTML 版本注释并自动升级
- **AGENTS.md 强引用**：默认同时生成 `@.agents/skills/mcp-probe-kit/SKILL.md` 与 Markdown 链接（`MCP_AGENTS_SKILL_REF=link|at|both`）
- **AGENTS 死链措辞**：`project-context` / `graph-insights` 在未落盘时标明「待 Agent / code_insight 落盘后阅读」

---

## [3.6.5] - 2026-06-25

### 🔧 改进

- **文件落盘边界**：MCP 服务端仅写 Harness 基础设施（Skill、`AGENTS.md`、`docs/.mcp-probe/layout.json`）；project-context 分类文档、specs、图谱 `docs/graph-insights/*` 由 Agent 按模板或 `code_insight` delegated plan 落盘
- **`init_project_context`**：服务端写入完整 merge 后的 `AGENTS.md` + layout manifest；`writtenFiles` / `pendingFiles` 明确区分已写与待写路径
- **`code_insight`**：恢复 `save_to_docs` 仅返回 delegated plan，不代写图谱文件
- **`add_feature` / `init_project`**：仅返回模板与 `pendingFiles`，不代写 specs/docs

### ✅ 保持不变

- 每次 MCP 工具调用仍自动 bootstrap **Skill**（`.agents/skills/mcp-probe-kit/SKILL.md`）与 **AGENTS.md** Skill 引用，供 Harness 调用说明

---

## [3.6.3] - 2026-06-25

### 🔧 改进

- **重新发布完整构建**：补全 3.6.2  npm 包中缺失的 `isFilesystemRoot` 工作区修复（避免 Windows 盘符根目录误写 Skill）；确保 `tools/list` 瘦身、`project-mcp-resources`、工作区自动识别等改动均打入包内

---

## [3.6.2] - 2026-06-25

### 🔧 改进

- **修复 Cursor/MCP 客户端 tools 无法加载**：`resources/list` 不再同步执行 Skill 写盘（避免连接握手超时）；bootstrap 仅在 `resources/read probe://project/bootstrap` 与工具调用时执行
- **项目 MCP Resource 自检**：`resources/list` 仅 `probe://status` + `probe://project/bootstrap`；读取时自动补齐 Skill/AGENTS.md
- **Cursor「connected 但 0 tools」**：`tools/list` 默认不再附带 `outputSchema`（约 50KB→23KB），避免 Cursor lease 层静默丢弃整表；`tools/call` 仍返回 `structuredContent`。需完整 schema 时设 `MCP_INCLUDE_OUTPUT_SCHEMA=1`
- **工作区自动识别**：无需在每台 MCP 客户端配置 `MCP_PROJECT_ROOT`；优先 Cursor `WORKSPACE_FOLDER_PATHS`、进程 cwd、`INIT_CWD` 及项目 marker；忽略盘符根目录（如 `C:\`）误匹配
- 文档：FAQ 补充 `.cursor/projects/.../mcps/` 诊断说明

---

## [3.6.1] - 2026-06-25

### 🔧 改进

- **精简 MCP Resources 列表**：`resources/list` 仅返回 `probe://status` 与 `probe://graph/latest`（不再逐条列出 history / markdown / files / 动态快照），减轻 Cursor 设置页条目过多；`probe://graph/latest` 响应内嵌 `history` 与 `fileIndex`，其余 URI 仍可通过 `resources/read` 按需读取。
- **工作区根目录解析**：支持 `WORKSPACE_FOLDER_PATHS`；工具响应附带 `mcp_probe_bootstrap`；`init_project` 支持 `project_root`；误写到 kit 安装目录时给出警告。
- 文档与站点版本号统一为 **v3.6.1**，工具总数 **30**。

---

## [3.6.0] - 2026-06-25

### ✨ 新功能

- 新增 `workflow` 工具：根据用户意图返回「何时调哪个 MCP」分阶段指南（`firstTool` + `phases`）。
- **MCP 调用时机 Skill（必选增强）**：任意 MCP 工具调用前自动同步用户项目 `.agents/skills/mcp-probe-kit/SKILL.md` 与 `AGENTS.md` 引用；按 **kit 版本**升级覆盖。
- `src/lib/mcp-tool-skill-registry.ts` 为 Skill 唯一真相源；`prebuild` 运行 `verify-workflow-skill` + `sync-workflow-skill` 与 `allToolSchemas` 对齐。
- 工具总数 29 → **30**（新增 `workflow`）。

### 🔧 改进

- Skill 安装路径改为 `.agents/skills/mcp-probe-kit/`，避免与用户自建 `workflow` Skill 冲突。
- `AGENTS.md` 无则创建、有则合并 mcp-probe 块并写入 Skill 链接；块内增加 `mcp-probe:context-version` 版本标记。
- GitHub Release：推送 `v*` tag 时由 `.github/workflows/release.yml` 从 CHANGELOG 自动生成 Release Notes（与 npm 发布解耦）。

---

## [3.5.0] - 2026-06-25

### ✨ 新功能

- 新增 `update_memory_asset`、`delete_memory_asset`：按 `asset_id` 更新或删除共享记忆库资产；更新保留原 ID 并支持 `content` 重新向量化。
- 工具总数 27 → 29；记忆工具 4 → 6。

### 🔧 改进

- **Handle 优先结构化输出**：`search_memory`、`start_feature` / `start_bugfix` / `start_ui`、`code_insight` 及图谱快照装饰层统一输出 `structuredContent.handles`（`memory_assets`、`graph_snapshot`、`graph_resource`），Agent 可直接按 ID/URI 跟进，无需从长文本抠取。
- **`delete_memory_asset` 软确认**：默认仅返回 `requires_confirmation` + `preview`；`confirm: true` 后才真正删除（配合 `destructiveHint`）。
- **长耗时工具默认 Task**：`code_insight`、`scan_and_extract_patterns` 在无显式 `task` 参数时自动升级为 MCP Task（可用 `MCP_DISABLE_AUTO_TASK=1` 关闭）。
- **`tools/list` 挂载 `outputSchema`**：与 `tools-manifest.json` 对齐，覆盖记忆/编排/分析等 data-driven 工具。
- **`verify-memory-tools.mjs`**：补充 handles mock 断言；`VERIFY_MEMORY_CRUD=1` 时可跑 create → preview-delete → update → delete 冒烟。
- **MCP Apps 专用视图**：`MCP_ENABLE_UI_APPS=1` 时 `search_memory` / `code_insight` 生成结构化 HTML 预览（命中卡片、图谱执行表、handles 链接）；逻辑抽到 `src/lib/mcp-apps.ts`。
- **`start_bugfix` 规格闸门**：可选 `feature_name` / `docs_dir`；能识别关联 `docs/specs/<feature>/` 时，修复闭环计划自动插入 `check_spec`（修复与测试通过后执行）。
- 文档与站点文案统一为 29 个工具；记忆部署指南补充工具与环境变量对照表。

---

## [3.3.0] - 2026-06-09

### ✨ 新功能

- 新增 `src/lib/quality-constraints.ts` 质量约束「单一真相源」：集中定义代码量硬约束（`CODE_LIMITS`：单文件 ≤500 行、函数 ≤50 行、嵌套 ≤4 层、参数 ≤3 个）、代码完整性黑名单（`BANNED_CODE_PATTERNS`：占位/省略式代码零容忍）、UI 设计硬红线（`UI_HARD_RULES`：4pt 间距阶梯、对比度三档、字阶比例、Hero 字号上限、OKLCH、八态、认知负荷 ≤4、动效规范）、UI 禁用黑名单（`UI_BANNED_LIST`：AI 紫蓝渐变、gradient text、米色底、em-dash 零容忍等）。task 模板、`code_review`、UI 工具三处共同引用，改一处处处生效。

### 🔧 改进

- **反偷懒 task 模板**：`add_feature` 的 tasks 模板（guided/strict）新增「交付物清单（Scope-lock）」、每条任务强制「证据块（先读后写）」「行数预算（超 500 行写拆分方案）」「动词+对象+约束的具体标题」，并加二元禁占位符声明。借鉴 taste-skill / impeccable 的「机器可判定硬约束 + 二元禁令 + 交付前 checklist」方法论。
- **code_review 强化**：注入代码量硬约束（单文件 ≤500 行超出判 HIGH）与完整性黑名单（占位符/省略注释判 CRITICAL）；统一函数行数阈值至 `CODE_LIMITS`（原 30 行 → 50 行）。
- **UI 硬约束注入**：`ui_design_system` 输出注入硬红线 + 禁用黑名单 + 交付前自检矩阵；`start_ui` 编排各模式末尾注入同一约束块；`DesignSystemRecommendation` 新增 `hardConstraints` / `bannedList` 字段。
- **spec-validator 扩展**：tasks 必需章节加入「交付物清单」「文件变更清单」；新增任务详细度校验（每条任务应附「证据块」，缺失记 `thin_task` 提醒）。
- 新增 `scripts/sync-version.mjs` 并挂入 `prebuild`：以 `package.json` 为唯一版本真相源，自动同步 `tools-manifest.json` / `server.json`，杜绝多文件版本号漂移。

---

## [3.2.0] - 2026-06-07

### ✨ 新功能

- 新增 `check_spec` 工具（规格「填写后校验」闸门）：读取 `docs/specs/<feature>/{requirements,design,tasks}.md`，机械校验残留 `[填写]` 占位、缺章节、缺 FR/EARS 验收、FR 未进需求覆盖矩阵；未通过逐条打回，通过前不应进入实现。工具总数 26 → 27。
- 为全部 27 个工具补充 MCP 工具注解（`readOnlyHint`/`idempotentHint`/`destructiveHint`/`openWorldHint`，24 只读 / 3 写型），便于客户端自动放行只读工具。

### 🔧 改进

- **记忆优先编排**：`start_feature` / `start_bugfix` / `start_ui` 将记忆检索提到引导最前，并在计划首位加入显式「检索消化历史经验/坑」步；feature/ui 检索补捞 `bugfix` 类「坑」，注入拆分为「⚠️ 历史坑」与「♻️ 可复用经验」两组。
- **可追溯规格模板**：`add_feature` 的 requirements/design/tasks 模板加入稳定 FR-ID、范围边界（In/Out of Scope）、MoSCoW 优先级、design「对应需求」回链、tasks「需求覆盖矩阵」与 design 回链，并新增「历史经验与坑」承接节。
- `start_feature` 编排在 `add_feature` 之后、`estimate` 之前插入 `check_spec` 闸门步。

---

## [3.1.0] - 2026-06-06

### 🗑️ 移除

- 移除 `cursor_read_conversation` 工具及 Cursor 本地会话历史读取功能
- 移除 `sqlite3` 原生依赖（此前仅服务于 Cursor 历史读取，也是 Windows 上 Visual Studio Build Tools 的安装负担来源之一）
- 工具总数 27 → 26；Memory 分类由「Memory & Cursor History（5）」调整为「Memory（4）」

### 🔧 改进

- 发布产物瘦身：`package.json` 的 `files` 不再包含 `docs/`（文档站字体、图片、`tailwind.js` 等仅用于网站，MCP 运行时从不读取），减小 `npm install` / `npx` 的下载与解压体积

---

## [3.0.24] - 2026-06-02

### 🔧 改进

- `read_memory_asset`：文本输出现包含 `--- content ---` 全文及元数据（v3.0.23 仅返回标题，正文只在 `structuredContent`，opencode 等宿主看不到）
- `search_memory`：文本输出增加每条命中的 `--- content ---` 正文（默认最多 1500 字，可用 `MEMORY_SEARCH_CONTENT_MAX_CHARS` 调整；设为 `0` 则仅摘要）
- `start_*` 记忆注入：即使 Qdrant 中 `content` 为空字符串也会展示元数据块，不再误报「全文加载失败」

---

## [3.0.23] - 2026-06-01

### 🔧 改进

- `search_memory`：文本输出现包含每条命中的 `id`、`score`、`summary`、`description`，便于仅展示 `content[0].text` 的 MCP 宿主（如 opencode）使用
- 文档与 `tools-manifest`：工具总数同步为 27，Memory & Cursor History 分类为 5

### 🗑️ 移除

- 移除 `cursor_list_conversations`、`cursor_search_conversations`；保留 `cursor_read_conversation` 按 `composer_id` 读取完整会话

---

## [3.0.22] - 2026-05-27

### ✨ 新功能

- 嵌入 shadcn catalog、themes 与 Vercel 设计指引

---

## [3.0.21] - 2026-05-27

### 🔧 改进

- `start_feature` / `start_bugfix` / `start_ui`：记忆检索命中后**自动加载全文**并注入编排结果，无需 Agent 再调 `read_memory_asset`
- 环境变量 `MEMORY_INJECTION_CONTENT_MAX_CHARS`（默认 `1500`）控制每条注入内容长度
- `init_project_context` 生成的 AGENTS.md 模板同步记忆规则（自动注入、跨仓库沉淀规范）

---

## [3.0.20] - 2026-05-27

### ✨ 新功能

- 新增 `search_memory`：主动语义检索共享记忆库（支持 type/tags 优先排序）
- 记忆 payload 归一化：兼容 Qdrant 中旧格式（`kind`/`title`/`created_at` 等）

### 🔧 改进

**跨仓库共享记忆**
- 检索注入默认**不展示** `sourcePath`（避免误用其他仓库路径）
- `MEMORY_REPO_ID` 匹配时才展示来源；`MEMORY_SEARCH_SHOW_SOURCE=true` 强制展示
- `scan_and_extract_patterns` 不再写入 `sourceProject`/`sourcePath`
- `memorize_asset`：bugfix 沉淀校验提示；跨仓库填写 source_* 时给出 warning
- `start_feature` / `start_bugfix` / `start_ui` 检索按场景优先排序（bugfix/ui/feature）

**检索质量**
- `MEMORY_SEARCH_MIN_SCORE`：相似度下限（0 表示关闭，推荐 0.72）
- 检索拉取更多候选后按类型/标签加权排序

### 📚 文档

- AGENTS.md 记忆段落：共享库沉淀规范、`search_memory` 用法
- 环境变量：`MEMORY_SEARCH_SHOW_SOURCE`、`MEMORY_SEARCH_MIN_SCORE`、`MEMORY_REPO_ID`
- 新增 `npm run test:memory` 与 `scripts/memory-functional.mjs` 端到端记忆链路测试

---

## [3.0.19] - 2026-05-26

### ✨ 新功能

**AGENTS.md 作为 Harness 入口**
- `init_project_context` 生成/合并根目录 `AGENTS.md` 中的 `mcp-probe:context` 块（保留用户自定义内容）
- 精简 MCP 路由：`start_feature` / `start_bugfix` / `start_ui` / `code_insight` / `init_project_context`
- 记忆工作流写入 AGENTS.md：开干前检索、Bug 修完后 `memorize_asset` type=`bugfix`

**可移植项目布局 manifest**
- 新增 `docs/.mcp-probe/layout.json`（仅相对路径 + `projectRootEnv`，不写死绝对路径）
- 项目根目录从 manifest 文件位置反推；`start_*` / `code_insight` 通过 layout 解析 `docs/` 等路径
- 支持自定义 `docs_dir`（如 `documentation/.mcp-probe/layout.json`）

### 🔧 改进

- `memory-orchestration`：区分 feature / bugfix / ui 沉淀模板；检索引导包含历史 Bug 修复记录
- `resolveWorkspaceRoot`：优先从 layout manifest 发现项目根
- 新增 `project-context-layout`、`merge-agents-md`、`agents-md-template` 模块与单测

### 📚 文档

- 本地记忆栈指南（Qdrant + Infinity）补充

---

## [3.0.18] - 2026-05-20

### ✨ 新功能

**Memory & Cursor History 工具集（6 个新工具）**
- 新增 `read_memory_asset`：从 Qdrant 读取已存储的记忆资产
- 新增 `memorize_asset`：将记忆资产存储到 Qdrant，支持 Ollama / OpenAI-compatible embedding
- 新增 `scan_and_extract_patterns`：扫描代码库并提取模式到记忆系统
- 新增 `cursor_list_conversations`：列出本地 Cursor 对话历史
- 新增 `cursor_search_conversations`：按关键词搜索 Cursor 对话
- 新增 `cursor_read_conversation`：读取完整 Cursor 对话内容
- 支持 Qdrant 向量存储与自动 collection 创建
- 支持 Windows / macOS / Linux 本地 Cursor 数据库读取
- 环境变量配置：`MEMORY_QDRANT_URL`、`MEMORY_EMBEDDING_PROVIDER`、`MEMORY_EMBEDDING_URL` 等

**Git 工作报告工具**
- 新增 `git_work_report`：从 git 历史生成工作报告，支持按作者、时间范围、分支筛选

**UI / PRD Skill Bridge 接入**
- 新增 `skill-bridge` 模块，统一检测并桥接 `ui-ux-pro-max`、`interaction-design`、`frontend-design`
- `start_ui` / `start_product` 输出中新增 Skill Bridge 指南区块
- `start_ui` / `start_product` 的 `structuredContent.metadata` 新增 `skills` 状态信息
- `start_ui` / `start_product` 的 delegated plan 新增 `skill-bridge` 步骤，明确技能调用顺序与缺失回退

### 🔧 改进

**工具清单更新**
- 工具总数从 20 增至 **28**
- 新增分类：Memory & Cursor History (6)
- 更新分类：Code Analysis (3 → 4)、Project Management (7 → 6)
- `tools-manifest.json` 同步更新至 v3.0.16

**UI 数据版本生效策略升级**
- 引入会话内版本锁：当前进程不热切换 UI 数据版本，避免同会话输出漂移
- 后台自动检查并下载最新 UI 数据，标记为“下次启动生效”
- `sync_ui_data` 输出新增会话状态与“下次启动生效版本”说明

**发布产物内嵌数据修复**
- 新增 `postbuild` 复制步骤，将 `src/resources/ui-ux-data` 复制到 `build/resources/ui-ux-data`
- 确保 npm 包内包含内嵌 UI 数据，离线与首启场景可直接使用

### 📝 文档

- README 新增 UI/PRD 工作流 Skill Bridge 说明与调用顺序
- README 的 Data Sync Strategy 更新为“后台下载 + 下次启动生效”
- docs i18n 版本标记更新至 `v3.0.16`

**多语言 README 全面同步**
- 德文/西班牙文/法文/葡语 README 从旧版短文档升级到与英文主 README 同级的信息密度
- 日文/韩文 README 补齐缺失的新章节与配置说明
- 所有语言 README 统一更新至 28 工具、新分类、Memory & Cursor History、GitNexus bridge、TBP workflow、Qdrant 配置等核心章节
- 覆盖语言：de-DE、es-ES、fr-FR、pt-BR、ja-JP、ko-KR、zh-CN

**文档站点 i18n 完善**
- `docs/pages/getting-started.html` 清理所有中文 fallback，统一使用英文默认文案 + i18n 键
- `docs/i18n/*.json` 补齐 Memory、Cursor History、GitNexus 相关翻译键
- 站点四语言（en/zh-CN/ja/ko）翻译覆盖率达到 100%

**元数据文件更新**
- README 新增 Memory & Cursor History 工具使用说明与配置示例
- `tools-manifest.json` 补充 v3.0 新增工具说明与移除工具原因

---

## [3.0.15] - 2026-03-15

### 🐛 修复

**impact 模式中 `file_path` 生效问题**
- 修复 `code_insight` 的 `impact` 流程：当通过 `context + file_path` 已解析到具体符号时，`impact.target` 现在会优先使用解析后的 `uid/id`
- 避免仍使用原始字符串 `target` 导致误命中同名非目标符号
- 新增回归测试覆盖 `context` 解析结果向 `impact` 目标的复用

### 📝 文档

**Windows Notes for Graph Tools 多语言补齐**
- 站点文档（en/zh-CN/ja/ko）补充 Build Tools 快速安装说明与命令
- README 多语言文档补齐 Windows 图谱工具说明，确保 de/es/fr/ja/ko/pt-BR/zh-CN 与英文主 README 一致覆盖
- 统一补充快速安装命令：`winget install Microsoft.VisualStudio.2022.BuildTools`

---

## [3.0.14] - 2026-03-15

### ✨ 改进

**code_insight 排序、歧义与使用引导优化**
- 强化 `query` 结果重排策略：提高函数名精确/部分匹配与文件路径关键词权重，降低无匹配流程的排序优先级
- `impact` 模式新增目标预检查：当目标被解析为 `Folder/File/Module` 等不可调用符号时，直接返回歧义提示并建议改用 `uid` 或 `file_path`
- 简化 delegated plan：从固定多步落盘流程调整为“先消费结果 + 按需保存”
- 在 `code_insight` 返回中增加“使用场景指南 / 下一步建议”，明确 `goal`、`uid`、`file_path`、`include_content`、`save_to_docs` 的使用方式

### 📝 文档

- README（中英）补充 Windows Build Tools 快速安装命令：`winget install Microsoft.VisualStudio.2022.BuildTools`

### ✅ 测试

- 更新 `code_insight` 单测覆盖简化后的 delegated plan 和使用指南输出
- 保持 `gitnexus-bridge` 重排测试通过

---

## [3.0.13] - 2026-03-15

### ✨ 改进

**GitNexus bridge 启动与 code_insight 可用性增强**
- GitNexus bridge 改为优先使用本地已安装的 `gitnexus` CLI，找不到时再回退到 `npx`
- 支持通过 `MCP_GITNEXUS_COMMAND` / `MCP_GITNEXUS_ARGS` 显式覆盖启动命令
- `code_insight` 暴露 `include_content`、`uid`、`file_path` 参数，减少二次调用成本
- 透传 GitNexus 的歧义状态和候选列表，并生成按场景动态变化的 delegated plan
- 新增对 `query` 结果的轻量关键词重排，优先提升与查询词更贴近的流程结果

### 📝 文档

- 在 README、getting-started 页面及多语言文档中补充 Windows 下图谱工具冷启动、Build Tools 依赖和超时配置说明

### ✅ 测试

- 新增本地 `gitnexus` CLI 优先启动测试
- 新增 query 结果重排测试
- 新增歧义 delegated plan 与非默认 docs 落盘行为测试

---

## [3.0.12] - 2026-03-14

### 🐛 修复

**修复 3.0.11 在 Windows 下的二次回归**
- 移除手工 `cmd.exe /d /s /c` 包装，改为统一使用 `cross-spawn` 处理 Windows 的 `.cmd/.bat` 可执行文件
- 修复 `3.0.11` 中引号被 Node `spawn` 二次转义后变成 `\"...\"`，导致 `code_insight` 仍然无法启动 GitNexus 的问题
- 保持 `npx`、`npm`、以及带空格绝对路径的 `.cmd` 可执行文件都能在 Windows 上正常启动

### ✅ 测试

- 新增 Windows 真实执行级测试，不再只检查参数拼装结果
- 覆盖 `npx --version` 实际启动验证
- 覆盖带空格绝对路径的 `.cmd` 脚本实际启动验证

---

## [3.0.11] - 2026-03-14

### 🐛 修复

**Windows 下 GitNexus Bridge 命令路径带空格时执行失败**
- 修复 `code_insight` 桥接 GitNexus 时，`cmd.exe /d /s /c` 包装 `.cmd/.bat` 可执行文件未加引号的问题
- 当 Node.js 安装在 `C:\Program Files\nodejs\` 等带空格目录时，`npx.cmd` 现在会被正确引用，不再触发 `'C:\Program' 不是内部或外部命令`
- 补充 Windows 回归测试，覆盖带空格绝对路径的 `.cmd` 启动场景

### 🔍 兼容性检查

- 检查项目内其它 Windows 命令拼装入口，未发现同类未加引号的 `cmd.exe` 包装问题

---

## [3.0.6] - 2026-03-11

### ✨ 新功能

**MCP Tasks / Progress / Cancellation 增强**
- 基于官方 `@modelcontextprotocol/sdk@1.27.1` 启用原生任务能力（`tasks/get|result|list|cancel`）
- `tools/call` 支持任务化执行：创建任务后后台运行并回填任务结果
- 长任务增加进度通知（`notifications/progress`）与协作式取消（`AbortSignal`）
- `start_*` 编排工具和 `sync_ui_data` 接入统一执行上下文（进度 + 取消）

**前向兼容与扩展能力**
- 透传请求 `_meta.trace` 到工具响应 `_meta`（可配置 trace key）
- 增加 extensions capability 开关（`MCP_ENABLE_EXTENSIONS_CAPABILITY=1`）
- 增加可选 MCP Apps UI 资源输出（`ui://...` + `_meta.ui.resourceUri`，`MCP_ENABLE_UI_APPS=1`）

### 🔧 改进

- 重构 `sync_ui_data` 底层同步流程，支持下载/解压/处理阶段进度上报与取消中断
- 更新 README 与多语言文档中的 SDK 版本与能力说明

---

## [3.0.5] - 2026-02-04

### 🔧 改进

**MCP Registry 支持**
- 在 package.json 中添加 `mcpName` 字段以支持 MCP Registry 发布
- 更新 server.json 使用最新的 schema (2025-12-11)
- 优化英文 README 描述，移除中文内容，提升国际化文档质量

---

## [3.0.3] - 2026-02-03

### 🔧 改进

**git_work_report 工具重构**
- 将 `git_work_report` 从数据驱动工具改为指南型工具
- 工具现在返回指导文本，而不是直接执行 Git 命令
- AI 根据指导在客户端环境中执行 Git 命令并分析
- 解决了 MCP 服务器环境限制和跨平台兼容性问题
- 与其他指南型工具（gencommit、fix_bug 等）保持一致的设计模式

**工作方式**：
1. 用户调用：`git_work_report --date 2026-2-3`
2. 工具返回：包含 Git 命令和输出要求的指导文本
3. AI 执行：根据指导执行 `git log` 和 `git show`，分析 diff 生成报告

---

## [3.0.2] - 2026-02-03

### ✨ 新功能

**Git 工作报告生成工具**
- 新增 `git_work_report` 工具，基于 Git diff 分析生成工作报告
- 支持日报模式（单个日期）和周期报模式（日期范围）
- 自动读取指定日期的所有 Git 提交，执行 `git show` 获取完整 diff
- 使用 AI 分析 diff 内容，智能提取实际工作内容
- 输出格式：简洁专业的中文，每条以 `-` 开头，格式为"做了什么 + 改了哪里/达到什么效果"
- 支持输出到文件（`--output_file` 参数）

**使用示例**：
```bash
# 生成日报
git_work_report --date 2026-1-27

# 生成周报
git_work_report --start_date 2026-2-1 --end_date 2026-2-6

# 保存到文件
git_work_report --date 2026-1-27 --output_file daily-report.md
```

### 📝 文档更新
- 更新 README.md，工具数量从 20 个增加到 21 个
- 更新 Git 工具分类，从 1 个增加到 2 个
- 添加 `git_work_report` 使用示例和说明
- 更新 `docs/data/tools.js` 工具数据
- 新增完整的规格文档（requirements.md, design.md, tasks.md）

---

## [3.0.1] - 2026-02-02

### 🐛 修复

**工具输出标准化**
- 修复 6 个指南型工具的输出格式，避免返回空的结构化数据误导 AI：
  - `fix_bug` - 改为 okText（返回修复指南）
  - `add_feature` - 改为 okText（返回规格生成指南）
  - `estimate` - 改为 okText（返回估算指南）
  - `gentest` - 改为 okText（返回测试生成指南）
  - `code_review` - 改为 okText（返回审查指南）
  - `refactor` - 改为 okText（返回重构指南）

**工具分类明确**
- 新增 `response.okText()` 函数，专门用于指南型工具
- 工具清晰分为两类：
  - **指南型工具（6个）**：返回 `okText`，AI 根据指南执行任务
  - **数据驱动工具（14个）**：返回 `okStructured`，包含真实的执行计划或数据
- 更新 `tools-manifest.json`，明确标注工具类型和 Schema 用途

### 🎯 影响

- **用户体验提升**：AI 不再误以为指南型工具已完成任务，会正确地根据指南执行
- **系统更稳定**：所有工具都经过系统化测试和验证
- **文档更清晰**：工具类型和用途一目了然

---

## [3.0.0] - 2026-02-02

### 🚀 重大变更

**工具精简 51%：从 39 个精简至 20 个**

### ❌ 删除的工具（19 个）

**编排工具（5 个）**
- `start_review` → 直接使用 `code_review` 工具即可
- `start_refactor` → 直接使用 `refactor` 工具即可
- `start_api` → AI 可直接生成 API
- `start_doc` → AI 可直接生成文档
- `start_release` → 低频操作，手动进行更合适

**代码分析工具（2 个）**
- `security_scan` → 功能已集成到 `code_review`
- `perf` → 功能已集成到 `code_review`

**Git 工具（3 个）**
- `genchangelog` → 低频操作，AI 可直接生成
- `genpr` → AI 可直接写 PR 描述
- `resolve_conflict` → 极低频操作

**代码生成工具（5 个）**
- `gendoc` → AI 可直接生成代码注释
- `genapi` → AI 可直接生成 API 文档
- `gensql` → AI 可直接生成 SQL
- `genreadme` → 低频操作
- `gen_mock` → AI 可直接生成 Mock 数据

**产品设计工具（2 个）**
- `gen_prd` → 已集成到 `start_product`
- `gen_prototype` → 已集成到 `start_product`

**UI 内部工具（2 个）**
- `init_component_catalog` → `start_ui` 内部调用
- `render_ui` → `start_ui` 内部调用

### ✨ 保留的工具（20 个）

**编排工具（6 个）**
- `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`

**日常工具（9 个）**
- `gencommit`, `code_review`, `gentest`, `refactor`, `fix_bug`, `add_feature`, `init_project`, `init_project_context`, `estimate`

**交互工具（2 个）**
- `interview`, `ask_user`

**UI/UX 工具（3 个）**
- `ui_design_system`, `ui_search`, `sync_ui_data`

### 📝 设计哲学

v3.0 专注于以下核心理念：
- **消除选择困难**：减少工具数量，让用户快速找到正确的工具
- **专注核心竞争力**：保留编排工具和高频工具，删除 AI 可直接完成的任务
- **让 AI 做更多**：低频、简单的生成任务直接交给 AI 原生能力

### ⚠️ 迁移指南

如果您在 v2.x 中使用了已删除的工具，请参考以下迁移方案：

1. **编排工具** → 直接使用对应的原子工具或让 AI 直接生成
2. **代码分析** → 使用 `code_review` 工具，支持 `focus` 参数指定分析重点
3. **Git 工具** → 直接向 AI 描述需求，AI 会生成符合规范的内容
4. **代码生成** → 直接向 AI 描述需求，无需专门工具
5. **产品设计** → 使用 `start_product` 统一入口
6. **UI 内部工具** → 使用 `start_ui` 统一入口

---

## [2.5.0] - 2026-01-30

### ✨ 改进

**工作流与工具清理**
- 🧹 **工具列表精简**：移除低频/重复工具（debug、analyze_project、check_deps、genui、design2code），保持核心工具清晰可维护
- 🧭 **工作流分类优化**：`start_product` 归入「工作流编排」，与产品→研发流程一致
- 📚 **文档与清单对齐**：工具清单、分类与数量（39）统一更新，避免文档/Schema 不一致

**start_ui 生产级增强**
- 🧩 **模板落盘步骤明确**：新增“保存模板文件”的执行步骤，确保 UI 生成流程可追踪
- 🧠 **产品类型推断**：从需求描述中推断 `product_type`，减少用户输入
- 🎨 **颜色策略优化**：默认避免蓝紫“AI 风”配色，需明确需求才启用

### 🧪 测试

- 更新 start_ui 相关测试用例，保持流程与文档一致

---

## [2.3.1] - 2026-01-29

### 🐛 Bug 修复

**产品设计工具指导文本优化**
- 🔧 **add_feature** - 重构指导文本模板，参考 gen_prd 的格式，使用更清晰的 markdown 模板和 `[填写：xxx]` 标记
- 🔧 **gen_prd** - 统一目录结构为 `docs/specs/{feature_name}/`，与 add_feature 保持一致
- 🔧 **gen_prototype** - 添加 featureName 提取逻辑，统一目录结构
- 🔧 **start_product** - 更新工作流指导，确保所有文档在正确的目录下创建

### 📝 改进说明

之前的工具指导文本不够清晰，AI 可能无法正确理解如何创建文件。本次更新：
- 所有产品设计工具现在使用统一的 `docs/specs/{feature_name}/` 目录结构
- 指导文本更加明确，直接提供完整的 markdown 模板
- 使用 `[填写：xxx]` 标记需要 AI 智能填充的部分
- 移除冗长的编写指南，让模板更简洁直观

---

## [2.3.0] - 2026-01-29

### ✨ 新功能

**产品设计工作流**
- 🎯 **gen_prd** - 生成产品需求文档（PRD），包含产品概述、功能需求、优先级、非功能性需求和页面清单
- 📐 **gen_prototype** - 生成原型设计文档，为每个页面生成独立的 Markdown 文档，包含页面结构、交互说明和元素清单
- 🎨 **HTML 可交互原型** - 自动生成可在浏览器中直接查看的 HTML 原型，应用设计系统样式，支持响应式布局
- 🚀 **start_product** - 产品设计完整工作流编排，一键完成：PRD → 原型文档 → 设计系统 → HTML 原型 → 项目上下文更新

### 🔧 改进

- 完善产品设计到开发的完整链路
- 与现有 UI/UX 工具深度集成（ui_design_system、start_ui）
- 支持从需求访谈到原型演示的一站式流程
- HTML 原型可直接给客户演示，无需额外的原型工具
- 工具总数从 39 个增加到 42 个

### 📚 使用场景

**完整产品设计流程：**
```bash
# 一键生成完整产品设计
start_product --description "在线教育平台" --product_name "EduPro"

# 生成的文件：
# - docs/prd/product-requirements.md (PRD 文档)
# - docs/prototype/*.md (原型文档)
# - docs/design-system/design-system.json (设计系统)
# - docs/html-prototype/index.html (HTML 原型索引)
# - docs/html-prototype/page-*.html (各页面 HTML 原型)
```

**单独使用工具：**
```bash
# 只生成 PRD
gen_prd --description "在线教育平台"

# 基于 PRD 生成原型
gen_prototype --prd_path "docs/prd/product-requirements.md"
```

---

## [2.2.1] - 2026-01-28

### 🔧 改进

**gencommit 工具优化**
- 改为只返回指导文本，不再返回结构化 JSON 示例
- AI 根据指导和实际代码变更生成符合规范的 commit 消息
- 避免 AI 直接使用示例数据，确保生成真实的 commit 内容

### 🧪 测试

- 更新 gencommit 相关测试用例，验证纯文本指导输出
- 所有 299 个测试通过

---

## [2.2.0] - 2026-01-28

### ✨ 新功能

**start_ui 工具增强**
- 🎯 **第一步生成项目上下文**：调用 `init_project_context` 确保项目文档完整
- 📝 **自动更新索引**：生成 UI 文档后自动添加到 `project-context.md` 索引中
- 🔍 **智能框架检测**：优先从 `project-context.md` 读取框架信息，确保一致性
- 📋 **完整工作流**：6 个步骤覆盖从项目上下文到 UI 生成的完整流程

### 🔧 改进

- 工作流步骤从 4 个增加到 6 个，更完整的开发流程
- 框架检测优先使用已生成的项目上下文，避免重复检测
- 默认框架改为 html（最通用），而不是 react
- UI 文档自动集成到项目上下文系统中
- **gencommit 工具简化**：改为只返回指导文本，让 AI 根据实际代码变更生成 commit 消息

### 🎨 文档优化

- 在文档网站左侧导航添加可展开的工具列表子菜单
- 支持点击工具名称直接跳转到对应位置
- 每个工具添加简短描述（最多 4 个字）
- 优化滚动偏移，避免被页头遮挡
- 添加平滑滚动和高亮效果
- 改善用户体验，方便快速查找工具

---

## [2.1.2] - 2026-01-28

### 🐛 修复

- **依赖配置错误**：将 `csv-parse` 和 `tar` 从 `devDependencies` 移到 `dependencies`
  - 这两个包是运行时依赖，用于 UI/UX 数据同步功能
  - 修复了用户安装后可能遇到的模块找不到问题

---

## [2.1.1] - 2026-01-28

### 🎯 重大改进

**init_project_context 工具重新设计**
- 🔥 **移除复杂的"分析任务"系统**，采用简单直接的模板方式
- ✨ **始终生成索引文件** `project-context.md` 作为项目上下文的入口（项目的灵魂）
- 📋 **提供具体的 Markdown 模板**，而不是抽象的分析任务
- 🎯 **新增"开发时查看对应文档"部分**，按开发场景（添加新功能、修改代码、调试问题等）智能分类文档
- 💡 **强调从项目中提取真实代码示例**，避免生成泛化内容

### 📚 文档生成改进

**根据项目类型生成不同文档**：
- **后端 API 项目**：索引 + 技术栈 + 架构 + 如何添加接口 + 如何操作数据库 + 如何处理认证
- **前端 SPA 项目**：索引 + 技术栈 + 架构 + 如何创建新页面 + 如何调用API + 如何管理状态
- **全栈项目**：索引 + 技术栈 + 架构 + 如何开发新功能 + 如何添加接口 + 如何创建新页面
- **库/SDK 项目**：索引 + 技术栈 + 架构 + 如何添加新工具 + 如何编写测试
- **CLI 工具**：索引 + 技术栈 + 架构 + 如何添加新命令 + 如何编写测试

### 🗑️ 移除

- 删除 `src/lib/analysis-tasks.ts` - 过于复杂的分析任务系统
- 删除 `src/lib/task-generator.ts` - 任务指导生成器
- 移除 `mode` 参数 - 现在只有一种模式（模块化），更简单

### 🎨 用户体验提升

- 索引文件包含**按场景分类的文档导航**（添加新功能、修改现有代码、调试问题、编写测试、部署上线）
- 每个文档都有**清晰的填写指导**和**具体的模板结构**
- 多次强调**必须从项目中提取真实代码**，不要编造示例

### 📝 文档

- 新增 `docs/specs/project-context-modular/implementation-v2.md` - 详细说明新设计
- 新增 `docs/specs/project-context-modular/example-output.md` - 输出示例
- 更新 `docs/specs/project-context-modular/tasks.md` - 添加 v2.1 重新设计说明

### 🧪 测试

- 所有 299 个测试通过
- `init_project_context` 的 9 个测试全部通过

### 💬 用户反馈

解决了用户反馈的问题："生成的文件太泛了，第一眼看很牛逼，仔细看就不行了"

---

## [2.1.0] - 2026-01-27

### ✨ 新功能

**init_project_context 工具增强**
- 新增 `mode` 参数，支持两种文档生成模式：
  - `single`（单文件模式）：生成一个包含所有信息的 `project-context.md` 文件（默认，v2.0 兼容）
  - `modular`（模块化模式）：生成 1 个索引文件 + 5 个分类文档，便于大型项目管理
- 模块化模式生成 6 个文档：
  - `project-context.md` - 索引文件（唯一入口）
  - `project-context/tech-stack.md` - 技术栈信息
  - `project-context/architecture.md` - 架构和项目结构
  - `project-context/coding-standards.md` - 编码规范
  - `project-context/dependencies.md` - 依赖管理
  - `project-context/workflows.md` - 开发流程和命令

### 🔧 改进

- 增强错误处理，提供更友好的错误提示
- 添加 `mode` 字段到 `ProjectContext` Schema，标识使用的生成模式
- 完善的参数验证（拒绝无效的 mode 值）
- 支持自定义文档目录（`docs_dir` 参数）

### 📝 文档

- 更新工具使用说明
- 添加模块化模式使用示例

### 🧪 测试

- 新增 9 个契约测试，覆盖单文件和模块化两种模式
- 所有 151 个测试通过

### 🔄 向后兼容

- 默认使用单文件模式，完全兼容 v2.0
- 现有用户无需修改任何代码

---

## [2.0.0] - 2026-01-27

### 🎉 重大版本发布 - 完整文档系统与工具精简

#### 核心变更

**✅ 工具精简优化**
- 从 48 个工具精简到 39 个核心工具
- 删除低频、重复、过时的工具
- 100% 支持结构化输出
- 提高维护性和用户体验

**✅ 完整文档系统**
- 全新文档网站：https://mcp-probe-kit.bytezonex.com
- 5 个核心页面：首页、安装配置、所有工具、迁移指南、最佳实践
- 完整的 SEO 优化和响应式设计
- 支持源码编译安装方式

**✅ 架构优化**
- 修复 MCP SDK 兼容性问题（Tasks API）
- 删除未使用代码（净减少 751 行）
- 优化 CSS 样式（修复点击蓝色边框问题）

#### 工具分类（39 个）

**工作流编排（10 个）**
- start_feature, start_bugfix, start_review, start_release, start_refactor
- start_onboard, start_api, start_doc, start_ui, start_ralph

**代码分析（7 个）**
- code_review, security_scan, debug, perf, refactor, fix_bug, estimate

**Git 工具（4 个）**
- gencommit, genchangelog, genpr, resolve_conflict

**生成工具（7 个）**
- genapi, gendoc, gentest, gensql, genreadme, gen_mock, genui

**项目管理（7 个）**
- init_project, analyze_project, init_project_context, add_feature
- check_deps, interview, ask_user

**UI/UX 工具（6 个）**
- ui_design_system, ui_search, sync_ui_data, init_component_catalog
- render_ui, design2code

#### 文档更新

- ✅ 完整的在线文档系统
- ✅ 简化的 README（从 1755 行精简到 200 行）
- ✅ 迁移指南（v1.x → v2.0）
- ✅ 最佳实践指南（完整研发流程）

#### 技术细节

- 修复 "Schema is missing a method literal" 错误
- 暂时禁用 Tasks API（等待 MCP SDK 正式支持）
- 删除未使用文件：elicitation-helper.ts, tool-params-guide.ts, resources/index.ts
- 优化 CSS：使用 :focus-visible 保留键盘导航可访问性

---

## [1.14.0] - 2025-01-24

### Added
- 🎨 **UI/UX Pro Max 工具集**
  - `ui_design_system` - 智能设计系统生成器
  - `ui_search` - UI/UX 数据库搜索（BM25 算法）
  - `sync_ui_data` - 同步最新 UI/UX 数据
  - 支持 React、Vue、Next.js、Tailwind 等主流技术栈
  - 内嵌数据 + 缓存策略，离线可用

---

## [1.13.0] - 2025-01-21

### Added
- 🚀 **Ralph Wiggum Loop 循环开发**
  - `start_ralph` - 自动化循环迭代开发
  - 多重安全保护机制（迭代次数、运行时间、人工确认）
  - 生成 `.ralph/` 目录和安全模式脚本
  - 跨平台支持（Linux/Mac/Windows）

---

## [1.12.0] - 2025-01-21

### Added
- 🎸 **需求访谈工具**
  - `interview` - 结构化需求访谈，避免理解偏差
  - `ask_user` - AI 主动提问工具
  - 生成访谈记录文档

---

## [1.11.0] - 2025-01-17

### Changed
- 🏗️ **模块化 Schema 定义**
  - 将 800+ 行代码拆分为模块化结构
  - 创建 `src/schemas/` 目录，按功能分类
  - 所有工具的 inputSchema.properties 完整定义
  - 新增 MCP Resource: `probe://tool-params-guide`

---

## [1.10.0] - 2025-01-17

### Changed
- 🎯 **自然语言输入支持**
  - 所有工具支持直接传递自然语言字符串
  - inputSchema 类型从 `object` 改为 `string`
  - 智能参数解析，支持 5+ 种输入格式
  - 支持中文字段别名

---

## [1.8.0] - 2025-01-16

### Added
- 🎸 **Agent Skills 支持**
  - `gen_skill` - 生成 Agent Skills 文档
  - 支持 agentskills.io 开放标准
  - 兼容 Claude/Gemini/OpenCode

---

## [1.7.0] - 2025-01-14

### Added
- 🎨 **设计稿转代码**
  - `design2code` - 支持图片 URL、Base64、文字描述
  - 支持 React、Vue 双框架
  - 1:1 精确还原设计稿

---

## [1.2.6] - 2025-10-27

### Added
- 🎸 **Commit Emoji 支持**
  - 为所有 commit 类型添加 emoji（�🎸✏️💄🤖♻️✅）
  - 新增 `fixed` 类型用于线上缺陷修复

---

## Earlier Versions

See [GitHub Releases](https://github.com/mybolide/mcp-probe-kit/releases) for versions prior to 1.2.6.

---

## Links

- [Documentation](https://mcp-probe-kit.bytezonex.com)
- [GitHub Repository](https://github.com/mybolide/mcp-probe-kit)
- [npm Package](https://www.npmjs.com/package/mcp-probe-kit)
- [Issue Tracker](https://github.com/mybolide/mcp-probe-kit/issues)
