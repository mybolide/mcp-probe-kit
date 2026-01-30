# MCP Probe Kit

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 AI 驱动的完整研发工具集 - 覆盖开发全流程

一个强大的 MCP (Model Context Protocol) 服务器，提供 **39 个实用工具**，覆盖代码质量、开发效率、项目管理、UI/UX 设计、产品设计全流程，所有工具都支持**结构化输出**。

**🎉 v2.3 特性**：产品设计工作流（PRD → 原型 → HTML）、结构化输出、工作流编排、UI/UX Pro Max、需求访谈

**支持所有 MCP 客户端**：Cursor、Claude Desktop、Cline、Continue 等

---

## 📚 完整文档

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [快速开始](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - 5分钟完成安装配置
- [所有工具](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - 39个工具完整列表
- [最佳实践](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - 完整研发流程实战指南
- [迁移指南](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - 版本升级指南

---

## ✨ 核心特性

### 📦 39 个实用工具

- **🔄 工作流编排** (10个) - 一键完成复杂开发流程
- **🔍 代码分析** (7个) - 代码审查、调试、性能优化
- **🌿 Git 工具** (4个) - 自动生成 commit、PR、changelog
- **✨ 生成工具** (7个) - 文档、测试、Mock 数据生成
- **📋 项目管理** (7个) - 需求分析、工作量估算、项目分析
- **🎨 UI/UX 工具** (6个) - 设计系统、组件生成、设计稿转代码
- **🚀 产品设计** (3个) - PRD、原型设计、完整产品工作流
- **🔧 其他工具** (7个) - 代码修复、格式转换、依赖检查

### 🎯 结构化输出

所有工具都支持**结构化输出**，返回机器可读的 JSON 数据，提高 AI 解析准确性，支持工具串联和状态追踪。

### 🔄 工作流编排

10 个智能编排工具，自动组合多个基础工具，一键完成复杂开发流程：
- `start_feature` - 新功能开发（需求 → 设计 → 估算）
- `start_bugfix` - Bug 修复（分析 → 修复 → 测试）
- `start_review` - 代码体检（质量 → 安全 → 性能）
- `start_ui` - UI 开发（设计系统 → 组件 → 代码）
- 更多...

### 🚀 产品设计工作流

3 个产品设计工具，从需求到可交互原型：
- `gen_prd` - 生成产品需求文档（PRD）
- `gen_prototype` - 生成原型设计文档
- `start_product` - 完整产品设计流程（PRD → 原型 → 设计系统 → HTML 原型）

**工作流程：**
1. **需求分析** - 生成标准 PRD 文档（产品概述、功能需求、页面清单）
2. **原型设计** - 为每个页面生成详细的原型文档
3. **设计系统** - 基于产品类型生成设计规范
4. **HTML 原型** - 生成可直接在浏览器中查看的交互原型
5. **项目上下文** - 自动更新项目文档

### 🎨 UI/UX Pro Max

6 个 UI/UX 工具，从设计系统到代码生成：
- `ui_design_system` - 智能设计系统生成
- `start_ui` - 一键 UI 开发（支持智能模式）
- `design2code` - 设计稿转代码
- `ui_search` - UI/UX 数据搜索（BM25 算法）
- `sync_ui_data` - 同步最新 UI/UX 数据到本地
- 更多...

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

## � 使用示例

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
