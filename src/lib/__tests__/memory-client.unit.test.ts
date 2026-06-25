import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildMemoryContentHashes,
  MemoryClient,
  normalizeContentForHash,
  type MemoryAsset,
} from '../memory-client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('memory-client 去重逻辑', () => {
  test('归一化 hash 忽略换行风格、行尾空白和多余空行', () => {
    const a = 'export const x = 1;  \r\n\r\n\r\n';
    const b = 'export const x = 1;\n\n';

    expect(normalizeContentForHash(a)).toBe('export const x = 1;');
    expect(normalizeContentForHash(b)).toBe('export const x = 1;');
    expect(buildMemoryContentHashes(a).normalizedContentHash).toBe(buildMemoryContentHashes(b).normalizedContentHash);
  });

  test('重复内容二次沉淀时直接复用已有资产', async () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');
    vi.stubEnv('MEMORY_EMBEDDING_URL', 'http://127.0.0.1:11434/api/embeddings');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', 'nomic-embed-text');

    const existingAsset: MemoryAsset = {
      id: 'existing-asset-id',
      name: 'ExistingAsset',
      type: 'code',
      description: '已有资产',
      summary: '重复内容直接复用',
      content: 'export const x = 1;\n',
      tags: ['memory'],
      confidence: 0.7,
      contentHash: 'raw-hash',
      normalizedContentHash: buildMemoryContentHashes('export const x = 1;\n').normalizedContentHash,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/embeddings')) {
        return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/collections/mcp_probe_memory') && !init?.method) {
        return new Response('', { status: 200 });
      }

      if (url.endsWith('/points/scroll')) {
        return new Response(JSON.stringify({
          result: {
            points: [
              {
                id: existingAsset.id,
                payload: existingAsset,
              },
            ],
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/points?wait=true')) {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new MemoryClient();
    const result = await client.upsertAsset({
      name: 'NewAsset',
      type: 'code',
      description: '新资产',
      summary: '和已有资产内容一致',
      content: 'export const x = 1;   \r\n\r\n',
      tags: ['memory'],
    });

    expect(result.id).toBe(existingAsset.id);
    expect(result.normalizedContentHash).toBe(existingAsset.normalizedContentHash);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/points?wait=true'))).toBe(false);
  });

  test('deleteAsset 删除已存在资产并返回快照', async () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');

    const asset: MemoryAsset = {
      id: 'asset-to-delete',
      name: 'ObsoletePattern',
      type: 'pattern',
      description: '过时模式',
      summary: '不再使用',
      content: 'old snippet',
      tags: ['pattern'],
      confidence: 0.7,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes(`/points/${asset.id}`) && init?.method !== 'POST' && init?.method !== 'PUT') {
        return new Response(JSON.stringify({ result: { payload: asset } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/points/delete')) {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new MemoryClient();
    const result = await client.deleteAsset(asset.id);

    expect(result.deleted).toBe(true);
    expect(result.asset?.name).toBe('ObsoletePattern');
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/points/delete') && init?.method === 'POST')).toBe(true);
  });

  test('deleteAsset 对不存在的资产返回 deleted=false', async () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/points/missing-id')) {
        return new Response(JSON.stringify({ result: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new MemoryClient();
    const result = await client.deleteAsset('missing-id');

    expect(result.deleted).toBe(false);
    expect(result.asset).toBeNull();
  });

  test('updateAsset 更新已存在资产并保留 createdAt', async () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');
    vi.stubEnv('MEMORY_EMBEDDING_URL', 'http://127.0.0.1:11434/api/embeddings');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', 'nomic-embed-text');

    const asset: MemoryAsset = {
      id: 'asset-to-update',
      name: 'PatternA',
      type: 'pattern',
      description: '旧描述',
      summary: '旧摘要',
      content: 'old snippet',
      tags: ['pattern'],
      confidence: 0.7,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/embeddings')) {
        return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes(`/points/${asset.id}`) && init?.method !== 'POST' && init?.method !== 'PUT') {
        return new Response(JSON.stringify({ result: { payload: asset } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/collections/mcp_probe_memory') && !init?.method) {
        return new Response('', { status: 200 });
      }

      if (url.includes('/points?wait=true') && init?.method === 'PUT') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new MemoryClient();
    const result = await client.updateAsset(asset.id, { summary: '新摘要' });

    expect(result.updated).toBe(true);
    expect(result.asset?.summary).toBe('新摘要');
    expect(result.asset?.createdAt).toBe(asset.createdAt);
    expect(result.asset?.id).toBe(asset.id);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/points?wait=true') && init?.method === 'PUT')).toBe(true);
  });
});