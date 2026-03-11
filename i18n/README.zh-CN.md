<div align="center">
<img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
<h1>知时MCP | mcp-probe-kit</h1>
<p><strong>知其境，馈其时。</strong></p>
<p><code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code></p>
</div>

---

**Talk is cheap, show me the Context.**

> 知时MCP 是专为极客打造的协议级探测与上下文补给工具箱。它不仅仅是 21 个工具的堆砌，更是一套让 AI 真正"读懂"你项目意图的感知系统。

**Languages**: [English](../README.md) | **简体中文** | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 AI 驱动的完整研发工具集 - 覆盖开发全流程

一个强大的 MCP (Model Context Protocol) 服务器，提供 **21 个工具**，覆盖从产品分析到最终发布的全流程（需求 → 设计 → 开发 → 质量 → 发布），所有工具支持**结构化输出**。

**🎉 v3.0 重大更新**：精简工具数量，专注核心竞争力，消除选择困难，让 AI 做更多原生工作

**支持所有 MCP 客户端**：Cursor、Claude Desktop、Cline、Continue 等

**协议版本**：MCP 2025-11-25 · **SDK**：@modelcontextprotocol/sdk 1.27.1

---

## 📚 完整文档

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [快速开始](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - 5分钟完成安装配置
- [所有工具](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - 21个工具完整列表
- [最佳实践](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - 完整研发流程实战指南
- [v3.0 迁移指南](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - v2.x → v3.0 升级指南

---

## ✨ 核心特性

### 📦 21 个工具

- **🔄 工作流编排** (6个) - 一键完成复杂开发流程
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 代码分析** (3个) - 代码质量与重构
  - `code_review`, `fix_bug`, `refactor`
- **📝 Git 工具** (2个) - Git 提交和工作报告
  - `gencommit`, `git_work_report`
- **⚡ 代码生成** (1个) - 测试生成
  - `gentest`
- **📦 项目管理** (7个) - 项目初始化与需求管理
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 UI/UX 工具** (3个) - 设计系统与数据同步
  - `ui_design_system`, `ui_search`, `sync_ui_data`

### 🎯 结构化输出

核心与编排工具支持**结构化输出**，返回机器可读的 JSON 数据，提高 AI 解析准确性，支持工具串联和状态追踪。

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
      "args": ["mcp-probe-kit@latest"]
    }
  }
}
```

#### Claude Desktop 配置

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
