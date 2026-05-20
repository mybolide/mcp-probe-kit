import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const upsertAssetMock = vi.fn();
const isEnabledMock = vi.fn();

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isEnabled: isEnabledMock,
    upsertAsset: upsertAssetMock,
  }),
}));

import { memorizeAsset } from '../memorize_asset.js';

beforeEach(() => {
  isEnabledMock.mockReset();
  upsertAssetMock.mockReset();
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
    expect(upsertAssetMock).not.toHaveBeenCalled();
  });

  test('记忆服务开启时写入资产', async () => {
    isEnabledMock.mockReturnValue(true);
    upsertAssetMock.mockResolvedValue({
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
    });

    const result = await memorizeAsset(validArgs);

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('已沉淀记忆资产: AppError');
    expect(result.structuredContent.enabled).toBe(true);
    expect(result.structuredContent.stored).toBe(true);
    expect(upsertAssetMock).toHaveBeenCalledTimes(1);
    expect(upsertAssetMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'AppError',
      description: '统一错误封装',
      summary: '用于标准化应用错误处理',
      content: 'export class AppError extends Error {}',
    }));
  });
});