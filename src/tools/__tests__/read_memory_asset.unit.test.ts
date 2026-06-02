import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const getAssetMock = vi.fn();
const isReadEnabledMock = vi.fn();

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isReadEnabled: isReadEnabledMock,
    getAsset: getAssetMock,
  }),
}));

import { readMemoryAsset } from '../read_memory_asset.js';
import { formatReadMemoryAssetText } from '../../lib/memory-orchestration.js';

beforeEach(() => {
  isReadEnabledMock.mockReset();
  getAssetMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('formatReadMemoryAssetText', () => {
  test('includes full content body', () => {
    const text = formatReadMemoryAssetText({
      id: 'asset-1',
      name: 'playwright-e2e-testing-speed-pattern',
      type: 'pattern',
      description: 'Speed up Playwright E2E suites',
      summary: 'Playwright E2E parallelization pattern',
      content: 'export const parallelWorkers = 4;\n// use sharding',
      tags: ['pattern', 'e2e'],
      confidence: 0.9,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(text).toContain('已读取记忆资产: playwright-e2e-testing-speed-pattern');
    expect(text).toContain('--- content ---');
    expect(text).toContain('export const parallelWorkers = 4;');
    expect(text).toContain('asset_id: asset-1');
  });
});

describe('read_memory_asset 单元测试', () => {
  test('记忆服务未开启时返回跳过结果', async () => {
    isReadEnabledMock.mockReturnValue(false);

    const result = await readMemoryAsset({ asset_id: 'asset-1' });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('记忆服务未开启');
    expect(getAssetMock).not.toHaveBeenCalled();
  });

  test('命中资产时文本输出包含完整 content', async () => {
    isReadEnabledMock.mockReturnValue(true);
    getAssetMock.mockResolvedValue({
      id: 'asset-1',
      name: 'feishu-proxy-bug',
      type: 'bugfix',
      description: 'Feishu proxy mismatch',
      summary: 'proxy caused 400 on HTTPS',
      content: '【现象】submit 成功\n【根因】HTTP_PROXY 污染\n【修复】proxy:false',
      tags: ['bugfix'],
      confidence: 0.9,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await readMemoryAsset({ asset_id: 'asset-1' });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('【现象】submit 成功');
    expect(result.content[0].text).toContain('【修复】proxy:false');
    expect(result.structuredContent.asset.content).toContain('【根因】HTTP_PROXY 污染');
  });
});
