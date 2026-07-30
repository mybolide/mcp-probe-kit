import { describe, expect, test } from 'vitest';
import {
  isMemorySearchEligible,
  isNegativeMemoryType,
  resolveMemoryStatus,
} from '../memory-model.js';

describe('memory model lifecycle', () => {
  test.each([
    'failed_approach',
    'false_root_cause',
    'regression_case',
  ])('识别负面记忆类型 %s', (type) => {
    expect(isNegativeMemoryType(type)).toBe(true);
  });

  test('过期资产默认不可检索', () => {
    const item = {
      status: 'active' as const,
      expiresAt: '2026-01-01T00:00:00.000Z',
    };

    expect(resolveMemoryStatus(item, new Date('2026-07-30T00:00:00.000Z'))).toBe('expired');
    expect(isMemorySearchEligible(item, new Date('2026-07-30T00:00:00.000Z'))).toBe(false);
  });

  test('存在 supersededBy 时视为已被替代', () => {
    const item = { status: 'active' as const, supersededBy: 'asset-new' };

    expect(resolveMemoryStatus(item)).toBe('superseded');
    expect(isMemorySearchEligible(item)).toBe(false);
  });

  test('retracted 资产不可检索', () => {
    expect(isMemorySearchEligible({ status: 'retracted' })).toBe(false);
  });
});
