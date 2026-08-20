import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const upsertAssetWithQualityMock = vi.fn();
const isEnabledMock = vi.fn();

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isEnabled: isEnabledMock,
    upsertAssetWithQuality: upsertAssetWithQualityMock,
  }),
}));

import { memorizeAsset } from '../memorize_asset.js';

beforeEach(() => {
  isEnabledMock.mockReset();
  upsertAssetWithQualityMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('memorize_asset 单元测试', () => {
  const validArgs = {
    name: 'AppError',
    description: '统一错误封装',
    summary: '用于标准化应用错误处理',
    content: 'export class AppError extends Error {}',
  };

  test('记忆服务未开启时返回跳过结果而不是报错', async () => {
    isEnabledMock.mockReturnValue(false);

    const result = await memorizeAsset(validArgs);

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('记忆服务未开启');
    expect(result.structuredContent).toEqual({ enabled: false, stored: false });
    expect(upsertAssetWithQualityMock).not.toHaveBeenCalled();
  });

  test('记忆服务开启时写入资产', async () => {
    isEnabledMock.mockReturnValue(true);
    upsertAssetWithQualityMock.mockResolvedValue({
      disposition: 'created',
      conflicts: [],
      supersededAssetIds: [],
      asset: {
        id: 'asset-1',
        name: 'AppError',
        type: 'code',
        description: '统一错误封装',
        summary: '用于标准化应用错误处理',
        content: 'export class AppError extends Error {}',
        tags: [],
        confidence: 0.7,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        status: 'active',
      },
    });

    const result = await memorizeAsset(validArgs);

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('已沉淀记忆资产: AppError');
    expect(result.content[0].text).toContain('asset_id: asset-1');
    expect(result.content[0].text).toContain('status: active');
    expect(result.content[0].text).toContain('read_memory_asset {"asset_id": "asset-1"}');
    expect(result.structuredContent.enabled).toBe(true);
    expect(result.structuredContent.stored).toBe(true);
    expect(result.structuredContent.disposition).toBe('created');
    expect(upsertAssetWithQualityMock).toHaveBeenCalledTimes(1);
    expect(upsertAssetWithQualityMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'AppError',
      description: '统一错误封装',
      summary: '用于标准化应用错误处理',
      content: 'export class AppError extends Error {}',
    }));
  });

  test('写入 failed_approach 时保存证据、边界和自动标签', async () => {
    isEnabledMock.mockReturnValue(true);
    upsertAssetWithQualityMock.mockImplementation(async (input) => ({
      disposition: 'created',
      conflicts: [],
      supersededAssetIds: [],
      asset: {
        id: 'negative-1',
        createdAt: '2026-07-30T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
        ...input,
      },
    }));

    const result = await memorizeAsset({
      name: '全量重试导致雪崩',
      type: 'failed_approach',
      description: '订单导出超时时直接全量重试失败',
      summary: '全量重试放大下游压力',
      content: '方案执行后错误率从 8% 升至 27%',
      evidence: ['压测报告 run-42', '错误率监控截图'],
      applicability: '高并发订单导出；低流量场景不适用该结论',
      expires_at: '2027-01-01T00:00:00Z',
      tags: ['orders'],
    });

    expect(result.isError).toBe(false);
    expect(upsertAssetWithQualityMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'failed_approach',
      evidence: ['压测报告 run-42', '错误率监控截图'],
      applicability: '高并发订单导出；低流量场景不适用该结论',
      status: 'active',
      expiresAt: '2027-01-01T00:00:00.000Z',
      tags: ['orders', 'failed_approach', 'negative-memory'],
    }));
  });

  test('负面记忆缺少 evidence 时拒绝写入', async () => {
    isEnabledMock.mockReturnValue(true);

    const result = await memorizeAsset({
      name: '错误根因',
      type: 'false_root_cause',
      description: '误判数据库锁',
      summary: '数据库锁不是根因',
      content: '没有验证证据',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('evidence');
    expect(upsertAssetWithQualityMock).not.toHaveBeenCalled();
  });

  test('精确重复返回 reused=true，不能声称新写入', async () => {
    isEnabledMock.mockReturnValue(true);
    upsertAssetWithQualityMock.mockResolvedValue({
      disposition: 'deduplicated',
      conflicts: [],
      supersededAssetIds: [],
      asset: {
        id: 'existing-1',
        name: 'AppError',
        type: 'code',
        description: '统一错误封装',
        summary: '用于标准化应用错误处理',
        content: 'export class AppError extends Error {}',
        tags: [],
        confidence: 0.7,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const result = await memorizeAsset(validArgs);

    expect(result.content[0].text).toContain('已复用重复记忆资产');
    expect((result as any).structuredContent).toMatchObject({
      stored: false,
      reused: true,
      disposition: 'deduplicated',
    });
  });

  test('非法 status 和 conflict_policy 在访问后端前拒绝', async () => {
    isEnabledMock.mockReturnValue(true);

    const invalidStatus = await memorizeAsset({ ...validArgs, status: 'actve' });
    const invalidPolicy = await memorizeAsset({ ...validArgs, conflict_policy: 'merge' });

    expect(invalidStatus.isError).toBe(true);
    expect(invalidStatus.content[0].text).toContain('status 不支持');
    expect(invalidPolicy.isError).toBe(true);
    expect(invalidPolicy.content[0].text).toContain('conflict_policy 不支持');
    expect(upsertAssetWithQualityMock).not.toHaveBeenCalled();
  });

  test('传入 source_project 时在访问后端前拒绝', async () => {
    isEnabledMock.mockReturnValue(true);

    const result = await memorizeAsset({
      ...validArgs,
      source_project: 'acme/api',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('source_project');
    expect(result.content[0].text).toContain('禁止');
    expect(upsertAssetWithQualityMock).not.toHaveBeenCalled();
  });

  test('传入 file_path 时在访问后端前拒绝', async () => {
    isEnabledMock.mockReturnValue(true);

    const result = await memorizeAsset({
      ...validArgs,
      file_path: 'src/lib/foo.ts',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('file_path');
    expect(upsertAssetWithQualityMock).not.toHaveBeenCalled();
  });

  test('superseded_by 在新建工具层直接拒绝并提示使用 update', async () => {
    isEnabledMock.mockReturnValue(true);

    const result = await memorizeAsset({
      ...validArgs,
      superseded_by: 'successor-1',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('新建 Memory 资产不支持 superseded_by');
    expect(result.content[0].text).toContain('update_memory_asset');
    expect(upsertAssetWithQualityMock).not.toHaveBeenCalled();
  });
});