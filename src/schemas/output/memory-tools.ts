/**
 * 记忆工具结构化输出 Schema
 */

const MemoryAssetHandleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: '记忆资产 ID' },
    tool: {
      type: 'string',
      enum: ['read_memory_asset', 'update_memory_asset', 'delete_memory_asset'],
      description: '建议调用的 MCP 工具',
    },
    name: { type: 'string' },
    type: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['id', 'tool'],
} as const;

const ToolHandlesSchema = {
  type: 'object',
  properties: {
    memory_assets: {
      type: 'array',
      items: MemoryAssetHandleSchema,
    },
    graph_snapshot: { type: 'string', description: '图谱快照 URI（probe://graph/...）' },
    graph_resource: { type: 'string', description: '图谱资源 URI，通常为 probe://graph/latest' },
  },
  additionalProperties: false,
} as const;

const MemoryAssetSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    description: { type: 'string' },
    summary: { type: 'string' },
    content: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'name'],
} as const;

export const MemorySearchSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    query: { type: 'string' },
    count: { type: 'number' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'number' },
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
          summary: { type: 'string' },
          content: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          sourcePath: { type: 'string' },
        },
        required: ['id'],
      },
    },
    handles: ToolHandlesSchema,
  },
  required: ['enabled', 'results'],
} as const;

export const MemoryAssetDetailSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    asset: MemoryAssetSchema,
    handles: ToolHandlesSchema,
  },
  required: ['enabled'],
} as const;

export const MemorizeResultSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    stored: { type: 'boolean' },
    asset: MemoryAssetSchema,
    warnings: { type: 'array', items: { type: 'string' } },
    handles: ToolHandlesSchema,
  },
  required: ['enabled', 'stored'],
} as const;

export const DeleteMemoryResultSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    deleted: { type: 'boolean' },
    requires_confirmation: { type: 'boolean', description: '为 true 时表示仅预览，需 confirm=true 再删' },
    preview: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string' },
        summary: { type: 'string' },
      },
    },
    asset: MemoryAssetSchema,
    handles: ToolHandlesSchema,
  },
  required: ['enabled', 'deleted'],
} as const;

export const UpdateMemoryResultSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    updated: { type: 'boolean' },
    asset: MemoryAssetSchema,
    warnings: { type: 'array', items: { type: 'string' } },
    handles: ToolHandlesSchema,
  },
  required: ['enabled', 'updated'],
} as const;

export const PatternExtractionSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    scannedFiles: { type: 'number' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          filePath: { type: 'string' },
          summary: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'filePath'],
      },
    },
    handles: ToolHandlesSchema,
  },
  required: ['summary', 'candidates'],
} as const;
