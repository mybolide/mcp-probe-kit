# MCP Probe Kit

> 🚀 Cursor 开发增强工具集 - 让 AI 更懂你的开发流程

一个强大的 MCP (Model Context Protocol) 服务器，提供 6 个实用工具，涵盖代码检测、项目初始化、提交规范、调试辅助等场景。

**作者**: [小墨](https://www.bytezonex.com/) | **项目**: [GitHub](https://github.com/yourusername/mcp-probe-kit)

---

## ✨ 功能特性

### 🔍 代码质量
- **`detect_shell`** - AI 模型套壳检测（生成 JSON 指纹验证）
- **`debug`** - 智能调试助手（错误分析 + 解决方案）
- **`genapi`** - API 文档生成器（支持 Markdown/OpenAPI）

### 🛠️ 开发效率
- **`gencommit`** - Git 提交消息生成器（自动分析变更）
- **`init_setting`** - Cursor AI 配置初始化
- **`init_project`** - Spec-Driven 项目初始化

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

### 🔍 detect_shell - 套壳检测

检测 AI 模型是否被代理/包装，生成 JSON 指纹验证模型身份。

**使用方法：**
```
detect_shell
```

**返回内容：**
- 模型身份声明（model_claim, cutoff_claim 等）
- Nonce 哈希验证（SHA256）
- JSON 纪律测试
- 拒答风格探测
- 环境探针（平台、Node 版本、代理检测）

**验证步骤：**
1. 对比 `nonce_tests.sha256_hex` 是否正确
2. 检查 `json_discipline.only_json_output` 是否为 true
3. 查看 `identity` 字段确认模型信息
4. 检查 `end_sentinel` 是否为 "##END##"

---

### ✍️ gencommit - 生成提交消息

自动分析代码变更，生成符合 Conventional Commits 规范的提交消息。

**使用方法：**
```
gencommit
```

**工作流程：**
1. 自动执行 `git status` 查看修改文件
2. 执行 `git diff` 分析具体变更
3. 识别变更类型（feat/fix/docs/style/refactor/test/chore）
4. 生成规范的 commit 消息
5. 执行 `git commit` 提交

**消息格式：**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**示例：**
```
feat(auth): 添加用户登录功能

- 实现 JWT 认证机制
- 添加密码加密存储
- 实现登录失败重试限制

Closes #123
```

**提交类型：**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档变更
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具变更

---

### 🐛 debug - 调试助手

分析错误信息，生成详细的调试策略和解决方案。

**使用方法：**
```
debug
```

然后粘贴错误信息，或者：
```
debug，错误是：TypeError: Cannot read property 'name' of undefined
```

**分析内容：**
1. **错误分类** - 确定错误类型和严重程度
2. **问题定位** - 分析堆栈跟踪，识别可能原因
3. **调试策略** - 提供优先级排序的调试步骤
4. **解决方案** - 临时方案 + 根本方案 + 预防措施
5. **验证清单** - 确保修复完整且无副作用

**常见错误类型：**
- `NullPointerException` → 空值处理
- `ReferenceError` → 变量声明和作用域
- `TypeError` → 类型转换和数据结构
- `TimeoutError` → 异步操作和网络请求
- `MemoryError` → 内存泄漏和资源释放

---

### 📖 genapi - 生成 API 文档

为代码生成详细的 API 文档，支持多种格式。

**使用方法：**
```
genapi
```

或指定代码文件：
```
genapi @api/user.ts
```

**支持格式：**
- `markdown` - Markdown 格式（默认）
- `openapi` - OpenAPI 3.0 规范
- `jsdoc` - JSDoc 注释

**文档内容：**
- API 名称和描述
- 请求参数（类型、必填、示例）
- 返回值（成功/错误响应）
- 示例代码（请求和响应）
- 注意事项（权限、速率限制等）

**示例输出：**
```markdown
## 获取用户信息

**接口地址**：`GET /api/users/:id`

**请求参数**：
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | string | 是 | 用户 ID |

**返回示例**：
{
  "code": 200,
  "data": {
    "id": "123",
    "name": "张三",
    "email": "zhangsan@example.com"
  }
}
```

---

### ⚙️ init_setting - 初始化 AI 配置

在当前项目中创建 Cursor AI 配置文件。

**使用方法：**
```
init_setting
```

**配置内容：**
```json
{
  "ai.chatModel": "claude-sonnet-4-5",
  "ai.composerModel": "claude-sonnet-4-5",
  "ai.editModel": "claude-sonnet-4-5",
  "ai.temperature": 0,
  "ai.contextEngine": "semantic",
  "ai.contextDepth": "high",
  "ai.includeCodebaseContext": true,
  "ai.contextStrategy": "balanced"
}
```

**配置说明：**
- 统一使用 Claude Sonnet 4.5（稳定性最好）
- 温度设为 0（严格模式，适合生成结构化代码）
- 语义检索 + 高精度上下文
- 代码库上下文已启用

**实验建议：**
做模型指纹实验时，建议修改：
- `ai.includeCodebaseContext`: false
- `ai.contextStrategy`: "neighboring"

---

### 📦 init_project - 初始化工程

按照 Spec-Driven Development（规范驱动开发）方式初始化项目。

**使用方法：**
```
init_project，需求是：创建一个任务管理系统
```

或引用需求文档：
```
init_project @requirements.md
```

**参考标准：**
[GitHub Spec-Kit](https://github.com/github/spec-kit)

**生成的项目结构：**
```
.
├── memory/
│   └── constitution.md    # 项目宪法（核心原则和约束）
├── specs/
│   └── 001-项目名/
│       ├── spec.md        # 功能规格说明
│       ├── plan.md        # 实现计划
│       ├── tasks.md       # 任务分解
│       └── research.md    # 技术调研
├── scripts/
│   ├── check-prerequisites.sh
│   └── setup.sh
└── templates/
    ├── spec-template.md
    ├── plan-template.md
    └── tasks-template.md
```

**工作流程：**
1. **定义宪法** - 项目核心原则、代码规范、架构约束
2. **编写规格** - 详细的功能需求、用户故事、验收标准
3. **制定计划** - 技术选型、架构设计、模块划分
4. **技术调研** - 版本兼容性、风险评估、最佳实践
5. **任务分解** - 可执行的任务列表，包含依赖关系和并行标记

**任务格式示例：**
```markdown
## 阶段 1：项目初始化
- [ ] Task 1.1: 搭建项目骨架 (文件: ./setup.sh)
- [ ] Task 1.2: [P] 初始化数据库 (文件: ./database/schema.sql)
- [ ] Task 1.3: [P] 配置 CI/CD (文件: .github/workflows/)
  依赖: Task 1.1
```

**标记说明：**
- `[P]`: 可以并行执行的任务
- `依赖`: 必须在指定任务完成后才能开始

---

## 🎯 使用场景示例

### 日常开发流程

```
# 1. 初始化项目配置
init_setting

# 2. 开发新功能
# ... 编写代码 ...

# 3. 生成 API 文档
genapi @controllers/userController.ts

# 4. 遇到 bug，调试
debug，错误是：[粘贴错误信息]

# 5. 提交代码
gencommit
```

### 启动新项目

```
# 1. 初始化项目结构
init_project，项目需求：[描述你的项目]

# 2. 配置 AI 设置
init_setting

# 3. 开始开发
# ... 按照 tasks.md 执行任务 ...
```

### 模型验证

```
# 检测 AI 模型是否被套壳
detect_shell

# 验证返回的 JSON 指纹
# 对比哈希值、检查 JSON 格式、确认模型身份
```

---

## 🛠️ 开发指南

### 项目结构
```
mcp-probe-kit/
├── src/
│   ├── index.ts              # MCP 服务器主入口
│   └── tools/                # 工具实现
│       ├── index.ts          # 工具导出
│       ├── detect_shell.ts   # 套壳检测
│       ├── gencommit.ts      # 提交消息生成
│       ├── debug.ts          # 调试助手
│       ├── genapi.ts         # API 文档生成
│       ├── init_setting.ts   # 配置初始化
│       └── init_project.ts   # 项目初始化
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

所有工具的参数都是**可选的**，AI 会自动推断或提示用户提供。

**detect_shell:**
- `nonce`: 自定义 nonce 字符串（默认：iclaude-4.5|2025-10-25|guyu|boot）
- `skip_network`: 是否跳过网络探测（默认：false）

**gencommit:**
- `changes`: 手动提供变更内容（默认：自动获取）
- `type`: 提交类型（feat/fix/docs 等）

**debug:**
- `error`: 错误信息
- `context`: 相关代码或场景描述

**genapi:**
- `code`: 需要生成文档的代码
- `format`: 文档格式（markdown/openapi/jsdoc）

**init_setting:**
- `project_path`: 项目路径（默认：当前工作区）

**init_project:**
- `input`: 项目需求描述
- `project_name`: 项目名称

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

- **Probe（探针）**：不仅探测 AI 模型（detect_shell），也探测代码质量（debug）、文档完整性（genapi）
- **Kit（工具集）**：提供一整套开发辅助工具，覆盖项目全生命周期

---

## 👨‍💻 作者

**小墨 (Kyle)**

- 🌐 Website: [bytezonex.com](https://www.bytezonex.com/)
- 💼 专注于 AI 辅助开发工具

---

**Made with ❤️ for Cursor Users**
