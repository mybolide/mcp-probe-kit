import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildMemoryPlanStep,
  formatSearchMemoryResultsText,
  renderMemoryGuideSection,
  shouldShowSourceInSearch,
  type MemoryInjectionContext,
} from '../memory-orchestration.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('memory-orchestration', () => {
  test('does not show source path by default', () => {
    vi.stubEnv('MEMORY_SEARCH_SHOW_SOURCE', '');
    vi.stubEnv('MEMORY_REPO_ID', '');

    const section = renderMemoryGuideSection({
      enabled: true,
      available: true,
      degraded: false,
      query: '404 submit',
      results: [
        {
          id: '1',
          score: 0.91,
          name: 'purchase-create-submit-404',
          type: 'bugfix',
          description: 'desc',
          summary: 'summary',
          content: '',
          tags: ['bugfix'],
          sourceProject: 'zhixing/gongyingshang',
          sourcePath: 'admin-api/app.js',
        },
      ],
      assetsById: {},
    });

    expect(section).toContain('purchase-create-submit-404');
    expect(section).not.toContain('admin-api/app.js');
    expect(section).not.toContain('来源:');
  });

  test('shows source path when MEMORY_REPO_ID matches', () => {
    vi.stubEnv('MEMORY_SEARCH_SHOW_SOURCE', '');
    vi.stubEnv('MEMORY_REPO_ID', 'zhixing/gongyingshang');

    expect(
      shouldShowSourceInSearch({
        id: '1',
        score: 0.9,
        name: 'x',
        type: 'bugfix',
        description: '',
        summary: '',
        content: '',
        tags: [],
        sourceProject: 'zhixing/gongyingshang',
        sourcePath: 'admin-api/app.js',
      })
    ).toBe(true);

    expect(
      shouldShowSourceInSearch({
        id: '2',
        score: 0.9,
        name: 'y',
        type: 'bugfix',
        description: '',
        summary: '',
        content: '',
        tags: [],
        sourceProject: 'other/repo',
        sourcePath: 'src/index.ts',
      })
    ).toBe(false);
  });

  test('MEMORY_SEARCH_SHOW_SOURCE=true always shows source', () => {
    vi.stubEnv('MEMORY_SEARCH_SHOW_SOURCE', 'true');
    vi.stubEnv('MEMORY_REPO_ID', '');

    const section = renderMemoryGuideSection({
      enabled: true,
      available: true,
      degraded: false,
      query: 'q',
      results: [
        {
          id: '1',
          score: 0.8,
          name: 'n',
          type: 'bugfix',
          description: '',
          summary: 's',
          content: '',
          tags: [],
          sourcePath: 'admin-api/app.js',
        },
      ],
      assetsById: {},
    });

    expect(section).toContain('来源: admin-api/app.js');
  });

  test('bugfix 记忆步骤覆盖成功、失败、证伪和回归结论', () => {
    const step = buildMemoryPlanStep('bugfix');

    expect(step).not.toHaveProperty('tool');
    expect(step.action).toBe('prepare_memory_candidate');
    expect(step.when).toContain('failed_approach');
    expect(step.when).toContain('false_root_cause');
    expect(step.when).toContain('regression_case');
    expect(step.note).toContain('converge passed=true');
    expect(step.outputs).toContain('MemoryCandidate（成功、失败、证伪或回归）');
    expect(step.args).toMatchObject({
      evidence: expect.any(Array),
      applicability: expect.any(String),
    });
  });

  test('start_* Memory 注入受总字符预算约束并显式提示截断', () => {
    vi.stubEnv('MEMORY_INJECTION_CONTENT_MAX_CHARS', '1000');
    vi.stubEnv('MEMORY_INJECTION_TOTAL_MAX_CHARS', '700');
    const asset = {
      id: 'long-1',
      name: 'long-memory',
      type: 'bugfix',
      description: 'desc',
      summary: 'summary',
      content: 'verified detail\n'.repeat(200),
      tags: ['bugfix'],
      confidence: 0.9,
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const context: MemoryInjectionContext = {
      enabled: true,
      available: true,
      degraded: false,
      query: 'q',
      results: [{ ...asset, score: 0.9 }],
      assetsById: { [asset.id]: asset },
    };

    const section = renderMemoryGuideSection(context);

    expect(section.length).toBeLessThanOrEqual(700);
    expect(section).toContain('总字符预算截断');
  });

  test('search_memory 人类可读文本有独立总预算，结构化结果不受影响', () => {
    vi.stubEnv('MEMORY_SEARCH_CONTENT_MAX_CHARS', '1000');
    vi.stubEnv('MEMORY_SEARCH_TOTAL_MAX_CHARS', '600');
    const text = formatSearchMemoryResultsText([
      {
        id: 'long-search',
        score: 0.9,
        name: 'long-search-memory',
        type: 'pattern',
        description: 'desc',
        summary: 'summary',
        content: 'full content\n'.repeat(200),
        tags: ['pattern'],
      },
    ]);

    expect(text.length).toBeLessThanOrEqual(600);
    expect(text).toContain('search_memory 文本已按总字符预算截断');
  });
});
