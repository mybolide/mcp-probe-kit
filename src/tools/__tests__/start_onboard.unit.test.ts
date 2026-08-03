import { describe, expect, test } from 'vitest';
import { startOnboard } from '../start_onboard.js';

describe('start_onboard', () => {
  test('接受 project_root 并把绝对路径透传给 init_project_context', async () => {
    const projectRoot = 'E:/workspace/test/onboard-fixture';
    const result = await startOnboard({ project_root: projectRoot, docs_dir: 'docs' });

    expect(result.isError ?? false).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
    const plan = result.structuredContent.metadata?.plan as {
      steps?: Array<{ args?: { project_root?: string } }>;
    };
    expect(plan.steps?.[0]?.args?.project_root).toBe(projectRoot);
    expect(result.content[0].text).toContain(`"project_root": "${projectRoot}"`);
  });
});
