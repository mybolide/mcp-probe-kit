import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const updateAssetMock = vi.fn();
const isEnabledMock = vi.fn();

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isEnabled: isEnabledMock,
    updateAsset: updateAssetMock,
  }),
}));

import { updateMemoryAsset } from '../update_memory_asset.js';

beforeEach(() => {
  isEnabledMock.mockReset();
  updateAssetMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('update_memory_asset 单元测试', () => {
  test('记忆服务未开启时返回跳过结果', async () => {
    isEnabledMock.mockReturnValue(false);

    const result = await updateMemoryAsset({ asset_id: 'asset-1', summary: 'new summary' });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('记忆服务未开启');
    expect(updateAssetMock).not.toHaveBeenCalled();
  });

  test('资产不存在时返回未找到', async () => {
    isEnabledMock.mockReturnValue(true);
    updateAssetMock.mockResolvedValue({ updated: false, asset: null });

    const result = await updateMemoryAsset({ asset_id: 'missing-id', summary: 'new summary' });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('未找到记忆资产');
    expect(result.structuredContent.updated).toBe(false);
  });

  test('更新成功时返回资产信息', async () => {
    isEnabledMock.mockReturnValue(true);
    updateAssetMock.mockResolvedValue({
      updated: true,
      asset: {
        id: 'asset-1',
        name: 'feishu-proxy-bug',
        type: 'bugfix',
        description: 'Feishu proxy mismatch',
        summary: 'updated summary',
        content: '【现象】submit 成功\n【根因】HTTP_PROXY 污染\n【修复】proxy:false',
        tags: ['bugfix'],
        confidence: 0.9,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });

    const result = await updateMemoryAsset({
      asset_id: 'asset-1',
      summary: 'updated summary',
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('已更新记忆资产: feishu-proxy-bug');
    expect(result.structuredContent.updated).toBe(true);
    expect(updateAssetMock).toHaveBeenCalledWith('asset-1', { summary: 'updated summary' });
  });

  test('缺少 asset_id 时返回错误', async () => {
    const result = await updateMemoryAsset({ summary: 'only summary' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('asset_id');
  });

  test('未提供任何更新字段时返回错误', async () => {
    const result = await updateMemoryAsset({ asset_id: 'asset-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('至少提供一个待更新字段');
  });
});
