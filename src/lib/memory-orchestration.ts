import type { MemoryAsset, MemorySearchResult } from './memory-client.js';
import { createMemoryClient } from './memory-client.js';
import { getMemoryConfig, type MemoryConfig } from './memory-config.js';
import {
  isNegativeMemoryType,
  resolveMemoryStatus,
} from './memory-model.js';
import { classifyMemoryScope, rankMemorySearchResults } from './memory-ranking.js';
import {
  buildMemoryAssetHandles,
  DEFAULT_GRAPH_RESOURCE_URI,
  mergeHandles,
  type ToolHandles,
} from './handles.js';

export type MemoryPlanKind = 'feature' | 'bugfix' | 'ui' | 'default';

export interface MemoryInjectionContext {
  enabled: boolean;
  available: boolean;
  degraded: boolean;
  query: string;
  results: MemorySearchResult[];
  /** Full assets keyed by search hit id (auto-loaded for start_* injection) */
  assetsById: Record<string, MemoryAsset>;
  error?: string;
}

function formatMemoryScopeLabel(
  item: MemorySearchResult,
  config: MemoryConfig
): string {
  return classifyMemoryScope(item, config) === 'project'
    ? '当前项目（优先）'
    : '跨项目经验（参考）';
}

interface MemoryLookupClient {
  isEnabled(): boolean;
  isReadEnabled(): boolean;
  search(query: string, options?: {
    limit?: number;
    minScore?: number;
    preferTypes?: string[];
    preferTags?: string[];
  }): Promise<MemorySearchResult[]>;
  getAsset(assetId: string): Promise<MemoryAsset | null>;
}

export interface MemoryInjectionOptions {
  client?: MemoryLookupClient;
  config?: MemoryConfig;
}

function kindSearchPreferences(kind: MemoryPlanKind): {
  preferTypes: string[];
  preferTags: string[];
} {
  switch (kind) {
    case 'bugfix':
      return {
        preferTypes: ['bugfix', 'failed_approach', 'false_root_cause', 'regression_case'],
        preferTags: ['bugfix', 'root-cause', 'negative-memory'],
      };
    case 'ui':
      // 做 UI 时也优先捞历史坑（bugfix），避免重复踩同类交互/兼容性坑
      return {
        preferTypes: ['component', 'pattern', 'bugfix', 'failed_approach', 'regression_case'],
        preferTags: ['ui', 'pattern', 'root-cause', 'negative-memory'],
      };
    case 'feature':
      // 做新功能时同时捞「可复用模式」与「历史坑」，让规划前就看到经验与雷区
      return {
        preferTypes: ['pattern', 'code', 'bugfix', 'failed_approach', 'false_root_cause', 'regression_case'],
        preferTags: ['feature', 'pattern', 'root-cause', 'negative-memory'],
      };
    default:
      return { preferTypes: [], preferTags: [] };
  }
}

export function truncateInjectionText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

async function loadFullAssets(
  results: MemorySearchResult[],
  client: MemoryLookupClient
): Promise<Record<string, MemoryAsset>> {
  if (!client.isReadEnabled() || results.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    results.map(async (item) => {
      const asset = await client.getAsset(item.id);
      return asset ? ([item.id, asset] as const) : null;
    })
  );

  return Object.fromEntries(entries.filter((entry): entry is [string, MemoryAsset] => entry !== null));
}

export async function loadMemoryInjectionContext(
  query: string,
  kind: MemoryPlanKind = 'default',
  options: MemoryInjectionOptions = {}
): Promise<MemoryInjectionContext> {
  const client = options.client ?? createMemoryClient();
  const config = options.config ?? getMemoryConfig();
  if (!client.isEnabled()) {
    return {
      enabled: false,
      available: false,
      degraded: false,
      query,
      results: [],
      assetsById: {},
    };
  }

  try {
    const prefs = kindSearchPreferences(kind);
    // feature/ui 同时要「经验」与「坑」两类，默认条数偏少容易只剩一类；放宽下限让两组都有空间
    const baseLimit = config.searchLimit;
    const injectionLimit = (kind === 'feature' || kind === 'ui') ? Math.max(baseLimit, 5) : baseLimit;
    const searchResults = await client.search(query, {
      limit: injectionLimit,
      preferTypes: prefs.preferTypes,
      preferTags: prefs.preferTags,
    });
    const results = rankMemorySearchResults(searchResults, {
      preferTypes: prefs.preferTypes,
      preferTags: prefs.preferTags,
      config,
    }).slice(0, injectionLimit);
    const assetsById = await loadFullAssets(results, client);

    return {
      enabled: true,
      available: true,
      degraded: false,
      query,
      results,
      assetsById,
    };
  } catch (error) {
    return {
      enabled: true,
      available: false,
      degraded: true,
      query,
      results: [],
      assetsById: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatMemoryResultLabel(item: MemorySearchResult): string {
  const kind =
    isNegativeMemoryType(item.type)
      ? '负面经验'
      : item.type === 'bugfix' || item.tags.includes('bugfix')
      ? '历史 Bug 修复'
      : item.type === 'pattern' || item.type === 'component'
        ? '可复用模式'
        : '历史资产';
  return `${item.name} [${item.type}] (${kind})`;
}

export function formatSearchMemoryResultsText(
  results: MemorySearchResult[],
  config: MemoryConfig = getMemoryConfig()
): string {
  if (results.length === 0) {
    return '未找到相关记忆';
  }

  const header = `找到 ${results.length} 条相关记忆`;
  const items = results.map((item, index) => {
    const lines = [
      `${index + 1}. ${item.name} [${item.type}] score=${item.score.toFixed(3)}`,
      `   - id: ${item.id}`,
      item.summary ? `   - 摘要: ${item.summary}` : '',
      item.description ? `   - 描述: ${item.description}` : '',
      item.tags.length > 0 ? `   - 标签: ${item.tags.join(', ')}` : '',
      `   - 范围: ${formatMemoryScopeLabel(item, config)}`,
      `   - 状态: ${resolveMemoryStatus(item)}`,
      item.applicability ? `   - 适用边界: ${item.applicability}` : '',
      (item.evidence?.length ?? 0) > 0
        ? `   - 证据: ${item.evidence?.join(' | ')}`
        : '',
      item.expiresAt ? `   - 失效时间: ${item.expiresAt}` : '',
      item.supersededBy ? `   - 已被替代: ${item.supersededBy}` : '',
    ];
    if (shouldShowSourceInSearch(item, config) && item.sourcePath) {
      lines.push(`   - 来源: ${item.sourcePath}`);
    }
    if (config.searchContentMaxChars > 0) {
      const body = truncateInjectionText(item.content || '', config.searchContentMaxChars);
      lines.push('   --- content ---');
      lines.push(
        body
          ? body
              .split('\n')
              .map((line) => `   ${line}`)
              .join('\n')
          : '   (empty)'
      );
    }
    lines.push(`   - 更长全文: read_memory_asset {"asset_id": "${item.id}"}`);
    return lines.filter(Boolean).join('\n');
  });

  return `${header}\n\n${items.join('\n\n')}`;
}

export function shouldShowSourceInSearch(
  item: MemorySearchResult,
  config: MemoryConfig = getMemoryConfig()
): boolean {
  if (config.searchShowSource) {
    return Boolean(item.sourcePath);
  }
  if (!config.repoId || !item.sourceProject || !item.sourcePath) {
    return false;
  }
  return item.sourceProject === config.repoId;
}

function formatSourceHint(item: MemorySearchResult, config: MemoryConfig): string {
  if (!shouldShowSourceInSearch(item, config)) {
    return '';
  }
  return `\n   - 来源: ${item.sourcePath}`;
}

export function formatMemoryAssetText(
  asset: MemoryAsset,
  options?: { maxContentChars?: number }
): string {
  const content =
    options?.maxContentChars !== undefined
      ? truncateInjectionText(asset.content, options.maxContentChars)
      : asset.content;

  const lines = [
    `### ${asset.name}`,
    `- asset_id: ${asset.id}`,
    asset.type ? `- type: ${asset.type}` : '',
    asset.summary ? `- 摘要: ${asset.summary}` : '',
    asset.description ? `- 描述: ${asset.description}` : '',
    asset.usage ? `- 适用: ${asset.usage}` : '',
    asset.applicability ? `- 适用边界: ${asset.applicability}` : '',
    `- 状态: ${resolveMemoryStatus(asset)}`,
    (asset.evidence?.length ?? 0) > 0
      ? `- 证据:\n${asset.evidence?.map((item) => `  - ${item}`).join('\n')}`
      : '',
    asset.expiresAt ? `- 失效时间: ${asset.expiresAt}` : '',
    (asset.supersedes?.length ?? 0) > 0
      ? `- 替代资产: ${asset.supersedes?.join(', ')}`
      : '',
    asset.supersededBy ? `- 已被替代: ${asset.supersededBy}` : '',
    asset.tags.length > 0 ? `- 标签: ${asset.tags.join(', ')}` : '',
    asset.sourcePath ? `- 来源: ${asset.sourcePath}` : '',
    '',
    '--- content ---',
    content || '(empty)',
  ].filter(Boolean);

  return lines.join('\n');
}

export function formatReadMemoryAssetText(asset: MemoryAsset): string {
  return `已读取记忆资产: ${asset.name}\n\n${formatMemoryAssetText(asset)}`;
}

function formatAssetBody(asset: MemoryAsset, config: MemoryConfig): string {
  return formatMemoryAssetText(asset, { maxContentChars: config.injectionContentMaxChars });
}

function formatResultBlock(
  item: MemorySearchResult,
  index: number,
  context: MemoryInjectionContext,
  config: MemoryConfig
): string {
  const label = formatMemoryResultLabel(item);
  const asset = context.assetsById[item.id];
  const header = `${index + 1}. ${label} score=${item.score.toFixed(3)}\n   - 摘要: ${item.summary}${formatSourceHint(item, config)}`;
  const scopedHeader = `${header}\n   - 范围: ${formatMemoryScopeLabel(item, config)}`;

  if (asset) {
    return `${scopedHeader}\n\n${formatAssetBody(asset, config)}\n`;
  }

  return `${scopedHeader}\n   - 全文加载失败，可手动: read_memory_asset {"asset_id": "${item.id}"}\n`;
}

function isPitfallResult(item: MemorySearchResult): boolean {
  return isNegativeMemoryType(item.type)
    || item.type === 'bugfix'
    || item.tags.includes('bugfix')
    || item.tags.includes('root-cause');
}

export function renderMemoryGuideSection(context: MemoryInjectionContext): string {
  const config = getMemoryConfig();

  if (!context.enabled) {
    return '';
  }

  if (!context.available) {
    return `\n\n## 🧠 历史经验与坑（记忆库）\n- 状态: 已配置但本次检索降级\n- 原因: ${context.error || '未知错误'}\n- 处理: 忽略记忆注入，继续主流程\n`;
  }

  if (context.results.length === 0) {
    return `\n\n## 🧠 历史经验与坑（记忆库）\n- 状态: 已启用\n- 检索结果: 未找到高相关记录（含历史 Bug 修复与可复用模式）\n- 处理: 继续主流程；验证后先准备成功或负面记忆候选并写入 \`plan_heartbeat\`，只有 \`converge\` 通过后才正式调用 \`memorize_asset\`\n`;
  }

  const loadedCount = context.results.filter((item) => Boolean(context.assetsById[item.id])).length;
  const pitfalls = context.results.filter(isPitfallResult);
  const experiences = context.results.filter((item) => !isPitfallResult(item));
  const renderGroup = (items: MemorySearchResult[]): string =>
    items.map((item, index) => formatResultBlock(item, index, context, config)).join('\n');

  const blocks: string[] = [
    `\n\n## 🧠 历史经验与坑（记忆库）`,
    `- 状态: 已启用`,
    `- 指令: 下列为已自动加载的历史经验全文（${loadedCount}/${context.results.length} 条）；开干前直接复用，无需再调 \`read_memory_asset\``,
    `- 权威规则: 当前项目代码、规格和当前项目记忆优先；跨项目经验只用于启发，不得覆盖当前项目事实`,
    `- 用法: 先逐条核对「历史坑」是否已在本次设计中规避，再复用「可复用经验」，据此收敛需求范围`,
  ];

  if (pitfalls.length > 0) {
    blocks.push(`\n### ⚠️ 历史坑（务必规避，共 ${pitfalls.length} 条）\n${renderGroup(pitfalls)}`);
  }
  if (experiences.length > 0) {
    blocks.push(`\n### ♻️ 可复用经验 / 相关历史（共 ${experiences.length} 条）\n${renderGroup(experiences)}`);
  }

  return blocks.join('\n');
}

export function buildMemoryInjectionHandles(context: MemoryInjectionContext): ToolHandles {
  if (!context.enabled || context.results.length === 0) {
    return {};
  }

  return {
    memory_assets: buildMemoryAssetHandles(
      context.results.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        summary: item.summary,
      }))
    ),
  };
}

export function buildOrchestrationHandles(
  memoryContext?: MemoryInjectionContext,
  options?: { graphResourceUri?: string }
): ToolHandles {
  const memoryHandles = memoryContext ? buildMemoryInjectionHandles(memoryContext) : {};
  return mergeHandles(memoryHandles, {
    graph_resource: options?.graphResourceUri ?? DEFAULT_GRAPH_RESOURCE_URI,
  });
}

export function buildMemoryPlanStep(kind: MemoryPlanKind = 'default') {
  if (kind === 'bugfix') {
    return {
      id: 'prepare-memory-candidate-bugfix',
      action: 'prepare_memory_candidate',
      when: '每轮验证后整理候选：修复成功为 bugfix；方案失败为 failed_approach；根因被证伪为 false_root_cause；发现回归为 regression_case',
      args: {
        name: '[问题简述，如 登录超时-Redis连接池]',
        type: '[bugfix | failed_approach | false_root_cause | regression_case]',
        description: '[现象、报错信息、复现条件]',
        summary: '[检索用：关键词 + 已验证结论，一句话]',
        content:
          '【现象】...\n【假设/根因】...\n【尝试/修复】...\n【验证】成功、失败、证伪或回归证据',
        evidence: ['[测试、日志、反例或监控证据]'],
        applicability: '[适用条件、边界和不适用场景]',
        usage: '[再次遇到何种症状时可参考或应避免]',
        tags: ['[按结论填写 bugfix/root-cause/negative-memory]'],
        confidence: 0.85,
      },
      outputs: ['MemoryCandidate（成功、失败、证伪或回归）'],
      note: '本步只准备候选并通过 plan_heartbeat 记录证据；converge passed=true 后再调用 memorize_asset 正式写入',
    };
  }

  if (kind === 'ui') {
    return {
      id: 'prepare-memory-candidate-ui',
      action: 'prepare_memory_candidate',
      when: 'UI 实现与验证完成后，评估是否存在可复用组件/布局/交互模式',
      args: {
        name: '[UI 资产名称]',
        type: 'component',
        description: '[该 UI 模式解决什么问题]',
        summary: '[检索用摘要]',
        content: '[组件结构、样式约定或可复用片段]',
        usage: '[适用页面/场景]',
        tags: ['ui', 'pattern'],
        confidence: 0.75,
      },
      outputs: ['MemoryCandidate（UI 组件/布局/交互模式）'],
      note: '本步只准备候选；converge passed=true 后再调用 memorize_asset 正式写入',
    };
  }

  if (kind === 'feature') {
    return {
      id: 'prepare-memory-candidate-feature',
      action: 'prepare_memory_candidate',
      when: '功能实现与验证完成后，评估是否存在可复用实现/规范',
      args: {
        name: '[功能/模式名称]',
        type: 'pattern',
        description: '[该资产解决什么问题]',
        summary: '[检索用摘要]',
        content: '[可复用代码或流程]',
        usage: '[适用场景与限制]',
        tags: ['feature', 'pattern'],
        confidence: 0.75,
      },
      outputs: ['MemoryCandidate（功能实现/规范）'],
      note: '本步只准备候选；converge passed=true 后再调用 memorize_asset 正式写入',
    };
  }

  return {
    id: 'prepare-memory-candidate',
    action: 'prepare_memory_candidate',
    when: '本次实现与验证完成后，评估是否存在可复用资产',
    args: {
      name: '[资产名称]',
      type: 'pattern',
      description: '[该资产解决了什么问题]',
      summary: '[用于后续检索的简洁摘要]',
      content: '[可复用代码或规范内容]',
      usage: '[适用场景与限制]',
      tags: ['pattern'],
      confidence: 0.7,
    },
    outputs: ['MemoryCandidate（可复用资产）'],
    note: '本步只准备候选；converge passed=true 后再调用 memorize_asset 正式写入',
  };
}
