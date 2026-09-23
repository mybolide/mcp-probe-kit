import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('withOrchestrationGraphBudget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('MCP_ENABLE_GITNEXUS_BRIDGE', '0');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('超时后返回 onTimeout 降级结果，不抛出', async () => {
    const { withOrchestrationGraphBudget } = await import('../gitnexus-bridge.js');

    const work = vi.fn(
      (signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          // Mirror real GitNexus calls: abort must reject so the budget catch can degrade.
          if (signal.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true },
          );
        }),
    );

    const resultPromise = withOrchestrationGraphBudget(
      {
        onTimeout: () => ({
          enabled: true,
          available: false,
          degraded: true,
          summary: 'GitNexus 图谱收敛超过 8000ms，已降级继续缺陷修复规划。',
          warnings: ['bugfix_graph_timeout'],
          provider: 'gitnexus',
          mode: 'query',
          highlights: [],
        }),
      },
      work,
    );

    await vi.advanceTimersByTimeAsync(5500);
    const result = await resultPromise;

    expect(result.degraded).toBe(true);
    expect(result.available).toBe(false);
    expect(result.warnings).toContain('bugfix_graph_timeout');
    expect(result.summary).toMatch(/超过 8000ms.*降级/);
  });

  test('withGitNexusDeadline 在 Host 8s 之前降级且不抛出', async () => {
    const { withGitNexusDeadline } = await import('../gitnexus-bridge.js');

    const resultPromise = withGitNexusDeadline(
      {
        timeoutMs: 5500,
        onTimeout: () => ({ warning: 'host_budget_timeout' }),
      },
      (signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), {
            once: true,
          });
        }),
    );

    await vi.advanceTimersByTimeAsync(5500);
    await expect(resultPromise).resolves.toEqual({ warning: 'host_budget_timeout' });
  });

  test('工作在预算内完成时返回正常结果', async () => {
    const { withOrchestrationGraphBudget } = await import('../gitnexus-bridge.js');

    const resultPromise = withOrchestrationGraphBudget(
      {
        onTimeout: () => ({
          enabled: true,
          available: false,
          degraded: true,
          summary: 'should not hit',
          warnings: ['bugfix_graph_timeout'],
          provider: 'gitnexus',
          mode: 'query',
          highlights: [],
        }),
      },
      async () => ({
        enabled: true,
        available: true,
        degraded: false,
        summary: 'ok',
        warnings: [],
        provider: 'gitnexus' as const,
        mode: 'query' as const,
        highlights: ['hit'],
      }),
    );

    await vi.advanceTimersByTimeAsync(10);
    const result = await resultPromise;

    expect(result.degraded).toBe(false);
    expect(result.available).toBe(true);
    expect(result.summary).toBe('ok');
  });
});
