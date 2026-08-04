import { describe, expect, test, vi } from 'vitest';
import type { MemoryConfig } from '../memory-config.js';
import { listExistingAssets, type MemoryWriteDependencies } from '../memory-write-storage.js';

const config: MemoryConfig = {
  qdrantUrl: 'http://memory.test',
  qdrantApiKey: '',
  qdrantCollection: 'memory',
  embeddingUrl: 'http://embedding.test',
  embeddingApiKey: '',
  embeddingModel: 'test',
  embeddingProvider: 'ollama',
  searchLimit: 3,
  summaryMaxChars: 280,
  searchShowSource: false,
  searchMinScore: 0,
  repoId: '',
  projectPriorityBoost: 0.08,
  injectionContentMaxChars: 1500,
  injectionTotalMaxChars: 9000,
  searchContentMaxChars: 1500,
  searchTotalMaxChars: 12000,
};

function payload(id: string) {
  return {
    id,
    name: id,
    type: 'pattern',
    description: id,
    summary: id,
    content: id,
    tags: [],
    confidence: 0.8,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function deps(requestJson: MemoryWriteDependencies['requestJson']): MemoryWriteDependencies {
  return {
    config,
    requestJson,
    embed: vi.fn(async () => [0.1]),
    ensureCollection: vi.fn(async () => undefined),
    getAsset: vi.fn(async () => null),
  };
}

describe('memory write storage', () => {
  test('完整跟随 Qdrant scroll 游标直到末页', async () => {
    const offsets: unknown[] = [];
    const requestJson: MemoryWriteDependencies['requestJson'] = async <T>(
      _url: string,
      init?: RequestInit,
    ): Promise<T> => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      offsets.push(body.offset);
      return (body.offset === undefined
        ? {
            result: {
              points: [{ id: 'one', payload: payload('one') }],
              next_page_offset: 'cursor-2',
            },
          }
        : {
            result: {
              points: [{ id: 'two', payload: payload('two') }],
              next_page_offset: null,
            },
          }) as T;
    };

    const assets = await listExistingAssets(deps(requestJson));

    expect(assets.map((asset) => asset.id)).toEqual(['one', 'two']);
    expect(offsets).toEqual([undefined, 'cursor-2']);
  });

  test('Qdrant 重复返回同一游标时失败，不进入无限循环', async () => {
    const requestJson: MemoryWriteDependencies['requestJson'] = async <T>(): Promise<T> => ({
      result: {
        points: [{ id: 'one', payload: payload('one') }],
        next_page_offset: 'same-cursor',
      },
    }) as T;

    await expect(listExistingAssets(deps(requestJson))).rejects.toThrow(/重复游标/);
  });
});
