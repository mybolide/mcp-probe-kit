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
  test('embedding 网络失败时返回可定位的服务、URL、模型和连接原因', async () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');
    vi.stubEnv('MEMORY_EMBEDDING_URL', 'http://127.0.0.1:11434/api/embeddings');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', 'nomic-embed-text');

    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
      code: 'ECONNREFUSED',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause })));

    const client = new MemoryClient();
    await expect(client.embed('health check')).rejects.toThrow(
      /Embedding 服务不可达: http:\/\/127\.0\.0\.1:11434\/api\/embeddings，model=nomic-embed-text \(ECONNREFUSED\)/,
    );
  });

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

  test('相同正文但类型或项目范围不同，不得错误去重', async () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');
    vi.stubEnv('MEMORY_EMBEDDING_URL', 'http://127.0.0.1:11434/api/embeddings');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', 'nomic-embed-text');

    const existingAsset: MemoryAsset = {
      id: 'shared-pattern',
      name: 'SharedPattern',
      type: 'pattern',
      description: '共享成功模式',
      summary: '共享模式',
      content: 'retry with jitter',
      tags: ['pattern'],
      confidence: 0.8,
      sourceProject: 'other/repo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    let storedPayload: Record<string, unknown> | undefined;
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
          result: { points: [{ id: existingAsset.id, payload: existingAsset }] },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/points?wait=true') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        storedPayload = body.points[0].payload;
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
      name: 'ProjectFailure',
      type: 'failed_approach',
      description: '当前项目失败方案',
      summary: '该重试策略在当前项目失败',
      content: 'retry with jitter',
      tags: ['negative-memory'],
      evidence: ['load-test-42'],
      sourceProject: 'acme/orders',
    });

    expect(result.id).not.toBe(existingAsset.id);
    expect(storedPayload).toMatchObject({
      type: 'failed_approach',
      sourceProject: 'acme/orders',
    });
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

  test('search 默认排除过期和被替代资产，includeInactive 可用于审计', async () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');
    vi.stubEnv('MEMORY_EMBEDDING_URL', 'http://127.0.0.1:11434/api/embeddings');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', 'nomic-embed-text');

    const points = [
      {
        id: 'active-1',
        score: 0.8,
        payload: {
          id: 'active-1',
          name: '当前方案',
          type: 'pattern',
          description: '可用方案',
          summary: 'active',
          content: 'active content',
          tags: ['pattern'],
          confidence: 0.8,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      {
        id: 'expired-1',
        score: 0.95,
        payload: {
          id: 'expired-1',
          name: '已过期方案',
          type: 'failed_approach',
          description: '已过期',
          summary: 'expired',
          content: 'expired content',
          tags: ['negative-memory'],
          evidence: ['old benchmark'],
          confidence: 0.9,
          status: 'active',
          expiresAt: '2020-01-01T00:00:00.000Z',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      },
      {
        id: 'superseded-1',
        score: 0.92,
        payload: {
          id: 'superseded-1',
          name: '旧根因',
          type: 'false_root_cause',
          description: '已被替代',
          summary: 'superseded',
          content: 'old root cause',
          tags: ['negative-memory'],
          evidence: ['counter-example'],
          confidence: 0.9,
          status: 'active',
          supersededBy: 'active-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/embeddings')) {
        return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/points/search')) {
        return new Response(JSON.stringify({ result: points }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new MemoryClient();
    const normal = await client.search('orders retry', { limit: 10 });
    const audit = await client.search('orders retry', {
      limit: 10,
      includeInactive: true,
    });

    expect(normal.map((item) => item.id)).toEqual(['active-1']);
    expect(audit.find((item) => item.id === 'expired-1')?.status).toBe('expired');
    expect(audit.find((item) => item.id === 'superseded-1')?.status).toBe('superseded');
    expect(audit.map((item) => item.id)).toEqual([
      'expired-1',
      'superseded-1',
      'active-1',
    ]);
  });
  test('listAssets browses history with lifecycle filters and pagination', async () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');

    const points = [
      {
        id: 'active-new',
        payload: {
          id: 'active-new',
          name: 'New active memory',
          type: 'pattern',
          description: 'new',
          summary: 'new active',
          content: 'new content',
          tags: ['pattern'],
          confidence: 0.9,
          status: 'active',
          sourceProject: 'acme/api',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-30T00:00:00.000Z',
        },
      },
      {
        id: 'stale-old',
        payload: {
          id: 'stale-old',
          name: 'Old stale memory',
          type: 'pattern',
          description: 'old',
          summary: 'stale',
          content: 'old content',
          tags: ['pattern'],
          confidence: 0.5,
          status: 'stale',
          sourceProject: 'acme/api',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/points/scroll')) {
        return new Response(JSON.stringify({
          result: { points, next_page_offset: null },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new MemoryClient();
    const active = await client.listAssets({
      includeInactive: false,
      sourceProject: 'acme/api',
      limit: 10,
    });
    const history = await client.listAssets({
      includeInactive: true,
      sourceProject: 'acme/api',
      limit: 1,
      offset: 1,
    });

    expect(active.items.map((item) => item.id)).toEqual(['active-new']);
    expect(history.total).toBe(2);
    expect(history.items.map((item) => item.id)).toEqual(['stale-old']);
    expect(history.items[0]?.status).toBe('stale');
  });

});