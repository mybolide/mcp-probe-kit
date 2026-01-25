# MCP Probe Kit

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 AI 开发增强工具集 - 让 AI 更懂你的开发流程

一个强大的 MCP (Model Context Protocol) 服务器，提供 **49 个实用工具**（37 个基础工具 + 9 个智能编排 + 3 个 UI/UX 新增），覆盖代码质量、开发效率、项目管理、UI/UX 设计全流程。

**✨ v1.14.0 新增**: UI/UX Pro Max - 完整 UI 开发工作流，从设计系统到最终代码，支持 React、Vue、Tailwind 等多种技术栈！

**支持所有 MCP 客户端**：Cursor、Claude Desktop、Cline、Continue 等

**作者**: [小墨 (Kyle)](https://www.bytezonex.com/) | **项目**: [GitHub](https://github.com/mybolide/mcp-probe-kit) | **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)

---

## ✨ 功能特性

### 🎨 UI/UX Pro Max（6 个工具）🆕
- **`ui_design_system`** - 设计系统生成器：基于 100 条行业规则的智能推荐，自动生成完整的色彩、字体、间距、组件配置（输出 Markdown + JSON）
- **`init_component_catalog`** - 组件目录生成器：基于设计系统生成组件目录，定义可用的 UI 组件及其属性（占位符语法）
- **`render_ui`** - UI 渲染引擎：将 JSON 模板渲染为最终代码，自动应用设计规范（占位符替换）
- **`start_ui`** - 统一 UI 开发编排：一键完成整个 UI 开发流程（设计系统 → 组件目录 → 模板 → 代码）
- **`ui_search`** - UI/UX 智能搜索：BM25 算法搜索颜色、图标、图表、组件、设计模式等 24 类数据（支持 catalog/template 模式）
- **`sync_ui_data`** - 数据同步工具：从 npm 包 `uipro-cli` 自动同步最新 UI/UX 数据（来源：[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)）

**完整工作流**：
```bash
# 第1步：生成设计系统
ui_design_system --product_type="SaaS" --stack="react"

# 第2步：一键生成多个页面（自动应用设计规范）
start_ui "登录页面"
start_ui "用户列表"
start_ui "设置页面"

# 结果：所有页面样式完全统一 ✨
```

### �🎯 访谈工具（2 个工具）
- **`interview`** - 需求访谈模式：在开发前通过结构化提问澄清需求，避免理解偏差和返工
- **`ask_user`** - 通用提问工具：AI 可随时向用户提问，澄清不确定的信息

### 🔍 代码质量（8 个工具）
- **`detect_shell`** - AI 模型套壳检测
- **`code_review`** - 代码审查助手
- **`security_scan`** - 安全漏洞扫描
- **`debug`** - 智能调试助手
- **`gentest`** - 测试用例生成器
- **`refactor`** - 重构建议
- **`perf`** - 性能分析
- **`fix`** - 自动修复代码问题

### 🛠️ 开发效率（16 个工具）
- **`gencommit`** - Git 提交消息生成
- **`genapi`** - API 文档生成
- **`gendoc`** - 代码注释生成
- **`genpr`** - PR 描述生成
- **`genchangelog`** - Changelog 生成
- **`gensql`** - SQL 查询生成器
- **`genui`** - UI 组件生成器（React + Vue）
- **`gen_mock`** - Mock 数据生成器
- **`gen_skill`** - Agent Skills 文档生成器
- **`design2code`** - 设计稿转代码（图片/描述/HTML → Vue/React）
- **`explain`** - 代码解释器
- **`convert`** - 代码转换器
- **`css_order`** - CSS 属性顺序规范
- **`genreadme`** - README 生成器
- **`split`** - 文件拆分工具
- **`fix_bug`** - Bug 修复流程指南
- **`estimate`** - 工作量估算

### 📦 项目管理（8 个工具）
- **`init_setting`** - Cursor AI 配置初始化
- **`init_project`** - Spec-Driven 项目初始化
- **`check_deps`** - 依赖健康度检查
- **`resolve_conflict`** - Git 冲突解决助手
- **`analyze_project`** - 项目分析工具，帮助AI快速理解老项目
- **`init_project_context`** - 初始化项目上下文，生成技术栈和架构文档
- **`add_feature`** - 添加新功能，生成需求/设计/任务文档
- **`start_onboard`** - 快速上手项目（智能编排）

### 🚀 智能编排（9 个工具）

智能编排工具自动组合多个基础工具，一键完成复杂工作流：

- **`start_feature`** - 新功能开发：上下文 → 功能规格 → 工作量估算
- **`start_bugfix`** - Bug 修复：上下文 → 分析修复 → 测试 → 提交
- **`start_review`** - 代码体检：上下文 → 质量审查 → 安全扫描 → 性能分析
- **`start_release`** - 发布准备：上下文 → Changelog → PR 描述
- **`start_refactor`** - 代码重构：上下文 → 审查 → 重构 → 测试
- **`start_onboard`** - 快速上手：项目分析 → 生成上下文文档
- **`start_api`** - API 开发：上下文 → API 文档 → Mock 数据 → 测试
- **`start_doc`** - 文档生成：上下文 → 代码注释 → README → API 文档
- **`start_ralph`** - Ralph Loop 循环开发：生成安全模式脚本 → 多轮迭代 → 自动保护 🆕

---

## 🚀 快速开始

### 支持的 MCP 客户端

本工具支持所有实现了 MCP 协议的客户端：

| 客户端 | 配置文件位置 | 说明 |
|--------|-------------|------|
| **Cursor** | `cline_mcp_settings.json` | AI 代码编辑器 |
| **Claude Desktop** | `claude_desktop_config.json` | Anthropic 官方桌面应用 |
| **Cline** | `cline_mcp_settings.json` | VS Code 扩展 |
| **Continue** | `config.json` | VS Code/JetBrains 扩展 |
| **Zed** | `settings.json` | 现代代码编辑器 |
| **其他** | 查看对应文档 | 任何支持 MCP 的工具 |

---

### 📦 方式一：npx 直接使用（推荐）

无需安装，直接使用：

#### Cursor / Cline 配置

**配置文件位置：**

**Windows:**
```
%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
```

**macOS:**
```
~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

**Linux:**
```
~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["mcp-probe-kit@latest"],
      "env": {}
    }
  }
}
```

#### Claude Desktop 配置

**配置文件位置：**

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

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

#### Continue 配置

**配置文件位置：**
```
~/.continue/config.json
```

**配置内容：**
```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "mcp-probe-kit@latest"]
        }
      }
    ]
  }
}
```

### 📦 方式二：全局安装

```bash
# 全局安装
npm install -g mcp-probe-kit
```

#### Cursor / Cline 配置

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit"
    }
  }
}
```

#### Claude Desktop 配置

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit"
    }
  }
}
```

---

### 📦 方式三：本地项目安装

```bash
# 在项目中安装
npm install mcp-probe-kit
```

#### Cursor / Cline 配置

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "node",
      "args": ["./node_modules/mcp-probe-kit/build/index.js"]
    }
  }
}
```

#### Claude Desktop 配置

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "node",
      "args": ["./node_modules/mcp-probe-kit/build/index.js"]
    }
  }
}
```

---

### 🔧 开发模式（本地开发）

如果你在本地开发或修改工具：

#### Cursor / Cline

**Windows:**
```
%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
```

**macOS:**
```
~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
```

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "node",
      "args": ["D:/workspace/github/mcp-probe-kit/build/index.js"]
    }
  }
}
```

⚠️ **重要**：将路径修改为你的实际项目路径

#### Claude Desktop

**配置内容：**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "node",
      "args": ["/path/to/your/mcp-probe-kit/build/index.js"]
    }
  }
}
```

### 🔄 重启客户端

配置完成后，**重启你的 MCP 客户端**：
- **Cursor**: 完全退出后重新打开（不是重新加载窗口）
- **Claude Desktop**: 退出后重新打开
- **VS Code (Cline/Continue)**: 重新加载窗口（Ctrl/Cmd + Shift + P → Reload Window）

---

## 📖 工具使用指南

### 🎯 访谈工具 🆕

#### `interview` - 需求访谈模式

在开发前通过结构化访谈澄清需求，避免理解偏差和返工。

**核心理念**: 先慢下来，把问题想清楚，反而能更快地交付正确的解决方案。

**用法**：
```
interview "实现用户登录功能"
```

**访谈内容**：
- **阶段 1**: 背景理解（3个问题）- 痛点、用户、业务驱动
- **阶段 2**: 功能边界（4个问题）- 核心价值、范围、输入输出
- **阶段 3**: 技术约束（4个问题）- 技术栈、性能、兼容性、安全
- **阶段 4**: 验收标准（3个问题）- 成功标准、测试场景、效果衡量

**工作流程**：
```
1. AI: interview "登录功能"
   ↓
2. 生成 12-15 个结构化问题
   ↓
3. 用户回答所有问题
   ↓
4. AI 生成 docs/interviews/user-login-interview.md
   ↓
5. 用户选择:
   - 立即开发: start_feature --from-interview user-login
   - 生成规格: add_feature --from-interview user-login
   - 稍后开发: 访谈记录已保存，随时可用
```

**适用场景**：
- ✅ 需求不明确的新功能
- ✅ 复杂的业务功能
- ✅ 涉及多方协作的功能
- ❌ 简单的 Bug 修复
- ❌ 需求非常明确的功能

**详细文档**: 查看 [Interview 使用指南](docs/INTERVIEW_GUIDE.md)

---

#### `ask_user` - 通用提问工具

AI 可在任何时候主动向用户提问，澄清不确定的信息。

**用法**：
```
ask_user "你希望支持哪些支付方式？"
ask_user --questions ["问题1", "问题2"] --context "背景信息"
```

**功能特点**：
- 支持单个或多个问题
- 可提供选项供用户选择
- 可标注必答/可选
- 可在任何工具中使用

**使用场景**：
```
场景1: 代码审查时
AI: "发现了性能问题，但不确定优先级"
调用: ask_user "这个性能问题的优先级如何？是否需要立即优化？"

场景2: 技术方案选择
AI: "可以用两种方案，不确定你的偏好"
调用: ask_user --options ["方案A: 性能优先", "方案B: 可读性优先"]

场景3: Bug 修复时
AI: "需要确认是否向后兼容"
调用: ask_user "修复这个 Bug 是否需要保持向后兼容？"
```

---

### 🔍 代码质量工具

#### `detect_shell` - 套壳检测
检测 AI 模型是否被代理/包装，生成 JSON 指纹验证。

**用法**：`detect_shell`

---

#### `code_review` - 代码审查
全面审查代码质量、安全性、性能和最佳实践。

**用法**：`code_review` 或 `code_review @file.ts`

**审查内容**：代码坏味道、安全漏洞、性能问题、命名规范

---

#### `debug` - 调试助手
分析错误并生成调试策略和解决方案。

**用法**：`debug` 然后粘贴错误信息

**输出**：错误分类、问题定位、调试步骤、解决方案、验证清单

---

#### `gentest` - 测试生成
为代码生成完整的测试用例（支持 Jest/Vitest/Mocha）。

**用法**：`gentest @function.ts`

**生成内容**：单元测试、边界测试、异常测试、Mock 数据

---

#### `refactor` - 重构建议
分析代码并提供重构建议和实施计划。

**用法**：`refactor @messy-code.ts`

**建议内容**：识别代码坏味道、重构步骤、风险评估、预期收益

---

#### `perf` - 性能分析
分析代码性能瓶颈并提供优化建议。

**用法**：`perf @slow-function.ts`

**分析维度**：算法复杂度、内存使用、React 性能、数据库查询

---

#### `fix` - 自动修复
自动修复代码问题（Lint 错误、TypeScript 类型错误、格式化问题）。

**用法**：`fix @file.ts` 或 `fix`（修复所有文件）

**修复类型**：lint, type, format, import, unused, all（默认）

**功能**：
- Lint 错误自动修复
- TypeScript 类型错误修复
- 代码格式化
- Import 语句优化
- 移除未使用代码

---

#### `security_scan` - 安全扫描 🆕
全面扫描代码安全漏洞，检测注入、认证、加密等问题。

**用法**：`security_scan @file.ts`

**扫描类型**：
- **all**（默认）- 全面扫描
- **injection** - 注入类漏洞（SQL注入、XSS、命令注入）
- **auth** - 认证授权问题
- **crypto** - 加密安全问题
- **sensitive_data** - 敏感数据泄露

**检测内容**：
- SQL 注入、XSS、命令注入
- 硬编码密码/密钥
- 弱加密算法（MD5、SHA1）
- 不安全随机数
- 日志泄露敏感信息
- 错误信息泄露

**输出**：
- 漏洞摘要（按严重程度分类）
- 详细漏洞列表（含 CWE 编号）
- 修复建议和示例代码
- 安全最佳实践

---

### 🛠️ 开发效率工具

#### `gencommit` - 提交生成
自动分析代码变更，生成规范的 Git commit 消息（支持 emoji）。

**用法**：`gencommit`

**格式**：`<type>: <emoji> <subject>` (遵循 Conventional Commits)

**类型**：
- `fixed` 🐛 - 线上/测试缺陷修复
- `fix` 🐛 - 语义同 fixed，保持兼容
- `feat` 🎸 - 新增或迭代业务功能
- `docs` ✏️ - 文档相关更新
- `style` 💄 - UI/样式调整
- `chore` 🤖 - 构建、脚本、依赖等杂项
- `refactor` ♻️ - 重构
- `test` ✅ - 测试相关

**示例**：
```bash
feat: 🎸 添加用户登录功能

影响模块: auth
- 实现 JWT 认证机制
- 添加密码加密存储
```

---

#### `genapi` - 文档生成
为代码生成 API 文档（支持 Markdown/OpenAPI/JSDoc）。

**用法**：`genapi @api/user.ts`

**格式**：markdown（默认）, openapi, jsdoc

---

#### `gendoc` - 注释生成
为代码生成详细的 JSDoc/TSDoc 注释。

**用法**：`gendoc @function.ts`

**包含**：函数描述、参数说明、返回值、异常情况、使用示例

---

#### `genpr` - PR 生成
分析变更并生成规范的 Pull Request 描述。

**用法**：`genpr`

**包含**：变更摘要、技术细节、测试说明、注意事项、Checklist

---

#### `genchangelog` - Changelog 生成
根据 commit 历史生成 CHANGELOG.md。

**用法**：`genchangelog v1.2.0`

**格式**：Keep a Changelog 标准

---

#### `gensql` - SQL 生成器
根据自然语言描述生成 SQL 查询语句。

**用法**：`gensql` 然后描述需求（如："查询购买金额超过平均值的用户"）

**支持**：PostgreSQL, MySQL, SQLite

**功能**：
- 复杂查询生成（JOIN、子查询、窗口函数）
- 建表语句生成
- 索引优化建议
- 查询性能分析

---

#### `genui` - UI 组件生成器（React + Vue）
生成 React 或 Vue 3 UI 组件代码。

**用法**：`genui` 然后描述组件（如："创建一个带加载状态的 Button 组件"）

**支持框架**：
- **React**: Hooks、forwardRef、TypeScript
- **Vue 3**: Composition API、script setup、TypeScript
- **HTML**: 原生 JavaScript

**功能**：
- 完整的组件实现（TypeScript）
- Tailwind CSS / UnoCSS 样式
- 可访问性（A11y）支持
- Props/Emits 类型定义
- 使用示例和最佳实践
- 组件库推荐（shadcn/ui、Element Plus 等）

---

#### `explain` - 代码解释器
详细解释代码逻辑和原理，帮助理解复杂代码。

**用法**：`explain @complex-code.ts`

**解释内容**：
- 整体功能概述
- 逐行代码说明
- 核心原理分析
- 设计模式识别
- 时间/空间复杂度
- 使用场景和注意事项

**适用场景**：
- 理解遗留代码
- 学习新框架/库
- 复杂算法分析
- Code Review

---

#### `convert` - 代码转换器
转换代码格式或框架。

**用法**：`convert @file.js` 然后说明转换类型（如："转为 TypeScript"）

**支持转换**：
- JavaScript → TypeScript
- Class Component → Hooks
- Promises → Async/Await
- CommonJS → ESM
- CSS → Tailwind CSS
- Vue 2 → Vue 3
- JSON → TypeScript Interface

---

#### `css_order` - CSS 顺序规范
按规则书写或重排 CSS 属性顺序。

**用法**：`css_order`

**包含**：由外向内排序逻辑、五大类属性划分、常用属性示例、快速对比表、重排要求

---

#### `genreadme` - README 生成器
根据项目代码自动生成 README.md 文档。

**用法**：`genreadme` 或提供项目信息

**风格**：standard（标准）, minimal（极简）, detailed（详细）

**包含内容**：
- 项目简介和徽章
- 安装和快速开始
- 功能特性列表
- 使用示例
- API 文档
- 配置说明
- 贡献指南

---

#### `split` - 文件拆分工具
将大文件拆分成多个小文件或小组件，提高可维护性。

**用法**：`split @LargeFile.tsx` 或提供文件内容

**拆分策略**：
- **auto**（自动）- AI 分析最佳拆分方式
- **type**（按类型）- 分离类型定义、常量、工具函数
- **function**（按功能）- 将多个独立函数拆分
- **component**（按组件）- 拆分 React/Vue 组件为子组件
- **feature**（按模块）- 拆分功能模块（如 Redux store）

**适用场景**：
- 超过 300 行的文件
- 职责过多的组件
- 工具函数大杂烩
- 难以维护的代码

**提供方案**：
- 拆分策略分析
- 建议的目录结构
- 每个新文件的内容
- 导入导出关系
- 迁移步骤

---

#### `fix_bug` - Bug 修复流程 🆕
指导完整的 Bug 修复流程，从问题定位到验证测试。

**用法**：`fix_bug` 然后提供错误信息

**参数**：
- `error_message` - 错误信息（必填）
- `stack_trace` - 堆栈跟踪（可选）
- `steps_to_reproduce` - 复现步骤（可选）
- `expected_behavior` - 期望行为（可选）
- `actual_behavior` - 实际行为（可选）

**修复流程**：
1. **问题定位** - 分析错误信息和堆栈，定位问题代码
2. **原因分析** - 使用 5 Whys 方法分析根本原因
3. **修复方案** - 设计修复方案，评估风险
4. **验证测试** - 生成测试用例，确保修复有效

**输出**：
- 问题定位结论
- 根本原因分析
- 修复方案和代码
- 测试用例
- 修复检查清单

---

#### `estimate` - 工作量估算 🆕
评估开发任务的工作量，提供故事点和时间估算。

**用法**：`estimate` 然后描述任务

**参数**：
- `task_description` - 任务描述（必填）
- `code_context` - 相关代码（可选）
- `team_size` - 团队规模（可选，默认 1）
- `experience_level` - 经验水平（可选，默认 mid）

**估算维度**：
- **代码量** - 预估新增/修改行数
- **技术难度** - 1-5 级评分
- **依赖复杂度** - 涉及的模块数
- **测试复杂度** - 需要的测试类型

**输出**：
- 故事点估算（1/2/3/5/8/13）
- 时间估算（乐观/正常/悲观）
- 复杂度分析
- 风险识别
- 任务分解建议（如超过 8 小时）

---

#### `gen_skill` - Agent Skills 文档生成器 🆕
生成符合 Agent Skills 开放标准的技能文档，供 AI 助手发现和使用。

**用法**：`gen_skill` 或 `gen_skill code_review`

**参数**：
- `scope` - 生成范围：all（全部）、basic、generation、analysis、refactoring、workflow、context、orchestration（默认 all）
- `tool_name` - 指定单个工具名称（优先级高于 scope）
- `output_dir` - 输出目录（默认 skills）
- `lang` - 文档语言：zh、en（默认 zh）

**生成内容**：
- 符合 [Agent Skills 开放标准](https://agentskills.io) 的 SKILL.md 文件
- YAML frontmatter（name、description、compatibility、metadata）
- 功能描述、使用场景、参数说明
- 调用示例和相关工具
- README 索引文件

**适用场景**：
- 🤖 让 AI 助手自动发现和使用 MCP 工具
- 📚 生成标准化的工具文档
- 🔗 兼容 Claude、Gemini、OpenCode 等平台

**示例**：
```
# 生成所有工具的技能文档
gen_skill

# 只生成分析类工具
gen_skill --scope analysis

# 生成单个工具
gen_skill --tool_name code_review

# 生成英文文档
gen_skill --lang en
```

---

#### `gen_mock` - Mock 数据生成 🆕
根据数据结构生成符合语义的模拟数据。

**用法**：`gen_mock` 然后提供数据结构

**参数**：
- `schema` - 数据结构（TypeScript interface 或 JSON Schema）
- `count` - 生成数量（默认 1，最大 1000）
- `format` - 输出格式（json/typescript/javascript/csv）
- `locale` - 语言区域（zh-CN/en-US）
- `seed` - 随机种子（可重复生成）

**智能识别**：
- 根据字段名自动识别语义（name→人名、email→邮箱）
- 支持中英文数据生成
- 自动处理关联数据

**字段识别**：
- id → UUID
- name → 人名
- email → 邮箱格式
- phone → 手机号
- address → 地址
- date → 日期时间
- price → 金额
- status → 枚举值

**输出格式**：
- JSON - 标准 JSON 数组
- TypeScript - 带类型定义
- JavaScript - CommonJS/ESM
- CSV - 表格数据（仅扁平结构）

---

#### `design2code` - 设计稿转代码 🆕
1:1 还原设计稿或将 HTML 转换为 Vue/React 项目页面。

**用法**：`design2code` 然后提供设计稿

**输入方式**：
- **图片 URL** - 设计稿图片链接（支持 jpg/png/gif/webp/svg）
- **Base64 图片** - 直接粘贴 base64 编码的图片
- **设计稿描述** - 用文字描述页面布局和功能
- **HTML 代码** - 现有的 HTML 代码

**参数**：
- `input` - 设计稿图片/描述/HTML（必填）
- `framework` - vue/react（默认 vue）
- `style_solution` - tailwind/css-modules/styled-components（默认 tailwind）
- `component_type` - page/component（默认 page）

**功能特性**：
- 🎨 **精确还原** - 1:1 还原布局、颜色、字体、间距
- 📱 **响应式设计** - 自动生成移动端/平板/桌面端适配
- 🧩 **组件化** - 智能拆分可复用组件
- 💎 **TypeScript** - 完整的类型定义
- ♿ **可访问性** - 语义化 HTML + ARIA 属性
- ⚡ **性能优化** - 图片懒加载、代码分割

**适用场景**：
- 🎨 UI 设计稿转前端代码
- 🔄 HTML 页面迁移到 Vue/React
- 📄 落地页快速开发
- 🎯 原型转生产代码

**输出内容**：
- 完整的组件代码（Vue 3 Composition API / React Hooks）
- TypeScript 类型定义
- Tailwind CSS 样式（或其他方案）
- 使用示例和说明
- 响应式断点设计
- 性能优化建议

**示例**：
```
# 图片转代码
design2code https://example.com/design.png

# 描述转代码
design2code "创建一个登录页面，包含用户名、密码输入框和登录按钮"

# HTML 转 Vue
design2code <div class="container">...</div>
```

---

### 📦 项目管理工具

#### `init_setting` - 配置初始化
在当前项目创建 Cursor AI 配置文件。

**用法**：`init_setting`

**配置**：Claude Sonnet 4.5, temperature=0, semantic 检索

---

#### `init_project` - 项目初始化
按 Spec-Driven Development 方式初始化项目。

**用法**：`init_project，需求是：创建任务管理系统` 或 `init_project @requirements.md`

**生成**：constitution.md, spec.md, plan.md, tasks.md, research.md

**参考**：[GitHub Spec-Kit](https://github.com/github/spec-kit)

---

#### `check_deps` - 依赖检查
分析项目依赖的健康度（版本、安全、体积）。

**用法**：`check_deps`

**检查**：过期依赖、安全漏洞、包体积、未使用依赖

---

#### `resolve_conflict` - Git 冲突解决
分析并帮助解决 Git 合并冲突。

**用法**：`resolve_conflict` 然后粘贴冲突内容，或直接打开冲突文件

**功能**：
- 冲突原因分析
- 双方修改意图识别
- 推荐合并方案
- 完整的解决后代码
- 冲突预防建议

**适用场景**：
- Feature 分支合并
- Rebase 冲突
- Cherry-pick 冲突

---

#### `analyze_project` - 项目分析工具
深度分析项目结构、代码质量和架构，帮助AI快速理解老项目。

**用法**：`analyze_project` 或 `analyze_project @project-path`

**参数**：
- `project_path` - 项目路径（默认当前目录）
- `max_depth` - 目录树最大深度（默认 5）
- `include_content` - 是否包含文件内容（默认 true）

**分析内容**：
- **项目概览**：项目类型、技术栈、框架、语言、包管理器
- **目录结构**：清晰的目录树展示
- **关键文件**：自动识别重要配置文件并提供用途说明
- **依赖分析**：生产依赖、开发依赖统计和健康度评估
- **代码指标**：文件数量、行数统计、文件类型分布、最大文件识别
- **架构模式**：设计模式检测、入口文件识别、核心模块分析
- **智能建议**：项目复杂度评估和改进建议

**适用场景**：
- 🔍 接手老项目时快速了解项目结构
- 📊 代码审查前进行项目概览
- 🏗️ 架构分析和重构规划
- 📚 项目文档生成
- 🤖 AI助手更好地理解项目上下文

---

#### `init_project_context` - 初始化项目上下文 🆕
生成项目上下文文档，记录技术栈、架构和规范，供后续功能开发参考。

**用法**：`init_project_context`

**参数**：
- `docs_dir` - 文档目录（默认 docs）

**生成内容**：
- 项目概览（名称、版本、类型）
- 技术栈（语言、框架、构建工具）
- 项目结构（目录树、入口文件）
- 架构模式（设计模式、模块划分）
- 编码规范（ESLint、Prettier、命名规范）
- 依赖管理（主要依赖列表）
- 开发流程（常用命令）

**输出文件**：`docs/project-context.md`

**适用场景**：
- 🆕 新项目初始化后记录项目信息
- 📚 为 AI 提供项目上下文
- 🔄 功能开发前了解项目规范

---

#### `add_feature` - 添加新功能 🆕
为已有项目生成新功能的规格文档（需求、设计、任务清单）。

**用法**：`add_feature` 然后提供功能名称和描述

**参数**：
- `feature_name` - 功能名称（必填，kebab-case 格式，如 user-auth）
- `description` - 功能描述（必填）
- `docs_dir` - 文档目录（默认 docs）

**生成文件**：
- `docs/specs/{feature_name}/requirements.md` - 需求文档（EARS 格式）
- `docs/specs/{feature_name}/design.md` - 设计文档
- `docs/specs/{feature_name}/tasks.md` - 任务清单

**适用场景**：
- 🎯 规范化功能开发流程
- 📋 Spec-Driven Development
- 🤖 AI 辅助功能实现

---

### 🚀 智能编排工具

智能编排工具自动组合多个基础工具，一键完成复杂工作流。所有编排工具都会自动检查并生成项目上下文。

#### `start_feature` - 新功能开发 🆕
一键完成新功能开发的完整流程。

**用法**：`start_feature user-auth "用户登录认证功能"`

**参数**：
- `feature_name` - 功能名称（必填）
- `description` - 功能描述（必填）
- `docs_dir` - 文档目录（可选）

**编排流程**：
```
检查/生成项目上下文
    ↓
调用 add_feature 生成功能规格
    ↓
调用 estimate 进行工作量估算
    ↓
输出完整报告
```

**输出**：
- 完整的功能规格文档（需求/设计/任务）
- 工作量估算（故事点 + 时间）
- 风险识别
- 下一步建议

---

#### `start_bugfix` - Bug 修复 🆕
一键完成 Bug 修复的完整流程。

**用法**：`start_bugfix` 然后提供错误信息

**参数**：
- `error_message` - 错误信息（必填）
- `stack_trace` - 堆栈跟踪（可选）

**编排流程**：
```
检查/生成项目上下文
    ↓
调用 fix_bug 分析修复
    ↓
调用 gentest 生成测试
    ↓
输出完整报告
```

**输出**：
- Bug 原因分析
- 修复方案和代码
- 回归测试代码

---

#### `start_review` - 代码体检 🆕
一键完成代码全面体检。

**用法**：`start_review @file.ts`

**参数**：
- `code` - 需要审查的代码（必填）
- `language` - 编程语言（可选）

**编排流程**：
```
检查/生成项目上下文
    ↓
调用 code_review 质量审查
    ↓
调用 security_scan 安全扫描
    ↓
调用 perf 性能分析
    ↓
生成综合报告
```

**输出**：
- 代码质量评分
- 安全漏洞报告
- 性能优化建议
- 综合修复优先级

---

#### `start_release` - 发布准备 🆕
一键完成版本发布准备。

**用法**：`start_release v1.2.0`

**参数**：
- `version` - 版本号（必填，如 v1.2.0）
- `from_tag` - 起始 tag（可选）
- `branch` - 分支名称（可选）

**编排流程**：
```
检查/生成项目上下文
    ↓
调用 genchangelog 生成变更日志
    ↓
调用 genpr 生成 PR 描述
    ↓
输出发布清单
```

**输出**：
- CHANGELOG.md 内容
- PR 描述
- 发布检查清单

---

#### `start_refactor` - 代码重构 🆕
一键完成代码重构流程。

**用法**：`start_refactor @legacy-code.ts`

**参数**：
- `code` - 需要重构的代码（必填）
- `goal` - 重构目标（可选）

**编排流程**：
```
检查/生成项目上下文
    ↓
调用 code_review 发现问题
    ↓
调用 refactor 生成重构方案
    ↓
调用 gentest 生成保护测试
    ↓
输出重构报告
```

**输出**：
- 问题清单
- 重构前后对比
- 改进说明
- 测试代码

---

#### `start_onboard` - 快速上手 🆕
一键快速了解项目。

**用法**：`start_onboard`

**参数**：
- `project_path` - 项目路径（可选）
- `docs_dir` - 文档目录（可选）

**编排流程**：
```
调用 analyze_project 分析项目
    ↓
调用 init_project_context 生成上下文
    ↓
输出项目概览
```

**输出**：
- 项目概览（类型、技术栈）
- 项目结构
- 核心文件说明
- 快速开始指南
- 项目上下文文档

---

#### `start_api` - API 开发 🆕
一键完成 API 开发资料生成。

**用法**：`start_api @api/user.ts`

**参数**：
- `code` - API 代码（必填）
- `language` - 编程语言（可选）
- `format` - 文档格式（可选）

**编排流程**：
```
检查/生成项目上下文
    ↓
调用 genapi 生成 API 文档
    ↓
调用 gen_mock 生成 Mock 数据
    ↓
调用 gentest 生成 API 测试
    ↓
输出完整资料
```

**输出**：
- API 文档
- Mock 数据
- 测试代码
- 使用建议

---

#### `start_doc` - 文档生成 🆕
一键生成完整的项目文档。

**用法**：`start_doc @src/`

**参数**：
- `code` - 代码或项目信息（必填）
- `style` - 注释风格（可选）
- `lang` - 语言（可选）

**编排流程**：
```
检查/生成项目上下文
    ↓
调用 gendoc 生成代码注释
    ↓
调用 genreadme 生成 README
    ↓
调用 genapi 生成 API 文档
    ↓
输出文档清单
```

**输出**：
- 带注释的代码
- README.md
- API 文档
- 文档清单

---

---

## 📚 文档

- **[如何让 AI 正确调用工具](docs/HOW_TO_TRIGGER.md)** ⭐ 推荐阅读 - 实用的对话技巧
- **[最佳实践](docs/BEST_PRACTICES.md)** - 完整的工具调用指南和使用技巧
- **[工具列表](#功能特性)** - 所有工具的详细说明
- **[常见问题](#常见问题)** - FAQ

---

## 🎯 使用场景示例

### 🎤 Interview 模式（推荐）🆕

#### 场景 1: 需求不明确时
```
用户: "我想做登录功能"
  ↓
AI: interview "登录功能"
  ↓
生成 12-15 个结构化问题
  ↓
用户: 回答所有问题
  ↓
AI: 生成 docs/interviews/user-login-interview.md
  ↓
用户: "开始开发"
  ↓
AI: start_feature --from-interview user-login
  ↓
生成完整的功能规格文档 + 工作量估算
```

#### 场景 2: 分步进行
```
第1天:
用户: "我想做登录功能"
AI: interview "登录功能"
用户: [回答问题]
AI: 生成访谈记录

第3天:
用户: "开始做登录功能"
AI: start_feature --from-interview user-login
AI: 读取之前的访谈，生成规格文档
```

#### 场景 3: AI 主动提问
```
用户: "优化这段代码"
AI: 发现不确定因素
AI: ask_user "优化目标是性能还是可读性？"
用户: "性能"
AI: 继续优化
```

---

### 📝 日常开发流程
```
1. code_review @feature.ts     # 代码提交前审查
2. gentest @feature.ts          # 生成测试用例
3. genapi @api/user.ts          # 生成 API 文档
4. gencommit                    # 提交代码
```

### 🐛 调试流程
```
1. debug                        # 分析错误
2. refactor @buggy-code.ts      # 重构建议
3. gentest @fixed-code.ts       # 补充测试
4. gencommit                    # 提交修复
```

### 🚀 新项目启动
```
1. init_project @requirements.md  # 初始化项目结构
2. init_setting                   # 配置 AI
3. check_deps                     # 检查依赖健康度
4. 开始开发...
```

### 🔍 接手老项目
```
1. analyze_project                # 深度分析项目结构
2. init_project_context           # 生成项目上下文文档
3. check_deps                     # 检查依赖健康度
4. code_review                    # 代码质量审查
5. 开始维护和开发...
```

### 🎯 添加新功能（两种方式）

#### 方式 1: Interview 模式（需求不明确时）🆕
```
1. interview "用户登录认证功能"  # 访谈澄清需求
2. 回答 12-15 个问题
3. start_feature --from-interview user-auth  # 基于访谈生成规格
4. 根据 tasks.md 逐步实现
5. gentest @feature.ts            # 生成测试
6. gencommit                      # 提交代码
```

#### 方式 2: 直接开发（需求明确时）
```
1. init_project_context           # 确保项目上下文存在
2. add_feature user-auth "用户登录认证功能"  # 生成功能规格
3. 根据 tasks.md 逐步实现
4. gentest @feature.ts            # 生成测试
5. gencommit                      # 提交代码
```

### 📦 版本发布
```
1. code_review                  # 全面代码审查
2. genchangelog v1.2.0          # 生成 Changelog
3. genpr                        # 生成 PR 描述
4. 发布版本
```

### 🔍 性能优化
```
1. perf @slow-function.ts       # 性能分析
2. refactor @slow-function.ts   # 重构优化
3. gentest @optimized.ts        # 测试验证
4. gencommit                    # 提交优化
```

### 🚀 使用智能编排（推荐）

#### 新功能开发
```
start_feature user-auth "用户登录认证功能"
# 自动完成：检查上下文 → 生成规格 → 工作量估算
```

#### Bug 修复
```
start_bugfix
# 然后粘贴错误信息
# 自动完成：分析 → 修复 → 测试 → 提交消息
```

#### 代码体检
```
start_review @feature.ts
# 自动完成：质量审查 → 安全扫描 → 性能分析
```

#### 快速上手项目
```
start_onboard
# 自动完成：项目分析 → 生成上下文文档
```

#### API 开发
```
start_api @api/user.ts
# 自动完成：API 文档 → Mock 数据 → 测试代码
```

#### 发布准备
```
start_release v1.2.0
# 自动完成：Changelog → PR 描述 → 发布清单
```

---

## 🛠️ 开发指南

### 项目结构
```
mcp-probe-kit/
├── src/
│   ├── index.ts              # MCP 服务器主入口
│   └── tools/                # 工具实现（38 个）
│       ├── index.ts             # 工具导出
│       ├── detect_shell.ts      # 套壳检测
│       ├── code_review.ts       # 代码审查
│       ├── security_scan.ts     # 安全扫描 🆕
│       ├── debug.ts             # 调试助手
│       ├── gentest.ts           # 测试生成
│       ├── refactor.ts          # 重构建议
│       ├── perf.ts              # 性能分析
│       ├── fix.ts               # 自动修复
│       ├── gencommit.ts         # 提交生成
│       ├── genapi.ts            # 文档生成
│       ├── gendoc.ts            # 注释生成
│       ├── genpr.ts             # PR 生成
│       ├── genchangelog.ts      # Changelog 生成
│       ├── gensql.ts             # SQL 生成器
│       ├── genui.ts             # UI 组件生成器
│       ├── gen_mock.ts          # Mock 数据生成 🆕
│       ├── design2code.ts       # 设计稿转代码 🆕
│       ├── explain.ts           # 代码解释器
│       ├── convert.ts           # 代码转换器
│       ├── css_order.ts         # CSS 顺序规范
│       ├── genreadme.ts         # README 生成器
│       ├── split.ts             # 文件拆分工具
│       ├── fix_bug.ts           # Bug 修复流程 🆕
│       ├── estimate.ts          # 工作量估算 🆕
│       ├── init_setting.ts      # 配置初始化
│       ├── init_project.ts      # 项目初始化
│       ├── check_deps.ts        # 依赖检查
│       ├── resolve_conflict.ts  # Git 冲突解决
│       ├── analyze_project.ts   # 项目分析
│       ├── init_project_context.ts  # 项目上下文初始化
│       ├── add_feature.ts       # 添加新功能
│       ├── start_feature.ts     # 智能编排：新功能开发 🆕
│       ├── start_bugfix.ts      # 智能编排：Bug 修复 🆕
│       ├── start_review.ts      # 智能编排：代码体检 🆕
│       ├── start_release.ts     # 智能编排：发布准备 🆕
│       ├── start_refactor.ts    # 智能编排：代码重构 🆕
│       ├── start_onboard.ts     # 智能编排：快速上手 🆕
│       ├── start_api.ts         # 智能编排：API 开发 🆕
│       └── start_doc.ts         # 智能编排：文档生成 🆕
├── build/                    # 编译输出
├── package.json
├── tsconfig.json
└── README.md
```

### 添加新工具

1. **创建工具文件**：`src/tools/your_tool.ts`
```typescript
export async function yourTool(args: any) {
  try {
    const message = `你的指令内容...`;
    return {
      content: [{ type: "text", text: message }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `❌ 错误: ${error}` }],
      isError: true,
    };
  }
}
```

2. **导出工具**：在 `src/tools/index.ts` 中添加
```typescript
export { yourTool } from "./your_tool.js";
```

3. **注册工具**：在 `src/index.ts` 中添加工具定义和处理

4. **重新构建**：
```bash
npm run build
```

### 开发命令

```bash
# 安装依赖
npm install

# 编译
npm run build

# 监听模式（开发时使用）
npm run watch

# 测试服务器
npm run dev
```

---

## 🔧 配置说明

### MCP 服务器配置

配置文件位置（根据你的 MCP 客户端）：
- **Cursor**: `cline_mcp_settings.json`
- **Claude Desktop**: `claude_desktop_config.json`

### 工具参数说明

所有工具的参数都是**可选的**，AI 会自动推断。常用参数：

| 工具 | 参数 | 说明 |
|------|------|------|
| detect_shell | nonce | 自定义 nonce 字符串 |
| code_review | focus | quality/security/performance/all |
| gentest | framework | jest/vitest/mocha |
| genapi | format | markdown/openapi/jsdoc |
| gendoc | style, lang | jsdoc/tsdoc, zh/en |
| genchangelog | version | 版本号（如 v1.2.0） |
| init_project | input | 项目需求描述 |
| perf | type | algorithm/memory/react/database |

---

## ❓ 常见问题

### Q1: 工具无法使用或报错怎么办？

如果遇到安装或运行问题，可以通过以下方式输出详细日志进行排查：

**Windows (PowerShell):**
```powershell
npx -y mcp-probe-kit@latest 2>&1 | Tee-Object -FilePath .\mcp-probe-kit.log
```

**macOS/Linux:**
```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

这会将错误信息保存到 `mcp-probe-kit.log` 文件中，方便排查问题或提交 Issue。

### Q2: 配置后客户端无法识别工具？

1. **重启客户端**（完全退出后重新打开）
2. 检查配置文件路径是否正确：
   - **Cursor/Cline**: 查看上方配置路径
   - **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
   - **Continue**: `~/.continue/config.json`
3. 确认 JSON 格式正确，没有语法错误
4. 查看客户端的开发者工具或日志中的错误信息

### Q3: npx 方式每次都很慢？

建议全局安装以提升速度：
```bash
npm install -g mcp-probe-kit
```

然后修改配置为：
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit"
    }
  }
}
```

### Q4: 工具生成的内容不符合预期？

所有工具都是**指令生成器**，生成的是给 AI 的指令：
- AI 会根据指令理解你的需求
- 可以在对话中进一步说明具体要求
- 例如："用 React Hooks 实现"、"添加 TypeScript 类型"等

### Q5: 如何更新到最新版本？

**npx 方式（推荐）:**
配置中使用 `@latest` 标签，会自动使用最新版本：
```json
"args": ["mcp-probe-kit@latest"]
```

**全局安装方式:**
```bash
npm update -g mcp-probe-kit
```

**查看当前版本:**
```bash
npm list -g mcp-probe-kit
```

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

**改进建议：**
- 新增实用工具
- 优化现有工具的提示词
- 改进文档和示例
- 修复 Bug

**开发规范：**
- 遵循 TypeScript 规范
- 工具命名简洁（建议 10 字符以内）
- 提供清晰的使用说明和示例
- 保持"指令生成器"模式（不直接操作文件系统）

---

## 📄 License

MIT License

---

## 🔗 相关链接

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [OpenAPI Specification](https://swagger.io/specification/)

---

## 💡 设计理念

### 指令生成器模式

所有工具都采用**指令生成器模式**：
- 工具不直接操作文件系统或执行命令
- 而是生成清晰的指令告诉 AI 需要做什么
- AI 理解指令后，使用 Cursor 的能力完成实际操作

**优势：**
- ✅ 代码简洁，易于维护
- ✅ AI 可以智能处理边界情况
- ✅ 用户可见操作过程，更透明
- ✅ 灵活性强，AI 可以根据实际情况调整

### 为什么叫 Probe Kit？

- **Probe（探针）**：探测代码质量、性能瓶颈、依赖健康度
- **Kit（工具集）**：24 个工具覆盖开发全流程

### 工具分类

```
代码质量 (8)
├── detect_shell     套壳检测
├── code_review      代码审查
├── security_scan    安全扫描 🆕
├── debug            调试助手
├── gentest          测试生成
├── refactor         重构建议
├── perf             性能分析
└── fix              自动修复

开发效率 (15)
├── gencommit        提交生成
├── genapi           文档生成
├── gendoc           注释生成
├── genpr            PR 生成
├── genchangelog     Changelog 生成
├── gensql           SQL 生成器
├── genui            UI 组件生成器
├── gen_mock         Mock 数据生成 🆕
├── design2code      设计稿转代码 🆕
├── explain          代码解释器
├── convert          代码转换器
├── css_order        CSS 顺序规范
├── genreadme        README 生成器
├── split            文件拆分工具
├── fix_bug          Bug 修复流程 🆕
└── estimate         工作量估算 🆕

项目管理 (8)
├── init_setting         配置初始化
├── init_project         项目初始化
├── check_deps           依赖检查
├── resolve_conflict     Git 冲突解决
├── analyze_project      项目分析工具
├── init_project_context 项目上下文初始化
├── add_feature          添加新功能
└── start_onboard        快速上手（编排）🆕

智能编排 (8)
├── start_feature    新功能开发 🆕
├── start_bugfix     Bug 修复 🆕
├── start_review     代码体检 🆕
├── start_release    发布准备 🆕
├── start_refactor   代码重构 🆕
├── start_onboard    快速上手 🆕
├── start_api        API 开发 🆕
└── start_doc        文档生成 🆕
```

---

## 👨‍💻 作者

**小墨 (Kyle)**

- 🌐 Website: [bytezonex.com](https://www.bytezonex.com/)
- 💼 专注于 AI 辅助开发工具

---

**Made with ❤️ for Cursor Users**
