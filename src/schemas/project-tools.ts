/**
 * 项目管理工具的 Schema 定义
 */

import { PROJECT_ROOT_SCHEMA_DESCRIPTION } from "../lib/workspace-root.js";

export const projectToolSchemas = [
  {
    name: "workflow",
    description:
      "当不确定该用哪个 MCP 工具时使用。根据意图返回分阶段 MCP 指南（firstTool + phases）。同时确保用户项目已存在 .agents/skills/mcp-probe-kit/SKILL.md 与 AGENTS.md 中的 Skill 引用（缺失则自动创建/更新）。",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "用户目标或任务描述（自然语言）",
        },
        scenario: {
          type: "string",
          enum: ["auto", "feature", "bugfix", "ui", "explore", "commit", "review", "refactor", "onboard", "spec", "memory"],
          description: "可选：显式场景；默认 auto 从 intent 推断",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "init_project_context",
    description:
      "生成/更新项目上下文：默认写入 AGENTS.md（含 MCP 与 GitNexus 触发规则）及 docs/project-context/。新功能请先 start_feature，修 bug 请先 start_bugfix。完成后 Agent 应阅读 AGENTS.md。",
    inputSchema: {
      type: "object",
      properties: {
        docs_dir: {
          type: "string",
          description: "附属文档根目录（project-context、graph-insights）。默认 docs",
        },
        index_style: {
          type: "string",
          enum: ["auto", "agents", "legacy"],
          description: "索引风格：auto（默认 AGENTS.md）、agents、legacy（docs/project-context.md）",
        },
        output: {
          type: "string",
          description: "高级：索引文件相对路径，如 AGENTS.md",
        },
        output_dir: {
          type: "string",
          description: "高级：索引所在目录，如 .claude/rules",
        },
        filename: {
          type: "string",
          description: "高级：与 output_dir 合用，默认 project-context.md",
        },
        locale: {
          type: "string",
          enum: ["en", "zh-CN"],
          description: "AGENTS.md 语言；默认根据 README 探测",
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
  {
    name: "check_spec",
    description: "校验已落盘的功能规格（docs/specs/<feature_name>/requirements|design|tasks.md）是否完整：检测残留 [填写] 占位、缺失章节、缺 FR/验收标准、FR 未进覆盖矩阵。写完规格后、进入实现前调用；未通过按报告补全后重跑。",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "要校验的规格目录名，对应 docs/specs/<feature_name>/",
        },
        docs_dir: {
          type: "string",
          description: "文档根目录，默认为 docs",
        },
        project_root: {
          type: "string",
          description: PROJECT_ROOT_SCHEMA_DESCRIPTION,
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
