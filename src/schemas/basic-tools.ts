/**
 * 基础工具的 Schema 定义
 */

export const basicToolSchemas = [
  {
    name: "init_project",
    description: "当用户需要创建新项目、生成项目结构时使用。按 Spec-Driven Development 方式生成需求/设计/任务文档",
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "项目需求描述。可以是简短描述（如'创建电商网站'）或详细的功能需求文档",
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
