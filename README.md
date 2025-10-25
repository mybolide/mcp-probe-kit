# MCP Probe Kit

> 🚀 Cursor 开发增强工具集 - 让 AI 更懂你的开发流程

一个强大的 MCP (Model Context Protocol) 服务器，提供 **22 个实用工具**，覆盖代码质量、开发效率、项目管理全流程。

**作者**: [小墨 (Kyle)](https://www.bytezonex.com/) | **项目**: [GitHub](https://github.com/mybolide/mcp-probe-kit)

---

## ✨ 功能特性

### 🔍 代码质量（7 个工具）
- **`detect_shell`** - AI 模型套壳检测
- **`code_review`** - 代码审查助手
- **`debug`** - 智能调试助手
- **`gentest`** - 测试用例生成器
- **`refactor`** - 重构建议
- **`perf`** - 性能分析
- **`fix`** - 自动修复代码问题 🆕

### 🛠️ 开发效率（11 个工具）
- **`gencommit`** - Git 提交消息生成
- **`genapi`** - API 文档生成
- **`gendoc`** - 代码注释生成
- **`genpr`** - PR 描述生成
- **`genchangelog`** - Changelog 生成
- **`gensql`** - SQL 查询生成器 🆕
- **`genui`** - UI 组件生成器（React + Vue） 🆕
- **`explain`** - 代码解释器 🆕
- **`convert`** - 代码转换器 🆕
- **`genreadme`** - README 生成器 🆕
- **`split`** - 文件拆分工具 🆕

### 📦 项目管理（4 个工具）
- **`init_setting`** - Cursor AI 配置初始化
- **`init_project`** - Spec-Driven 项目初始化
- **`check_deps`** - 依赖健康度检查
- **`resolve_conflict`** - Git 冲突解决助手 🆕

---

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install && npm run build
```

### 2. 配置 Cursor

将服务器添加到 Cursor 的 MCP 配置文件：

**Windows:**
```
%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
```

**macOS/Linux:**
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

### 3. 重启 Cursor

完全退出 Cursor 再重新打开（不是重新加载窗口）

---

## 📖 工具使用指南

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

#### `fix` - 自动修复 🆕
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

### 🛠️ 开发效率工具

#### `gencommit` - 提交生成
自动分析代码变更，生成规范的 Git commit 消息。

**用法**：`gencommit`

**格式**：`<type>(<scope>): <subject>` (遵循 Conventional Commits)

**类型**：feat, fix, docs, style, refactor, test, chore

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

#### `gensql` - SQL 生成器 🆕
根据自然语言描述生成 SQL 查询语句。

**用法**：`gensql` 然后描述需求（如："查询购买金额超过平均值的用户"）

**支持**：PostgreSQL, MySQL, SQLite

**功能**：
- 复杂查询生成（JOIN、子查询、窗口函数）
- 建表语句生成
- 索引优化建议
- 查询性能分析

---

#### `genui` - UI 组件生成器（React + Vue） 🆕
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

#### `explain` - 代码解释器 🆕
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

#### `convert` - 代码转换器 🆕
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

#### `genreadme` - README 生成器 🆕
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

#### `split` - 文件拆分工具 🆕
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

#### `resolve_conflict` - Git 冲突解决 🆕
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

## 🎯 使用场景示例

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

---

## 🛠️ 开发指南

### 项目结构
```
mcp-probe-kit/
├── src/
│   ├── index.ts              # MCP 服务器主入口
│   └── tools/                # 工具实现（14 个）
│       ├── index.ts          # 工具导出
│       ├── detect_shell.ts   # 套壳检测
│       ├── code_review.ts    # 代码审查
│       ├── debug.ts          # 调试助手
│       ├── gentest.ts        # 测试生成
│       ├── refactor.ts       # 重构建议
│       ├── perf.ts           # 性能分析
│       ├── gencommit.ts      # 提交生成
│       ├── genapi.ts         # 文档生成
│       ├── gendoc.ts         # 注释生成
│       ├── genpr.ts          # PR 生成
│       ├── genchangelog.ts   # Changelog 生成
│       ├── init_setting.ts   # 配置初始化
│       ├── init_project.ts   # 项目初始化
│       └── check_deps.ts     # 依赖检查
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
- **Kit（工具集）**：14 个工具覆盖开发全流程

### 工具分类

```
代码质量 (6)
├── detect_shell  套壳检测
├── code_review   代码审查
├── debug         调试助手
├── gentest       测试生成
├── refactor      重构建议
└── perf          性能分析

开发效率 (5)
├── gencommit     提交生成
├── genapi        文档生成
├── gendoc        注释生成
├── genpr         PR 生成
└── genchangelog  Changelog 生成

项目管理 (3)
├── init_setting  配置初始化
├── init_project  项目初始化
└── check_deps    依赖检查
```

---

## 👨‍💻 作者

**小墨 (Kyle)**

- 🌐 Website: [bytezonex.com](https://www.bytezonex.com/)
- 💼 专注于 AI 辅助开发工具

---

**Made with ❤️ for Cursor Users**
