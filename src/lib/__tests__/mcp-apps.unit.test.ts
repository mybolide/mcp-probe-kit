import { describe, expect, test } from 'vitest';
import {
  buildCodeInsightAppHtml,
  buildSearchMemoryAppHtml,
  isMcpUiAppTool,
} from '../mcp-apps.js';

describe('mcp-apps', () => {
  test('search_memory 与 code_insight 属于 UI App 工具', () => {
    expect(isMcpUiAppTool('search_memory')).toBe(true);
    expect(isMcpUiAppTool('code_insight')).toBe(true);
    expect(isMcpUiAppTool('gencommit')).toBe(false);
  });

  test('search_memory App 渲染命中卡片与 handles', () => {
    const html = buildSearchMemoryAppHtml(
      { query: 'proxy bug' },
      {
        structuredContent: {
          query: 'proxy bug',
          count: 1,
          results: [
            {
              id: 'asset-1',
              name: 'feishu-proxy',
              type: 'bugfix',
              score: 0.88,
              summary: 'proxy mismatch',
              content: '【修复】done',
              tags: ['bugfix'],
            },
          ],
          handles: {
            memory_assets: [{ id: 'asset-1', tool: 'read_memory_asset' }],
          },
        },
      }
    );

    expect(html).toContain('search_memory');
    expect(html).toContain('feishu-proxy');
    expect(html).toContain('asset-1');
    expect(html).toContain('read_memory_asset');
    expect(html).toContain('proxy mismatch');
  });

  test('code_insight App 渲染状态与执行表', () => {
    const html = buildCodeInsightAppHtml(
      { mode: 'auto' },
      {
        structuredContent: {
          status: 'ok',
          provider: 'gitnexus',
          summary: 'login flow analyzed',
          mode: { requested: 'auto', resolved: 'query' },
          executions: [{ tool: 'query', ok: true, text: 'found login handler' }],
          handles: { graph_resource: 'probe://graph/latest' },
        },
      }
    );

    expect(html).toContain('code_insight');
    expect(html).toContain('login flow analyzed');
    expect(html).toContain('probe://graph/latest');
    expect(html).toContain('found login handler');
  });
});
