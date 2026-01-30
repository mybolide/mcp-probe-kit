import { parseArgs, getString, getBoolean } from "../utils/parseArgs.js";
import { promises as fs } from "fs";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { WorkflowReportSchema } from "../schemas/structured-output.js";
import type { WorkflowReport, WorkflowStep, Artifact } from "../schemas/structured-output.js";

/**
 * start_product - 产品设计完整工作流指导
 * 
 * 返回从需求到 HTML 原型的完整工作流执行指导，由 AI 按步骤调用工具并创建文件
 */

export async function startProduct(args: any) {
  try {
    // 使用智能参数解析
    const parsedArgs = parseArgs<{
      description?: string;
      requirements_file?: string;
      product_name?: string;
      product_type?: string;
      skip_design_system?: boolean;
      docs_dir?: string;
    }>(args, {
      defaultValues: {
        description: "",
        requirements_file: "",
        product_name: "新产品",
        product_type: "SaaS",
        skip_design_system: false,
        docs_dir: "docs",
      },
      primaryField: "description",
      fieldAliases: {
        description: ["desc", "需求", "描述"],
        requirements_file: ["req_file", "需求文件"],
        product_name: ["name", "产品名称"],
        product_type: ["type", "产品类型"],
        skip_design_system: ["skip_design"],
        docs_dir: ["dir", "目录"],
      },
    });

    let description = getString(parsedArgs.description);
    const requirementsFile = getString(parsedArgs.requirements_file);
    const productName = getString(parsedArgs.product_name) || "新产品";
    const productType = getString(parsedArgs.product_type) || "SaaS";
    const skipDesignSystem = getBoolean(parsedArgs.skip_design_system);
    const docsDir = getString(parsedArgs.docs_dir) || "docs";

    // 如果提供了需求文件，读取文件内容
    let requirementsSource = '';
    if (requirementsFile) {
      try {
        description = await fs.readFile(requirementsFile, 'utf-8');
        requirementsSource = `需求文档文件: ${requirementsFile}`;
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 无法读取需求文档文件: ${requirementsFile}\n错误: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    } else {
      requirementsSource = '用户提供的描述';
    }

    if (!description || description.trim() === "") {
      return {
        content: [
          {
            type: "text",
            text: "❌ 缺少必需参数：必须提供 description 或 requirements_file",
          },
        ],
        isError: true,
      };
    }

    const header = renderOrchestrationHeader({
      tool: 'start_product',
      goal: `完成产品设计工作流：${productName}`,
      tasks: [
        '按 delegated plan 顺序调用工具',
        '生成 PRD、原型、设计系统与 HTML 原型',
      ],
    });

    const guidanceText = header + `# 🚀 产品设计工作流执行指导

基于${requirementsSource}，请按照以下步骤完成从需求到 HTML 原型的完整产品设计流程。

## 📋 需求信息

- **产品名称**: ${productName}
- **产品类型**: ${productType}
- **文档目录**: ${docsDir}
- **需求来源**: ${requirementsSource}
- **跳过设计系统**: ${skipDesignSystem ? '是' : '否'}

${requirementsFile ? `\n**📄 需求文档内容**:\n\n${description.substring(0, 500)}${description.length > 500 ? '...\n\n（完整内容已读取，共 ' + description.length + ' 字符）' : ''}` : `\n**📄 产品描述**:\n\n${description}`}

---

## 🎯 执行步骤

请按顺序执行以下步骤：

### 步骤 1: 检查/生成项目上下文 📋

**检查**: 查看 \`${docsDir}/project-context.md\` 是否存在

**如果不存在，调用 MCP 工具**: \`init_project_context\`
\`\`\`json
{
  "docs_dir": "${docsDir}"
}
\`\`\`

**预期输出**: 
- \`${docsDir}/project-context.md\` - 项目上下文索引文件

---

### 步骤 2: 生成产品需求文档（PRD） 📝

**调用 MCP 工具**: \`gen_prd\`
\`\`\`json
{
  "description": "${description.replace(/"/g, '\\"').replace(/\n/g, '\\n').substring(0, 200)}...",
  "product_name": "${productName}",
  "docs_dir": "${docsDir}"
}
\`\`\`

**重要**: 
- 工具会返回 PRD 文档模板和创建指导
- 请根据指导创建 \`${docsDir}/prd/product-requirements.md\` 文件
- 智能填充所有标记为 [请根据产品描述填写] 的部分
- 确保 PRD 包含完整的页面清单（第 5 章节）

**预期输出**: 
- \`${docsDir}/prd/product-requirements.md\` - 完整的 PRD 文档

---

### 步骤 3: 生成原型设计文档 🎨

**调用 MCP 工具**: \`gen_prototype\`
\`\`\`json
{
  "prd_path": "${docsDir}/prd/product-requirements.md",
  "docs_dir": "${docsDir}"
}
\`\`\`

**重要**: 
- 工具会返回原型设计文档模板和创建指导
- 请根据指导创建原型索引和各页面原型文档
- 从 PRD 的页面清单中提取所有页面
- 为每个页面创建 \`${docsDir}/prototype/page-[页面名称].md\` 文件

**预期输出**: 
- \`${docsDir}/prototype/prototype-index.md\` - 原型索引
- \`${docsDir}/prototype/page-*.md\` - 各页面原型文档

---

${!skipDesignSystem ? `### 步骤 4: 生成设计系统 🎨

**调用 MCP 工具**: \`ui_design_system\`
\`\`\`json
{
  "product_type": "${productType}",
  "description": "${productName}",
  "stack": "html"
}
\`\`\`

**预期输出**: 
- \`${docsDir}/design-system.json\` - 设计系统配置
- \`${docsDir}/design-system.md\` - 设计系统文档

---

### 步骤 5: 生成 HTML 原型 🌐

**调用 MCP 工具**: \`start_ui\`
\`\`\`json
{
  "description": "基于原型文档生成所有页面的 HTML 原型"
}
\`\`\`

**说明**: 
- \`start_ui\` 工具会自动读取 \`${docsDir}/prototype/\` 目录下的所有页面原型文档
- 自动读取 \`${docsDir}/design-system.json\` 获取设计规范
- 为每个页面生成对应的 HTML 文件到 \`${docsDir}/html-prototype/\` 目录
- 生成索引页面 \`${docsDir}/html-prototype/index.html\`

**预期输出**:
- \`${docsDir}/html-prototype/index.html\` - HTML 原型索引
- \`${docsDir}/html-prototype/page-*.html\` - 各页面 HTML 文件

---

### 步骤 6: 更新项目上下文 📚

**操作**: 将生成的文档添加到 \`${docsDir}/project-context.md\` 索引中

**在文件末尾添加**:
\`\`\`markdown
## 产品设计

### 产品需求文档（PRD）
- [产品需求文档](./prd/product-requirements.md)

### 原型设计
- [原型设计索引](./prototype/prototype-index.md)
- [HTML 原型演示](./html-prototype/index.html)

### 设计系统
- [设计系统](./design-system.md)
\`\`\`

---

` : `### 步骤 4: 生成 HTML 原型 🌐

**说明**: 基于原型文档生成简单的 HTML 文件（跳过设计系统）

**操作**: 
1. 读取 \`${docsDir}/prototype/\` 目录下的所有 \`page-*.md\` 文件
2. 为每个页面生成对应的 HTML 文件到 \`${docsDir}/html-prototype/\` 目录
3. 生成索引页面 \`${docsDir}/html-prototype/index.html\`
4. 使用默认的颜色和样式

**HTML 生成要求**:
- 使用默认的颜色方案（主色: #3B82F6, 辅色: #10B981）
- 包含页面导航（所有页面的链接）
- 响应式设计
- 可直接在浏览器中打开查看

---

### 步骤 5: 更新项目上下文 📚

**操作**: 将生成的文档添加到 \`${docsDir}/project-context.md\` 索引中

**在文件末尾添加**:
\`\`\`markdown
## 产品设计

### 产品需求文档（PRD）
- [产品需求文档](./prd/product-requirements.md)

### 原型设计
- [原型设计索引](./prototype/prototype-index.md)
- [HTML 原型演示](./html-prototype/index.html)
\`\`\`

---

`}## ✅ 完成后

所有文档应该已经生成在 \`${docsDir}\` 目录下：
- ✅ PRD 文档
- ✅ 原型设计文档
${!skipDesignSystem ? '- ✅ 设计系统\n' : ''}- ✅ HTML 可交互原型

**查看原型**: 在浏览器中打开 \`${docsDir}/html-prototype/index.html\`

---

## 📁 预期文件结构

\`\`\`
${docsDir}/
├── project-context.md          # 项目上下文索引
├── prd/
│   └── product-requirements.md # PRD 文档
├── prototype/
│   ├── prototype-index.md      # 原型索引
│   ├── page-首页.md
│   ├── page-登录页.md
│   └── page-*.md               # 其他页面原型
${!skipDesignSystem ? `├── design-system.json          # 设计系统配置
├── design-system.md            # 设计系统文档
` : ''}└── html-prototype/
    ├── index.html              # HTML 原型索引
    ├── page-首页.html
    ├── page-登录页.html
    └── page-*.html             # 其他页面 HTML
\`\`\`

---

## 🎯 下一步建议

1. 与团队评审 HTML 原型
2. 根据反馈调整原型文档
3. 使用 \`start_ui\` 工具开始实际开发
4. 使用 \`start_feature\` 工具开始功能开发

---

💡 **提示**: 这是一个完整的工作流指导，AI 需要按步骤调用 MCP 工具并创建所有文件。每个步骤都很重要，请确保按顺序执行。
`;

    const includeDesignSystem = !skipDesignSystem;
    const plan = {
      mode: 'delegated',
      steps: [
        {
          id: 'context',
          tool: 'init_project_context',
          when: `缺少 ${docsDir}/project-context.md`,
          args: { docs_dir: docsDir },
          outputs: [`${docsDir}/project-context.md`],
        },
        {
          id: 'prd',
          tool: 'gen_prd',
          args: {
            description,
            product_name: productName,
            docs_dir: docsDir,
          },
          outputs: [`${docsDir}/prd/product-requirements.md`],
        },
        {
          id: 'prototype',
          tool: 'gen_prototype',
          args: {
            prd_path: `${docsDir}/prd/product-requirements.md`,
            docs_dir: docsDir,
          },
          outputs: [
            `${docsDir}/prototype/prototype-index.md`,
            `${docsDir}/prototype/page-*.md`,
          ],
        },
        ...(includeDesignSystem
          ? [
              {
                id: 'design-system',
                tool: 'ui_design_system',
                args: {
                  product_type: productType,
                  description: productName,
                  stack: 'html',
                },
                outputs: [
                  `${docsDir}/design-system.json`,
                  `${docsDir}/design-system.md`,
                ],
              },
              {
                id: 'html-prototype',
                tool: 'start_ui',
                args: {
                  description: '基于原型文档生成所有页面的 HTML 原型',
                  framework: 'html',
                },
                outputs: [
                  `${docsDir}/html-prototype/index.html`,
                  `${docsDir}/html-prototype/page-*.html`,
                ],
              },
            ]
          : [
              {
                id: 'html-prototype',
                tool: 'manual',
                action: 'generate_html_prototype',
                outputs: [
                  `${docsDir}/html-prototype/index.html`,
                  `${docsDir}/html-prototype/page-*.html`,
                ],
              },
            ]),
        {
          id: 'update-context',
          tool: 'manual',
          action: 'update_project_context',
          outputs: [`${docsDir}/project-context.md`],
        },
      ],
    };

    const pendingStatus: WorkflowStep['status'] = 'pending';
    const steps: WorkflowStep[] = [
      {
        name: '检查/生成项目上下文',
        status: pendingStatus,
        description: `检查 ${docsDir}/project-context.md，不存在则调用 init_project_context`,
      },
      {
        name: '生成 PRD',
        status: pendingStatus,
        description: '调用 gen_prd 生成产品需求文档',
      },
      {
        name: '生成原型文档',
        status: pendingStatus,
        description: '调用 gen_prototype 生成原型设计文档',
      },
      ...(includeDesignSystem
        ? [
            {
              name: '生成设计系统',
              status: pendingStatus,
              description: '调用 ui_design_system 生成设计系统',
            },
            {
              name: '生成 HTML 原型',
              status: pendingStatus,
              description: '调用 start_ui 生成 HTML 可交互原型',
            },
          ]
        : [
            {
              name: '生成 HTML 原型',
              status: pendingStatus,
              description: '基于原型文档手动生成 HTML 文件',
            },
          ]),
      {
        name: '更新项目上下文',
        status: pendingStatus,
        description: `将产品设计文档链接添加到 ${docsDir}/project-context.md`,
      },
    ];

    const artifacts: Artifact[] = [
      {
        path: `${docsDir}/prd/product-requirements.md`,
        type: 'doc',
        purpose: '产品需求文档（PRD）',
      },
      {
        path: `${docsDir}/prototype/prototype-index.md`,
        type: 'doc',
        purpose: '原型设计索引',
      },
      {
        path: `${docsDir}/prototype/page-*.md`,
        type: 'doc',
        purpose: '页面原型文档',
      },
      {
        path: `${docsDir}/html-prototype/index.html`,
        type: 'doc',
        purpose: 'HTML 原型索引',
      },
    ];

    if (includeDesignSystem) {
      artifacts.push(
        {
          path: `${docsDir}/design-system.json`,
          type: 'doc',
          purpose: '设计系统配置',
        },
        {
          path: `${docsDir}/design-system.md`,
          type: 'doc',
          purpose: '设计系统文档',
        }
      );
    }

    const report: WorkflowReport = {
      summary: `产品设计工作流：${productName}`,
      status: 'pending',
      steps,
      artifacts,
      nextSteps: [
        '按顺序执行执行计划中的步骤',
        `生成并检查 ${docsDir}/prd/product-requirements.md`,
        `生成并检查 ${docsDir}/prototype/prototype-index.md`,
        `查看 ${docsDir}/html-prototype/index.html 进行评审`,
      ],
      metadata: {
        plan,
      },
    };

    return okStructured(guidanceText, report, {
      schema: WorkflowReportSchema,
      note: 'AI 应该严格按照执行计划调用工具并创建文档',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 生成工作流指导失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
