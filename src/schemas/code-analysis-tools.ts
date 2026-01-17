/**
 * 代码分析工具的 Schema 定义
 */

export const codeAnalysisToolSchemas = [
  {
    name: "debug",
    description: "当用户遇到错误、需要调试问题时使用。分析错误信息和堆栈跟踪，定位问题根因，提供调试策略和解决方案",
    inputSchema: {
      type: "object",
      properties: {
        error: {
          type: "string",
          description: "错误信息。可以是错误消息、堆栈跟踪或完整的错误输出",
        },
        context: {
          type: "string",
          description: "相关代码上下文。可选，有助于更准确的分析",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
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
    name: "explain",
    description: "当用户不理解某段代码、需要代码解释时使用。解释代码逻辑和实现原理，包含执行流程、关键概念",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要解释的代码。可以是代码片段或完整函数",
        },
        context: {
          type: "string",
          description: "业务背景或上下文。可选，有助于更好的解释",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "perf",
    description: "当用户关注代码性能、需要优化性能时使用。分析性能瓶颈（算法/内存/数据库/React渲染），输出瓶颈清单和优化建议",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要分析性能的代码",
        },
        type: {
          type: "string",
          description: "分析类型：algorithm（算法）、memory（内存）、database（数据库）、react（React渲染）。可选，会自动识别",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "security_scan",
    description: "当用户关注代码安全、需要检查安全漏洞时使用。扫描安全漏洞（注入/认证/加密/敏感数据），输出风险清单和修复建议",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要扫描的代码",
        },
        language: {
          type: "string",
          description: "编程语言。可选，会自动识别",
        },
        scan_type: {
          type: "string",
          description: "扫描类型：injection（注入）、auth（认证）、crypto（加密）、all（全部）。可选，默认 all",
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
    name: "fix",
    description: "当用户需要自动修复代码问题（Lint/格式化/类型错误）时使用。自动修复可机械化问题，输出补丁（unified diff）",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要修复的代码",
        },
        type: {
          type: "string",
          description: "修复类型：lint（代码规范）、ts（TypeScript错误）、format（格式化）、import（导入）。可选，会自动识别",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "fix_bug",
    description: "当用户需要修复 Bug、获取修复指导时使用。提供 Bug 修复流程指导，包含根因分析、修复方案、验证步骤",
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
] as const;
