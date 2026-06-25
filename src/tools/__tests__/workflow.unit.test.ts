import { describe, expect, test } from 'vitest';
import { workflow } from '../workflow.js';

describe('workflow 工具', () => {
  test('新功能意图返回 start_feature 为首工具', async () => {
    const result = await workflow({ intent: '实现订单导出功能' });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    expect(result.structuredContent.firstTool).toBe('start_feature');
    expect(result.structuredContent.scenario).toBe('feature');
    expect(result.content[0].text).toContain('start_feature');
    expect(result.structuredContent.handles?.next_tool).toBe('start_feature');
  });

  test('Bug 意图返回 start_bugfix', async () => {
    const result = await workflow({ intent: '修复支付接口 500 错误', scenario: 'bugfix' });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    expect(result.structuredContent.firstTool).toBe('start_bugfix');
  });
});
