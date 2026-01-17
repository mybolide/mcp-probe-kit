/**
 * 基础工具的 Schema 定义
 */

export const basicToolSchemas = [
  {
    name: "detect_shell",
    description: "当用户询问当前 AI 环境、是否为套壳产品时使用。检测 AI 应用环境指纹，返回 JSON 检测报告",
    inputSchema: {
      type: "object",
      properties: {
        nonce: {
          type: "string",
          description: "随机数，用于网络检测。可选",
        },
        skip_network: {
          type: "boolean",
          description: "是否跳过网络检测。可选，默认 false",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "init_setting",
    description: "当用户需要初始化或配置 Cursor IDE 设置时使用。写入推荐的 AI 配置到 .cursor/settings.json",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "项目路径。可选，默认为当前工作区路径",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
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
