<div align="center">
<img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
<h1>知时MCP | mcp-probe-kit</h1>
<p><strong>知其境，馈其时。</strong></p>
<p><code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code></p>
</div>

---

**Talk is cheap, show me the Context.**

> 知时MCP 是专为极客打造的协议级探测与上下文补给工具箱。它不仅仅是 29 个工具的堆砌，更是一套让 AI 真正"读懂"你项目意图的感知系统。

**Languages**: [English](../README.md) | **简体中文** | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 AI 驱动的完整研发工具集 - 覆盖开发全流程

一个强大的 MCP (Model Context Protocol) 服务器，提供 **29 个工具**，覆盖从产品分析到最终发布的全流程（需求 → 设计 → 开发 → 质量 → 发布），所有工具支持**结构化输出**。

**🎉 v3.0 重大更新**：精简工具数量，专注核心竞争力，消除选择困难，让 AI 做更多原生工作

**支持所有 MCP 客户端**：Cursor、Claude Desktop、Cline、Continue 等

**协议版本**：MCP 2025-11-25 · **SDK**：@modelcontextprotocol/sdk 1.27.1

---

## 📚 完整文档

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [快速开始](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - 5分钟完成安装配置
- [本地记忆栈（Qdrant + Nomic Embed）](../docs/memory-local-setup.zh-CN.md) - Docker Compose、端口 50008/50012、MCP 配置
- [所有工具](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - 29个工具完整列表
- [最佳实践](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - 完整研发流程实战指南
- [v3.0 迁移指南](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - v2.x → v3.0 升级指南

---

## ✨ 核心特性

### 📦 29 个工具

- **🔄 工作流编排** (6个) - 一键完成复杂开发流程
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 代码分析** (4个) - 代码质量、重构与图谱洞察
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Git 工具** (2个) - Git 提交和工作报告
  - `gencommit`, `git_work_report`
- **⚡ 代码生成** (1个) - 测试生成
  - `gentest`
- **📦 项目管理** (7个) - 项目初始化、需求与规格校验
  - `init_project`, `init_project_context`, `add_feature`, `check_spec`, `estimate`, `interview`, `ask_user`
- **🎨 UI/UX 工具** (3个) - 设计系统与数据同步
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 记忆** (6个) - 资产记忆沉淀
  - `search_memory`, `read_memory_asset`, `memorize_asset`, `update_memory_asset`, `delete_memory_asset`, `scan_and_extract_patterns`

### 🧠 代码图谱桥接 (GitNexus)

- `code_insight` 默认桥接 GitNexus，执行 query/context/impact 分析
- 桥接默认通过 `npx -y gitnexus@latest mcp` 启动，降低抓取过期包的风险
- `init_project_context` 在 `docs/graph-insights/` 下生成基线图谱文档；如果 `docs/project-context.md` 已存在则保留旧上下文文档，仅回填图谱文档及索引条目
- `start_feature` 刷新 GitNexus 索引，并在生成 spec 前执行任务级 `query/context/impact` 收窄，以减少过度范围
- `start_bugfix` 刷新 GitNexus 索引，并在 TBP RCA 前执行任务级图谱分析，以约束故障边界和爆炸半径
- 已有 `project-context.md` 但没有图谱文档的旧项目，会通过 `init_project_context` 自动引导生成
- 如果 GitNexus 不可用，服务器自动降级，不会中断编排流程
- 真正的图谱查询读取 `.gitnexus` 索引；`docs/graph-insights/latest.md|json` 是供人类和 AI Agent 阅读的快照
- 图谱快照作为 MCP 资源：Cursor 设置页仅列出 **2 项**（`probe://status`、`probe://graph/latest`）；`latest` 内嵌历史摘要与落盘索引。按需 URI（`probe://graph/history`、`probe://graph/latest.md`、`probe://graph/files`）仍可通过 `resources/read` 读取
- 图谱快照同时落盘到 `.mcp-probe-kit/graph-snapshots`（可通过 `MCP_GRAPH_SNAPSHOT_DIR` 自定义）
- 工具响应中包含 `_meta.graph`，携带快照 URI 和本地 JSON/Markdown 文件路径

### 🐛 Bug 流程的 TBP 8 步根因分析法

- `start_bugfix` 默认在修复前执行 Toyota 式 TBP 8 步根因分析
- `fix_bug` 返回结构化 TBP 骨架，涵盖：现象、时间线、已排除路径、边界、根因、证据、修复计划
- 这让 Bug、回归、异常、"为什么不行" 类排查遵循先分析再修复的纪律，而非打补丁

### 🧠 记忆检索

- 记忆工具使用 **Qdrant** 作为向量数据库后端
- Embedding 服务支持两种模式：
  - `ollama`
  - `openai-compatible`

**记忆工具：**
- `search_memory` - 语义检索共享记忆库；文本输出与 `structuredContent` 均含 `id`、`score`、`summary`、`description`
- `memorize_asset` - 将高价值代码/规范/模式沉淀到向量记忆库
- `read_memory_asset` - 按 `asset_id` 读取完整记忆内容
- `update_memory_asset` - 按 `asset_id` 原地更新已有记忆（保留 ID；`content` 变更会重新向量化）
- `delete_memory_asset` - 按 `asset_id` 从共享记忆库删除
- `scan_and_extract_patterns` - 从代码/文件/目录中抽取候选模式，再决定是否沉淀

**向量库与 embedding 配置：**
- 向量数据库：**Qdrant**
- **本地推荐组合：** `Qdrant（50008）+ Infinity / nomic-embed（50012）`，比 Ollama 更轻；详见 **[本地记忆栈指南](../docs/memory-local-setup.zh-CN.md)**（英文：[memory-local-setup.md](../docs/memory-local-setup.md)）
- 支持的 embedding provider：
  - `ollama`
  - `openai-compatible`（Infinity、OpenAI 等）
- 记忆写入/检索必填环境变量：
  - `MEMORY_QDRANT_URL`
  - `MEMORY_EMBEDDING_URL`
  - `MEMORY_EMBEDDING_MODEL`
- 可选环境变量：
  - `MEMORY_QDRANT_API_KEY`
  - `MEMORY_QDRANT_COLLECTION`（默认 `mcp_probe_memory`）
  - `MEMORY_EMBEDDING_API_KEY`
  - `MEMORY_EMBEDDING_PROVIDER`（默认 `ollama`）
  - `MEMORY_SEARCH_LIMIT`（默认 `3`）
  - `MEMORY_SUMMARY_MAX_CHARS`（默认 `280`）
- 行为说明：
  - 只读记忆功能只要求配置 `MEMORY_QDRANT_URL`
  - 写入记忆要求同时配置 `MEMORY_QDRANT_URL`、`MEMORY_EMBEDDING_URL`、`MEMORY_EMBEDDING_MODEL`
  - 首次写入会自动创建 Qdrant collection，向量维度按第一次 embedding 返回结果自动推断

**推荐本地配置（Qdrant + Nomic Embed / Infinity）：**

完整 Compose、端口与排错：**[docs/memory-local-setup.zh-CN.md](../docs/memory-local-setup.zh-CN.md)**

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:50008",
        "MEMORY_QDRANT_API_KEY": "你的-qdrant-api-key",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "openai-compatible",
        "MEMORY_EMBEDDING_URL": "http://127.0.0.1:50012/embeddings",
        "MEMORY_EMBEDDING_MODEL": "nomic-ai/nomic-embed-text-v1.5",
        "MEMORY_EMBEDDING_API_KEY": "你的-infinity-api-key",
        "MEMORY_SEARCH_LIMIT": "3",
        "MEMORY_SUMMARY_MAX_CHARS": "280"
      }
    }
  }
}
```

**备选：Qdrant + Ollama**（已安装 Ollama 时）：

```bash
docker run -d --name mcp-qdrant -p 6333:6333 qdrant/qdrant
ollama pull nomic-embed-text
```

**云端 OpenAI-Compatible Embedding 示例：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:6333",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "openai-compatible",
        "MEMORY_EMBEDDING_URL": "https://your-embedding-endpoint/v1/embeddings",
        "MEMORY_EMBEDDING_API_KEY": "your-api-key",
        "MEMORY_EMBEDDING_MODEL": "text-embedding-3-small"
      }
    }
  }
}
```

### 🎯 结构化输出

核心与编排工具支持**结构化输出**，返回机器可读的 JSON 数据，提高 AI 解析准确性，支持工具串联和状态追踪。

### ⏱️ 原生任务、进度推送与取消

- 基于 MCP SDK 的原生 task 支持（`taskStore` + `taskMessageQueue`）
- 支持任务生命周期端点：`tasks/get`、`tasks/result`、`tasks/list`、`tasks/cancel`
- 声明 `capabilities.tasks.requests.tools.call`，客户端可为 `tools/call` 创建 task
- 客户端提供 `_meta.progressToken` 时，发送 `notifications/progress`
- 通过 `AbortSignal` 处理请求取消并返回明确的取消错误
- 长时间运行的编排工具（`start_*`）和 `sync_ui_data` 支持协作取消/进度回调

### 🔌 扩展与 UI Apps（可选）

- Trace 元数据透传：请求中的 `_meta.trace` 保留在工具响应中（`_meta.trace`）
- 可选扩展能力开关：设置 `MCP_ENABLE_EXTENSIONS_CAPABILITY=1`
- 可选 UI 工具 MCP Apps 资源输出：设置 `MCP_ENABLE_UI_APPS=1`
- UI 工具可通过 `ui://...` 和响应 `_meta.ui.resourceUri` 暴露预览资源

### 🧭 委托式编排协议（Delegated Plan）

所有 `start_*` 编排工具会在 `structuredContent.metadata.plan` 中返回**执行计划**。  
AI 需要**按步骤调用工具并落盘文件**，而不是由工具内部直接执行。

**Plan Schema（核心字段）**:
```json
{
  "mode": "delegated",
  "steps": [
    {
      "id": "spec",
      "tool": "add_feature",
      "args": { "feature_name": "user-auth", "description": "用户认证功能" },
      "outputs": ["docs/specs/user-auth/requirements.md"]
    }
  ]
}
```

**字段说明**:
- `mode`: 固定为 `delegated`
- `steps`: 执行步骤数组
- `tool`: 工具名称（如 `add_feature`）
- `action`: 无工具时的手动动作描述（如 `update_project_context`）
- `args`: 工具参数
- `outputs`: 预期产物
- `when/dependsOn/note`: 可选的条件与说明

### 🧩 结构化输出字段规范（关键字段）

编排与原子工具都会返回 `structuredContent`，常用字段约定如下：
- `summary`: 一句话摘要
- `status`: 状态（pending/success/failed/partial）
- `steps`: 执行步骤（编排工具）
- `artifacts`: 产物列表（路径 + 用途）
- `metadata.plan`: 委托式执行计划（仅 start_*）
- `specArtifacts`: 规格文档产物（start_feature）
- `estimate`: 估算结果（start_feature / estimate）

### 🧠 需求澄清模式（Requirements Loop）

当需求不够清晰时，可在 `start_feature / start_bugfix / start_ui` 中使用 `requirements_mode=loop`。  
该模式会先进行 1-2 轮结构化澄清，再进入规格/修复/UI 执行流程。

**示例：**
```json
{
  "feature_name": "user-auth",
  "description": "用户认证功能",
  "requirements_mode": "loop",
  "loop_max_rounds": 2,
  "loop_question_budget": 5
}
```

### 🧩 模板系统（普通模型友好）

`add_feature` 支持模板档位，默认 `auto` 自动选择：需求不完整时偏向 `guided`（包含更详细的填写规则与检查清单），需求较完整时选择 `strict`（结构更紧凑，适合高能力模型或归档场景）。

**示例：**
```json
{
  "description": "添加用户认证功能",
  "template_profile": "auto"
}
```

**适用工具**：
- `start_feature` 会透传 `template_profile` 给 `add_feature`
- `start_bugfix` / `start_ui` 也支持 `template_profile`，用于控制指导强度（auto/guided/strict）

**模板档位策略**：
- `guided`：需求信息少/不完整、普通模型优先
- `strict`：需求已结构化、希望指引更紧凑
- `auto`：默认推荐，自动选择 guided/strict

### 🔄 工作流编排

6 个智能编排工具，自动组合多个基础工具，一键完成复杂开发流程：
- `start_feature` - 新功能开发（需求 → 设计 → 估算）
- `start_bugfix` - Bug 修复（分析 → 修复 → 测试）
- `start_onboard` - 项目上手（生成项目上下文文档）
- `start_ui` - UI 开发（设计系统 → 组件 → 代码）
- `start_product` - 产品设计（PRD → 原型 → 设计系统 → HTML）
- `start_ralph` - Ralph Loop（循环开发直到目标完成）

### 🚀 产品设计工作流

`start_product` 是一个完整的产品设计编排工具，从需求到可交互原型：

**工作流程：**
1. **需求分析** - 生成标准 PRD 文档（产品概述、功能需求、页面清单）
2. **原型设计** - 为每个页面生成详细的原型文档
3. **设计系统** - 基于产品类型生成设计规范
4. **HTML 原型** - 生成可直接在浏览器中查看的交互原型
5. **项目上下文** - 自动更新项目文档

**结构化输出补充**：
- `start_product.structuredContent.artifacts`：产出物列表（PRD、原型、设计系统等）
- `interview.structuredContent.mode`：`usage` / `questions` / `record`

### 🎨 UI/UX Pro Max

3 个 UI/UX 工具，`start_ui` 作为统一入口：
- `start_ui` - 一键 UI 开发（支持智能模式）（编排工具）
- `ui_design_system` - 智能设计系统生成
- `ui_search` - UI/UX 数据搜索（BM25 算法）
- `sync_ui_data` - 同步最新 UI/UX 数据到本地

**注意**：`start_ui` 会自动调用 `ui_design_system` 和 `ui_search`，您无需单独调用它们。

**灵感来源：**
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) - UI/UX 设计系统理念
- [json-render](https://github.com/vercel-labs/json-render) - JSON 模板渲染引擎

**UI/PRD 流程的 Skill Bridge：**
- `start_ui` 和 `start_product` 现在在指引和 `structuredContent.metadata.skills` 中包含 Skill Bridge 段落
- 推荐 skill 调用顺序：`ui-ux-pro-max` → `interaction-design` → `frontend-design`
- 如果某些 skill 缺失，流程继续执行 MCP 主计划，并在 metadata 中标记不可用的 skill

**为什么使用 `sync_ui_data`？**

我们的 `start_ui` 工具依赖丰富的 UI/UX 数据库（颜色、图标、图表、组件、设计模式等）来生成高质量的设计系统和代码。这些数据来自 npm 包 [uipro-cli](https://www.npmjs.com/package/uipro-cli)，包含：
- 🎨 颜色方案（主流品牌色、配色方案）
- 🔣 图标库（React Icons、Heroicons 等）
- 📊 图表组件（Recharts、Chart.js 等）
- 🎯 落地页模板（SaaS、电商、政府等）
- 📐 设计规范（间距、字体、阴影等）

**数据同步策略：**
1. **内嵌数据**：构建时同步，离线可用
2. **缓存数据**：运行时更新到 `~/.mcp-probe-kit/ui-ux-data/`
3. **手动同步**：使用 `sync_ui_data` 强制更新最新数据

这确保了即使在离线环境下，`start_ui` 也能生成专业级的 UI 代码。

### 🎤 需求访谈

2 个访谈工具，在开发前澄清需求：
- `interview` - 结构化需求访谈
- `ask_user` - AI 主动提问

---

## 🧭 工具选择指南

### 何时使用编排工具 vs 单独工具？

**使用编排工具（start_*）当：**
- ✅ 需要完整的工作流程（多个步骤）
- ✅ 希望自动化执行多个任务
- ✅ 需要生成多个产物（文档、代码、测试等）

**使用单独工具当：**
- ✅ 只需要某个特定功能
- ✅ 已经有了项目上下文文档
- ✅ 需要更精细的控制

### 常见场景选择

| 场景 | 推荐工具 | 原因 |
|------|---------|------|
| 开发新功能（完整流程） | `start_feature` | 自动完成：规格→估算 |
| 只需要功能规格文档 | `add_feature` | 更轻量，只生成文档 |
| 修复 Bug（完整流程） | `start_bugfix` | 自动完成：分析→修复→测试 |
| 只需要 Bug 分析 | `fix_bug` | 更快速，只分析问题 |
| 生成设计系统 | `ui_design_system` | 直接生成设计规范 |
| 开发 UI 组件 | `start_ui` | 完整流程：设计→组件→代码 |
| 产品设计（从需求到原型） | `start_product` | 一键完成：PRD→原型→HTML |
| 一句话需求分析 | `init_project` | 生成完整项目规格文档 |
| 项目上手文档 | `init_project_context` | 生成技术栈/架构/规范 |

---

## 🚀 快速开始

### 方式一：npx 直接使用（推荐）

无需安装，直接使用最新版本。

#### Cursor / Cline 配置

**配置文件位置：**
- Windows: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- macOS: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"]
    }
  }
}
```

#### 记忆系统安装配置（Qdrant + Embedding）

如果你要使用 `memorize_asset`、`update_memory_asset`、`read_memory_asset`、`delete_memory_asset`、`scan_and_extract_patterns`，请按工具类型配置环境变量：

- **仅 Qdrant**（`MEMORY_QDRANT_URL`）：`read_memory_asset`、`delete_memory_asset`
- **Qdrant + embedding**（三项 `MEMORY_*` 必填）：`search_memory`、`memorize_asset`、`update_memory_asset`
- **无记忆后端**：`scan_and_extract_patterns`（本地扫描；沉淀用 `memorize_asset`）

完整写入/检索需同时配置向量数据库和 embedding 服务。

**推荐组合：Qdrant + Ollama**

```bash
docker run -d --name mcp-qdrant -p 6333:6333 qdrant/qdrant
ollama pull nomic-embed-text
```

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:6333",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "ollama",
        "MEMORY_EMBEDDING_URL": "http://127.0.0.1:11434/api/embeddings",
        "MEMORY_EMBEDDING_MODEL": "nomic-embed-text",
        "MEMORY_SEARCH_LIMIT": "3",
        "MEMORY_SUMMARY_MAX_CHARS": "280"
      }
    }
  }
}
```

**OpenAI-Compatible Embedding 配置示例：**

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:6333",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "openai-compatible",
        "MEMORY_EMBEDDING_URL": "https://your-embedding-endpoint/v1/embeddings",
        "MEMORY_EMBEDDING_API_KEY": "your-api-key",
        "MEMORY_EMBEDDING_MODEL": "text-embedding-3-small"
      }
    }
  }
}
```

**环境变量说明：**
- `MEMORY_QDRANT_URL`：Qdrant 地址，所有记忆功能基础配置
- `MEMORY_QDRANT_API_KEY`：Qdrant API Key，可选
- `MEMORY_QDRANT_COLLECTION`：集合名，默认 `mcp_probe_memory`
- `MEMORY_EMBEDDING_PROVIDER`：`ollama` 或 `openai-compatible`
- `MEMORY_EMBEDDING_URL`：embedding 接口地址
- `MEMORY_EMBEDDING_API_KEY`：embedding API Key，Ollama 场景通常留空
- `MEMORY_EMBEDDING_MODEL`：embedding 模型名，默认 `nomic-embed-text`
- `MEMORY_SEARCH_LIMIT`：默认检索条数，默认 `3`
- `MEMORY_SUMMARY_MAX_CHARS`：摘要最大字符数，默认 `280`

**行为说明：**
- 只读记忆功能只要求配置 `MEMORY_QDRANT_URL`
- 写入记忆要求同时配置 `MEMORY_QDRANT_URL`、`MEMORY_EMBEDDING_URL`、`MEMORY_EMBEDDING_MODEL`
- 首次写入会自动创建 Qdrant collection，向量维度按第一次 embedding 返回结果自动推断

#### Cursor / Cline 配置

**配置文件位置：**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"]
    }
  }
}
```

#### OpenCode 配置

**配置文件位置：**
- 项目级：`opencode.json`（项目根目录）
- 全局：`~/.config/opencode/opencode.json`

**配置内容：**
```json
{
  "mcp": {
    "mcp-probe-kit": {
      "type": "local",
      "command": ["npx", "-y", "mcp-probe-kit@latest"],
      "enabled": true
    }
  }
}
```

> **注意：** OpenCode 使用 `opencode.json`，格式与 Cursor/Claude Desktop 不同。用 `mcp` 替代 `mcpServers`，`command` 为数组，需指定 `"type": "local"`，环境变量用 `environment` 而非 `env`。详见 [OpenCode MCP 文档](https://opencode.ai/docs/mcp)。

### 方式二：全局安装

```bash
npm install -g mcp-probe-kit
```

配置文件中使用：
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit"
    }
  }
}
```

### Windows 图谱工具特别说明

适用于 `code_insight`、`start_feature`、`start_bugfix`、`init_project_context`。

- GitNexus Bridge 默认通过 `npx -y gitnexus@latest mcp` 启动。
- 在 Windows 上，首次冷启动可能需要 20 秒以上，因为 `npx` 可能会检查或下载依赖。
- GitNexus 的部分依赖使用 `tree-sitter-*` 原生模块；如果系统没有 Visual Studio Build Tools，首次安装可能失败，并出现 `gyp ERR! find VS could not find a version of Visual Studio 2017 or newer to use` 之类的错误。

Windows 环境建议：

1. 如果会经常使用图谱相关工具，先安装包含 C++ 工作负载的 Visual Studio Build Tools。
2. 如果 MCP 客户端支持 `env`，优先改为使用已安装好的本地或全局 `gitnexus` CLI。
3. 在首次启动较慢或机器较慢时，适当增大 GitNexus 的连接和调用超时。

快速安装命令（Windows）：

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

如果已经预装 `gitnexus` CLI，可参考：

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit",
      "env": {
        "MCP_GITNEXUS_COMMAND": "gitnexus",
        "MCP_GITNEXUS_ARGS": "mcp",
        "MCP_GITNEXUS_CONNECT_TIMEOUT_MS": "30000",
        "MCP_GITNEXUS_TIMEOUT_MS": "45000"
      }
    }
  }
}
```

### 重启客户端

配置完成后，**完全退出并重新打开**你的 MCP 客户端。

**👉 [详细安装指南](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html)**

---

## 💡 使用示例

### 日常开发
```bash
code_review @feature.ts    # 代码审查
gentest @feature.ts         # 生成测试
gencommit                   # 生成提交消息
```

### 新功能开发
```bash
start_feature user-auth "用户认证功能"
# 自动完成：需求分析 → 设计方案 → 工作量估算
```

### Bug 修复
```bash
start_bugfix
# 然后粘贴错误信息
# 自动完成：问题定位 → 修复方案 → 测试代码
```

### 产品设计
```bash
start_product "在线教育平台" --product_type=SaaS
# 自动完成：PRD → 原型设计 → 设计系统 → HTML 原型
```

### UI 开发
```bash
start_ui "登录页面" --mode=auto
# 自动完成：设计系统 → 组件生成 → 代码输出
```

### 项目上下文文档
```bash
# 单文件模式（默认）- 生成一个完整的 project-context.md
init_project_context

# 模块化模式 - 生成 6 个分类文档（适合大型项目）
init_project_context --mode=modular
# 生成：project-context.md（索引）+ 5 个分类文档
```

### Git 工作报告
```bash
# 生成日报
git_work_report --date 2026-02-03

# 生成周报
git_work_report --start_date 2026-02-01 --end_date 2026-02-07

# 保存到文件
git_work_report --date 2026-02-03 --output_file daily-report.md
# 自动分析 Git diff，生成简洁专业的中文工作报告
# 如果直接命令失败，会自动提供创建临时脚本的方案（执行后自动删除）
```

**👉 [更多使用示例](https://mcp-probe-kit.bytezonex.com/pages/examples.html)**

---

## ❓ 常见问题

### Q1: 工具无法使用或报错怎么办？

查看详细日志：

**Windows (PowerShell):**
```powershell
npx -y mcp-probe-kit@latest 2>&1 | Tee-Object -FilePath .\mcp-probe-kit.log
```

**macOS/Linux:**
```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: 配置后客户端无法识别工具？

1. **重启客户端**（完全退出后重新打开）
2. 检查配置文件路径是否正确
3. 确认 JSON 格式正确，没有语法错误
4. 查看客户端的开发者工具或日志中的错误信息

### Q3: 如何更新到最新版本？

**npx 方式（推荐）:**
配置中使用 `@latest` 标签，会自动使用最新版本。

**全局安装方式:**
```bash
npm update -g mcp-probe-kit
```

### Q4: 为什么 Windows 下图谱工具首次启动很慢，甚至超时？

这类问题通常影响 `code_insight`、`start_feature`、`start_bugfix`、`init_project_context`。

常见原因：

1. `npx -y gitnexus@latest mcp` 属于冷启动，可能花 20 秒以上检查或下载依赖。
2. GitNexus 依赖的 `tree-sitter-*` 原生模块在 Windows 上可能需要 Visual Studio Build Tools。

如果日志里看到：

```text
gyp ERR! find VS could not find a version of Visual Studio 2017 or newer to use
gyp ERR! find VS - missing any VC++ toolset
```

建议按下面排查：

1. 安装带 C++ 工作负载的 Visual Studio Build Tools。
2. 等依赖安装完成后重试一次。
3. 如果客户端支持 `env`，优先切换为已安装的 `gitnexus` CLI，并增大：
   `MCP_GITNEXUS_CONNECT_TIMEOUT_MS`
   `MCP_GITNEXUS_TIMEOUT_MS`

**👉 [更多常见问题](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html)**

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

**改进建议：**
- 新增实用工具
- 优化现有工具的提示词
- 改进文档和示例
- 修复 Bug

---

## 📄 License

MIT License

---

## 🔗 相关链接

- **作者**: [小墨 (Kyle)](https://www.bytezonex.com/)
- **GitHub**: [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **文档**: [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

**相关项目：**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - MCP 协议官方文档
- [GitHub Spec-Kit](https://github.com/github/spec-kit) - GitHub 规格化开发工具
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) - UI/UX 设计系统理念来源
- [json-render](https://github.com/vercel-labs/json-render) - JSON 模板渲染引擎灵感来源
- [uipro-cli](https://www.npmjs.com/package/uipro-cli) - UI/UX 数据源

---

**Made with ❤️ for AI-Powered Development**
