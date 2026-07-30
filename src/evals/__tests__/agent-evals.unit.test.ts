import { describe, expect, it } from 'vitest';
import { runAgentEvals } from '../agent-evals.js';

describe('Agent Evals', () => {
  it('所有确定性治理用例均通过', () => {
    const report = runAgentEvals(new Date('2026-07-30T12:00:00.000Z'));

    expect(report.passed).toBe(true);
    expect(report.totals.failed).toBe(0);
    expect(report.totals.cases).toBeGreaterThanOrEqual(20);
    expect(report.categories.every((category) => category.passed)).toBe(true);
  });

  it('报告包含五类行为评估', () => {
    const report = runAgentEvals();
    expect(report.categories.map((item) => item.category).sort()).toEqual([
      'memory-safety',
      'parameter-construction',
      'plan-compliance',
      'routing',
      'tool-triggering',
    ]);
  });
});
