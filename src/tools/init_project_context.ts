import { parseArgs, getString } from "../utils/parseArgs.js";

/**
 * init_project_context 工具
 * 
 * 功能：生成项目上下文文档，帮助 AI 理解项目的技术栈、架构和规范
 * 模式：指令生成器模式 - 返回详细的分析指南，由 AI 执行实际操作
 */

// 默认文档目录
const DEFAULT_DOCS_DIR = "docs";

// 提示词模板
const PROMPT_TEMPLATE = `# 项目上下文初始化指南

## 🎯 任务目标

在 \`{docs_dir}/\` 目录下生成 \`project-context.md\` 文件，记录项目的核心信息。

**输出文件**: \`{docs_dir}/project-context.md\`

**文件用途**: 记录项目的技术栈、架构模式、编码规范等核心信息，供后续功能开发时参考。

---

## 📋 执行步骤

请按照以下步骤分析项目并生成文档：

### 步骤 1: 分析技术栈

**目标**: 识别项目使用的语言、框架和工具。

**操作**:
1. 读取 \`package.json\` 文件
2. 从 \`dependencies\` 中识别主要框架:
   - React、Vue、Angular → 前端框架
   - Express、Koa、Fastify、NestJS → 后端框架
   - Next.js、Nuxt.js → 全栈框架
   - @modelcontextprotocol/sdk → MCP 服务器
3. 从 \`devDependencies\` 中识别开发工具:
   - typescript → TypeScript 项目
   - webpack、vite、rollup、esbuild → 构建工具
   - jest、vitest、mocha → 测试框架
   - eslint、prettier → 代码规范工具
4. 检查配置文件:
   - \`tsconfig.json\` → TypeScript 配置
   - \`vite.config.js/ts\` → Vite 项目
   - \`webpack.config.js\` → Webpack 项目
   - \`.eslintrc.*\` → ESLint 配置
   - \`.prettierrc.*\` → Prettier 配置

**记录**: 语言、框架、构建工具、测试框架、代码规范工具

---

### 步骤 2: 分析项目结构

**目标**: 理解项目的目录组织方式。

**操作**:
1. 列出项目根目录下的文件和文件夹
2. 重点关注以下目录:
   - \`src/\` → 源代码目录
   - \`lib/\` → 库代码目录
   - \`tests/\` 或 \`__tests__/\` → 测试目录
   - \`docs/\` → 文档目录
   - \`build/\` 或 \`dist/\` → 构建输出目录
3. 识别入口文件:
   - \`src/index.ts\` 或 \`src/index.js\`
   - \`src/main.ts\` 或 \`src/main.js\`
   - \`src/app.ts\` 或 \`src/app.js\`
4. 生成目录树（深度 2-3 层，忽略 node_modules、.git、dist、build）

**记录**: 目录结构、入口文件、主要模块

---

### 步骤 3: 分析编码规范

**目标**: 识别项目的代码风格和规范。

**操作**:
1. 检查是否存在以下配置文件:
   - \`.eslintrc.*\` → ESLint 配置
   - \`.prettierrc.*\` → Prettier 配置
   - \`tsconfig.json\` → TypeScript 配置
2. 从现有代码中识别命名规范:
   - 文件命名: kebab-case / camelCase / PascalCase
   - 变量命名: camelCase
   - 常量命名: UPPER_SNAKE_CASE
   - 类/接口命名: PascalCase
3. 检查 TypeScript 配置:
   - \`strict\` 是否为 true
   - \`target\` 和 \`module\` 设置
   - 其他重要配置项

**记录**: 代码风格工具、命名规范、TypeScript 配置

---

### 步骤 4: 分析依赖

**目标**: 列出项目的主要依赖。

**操作**:
1. 从 \`package.json\` 读取 \`dependencies\`
2. 从 \`package.json\` 读取 \`devDependencies\`
3. 识别关键依赖并说明用途
4. 统计依赖数量

**记录**: 主要生产依赖（前 10 个）、主要开发依赖（前 10 个）、依赖总数

---

### 步骤 5: 分析开发流程

**目标**: 识别项目的开发、构建、测试命令。

**操作**:
1. 从 \`package.json\` 读取 \`scripts\` 字段
2. 识别常用命令:
   - \`dev\` 或 \`start\` → 开发启动命令
   - \`build\` → 构建命令
   - \`test\` → 测试命令
   - \`lint\` → 代码检查命令

**记录**: 开发命令、构建命令、测试命令、其他重要命令

---

## 📝 文档模板

请在 \`{docs_dir}/project-context.md\` 中生成以下内容：

\`\`\`markdown
# 项目上下文

> 本文档由 MCP Probe Kit 的 init_project_context 工具生成，记录项目的核心信息。
> 用于帮助 AI 理解项目，生成更准确的代码和文档。

## 项目概览

| 属性 | 值 |
|------|-----|
| 名称 | [从 package.json 的 name 字段读取] |
| 版本 | [从 package.json 的 version 字段读取] |
| 类型 | [分析得出: Web应用 / API服务 / CLI工具 / 库 / MCP服务器] |
| 描述 | [从 package.json 的 description 字段读取] |

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | [JavaScript / TypeScript] |
| 运行时 | [Node.js / Browser / Deno] |
| 框架 | [识别的框架，如 React、Express、Next.js] |
| 构建工具 | [识别的工具，如 TypeScript、Webpack、Vite] |
| 包管理器 | [npm / yarn / pnpm] |
| 测试框架 | [识别的测试框架，如 Jest、Vitest，或 "未配置"] |

## 项目结构

\\\`\\\`\\\`
[生成目录树，深度 2-3 层]
[示例:]
project/
├── src/
│   ├── index.ts
│   └── tools/
│       ├── index.ts
│       └── ...
├── docs/
├── package.json
└── tsconfig.json
\\\`\\\`\\\`

### 主要目录说明

| 目录 | 用途 |
|------|------|
| src/ | [源代码目录，描述主要内容] |
| docs/ | [文档目录] |
| tests/ | [测试目录，如果存在] |
| build/ | [构建输出目录，如果存在] |

### 入口文件

- 主入口: \`[入口文件路径，如 src/index.ts]\`

## 架构模式

- **项目类型**: [MCP服务器 / Web应用 / API服务 / 库]
- **设计模式**: [识别的模式，如 工具模式、MVC、组件化、服务层]
- **模块划分**: [主要模块说明]

## 编码规范

### 代码风格

| 工具 | 状态 | 配置文件 |
|------|------|----------|
| ESLint | [已配置 / 未配置] | [配置文件路径] |
| Prettier | [已配置 / 未配置] | [配置文件路径] |

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件命名 | [kebab-case / camelCase / PascalCase] | [示例] |
| 变量命名 | camelCase | userName |
| 常量命名 | UPPER_SNAKE_CASE | MAX_COUNT |
| 函数命名 | camelCase | getUserInfo |
| 类/接口命名 | PascalCase | UserService |

### TypeScript 配置

| 配置项 | 值 |
|--------|-----|
| strict | [true / false] |
| target | [ES2020 / ES2022 / ...] |
| module | [CommonJS / ESNext / Node16 / ...] |

## 依赖管理

### 主要生产依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| [依赖名] | [版本] | [用途说明] |

### 主要开发依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| [依赖名] | [版本] | [用途说明] |

### 依赖统计

- 生产依赖: [数量] 个
- 开发依赖: [数量] 个
- 总计: [数量] 个

## 开发流程

### 常用命令

| 命令 | 用途 |
|------|------|
| \`npm run dev\` | [开发启动，描述具体行为] |
| \`npm run build\` | [构建，描述输出位置] |
| \`npm test\` | [测试，或 "未配置"] |
| \`npm run lint\` | [代码检查，或 "未配置"] |

### 开发环境要求

- Node.js: [版本要求，从 engines 字段读取或推断]
- 包管理器: [npm / yarn / pnpm]

---

*生成时间: [当前时间，格式: YYYY-MM-DD HH:mm:ss]*
*生成工具: MCP Probe Kit - init_project_context*
\`\`\`

---

## ✅ 检查清单

生成文档后，请验证以下内容：

- [ ] 文件已创建: \`{docs_dir}/project-context.md\`
- [ ] 项目概览完整（名称、版本、类型、描述都已填写）
- [ ] 技术栈准确（语言、框架、构建工具正确识别）
- [ ] 目录结构清晰（树形结构正确，深度适当）
- [ ] 入口文件正确（主入口文件已识别）
- [ ] 架构模式已识别（项目类型、设计模式）
- [ ] 编码规范完整（ESLint、Prettier、命名规范已记录）
- [ ] TypeScript 配置已记录（如果是 TS 项目）
- [ ] 依赖列表完整（主要依赖已列出并说明用途）
- [ ] 开发命令正确（dev、build、test 命令已记录）
- [ ] 所有占位符已替换（没有 [xxx] 格式的占位符）
- [ ] Markdown 格式正确（表格、代码块格式正确）

---

## 📌 注意事项

1. **如果某项信息无法获取**，请填写 "未配置" 或 "无"，不要留空
2. **目录树生成时**，忽略 \`node_modules\`、\`.git\`、\`dist\`、\`build\`、\`coverage\` 等目录
3. **依赖说明**，只列出主要依赖（前 10 个），其他可省略
4. **时间格式**，使用 YYYY-MM-DD HH:mm:ss 格式
5. **如果 docs 目录不存在**，请先创建该目录

---

*指南版本: 1.0.0*
*工具: MCP Probe Kit - init_project_context*
`;

/**
 * init_project_context 工具实现
 * 
 * @param args - 工具参数
 * @param args.docs_dir - 文档目录，默认 "docs"
 * @returns MCP 响应，包含项目分析指南
 */
export async function initProjectContext(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      docs_dir?: string;
    }>(args, {
      defaultValues: {
        docs_dir: DEFAULT_DOCS_DIR,
      },
      primaryField: "docs_dir", // 纯文本输入默认映射到 docs_dir 字段
      fieldAliases: {
        docs_dir: ["dir", "output", "directory", "目录", "文档目录"],
      },
    });

    const docsDir = getString(parsedArgs.docs_dir) || DEFAULT_DOCS_DIR;

    // 构建指南文本（替换占位符）
    const guide = PROMPT_TEMPLATE.replace(/{docs_dir}/g, docsDir);

    // 返回结果
    return {
      content: [
        {
          type: "text",
          text: guide,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 初始化项目上下文失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
