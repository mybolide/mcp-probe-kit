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
      steps?: Array<{ id?: string; args?: { project_root?: string } }>;
    };
    const contextStep = plan.steps?.find((step) => step.id === 'context');
    expect(contextStep?.args?.project_root).toBe(projectRoot);
    expect(result.content[0].text).toContain(projectRoot);
  });

  test('生成完整、可恢复、可收敛的项目上手计划', async () => {
    const result = await startOnboard({
      project_root: 'E:/workspace/test/onboard-fixture',
      docs_dir: 'docs',
    });
    expect(result.isError ?? false).toBe(false);
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');

    const structured = result.structuredContent as any;
    const plan = structured.metadata.plan;
    const ids = plan.steps.map((step: any) => step.id);
    const byId = new Map<string, any>(
      plan.steps.map((step: any) => [step.id, step] as [string, any]),
    );

    expect(plan).toMatchObject({
      contractVersion: '2.0.0',
      workflow: 'onboard',
      requiredEvidenceKinds: [],
    });
    expect(plan.planId).toMatch(/^onboard-/);
    expect(plan.declaredScope).toMatchObject({
      projectRoot: 'E:/workspace/test/onboard-fixture',
      docsDir: 'docs',
      readOnlyAnalysis: true,
    });
    expect(plan.qualityGates).toEqual([
      'onboard-context-ready',
      'onboard-command-verified',
      'onboard-navigation-ready',
    ]);
    expect(ids).toEqual(expect.arrayContaining([
      'skill-bridge',
      'context',
      'code-map',
      'manifest-inventory',
      'entrypoints',
      'commands',
      'risks',
      'documentation',
      'acceptance',
    ]));
    expect(byId.get('code-map')).toMatchObject({
      tool: 'code_insight',
      dependsOn: ['context'],
    });
    expect(byId.get('commands').qualityGates).toContain('onboard-command-verified');
    expect(byId.get('documentation').expectedOutputs).toEqual(expect.arrayContaining([
      'docs/onboarding/quickstart.md',
      'docs/onboarding/project-navigation.md',
    ]));
    expect(byId.get('acceptance').qualityGates).toEqual(plan.qualityGates);
    expect(structured.steps).toHaveLength(plan.steps.length);
    expect(structured.nextSteps.at(-1)).toContain('converge');
    expect(result.content[0].text).toContain('plan_heartbeat');
    expect(result.content[0].text).toContain('resume_plan');
    expect(result.content[0].text).toContain('converge');
  });

  test('拒绝可能逃出项目根目录的 docs_dir', async () => {
    const result = await startOnboard({
      project_root: 'E:/workspace/test/onboard-fixture',
      docs_dir: '../outside',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('docs_dir');
  });
});
