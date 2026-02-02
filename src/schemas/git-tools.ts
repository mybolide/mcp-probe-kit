/**
 * Git 相关工具的 Schema 定义
 */

export const gitToolSchemas = [
  {
    name: "gencommit",
    description: "当用户需要生成 Git commit 消息时使用。返回 Conventional Commits 规范指南，AI 根据指南和变更内容生成符合规范的提交消息",
    inputSchema: {
      type: "object",
      properties: {
        changes: {
          type: "string",
          description: "代码变更内容。可以是 git diff 输出、变更描述或自然语言。如果不提供，工具会提示执行 git diff",
        },
        type: {
          type: "string",
          description: "Commit 类型：fixed（修复）、feat（新功能）、docs（文档）、style（样式）、chore（杂项）、refactor（重构）、test（测试）。可选，会自动识别",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
