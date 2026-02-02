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
] as const;
