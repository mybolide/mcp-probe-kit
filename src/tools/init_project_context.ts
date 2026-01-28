import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { ProjectContext } from "../schemas/output/project-tools.js";
import { detectProjectType } from "../lib/project-detector.js";
import * as fs from 'fs';
import * as path from 'path';

/**
 * init_project_context 工具
 * 
 * 功能：生成面向任务的项目上下文文档
 * 
 * 设计原则：
 * - 始终生成索引文件 project-context.md 作为入口
 * - 根据项目类型生成 4-5 个实用文档
 * - 提供清晰的模板和直接的填写指导
 * - 强调从项目中提取真实示例
 */

// 默认文档目录
const DEFAULT_DOCS_DIR = "docs";

/**
 * 获取项目基本信息
 */
function getProjectInfo(projectRoot: string) {
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return {
        name: pkg.name || 'Unknown Project',
        version: pkg.version || '0.0.0',
        description: pkg.description || ''
      };
    }
  } catch (error) {
    // Ignore errors
  }
  return {
    name: 'Unknown Project',
    version: '0.0.0',
    description: ''
  };
}

/**
 * 获取文档列表（根据项目类型）
 */
function getDocumentList(category: string): Array<{ file: string; title: string; purpose: string }> {
  const commonDocs = [
    { file: 'tech-stack.md', title: '技术栈', purpose: '项目使用的语言、框架、工具' },
    { file: 'architecture.md', title: '架构设计', purpose: '项目结构、目录说明、设计模式' }
  ];

  const categoryDocs: Record<string, Array<{ file: string; title: string; purpose: string }>> = {
    'backend-api': [
      { file: 'how-to-add-api.md', title: '如何添加新接口', purpose: '添加 API 接口的完整步骤' },
      { file: 'how-to-database.md', title: '如何操作数据库', purpose: '数据库连接、查询、迁移' },
      { file: 'how-to-auth.md', title: '如何处理认证', purpose: '用户认证和授权机制' }
    ],
    'frontend-spa': [
      { file: 'how-to-new-page.md', title: '如何创建新页面', purpose: '创建页面组件的完整步骤' },
      { file: 'how-to-call-api.md', title: '如何调用 API', purpose: 'API 调用方式和错误处理' },
      { file: 'how-to-state.md', title: '如何管理状态', purpose: '状态管理工具的使用方法' }
    ],
    'fullstack': [
      { file: 'how-to-new-feature.md', title: '如何开发新功能', purpose: '前后端联动开发新功能' },
      { file: 'how-to-add-api.md', title: '如何添加新接口', purpose: '添加 API 接口的完整步骤' },
      { file: 'how-to-new-page.md', title: '如何创建新页面', purpose: '创建页面组件的完整步骤' }
    ],
    'library': [
      { file: 'how-to-add-tool.md', title: '如何添加新工具', purpose: '添加新功能/工具的步骤' },
      { file: 'how-to-test.md', title: '如何编写测试', purpose: '测试框架和测试编写规范' }
    ],
    'cli': [
      { file: 'how-to-add-command.md', title: '如何添加新命令', purpose: '添加 CLI 命令的步骤' },
      { file: 'how-to-test.md', title: '如何编写测试', purpose: '测试框架和测试编写规范' }
    ]
  };

  const specificDocs = categoryDocs[category] || [
    { file: 'how-to-develop.md', title: '如何开发', purpose: '开发新功能的基本步骤' },
    { file: 'how-to-test.md', title: '如何编写测试', purpose: '测试框架和测试编写规范' }
  ];

  return [...commonDocs, ...specificDocs];
}

/**
 * 生成开发指南部分
 */
function generateDevGuide(docs: Array<{ file: string; title: string; purpose: string }>): string {
  const guides: Record<string, string[]> = {
    '添加新功能': [],
    '修改现有代码': [],
    '调试问题': [],
    '编写测试': [],
    '部署上线': []
  };

  // 根据文档类型分类
  docs.forEach(doc => {
    if (doc.file.includes('add-api') || doc.file.includes('add-tool') || doc.file.includes('add-command')) {
      guides['添加新功能'].push(`- **${doc.title}**: [${doc.file}](./project-context/${doc.file})`);
    }
    if (doc.file.includes('new-page') || doc.file.includes('new-feature')) {
      guides['添加新功能'].push(`- **${doc.title}**: [${doc.file}](./project-context/${doc.file})`);
    }
    if (doc.file.includes('database') || doc.file.includes('auth') || doc.file.includes('call-api') || doc.file.includes('state')) {
      guides['修改现有代码'].push(`- **${doc.title}**: [${doc.file}](./project-context/${doc.file})`);
    }
    if (doc.file.includes('architecture')) {
      guides['调试问题'].push(`- **${doc.title}**: [${doc.file}](./project-context/${doc.file}) - 了解项目结构`);
    }
    if (doc.file.includes('tech-stack')) {
      guides['调试问题'].push(`- **${doc.title}**: [${doc.file}](./project-context/${doc.file}) - 了解使用的技术`);
    }
    if (doc.file.includes('test')) {
      guides['编写测试'].push(`- **${doc.title}**: [${doc.file}](./project-context/${doc.file})`);
    }
    if (doc.file.includes('deploy')) {
      guides['部署上线'].push(`- **${doc.title}**: [${doc.file}](./project-context/${doc.file})`);
    }
  });

  let result = '';
  for (const [category, items] of Object.entries(guides)) {
    if (items.length > 0) {
      result += `\n### ${category}\n${items.join('\n')}\n`;
    }
  }

  return result || '\n### 开发指南\n查看上面的文档导航，根据需要选择对应的文档。\n';
}

/**
 * 生成项目上下文文档指导
 */
async function generateProjectContext(docsDir: string, projectRoot: string = process.cwd()) {
  try {
    // 检测项目类型
    const detection = detectProjectType(projectRoot);
    const projectInfo = getProjectInfo(projectRoot);
    const docs = getDocumentList(detection.category);
    
    // 生成指导文本
    const guide = generateGuideText(detection, projectInfo, docs, docsDir);
    
    // 构建结构化数据
    const structuredData: ProjectContext = {
      summary: `生成 ${detection.category} 项目的上下文文档（${docs.length + 1} 个文件）`,
      mode: "modular",
      projectOverview: {
        name: projectInfo.name,
        description: projectInfo.description,
        techStack: detection.framework ? [detection.framework] : [],
        architecture: detection.category
      },
      documentation: [
        {
          path: `${docsDir}/project-context.md`,
          purpose: '项目上下文索引文件（入口）'
        },
        ...docs.map(doc => ({
          path: `${docsDir}/project-context/${doc.file}`,
          purpose: doc.purpose
        }))
      ]
    };
    
    return okStructured(guide, structuredData, {
      schema: (await import("../schemas/output/project-tools.js")).ProjectContextSchema,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`项目上下文初始化失败: ${errorMessage}`);
  }
}

/**
 * 生成指导文本
 */
function generateGuideText(
  detection: any,
  projectInfo: any,
  docs: Array<{ file: string; title: string; purpose: string }>,
  docsDir: string
): string {
  const timestamp = new Date().toISOString();
  
  return `# 项目上下文文档生成指导

## 📊 项目信息

- **项目名称**: ${projectInfo.name}
- **版本**: ${projectInfo.version}
- **语言**: ${detection.language}
- **框架**: ${detection.framework || '未检测到'}
- **类型**: ${detection.category}
- **置信度**: ${detection.confidence}%

## 📋 需要生成的文档

请按照以下结构生成 **${docs.length + 1}** 个文档：

\`\`\`
${docsDir}/
├── project-context.md          # 索引文件（必须首先生成）
└── project-context/            # 分类文档目录
${docs.map(doc => `    ├── ${doc.file.padEnd(28)} # ${doc.title}`).join('\n')}
\`\`\`

---

## 🎯 生成步骤

### 第一步：生成索引文件（最重要！）

**文件**: \`${docsDir}/project-context.md\`

这是项目上下文的**灵魂**，必须首先生成。它是所有文档的入口和导航中心。

**模板**:

\`\`\`markdown
# ${projectInfo.name} - 项目上下文

> 本文档是项目上下文的索引文件，提供项目概览和文档导航。

## 📊 项目概览

| 属性 | 值 |
|------|-----|
| 项目名称 | ${projectInfo.name} |
| 版本 | ${projectInfo.version} |
| 语言 | ${detection.language} |
| 框架 | ${detection.framework || '无'} |
| 类型 | ${detection.category} |
| 描述 | ${projectInfo.description || '待补充'} |

## 📚 文档导航

${docs.map(doc => `### [${doc.title}](./project-context/${doc.file})
${doc.purpose}
`).join('\n')}

## 🚀 快速开始

1. 阅读 [技术栈](./project-context/tech-stack.md) 了解项目使用的技术
2. 阅读 [架构设计](./project-context/architecture.md) 了解项目结构
3. 根据需要查看具体的操作指南

## 💡 开发时查看对应文档

根据你要做的事情，查看对应的文档：

${generateDevGuide(docs)}

---
*生成时间: ${timestamp}*  
*生成工具: MCP Probe Kit - init_project_context v2.1*
\`\`\`

**使用 fsWrite 创建此文件**

---

### 第二步：生成分类文档

${docs.map((doc, index) => generateDocTemplate(doc, index + 2, projectInfo, detection, docsDir)).join('\n\n---\n\n')}

---

## ✅ 完成标准

请确认：

- [ ] 已使用 fsWrite 创建 **${docs.length + 1}** 个文件
- [ ] 索引文件 \`project-context.md\` 已创建（最重要！）
- [ ] 所有文档都包含**真实的文件路径**（不是 [xxx] 占位符）
- [ ] 所有文档都包含**实际的代码示例**（从项目中复制）
- [ ] 所有步骤都具体可操作
- [ ] 所有示例都来自项目实际代码

---

**重要提示**:
1. **必须从项目中提取真实示例** - 不要编造代码
2. **路径必须真实存在** - 检查文件是否存在
3. **步骤必须具体** - 不要写"根据需要修改"这种模糊的话
4. **代码必须完整** - 不要用 ... 省略

---

*工具: MCP Probe Kit - init_project_context*  
*版本: 2.1.0*
`;
}

/**
 * 生成单个文档的模板
 */
function generateDocTemplate(
  doc: { file: string; title: string; purpose: string },
  step: number,
  projectInfo: any,
  detection: any,
  docsDir: string
): string {
  const timestamp = new Date().toISOString();
  
  // 根据文档类型生成不同的模板
  const templates: Record<string, string> = {
    'tech-stack.md': `**文件**: \`${docsDir}/project-context/${doc.file}\`

**用途**: ${doc.purpose}

**模板**:

\`\`\`markdown
# 技术栈

> 本文档描述 ${projectInfo.name} 的技术栈信息。

## 基本信息

| 属性 | 值 |
|------|-----|
| 项目名称 | ${projectInfo.name} |
| 版本 | ${projectInfo.version} |
| 语言 | ${detection.language} |
| 框架 | ${detection.framework || '无'} |

## 技术栈详情

### 核心技术

| 类别 | 技术 | 版本 |
|------|------|------|
| 语言 | [从 package.json 或配置文件中提取] | [版本] |
| 运行时 | [Node.js/Python/Java 等] | [版本] |
| 框架 | [主要框架] | [版本] |

### 开发工具

| 类别 | 工具 | 用途 |
|------|------|------|
| 构建工具 | [如 TypeScript, Webpack] | [用途] |
| 测试框架 | [如 Jest, Vitest] | [用途] |
| 代码检查 | [如 ESLint, Prettier] | [用途] |

### 主要依赖

列出 5-10 个最重要的依赖包及其用途。

---
*返回索引: [../project-context.md](../project-context.md)*
\`\`\`

**填写指导**:
1. 读取 \`package.json\` 获取依赖信息
2. 读取 \`tsconfig.json\` 或其他配置文件
3. 列出最重要的 5-10 个依赖包
4. 说明每个依赖的用途`,

    'architecture.md': `**文件**: \`${docsDir}/project-context/${doc.file}\`

**用途**: ${doc.purpose}

**模板**:

\`\`\`markdown
# 架构设计

> 本文档描述 ${projectInfo.name} 的架构和项目结构。

## 项目结构

\`\`\`
[使用 listDirectory 工具生成目录树，深度 2-3 层]
\`\`\`

## 主要目录说明

| 目录 | 用途 |
|------|------|
| [目录名] | [从实际项目中分析得出] |

## 入口文件

- **主入口**: \`[实际的入口文件路径，如 src/index.ts]\`
- **配置文件**: \`[如 package.json, tsconfig.json]\`

## 架构模式

- **项目类型**: ${detection.category}
- **设计模式**: [从代码中识别，如 MVC, 工具集合, 插件系统等]
- **模块划分**: [说明主要模块及其职责]

## 核心模块

### [模块名称]
- **位置**: \`[实际路径]\`
- **职责**: [模块功能]
- **主要文件**: [列出 2-3 个关键文件]

---
*返回索引: [../project-context.md](../project-context.md)*
\`\`\`

**填写指导**:
1. 使用 listDirectory 工具查看项目结构
2. 读取主要目录下的文件
3. 识别项目的组织方式
4. 找出核心模块和关键文件`,

    'how-to-add-api.md': `**文件**: \`${docsDir}/project-context/${doc.file}\`

**用途**: ${doc.purpose}

**模板**:

\`\`\`markdown
# 如何添加新接口

> 本文档指导如何在 ${projectInfo.name} 中添加新的 API 接口。

## 第一步：找到路由定义位置

项目的路由定义在：\`[实际路径，如 src/routes/, src/api/]\`

**现有示例**（从项目中找一个真实的路由文件）:
\`\`\`[语言]
[复制一个实际的路由定义代码]
\`\`\`

## 第二步：创建新路由

1. 在 \`[路径]\` 目录下创建文件 \`[命名规范].ts\`
2. 定义路由：

\`\`\`[语言]
[基于项目实际代码风格的示例]
\`\`\`

## 第三步：实现业务逻辑

业务逻辑通常在：\`[实际路径，如 src/controllers/, src/services/]\`

**现有示例**:
\`\`\`[语言]
[复制一个实际的 controller/service 代码]
\`\`\`

## 第四步：数据验证

项目使用 [验证库名称] 进行数据验证。

**示例**:
\`\`\`[语言]
[从项目中找一个验证示例]
\`\`\`

## 第五步：注册路由

在 \`[实际文件路径]\` 中注册新路由：

\`\`\`[语言]
[实际的路由注册代码]
\`\`\`

## 第六步：测试

运行测试命令：\`[实际命令，如 npm test]\`

---
*返回索引: [../project-context.md](../project-context.md)*
\`\`\`

**填写指导**:
1. 搜索 src/routes, src/api, src/controllers 等目录
2. 找 2-3 个现有的 API 接口作为参考
3. 复制实际的代码示例（不要编造）
4. 说明项目特定的命名和组织方式`,

    'how-to-new-page.md': `**文件**: \`${docsDir}/project-context/${doc.file}\`

**用途**: ${doc.purpose}

**模板**:

\`\`\`markdown
# 如何创建新页面

> 本文档指导如何在 ${projectInfo.name} 中创建新的页面组件。

## 第一步：找到页面目录

项目的页面组件在：\`[实际路径，如 src/pages/, src/views/, app/]\`

**现有示例**（从项目中找一个真实的页面）:
\`\`\`[语言]
[复制一个实际的页面组件代码]
\`\`\`

## 第二步：创建页面文件

1. 在 \`[路径]\` 目录下创建 \`[命名规范].tsx\`
2. 定义组件：

\`\`\`[语言]
[基于项目实际代码风格的示例]
\`\`\`

## 第三步：配置路由

项目使用 [路由库名称]。

**路由配置位置**: \`[实际文件路径]\`

**示例**:
\`\`\`[语言]
[从项目中找路由配置示例]
\`\`\`

## 第四步：获取数据

项目使用 [数据获取方式，如 useEffect, getServerSideProps, loader]。

**示例**:
\`\`\`[语言]
[从项目中找数据获取示例]
\`\`\`

## 第五步：编写样式

项目使用 [样式方案，如 CSS Modules, Tailwind, styled-components]。

**示例**:
\`\`\`[语言]
[从项目中找样式示例]
\`\`\`

---
*返回索引: [../project-context.md](../project-context.md)*
\`\`\`

**填写指导**:
1. 搜索 src/pages, src/views, app 等目录
2. 找 1-2 个现有页面作为参考
3. 复制实际的组件代码
4. 说明路由配置方式`
  };

  // 如果没有特定模板，使用通用模板
  const template = templates[doc.file] || `**文件**: \`${docsDir}/project-context/${doc.file}\`

**用途**: ${doc.purpose}

**模板**:

\`\`\`markdown
# ${doc.title}

> 本文档描述 ${projectInfo.name} 的 ${doc.title.toLowerCase()}。

## 概述

[简要说明本文档的内容]

## 详细步骤

### 第一步：[步骤名称]

[具体说明]

**示例**:
\`\`\`[语言]
[从项目中提取的实际代码]
\`\`\`

### 第二步：[步骤名称]

[具体说明]

---
*返回索引: [../project-context.md](../project-context.md)*
\`\`\`

**填写指导**:
1. 分析项目相关代码
2. 提取真实示例
3. 编写具体步骤`;

  return `### 第${step}步：${doc.title}

${template}

**使用 fsWrite 创建此文件**`;
}

/**
 * init_project_context 工具实现
 * 
 * @param args - 工具参数
 * @param args.docs_dir - 文档目录，默认 "docs"
 * @param args.project_root - 项目根目录，默认当前目录
 * @returns MCP 响应，包含文档生成指导
 */
export async function initProjectContext(args: any) {
  let docsDir: string = DEFAULT_DOCS_DIR;
  let projectRoot: string = process.cwd();
  
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      docs_dir?: string;
      project_root?: string;
    }>(args, {
      defaultValues: {
        docs_dir: DEFAULT_DOCS_DIR,
        project_root: process.cwd()
      },
      primaryField: "docs_dir",
      fieldAliases: {
        docs_dir: ["dir", "output", "directory", "目录", "文档目录"],
        project_root: ["root", "path", "项目路径"]
      },
    });

    docsDir = getString(parsedArgs.docs_dir) || DEFAULT_DOCS_DIR;
    projectRoot = getString(parsedArgs.project_root) || process.cwd();

    // 生成项目上下文
    return await generateProjectContext(docsDir, projectRoot);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // 构建友好的错误提示
    let errorGuide = `❌ 初始化项目上下文失败\n\n`;
    errorGuide += `**错误信息**: ${errorMessage}\n\n`;
    errorGuide += `**当前参数**:\n`;
    errorGuide += `- 文档目录: ${docsDir}\n`;
    errorGuide += `- 项目路径: ${projectRoot}\n\n`;
    errorGuide += `**使用建议**:\n`;
    errorGuide += `1. 检查项目路径是否正确\n`;
    errorGuide += `2. 确保项目包含可识别的配置文件（package.json, requirements.txt 等）\n`;
    errorGuide += `3. 确保有文件系统读写权限\n\n`;
    errorGuide += `**示例**:\n`;
    errorGuide += `- 默认: {}\n`;
    errorGuide += `- 自定义目录: { "docs_dir": "documentation" }\n`;
    errorGuide += `- 指定项目: { "project_root": "/path/to/project" }\n`;
    
    const errorData: ProjectContext = {
      summary: "项目上下文初始化失败",
      mode: "modular",
      projectOverview: {
        name: "",
        description: errorMessage,
        techStack: [],
        architecture: ""
      }
    };
    
    return okStructured(errorGuide, errorData, {
      schema: (await import("../schemas/output/project-tools.js")).ProjectContextSchema,
    });
  }
}
