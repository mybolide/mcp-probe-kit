/**
 * 代码分析工具的 Schema 定义
 */

export const codeAnalysisToolSchemas = [
  {
    name: "code_review",
    description: "当用户需要审查代码质量、检查代码问题时使用。审查代码的质量、安全性、性能，输出结构化问题清单（severity/category/suggestion）",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要审查的代码。可以是代码片段、完整文件或 git diff 输出",
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
          description: "项目根目录。当前客户端未把工作区作为进程 cwd 传进来时，建议显式指定",
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
    description: "当用户需要重构代码、改善代码结构时使用。分析代码结构，提供重构建议、重构步骤和风险评估",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要重构的代码",
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
    description: "当用户需要找问题、修 bug、排查异常、定位回归、分析失败原因、分析为什么没生效、先分析再修时使用。默认采用 TBP 8 步法做真因分析，并输出修复方案与验证步骤",
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
        analysis_mode: {
          type: "string",
          description: "分析方法。默认 tbp8（丰田问题分析 8 步法）",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
