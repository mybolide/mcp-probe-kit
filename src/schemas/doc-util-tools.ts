/**
 * 文档和工具类的 Schema 定义
 */

export const docUtilToolSchemas = [
  // 文档工具
  {
    name: "genreadme",
    description: "当用户需要生成项目 README 文档时使用。生成 README 文档，包含项目介绍/安装/使用/脚本/FAQ",
    inputSchema: {
      type: "object",
      properties: {
        project_info: {
          type: "string",
          description: "项目信息。可以是项目描述、代码或 package.json 内容",
        },
        style: {
          type: "string",
          description: "文档风格：simple（简洁）、detailed（详细）。可选，默认 detailed",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
