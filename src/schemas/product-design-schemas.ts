/**
 * Schema definitions for product design workflow tools
 */

export const startProductSchema = {
  type: "object" as const,
  properties: {
    description: {
      type: "string",
      description: "产品描述。详细描述产品的目标、功能、用户需求等信息。这是整个工作流的基础输入。如果提供了 requirements_file，此参数可选。",
    },
    requirements_file: {
      type: "string",
      description: "需求文档文件路径（可选）。如果提供，将读取该文件的完整内容作为产品需求。支持 Markdown、文本等格式。例如：'docs/requirements.md'、'project.md'。",
    },
    product_name: {
      type: "string",
      description: "产品名称（可选）。如果不提供，将使用默认名称'新产品'。",
    },
    product_type: {
      type: "string",
      description: "产品类型（可选）。用于生成设计系统，如 'SaaS'、'E-commerce'、'Healthcare' 等。默认为 'SaaS'。",
    },
    skip_design_system: {
      type: "boolean",
      description: "跳过设计系统生成（可选）。默认为 false。如果设置为 true，将不生成设计系统。",
    },
    docs_dir: {
      type: "string",
      description: "文档输出目录（可选）。默认为 'docs'。所有文档将保存到此目录下的子目录中。",
    },
  },
  required: [],
};

export const productDesignSchemas = [
  {
    name: "start_product",
    description: "产品设计完整工作流编排。一键完成从需求到 HTML 原型的全流程：生成 PRD → 生成原型文档 → 生成设计系统 → 生成 HTML 可交互原型 → 更新项目上下文。生成的 HTML 原型可以直接在浏览器中查看和演示。",
    inputSchema: startProductSchema,
  },
];
