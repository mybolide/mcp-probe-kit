/**
 * Host acceptance regression: orchestration entries must degrade on GitNexus budget
 * timeout instead of failing tools/call with "node.exe 超过 8000ms 未完成".
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const buildBugfixGraphContextMock = vi.fn();
const buildFeatureGraphContextMock = vi.fn();

vi.mock('../../lib/gitnexus-bridge.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/gitnexus-bridge.js')>();
  return {
    ...actual,
    buildBugfixGraphContext: (...args: unknown[]) => buildBugfixGraphContextMock(...args),
    buildFeatureGraphContext: (...args: unknown[]) => buildFeatureGraphContextMock(...args),
  };
});

import { startBugfix } from '../start_bugfix.js';
import { startFeature } from '../start_feature.js';

const degradedBugfix = {
  enabled: true,
  available: false,
  degraded: true,
  summary: 'GitNexus 图谱收敛超过 8000ms，已降级继续缺陷修复规划。',
  warnings: ['bugfix_graph_timeout'],
  provider: 'gitnexus',
  mode: 'query',
  highlights: [],
};

const degradedFeature = {
  enabled: true,
  available: false,
  degraded: true,
  summary: 'GitNexus 图谱收敛超过 8000ms，已降级继续功能规划。',
  warnings: ['feature_graph_timeout'],
  provider: 'gitnexus',
  mode: 'query',
  highlights: [],
};

beforeEach(() => {
  buildBugfixGraphContextMock.mockReset();
  buildFeatureGraphContextMock.mockReset();
  vi.stubEnv('MCP_ENABLE_GITNEXUS_BRIDGE', '0');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('编排入口 GitNexus 超时降级', () => {
  test('start_bugfix 图谱超时时 isError 不为 true，仍返回 bugfix Plan', async () => {
    buildBugfixGraphContextMock.mockResolvedValue(degradedBugfix);

    const result = await startBugfix({
      error_message: 'tool call timeout after 8000ms in host',
      analysis_mode: 'src8',
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toMatch(/已降级|超过 8000ms/);
    const structured = (result as { structuredContent?: Record<string, any> }).structuredContent;
    expect(structured?.metadata?.graphContext?.degraded).toBe(true);
    expect(structured?.metadata?.graphContext?.warnings).toContain('bugfix_graph_timeout');
    expect(structured?.metadata?.plan?.workflow).toBe('bugfix');
    const stepIds = (structured?.metadata?.plan?.steps ?? []).map((s: { id: string }) => s.id);
    for (const id of ['src8-1', 'src8-2', 'src8-3', 'src8-4', 'src8-5', 'src8-6', 'src8-7', 'src8-8']) {
      expect(stepIds).toContain(id);
    }
  });

  test('start_feature 超时仍 degraded 继续（防止修 bugfix 时拆掉 feature 路径）', async () => {
    buildFeatureGraphContextMock.mockResolvedValue(degradedFeature);

    const result = await startFeature({
      description: 'slim npm pack regression control',
      feature_name: 'graph-timeout-control',
    });

    expect(result.isError).not.toBe(true);
    const structured = (result as { structuredContent?: Record<string, any> }).structuredContent;
    expect(structured?.metadata?.graphContext?.degraded).toBe(true);
    expect(structured?.metadata?.graphContext?.warnings).toContain('feature_graph_timeout');
    expect(result.content[0].text).toMatch(/已降级|超过 8000ms/);
    expect(structured?.metadata?.plan?.workflow).toBe('feature');
  });
});
