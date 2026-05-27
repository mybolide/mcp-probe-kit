import { parseArgs, getString, getNumber } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import { shouldShowSourceInSearch } from '../lib/memory-orchestration.js';
import { getMemoryConfig } from '../lib/memory-config.js';
import { handleToolError } from '../utils/error-handler.js';

export async function searchMemory(args: unknown) {
  try {
    const parsed = parseArgs<{
      query?: string;
      type?: string;
      limit?: number;
      tags?: string[];
    }>(args, {
      defaultValues: {
        query: '',
        type: '',
        limit: 0,
      },
    });

    const query = getString(parsed.query);
    if (!query) {
      throw new Error('缺少必填参数: query');
    }

    const client = createMemoryClient();
    if (!client.isEnabled()) {
      return okStructured('记忆服务未开启，无法检索。', {
        enabled: false,
        results: [],
      });
    }

    const config = getMemoryConfig();
    const limit = getNumber(parsed.limit, config.searchLimit);
    const typeFilter = getString(parsed.type);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((item): item is string => typeof item === 'string')
      : [];

    const results = await client.search(query, {
      limit,
      preferTypes: typeFilter ? [typeFilter] : [],
      preferTags: tags,
    });

    const items = results.map((item) => ({
      id: item.id,
      score: item.score,
      name: item.name,
      type: item.type,
      summary: item.summary,
      tags: item.tags,
      sourcePath: shouldShowSourceInSearch(item, config) ? item.sourcePath : undefined,
    }));

    return okStructured(
      results.length > 0 ? `找到 ${results.length} 条相关记忆` : '未找到相关记忆',
      {
        enabled: true,
        query,
        count: results.length,
        results: items,
      }
    );
  } catch (error) {
    return handleToolError(error, 'search_memory');
  }
}
