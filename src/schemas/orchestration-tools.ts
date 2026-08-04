/**
 * 智能编排工具的 Schema 定义
 */

export const orchestrationToolSchemas = [
  {
    name: "start_feature",
    description:
      "新功能、功能增强、大版本升级或跨模块研发的首选入口。Agent 必须把当前对话已确认的完整目标、范围、模块、阶段和约束汇总到 description；用户只说“继续/开始/往下做”时不得原样透传。默认 spec_layout=auto，复杂多模块或多阶段需求会先生成 parent-child 子规格拆分计划，再进入 add_feature→check_spec→实现。仅在规格布局和子规格已明确、且只需渲染规格模板时才直接用 add_feature。",
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
          description: "功能详细描述。应汇总当前对话已经确认的完整范围、模块、阶段和约束，不要只传最后一句简短确认；该字段也用于自动判断 flat / parent-child。",
        },
        docs_dir: {
          type: "string",
          maxLength: 240,
          description: "文档输出目录，默认为 docs",
        },
        project_root: {
          type: "string",
          description: "项目根目录绝对路径。建议显式传入；docs_dir 等相对路径参数应统一相对该项目根目录解析，避免依赖客户端 cwd。",
        },
        template_profile: {
          type: "string",
          description: "模板档位：auto（默认，自动选择 guided/strict）、guided（普通模型友好）或 strict（结构更紧凑）",
        },
        spec_layout: {
          type: "string",
          enum: ["auto", "flat", "parent-child"],
          description: "规格布局：auto（默认，复杂多模块需求自动选择 parent-child）、flat 或 parent-child。显式值优先于自动判断。",
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
        requirements_mode: {
          type: "string",
          description: "需求模式：steady（默认，直接生成规格）或 loop（需求澄清与补全）",
        },
        loop_max_rounds: {
          type: "number",
          description: "需求 loop 最大轮次（默认 2）",
        },
        loop_question_budget: {
          type: "number",
          description: "每轮最多提问数量（默认 5）",
        },
        loop_assumption_cap: {
          type: "number",
          description: "每轮假设上限（默认 3）",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "start_bugfix",
    description: "当用户需要找问题、修 bug、排查异常时使用。默认按 SRC-8（TBP-inspired）编排：收敛边界→真因工作表→修复→测试→记忆沉淀。",
    inputSchema: {
      type: "object",
      properties: {
        error_message: {
          type: "string",
          description: "错误信息（可与 description 二选一）",
        },
        description: {
          type: "string",
          description: "Bug 描述（与 error_message 同义；仅传 description 时自动作为错误信息）",
        },
        stack_trace: {
          type: "string",
          description: "堆栈跟踪。可选",
        },
        code_context: {
          type: "string",
          description: "相关代码。可选",
        },
        project_root: {
          type: "string",
          description: "项目根目录绝对路径。建议显式传入；docs_dir 等相对路径参数应统一相对该项目根目录解析，避免依赖客户端 cwd。",
        },
        docs_dir: {
          type: "string",
          description: "文档目录。可选，默认 docs",
        },
        feature_name: {
          type: "string",
          description: "关联功能规格名（对应 docs/specs/<feature_name>/）。提供后或能自动识别时，修复闭环会插入 check_spec 闸门",
        },
        analysis_mode: {
          type: "string",
          description: "分析方法。默认 src8；tbp8 为兼容别名",
        },
        template_profile: {
          type: "string",
          description: "模板档位：auto（默认，自动选择 guided/strict）、guided（普通模型友好）或 strict（结构更紧凑）",
        },
        requirements_mode: {
          type: "string",
          description: "需求模式：steady（默认，直接修复）或 loop（需求澄清与补全）",
        },
        loop_max_rounds: {
          type: "number",
          description: "需求 loop 最大轮次（默认 2）",
        },
        loop_question_budget: {
          type: "number",
          description: "每轮最多提问数量（默认 5）",
        },
        loop_assumption_cap: {
          type: "number",
          description: "每轮假设上限（默认 3）",
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
          description: "项目根目录绝对路径。建议显式传入；如果还传 docs_dir 等相对路径，应统一相对该项目根目录解析。",
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
    name: "start_ralph",
    description: "用于需要多轮小步实现、每轮真实验证和正式收敛的长任务。返回有界 Delegated Plan、每轮 Heartbeat 证据契约和可选前台辅助脚本；不自动运行循环、不创建后台进程。安全停止不等于成功",
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
        max_rounds: {
          type: "number",
          description: "max_iterations 的兼容别名；建议新调用统一使用 max_iterations",
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
        project_root: {
          type: "string",
          description: "目标项目根目录绝对路径。省略时从当前已确认工作区解析",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
