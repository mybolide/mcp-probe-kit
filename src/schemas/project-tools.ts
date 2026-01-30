/**
 * 项目管理工具的 Schema 定义
 */

export const projectToolSchemas = [
  {
    name: "init_project_context",
    description: "当用户需要生成项目上下文文档、帮助团队快速上手时使用。生成项目上下文文档（技术栈/架构/编码规范），供后续开发参考",
    inputSchema: {
      type: "object",
      properties: {
        docs_dir: {
          type: "string",
          description: "文档目录。可选，默认 docs",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "add_feature",
    description: "当用户需要添加新功能、生成功能规格文档时使用。生成新功能规格文档（需求/设计/任务清单），基于项目上下文",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "功能名称（kebab-case 格式，如 user-auth）。可选，如果不提供会从 description 自动提取",
        },
        description: {
          type: "string",
          description: "功能详细描述。可以是简短的自然语言（如'添加用户认证功能'）或详细的需求说明",
        },
        docs_dir: {
          type: "string",
          description: "文档输出目录，默认为 docs",
        },
        template_profile: {
          type: "string",
          description: "模板档位：auto（默认，自动选择 guided/strict）、guided（普通模型友好）或 strict（结构更紧凑）",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "estimate",
    description: "当用户需要估算开发工作量、评估任务时间时使用。估算开发工作量，输出故事点、时间范围（乐观/正常/悲观）、风险点",
    inputSchema: {
      type: "object",
      properties: {
        task_description: {
          type: "string",
          description: "任务描述。可以是简短的自然语言（如'估算开发工作量'）或详细的任务说明",
        },
        code_context: {
          type: "string",
          description: "相关代码或文件上下文。可选，有助于更准确的估算",
        },
        team_size: {
          type: "number",
          description: "团队规模（人数）。可选，默认为 1",
        },
        experience_level: {
          type: "string",
          description: "经验水平：junior（初级）、mid（中级）、senior（高级）。可选，默认为 mid",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
