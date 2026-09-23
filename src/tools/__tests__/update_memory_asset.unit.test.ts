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

const SAMPLE_ID = '00000000-0000-4000-8000-000000000001';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const SUCCESSOR_ID = '00000000-0000-4000-8000-000000000002';

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

    const result = await updateMemoryAsset({ asset_id: SAMPLE_ID, summary: 'new summary' });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('记忆服务未开启');
    expect(updateAssetMock).not.toHaveBeenCalled();
  });

  test('合法 UUID 但不存在时返回未找到，不出现 Qdrant 原文', async () => {
    isEnabledMock.mockReturnValue(true);
    updateAssetMock.mockResolvedValue({ updated: false, asset: null });

    const result = await updateMemoryAsset({ asset_id: MISSING_ID, summary: 'new summary' });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('未找到记忆资产');
    expect(result.content[0].text).not.toMatch(/Qdrant|HTTP 404/);
    expect(result.structuredContent.updated).toBe(false);
  });

  test('非法 asset_id 返回产品错误而非 Qdrant 原文', async () => {
    isEnabledMock.mockReturnValue(true);

    const result = await updateMemoryAsset({
      asset_id: 'does-not-exist-acceptance-test',
      summary: 'new summary',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/asset_id 必须是 UUID/);
    expect(result.content[0].text).not.toMatch(/Qdrant|Wrong input|point id/i);
    expect(updateAssetMock).not.toHaveBeenCalled();
  });

  test('更新成功时返回资产信息', async () => {
    isEnabledMock.mockReturnValue(true);
    updateAssetMock.mockResolvedValue({
      updated: true,
      asset: {
        id: SAMPLE_ID,
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
      asset_id: SAMPLE_ID,
      summary: 'updated summary',
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('已更新记忆资产: feishu-proxy-bug');
    expect(result.structuredContent.updated).toBe(true);
    expect(updateAssetMock).toHaveBeenCalledWith(SAMPLE_ID, { summary: 'updated summary' });
  });

  test('缺少 asset_id 时返回错误', async () => {
    const result = await updateMemoryAsset({ summary: 'only summary' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('asset_id');
  });

  test('未提供任何更新字段时返回错误', async () => {
    const result = await updateMemoryAsset({ asset_id: SAMPLE_ID });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('至少提供一个待更新字段');
  });

  test('更新替代关系时自动标记 superseded，并可清除失效时间', async () => {
    isEnabledMock.mockReturnValue(true);
    updateAssetMock.mockResolvedValue({
      updated: true,
      asset: {
        id: SAMPLE_ID,
        name: '旧方案',
        type: 'failed_approach',
        description: '旧方案失效',
        summary: '由新方案替代',
        content: '旧内容',
        tags: ['negative-memory'],
        evidence: ['回归测试'],
        confidence: 0.8,
        status: 'superseded',
        supersededBy: SUCCESSOR_ID,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
      },
    });

    const result = await updateMemoryAsset({
      asset_id: SAMPLE_ID,
      superseded_by: SUCCESSOR_ID,
      expires_at: '',
    });

    expect(result.isError).toBe(false);
    expect(updateAssetMock).toHaveBeenCalledWith(SAMPLE_ID, {
      expiresAt: null,
      supersededBy: SUCCESSOR_ID,
      status: 'superseded',
    });
  });

  test('将资产改为负面类型时必须同时提供 evidence', async () => {
    isEnabledMock.mockReturnValue(true);

    const result = await updateMemoryAsset({
      asset_id: SAMPLE_ID,
      type: 'regression_case',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('evidence');
    expect(updateAssetMock).not.toHaveBeenCalled();
  });

  test('传入 source_project 时在访问后端前拒绝', async () => {
    isEnabledMock.mockReturnValue(true);

    const result = await updateMemoryAsset({
      asset_id: SAMPLE_ID,
      source_project: 'acme/api',
      summary: 'updated summary',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('source_project');
    expect(updateAssetMock).not.toHaveBeenCalled();
  });
});
