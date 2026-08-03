import { describe, expect, test } from 'vitest';
import { uiSearch } from '../ui-ux-tools.js';

const discouragedPattern = /Glassmorphism|Neumorphism|Claymorphism|玻璃拟态|新拟态|黏土拟态|粘土拟态/i;

describe('ui_search style policy', () => {
  test('通用状态页查询不再推荐与默认设计系统冲突的拟态风格', async () => {
    const result = await uiSearch({ query: 'dashboard status cards', limit: 10 });

    expect(result.isError ?? false).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
    const structured = result.structuredContent as any;
    const resultPayload = JSON.stringify(structured.results);
    expect(structured.totalResults).toBeGreaterThan(0);
    expect(structured.totalResults).toBeLessThanOrEqual(10);
    expect(structured.stylePolicy.explicitStyleRequest).toBe(false);
    expect(structured.stylePolicy.filteredCount).toBeGreaterThan(0);
    expect(resultPayload).not.toMatch(discouragedPattern);
    expect(String(result.content[0].text)).not.toMatch(discouragedPattern);
    expect(String(result.content[0].text)).toContain('已过滤与默认生产设计约束冲突');
  });

  test('健康监控查询不会返回 Neumorphism 产品推荐', async () => {
    const result = await uiSearch({ query: 'health monitoring interface', limit: 10 });

    expect(result.isError ?? false).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
    const structured = result.structuredContent as any;
    expect(JSON.stringify(structured.results)).not.toMatch(discouragedPattern);
    expect(structured.stylePolicy.filteredCount).toBeGreaterThan(0);
  });

  test('用户明确搜索 Glassmorphism 时保留结果但输出风险约束', async () => {
    const result = await uiSearch({ query: 'glassmorphism dashboard', limit: 5 });

    expect(result.isError ?? false).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
    const structured = result.structuredContent as any;
    expect(structured.stylePolicy.explicitStyleRequest).toBe(true);
    expect(structured.stylePolicy.filteredCount).toBe(0);
    expect(JSON.stringify(structured.results)).toMatch(/Glassmorphism/i);
    const text = String(result.content[0].text);
    expect(text).toContain('结果仅作为参考');
    expect(text).toContain('不得作为默认生产方向');
  });
});
