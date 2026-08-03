import { describe, expect, test } from 'vitest';
import { startRalph } from '../start_ralph.js';

describe('start_ralph', () => {
  test('max_rounds 作为 max_iterations 兼容别名生效', async () => {
    const result = await startRalph({
      goal: '执行最多三轮的小步实现与测试循环',
      max_rounds: 3,
    });

    expect(result.isError ?? false).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
    expect(result.structuredContent.loopPolicy?.maxIterations).toBe(3);
    expect(String(result.content[0].text)).toMatch(/Max Iterations\s*\|\s*3/i);
  });

  test('正式参数 max_iterations 仍优先并保持兼容', async () => {
    const result = await startRalph({
      goal: '限制循环次数',
      max_iterations: 4,
      max_rounds: 3,
    });

    expect(result.isError ?? false).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
    expect(result.structuredContent.loopPolicy?.maxIterations).toBe(4);
  });
});
