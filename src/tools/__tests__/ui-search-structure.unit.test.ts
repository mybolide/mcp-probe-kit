import { describe, expect, it } from 'vitest';
import { uiSearch } from '../ui-ux-tools.js';

describe('ui_search structure mode', () => {
  it('返回可执行页面结构而不是风格标签', async () => {
    const result = await uiSearch({
      mode: 'structure',
      query: '交易机会雷达、模拟盘、风险异常和策略证据',
      screen_type: 'professional-dashboard',
      density: 'compact',
      limit: 3,
    });

    expect(result.isError).toBe(false);
    const structured = result.structuredContent as any;
    expect(structured.category).toBe('page-structure');
    expect(structured.results[0].id).toBe('signal-workbench');
    expect(structured.results[0].score).toBeGreaterThanOrEqual(75);
    const preview = JSON.parse(structured.results[0].preview);
    expect(preview.regions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'primary-canvas' }),
      expect.objectContaining({ name: 'exception-queue' }),
    ]));
    expect(preview.flow.length).toBeGreaterThanOrEqual(4);
    expect(preview.matchReasons).toEqual(expect.arrayContaining([
      expect.stringContaining('页面类型匹配'),
      expect.stringContaining('内容密度匹配'),
    ]));

    const text = result.content[0]?.text || '';
    expect(text).toContain('页面结构候选');
    expect(text).toContain('`docs/ui/page-structure.json`');
    expect(text).not.toContain('Glassmorphism');
    expect(text).not.toContain('Neumorphism');
    expect(text).not.toContain('Aurora UI');
  });

  it('结构模式最多返回五项', async () => {
    const result = await uiSearch({ mode: 'structure', query: '页面', limit: 100 });
    expect((result.structuredContent as any).results.length).toBeLessThanOrEqual(5);
  });
});
