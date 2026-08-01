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
    target_users: {
      type: "string",
      description: "目标用户（可选）。例如：TypeScript 项目维护者、企业管理员、普通消费者。未提供时会尝试从 description 的“目标用户：”段落提取。",
    },
    constraints: {
      type: "string",
      description: "核心约束（可选）。多个约束建议用分号分隔。未提供时会尝试从 description 的“核心约束：”或“约束：”段落提取。",
    },
    skip_design_system: {
      type: "boolean",
      description: "跳过设计系统生成（可选）。默认为 false。如果设置为 true，将不生成设计系统。",
    },
    docs_dir: {
      type: "string",
      description: "文档输出目录（可选）。默认为 'docs'。所有文档将保存到此目录下的子目录中。",
    },
    project_root: {
      type: "string",
      description: "目标项目根目录绝对路径。建议显式传入，避免文档和 Skill 写入 MCP 包安装目录。",
    },
  },
  required: [],
};

export const productDesignSchemas = [
  {
    name: "start_product",
    description: "产品设计完整工作流入口。返回闭环 delegated plan：Agent 生成 PRD 与原型文档，调用 ui_design_system 和 start_ui 完成设计系统及可交互 HTML 原型，并更新项目上下文；不会引用不存在的 gen_prd/gen_prototype 工具。",
    inputSchema: startProductSchema,
  },
];
