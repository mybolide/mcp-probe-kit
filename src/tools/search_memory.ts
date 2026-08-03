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
import { resolveMemoryStatus } from '../lib/memory-model.js';
import { handleToolError } from '../utils/error-handler.js';

export async function searchMemory(args: unknown) {
  try {
    const parsed = parseArgs<{
      query?: string;
      type?: string;
      limit?: unknown;
      tags?: string[];
      include_inactive?: boolean;
    }>(args, {
      defaultValues: {
        query: '',
        type: '',
      },
    });

    const query = getString(parsed.query);
    if (!query) {
      throw new Error('缺少必填参数: query');
    }

    const config = getMemoryConfig();
    let requestedLimit = config.searchLimit;
    if (parsed.limit !== undefined && parsed.limit !== null && parsed.limit !== '') {
      if (typeof parsed.limit === 'number' && Number.isFinite(parsed.limit)) {
        requestedLimit = parsed.limit;
      } else if (
        typeof parsed.limit === 'string' &&
        /^-?\d+(?:\.\d+)?$/.test(parsed.limit.trim())
      ) {
        requestedLimit = Number(parsed.limit);
      } else {
        throw new Error(`参数 limit 必须是数字，当前类型: ${typeof parsed.limit}`);
      }
    }

    const client = createMemoryClient();
    if (!client.isEnabled()) {
      return okStructured('记忆服务未开启，无法检索。', {
        enabled: false,
        results: [],
      });
    }

    const limit = requestedLimit > 0
      ? Math.min(Math.trunc(requestedLimit), 50)
      : config.searchLimit;
    const typeFilter = getString(parsed.type);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((item): item is string => typeof item === 'string')
      : [];
    const includeInactive = getBoolean(parsed.include_inactive, false);

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
