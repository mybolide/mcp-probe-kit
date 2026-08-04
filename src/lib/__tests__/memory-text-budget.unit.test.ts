import { describe, expect, test } from 'vitest';
import { applyMemoryTextBudget } from '../memory-text-budget.js';

describe('memory text budget', () => {
  test('预算内保持原文不变', () => {
    expect(applyMemoryTextBudget('abc', 500)).toEqual({
      text: 'abc',
      truncated: false,
      originalChars: 3,
      renderedChars: 3,
    });
  });

  test('超预算时保留显式截断提示且结果不超过预算', () => {
    const result = applyMemoryTextBudget('line\n'.repeat(500), 500);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(500);
    expect(result.text).toContain('总字符预算截断');
    expect(result.originalChars).toBeGreaterThan(result.renderedChars);
  });
});
