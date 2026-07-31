import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import {
  normalizeMemoryStatus,
  normalizeStringArray,
  resolveMemoryStatus,
  type MemoryStatus,
} from '../lib/memory-model.js';
import { parseArgs, getBoolean, getNumber, getString } from '../utils/parseArgs.js';
import { handleToolError } from '../utils/error-handler.js';

export async function listMemoryAssets(args: unknown) {
  try {
    const parsed = parseArgs<{
      limit?: number;
      offset?: number;
      type?: string;
      status?: string;
      source_project?: string;
      tags?: string[];
      include_inactive?: boolean;
    }>(args, {
      defaultValues: {
        limit: 50,
        offset: 0,
        type: '',
        status: '',
        source_project: '',
        include_inactive: true,
      },
      fieldAliases: {
        source_project: ['project', 'sourceProject'],
        include_inactive: ['includeInactive'],
      },
    });

    const client = createMemoryClient();
    if (!client.isReadEnabled()) {
      return okStructured('记忆系统未配置，无法浏览历史记忆。', {
        enabled: false,
        items: [],
        total: 0,
      });
    }

    const statusValue = getString(parsed.status);
    const status = statusValue
      ? normalizeMemoryStatus(statusValue)
      : undefined;
    const result = await client.listAssets({
      limit: getNumber(parsed.limit, 50),
      offset: getNumber(parsed.offset, 0),
      type: getString(parsed.type) || undefined,
      status: status as MemoryStatus | undefined,
      sourceProject: getString(parsed.source_project) || undefined,
      tags: normalizeStringArray(parsed.tags),
      includeInactive: getBoolean(parsed.include_inactive, true),
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

    return okStructured(`已加载 ${items.length} 条记忆，共 ${result.total} 条。`, {
      enabled: true,
      items,
      total: result.total,
      nextOffset: result.nextOffset,
    });
  } catch (error) {
    return handleToolError(error, 'list_memory_assets');
  }
}
