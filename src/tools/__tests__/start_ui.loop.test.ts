/**
 * 单元测试：start_ui 需求 loop 模式
 */

import { describe, test, expect } from 'vitest';
import { startUi } from '../start_ui.js';

describe('start_ui loop 模式', () => {
  test('返回需求循环结构', async () => {
    const result = await startUi({
      description: '登录页面',
      requirements_mode: 'loop',
      loop_question_budget: 2,
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const loop = (result as any).structuredContent;
    expect(loop.mode).toBe('loop');
    expect(loop.round).toBe(1);
    expect(Array.isArray(loop.openQuestions)).toBe(true);
    expect(loop.openQuestions.length).toBeLessThanOrEqual(2);
  });
});
