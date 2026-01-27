import { okStructured } from "../lib/response.js";
import type { ComponentCatalog } from "../schemas/output/ui-ux-tools.js";

/**
 * 初始化组件目录工具（内部工具）
 * 基于设计系统规范生成组件目录文件
 */
export async function initComponentCatalog(_args: any) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    // 检查设计系统文件是否存在
    const designSystemPath = path.join(process.cwd(), 'docs', 'design-system.json');
    
    let designSystem: any = null;
    try {
      const designSystemContent = await fs.readFile(designSystemPath, 'utf-8');
      designSystem = JSON.parse(designSystemContent);
    } catch (error) {
      const errorData: ComponentCatalog = {
        summary: "未找到设计系统文件",
        components: [],
        catalogPath: '',
      };
      
      return okStructured(`❌ 未找到设计系统文件

请先运行 \`ui_design_system\` 生成设计系统。

**示例**:
\`\`\`
ui_design_system --product_type="SaaS" --stack="react"
\`\`\`
`, errorData, {
        schema: (await import('../schemas/output/ui-ux-tools.js')).ComponentCatalogSchema,
      });
    }

    // 定义基础组件目录
    const components = [
      {
        name: 'Button',
        category: 'interactive',
        description: '按钮组件，支持多种变体和状态',
        props: [
          { name: 'variant', type: 'string', required: false, default: 'primary' },
          { name: 'size', type: 'string', required: false, default: 'medium' },
          { name: 'disabled', type: 'boolean', required: false, default: 'false' },
          { name: 'onClick', type: 'function', required: false, default: 'undefined' },
        ],
        variants: ['primary', 'secondary', 'outline', 'ghost'],
      },
      {
        name: 'Input',
        category: 'form',
        description: '输入框组件，支持多种类型和验证',
        props: [
          { name: 'type', type: 'string', required: false, default: 'text' },
          { name: 'placeholder', type: 'string', required: false, default: '' },
          { name: 'value', type: 'string', required: false, default: '' },
          { name: 'onChange', type: 'function', required: false, default: 'undefined' },
          { name: 'error', type: 'string', required: false, default: '' },
        ],
        variants: ['text', 'email', 'password', 'number'],
      },
      {
        name: 'Card',
        category: 'layout',
        description: '卡片容器组件',
        props: [
          { name: 'title', type: 'string', required: false, default: '' },
          { name: 'children', type: 'ReactNode', required: true, default: 'undefined' },
          { name: 'footer', type: 'ReactNode', required: false, default: 'undefined' },
        ],
        variants: ['default', 'elevated', 'outlined'],
      },
      {
        name: 'Container',
        category: 'layout',
        description: '容器组件，用于页面布局',
        props: [
          { name: 'maxWidth', type: 'string', required: false, default: 'lg' },
          { name: 'children', type: 'ReactNode', required: true, default: 'undefined' },
        ],
        variants: ['sm', 'md', 'lg', 'xl', 'full'],
      },
      {
        name: 'Text',
        category: 'typography',
        description: '文本组件，支持多种样式',
        props: [
          { name: 'variant', type: 'string', required: false, default: 'body' },
          { name: 'color', type: 'string', required: false, default: 'default' },
          { name: 'children', type: 'ReactNode', required: true, default: 'undefined' },
        ],
        variants: ['h1', 'h2', 'h3', 'h4', 'body', 'caption'],
      },
    ];

    // 创建组件目录对象
    const catalog = {
      version: '1.0.0',
      designSystem: designSystem.name || 'Design System',
      components,
      tokens: {
        colors: designSystem.colors || {},
        typography: designSystem.typography || {},
        spacing: designSystem.spacing || {},
      },
    };

    // 确保目录存在
    const catalogDir = path.join(process.cwd(), 'docs', 'ui');
    await fs.mkdir(catalogDir, { recursive: true });

    // 写入组件目录文件
    const catalogPath = path.join(catalogDir, 'component-catalog.json');
    await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');

    const message = `✅ 组件目录已生成

**文件路径**: \`docs/ui/component-catalog.json\`
**组件数量**: ${components.length}

**可用组件**:
${components.map((comp, i) => `${i + 1}. **${comp.name}** (${comp.category}) - ${comp.description}`).join('\n')}

**下一步**:
1. 使用 \`ui_search --mode=catalog\` 查看组件详情
2. 使用 \`render_ui\` 渲染 UI 模板
3. 组件会自动使用设计系统中的样式 Token

**提示**: 组件定义包含占位符，渲染时会自动替换为设计规范中的实际值。
`;

    const structuredData: ComponentCatalog = {
      summary: `组件目录已生成 - ${components.length} 个组件`,
      components: components.map(comp => ({
        name: comp.name,
        category: comp.category,
        description: comp.description,
        props: comp.props,
        variants: comp.variants,
      })),
      catalogPath: 'docs/ui/component-catalog.json',
    };

    return okStructured(message, structuredData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).ComponentCatalogSchema,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const errorData: ComponentCatalog = {
      summary: "组件目录生成失败",
      components: [],
      catalogPath: '',
    };
    
    return okStructured(`❌ 组件目录生成失败: ${errorMessage}

**可能的原因**:
1. 文件系统权限问题
2. 磁盘空间不足
3. 设计系统文件格式错误

**建议**:
1. 检查文件系统权限
2. 确保有足够的磁盘空间
3. 重新生成设计系统文件
`, errorData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).ComponentCatalogSchema,
    });
  }
}
