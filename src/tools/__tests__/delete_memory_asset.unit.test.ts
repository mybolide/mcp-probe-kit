import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const deleteAssetMock = vi.fn();
const getAssetMock = vi.fn();
const isReadEnabledMock = vi.fn();

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isReadEnabled: isReadEnabledMock,
    getAsset: getAssetMock,
    deleteAsset: deleteAssetMock,
  }),
}));

import { deleteMemoryAsset } from '../delete_memory_asset.js';

const sampleAsset = {
  id: 'asset-1',
  name: 'obsolete-pattern',
  type: 'pattern',
  description: 'Outdated pattern',
  summary: 'no longer used',
  content: 'old code',
  tags: ['pattern'],
  confidence: 0.8,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  isReadEnabledMock.mockReset();
  deleteAssetMock.mockReset();
  getAssetMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('delete_memory_asset 单元测试', () => {
  test('记忆服务未开启时返回跳过结果', async () => {
    isReadEnabledMock.mockReturnValue(false);

    const result = await deleteMemoryAsset({ asset_id: 'asset-1' });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('记忆服务未开启');
    expect(deleteAssetMock).not.toHaveBeenCalled();
    expect(getAssetMock).not.toHaveBeenCalled();
  });

  test('未 confirm 时返回预览并要求确认', async () => {
    isReadEnabledMock.mockReturnValue(true);
    getAssetMock.mockResolvedValue(sampleAsset);

    const result = await deleteMemoryAsset({ asset_id: 'asset-1' });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('待确认删除');
    expect(result.structuredContent?.requires_confirmation).toBe(true);
    expect(result.structuredContent?.preview?.name).toBe('obsolete-pattern');
    expect(result.structuredContent?.handles?.memory_assets?.[0]?.tool).toBe('delete_memory_asset');
    expect(deleteAssetMock).not.toHaveBeenCalled();
  });

  test('资产不存在时返回未找到', async () => {
    isReadEnabledMock.mockReturnValue(true);
    getAssetMock.mockResolvedValue(null);

    const result = await deleteMemoryAsset({ asset_id: 'missing-id' });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('未找到记忆资产');
    expect(result.structuredContent.deleted).toBe(false);
    expect(deleteAssetMock).not.toHaveBeenCalled();
  });

  test('confirm=true 删除成功时返回资产信息', async () => {
    isReadEnabledMock.mockReturnValue(true);
    deleteAssetMock.mockResolvedValue({ deleted: true, asset: sampleAsset });

    const result = await deleteMemoryAsset({ asset_id: 'asset-1', confirm: true });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('已删除记忆资产: obsolete-pattern');
    expect(result.structuredContent.deleted).toBe(true);
    expect(result.structuredContent.requires_confirmation).toBe(false);
    expect(result.structuredContent.asset.name).toBe('obsolete-pattern');
    expect(getAssetMock).not.toHaveBeenCalled();
  });

  test('缺少 asset_id 时返回错误', async () => {
    const result = await deleteMemoryAsset({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('asset_id');
  });
});
