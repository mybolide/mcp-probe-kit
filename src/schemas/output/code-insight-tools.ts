/**
 * code_insight 结构化输出 Schema（精简版，覆盖 handles 与核心字段）
 */

export const CodeInsightSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['ok', 'degraded', 'ambiguous', 'not_found'],
    },
    provider: { type: 'string' },
    mode: {
      type: 'object',
      properties: {
        requested: { type: 'string' },
        resolved: { type: 'string' },
      },
    },
    summary: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
    nextAction: { type: ['string', 'null'] },
    handles: {
      type: 'object',
      properties: {
        graph_snapshot: { type: 'string' },
        graph_resource: { type: 'string' },
        memory_assets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              tool: { type: 'string' },
            },
            required: ['id', 'tool'],
          },
        },
      },
    },
  },
  required: ['status', 'summary'],
} as const;
