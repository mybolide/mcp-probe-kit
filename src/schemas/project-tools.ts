/**
 * 项目管理工具的 Schema 定义
 */

import { PROJECT_ROOT_SCHEMA_DESCRIPTION } from "../lib/workspace-root.js";

export const projectToolSchemas = [
  {
    name: "workflow",
    description:
      "仅当 Agent 阅读 Skill 和各工具 description 后仍不确定该调用哪个 MCP 时使用的兜底选择指南。workflow 不做自然语言意图识别：scenario=auto（默认）只返回工具选择规则与速查表，不从 intent 猜 firstTool；Agent 根据完整对话自行判断或澄清。若 Agent 已明确场景，可传显式 scenario 获取该场景的确定性 firstTool、phases 和参数提示。同时确保用户项目已存在 .agents/skills/mcp-probe-kit/SKILL.md 与 AGENTS.md 中的 Skill 引用（缺失则自动创建/更新）。",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description:
            "可选上下文摘要。scenario=auto 时仅供指南展示，不参与自动分类；显式 scenario 时用于生成该场景的参数提示和阶段说明。",
        },
        scenario: {
          type: "string",
          enum: ["auto", "feature", "bugfix", "ui", "product", "ralph", "architecture", "arch", "explore", "commit", "work_report", "report", "test", "review", "refactor", "onboard", "spec", "memory"],
          description: "可选：显式场景。默认 auto 只返回 Agent 工具选择指南，不从 intent 推断场景；Agent 已确定场景时传 feature/bugfix/ui/... 获取确定性流程说明",
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
  {
    name: "init_project_context",
    description:
      "生成/更新项目上下文写作计划（delegated）：MCP 写入 AGENTS.md 与 layout.json；project-context 分类文档与 graph-insights 由 Agent 按返回的 plan 落盘。新功能请先 start_feature，修 bug 请先 start_bugfix。",
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
    description:
      "原子规格生成工具：根据已经确定的 feature_name、description、spec_layout 和可选 subspecs，返回 flat 或 parent-child 规格模板与落盘计划。它不负责判断需求复杂度，也不是复杂功能的首个入口。新功能、跨模块升级或布局未确定时必须先调用 start_feature；通常仅按 start_feature 返回的 delegated plan 调用本工具。",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          maxLength: 120,
          description: "功能名称（kebab-case 格式，如 user-auth）。可选，如果不提供会从 description 自动提取",
        },
        description: {
          type: "string",
          description:
            "已经收敛的功能描述。简单 flat 规格可使用简短描述；parent-child 必须包含完整范围、跨模块契约和边界，并同时提供 subspecs。复杂需求若尚未完成布局和子规格拆分，请先调用 start_feature。",
        },
        docs_dir: {
          type: "string",
          maxLength: 240,
          description: "文档输出目录，默认为 docs",
        },
        template_profile: {
          type: "string",
          description: "模板档位：auto（默认，自动选择 guided/strict）、guided（普通模型友好）或 strict（结构更紧凑）",
        },
        spec_layout: {
          type: "string",
          enum: ["flat", "parent-child"],
          description: "规格布局：flat（默认）或 parent-child（由 Agent 落盘母/子规格）",
        },
        subspecs: {
          type: "array",
          maxItems: 50,
          description: "parent-child 的子规格定义；每项包含 id、title、fr 和可选 dependsOn",
          items: {
            type: "object",
            properties: {
              id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 120, description: "唯一的小写 kebab-case 子规格 ID" },
              title: { type: "string", minLength: 1, maxLength: 120, description: "子规格标题" },
              fr: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", pattern: "^FR-\\d+$" }, description: "负责的 FR-n 列表" },
              dependsOn: { type: "array", maxItems: 50, items: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }, description: "依赖的子规格 ID" },
            },
            required: ["id", "title", "fr"],
            additionalProperties: false,
          },
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
          type: "integer",
          minimum: 1,
          description: "团队规模（人数）。可选，默认为 1",
        },
        experience_level: {
          type: "string",
          enum: ["junior", "mid", "senior"],
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
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          maxLength: 120,
          description: "要校验的规格目录名，对应 docs/specs/<feature_name>/",
        },
        docs_dir: {
          type: "string",
          maxLength: 240,
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
