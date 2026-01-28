/**
 * 统一 UI 开发编排工具
 * 
 * 一键完成整个 UI 开发流程：
 * 1. 检查设计规范
 * 2. 检查/生成组件目录
 * 3. 搜索/生成 UI 模板
 * 4. 渲染最终代码
 */

import { parseArgs, getString } from "../utils/parseArgs.js";
import { getReasoningEngine } from "./ui-ux-tools.js";
import { DesignRequest } from "../utils/design-reasoning-engine.js";
import { okStructured } from "../lib/response.js";
import { UIReportSchema } from "../schemas/structured-output.js";
import type { UIReport } from "../schemas/structured-output.js";
import { detectProjectType } from "../lib/project-detector.js";

const PROMPT_TEMPLATE = `# 快速开始

**职责说明**: 本工具仅提供执行指导，不执行实际操作。请按顺序调用以下 MCP 工具。

执行以下工具：

1. 检查 \`docs/project-context.md\` 是否存在，不存在则调用 \`init_project_context\`
2. 检查 \`docs/design-system.md\` 是否存在，不存在则调用 \`ui_design_system --product_type="SaaS" --stack="{framework}"\`
3. 检查 \`docs/component-catalog.json\` 是否存在，不存在则调用 \`init_component_catalog\`
4. \`ui_search --mode=template --query="{description}"\`
5. \`render_ui --template="docs/ui/{templateName}.json" --framework="{framework}"\`
6. 将生成的 UI 文档添加到 \`docs/project-context.md\` 索引中

---

## 步骤 1: 生成项目上下文（如不存在）📋

**检查**: 查看 \`docs/project-context.md\` 是否存在

**如果不存在，调用工具**: \`init_project_context\`
**参数**: 无（使用默认配置）

**预期输出**: 
- \`docs/project-context.md\` - 项目上下文索引文件
- \`docs/project-context/\` - 项目文档目录

**失败处理**: 确保 docs 目录存在且有写入权限

---

## 步骤 2: 生成设计系统（如不存在）🎨

**检查**: 查看 \`docs/design-system.md\` 是否存在

**如果不存在，调用工具**: \`ui_design_system\`
**参数**:
\`\`\`json
{
  "product_type": "{description}",
  "stack": "{framework}",
  "description": "{description}"
}
\`\`\`

**预期输出**: \`docs/design-system.json\` 和 \`docs/design-system.md\`
**失败处理**: 检查 docs 目录是否存在，确保有写入权限

---

## 步骤 3: 生成组件目录（如不存在）📦

**检查**: 查看 \`docs/component-catalog.json\` 是否存在

**如果不存在，调用工具**: \`init_component_catalog\`
**参数**: 无

**预期输出**: \`docs/component-catalog.json\`
**失败处理**: 确保步骤 2 的设计系统文件已生成

---

## 步骤 4: 搜索 UI 模板 🔍

**工具**: \`ui_search\`
**参数**:
\`\`\`json
{
  "mode": "template",
  "query": "{description}"
}
\`\`\`

**预期输出**: 匹配的模板列表（可能为空）
**失败处理**: 如果没有找到模板，继续到步骤 5 使用默认模板

---

## 步骤 5: 渲染最终代码 💻

**工具**: \`render_ui\`
**参数**:
\`\`\`json
{
  "template": "docs/ui/{templateName}.json",
  "framework": "{framework}"
}
\`\`\`

**预期输出**: 完整的 {framework} 组件代码
**失败处理**: 如果模板不存在，工具会使用默认模板生成代码

---

## 步骤 6: 更新项目上下文索引 📝

**操作**: 将生成的 UI 文档添加到 \`docs/project-context.md\` 中

**添加内容**:
在 "## 📚 文档导航" 部分添加：

\`\`\`markdown
### [UI 设计系统](./design-system.md)
项目的 UI 设计规范，包括颜色、字体、组件样式等

### [UI 组件目录](./component-catalog.json)
可用的 UI 组件及其属性定义
\`\`\`

在 "## 💡 开发时查看对应文档" 部分的 "添加新功能" 下添加：
\`\`\`markdown
- **UI 设计系统**: [design-system.md](./design-system.md) - 查看设计规范
- **UI 组件目录**: [component-catalog.json](./component-catalog.json) - 查看可用组件
\`\`\`

**预期结果**: \`docs/project-context.md\` 包含 UI 相关文档的链接
**失败处理**: 如果文件不存在，跳过此步骤

---

## 高级选项

### 自定义设计系统
编辑 \`docs/design-system.json\` 修改颜色、字体等，然后重新运行。

### 自定义组件
编辑 \`docs/component-catalog.json\` 添加新组件定义。

### 常见问题

**Q: 设计系统文件已存在，还需要重新生成吗？**
A: 不需要。如果文件已存在，直接跳过步骤 1。

**Q: 如何使用自定义模板？**
A: 在 \`docs/ui/\` 目录创建 JSON 模板文件，然后在步骤 4 中指定模板路径。
`;

/**
 * 统一 UI 开发编排工具
 */
export async function startUi(args: any) {
  try {
    // 检测项目框架
    const projectRoot = process.cwd();
    const detection = detectProjectType(projectRoot);
    
    // 从检测结果中提取框架信息
    let detectedFramework = 'react'; // 默认值
    if (detection.framework) {
      const fw = detection.framework.toLowerCase();
      if (fw.includes('vue')) {
        detectedFramework = 'vue';
      } else if (fw.includes('react') || fw.includes('next')) {
        detectedFramework = 'react';
      } else if (fw.includes('html') || fw === 'none') {
        detectedFramework = 'html';
      }
    }
    
    // 智能参数解析
    const parsedArgs = parseArgs<{
      description?: string;
      framework?: string;
      template?: string;
      mode?: string;
    }>(args, {
      defaultValues: {
        description: "",
        framework: detectedFramework, // 使用检测到的框架
        template: "",
        mode: "manual",
      },
      primaryField: "description",
      fieldAliases: {
        description: ["desc", "ui", "page", "需求", "描述"],
        framework: ["stack", "lib", "框架"],
        template: ["name", "模板名"],
        mode: ["模式"],
      },
    });

    const description = getString(parsedArgs.description);
    const framework = getString(parsedArgs.framework) || detectedFramework;
    const mode = getString(parsedArgs.mode) || "manual";
    let templateName = getString(parsedArgs.template);

    // 验证 mode 参数
    const validModes = ["auto", "manual"];
    if (mode && !validModes.includes(mode)) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 无效的模式: ${mode}

**有效选项**: auto, manual

**示例**:
\`\`\`
start_ui "登录页面" --mode=manual
start_ui "用户列表" --mode=auto
\`\`\`
`,
          },
        ],
        isError: true,
      };
    }

    // 自动模式实现
    if (mode === "auto") {
      // 1. 获取推理引擎
      const engine = await getReasoningEngine();

      // 2. 构造设计请求
      const request: DesignRequest = {
        productType: description, // 初始尝试用描述作为类型
        description: description,
        stack: framework,
      };

      // 3. 生成推荐
      const recommendation = engine.generateRecommendation(request);

      // 4. 提取推理结果
      const inferredProductType = recommendation.target;
      const inferredKeywords = recommendation.style.keywords.join(", ");
      const inferredStack = framework; // 保持用户指定的技术栈，或默认为 react

      // 5. 生成智能执行计划
      const smartPlan = `# 🚀 智能 UI 开发计划

基于您的描述 "**${description}**"，AI 引擎已为您规划了最佳开发路径。

## 🧠 智能分析结果

- **产品类型**: ${inferredProductType}
- **推荐风格**: ${recommendation.style.primary}
- **关键特性**: ${inferredKeywords}
- **技术栈**: ${inferredStack}

---

## 📋 执行步骤（已自动优化参数）

请按顺序执行以下命令：

### 1. 生成项目上下文 📋
\`\`\`bash
init_project_context
\`\`\`

### 2. 生成设计系统 🎨
\`\`\`bash
ui_design_system --product_type="${inferredProductType}" --stack="${inferredStack}" --keywords="${inferredKeywords}" --description="${description}"
\`\`\`

### 3. 生成组件目录 📦
\`\`\`bash
init_component_catalog
\`\`\`

### 4. 生成 UI 模板 📄
\`\`\`bash
# 搜索现有模板或生成新模板
ui_search --mode=template --query="${templateName || description}"
\`\`\`

### 5. 渲染代码 💻
\`\`\`bash
render_ui docs/ui/${templateName || 'template'}.json --framework="${inferredStack}"
\`\`\`

### 6. 更新项目上下文 📝
将生成的 UI 文档链接添加到 \`docs/project-context.md\` 的文档导航部分。

---

## 💡 为什么选择这个方案？

${recommendation.reasoning}
`;

      // Create structured UI report for auto mode
      const uiReport: UIReport = {
        summary: `智能 UI 开发：${description}`,
        status: 'pending',
        steps: [
          {
            name: '生成项目上下文',
            status: 'pending',
            description: `调用 init_project_context 生成项目文档`,
          },
          {
            name: '生成设计系统',
            status: 'pending',
            description: `调用 ui_design_system 生成设计规范`,
          },
          {
            name: '生成组件目录',
            status: 'pending',
            description: '调用 init_component_catalog 生成组件目录',
          },
          {
            name: '搜索 UI 模板',
            status: 'pending',
            description: '调用 ui_search 搜索匹配的模板',
          },
          {
            name: '渲染最终代码',
            status: 'pending',
            description: '调用 render_ui 生成组件代码',
          },
          {
            name: '更新项目上下文',
            status: 'pending',
            description: '将 UI 文档添加到 project-context.md 索引',
          },
        ],
        artifacts: [],
        nextSteps: [
          '调用 init_project_context',
          `调用 ui_design_system --product_type="${inferredProductType}" --stack="${inferredStack}"`,
          '调用 init_component_catalog',
          `调用 ui_search --mode=template --query="${description}"`,
          `调用 render_ui --framework="${inferredStack}"`,
          '更新 docs/project-context.md 添加 UI 文档链接',
        ],
        designSystem: {
          colors: {},
          typography: {},
          spacing: {},
        },
        renderedCode: {
          framework: inferredStack as 'react' | 'vue' | 'html',
          code: '待生成',
        },
        consistencyRules: [
          '所有组件使用设计系统中定义的颜色',
          '所有组件使用设计系统中定义的字体',
          '所有组件使用设计系统中定义的间距',
        ],
      };

      return okStructured(
        smartPlan,
        uiReport,
        {
          schema: UIReportSchema,
          note: 'AI 应该按照智能计划执行步骤，并在每个步骤完成后更新 structuredContent',
        }
      );
    }

    // 如果没有提供模板名，从描述中生成
    if (!templateName && description) {
      // 简单的命名转换：登录页面 → login-page
      // 移除特殊字符，只保留字母、数字、中文和连字符
      templateName = description
        .toLowerCase()
        .replace(/页面|表单|组件/g, '')
        .trim()
        .replace(/[^\w\u4e00-\u9fa5-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }

    if (!description) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 缺少必要参数

**用法**:
\`\`\`
start_ui <描述> [--framework=react|vue|html]
\`\`\`

**示例**:
\`\`\`
start_ui "登录页面"
start_ui "用户列表" --framework=vue
start_ui "设置页面" --framework=react
\`\`\`

**提示**: 
- 确保已运行 \`ui_design_system\` 生成设计系统
- 组件目录会自动生成（如果不存在）
`,
          },
        ],
        isError: true,
      };
    }

    // 转义 JSON 字符串中的特殊字符
    const escapeJson = (str: string) => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    };

    // 安全的字符串替换，避免 $& 等特殊字符被解释为替换模式
    const safeReplace = (template: string, placeholder: string, value: string) => {
      return template.split(placeholder).join(value);
    };

    let guide = PROMPT_TEMPLATE;
    guide = safeReplace(guide, '{description}', escapeJson(description));
    guide = safeReplace(guide, '{framework}', framework);
    guide = safeReplace(guide, '{templateName}', templateName || 'ui-template');

    // Create structured UI report for manual mode
    const uiReport: UIReport = {
      summary: `UI 开发工作流：${description}`,
      status: 'pending',
      steps: [
        {
          name: '检查项目上下文',
          status: 'pending',
          description: '检查 docs/project-context.md 是否存在',
        },
        {
          name: '检查设计系统',
          status: 'pending',
          description: '检查 docs/design-system.md 是否存在',
        },
        {
          name: '检查组件目录',
          status: 'pending',
          description: '检查 docs/component-catalog.json 是否存在',
        },
        {
          name: '搜索 UI 模板',
          status: 'pending',
          description: '调用 ui_search 搜索匹配的模板',
        },
        {
          name: '渲染最终代码',
          status: 'pending',
          description: '调用 render_ui 生成组件代码',
        },
        {
          name: '更新项目上下文',
          status: 'pending',
          description: '将 UI 文档添加到 project-context.md 索引',
        },
      ],
      artifacts: [],
      nextSteps: [
        '检查项目上下文，如不存在则调用 init_project_context',
        '检查设计系统文件，如不存在则调用 ui_design_system',
        '检查组件目录，如不存在则调用 init_component_catalog',
        `调用 ui_search --mode=template --query="${description}"`,
        `调用 render_ui --framework="${framework}"`,
        '更新 docs/project-context.md 添加 UI 文档链接',
      ],
      designSystem: {
        colors: {},
        typography: {},
        spacing: {},
      },
      renderedCode: {
        framework: framework as 'react' | 'vue' | 'html',
        code: '待生成',
      },
      consistencyRules: [
        '所有组件使用设计系统中定义的颜色',
        '所有组件使用设计系统中定义的字体',
        '所有组件使用设计系统中定义的间距',
      ],
    };

    return okStructured(
      guide,
      uiReport,
      {
        schema: UIReportSchema,
        note: 'AI 应该按照指南执行步骤，并在每个步骤完成后更新 structuredContent',
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ UI 开发流程失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
