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
  {
    name: "check_deps",
    description: "当用户需要检查项目依赖健康度、查找过期依赖时使用。检查依赖版本、安全漏洞、体积，输出升级建议",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: true,
    },
  },
  // 工具类
  {
    name: "convert",
    description: "当用户需要转换代码格式或框架时使用。转换代码（JS→TS/Class→Hooks/Vue2→Vue3），保持逻辑不变",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要转换的代码",
        },
        from: {
          type: "string",
          description: "源格式：js、class、vue2。可选，会自动识别",
        },
        to: {
          type: "string",
          description: "目标格式：ts、hooks、vue3。可选，会自动识别",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "css_order",
    description: "当用户需要整理 CSS 属性顺序时使用。重排 CSS 属性顺序，按布局→盒模型→视觉→其他规则整理",
    inputSchema: {
      type: "object",
      properties: {
        css: {
          type: "string",
          description: "CSS 代码。可选，如果不提供会处理当前文件",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "split",
    description: "当用户需要拆分大文件、模块化代码时使用。将大文件拆分为小模块，按类型/功能/组件策略拆分",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "要拆分的文件内容",
        },
        strategy: {
          type: "string",
          description: "拆分策略：auto（自动）、by-type（按类型）、by-function（按功能）。可选，默认 auto",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
