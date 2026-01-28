/**
 * Schema definitions for product design workflow tools
 */

export const genPrdSchema = {
  type: "object" as const,
  properties: {
    description: {
      type: "string",
      description: "产品描述或访谈记录。详细描述产品的目标、功能、用户需求等信息。",
    },
    product_name: {
      type: "string",
      description: "产品名称（可选）。如果不提供，将使用默认名称'新产品'。",
    },
    docs_dir: {
      type: "string",
      description: "文档输出目录（可选）。默认为 'docs'。PRD 将保存到 {docs_dir}/prd/ 目录下。",
    },
  },
  required: ["description"],
};

export const genPrototypeSchema = {
  type: "object" as const,
  properties: {
    prd_path: {
      type: "string",
      description: "PRD 文档路径（可选）。如果提供，将从 PRD 中提取页面清单生成原型。",
    },
    description: {
      type: "string",
      description: "功能描述（可选）。如果没有 PRD，可以直接提供功能描述生成原型。prd_path 和 description 至少提供一个。",
    },
    docs_dir: {
      type: "string",
      description: "文档输出目录（可选）。默认为 'docs'。原型文档将保存到 {docs_dir}/prototype/ 目录下。",
    },
  },
  required: [],
};

export const startProductSchema = {
  type: "object" as const,
  properties: {
    description: {
      type: "string",
      description: "产品描述。详细描述产品的目标、功能、用户需求等信息。这是整个工作流的基础输入。",
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
  required: ["description"],
};

export const productDesignSchemas = [
  {
    name: "gen_prd",
    description: "生成产品需求文档（PRD）。基于产品描述或访谈记录生成标准的 PRD 文档，包含产品概述、功能需求、优先级、非功能性需求和页面清单。",
    inputSchema: genPrdSchema,
  },
  {
    name: "gen_prototype",
    description: "生成原型设计文档。基于 PRD 文档或功能描述生成原型设计文档，包含页面结构、交互说明和元素清单。为每个页面生成独立的 Markdown 文档。",
    inputSchema: genPrototypeSchema,
  },
  {
    name: "start_product",
    description: "产品设计完整工作流编排。一键完成从需求到 HTML 原型的全流程：生成 PRD → 生成原型文档 → 生成设计系统 → 生成 HTML 可交互原型 → 更新项目上下文。生成的 HTML 原型可以直接在浏览器中查看和演示。",
    inputSchema: startProductSchema,
  },
];
