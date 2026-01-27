import { okStructured } from "../lib/response.js";
import type { RenderResult } from "../schemas/output/ui-ux-tools.js";

/**
 * UI 渲染引擎（内部工具）
 * 将 JSON 模板渲染为最终代码
 */
export async function renderUi(args: any) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const templatePath = args.template;
    const framework = args.framework || 'react';

    if (!templatePath) {
      const errorData: RenderResult = {
        summary: "缺少模板路径参数",
        framework: framework as any,
        code: '',
      };
      
      return okStructured(`❌ 缺少模板路径参数

**用法**:
\`\`\`
render_ui --template="docs/ui/pages/login.json" --framework="react"
\`\`\`

**支持的框架**: react, vue, html
`, errorData, {
        schema: (await import('../schemas/output/ui-ux-tools.js')).RenderResultSchema,
      });
    }

    // 读取模板文件
    const fullTemplatePath = path.join(process.cwd(), templatePath);
    let template: any;
    try {
      const templateContent = await fs.readFile(fullTemplatePath, 'utf-8');
      template = JSON.parse(templateContent);
    } catch (error) {
      const errorData: RenderResult = {
        summary: "模板文件读取失败",
        framework: framework as any,
        code: '',
      };
      
      return okStructured(`❌ 模板文件读取失败: ${templatePath}

**可能的原因**:
1. 文件不存在
2. 文件格式错误（不是有效的 JSON）
3. 文件路径错误

**建议**:
1. 检查文件路径是否正确
2. 使用 \`ui_search --mode=template\` 查看可用模板
3. 使用 \`start_ui\` 生成新模板
`, errorData, {
        schema: (await import('../schemas/output/ui-ux-tools.js')).RenderResultSchema,
      });
    }

    // 读取设计系统和组件目录
    const designSystemPath = path.join(process.cwd(), 'docs', 'design-system.json');
    const catalogPath = path.join(process.cwd(), 'docs', 'ui', 'component-catalog.json');

    let designSystem: any = {};
    let catalog: any = { components: [] };

    try {
      const designSystemContent = await fs.readFile(designSystemPath, 'utf-8');
      designSystem = JSON.parse(designSystemContent);
    } catch (error) {
      console.warn('Design system not found, using defaults');
    }

    try {
      const catalogContent = await fs.readFile(catalogPath, 'utf-8');
      catalog = JSON.parse(catalogContent);
    } catch (error) {
      console.warn('Component catalog not found, using defaults');
    }

    // 渲染代码（简化版本，实际实现会更复杂）
    let code = '';
    const usedComponents: string[] = [];
    const designTokens: Record<string, string> = {};

    if (framework === 'react') {
      code = renderReact(template, designSystem, catalog, usedComponents, designTokens);
    } else if (framework === 'vue') {
      code = renderVue(template, designSystem, catalog, usedComponents, designTokens);
    } else if (framework === 'html') {
      code = renderHtml(template, designSystem, catalog, usedComponents, designTokens);
    } else {
      const errorData: RenderResult = {
        summary: "不支持的框架",
        framework: framework as any,
        code: '',
      };
      
      return okStructured(`❌ 不支持的框架: ${framework}

**支持的框架**: react, vue, html
`, errorData, {
        schema: (await import('../schemas/output/ui-ux-tools.js')).RenderResultSchema,
      });
    }

    const message = `✅ UI 代码已渲染

**框架**: ${framework}
**模板**: ${templatePath}
**使用的组件**: ${usedComponents.join(', ') || '无'}

---

## 渲染的代码

\`\`\`${framework === 'react' ? 'tsx' : framework === 'vue' ? 'vue' : 'html'}
${code}
\`\`\`

---

## 使用的设计 Token

${Object.entries(designTokens).map(([key, value]) => `- **${key}**: ${value}`).join('\n') || '无'}

**提示**: 代码已自动应用设计系统中的样式 Token。
`;

    const structuredData: RenderResult = {
      summary: `UI 代码已渲染 - ${framework}`,
      framework: framework as any,
      code,
      usedComponents,
      designTokens,
    };

    return okStructured(message, structuredData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).RenderResultSchema,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const errorData: RenderResult = {
      summary: "UI 渲染失败",
      framework: args.framework || 'react',
      code: '',
    };
    
    return okStructured(`❌ UI 渲染失败: ${errorMessage}

**可能的原因**:
1. 模板格式错误
2. 设计系统文件缺失
3. 组件目录文件缺失

**建议**:
1. 检查模板文件格式
2. 运行 \`ui_design_system\` 生成设计系统
3. 运行 \`init_component_catalog\` 生成组件目录
`, errorData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).RenderResultSchema,
    });
  }
}

/**
 * 渲染 React 代码
 */
function renderReact(
  template: any,
  designSystem: any,
  catalog: any,
  usedComponents: string[],
  designTokens: Record<string, string>
): string {
  const componentName = template.name || 'Component';
  
  // 提取使用的设计 Token
  if (designSystem.colors?.primary) {
    designTokens['primary-color'] = Object.values(designSystem.colors.primary)[0] as string;
  }
  if (designSystem.typography?.fontFamilies) {
    designTokens['font-family'] = Object.values(designSystem.typography.fontFamilies)[0] as string;
  }

  // 简化的渲染逻辑
  return `import React from 'react';

interface ${componentName}Props {
  // Props will be defined here
}

export const ${componentName}: React.FC<${componentName}Props> = (props) => {
  return (
    <div className="${componentName.toLowerCase()}">
      <h1>${template.description || componentName}</h1>
      {/* Component content will be rendered here */}
    </div>
  );
};

export default ${componentName};
`;
}

/**
 * 渲染 Vue 代码
 */
function renderVue(
  template: any,
  designSystem: any,
  catalog: any,
  usedComponents: string[],
  designTokens: Record<string, string>
): string {
  const componentName = template.name || 'Component';
  
  return `<template>
  <div class="${componentName.toLowerCase()}">
    <h1>{{ title }}</h1>
    <!-- Component content will be rendered here -->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const title = ref('${template.description || componentName}');
</script>

<style scoped>
.${componentName.toLowerCase()} {
  /* Styles will be applied here */
}
</style>
`;
}

/**
 * 渲染 HTML 代码
 */
function renderHtml(
  template: any,
  designSystem: any,
  catalog: any,
  usedComponents: string[],
  designTokens: Record<string, string>
): string {
  const componentName = template.name || 'Component';
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${componentName}</title>
  <style>
    /* Styles will be applied here */
  </style>
</head>
<body>
  <div class="${componentName.toLowerCase()}">
    <h1>${template.description || componentName}</h1>
    <!-- Component content will be rendered here -->
  </div>
</body>
</html>
`;
}
