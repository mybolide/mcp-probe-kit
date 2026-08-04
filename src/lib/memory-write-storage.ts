import type { MemoryConfig } from './memory-config.js';
import { buildMemoryEmbeddingInput } from './memory-embedding.js';
import { normalizeStringArray, type MemoryAsset } from './memory-model.js';
import { payloadToMemoryFields } from './memory-payload.js';

interface QdrantPoint {
  id: string;
  payload?: Record<string, unknown>;
}

export interface MemoryWriteDependencies {
  config: MemoryConfig;
  embed: (text: string) => Promise<number[]>;
  ensureCollection: (vectorSize: number) => Promise<void>;
  requestJson: <T>(url: string, init?: RequestInit) => Promise<T>;
  getAsset: (assetId: string) => Promise<MemoryAsset | null>;
}

export async function persistAssets(
  deps: MemoryWriteDependencies,
  assets: MemoryAsset[],
  precomputedVectors: Map<string, number[]> = new Map(),
): Promise<void> {
  const points = await Promise.all(assets.map(async (asset) => ({
    id: asset.id,
    vector:
      precomputedVectors.get(asset.id)
      ?? await deps.embed(buildMemoryWriteEmbeddingText(asset)),
    payload: asset,
  })));
  if (points.length === 0) return;
  await deps.ensureCollection(points[0].vector.length);
  await deps.requestJson(
    `${deps.config.qdrantUrl}/collections/${encodeURIComponent(deps.config.qdrantCollection)}/points?wait=true`,
    {
      method: 'PUT',
      headers: buildHeaders(deps.config),
      body: JSON.stringify({ points }),
    },
  );
}

export async function listExistingAssets(
  deps: MemoryWriteDependencies,
): Promise<MemoryAsset[]> {
  const assets: MemoryAsset[] = [];
  let offset: string | number | null | undefined;
  const seenOffsets = new Set<string>();
  while (true) {
    const data = await deps.requestJson<{
      result?: {
        points?: QdrantPoint[];
        next_page_offset?: string | number | null;
      };
    }>(
      `${deps.config.qdrantUrl}/collections/${encodeURIComponent(deps.config.qdrantCollection)}/points/scroll`,
      {
        method: 'POST',
        headers: buildHeaders(deps.config),
        body: JSON.stringify({
          limit: 100,
          with_payload: true,
          with_vectors: false,
          ...(offset == null ? {} : { offset }),
        }),
      },
    );
    const points = data.result?.points ?? [];
    for (const point of points) {
      if (!point.payload) continue;
      const fields = payloadToMemoryFields(point.payload);
      assets.push({ ...fields, id: fields.id || String(point.id) });
    }
    offset = data.result?.next_page_offset;
    if (points.length === 0 || offset == null) break;
    const cursor = String(offset);
    if (seenOffsets.has(cursor)) {
      throw new Error(`Memory scroll 返回重复游标: ${cursor}`);
    }
    seenOffsets.add(cursor);
  }
  return assets;
}

export async function loadAssets(
  deps: MemoryWriteDependencies,
  ids: string[],
): Promise<MemoryAsset[]> {
  return Promise.all(normalizeStringArray(ids).map(async (id) => {
    const asset = await deps.getAsset(id);
    if (!asset) throw new Error(`supersedes 指向不存在的资产: ${id}`);
    return asset;
  }));
}

export function buildMemoryWriteEmbeddingText(asset: MemoryAsset): string {
  return buildMemoryEmbeddingInput({
    name: asset.name,
    type: asset.type,
    description: asset.description,
    summary: asset.summary,
    tags: asset.tags,
    usage: asset.usage,
    evidence: asset.evidence,
    applicability: asset.applicability,
    status: asset.status,
    content: asset.content,
  });
}

function buildHeaders(config: MemoryConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(config.qdrantApiKey ? { 'api-key': config.qdrantApiKey } : {}),
  };
}
