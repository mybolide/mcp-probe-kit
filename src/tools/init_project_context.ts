import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { ProjectContext } from "../schemas/output/project-tools.js";

/**
 * init_project_context 工具
 * 
 * 功能：生成项目上下文文档，帮助 AI 理解项目的技术栈、架构和规范
 * 
 * 模式：
 * - single（单文件模式）：生成一个包含所有信息的 project-context.md 文件（v2.0 兼容）
 * - modular（模块化模式）：生成 1 个索引文件 + 5 个分类文档（v2.1 新增）
 * 
 * 设计原则：
 * - MCP 工具职责：提供文档模板和文件结构
 * - AI 职责：决定分析什么文件、提取什么信息、如何填充模板
 * - 保持简单：不包含智能分析算法，确保适用于所有项目类型
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
 * 生成单文件模式的项目上下文
 * 保持与 v2.0 版本完全相同的行为
 */
async function generateSingleContext(docsDir: string) {
  // 构建指南文本（替换占位符）
  const guide = PROMPT_TEMPLATE.replace(/{docs_dir}/g, docsDir);

  // 创建结构化数据对象
  const structuredData: ProjectContext = {
    summary: "生成项目上下文文档",
    mode: "single",
    projectOverview: {
      name: "待分析",
      description: "待分析",
      techStack: [],
      architecture: "待分析"
    },
    codingStandards: [
      "分析 ESLint 配置",
      "分析 Prettier 配置",
      "分析命名规范",
      "分析 TypeScript 配置"
    ],
    workflows: [
      {
        name: "开发流程",
        description: "分析 package.json scripts",
        steps: ["npm run dev", "npm run build", "npm test"]
      }
    ],
    documentation: [
      {
        path: `${docsDir}/project-context.md`,
        purpose: "项目上下文文档"
      }
    ]
  };

  return okStructured(guide, structuredData, {
    schema: (await import("../schemas/output/project-tools.js")).ProjectContextSchema,
  });
}

/**
 * 生成模块化模式的项目上下文
 * 返回包含 6 个文档模板的结构化输出
 */
async function generateModularContext(docsDir: string) {
  try {
    // 导入所有模板
    const { indexTemplate } = await import("./templates/index-template.js");
    const { techStackTemplate } = await import("./templates/tech-stack-template.js");
    const { architectureTemplate } = await import("./templates/architecture-template.js");
    const { codingStandardsTemplate } = await import("./templates/coding-standards-template.js");
    const { dependenciesTemplate } = await import("./templates/dependencies-template.js");
    const { workflowsTemplate } = await import("./templates/workflows-template.js");

    // 验证模板是否成功加载
    if (!indexTemplate || !techStackTemplate || !architectureTemplate || 
        !codingStandardsTemplate || !dependenciesTemplate || !workflowsTemplate) {
      throw new Error("模板加载失败：部分模板文件未找到或格式错误");
    }

    // 构建文件列表
    const files = [
      {
        path: `${docsDir}/project-context.md`,
        purpose: "索引文件（项目上下文的唯一入口）",
        template: indexTemplate
      },
      {
        path: `${docsDir}/project-context/tech-stack.md`,
        purpose: "技术栈信息",
        template: techStackTemplate
      },
      {
        path: `${docsDir}/project-context/architecture.md`,
        purpose: "架构和项目结构",
        template: architectureTemplate
      },
      {
        path: `${docsDir}/project-context/coding-standards.md`,
        purpose: "编码规范",
        template: codingStandardsTemplate
      },
      {
        path: `${docsDir}/project-context/dependencies.md`,
        purpose: "依赖管理",
        template: dependenciesTemplate
      },
      {
        path: `${docsDir}/project-context/workflows.md`,
        purpose: "开发流程和命令",
        template: workflowsTemplate
      }
    ];

    // 构建指南文本
    const guide = `✅ 请生成以下项目上下文文档

## 📋 需要生成的文档

### 文件结构
\`\`\`
${docsDir}/
├── project-context.md          # 索引文件
└── project-context/            # 分类文档
    ├── tech-stack.md           # 技术栈
    ├── architecture.md         # 架构
    ├── coding-standards.md     # 编码规范
    ├── dependencies.md         # 依赖
    └── workflows.md            # 工作流
\`\`\`

---

## 📄 文档模板

${files.map((file, index) => `
### ${index + 1}. ${file.path}

**文件用途**: ${file.purpose}

**模板格式**:
\`\`\`markdown
${file.template}
\`\`\`
`).join('\n---\n')}

---

## ✅ 检查清单

生成文档后，请验证以下内容：

- [ ] 所有 6 个文件已创建
- [ ] 索引文件包含项目概览和文档导航
- [ ] 每个分类文档独立完整，可单独阅读
- [ ] 所有占位符已替换（没有 [xxx] 格式的占位符）
- [ ] Markdown 格式正确（表格、代码块格式正确）
- [ ] 每个文档都有返回索引的链接

---

*生成模式: modular*
*工具: MCP Probe Kit - init_project_context*
`;

    // 创建结构化数据对象
    const structuredData: ProjectContext = {
      summary: "生成模块化项目上下文文档（6 个文件）",
      mode: "modular",
      projectOverview: {
        name: "待分析",
        description: "待分析",
        techStack: [],
        architecture: "待分析"
      },
      documentation: files.map(file => ({
        path: file.path,
        purpose: file.purpose
      }))
    };

    return okStructured(guide, structuredData, {
      schema: (await import("../schemas/output/project-tools.js")).ProjectContextSchema,
    });
  } catch (error) {
    // 模板加载失败时的错误处理
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`模块化模式初始化失败: ${errorMessage}`);
  }
}

/**
 * init_project_context 工具实现
 * 
 * @param args - 工具参数
 * @param args.docs_dir - 文档目录，默认 "docs"
 * @param args.mode - 生成模式，"single"（单文件）或 "modular"（模块化），默认 "single"
 * @returns MCP 响应，包含项目分析指南或模板
 */
export async function initProjectContext(args: any) {
  let mode: string = "single";
  let docsDir: string = DEFAULT_DOCS_DIR;
  
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      docs_dir?: string;
      mode?: string;
    }>(args, {
      defaultValues: {
        docs_dir: DEFAULT_DOCS_DIR,
        mode: "single",
      },
      primaryField: "docs_dir", // 纯文本输入默认映射到 docs_dir 字段
      fieldAliases: {
        docs_dir: ["dir", "output", "directory", "目录", "文档目录"],
        mode: ["type", "format", "模式", "类型"],
      },
    });

    docsDir = getString(parsedArgs.docs_dir) || DEFAULT_DOCS_DIR;
    mode = getString(parsedArgs.mode) || "single";

    // 验证 mode 参数
    if (mode !== "single" && mode !== "modular") {
      throw new Error(`无效的 mode 参数: "${mode}"。支持的值: "single"（单文件模式）, "modular"（模块化模式）`);
    }

    // 根据模式分发
    if (mode === "modular") {
      return await generateModularContext(docsDir);
    } else {
      return await generateSingleContext(docsDir);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // 构建友好的错误提示
    let errorGuide = `❌ 初始化项目上下文失败\n\n`;
    errorGuide += `**错误信息**: ${errorMessage}\n\n`;
    errorGuide += `**当前参数**:\n`;
    errorGuide += `- 文档目录: ${docsDir}\n`;
    errorGuide += `- 生成模式: ${mode}\n\n`;
    errorGuide += `**使用建议**:\n`;
    errorGuide += `1. 检查参数是否正确\n`;
    errorGuide += `2. mode 参数只支持 "single" 或 "modular"\n`;
    errorGuide += `3. 确保有文件系统写入权限\n\n`;
    errorGuide += `**示例**:\n`;
    errorGuide += `- 单文件模式: { "docs_dir": "docs", "mode": "single" }\n`;
    errorGuide += `- 模块化模式: { "docs_dir": "docs", "mode": "modular" }\n`;
    
    const errorData: ProjectContext = {
      summary: "项目上下文初始化失败",
      mode: (mode === "single" || mode === "modular") ? mode : undefined,
      projectOverview: {
        name: "",
        description: "",
        techStack: [],
        architecture: ""
      }
    };
    
    return okStructured(errorGuide, errorData, {
      schema: (await import("../schemas/output/project-tools.js")).ProjectContextSchema,
    });
  }
}
