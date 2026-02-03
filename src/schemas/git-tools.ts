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
    name: "git_work_report",
    description: `基于 Git diff 分析生成工作报告（日报/周期报）

核心功能：
- 支持日报模式（单个日期）和周期报模式（日期范围）
- 自动读取指定日期的所有 Git 提交
- 对每个提交执行 git show 获取完整 diff
- 使用 AI 分析 diff 内容提取实际工作内容

输出格式：
- 只输出「工作内容」部分
- 每条以 - 开头，中文，简洁专业
- 格式：做了什么 + 改了哪里/达到什么效果
- 不输出：提交哈希、文件列表、统计数据、风险总结

使用示例：
- 日报：git_work_report --date 2026-1-27
- 周期报：git_work_report --start_date 2026-2-1 --end_date 2026-2-6`,
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "单个日期，格式 YYYY-MM-DD（日报模式）",
        },
        start_date: {
          type: "string",
          description: "起始日期，格式 YYYY-MM-DD（周期报模式）",
        },
        end_date: {
          type: "string",
          description: "结束日期，格式 YYYY-MM-DD（周期报模式）",
        },
        output_file: {
          type: "string",
          description: "可选，输出文件路径",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;

