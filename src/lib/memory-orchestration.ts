import type { MemoryAsset, MemorySearchResult } from './memory-client.js';
import { createMemoryClient } from './memory-client.js';
import { getMemoryConfig, type MemoryConfig } from './memory-config.js';

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

function kindSearchPreferences(kind: MemoryPlanKind): {
  preferTypes: string[];
  preferTags: string[];
} {
  switch (kind) {
    case 'bugfix':
      return { preferTypes: ['bugfix'], preferTags: ['bugfix', 'root-cause'] };
    case 'ui':
      return { preferTypes: ['component', 'pattern'], preferTags: ['ui', 'pattern'] };
    case 'feature':
      return { preferTypes: ['pattern', 'code'], preferTags: ['feature', 'pattern'] };
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
  results: MemorySearchResult[]
): Promise<Record<string, MemoryAsset>> {
  const client = createMemoryClient();
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
  kind: MemoryPlanKind = 'default'
): Promise<MemoryInjectionContext> {
  const client = createMemoryClient();
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
    const results = await client.search(query, {
      preferTypes: prefs.preferTypes,
      preferTags: prefs.preferTags,
    });
    const assetsById = await loadFullAssets(results);

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
    item.type === 'bugfix' || item.tags.includes('bugfix')
      ? '历史 Bug 修复'
      : item.type === 'pattern' || item.type === 'component'
        ? '可复用模式'
        : '历史资产';
  return `${item.name} [${item.type}] (${kind})`;
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

function formatAssetBody(asset: MemoryAsset, config: MemoryConfig): string {
  const lines = [
    `### ${asset.name}`,
    `- asset_id: ${asset.id}`,
    asset.description ? `- 描述: ${asset.description}` : '',
    asset.usage ? `- 适用: ${asset.usage}` : '',
    asset.tags.length > 0 ? `- 标签: ${asset.tags.join(', ')}` : '',
    '',
    truncateInjectionText(asset.content, config.injectionContentMaxChars),
  ].filter(Boolean);

  return lines.join('\n');
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

  if (asset?.content) {
    return `${header}\n\n${formatAssetBody(asset, config)}\n`;
  }

  return `${header}\n   - 全文加载失败，可手动: read_memory_asset {"asset_id": "${item.id}"}\n`;
}

export function renderMemoryGuideSection(context: MemoryInjectionContext): string {
  const config = getMemoryConfig();

  if (!context.enabled) {
    return '';
  }

  if (!context.available) {
    return `\n\n## 🧠 记忆系统\n- 状态: 已配置但本次检索降级\n- 原因: ${context.error || '未知错误'}\n- 处理: 忽略记忆注入，继续主流程\n`;
  }

  if (context.results.length === 0) {
    return `\n\n## 🧠 记忆系统\n- 状态: 已启用\n- 检索结果: 未找到高相关记录（含历史 Bug 修复与可复用模式）\n- 处理: 继续主流程；Bug 修复验证通过后必须 \`memorize_asset\` 沉淀；功能/UI 有可复用产出再沉淀\n`;
  }

  const loadedCount = context.results.filter((item) => context.assetsById[item.id]?.content).length;
  const items = context.results
    .map((item, index) => formatResultBlock(item, index, context, config))
    .join('\n');

  return `\n\n## 🧠 记忆系统\n- 状态: 已启用\n- 指令: 下列为已自动加载的历史经验全文（${loadedCount}/${context.results.length} 条）；开干前直接复用，无需再调 \`read_memory_asset\`\n- 检索结果:\n${items}`;
}

export function buildMemoryPlanStep(kind: MemoryPlanKind = 'default') {
  if (kind === 'bugfix') {
    return {
      id: 'memorize-bugfix',
      tool: 'memorize_asset',
      when: 'Bug 已修复且验证通过后（必须沉淀，便于下次同类问题检索）',
      args: {
        name: '[问题简述，如 登录超时-Redis连接池]',
        type: 'bugfix',
        description: '[现象、报错信息、复现条件]',
        summary: '[检索用：关键词 + 根因 + 修复要点，一句话]',
        content:
          '【现象】...\n【根因】...\n【修复】具体改动与关键代码/配置\n【验证】如何确认已修好',
        usage: '[再次遇到何种症状时可参考]',
        tags: ['bugfix', 'root-cause'],
        confidence: 0.85,
      },
      outputs: [],
    };
  }

  if (kind === 'ui') {
    return {
      id: 'memorize-ui',
      tool: 'memorize_asset',
      when: 'UI 实现完成且存在可复用组件/布局/交互模式',
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
      outputs: [],
    };
  }

  if (kind === 'feature') {
    return {
      id: 'memorize-feature',
      tool: 'memorize_asset',
      when: '功能完成且存在可复用实现/规范',
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
      outputs: [],
    };
  }

  return {
    id: 'memorize',
    tool: 'memorize_asset',
    when: '本次实现完成且确认存在可复用资产',
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
    outputs: [],
  };
}
