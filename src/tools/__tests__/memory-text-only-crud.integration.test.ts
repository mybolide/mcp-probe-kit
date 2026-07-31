import { beforeEach, describe, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  assets: new Map<string, any>(),
  searchOptions: [] as any[],
}));

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isEnabled: () => true,
    isReadEnabled: () => true,
    upsertAsset: async (input: any) => {
      const now = '2026-08-01T00:00:00.000Z';
      const asset = {
        id: 'text-only-asset-1',
        createdAt: now,
        updatedAt: now,
        status: 'active',
        ...input,
      };
      state.assets.set(asset.id, asset);
      return asset;
    },
    search: async (query: string, options: any) => {
      state.searchOptions.push(options);
      const needle = query.toLowerCase();
      return [...state.assets.values()]
        .filter((asset) => [asset.name, asset.description, asset.summary, asset.content]
          .some((value) => String(value ?? '').toLowerCase().includes(needle)))
        .map((asset) => ({ ...asset, score: 0.99 }));
    },
    getAsset: async (id: string) => state.assets.get(id) ?? null,
    updateAsset: async (id: string, patch: any) => {
      const current = state.assets.get(id);
      if (!current) return { updated: false, asset: null };
      const asset = {
        ...current,
        ...patch,
        updatedAt: '2026-08-01T00:01:00.000Z',
      };
      state.assets.set(id, asset);
      return { updated: true, asset };
    },
    deleteAsset: async (id: string) => {
      const asset = state.assets.get(id) ?? null;
      if (!asset) return { deleted: false, asset: null };
      state.assets.delete(id);
      return { deleted: true, asset };
    },
  }),
}));

import { memorizeAsset } from '../memorize_asset.js';
import { searchMemory } from '../search_memory.js';
import { readMemoryAsset } from '../read_memory_asset.js';
import { updateMemoryAsset } from '../update_memory_asset.js';
import { deleteMemoryAsset } from '../delete_memory_asset.js';

function textResult(result: any): string {
  return (Array.isArray(result?.content) ? result.content : [])
    .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .join('\n');
}

function parseAssetId(text: string): string {
  const match = text.match(/asset_id:\s*([^\s]+)/);
  if (!match?.[1]) throw new Error(`asset_id missing from text result: ${text}`);
  return match[1];
}

beforeEach(() => {
  state.assets.clear();
  state.searchOptions.length = 0;
});

describe('Memory CRUD text-only host flow', () => {
  test('completes create, search, read, update and delete using content text only', async () => {
    const createdText = textResult(await memorizeAsset({
      name: 'text-only-crud',
      description: 'Host text-only CRUD verification asset',
      summary: 'Initial text-only summary',
      content: 'Initial text-only content',
      type: 'pattern',
    }));

    const assetId = parseAssetId(createdText);
    expect(assetId).toBe('text-only-asset-1');
    expect(createdText).toContain(`read_memory_asset {"asset_id": "${assetId}"}`);

    const searchText = textResult(await searchMemory({ query: 'text-only-crud' }));
    expect(searchText).toContain(`id: ${assetId}`);
    expect(searchText).toContain(`read_memory_asset {"asset_id": "${assetId}"}`);
    expect(state.searchOptions[0]?.limit).toBeGreaterThan(0);

    const readText = textResult(await readMemoryAsset({ asset_id: assetId }));
    expect(readText).toContain(`asset_id: ${assetId}`);
    expect(readText).toContain('Initial text-only content');

    const updateText = textResult(await updateMemoryAsset({
      asset_id: assetId,
      summary: 'Updated text-only summary',
    }));
    expect(updateText).toContain('text-only-crud');

    const updatedReadText = textResult(await readMemoryAsset({ asset_id: assetId }));
    expect(updatedReadText).toContain('Updated text-only summary');

    const previewText = textResult(await deleteMemoryAsset({ asset_id: assetId }));
    expect(previewText).toContain('confirm: true');

    const deletedText = textResult(await deleteMemoryAsset({ asset_id: assetId, confirm: true }));
    expect(deletedText).toContain('text-only-crud');

    const finalSearchText = textResult(await searchMemory({ query: 'text-only-crud' }));
    expect(finalSearchText).not.toContain(assetId);
  });
});
