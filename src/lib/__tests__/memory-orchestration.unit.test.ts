import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildMemoryPlanStep,
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

    expect(step.when).toContain('failed_approach');
    expect(step.when).toContain('false_root_cause');
    expect(step.when).toContain('regression_case');
    expect(step.args).toMatchObject({
      evidence: expect.any(Array),
      applicability: expect.any(String),
    });
  });
});
