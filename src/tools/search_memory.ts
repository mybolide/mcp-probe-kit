import { parseArgs, getString, getBoolean } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import {
  formatSearchMemoryResultsText,
  shouldShowSourceInSearch,
} from '../lib/memory-orchestration.js';
import { attachHandles, buildMemoryAssetHandles } from '../lib/handles.js';
import { getMemoryConfig } from '../lib/memory-config.js';
import { classifyMemoryScope, rankMemorySearchResults } from '../lib/memory-ranking.js';
import { normalizeMemoryStatus, resolveMemoryStatus } from '../lib/memory-model.js';
import { handleToolError } from '../utils/error-handler.js';

type SearchMemoryMode = 'semantic' | 'browse';

function parseNumericArg(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value);
  }
  throw new Error(`参数 ${field} 必须是数字，当前类型: ${typeof value}`);
}

export async function searchMemory(args: unknown) {
  try {
    const parsed = parseArgs<{
      mode?: string;
      query?: string;
      type?: string;
      limit?: unknown;
      offset?: unknown;
      status?: string;
      source_project?: string;
      tags?: string[];
      include_inactive?: boolean;
    }>(args, {
      defaultValues: {
        mode: 'semantic',
        query: '',
        type: '',
        status: '',
        source_project: '',
      },
      fieldAliases: {
        source_project: ['project', 'sourceProject'],
        include_inactive: ['includeInactive'],
      },
    });

    const mode = (getString(parsed.mode) || 'semantic') as SearchMemoryMode;
    if (mode !== 'semantic' && mode !== 'browse') {
      throw new Error(`参数 mode 仅支持 semantic 或 browse，当前值: ${mode}`);
    }
    const query = getString(parsed.query);
    if (mode === 'semantic' && !query) {
      throw new Error('缺少必填参数: query');
    }

    const config = getMemoryConfig();
    const requestedLimit = parseNumericArg(
      parsed.limit,
      'limit',
      mode === 'browse' ? 50 : config.searchLimit,
    );
    const requestedOffset = parseNumericArg(parsed.offset, 'offset', 0);

    const client = createMemoryClient();
    const readEnabled = mode === 'browse' ? client.isReadEnabled() : client.isEnabled();
    if (!readEnabled) {
      return okStructured('记忆服务未开启，无法检索。', {
        enabled: false,
        mode,
        results: [],
      });
    }

    const limit = requestedLimit > 0
      ? Math.min(Math.trunc(requestedLimit), mode === 'browse' ? 200 : 50)
      : mode === 'browse' ? 50 : config.searchLimit;
    const offset = requestedOffset > 0 ? Math.trunc(requestedOffset) : 0;
    const typeFilter = getString(parsed.type);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((item): item is string => typeof item === 'string')
      : [];
    const includeInactive = getBoolean(parsed.include_inactive, false);

    if (mode === 'browse') {
      const status = getString(parsed.status);
      const sourceProject = getString(parsed.source_project);
      const result = await client.listAssets({
        limit,
        offset,
        type: typeFilter || undefined,
        status: status ? normalizeMemoryStatus(status) : undefined,
        sourceProject: sourceProject || undefined,
        tags,
        includeInactive,
      });
      const items = result.items.map((asset) => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        description: asset.description,
        summary: asset.summary,
        tags: asset.tags,
        confidence: asset.confidence,
        status: resolveMemoryStatus(asset),
        sourceProject: asset.sourceProject,
        sourcePath: asset.sourcePath,
        applicability: asset.applicability,
        evidence: asset.evidence ?? [],
        expiresAt: asset.expiresAt,
        supersededBy: asset.supersededBy,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
      }));

      return okStructured(`已加载 ${items.length} 条记忆，共 ${result.total} 条。`, attachHandles({
        enabled: true,
        mode,
        query: '',
        count: items.length,
        total: result.total,
        nextOffset: result.nextOffset,
        results: items,
      }, {
        memory_assets: buildMemoryAssetHandles(items),
      }));
    }

    const rawResults = await client.search(query, {
      limit,
      preferTypes: typeFilter ? [typeFilter] : [],
      preferTags: tags,
      includeInactive,
    });
    const results = rankMemorySearchResults(rawResults, {
      preferTypes: typeFilter ? [typeFilter] : [],
      preferTags: tags,
      config,
    }).slice(0, limit);

    const items = results.map((item) => ({
      id: item.id,
      score: item.score,
      name: item.name,
      type: item.type,
      description: item.description,
      summary: item.summary,
      content: item.content,
      tags: item.tags,
      scope: classifyMemoryScope(item, config),
      status: resolveMemoryStatus(item),
      expiresAt: item.expiresAt,
      supersededBy: item.supersededBy,
      evidence: item.evidence ?? [],
      applicability: item.applicability,
      sourcePath: shouldShowSourceInSearch(item, config) ? item.sourcePath : undefined,
    }));

    return okStructured(formatSearchMemoryResultsText(results, config), attachHandles({
      enabled: true,
      mode,
      query,
      count: results.length,
      results: items,
    }, {
      memory_assets: buildMemoryAssetHandles(items),
    }));
  } catch (error) {
    return handleToolError(error, 'search_memory');
  }
}
