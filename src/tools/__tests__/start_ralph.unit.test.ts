import { describe, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { startRalph } from '../start_ralph.js';

const ralphFixtureRoot = resolve('test-fixtures/ralph-fixture').replace(/\\/g, '/');

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

  test('生成正式的有界轮次 Plan，并为每轮声明 Heartbeat 证据', async () => {
    const result = await startRalph({
      goal: '小步实现并验证订单状态修复',
      project_root: ralphFixtureRoot,
      max_iterations: 3,
      max_minutes: 15,
      test_command: 'npm test',
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
      workflow: 'ralph',
      requiredEvidenceKinds: ['implementation', 'test', 'review'],
    });
    expect(plan.declaredScope).toMatchObject({
      projectRoot: ralphFixtureRoot,
      maxIterations: 3,
      maxMinutes: 15,
      backgroundExecution: false,
      helperScriptOptional: true,
    });
    expect(plan.qualityGates).toEqual([
      'ralph-baseline-verified',
      'ralph-round-evidence-complete',
      'ralph-final-tests-passed',
      'ralph-final-review-complete',
      'ralph-stop-reason-recorded',
    ]);
    expect(ids.filter((id: string) => id.startsWith('round-'))).toEqual([
      'round-1',
      'round-2',
      'round-3',
      'round-evidence',
    ]);
    expect(byId.get('round-1').dependsOn).toEqual(['write-files']);
    expect(byId.get('round-2').dependsOn).toEqual(['round-1']);
    expect(byId.get('round-3').dependsOn).toEqual(['round-2']);
    expect(byId.get('round-1').completionEvidence.join(' ')).toContain('plan_heartbeat');
    expect(byId.get('final-test').dependsOn).toEqual(['round-evidence']);
    expect(byId.get('review')).toMatchObject({
      tool: 'code_review',
      dependsOn: ['final-test'],
    });
    expect(byId.get('architecture-drift')).toMatchObject({
      tool: 'architecture',
      dependsOn: ['review'],
    });
    expect(byId.get('final-status').qualityGates).toContain('ralph-stop-reason-recorded');
    expect(structured.steps).toHaveLength(plan.steps.length);
    expect(structured.nextSteps.at(-1)).toContain('converge');
    expect(result.content[0].text).toContain('plan_heartbeat');
    expect(result.content[0].text).toContain('resume_plan');
    expect(result.content[0].text).toContain('converge');
  });

  test('工具只生成模板与前台辅助脚本，不执行或伪装循环已启动', async () => {
    const result = await startRalph({
      goal: '验证执行边界',
      max_iterations: 2,
      mode: 'normal',
    });
    if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
    const structured = result.structuredContent as any;
    const text = String(result.content[0].text);

    expect(structured.status).toBe('pending');
    expect(structured.iterations).toEqual([]);
    expect(structured.stopConditions.reason).toBe('not_started');
    expect(structured.metadata.backgroundExecution).toBe(false);
    expect(structured.metadata.generatedFiles['.ralph/PROMPT.md']).toContain('Per-Round Contract');
    expect(structured.metadata.generatedFiles['.ralph/ralph_loop_normal.sh']).toContain('MAX_ITERS');
    expect(text).toContain('does not execute it');
    expect(text).toContain('not success');
    expect(text).not.toContain('Loop Setup Complete!');
  });

  test('拒绝无效模式、越界轮次和多行命令', async () => {
    const invalidMode = await startRalph({ goal: 'x', mode: 'forever' });
    expect(invalidMode.isError).toBe(true);
    expect(invalidMode.content[0].text).toContain('mode');

    const invalidRounds = await startRalph({ goal: 'x', max_iterations: 21 });
    expect(invalidRounds.isError).toBe(true);
    expect(invalidRounds.content[0].text).toContain('max_iterations');

    const invalidCommand = await startRalph({ goal: 'x', test_command: 'npm test\nnpm run build' });
    expect(invalidCommand.isError).toBe(true);
    expect(invalidCommand.content[0].text).toContain('test_command');
  });
});
