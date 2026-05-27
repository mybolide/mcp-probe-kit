export const memoryToolSchemas = [
  {
    name: 'search_memory',
    description:
      '按语义检索共享记忆库。适合在 start_* 之外主动查找历史 Bug 修复或可复用模式；命中后用 read_memory_asset 读取全文。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索 query（现象、报错、关键词、功能描述等）' },
        type: { type: 'string', description: '优先匹配的资产类型，如 bugfix、pattern、component' },
        tags: { type: 'array', items: { type: 'string' }, description: '优先匹配的标签' },
        limit: { type: 'number', description: '返回条数，默认 MEMORY_SEARCH_LIMIT' },
      },
      required: ['query'],
      additionalProperties: true,
    },
  },
  {
    name: 'read_memory_asset',
    description: '当编排阶段已检索到记忆摘要，且 AI 需要查看完整沉淀代码或详细规范时使用。根据 asset_id 读取记忆资产详情。',
    inputSchema: {
      type: 'object',
      properties: {
        asset_id: {
          type: 'string',
          description: '记忆资产 ID',
        },
      },
      required: ['asset_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'memorize_asset',
    description:
      '沉淀可检索资产到共享记忆库。Bug 修复后必须 type=bugfix，content 含【现象】【根因】【修复】【验证】。跨仓库共享时勿填 source_project/source_path，路径写入 content 即可。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '资产名称' },
        type: { type: 'string', description: '资产类型：bugfix / pattern / component / code 等' },
        description: { type: 'string', description: '资产描述' },
        summary: { type: 'string', description: '检索用一句话摘要（关键词 + 根因/要点）' },
        content: { type: 'string', description: '完整内容（bugfix 建议结构化四段）' },
        code_snippet: { type: 'string', description: '代码片段，content 的别名' },
        file_path: { type: 'string', description: '已废弃：勿用于跨仓库沉淀，路径写入 content' },
        source_project: { type: 'string', description: '已废弃：仅同仓库追溯时可选' },
        source_path: { type: 'string', description: '已废弃：仅同仓库追溯时可选' },
        usage: { type: 'string', description: '适用场景/使用方式' },
        confidence: { type: 'number', description: '置信度，0-1' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表，如 bugfix, root-cause' },
      },
      required: ['name', 'description', 'summary'],
      additionalProperties: true,
    },
  },
  {
    name: 'scan_and_extract_patterns',
    description: '当需要从单段代码、单文件或整个目录中抽取可复用模式，再决定是否沉淀到记忆系统时使用。目录扫描时，优先传 `project_root` 为项目根目录绝对路径，并让 `directory_path` 传相对项目根的路径，例如 `app/utils`；只有无法确定项目根时，才把 `directory_path` 直接设为绝对路径。不要传带项目名的半相对路径，例如 `font-miniapp-api/app/utils`。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '待分析的代码或文本内容。传入该字段时走单段分析模式' },
        file_path: { type: 'string', description: '来源文件路径。单段分析时作为来源路径使用' },
        project_name: { type: 'string', description: '已废弃，扫描结果不再写入 source_project' },
        directory_path: { type: 'string', description: '要扫描的目录路径。最佳实践是传相对 `project_root` 的路径，例如 `app/utils`；如果拿不到 `project_root`，才传目录绝对路径。不要传带项目名的半相对路径，例如 `font-miniapp-api/app/utils`。' },
        project_root: { type: 'string', description: '项目根目录绝对路径。目录扫描时建议始终传入；传入后，`directory_path` 应写成相对项目根的路径。' },
        max_files: { type: 'number', description: '最多扫描多少个文件，默认 30，最大 200' },
        max_patterns: { type: 'number', description: '最多返回多少个候选模式，默认 20，最大 100' },
        include_extensions: {
          type: 'array',
          items: { type: 'string' },
          description: '允许扫描的文件扩展名列表，例如 [".ts", ".tsx", ".py"]'
        },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: 'cursor_list_conversations',
    description: '读取 Cursor 本地历史会话摘要。适合按标题、工作区列出最近会话，用于续接旧上下文。',
    inputSchema: {
      type: 'object',
      properties: {
        title_query: { type: 'string', description: '按会话标题过滤，支持部分匹配' },
        workspace_query: { type: 'string', description: '按工作区路径过滤，支持部分匹配' },
        include_archived: { type: 'boolean', description: '是否包含已归档会话，默认 false' },
        limit: { type: 'number', description: '最多返回多少条，默认 20，最大 200' },
      },
      required: [],
      additionalProperties: true,
    },
  },
  {
    name: 'cursor_search_conversations',
    description: '在 Cursor 本地历史消息里按关键词、request id 搜索命中内容，可选限定某个会话。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，可传标题片段、正文片段或 request id' },
        composer_id: { type: 'string', description: '可选，限定某个 Cursor 会话 ID' },
        limit: { type: 'number', description: '最多返回多少条，默认 20，最大 200' },
      },
      required: ['query'],
      additionalProperties: true,
    },
  },
  {
    name: 'cursor_read_conversation',
    description: '按 composer_id 读取一条 Cursor 本地会话的消息时间线。',
    inputSchema: {
      type: 'object',
      properties: {
        composer_id: { type: 'string', description: 'Cursor 会话 ID' },
        limit: { type: 'number', description: '最多返回多少条消息，默认 200，最大 2000' },
        include_empty: { type: 'boolean', description: '是否包含空文本消息，默认 false' },
      },
      required: ['composer_id'],
      additionalProperties: true,
    },
  },
] as const;