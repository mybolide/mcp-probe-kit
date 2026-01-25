# MCP Probe Kit 工具使用手册

> **版本**: v1.15.0 | **工具总数**: 49 个（37 个基础工具 + 9 个智能编排 + 3 个 UI/UX 新增）

## � UI/UX Pro Max 工具 🆕

> **数据来源**: [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 项目  
> **同步方式**: 通过 npm 包 `uipro-cli` 自动同步最新数据  
> **实现方式**: Python 原版 → TypeScript 移植（功能完全一致）

### 1. ui_design_system - 设计系统生成器
**用途：** 基于 100 条行业规则的智能推荐，生成设计系统推荐和创作指导

**核心功能：**
- **智能推理引擎**：6 步推理流程（产品类型匹配 → 应用推理规则 → 多领域搜索 → 优先级选择 → 组合效果 → 生成推荐）
- **100 条行业规则**：覆盖 SaaS、电商、医疗、金融、教育等多个行业
- **完整设计系统**：色彩（11 级色阶）、字体（Sans/Serif/Mono）、间距（基于 4px）、组件样式
- **多技术栈支持**：React、Vue、Next.js、Tailwind、Svelte、Astro 等
- **双格式输出**：ASCII Box 推荐 + JSON 配置数据
- **AI 驱动创作**：提供创作指导，AI 根据推荐自由创作文档 ✨

**提问示例：**
- "帮我生成一个 React 设计系统"
- "为我的 Next.js 项目生成 Tailwind 配置"
- "生成一个蓝色主题的设计系统"

**参数说明：**
- `product_type`: 产品类型（推荐）- SaaS/E-commerce/Healthcare/Fintech 等
- `stack`: 技术栈（可选）- react/vue/nextjs/tailwind/svelte/astro
- `color_scheme`: 色彩方案（可选）- light/dark/auto
- `primary_color`: 主色调（可选）- 十六进制颜色值
- `typography`: 字体方案（可选）- modern/classic/minimal
- `spacing`: 间距系统（可选）- compact/normal/relaxed
- `border_radius`: 圆角风格（可选）- none/small/medium/large

**输出内容：**
- **ASCII Box 推荐**：核心设计推荐（颜色、字体、间距等）
- **JSON 配置数据**：精确的设计规范数值
- **文件索引**：需要创建的文件列表（按顺序）
- **创作指导**：每个文档应包含的主题和提示

**工作流程：**
1. 工具返回设计推荐和创作指导
2. AI 根据指导创建文档内容
3. 生成文档：设计原则、交互规范、布局规范、技术配置

**注意：**
- 工具不再自动生成完整文档内容
- AI 会根据推荐和指导自由创作
- 这样可以根据具体情况调整文档内容和结构

**使用示例：**
```
你: "我要做一个 React 项目，帮我生成一套蓝色主题的设计系统"

AI 调用: ui_design_system
参数: {
  product_type: "SaaS",
  stack: "react",
  primary_color: "#3b82f6"
}

返回: 
✅ 设计推荐和创作指导
  - ASCII Box 推荐（核心设计）
  - JSON 配置数据（精确数值）
  - 文件索引（要创建的文件）
  - 创作指导（每个文档的主题）

AI 根据指导创建文档:
  ├─ docs/design-system.md（主文档）
  ├─ docs/design-system.json（JSON 配置）
  └─ docs/design-guidelines/（详细规范）
      ├─ 01-principles.md（设计原则）
      ├─ 02-interaction.md（交互规范）
      ├─ 03-layout.md（布局规范）
      └─ 04-config.md（技术配置）
```

---

### 2. ui_search - UI/UX 智能搜索
**用途：** 搜索 UI 组件、颜色方案、图标、设计模式、最佳实践

**核心功能：**
- **BM25 算法**：智能相关性排序（与原版一致）
- **24 类数据**：colors、icons、charts、landing、products、typography、styles、ux-guidelines 等
- **多语言支持**：中英文搜索
- **技术栈过滤**：React、Vue、Next.js、Flutter、SwiftUI 等
- **精准匹配**：按类别和技术栈过滤

**提问示例：**
- "我需要一个 React 的主按钮组件"
- "搜索一下蓝色主题的配色方案"
- "表单验证有什么 UX 最佳实践？"
- "给我推荐一些图标"

**参数说明：**
- `query`: 搜索关键词（必填）
- `category`: 数据类别（可选）- colors/icons/charts/react/vue 等
- `stack`: 技术栈过滤（可选）
- `limit`: 返回结果数量（可选，默认 10）
- `min_score`: 最小相关性得分（可选，默认 0）

**可搜索的类别：**
- **设计元素**: colors（颜色）, icons（图标）, typography（字体）, styles（样式）
- **组件**: charts（图表）, landing（落地页）, products（产品）, web-interface（Web 界面）
- **指南**: ux-guidelines（UX 设计指南）, react-performance（React 性能）
- **技术栈**: react, vue, nextjs, nuxtjs, svelte, astro, flutter, react-native, swiftui, shadcn 等

**使用示例：**
```
你: "我需要一个 React 的主按钮组件"

AI 调用: ui_search
参数: {
  query: "button primary",
  category: "react",
  limit: 5
}

返回: 5 个按钮组件实现，包括：
- 组件代码
- Props 说明
- 使用示例
- 相关性得分
```

---

### 3. sync_ui_data - 数据同步工具
**用途：** 同步最新的 UI/UX 数据到本地缓存

**核心功能：**
- **自动检查更新**：对比本地版本与 npm registry 最新版本
- **智能同步**：仅在有新版本时下载（可强制同步）
- **数据来源**：npm 包 `uipro-cli`（该包从 [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 项目同步数据）
- **格式转换**：自动将 CSV 转换为 JSON
- **版本管理**：记录同步时间和版本号

**提问示例：**
- "检查一下 UI 数据有没有更新"
- "更新 UI/UX 数据"
- "强制同步 UI 数据"

**参数说明：**
- `force`: 是否强制同步（可选，默认 false）
- `verbose`: 是否显示详细日志（可选，默认 false）

**数据存储位置：**
- **内嵌数据**: npm 包内部 `src/resources/ui-ux-data/`（构建时同步）
- **缓存数据**: `~/.mcp-probe-kit/ui-ux-data/`（运行时更新）

**数据流程：**
```
GitHub 项目 (ui-ux-pro-max-skill)
    ↓
npm 包 (uipro-cli)
    ↓
MCP Probe Kit (构建时/运行时同步)
    ↓
本地缓存 (~/.mcp-probe-kit/ui-ux-data/)
```

**使用示例：**
```
你: "检查一下 UI 数据有没有更新"

AI 调用: sync_ui_data
参数: { force: false }

返回:
✅ UI/UX 数据已是最新版本
当前版本: 2.2.0
最新版本: 2.2.0
```

**📖 相关资源：**
- **原版项目**: [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (Python)
- **数据包**: [uipro-cli](https://www.npmjs.com/package/uipro-cli) (npm)
- **本实现**: TypeScript 移植版（功能完全一致）

---

### 4. init_component_catalog - 组件目录生成器 🆕
**用途：** 基于设计系统规范生成组件目录，定义可用的 UI 组件及其属性

**核心功能：**
- **自动读取设计规范**：从 `docs/design-system.json` 读取配置
- **占位符语法**：组件样式使用 `{colors.primary.500}` 格式
- **渲染时替换**：`render_ui` 工具会自动替换占位符为实际值
- **样式统一**：所有组件使用相同的设计规范
- **自动保存文件**：自动保存到 `docs/component-catalog.json` ✨

**提问示例：**
- "生成组件目录"
- "初始化 UI 组件库"

**参数说明：**
- 无需参数（自动读取 `docs/design-system.json`）

**前置条件：**
- 必须先运行 `ui_design_system` 生成设计系统

**生成的组件：**
- **基础组件**（7 个）：Button, Input, Card, Form, Modal, Table, Alert
- **布局组件**（3 个）：Container, Stack, Grid

**输出文件：**
- `docs/ui/component-catalog.json` - 组件目录（包含占位符）

**组件定义示例：**
```json
{
  "name": "Button",
  "description": "按钮组件",
  "props": {
    "variant": "primary | secondary | outline",
    "size": "sm | md | lg",
    "label": "string"
  },
  "baseClasses": "bg-[{colors.primary.500}] text-white hover:bg-[{colors.primary.600}]"
}
```

**使用示例：**
```
你: "生成组件目录"

AI 调用: init_component_catalog

返回: 
✅ 组件目录生成成功
文件: docs/ui/component-catalog.json
包含 10 个组件（7 个基础 + 3 个布局）
```

---

### 5. render_ui - UI 渲染引擎 🆕
**用途：** 将 JSON 模板渲染为最终代码，自动应用设计规范

**核心功能：**
- **读取三个文件**：模板 JSON、组件目录、设计规范
- **占位符替换**：`{colors.primary.500}` → `#3b82f6`
- **代码生成**：React/Vue/HTML 完整组件代码
- **样式统一**：所有组件自动应用设计规范

**提问示例：**
- "渲染这个 UI 模板"
- "把 login-form.json 转换成 React 代码"

**参数说明：**
- `template`: 模板文件路径（必填，如 `docs/ui/pages/login-form.json`）
- `framework`: 目标框架（可选，默认 react）

**占位符替换规则：**
- `{colors.primary.500}` → 从 design-system.json 读取颜色
- `{typography.fontSize.base}` → 从 design-system.json 读取字体大小
- `{spacing.scale.4}` → 从 design-system.json 读取间距
- `{borderRadius.md}` → 从 design-system.json 读取圆角
- `{shadows.md}` → 从 design-system.json 读取阴影

**使用示例：**
```
你: "把 login-form.json 转换成 React 代码"

AI 调用: render_ui
参数: {
  template: "docs/ui/pages/login-form.json",
  framework: "react"
}

返回: 完整的 React 组件代码（已应用设计规范）
```

---

### 6. start_ui - 统一 UI 开发编排 🆕
**用途：** 一键完成整个 UI 开发流程，从设计系统到最终代码

**核心功能：**
- **智能文件检查**：自动检查设计系统和组件目录是否存在，存在则跳过生成
- **简洁指导输出**：提供清晰的步骤指导（<800 tokens），AI 代理可准确执行
- **双模式支持**：manual（手动模式，提供步骤指导）和 auto（自动模式，智能推理参数）
- **安全字符串处理**：正确处理特殊字符，避免替换错误

**提问示例：**
- "生成一个登录页面"
- "我要做一个用户列表"
- "帮我生成设置页面"

**参数说明：**
- `description`: UI 需求描述（必填）
- `framework`: 目标框架（可选，默认 react）
- `template`: 模板名称（可选，自动生成）
- `mode`: 运行模式（可选，默认 manual）
  - `manual`: 提供步骤指导，AI 按步骤调用工具
  - `auto`: 智能推理产品类型和参数，自动优化执行计划

**完整工作流（manual 模式）：**
```
第1步：生成设计系统（如不存在）✅
  ├─ 检查 docs/design-system.md 是否存在
  └─ 不存在则调用 ui_design_system

第2步：生成组件目录（如不存在）🔄
  ├─ 检查 docs/component-catalog.json 是否存在
  └─ 不存在则调用 init_component_catalog

第3步：搜索 UI 模板 🔍
  ├─ 调用 ui_search --mode=template
  └─ 如果没找到，使用默认模板

第4步：渲染最终代码 🎨
  ├─ 调用 render_ui
  └─ 输出完整的组件代码
```

**使用示例（manual 模式）：**
```
你: "生成一个登录页面"

AI 调用: start_ui
参数: {
  description: "登录页面",
  framework: "react"
}

返回: 清晰的步骤指导
# 快速开始

执行以下工具：

1. 检查 `docs/design-system.md` 是否存在，不存在则调用 `ui_design_system --product_type="SaaS" --stack="react"`
2. 检查 `docs/component-catalog.json` 是否存在，不存在则调用 `init_component_catalog`
3. `ui_search --mode=template --query="登录页面"`
4. `render_ui --template="docs/ui/login-page.json" --framework="react"`

[详细步骤说明...]
```

**使用示例（auto 模式）：**
```
你: "生成一个电商商品列表页面"

AI 调用: start_ui
参数: {
  description: "电商商品列表页面",
  framework: "react",
  mode: "auto"
}

返回: 智能推理结果和优化的执行计划
# 🚀 智能 UI 开发计划

基于您的描述 "**电商商品列表页面**"，AI 引擎已为您规划了最佳开发路径。

## 🧠 智能分析结果

- **产品类型**: E-commerce
- **推荐风格**: Modern, Clean, Conversion-focused
- **关键特性**: product-grid, filters, cart-integration
- **技术栈**: react

[优化的执行步骤...]
```

**💡 使用技巧：**

**技巧 1：快速原型（manual 模式）**
```bash
# 一键生成多个页面
start_ui "登录页面"
start_ui "注册页面"
start_ui "用户列表"
start_ui "设置页面"
```
所有页面自动使用相同的设计规范！

**技巧 2：智能推理（auto 模式）**
```bash
# AI 自动推理产品类型和最佳参数
start_ui "电商商品列表" --mode=auto
start_ui "医疗预约系统" --mode=auto
start_ui "金融数据看板" --mode=auto
```
AI 引擎会根据描述自动选择最合适的设计风格和参数！

**技巧 3：修改设计规范**
1. 编辑 `docs/design-system.json`
2. 修改颜色、字体等
3. 重新运行 `start_ui`
4. 所有页面自动应用新规范

**技巧 4：保存模板**
- 生成的模板保存在 `docs/ui/pages/` 目录
- 可以复用、修改、版本控制

---

### 7. ui_search（增强版）- UI/UX 智能搜索 🆕
**用途：** 搜索 UI 组件、颜色方案、图标、设计模式、组件目录、UI 模板

**新增模式：**
- **search 模式**（默认）：搜索 UI/UX 数据库
- **catalog 模式**：查看组件目录
- **template 模式**：搜索 UI 模板

**提问示例：**
- "查看组件目录"（catalog 模式）
- "搜索登录表单模板"（template 模式）
- "我需要一个 React 的主按钮组件"（search 模式）

**参数说明：**
- `mode`: 搜索模式（可选，默认 search）
  - `search`: 搜索 UI/UX 数据
  - `catalog`: 查看组件目录
  - `template`: 搜索 UI 模板
- `query`: 搜索关键词（catalog 模式不需要）
- `category`: 数据类别（仅 search 模式）
- `stack`: 技术栈过滤（仅 search 模式）
- `limit`: 返回结果数量（默认 10）
- `min_score`: 最小相关性得分（默认 0）

**使用示例：**

**示例 1：查看组件目录**
```
你: "查看组件目录"

AI 调用: ui_search
参数: { mode: "catalog" }

返回:
📦 组件目录
共 10 个可用组件

1. Button
   描述: 按钮组件
   Props: variant, size, label
   样式: primary, secondary, outline

2. Input
   描述: 输入框组件
   Props: label, type, placeholder
   样式: default, error
...
```

**示例 2：搜索 UI 模板**
```
你: "搜索登录表单模板"

AI 调用: ui_search
参数: {
  mode: "template",
  query: "登录表单"
}

返回:
📄 UI 模板搜索结果
找到 1 个匹配模板

1. LoginForm
   文件: docs/ui/pages/login-form.json
   描述: 登录表单页面
   组件数: 5
```

**示例 3：搜索 UI/UX 数据**
```
你: "我需要一个 React 的主按钮组件"

AI 调用: ui_search
参数: {
  mode: "search",
  query: "button primary",
  category: "react",
  limit: 5
}

返回: React 按钮组件的搜索结果
```

---

## 🎨 完整 UI 开发工作流

### 工作流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    完整 UI 开发工作流                        │
└─────────────────────────────────────────────────────────────┘

第1步：生成设计系统
  ↓
  ui_design_system --product_type="SaaS" --stack="react"
  ↓
  输出: docs/design-system.md（人类阅读）
       docs/ui/design-system.json（机器读取）

第2步：初始化组件目录（可选，start_ui 会自动调用）
  ↓
  init_component_catalog
  ↓
  输出: docs/ui/component-catalog.json

第3步：生成 UI 页面（一键完成）
  ↓
  start_ui "登录页面"
  ↓
  自动执行:
    ├─ 检查设计系统 ✅
    ├─ 生成组件目录 🔄
    ├─ 生成 UI 模板 🔍
    └─ 渲染最终代码 🎨
  ↓
  输出: docs/ui/pages/login-page.json（模板）
       完整的 React 组件代码

第4步：生成更多页面
  ↓
  start_ui "用户列表"
  start_ui "设置页面"
  ↓
  所有页面自动使用相同的设计规范 ✨
```

### 工具关系图

```
基础层（Base Layer）
  ├─ ui_design_system    → 生成设计规范
  ├─ init_component_catalog → 生成组件目录
  └─ ui_search          → 搜索数据/模板/组件

渲染层（Rendering Layer）
  └─ render_ui          → JSON 模板 → 代码

编排层（Orchestration Layer）
  └─ start_ui           → 一键完成整个流程
```

### 适用场景

**场景 1：新项目启动**
```bash
# 第1步：生成设计系统
ui_design_system --product_type="SaaS" --stack="react"

# 第2步：生成多个页面
start_ui "登录页面"
start_ui "注册页面"
start_ui "用户列表"
start_ui "设置页面"

# 结果：所有页面样式完全统一 ✨
```

**场景 2：快速原型**
```bash
# 一键生成（自动检查设计系统）
start_ui "登录页面"
start_ui "数据表格"
start_ui "表单页面"
```

**场景 3：高级定制**
```bash
# 第1步：生成设计系统
ui_design_system --product_type="E-commerce" --stack="vue"

# 第2步：自定义组件目录
# 编辑 docs/component-catalog.json

# 第3步：生成页面
start_ui "商品列表" --framework=vue
```

---

## 🎯 需求访谈工具

### 1. interview - 需求访谈模式
**用途：** 在开发前通过结构化访谈澄清需求，避免理解偏差

**核心理念：** 先慢下来，把问题想清楚，反而能更快地交付正确的解决方案

**提问示例：**
- "interview 用户登录功能"
- "帮我访谈一下这个需求：商品推荐系统"
- "需求不太明确，先访谈一下"

**参数说明：**
- `description`: 功能描述（必填）
- `context`: 补充背景（可选）

**访谈内容：**
- **阶段 1**: 背景理解（3个问题）- 痛点、用户、业务驱动
- **阶段 2**: 功能边界（4个问题）- 核心价值、范围、输入输出
- **阶段 3**: 技术约束（4个问题）- 技术栈、性能、兼容性、安全
- **阶段 4**: 验收标准（3个问题）- 成功标准、测试场景、效果衡量

**工作流程：**
```
1. AI 生成 12-15 个结构化问题
2. 用户回答所有问题
3. AI 生成访谈记录 docs/interviews/{feature-name}-interview.md
4. 用户选择：
   - 立即开发: start_feature --from-interview {feature-name}
   - 生成规格: add_feature --from-interview {feature-name}
   - 稍后开发: 访谈记录已保存，随时可用
```

**适用场景：**
- ✅ 需求不明确的新功能
- ✅ 复杂的业务功能
- ✅ 涉及多方协作的功能
- ❌ 简单的 Bug 修复
- ❌ 需求非常明确的功能

---

### 2. ask_user - AI 主动提问
**用途：** AI 可在任何时候向用户提问，澄清不确定的信息

**提问示例：**
- AI 会自动调用（当遇到不确定因素时）
- 用户也可主动触发："有什么需要我确认的吗？"

**参数说明：**
- `question`: 问题内容（必填）
- `questions`: 多个问题列表（可选）
- `options`: 选项列表（可选）
- `context`: 问题背景（可选）
- `required`: 是否必答（可选）

**使用场景：**
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

## 📋 基础生成工具

### 1. gencommit - 生成 Git 提交信息
**用途：** 根据代码变更自动生成规范的 commit 消息

**提问示例：**
- "帮我生成这次改动的 commit 消息"
- "根据当前 git diff 生成 commit"
- "生成一个 feat 类型的提交信息"

**参数说明：**
- `type`: fix/feat/docs/style/chore/refactor/test
- `changes`: 代码变更内容（可选，默认使用 git diff）

---

### 2. gentest - 生成单元测试
**用途：** 为函数/类/模块生成测试代码

**提问示例：**
- "为这个函数生成单元测试：[粘贴代码]"
- "生成 Jest 测试用例"
- "帮我写这个组件的测试"

**参数说明：**
- `code`: 需要测试的代码（必填）
- `framework`: jest/vitest/mocha（可选）

---

### 3. genapi - 生成 API 文档
**用途：** 根据接口代码生成文档

**提问示例：**
- "为这个 API 生成文档：[粘贴路由代码]"
- "生成 OpenAPI 格式的接口文档"
- "帮我写这个 Controller 的 API 文档"

**参数说明：**
- `code`: API 代码（必填）
- `format`: markdown/openapi/jsdoc

---

### 4. gendoc - 生成代码注释
**用途：** 为代码补充 JSDoc/TSDoc 注释

**提问示例：**
- "为这个函数添加注释：[粘贴代码]"
- "生成 TSDoc 格式的注释"
- "补充这个类的文档注释"

**参数说明：**
- `code`: 需要注释的代码（必填）
- `style`: jsdoc/tsdoc/javadoc
- `lang`: zh/en

---

### 5. genreadme - 生成 README
**用途：** 生成项目说明文档

**提问示例：**
- "为这个项目生成 README"
- "生成详细版的 README 文档"
- "帮我写项目介绍文档"

**参数说明：**
- `project_info`: 项目信息或代码（必填）
- `style`: standard/minimal/detailed

---

### 6. genchangelog - 生成变更日志
**用途：** 根据 commit 历史生成 CHANGELOG

**提问示例：**
- "生成 v1.2.0 的 CHANGELOG"
- "从 v1.0.0 到现在的变更日志"
- "帮我整理这个版本的更新内容"

**参数说明：**
- `version`: 版本号（必填）
- `from`: 起始 tag/commit
- `to`: 结束 tag/commit

---

### 7. genpr - 生成 PR 描述
**用途：** 生成 Pull Request 说明

**提问示例：**
- "为当前分支生成 PR 描述"
- "根据 commit 历史生成 PR 说明"
- "帮我写 PR 文档"

**参数说明：**
- `branch`: 分支名称（可选）
- `commits`: commit 历史（可选）

---

### 8. gensql - 自然语言转 SQL
**用途：** 根据描述生成 SQL 语句

**提问示例：**
- "查询所有状态为已发布的商品，按创建时间倒序"
- "生成一个联表查询，关联用户和订单表"
- "写一个统计每个分类下商品数量的 SQL"

**参数说明：**
- `description`: 查询需求描述（必填）
- `dialect`: postgres/mysql/sqlite

---

### 9. genui - 生成 UI 组件
**用途：** 根据描述生成前端组件代码

**提问示例：**
- "生成一个带搜索的表格组件"
- "创建一个 Vue 的用户卡片组件"
- "帮我写一个 React 的表单组件"

**参数说明：**
- `description`: 组件功能描述（必填）
- `framework`: react/vue/html

---

### 10. gen_mock - 生成 Mock 数据
**用途：** 根据类型定义生成测试数据

**提问示例：**
- "根据这个接口生成 10 条 mock 数据：[粘贴 interface]"
- "生成用户列表的测试数据"
- "帮我造一些商品数据"

**参数说明：**
- `schema`: 数据结构定义（必填）
- `count`: 生成数量（默认 1）
- `format`: json/typescript/javascript/csv
- `locale`: zh-CN/en-US

---

### 11. gen_skill - 生成 Agent Skills 文档
**用途：** 为工具生成技能文档

**提问示例：**
- "生成所有工具的技能文档"
- "为 code_review 生成 SKILL.md"
- "导出工具使用说明"

**参数说明：**
- `scope`: all/basic/generation/analysis（可选）
- `tool_name`: 指定工具名称（可选）
- `lang`: zh/en
- `output_dir`: 输出目录（可选）

---

### 12. design2code - 设计稿转代码
**用途：** 将设计稿转换为前端代码

**提问示例：**
- "根据这个设计稿生成代码：[图片 URL]"
- "把这个 UI 转成 Vue 组件"
- "实现这个页面布局：[描述或图片]"

**参数说明：**
- `input`: 图片 URL/base64/HTML/描述（必填）
- `framework`: vue/react
- `component_type`: page/component
- `style_solution`: tailwind/css-modules/styled-components

---

## 🔍 分析诊断工具

### 1. debug - 错误调试分析
**用途：** 分析错误信息，定位问题根因

**提问示例：**
- "帮我调试这个错误：TypeError: Cannot read property 'map' of undefined at ProductList.vue:45"
- "分析这个报错：[粘贴完整错误堆栈]"
- "为什么会出现这个问题：[描述错误现象]"

**参数说明：**
- `error`: 完整错误信息（必填）
- `context`: 相关代码、复现步骤

---

### 2. code_review - 代码审查
**用途：** 审查代码质量、安全性、性能

**提问示例：**
- "审查这段代码：[粘贴代码]"
- "检查这个文件的安全问题"
- "帮我 review 这个 PR 的代码"

**参数说明：**
- `code`: 代码内容（必填）
- `focus`: quality/security/performance/all

---

### 3. security_scan - 安全扫描
**用途：** 专项安全漏洞检测

**提问示例：**
- "扫描这段代码的安全问题：[粘贴代码]"
- "检查 SQL 注入风险"
- "分析这个接口的安全隐患"

**参数说明：**
- `code`: 代码内容（必填）
- `scan_type`: all/injection/auth/crypto/sensitive_data

---

### 4. perf - 性能分析
**用途：** 分析性能瓶颈

**提问示例：**
- "分析这段代码的性能问题：[粘贴代码]"
- "检查这个循环的性能"
- "优化这个 React 组件的渲染"

**参数说明：**
- `code`: 代码内容（必填）
- `type`: algorithm/memory/react/database/all

---

### 5. check_deps - 依赖检查
**用途：** 检查依赖健康度和安全漏洞

**提问示例：**
- "检查项目依赖的安全问题"
- "分析 package.json 的依赖版本"
- "有哪些依赖需要升级"

**无需参数**

---

### 6. explain - 代码解释
**用途：** 解释代码逻辑和实现原理

**提问示例：**
- "解释这段代码的作用：[粘贴代码]"
- "这个函数是怎么工作的"
- "帮我理解这个算法"

**参数说明：**
- `code`: 代码内容（必填）
- `context`: 补充说明（可选）

---

### 7. analyze_project - 项目分析
**用途：** 分析项目结构、技术栈、架构

**提问示例：**
- "分析当前项目的结构"
- "生成项目技术栈报告"
- "帮我了解这个项目的架构"

**参数说明：**
- `project_path`: 项目路径（可选）
- `max_depth`: 目录深度（默认 5）
- `include_content`: 是否包含文件内容

---

## 🔧 重构优化工具

### 1. refactor - 重构建议
**用途：** 提供代码重构方案

**提问示例：**
- "这段代码如何重构：[粘贴代码]"
- "帮我优化这个函数的可读性"
- "提取这段重复代码"

**参数说明：**
- `code`: 代码内容（必填）
- `goal`: improve_readability/reduce_complexity/extract_function/remove_duplication

---

### 2. fix - 自动修复
**用途：** 自动修复 Lint/格式化/类型错误

**提问示例：**
- "修复这段代码的 Lint 错误：[粘贴代码]"
- "自动格式化这个文件"
- "修复 TypeScript 类型错误"

**参数说明：**
- `code`: 代码内容（必填）
- `type`: lint/type/format/import/unused/all

---

### 3. convert - 代码转换
**用途：** 转换代码格式或框架

**提问示例：**
- "把这段 JS 转成 TS：[粘贴代码]"
- "将 Vue2 代码转换为 Vue3"
- "Class 组件改成 Hooks"

**参数说明：**
- `code`: 源代码（必填）
- `from`: 源格式（js/ts/vue2/vue3/class/hooks）
- `to`: 目标格式

---

### 4. split - 文件拆分
**用途：** 拆分大文件为小模块

**提问示例：**
- "拆分这个大文件：[粘贴代码]"
- "按功能拆分这个组件"
- "帮我模块化这段代码"

**参数说明：**
- `file`: 文件内容或路径（必填）
- `strategy`: auto/type/function/component/feature

---

### 5. resolve_conflict - 解决冲突
**用途：** 分析并解决 Git 合并冲突

**提问示例：**
- "帮我解决这个合并冲突：[粘贴冲突内容]"
- "分析这个 conflict 应该保留哪边"
- "合并这两个版本的代码"

**参数说明：**
- `conflicts`: 冲突文件内容（必填）

---

### 6. design2code - 设计稿转代码
**用途：** 将设计稿转换为前端代码

**提问示例：**
- "根据这个设计稿生成代码：[图片 URL]"
- "把这个 UI 转成 Vue 组件"
- "实现这个页面布局：[描述或图片]"

**参数说明：**
- `input`: 图片 URL/base64/HTML/描述（必填）
- `framework`: vue/react
- `component_type`: page/component
- `style_solution`: tailwind/css-modules/styled-components

---

## 🎯 工作流编排工具

### 1. start_feature - 新功能开发流程
**用途：** 完整的新功能开发编排

**提问示例：**
- "开始开发用户认证功能"
- "新增商品推荐模块"
- "创建订单管理功能"

**参数说明：**
- `feature_name`: 功能名称（必填）
- `description`: 功能描述（必填）
- `docs_dir`: 文档目录（可选）

**流程：** 检查上下文 → 生成规格 → 估算工作量

---

### 2. start_bugfix - Bug 修复流程
**用途：** 完整的 Bug 修复编排

**提问示例：**
- "修复这个 Bug：点击推荐按钮报错"
- "解决登录失败的问题"
- "处理这个错误：[粘贴错误信息]"

**参数说明：**
- `error_message`: 错误信息（必填）
- `stack_trace`: 堆栈跟踪（可选）

**流程：** 检查上下文 → 分析定位 → 修复方案 → 生成测试

---

### 3. start_review - 代码全面体检
**用途：** 代码审查 + 安全扫描 + 性能分析

**提问示例：**
- "全面审查这段代码：[粘贴代码]"
- "对这个文件做完整的代码体检"
- "综合分析这个模块的质量"

**参数说明：**
- `code`: 代码内容（必填）
- `language`: 编程语言（可选）

---

### 4. start_release - 发布准备流程
**用途：** 生成 Changelog + PR 描述

**提问示例：**
- "准备发布 v1.2.0"
- "生成这个版本的发布文档"
- "整理发布内容"

**参数说明：**
- `version`: 版本号（必填）
- `from_tag`: 起始 tag（可选）
- `branch`: 分支名称（可选）

---

### 5. start_refactor - 重构流程
**用途：** 审查现状 → 重构建议 → 生成测试

**提问示例：**
- "重构这段代码：[粘贴代码]"
- "优化这个模块的结构"
- "改进代码可读性"

**参数说明：**
- `code`: 代码内容（必填）
- `goal`: 重构目标（可选）

---

### 6. start_onboard - 快速上手流程
**用途：** 分析项目 → 生成上下文文档

**提问示例：**
- "帮我快速了解这个项目"
- "生成项目上手文档"
- "分析项目结构并生成说明"

**参数说明：**
- `project_path`: 项目路径（可选）
- `docs_dir`: 文档目录（可选）

---

### 7. start_api - API 开发流程
**用途：** 生成文档 → 生成 Mock → 生成测试

**提问示例：**
- "为这个 API 生成完整文档：[粘贴代码]"
- "开发这个接口的完整流程"
- "生成 API 文档和测试"

**参数说明：**
- `code`: API 代码（必填）
- `format`: markdown/openapi
- `language`: 编程语言（可选）

---

### 8. start_doc - 文档补全流程
**用途：** 注释 → README → API 文档

**提问示例：**
- "为这个项目补全所有文档"
- "生成完整的项目文档"
- "补充代码注释和说明"

**参数说明：**
- `code`: 代码或项目信息（必填）
- `lang`: zh/en
- `style`: jsdoc/tsdoc

---

### 9. start_ralph - Ralph Wiggum Loop 循环开发 🆕
**用途：** 生成 Ralph Loop 工作目录和安全模式脚本，实现循环迭代开发

**核心理念：** 通过循环喂同一个 PROMPT 让 agent 多轮迭代完成任务，同时提供多重安全保护防止无人值守时费用失控

**提问示例：**
- "启动 Ralph Loop 开发用户认证功能"
- "用 Ralph 模式修复登录 bug"
- "创建 Ralph Loop 循环开发环境"

**参数说明：**
- `goal`: 目标描述（必填）- 例如："实现用户认证功能"
- `mode`: safe（安全模式，默认）/ normal（普通模式）
- `completion_promise`: 完成条件（可选）- 默认："tests passing + requirements met"
- `test_command`: 测试命令（可选）- 默认："npm test"
- `cli_command`: CLI 命令名（可选）- 默认："claude-code"
- `max_iterations`: 最大迭代次数（可选）- safe 默认：8
- `max_minutes`: 最大运行分钟（可选）- safe 默认：25
- `confirm_every`: 确认频率（可选）- safe 默认：1（每轮确认）
- `confirm_timeout`: 确认超时秒数（可选）- safe 默认：20
- `max_same_output`: 最大重复次数（可选）- safe 默认：2
- `max_diff_lines`: 最大变更行数（可选）- safe 默认：300
- `cooldown_seconds`: 冷却时间（可选）- safe 默认：8

**生成内容：**
```
.ralph/
├── PROMPT.md              # 循环 prompt（含目标、规则、退出条件）
├── @fix_plan.md           # 任务分解清单（agent 更新）
├── PROGRESS.md            # 迭代日志（agent 更新）
├── ralph_loop_safe.sh     # 安全模式脚本（默认，推荐）
└── ralph_loop.sh          # 普通模式脚本（可选）
```

**安全保护机制（Safe Mode）：**
1. **硬上限**
   - 最大迭代次数：达到上限必停
   - 最大运行时间：达到时长必停

2. **人工确认**
   - 每轮提示确认（可配置频率）
   - 超时自动停止（默认 20 秒）
   - 非交互环境拒绝运行

3. **紧急停止**
   - 创建 `STOP` 文件立即退出
   - Ctrl+C 手动停止

4. **失控保护**
   - 输出重复检测（避免卡死循环）
   - Git diff 变更量检测（超过阈值停止）
   - 冷却时间（降低请求频率）

5. **双门控退出**
   - 必须同时满足：`COMPLETION_PROMISE_MET: true` + `EXIT_SIGNAL: true`
   - 避免误判提前退出

**使用流程：**
```bash
# 1. 生成 Ralph Loop 环境
claude-code "使用 start_ralph 启动开发，goal='实现用户认证功能'"

# 2. 创建 .ralph 目录并复制文件
mkdir -p .ralph
cd .ralph
# 复制生成的 PROMPT.md、@fix_plan.md、PROGRESS.md、脚本文件

# 3. 运行安全模式脚本
chmod +x ralph_loop_safe.sh
./ralph_loop_safe.sh

# 4. 监控进度
tail -f ralph.log          # 查看日志
cat PROGRESS.md            # 查看进度
cat @fix_plan.md           # 查看任务

# 5. 紧急停止（如需要）
touch STOP
```

**调整参数：**
```bash
# 增加最大迭代次数
MAX_ITERS=15 ./ralph_loop_safe.sh

# 延长运行时间
MAX_MINUTES=40 ./ralph_loop_safe.sh

# 使用不同的 CLI 命令
CLI_COMMAND='claude' ./ralph_loop_safe.sh

# 减少确认频率（每 3 轮确认一次）
CONFIRM_EVERY=3 ./ralph_loop_safe.sh
```

**与其他工具协同：**
```bash
# 推荐工作流：
# 1. 生成项目上下文
claude-code "使用 init_project_context 生成项目文档"

# 2. 生成功能规格（可选）
claude-code "使用 start_feature 生成用户认证功能规格"

# 3. 启动 Ralph Loop
claude-code "使用 start_ralph 启动开发，goal='实现 docs/specs/user-auth/ 中的功能'"

# 4. 执行循环
cd .ralph && ./ralph_loop_safe.sh
```

**适用场景：**
- ✅ 需要多轮迭代的复杂功能开发
- ✅ Bug 修复需要多次尝试
- ✅ 代码重构需要小步快跑
- ✅ 测试驱动开发（TDD）流程
- ❌ 简单的一次性任务
- ❌ 需要大量人工决策的任务

**注意事项：**
- 默认安全模式非常保守，适合首次使用
- 确保测试命令正确（首轮会自动识别）
- 在 git 仓库中使用效果最佳
- 监控 API 费用，避免超支
- 普通模式无确认，谨慎使用

---

## 🏗️ 项目管理工具

### 1. init_project - 初始化项目
**用途：** 创建项目结构和任务分解

**提问示例：**
- "初始化一个电商管理系统项目"
- "创建博客系统的项目结构"
- "搭建新项目框架"

**参数说明：**
- `project_name`: 项目名称（可选）
- `input`: 项目需求描述（可选）

---

### 2. init_project_context - 生成项目上下文
**用途：** 生成技术栈/架构/编码规范文档

**提问示例：**
- "生成项目上下文文档"
- "创建开发规范文档"
- "整理项目技术文档"

**参数说明：**
- `docs_dir`: 文档目录（可选）

---

### 3. add_feature - 添加功能规格
**用途：** 生成功能需求/设计/任务清单

**提问示例：**
- "添加用户权限管理功能"
- "新增商品评论模块"
- "创建数据导出功能"

**参数说明：**
- `feature_name`: 功能名称（必填）
- `description`: 功能描述（必填）
- `docs_dir`: 文档目录（可选）

---

### 4. fix_bug - Bug 修复指导
**用途：** 根因分析 + 修复方案 + 验证步骤

**提问示例：**
- "指导修复这个 Bug：[描述问题]"
- "提供 Bug 修复方案"
- "如何解决这个问题"

**参数说明：**
- `error_message`: 错误信息（必填）
- `stack_trace`: 堆栈跟踪（可选）
- `expected_behavior`: 期望行为（可选）
- `actual_behavior`: 实际行为（可选）

---

### 5. estimate - 工作量估算
**用途：** 估算开发时间和风险

**提问示例：**
- "估算这个功能的开发时间：[描述需求]"
- "评估工作量：实现用户登录模块"
- "这个任务需要多久"

**参数说明：**
- `task_description`: 任务描述（必填）
- `code_context`: 相关代码（可选）
- `experience_level`: junior/mid/senior
- `team_size`: 团队规模（可选）

---

## 🛠️ 其他工具

### 1. detect_shell - 检测 AI 环境
**用途：** 识别是否为套壳产品

**提问示例：**
- "检测当前 AI 环境"
- "分析环境指纹"

**参数说明：**
- `nonce`: 随机字符串（可选）
- `skip_network`: 是否跳过网络探测（可选）

---

### 2. init_setting - 初始化 Cursor 配置
**用途：** 写入推荐的 AI 设置

**提问示例：**
- "初始化 Cursor 配置"
- "设置推荐的 AI 参数"

**参数说明：**
- `project_path`: 项目路径（可选）

---

### 3. css_order - CSS 属性排序
**用途：** 按规范重排 CSS 属性

**提问示例：**
- "整理这段 CSS 的属性顺序"
- "规范化 CSS 代码"

**无需参数**

---

### 4. gen_skill - 生成 Agent Skills 文档
**用途：** 为工具生成技能文档

**提问示例：**
- "生成所有工具的技能文档"
- "导出工具使用说明"

**参数说明：**
- `scope`: all/basic/generation/analysis（可选）
- `tool_name`: 指定工具名称（可选）
- `lang`: zh/en
- `output_dir`: 输出目录（可选）

---

## 💡 使用技巧

### 1. Interview 模式最佳实践 🆕

**何时使用 Interview 模式：**
- ✅ 需求描述简短、不明确
- ✅ 复杂的业务功能
- ✅ 涉及多方协作的功能
- ❌ 简单的 Bug 修复
- ❌ 需求非常明确的功能

**工作流程：**
```
方式1: 立即开发
1. interview "用户登录功能"
2. 回答 12-15 个问题
3. start_feature --from-interview user-login
4. 根据 tasks.md 开始编码

方式2: 分步进行
第1天: interview "用户登录功能" → 回答问题
第3天: start_feature --from-interview user-login → 开始开发
```

---

### 2. 组合使用
- 先用 `debug` 定位问题 → 再用 `fix` 自动修复
- 先用 `analyze_project` 了解项目 → 再用 `add_feature` 添加功能
- 先用 `code_review` 审查 → 再用 `refactor` 重构

### 3. 工作流优先
- 复杂任务优先使用 `start_*` 系列工具（自动编排多个步骤）
- 简单任务使用单个工具（更快更直接）

### 4. 提供完整信息
- 粘贴完整的错误堆栈（不要截断）
- 提供相关代码上下文（不要只给一行）
- 描述清楚期望结果

### 5. 善用可选参数
- 大多数工具会自动检测（如框架、语言）
- 只在需要明确指定时才传参数

---

**打印建议：** A4 纸双面打印，建议缩放至 85% 以适应页面
