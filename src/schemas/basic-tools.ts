/**
 * 基础工具的 Schema 定义
 */

export const basicToolSchemas = [
  {
    name: "init_project",
    description: "当用户提供一句话需求时使用。基于 Spec-Driven Development 理念，分析需求并生成完整的项目规格文档（需求分析/技术设计/任务拆解）。适合项目初期的需求澄清和规划",
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "项目需求描述。可以是一句话需求（如'创建电商网站'）或简短的功能描述，工具会自动分析并生成详细的规格文档",
        },
        project_name: {
          type: "string",
          description: "项目名称。可选，默认为'新项目'",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
