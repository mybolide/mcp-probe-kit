/**
 * 代码生成工具的 Schema 定义
 */

export const codeGenToolSchemas = [
  {
    name: "gentest",
    description: "当用户需要为代码生成单元测试时使用。指南型工具：注入 code/file_path 与测试清单，由 Agent 生成完整测试代码；MCP 不自动生成或运行测试",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要生成测试的代码。可以是函数、类或模块",
        },
        file_path: {
          type: "string",
          description: "要生成测试的源文件路径（相对 project_root 或绝对路径）。未传 code 时从磁盘读取",
        },
        project_root: {
          type: "string",
          description: "项目根目录绝对路径。配合 file_path 解析相对路径",
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
