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
    name: 'delete_memory_asset',
    description:
      '按 asset_id 从共享记忆库删除一条资产。适用于过时、错误或重复沉淀的清理；删除前建议先用 read_memory_asset 确认内容。',
    inputSchema: {
      type: 'object',
      properties: {
        asset_id: {
          type: 'string',
          description: '要删除的记忆资产 ID（通常来自 search_memory 或 read_memory_asset）',
        },
        confirm: {
          type: 'boolean',
          description: '为 true 时执行删除；省略或 false 时仅返回预览并要求确认（软确认）',
        },
      },
      required: ['asset_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'update_memory_asset',
    description:
      '按 asset_id 更新共享记忆库中的已有资产（保留原 ID）。适用于修正摘要、正文或标签；content 变更会重新向量化。跨仓库共享时勿填 source_project/source_path。',
    inputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: '要更新的记忆资产 ID' },
        name: { type: 'string', description: '资产名称' },
        type: { type: 'string', description: '资产类型：bugfix / pattern / component / code 等' },
        description: { type: 'string', description: '资产描述' },
        summary: { type: 'string', description: '检索用一句话摘要' },
        content: { type: 'string', description: '完整内容' },
        code_snippet: { type: 'string', description: '代码片段，content 的别名' },
        file_path: { type: 'string', description: '已废弃：勿用于跨仓库沉淀，路径写入 content' },
        source_project: { type: 'string', description: '已废弃：仅同仓库追溯时可选' },
        source_path: { type: 'string', description: '已废弃：仅同仓库追溯时可选' },
        usage: { type: 'string', description: '适用场景/使用方式' },
        confidence: { type: 'number', description: '置信度，0-1' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
      },
      required: ['asset_id'],
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
] as const;