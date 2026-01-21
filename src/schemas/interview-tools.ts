/**
 * 访谈工具的 Schema 定义
 */

export const interviewToolSchemas = [
  {
    name: "interview",
    description: "当用户需求不明确、需要澄清需求时使用。需求访谈工具，在开发前通过结构化提问澄清需求，避免理解偏差和返工；生成访谈记录文件供后续 start_feature/add_feature 使用；仅支持 feature 类型",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "功能描述（如'实现用户登录功能'），用于开始访谈。可以是简短的自然语言描述",
        },
        feature_name: {
          type: "string",
          description: "功能名称（kebab-case 格式，如 user-login）。可选，会自动从描述中提取",
        },
        answers: {
          type: "object",
          description: "访谈问题的回答（JSON 对象，key 为问题 ID，value 为回答内容）。用于提交访谈结果",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: "ask_user",
    description: "当 AI 需要更多信息、遇到不确定因素时使用。向用户提问工具，AI 可主动向用户提问；支持单个或多个问题、提供选项、标注重要性；可在任何时候使用",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "单个问题（如'你希望支持哪些支付方式？'）",
        },
        questions: {
          type: "array",
          description: "多个问题列表，每个问题可包含 question、context、options、required 字段",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              context: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              required: { type: "boolean" },
            },
          },
        },
        context: {
          type: "string",
          description: "问题的背景信息或上下文",
        },
        reason: {
          type: "string",
          description: "为什么要问这个问题（提问原因）",
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
] as const;
