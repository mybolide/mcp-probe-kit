# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.2.0] - Unreleased

### 🚀 开发中

> 本版本正在开发中，功能尚未最终确定

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
