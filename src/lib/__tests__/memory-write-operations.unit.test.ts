import { describe, expect, test, vi } from 'vitest';
import type { MemoryConfig } from '../memory-config.js';
import { buildMemoryContentHashes } from '../memory-hash.js';
import type { MemoryAsset } from '../memory-model.js';
import {
  buildMemoryDedupKey,
  buildMemoryStorageId,
} from '../memory-quality.js';
import {
  updateMemoryAssetWithQuality,
  upsertMemoryAssetWithQuality,
  type MemoryWriteDependencies,
} from '../memory-write-operations.js';

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

function memoryAsset(overrides: Partial<MemoryAsset> = {}): MemoryAsset {
  return {
    id: 'asset-old',
    name: 'Retry Strategy',
    type: 'pattern',
    description: 'retry',
    summary: 'retry',
    content: 'retry-old',
    tags: ['retry'],
    confidence: 0.8,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createDeps(initial: MemoryAsset[] = []) {
  const assets = new Map(initial.map((asset) => [asset.id, asset]));
  const upsertCalls: MemoryAsset[][] = [];
  const requestJson: MemoryWriteDependencies['requestJson'] = async <T>(
    _url: string,
    init?: RequestInit,
  ): Promise<T> => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (_url.endsWith('/points/scroll')) {
      return {
        result: {
          points: [...assets.values()].map((asset) => ({ id: asset.id, payload: asset })),
          next_page_offset: null,
        },
      } as T;
    }
    if (_url.includes('/points?wait=true') && init?.method === 'PUT') {
      const batch = body.points.map((point: { payload: MemoryAsset }) => point.payload);
      upsertCalls.push(batch);
      for (const asset of batch) assets.set(asset.id, asset);
      return { status: 'ok' } as T;
    }
    throw new Error(`unexpected request: ${_url}`);
  };
  const deps: MemoryWriteDependencies = {
    config,
    embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    ensureCollection: vi.fn(async () => undefined),
    requestJson,
    getAsset: vi.fn(async (id) => assets.get(id) ?? null),
  };
  return { deps, assets, upsertCalls };
}

const newInput = {
  name: 'Retry Strategy',
  type: 'pattern',
  description: 'retry',
  summary: 'retry',
  content: 'retry-new',
  tags: ['retry'],
  sourceProject: 'acme/orders',
};

describe('memory write operations', () => {
  test('精确重复直接复用 active 资产且不写 Qdrant', async () => {
    const existing = memoryAsset({
      sourceProject: 'acme/orders',
      content: 'retry-new',
      normalizedContentHash: buildMemoryContentHashes('retry-new').normalizedContentHash,
    });
    const { deps, upsertCalls } = createDeps([existing]);

    const result = await upsertMemoryAssetWithQuality(deps, newInput);

    expect(result.disposition).toBe('deduplicated');
    expect(result.asset.id).toBe(existing.id);
    expect(upsertCalls).toHaveLength(0);
  });

  test('默认拒绝同身份不同内容，不能静默生成冲突资产', async () => {
    const { deps, upsertCalls } = createDeps([
      memoryAsset({ sourceProject: 'acme/orders' }),
    ]);

    await expect(upsertMemoryAssetWithQuality(deps, newInput)).rejects.toThrow(
      /同身份 Memory 冲突.*conflict_policy=supersede/,
    );
    expect(upsertCalls).toHaveLength(0);
  });

  test('allow_parallel 明确保留并行版本并返回冲突证据', async () => {
    const { deps, upsertCalls } = createDeps([
      memoryAsset({ sourceProject: 'acme/orders' }),
    ]);

    const result = await upsertMemoryAssetWithQuality(deps, {
      ...newInput,
      conflictPolicy: 'allow_parallel',
    });

    expect(result.disposition).toBe('parallel');
    expect(result.conflicts.map((item) => item.assetId)).toEqual(['asset-old']);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toHaveLength(1);
  });

  test('supersede 在一次批量写入中同时写新资产和旧资产反向关系', async () => {
    const { deps, assets, upsertCalls } = createDeps([
      memoryAsset({ sourceProject: 'acme/orders' }),
    ]);

    const result = await upsertMemoryAssetWithQuality(deps, {
      ...newInput,
      conflictPolicy: 'supersede',
    });

    expect(result.disposition).toBe('superseding');
    expect(result.supersededAssetIds).toEqual(['asset-old']);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toHaveLength(2);
    expect(assets.get('asset-old')).toMatchObject({
      status: 'superseded',
      supersededBy: result.asset.id,
    });
    expect(result.asset.supersedes).toContain('asset-old');
  });

  test('update 设置 supersededBy 时同步更新 successor.supersedes', async () => {
    const old = memoryAsset({ id: 'old', sourceProject: 'acme/orders' });
    const successor = memoryAsset({
      id: 'new',
      name: 'Replacement',
      content: 'replacement',
      sourceProject: 'acme/orders',
    });
    const { deps, assets, upsertCalls } = createDeps([old, successor]);

    const result = await updateMemoryAssetWithQuality(deps, old.id, {
      supersededBy: successor.id,
    });

    expect(result.updated).toBe(true);
    expect(result.disposition).toBe('superseding');
    expect(upsertCalls).toHaveLength(1);
    expect(assets.get('old')).toMatchObject({ status: 'superseded', supersededBy: 'new' });
    expect(assets.get('new')?.supersedes).toContain('old');
  });

  test('并发写入完全重复内容只创建一次，后续调用复用稳定资产 ID', async () => {
    const { deps, upsertCalls } = createDeps();

    const [first, second] = await Promise.all([
      upsertMemoryAssetWithQuality(deps, newInput),
      upsertMemoryAssetWithQuality(deps, { ...newInput, name: 'Retry Strategy Alias' }),
    ]);

    expect(new Set([first.asset.id, second.asset.id]).size).toBe(1);
    expect([first.disposition, second.disposition].sort()).toEqual([
      'created',
      'deduplicated',
    ]);
    expect(upsertCalls).toHaveLength(1);
  });

  test('新建资产不能直接声明 supersededBy，避免孤立反向关系', async () => {
    const { deps, upsertCalls } = createDeps();

    await expect(upsertMemoryAssetWithQuality(deps, {
      ...newInput,
      supersededBy: 'successor-id',
    })).rejects.toThrow(/新建 Memory 资产不支持 superseded_by/);
    expect(upsertCalls).toHaveLength(0);
  });

  test('同内容历史资产已撤回时创建下一版本 UUID，不覆盖历史记录', async () => {
    const hashes = buildMemoryContentHashes(newInput.content);
    const dedupKey = buildMemoryDedupKey({
      type: newInput.type,
      sourceProject: newInput.sourceProject,
      normalizedContentHash: hashes.normalizedContentHash,
    });
    const historicalId = buildMemoryStorageId({ dedupKey });
    const historical = memoryAsset({
      id: historicalId,
      sourceProject: newInput.sourceProject,
      content: newInput.content,
      normalizedContentHash: hashes.normalizedContentHash,
      status: 'retracted',
      evidence: ['撤回原因'],
    });
    const { deps, assets, upsertCalls } = createDeps([historical]);

    const result = await upsertMemoryAssetWithQuality(deps, newInput);

    expect(result.disposition).toBe('created');
    expect(result.asset.id).not.toBe(historicalId);
    expect(assets.get(historicalId)?.status).toBe('retracted');
    expect(upsertCalls).toHaveLength(1);
  });

  test('核心写入服务也严格拒绝非法生命周期状态', async () => {
    const { deps, upsertCalls } = createDeps();

    await expect(upsertMemoryAssetWithQuality(deps, {
      ...newInput,
      status: 'actve' as any,
    })).rejects.toThrow(/status 不支持/);
    expect(upsertCalls).toHaveLength(0);
  });
});
