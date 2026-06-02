import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  renderMemoryGuideSection,
  truncateInjectionText,
} from '../memory-orchestration.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('memory injection auto-load', () => {
  test('renders full asset content without asking for read_memory_asset', () => {
    vi.stubEnv('MEMORY_SEARCH_SHOW_SOURCE', '');
    vi.stubEnv('MEMORY_REPO_ID', '');

    const section = renderMemoryGuideSection({
      enabled: true,
      available: true,
      degraded: false,
      query: 'proxy 400',
      results: [
        {
          id: 'asset-1',
          score: 0.88,
          name: 'feishu-proxy-bug',
          type: 'bugfix',
          description: 'Feishu proxy mismatch',
          summary: 'proxy caused 400 on HTTPS',
          content: '【现象】submit 成功但 sync_failed\n【根因】HTTP_PROXY 污染\n【修复】proxy:false',
          tags: ['bugfix', 'proxy'],
        },
      ],
      assetsById: {
        'asset-1': {
          id: 'asset-1',
          name: 'feishu-proxy-bug',
          type: 'bugfix',
          description: 'Feishu proxy mismatch',
          summary: 'proxy caused 400 on HTTPS',
          content: '【现象】submit 成功但 sync_failed\n【根因】HTTP_PROXY 污染\n【修复】proxy:false',
          tags: ['bugfix'],
          confidence: 0.9,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    expect(section).toContain('已自动加载的历史经验全文');
    expect(section).toContain('【现象】submit 成功但 sync_failed');
    expect(section).toContain('【根因】HTTP_PROXY 污染');
    expect(section).toContain('无需再调 `read_memory_asset`');
    expect(section).not.toMatch(/读取: read_memory_asset/);
  });

  test('truncateInjectionText limits long content', () => {
    expect(truncateInjectionText('abcdef', 4)).toBe('a...');
    expect(truncateInjectionText('abc', 10)).toBe('abc');
  });
});
