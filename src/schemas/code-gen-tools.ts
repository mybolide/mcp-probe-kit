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
] as const;
