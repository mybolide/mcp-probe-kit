/**
 * 智能编排工具的 Schema 定义
 */

export const orchestrationToolSchemas = [
  {
    name: "start_feature",
    description: "当用户需要完整的新功能开发流程时使用。编排：检查上下文→生成规格→估算工作量。若只需规格文档请用 add_feature",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "功能名称（kebab-case 格式，如 user-auth）。可选，如果不提供会从 description 自动提取",
        },
        description: {
          type: "string",
          description: "功能详细描述。可以是简短的自然语言（如'开发用户认证功能'）或详细的需求说明",
        },
        docs_dir: {
          type: "string",
          description: "文档输出目录，默认为 docs",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_bugfix",
    description: "当用户需要完整的 Bug 修复流程时使用。编排：检查上下文→分析定位→修复方案→生成测试。",
    inputSchema: {
      type: "object",
      properties: {
        error_message: {
          type: "string",
          description: "错误信息",
        },
        stack_trace: {
          type: "string",
          description: "堆栈跟踪。可选",
        },
        code_context: {
          type: "string",
          description: "相关代码。可选",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_review",
    description: "当用户需要全面审查代码时使用。编排：代码审查+安全扫描+性能分析，输出综合报告。若只需单项请用对应工具",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要审查的代码",
        },
        language: {
          type: "string",
          description: "编程语言。可选，会自动识别",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_release",
    description: "当用户需要准备版本发布时使用。编排：生成 Changelog→生成 PR 描述。若只需单项请用 genchangelog 或 genpr",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "版本号（如 v1.2.0）",
        },
        from_tag: {
          type: "string",
          description: "起始 tag。可选",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_refactor",
    description: "当用户需要完整的代码重构流程时使用。编排：审查现状→重构建议→生成测试。若只需建议请用 refactor",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要重构的代码",
        },
        goal: {
          type: "string",
          description: "重构目标。可选",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_onboard",
    description: "当用户需要快速上手新项目时使用。编排：生成上下文文档。",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "项目路径。可选，默认当前目录",
        },
        docs_dir: {
          type: "string",
          description: "文档目录。可选，默认 docs",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_api",
    description: "当用户需要完整的 API 开发流程时使用。编排：生成文档→生成 Mock→生成测试。若只需单项请用对应生成工具",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "API 代码",
        },
        language: {
          type: "string",
          description: "编程语言。可选，会自动识别",
        },
        format: {
          type: "string",
          description: "文档格式。可选，默认 openapi",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_doc",
    description: "当用户需要补全项目文档时使用。编排：注释→README→API 文档。若只需单项文档请用对应生成工具",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "代码或项目信息",
        },
        project_info: {
          type: "string",
          description: "项目信息。可选",
        },
        style: {
          type: "string",
          description: "文档风格。可选，默认 jsdoc",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_ralph",
    description: "当用户需要启动 Ralph Wiggum Loop 循环开发时使用。生成 .ralph/ 目录结构、安全模式脚本和执行指南。默认启用多重安全保护，防止无人值守时费用失控",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "本次要完成的目标/需求描述。例如：'实现用户认证功能'、'修复登录 bug'",
        },
        mode: {
          type: "string",
          description: "运行模式：safe（安全模式，默认）、normal（普通模式）。安全模式包含多重保护机制",
        },
        completion_promise: {
          type: "string",
          description: "完成条件描述。默认：'tests passing + requirements met'",
        },
        test_command: {
          type: "string",
          description: "每轮执行的测试命令。默认：'npm test'（会在首轮由 agent 识别正确命令）",
        },
        cli_command: {
          type: "string",
          description: "Claude Code CLI 命令名。默认：'claude-code'（可能需要改为 'claude'）",
        },
        max_iterations: {
          type: "number",
          description: "最大迭代轮数。safe 模式默认：8",
        },
        max_minutes: {
          type: "number",
          description: "最大运行分钟数。safe 模式默认：25",
        },
        confirm_every: {
          type: "number",
          description: "每几轮要求人工确认。safe 模式默认：1（每轮都确认）",
        },
        confirm_timeout: {
          type: "number",
          description: "确认等待秒数，超时自动停止。safe 模式默认：20",
        },
        max_same_output: {
          type: "number",
          description: "输出重复多少次停止（防卡死）。safe 模式默认：2",
        },
        max_diff_lines: {
          type: "number",
          description: "git diff 变更行数超过此值停止（防失控）。safe 模式默认：300",
        },
        cooldown_seconds: {
          type: "number",
          description: "每轮后冷却秒数。safe 模式默认：8",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
