import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const searchMock = vi.fn();
const isEnabledMock = vi.fn();
const isReadEnabledMock = vi.fn();
const listAssetsMock = vi.fn();

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isEnabled: isEnabledMock,
    isReadEnabled: isReadEnabledMock,
    search: searchMock,
    listAssets: listAssetsMock,
  }),
}));

import { searchMemory } from '../search_memory.js';
import { formatSearchMemoryResultsText } from '../../lib/memory-orchestration.js';

beforeEach(() => {
  isEnabledMock.mockReset();
  isReadEnabledMock.mockReset();
  searchMock.mockReset();
  listAssetsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('formatSearchMemoryResultsText', () => {
  test('renders id, summary, description, content and read hint', () => {
    const text = formatSearchMemoryResultsText([
      {
        id: '6c97bd10-654e-4f25-a560-99f7469dc11a',
        score: 0.678,
        name: 'playwright-e2e-testing-speed-pattern',
        type: 'pattern',
        description: 'Speed up Playwright E2E suites',
        summary: 'Playwright E2E parallelization pattern',
        content: 'export const parallelWorkers = 4;\n// use project-based sharding',
        tags: ['pattern', 'e2e'],
      },
    ]);

    expect(text).toContain('找到 1 条相关记忆');
    expect(text).toContain('id: 6c97bd10-654e-4f25-a560-99f7469dc11a');
    expect(text).toContain('摘要: Playwright E2E parallelization pattern');
    expect(text).toContain('描述: Speed up Playwright E2E suites');
    expect(text).toContain('--- content ---');
    expect(text).toContain('export const parallelWorkers = 4;');
    expect(text).toContain('read_memory_asset {"asset_id": "6c97bd10-654e-4f25-a560-99f7469dc11a"}');
  });

  test('returns empty-state text', () => {
    expect(formatSearchMemoryResultsText([])).toBe('未找到相关记忆');
  });
});

describe('search_memory 单元测试', () => {
  test('记忆服务未开启时返回跳过结果', async () => {
    isEnabledMock.mockReturnValue(false);

    const result = await searchMemory({ query: 'test' });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('记忆服务未开启');
    expect(result.structuredContent).toEqual({ enabled: false, mode: 'semantic', results: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  test('browse 模式不依赖 embedding，并通过 listAssets 返回历史列表', async () => {
    isEnabledMock.mockReturnValue(false);
    isReadEnabledMock.mockReturnValue(true);
    listAssetsMock.mockResolvedValue({
      items: [{
        id: 'asset-browse-1',
        name: '历史记忆',
        type: 'pattern',
        description: '用于浏览',
        summary: 'browse summary',
        tags: ['browse'],
        status: 'active',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      }],
      total: 1,
      nextOffset: undefined,
    });

    const result = await searchMemory({
      mode: 'browse',
      limit: 100,
      offset: 0,
      include_inactive: true,
    });

    expect(result.isError).toBe(false);
    expect(searchMock).not.toHaveBeenCalled();
    expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
      limit: 100,
      offset: 0,
      includeInactive: true,
    }));
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
    expect(result.structuredContent).toEqual(expect.objectContaining({
      enabled: true,
      mode: 'browse',
      count: 1,
      total: 1,
      results: [expect.objectContaining({
        id: 'asset-browse-1',
        updatedAt: '2026-08-02T00:00:00.000Z',
      })],
    }));
  });

  test('browse 模式非法 offset 在访问后端前返回参数错误', async () => {
    isReadEnabledMock.mockReturnValue(true);
    const result = await searchMemory({ mode: 'browse', offset: { bad: true } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('offset 必须是数字');
    expect(listAssetsMock).not.toHaveBeenCalled();
  });


  test('省略或传入无效 limit 时使用正数默认值', async () => {
    isEnabledMock.mockReturnValue(true);
    searchMock.mockResolvedValue([]);

    await searchMemory({ query: 'default-limit' });
    expect(searchMock.mock.calls[0][1].limit).toBeGreaterThan(0);

    searchMock.mockClear();
    await searchMemory({ query: 'zero-limit', limit: 0 });
    expect(searchMock.mock.calls[0][1].limit).toBeGreaterThan(0);
  });

  test('非法 limit 类型在访问 Memory 后端前返回参数错误', async () => {
    isEnabledMock.mockReturnValue(true);
    searchMock.mockRejectedValue(new Error('fetch failed'));

    const result = await searchMemory({ query: 'invalid-limit', limit: { bad: true } });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('limit 必须是数字');
    expect(searchMock).not.toHaveBeenCalled();
  });

  test('命中结果时文本输出包含 asset 字段', async () => {
    isEnabledMock.mockReturnValue(true);
    searchMock.mockResolvedValue([
      {
        id: 'asset-1',
        score: 0.88,
        name: 'feishu-proxy-bug',
        type: 'bugfix',
        description: 'Feishu proxy mismatch',
        summary: 'proxy caused 400 on HTTPS',
        content: '【现象】HTTPS 400\n【修复】修正 proxy 配置',
        tags: ['bugfix', 'proxy'],
      },
    ]);

    const result = await searchMemory({ query: 'proxy', limit: 1 });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('id: asset-1');
    expect(result.content[0].text).toContain('摘要: proxy caused 400 on HTTPS');
    expect(result.content[0].text).toContain('描述: Feishu proxy mismatch');
    expect(result.content[0].text).toContain('--- content ---');
    expect(result.content[0].text).toContain('【修复】修正 proxy 配置');
    expect(result.structuredContent.results[0]).toEqual(
      expect.objectContaining({
        id: 'asset-1',
        description: 'Feishu proxy mismatch',
        summary: 'proxy caused 400 on HTTPS',
      })
    );
    expect(result.structuredContent.handles.memory_assets[0]).toEqual(
      expect.objectContaining({ id: 'asset-1', tool: 'read_memory_asset' })
    );
  });
});
