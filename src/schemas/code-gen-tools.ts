/**
 * 代码生成工具的 Schema 定义
 */

export const codeGenToolSchemas = [
  {
    name: "gentest",
    description: "当用户需要为代码生成单元测试时使用。生成单元测试代码（Jest/Vitest/Mocha），包含边界用例和 mock",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要生成测试的代码。可以是函数、类或模块",
        },
        framework: {
          type: "string",
          description: "测试框架：jest、vitest、mocha。可选，会自动识别项目使用的框架",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "gendoc",
    description: "当用户需要为代码添加注释、生成文档时使用。生成代码注释（JSDoc/TSDoc/Javadoc），补全参数/返回值/异常/示例",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要生成注释的代码",
        },
        style: {
          type: "string",
          description: "注释风格：jsdoc、tsdoc、javadoc。可选，会根据语言自动选择",
        },
        lang: {
          type: "string",
          description: "注释语言：zh（中文）、en（英文）。可选，默认 zh",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "genapi",
    description: "当用户需要生成 API 文档时使用。基于 API 代码（路由/Controller）生成文档（Markdown/OpenAPI/JSDoc），包含参数说明与示例",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "API 代码。可以是路由定义、Controller 或接口函数",
        },
        format: {
          type: "string",
          description: "文档格式：markdown、openapi、jsdoc。可选，默认 markdown",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "genui",
    description: "当用户需要生成 UI 组件代码时使用。根据描述生成 UI 组件代码（React/Vue/HTML），包含 Props 和样式",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "组件描述。可以是简短描述（如'登录表单组件'）或详细的UI需求",
        },
        framework: {
          type: "string",
          description: "前端框架：react、vue、html。可选，默认 react",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "gensql",
    description: "当用户需要根据自然语言生成 SQL 查询时使用。将自然语言描述转换为 SQL 语句（PostgreSQL/MySQL/SQLite）",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "查询需求的自然语言描述。如'查询所有活跃用户的姓名和邮箱'",
        },
        dialect: {
          type: "string",
          description: "SQL 方言：postgres、mysql、sqlite。可选，默认 postgres",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "gen_mock",
    description: "当用户需要生成测试数据、Mock 数据时使用。根据 TypeScript 类型或 JSON Schema 生成 Mock 数据",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: "数据结构定义（TypeScript interface、JSON Schema 或自然语言描述）",
        },
        count: {
          type: "number",
          description: "生成数据条数。可选，默认为 1，范围 1-1000",
        },
        format: {
          type: "string",
          description: "输出格式：json、typescript、javascript、csv。可选，默认为 json",
        },
        locale: {
          type: "string",
          description: "数据语言：zh-CN（中文）、en-US（英文）、ja-JP（日文）。可选，默认为 zh-CN",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "design2code",
    description: "当用户需要将设计稿转换为代码时使用。将设计稿（图片URL/描述/HTML）转换为前端代码（React/Vue），1:1 还原布局和样式",
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "设计稿输入：图片 URL、base64 图片、HTML 代码或设计稿描述",
        },
        framework: {
          type: "string",
          description: "目标框架：vue、react。可选，默认为 vue",
        },
        style_solution: {
          type: "string",
          description: "样式方案：tailwind、css-modules、styled-components。可选，默认为 tailwind",
        },
        component_type: {
          type: "string",
          description: "组件类型：page（页面组件）、component（通用组件）。可选，默认为 page",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
