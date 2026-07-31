import type { MemoryConfig } from './memory-config.js';
import {
  isMemorySearchEligible,
  normalizeMemoryStatus,
  normalizeStringArray,
  resolveMemoryStatus,
  type MemoryAsset,
  type MemoryStatus,
} from './memory-model.js';
import { payloadToMemoryFields } from './memory-payload.js';

interface QdrantHistoryPoint {
  id: string;
  payload?: Record<string, unknown>;
}

export interface MemoryHistoryOptions {
  limit?: number;
  offset?: number;
  type?: string;
  status?: MemoryStatus;
  sourceProject?: string;
  tags?: string[];
  includeInactive?: boolean;
}

export interface MemoryHistoryResult {
  items: MemoryAsset[];
  total: number;
  nextOffset?: number;
}

export type MemoryHistoryRequest = <T>(
  url: string,
  init?: RequestInit,
) => Promise<T>;

export async function listMemoryAssetHistory(input: {
  config: MemoryConfig;
  headers: Record<string, string>;
  requestJson: MemoryHistoryRequest;
  options?: MemoryHistoryOptions;
}): Promise<MemoryHistoryResult> {
  const options = input.options ?? {};
  const collected = await scrollHistoryPoints(input);
  const expectedProject = normalizeProjectIdentity(options.sourceProject);
  const expectedTags = normalizeStringArray(options.tags).map((tag) => tag.toLowerCase());
  const expectedType = options.type?.trim().toLowerCase();
  const expectedStatus = options.status
    ? normalizeMemoryStatus(options.status)
    : undefined;

  const assets = collected
    .flatMap(toMemoryAssets)
    .filter((asset) => options.includeInactive || isMemorySearchEligible(asset))
    .filter((asset) => !expectedType || asset.type.toLowerCase() === expectedType)
    .filter((asset) => !expectedStatus || resolveMemoryStatus(asset) === expectedStatus)
    .filter(
      (asset) =>
        !expectedProject ||
        normalizeProjectIdentity(asset.sourceProject) === expectedProject,
    )
    .filter((asset) => matchesTags(asset, expectedTags))
    .sort(compareUpdatedDescending);

  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
  const items = assets.slice(offset, offset + limit);
  const nextOffset =
    offset + items.length < assets.length ? offset + items.length : undefined;
  return {
    items,
    total: assets.length,
    ...(nextOffset === undefined ? {} : { nextOffset }),
  };
}

async function scrollHistoryPoints(input: {
  config: MemoryConfig;
  headers: Record<string, string>;
  requestJson: MemoryHistoryRequest;
}): Promise<QdrantHistoryPoint[]> {
  const collected: QdrantHistoryPoint[] = [];
  let pageOffset: string | number | null | undefined;
  for (let page = 0; page < 20 && collected.length < 2000; page += 1) {
    const data = await input.requestJson<{
      result?: {
        points?: QdrantHistoryPoint[];
        next_page_offset?: string | number | null;
      };
    }>(
      `${input.config.qdrantUrl}/collections/${encodeURIComponent(input.config.qdrantCollection)}/points/scroll`,
      {
        method: 'POST',
        headers: input.headers,
        body: JSON.stringify({
          limit: 100,
          with_payload: true,
          with_vectors: false,
          ...(pageOffset == null ? {} : { offset: pageOffset }),
        }),
      },
    );
    const points = data.result?.points ?? [];
    collected.push(...points);
    pageOffset = data.result?.next_page_offset;
    if (points.length === 0 || pageOffset == null) break;
  }
  return collected;
}

function toMemoryAssets(point: QdrantHistoryPoint): MemoryAsset[] {
  if (!point.payload) return [];
  const fields = payloadToMemoryFields(point.payload);
  return [
    {
      ...fields,
      id: fields.id || String(point.id),
      status: resolveMemoryStatus(fields),
    },
  ];
}

function matchesTags(asset: MemoryAsset, expectedTags: string[]): boolean {
  if (expectedTags.length === 0) return true;
  const tags = asset.tags.map((tag) => tag.toLowerCase());
  return expectedTags.every((tag) => tags.includes(tag));
}

function compareUpdatedDescending(left: MemoryAsset, right: MemoryAsset): number {
  const leftTime = Date.parse(left.updatedAt || left.createdAt || '') || 0;
  const rightTime = Date.parse(right.updatedAt || right.createdAt || '') || 0;
  return rightTime - leftTime;
}

export function normalizeProjectIdentity(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.git$/i, '')
    .toLowerCase();
}
