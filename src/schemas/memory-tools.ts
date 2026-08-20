import {
  MEMORIZE_ASSET_TOOL_DESCRIPTION,
  MEMORY_SHARED_KNOWLEDGE_RULE,
  SCAN_PATTERN_PERSIST_HINT,
} from '../lib/memory-persistence-guidance.js';

export const memoryToolSchemas = [
  {
    name: 'search_memory',
    description:
      '检索或浏览分层记忆库。默认 mode=semantic 按语义检索；Memory Center 可用 mode=browse 按更新时间分页浏览且不依赖 embedding。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['semantic', 'browse'],
          description: 'semantic=语义检索（默认，query 必填）；browse=按更新时间分页浏览（query 可省略）',
        },
        query: { type: 'string', description: '语义检索 query；mode=semantic 时必填' },
        type: { type: 'string', description: '优先匹配的资产类型，如 bugfix、pattern、component' },
        tags: { type: 'array', items: { type: 'string' }, description: '优先匹配的标签' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: '返回条数；semantic 最大 50，browse 最大 200' },
        offset: { type: 'integer', minimum: 0, description: 'browse 分页偏移量，默认 0' },
        status: {
          type: 'string',
          enum: ['active', 'stale', 'expired', 'superseded', 'retracted'],
          description: 'browse 模式按生命周期状态过滤',
        },
        source_project: { type: 'string', description: 'browse 模式按来源项目过滤' },
        include_inactive: {
          type: 'boolean',
          description: '维护/审计时设为 true，可返回 expired、superseded、retracted 资产；正常研发不要开启',
        },
      },
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
    description: MEMORIZE_ASSET_TOOL_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '抽象化资产名称（勿用文件路径或仓库名）' },
        type: { type: 'string', description: '资产类型：bugfix / pattern / component / code / failed_approach / false_root_cause / regression_case' },
        description: { type: 'string', description: '抽象化描述（现象/模式/问题，勿以项目路径为主）' },
        summary: { type: 'string', description: '检索用一句话摘要（关键词 + 根因/要点；不含仓库名/路径）' },
        content: { type: 'string', description: '完整抽象内容（bugfix 建议【现象】【根因】【修复】【验证】；可选末尾【来源参考】一行）' },
        code_snippet: { type: 'string', description: '代码片段，content 的别名' },
        file_path: { type: 'string', description: 'Agent 沉淀共享知识时禁止传；路径写入 content 末尾【来源参考】' },
        source_project: { type: 'string', description: 'Agent 沉淀共享知识时禁止传；仅 Memory Center browse 过滤用' },
        source_path: { type: 'string', description: 'Agent 沉淀共享知识时禁止传；追溯信息写入 content【来源参考】' },
        usage: { type: 'string', description: '适用场景/使用方式' },
        applicability: { type: 'string', description: '适用条件、边界和不适用场景' },
        evidence: { type: 'array', items: { type: 'string' }, description: '验证证据、失败日志、反例或回归用例；负面记忆必填' },
        status: { type: 'string', enum: ['active', 'stale', 'expired', 'superseded', 'retracted'], description: '生命周期状态，默认 active' },
        expires_at: { type: 'string', description: '自动失效时间，ISO 日期时间' },
        supersedes: { type: 'array', items: { type: 'string' }, description: '本资产替代的旧资产 ID' },
        superseded_by: { type: 'string', description: '兼容字段；新建资产不接受该参数。请先创建 successor，再用 update_memory_asset 更新旧资产' },
        conflict_policy: {
          type: 'string',
          enum: ['reject', 'supersede', 'allow_parallel'],
          description: '同一 type/name/source_project 已有 active 资产但内容不同时的处理：reject（默认）/ supersede / allow_parallel',
        },
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
      '按 asset_id 从共享记忆库删除一条未参与 supersede 链的资产。适用于错误、重复或无价值沉淀；已有关联关系的资产必须改用 update_memory_asset 设置 retracted 并保留 evidence。',
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
      `按 asset_id 更新已有记忆资产（保留原 ID）。可修正内容、证据、适用边界、失效时间及替代关系；content 或生命周期语义变化会重新向量化。${MEMORY_SHARED_KNOWLEDGE_RULE}`,
    inputSchema: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: '要更新的记忆资产 ID' },
        name: { type: 'string', description: '资产名称' },
        type: { type: 'string', description: '资产类型，支持 failed_approach / false_root_cause / regression_case' },
        description: { type: 'string', description: '资产描述' },
        summary: { type: 'string', description: '检索用一句话摘要' },
        content: { type: 'string', description: '完整内容' },
        code_snippet: { type: 'string', description: '代码片段，content 的别名' },
        file_path: { type: 'string', description: 'Agent 更新共享知识时禁止传；路径写入 content 末尾【来源参考】' },
        source_project: { type: 'string', description: 'Agent 更新共享知识时禁止传；仅 Memory Center browse 过滤用' },
        source_path: { type: 'string', description: 'Agent 更新共享知识时禁止传；追溯信息写入 content【来源参考】' },
        usage: { type: 'string', description: '适用场景/使用方式' },
        applicability: { type: 'string', description: '适用条件、边界和不适用场景' },
        evidence: { type: 'array', items: { type: 'string' }, description: '验证证据、失败日志、反例或回归用例' },
        status: { type: 'string', enum: ['active', 'stale', 'expired', 'superseded', 'retracted'], description: '生命周期状态' },
        expires_at: { type: 'string', description: '自动失效时间，ISO 日期时间；空字符串可清除' },
        supersedes: { type: 'array', items: { type: 'string' }, description: '本资产替代的旧资产 ID' },
        superseded_by: { type: 'string', description: '替代本资产的新资产 ID' },
        conflict_policy: {
          type: 'string',
          enum: ['reject', 'supersede', 'allow_parallel'],
          description: '更新后与同身份 active 资产冲突时的处理：reject（默认）/ supersede / allow_parallel',
        },
        confidence: { type: 'number', description: '置信度，0-1' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
      },
      required: ['asset_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'scan_and_extract_patterns',
    description: `当需要从单段代码、单文件或整个目录中抽取可复用模式，再决定是否沉淀到记忆系统时使用。目录扫描时，优先传 project_root 为项目根目录绝对路径，并让 directory_path 传相对项目根的路径，例如 app/utils；只有无法确定项目根时，才把 directory_path 直接设为绝对路径。不要传带项目名的半相对路径，例如 font-miniapp-api/app/utils。${SCAN_PATTERN_PERSIST_HINT}`,
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