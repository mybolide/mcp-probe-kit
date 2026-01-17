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
  {
    name: "genchangelog",
    description: "当用户需要生成版本更新日志、准备发布时使用。根据 commit 历史生成 CHANGELOG，按 feat/fix/breaking 分类",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "版本号（如 v1.2.0）。可选，如果不提供会提示用户输入",
        },
        from: {
          type: "string",
          description: "起始 tag 或 commit。可选，默认为上一个 tag",
        },
        to: {
          type: "string",
          description: "结束 tag 或 commit。可选，默认为 HEAD",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "genpr",
    description: "当用户需要创建 Pull Request、生成 PR 描述时使用。分析 commit 历史，生成包含变更摘要、影响范围、测试说明的 PR 描述",
    inputSchema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description: "分支名称。可选，默认为当前分支",
        },
        commits: {
          type: "string",
          description: "Commit 历史。可选，会自动获取 git log",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "resolve_conflict",
    description: "当用户遇到 Git 合并冲突、需要解决冲突时使用。分析冲突内容（<<<<<<< ======= >>>>>>>），理解双方意图，提供解决方案",
    inputSchema: {
      type: "object",
      properties: {
        conflicts: {
          type: "string",
          description: "Git 冲突内容。包含 <<<<<<< ======= >>>>>>> 标记的文件内容",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
