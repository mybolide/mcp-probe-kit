/**
 * 代码分析工具的 Schema 定义
 */

export const codeAnalysisToolSchemas = [
  {
    name: "code_review",
    description: "当用户需要审查代码、真实 Git diff 或托管 Plan 的交付一致性时使用。MCP 可确定性收集 changed files、Plan 声明范围、产物、测试、公共契约、架构和 revision 证据；代码语义问题仍由 Agent 审查，不伪装成静态扫描器",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要审查的代码。可以是代码片段、完整文件或 git diff 输出",
        },
        file_path: {
          type: "string",
          description: "要审查的文件路径（相对 project_root 或绝对路径）。未传 code 时从磁盘读取",
        },
        project_root: {
          type: "string",
          description: "项目根目录绝对路径。未传 code/file_path 时，可从该 Git 仓库自动收集真实 diff",
        },
        plan_id: {
          type: "string",
          description: "可选托管 Plan ID。提供后读取 Plan 状态并比较 declaredScope、产物、测试、架构证据和 revision",
        },
        diff_mode: {
          type: "string",
          enum: ["auto", "working", "staged", "range"],
          description: "Git diff 范围。auto 默认审查相对 HEAD 的 staged+unstaged 变更；working 仅未暂存；staged 仅已暂存；range 使用 base_ref/head_ref",
        },
        base_ref: {
          type: "string",
          description: "diff_mode=range 时的基线 Git ref",
        },
        head_ref: {
          type: "string",
          description: "diff_mode=range 时的目标 Git ref",
        },
        max_diff_chars: {
          type: "number",
          description: "最大 diff 字符数，1000-500000，默认 120000。超出时明确标记 truncated",
        },
        focus: {
          type: "string",
          description: "审查重点：security（安全）、performance（性能）、quality（质量）、all（全部）。可选，默认 all",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "code_insight",
    description: "当用户需要基于代码图谱分析调用链、上下文和影响面时使用。默认桥接 GitNexus，支持 query/context/impact 模式；不可用时自动降级并返回原因",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: "分析模式：auto（默认）、query、context、impact",
        },
        query: {
          type: "string",
          description: "查询文本（query 模式推荐）",
        },
        target: {
          type: "string",
          description: "目标符号（context/impact 模式推荐）",
        },
        repo: {
          type: "string",
          description: "仓库名称（多仓库场景可选）",
        },
        project_root: {
          type: "string",
          description: "项目根目录绝对路径。建议显式传入；当调用里还包含相对路径参数时，应统一相对该项目根目录解析，避免依赖客户端 cwd。",
        },
        goal: {
          type: "string",
          description: "分析目标（可选）",
        },
        task_context: {
          type: "string",
          description: "任务上下文（可选）",
        },
        direction: {
          type: "string",
          description: "impact 方向：upstream / downstream",
        },
        max_depth: {
          type: "number",
          description: "impact 最大深度（可选，默认 3）",
        },
        include_tests: {
          type: "boolean",
          description: "impact 是否包含测试文件（可选，默认 false）",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "refactor",
    description: "当用户需要重构代码、改善代码结构时使用。指南型工具：注入 code/file_path 与重构清单，由 Agent 分析后输出重构计划 JSON；MCP 不自动修改源文件",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要重构的代码",
        },
        file_path: {
          type: "string",
          description: "要重构的文件路径（相对 project_root 或绝对路径）。未传 code 时从磁盘读取",
        },
        project_root: {
          type: "string",
          description: "项目根目录绝对路径。配合 file_path 解析相对路径",
        },
        goal: {
          type: "string",
          description: "重构目标：improve_readability（可读性）、reduce_complexity（复杂度）、performance（性能）。可选",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "fix_bug",
    description: "当用户需要找问题、修 bug、排查异常时使用。指南型 SRC-8（TBP-inspired）：注入真因工作表与门禁，由 Agent 完成 rootCauseAnalysis 并修复；MCP 不自动修 Bug",
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
          description: "相关代码或图谱摘要。可选",
        },
        file_path: {
          type: "string",
          description: "相关代码文件路径（相对 project_root 或绝对路径）。未传 code_context 时从磁盘读取",
        },
        project_root: {
          type: "string",
          description: "项目根目录绝对路径。配合 file_path 解析相对路径",
        },
        actual_behavior: {
          type: "string",
          description: "实际行为。可选，用于 TBP-1 现象定义",
        },
        success_sample: {
          type: "string",
          description: "成功/正常样本描述（Step 4 对比用）。无则 Agent 须标注对比样本不足",
        },
        verification_target: {
          type: "string",
          description: "验收目标（Step 3 SMART 目标），如：原复现步骤通过、特定测试绿",
        },
        steps_to_reproduce: {
          type: "string",
          description: "复现步骤。可选，用于 TBP-2 时间线",
        },
        expected_behavior: {
          type: "string",
          description: "期望行为。可选",
        },
        analysis_mode: {
          type: "string",
          description: "分析方法。默认 src8（Software Root-Cause 8-step，受丰田 TBP 启发）；tbp8 为兼容别名",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
