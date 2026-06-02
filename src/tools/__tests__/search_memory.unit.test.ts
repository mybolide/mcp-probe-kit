import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const searchMock = vi.fn();
const isEnabledMock = vi.fn();

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isEnabled: isEnabledMock,
    search: searchMock,
  }),
}));

import { searchMemory } from '../search_memory.js';
import { formatSearchMemoryResultsText } from '../../lib/memory-orchestration.js';

beforeEach(() => {
  isEnabledMock.mockReset();
  searchMock.mockReset();
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
    expect(result.structuredContent).toEqual({ enabled: false, results: [] });
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
  });
});
