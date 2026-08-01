import { describe, expect, it } from 'vitest';
import { uiDesignSystem } from '../ui-ux-tools.js';

describe('ui_design_system visual direction contract', () => {
  it('返回可执行视觉方向而不是七份设计文档', async () => {
    const result = await uiDesignSystem({
      product_type: 'A股交易策略系统',
      description: '专业交易员使用的机会雷达与模拟盘管理首页。',
      target_audience: '专业交易员',
      screen_type: 'professional-dashboard',
      density: 'compact',
      brand_personality: '精准,可信,克制',
      references: ['Linear', 'Apple'],
      avoid: ['卡片瀑布', '大标题'],
      target_score: 8.8,
    });

    expect(result.isError).toBe(false);
    const structured = result.structuredContent as any;
    expect(structured.contractVersion).toBe('2.0');
    expect(structured.direction.id).toBe('editorial-precision');
    expect(structured.objective.density).toBe('compact');
    expect(structured.acceptance.targetScore).toBe(8.8);
    expect(structured.artifacts.map((item: any) => item.path)).toEqual([
      'docs/design-system.json',
      'docs/design-system.md',
    ]);
    expect(structured.colors.primary['500']).toMatch(/^oklch\(/);
    expect(structured.avoid).toEqual(expect.arrayContaining(['卡片瀑布', '大标题']));

    const text = result.content[0]?.text || '';
    expect(text).toContain('视觉方向：Editorial Precision');
    expect(text).toContain('真实截图');
    expect(text).not.toContain('docs/design-guidelines/');
    expect(text).not.toContain('Glassmorphism + Flat Design');
    expect(text).not.toContain('ASCII Box');
  });
});
