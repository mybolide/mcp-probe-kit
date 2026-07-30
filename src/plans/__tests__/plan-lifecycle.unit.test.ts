import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { buildDelegatedPlanContract } from '../../lib/delegated-plan-contract.js';
import { convergePlan } from '../plan-converge.js';
import { recordPlanHeartbeat } from '../plan-heartbeat.js';
import { resumePlan } from '../plan-resume.js';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function plan() {
  return buildDelegatedPlanContract({
    planId: 'feature-orders-abc123',
    workflow: 'feature',
    workflowVersion: '4.0.0',
    objective: '实现订单导出',
    completionCriteria: ['规格、实现、测试和审查一致'],
    steps: [
      { id: 'spec', tool: 'add_feature' },
      { id: 'implement', action: 'write_code', dependsOn: ['spec'] },
      { id: 'test', tool: 'gentest', dependsOn: ['implement'] },
      { id: 'review', tool: 'code_review', dependsOn: ['test'] },
    ],
  });
}

describe('plan heartbeat / resume / converge', () => {
  test('首次 heartbeat 原子创建状态，resume 返回首个可执行步骤', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-heartbeat-'));
    cleanup.push(projectRoot);

    const heartbeat = await recordPlanHeartbeat({
      planId: plan().planId,
      projectRoot,
      plan: plan(),
      currentStepId: 'spec',
    });
    const resumed = await resumePlan(plan().planId, projectRoot);

    expect(heartbeat.location.statePath).toBe(
      '.mcp-probe-kit/plans/feature-orders-abc123.json'
    );
    expect(resumed).toMatchObject({
      found: true,
      readyStepIds: ['spec'],
      nextStepId: 'spec',
    });
  });

  test('heartbeat 合并完成步骤和证据，并按依赖恢复下一步', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-resume-'));
    cleanup.push(projectRoot);
    await recordPlanHeartbeat({ planId: plan().planId, projectRoot, plan: plan() });
    await recordPlanHeartbeat({
      planId: plan().planId,
      projectRoot,
      completedStepIds: ['spec'],
      evidence: [{ kind: 'spec', summary: '规格通过', reference: 'docs/specs/orders' }],
      lastVerifiedRevision: 'abc123',
    });

    const resumed = await resumePlan(plan().planId, projectRoot);
    expect(resumed.nextStepId).toBe('implement');
    expect(resumed.record?.evidence).toHaveLength(1);
    expect(resumed.record?.lastVerifiedRevision).toBe('abc123');
  });

  test('converge 在步骤或证据不完整时拒绝关闭', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-converge-fail-'));
    cleanup.push(projectRoot);
    await recordPlanHeartbeat({
      planId: plan().planId,
      projectRoot,
      plan: plan(),
      completedStepIds: ['spec'],
      unresolvedItems: ['导出超时策略未确认'],
      evidence: [{ kind: 'requirements', summary: 'FR-1 已确认' }],
    });

    const result = await convergePlan({ planId: plan().planId, projectRoot });
    expect(result.passed).toBe(false);
    expect(result.blockers.join('\n')).toContain('未完成步骤');
    expect(result.blockers.join('\n')).toContain('未关闭事项');
    expect(result.record.status).toBe('blocked');
  });

  test('全部步骤和五类证据齐全时收敛，并允许后续正式记忆写入', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-converge-pass-'));
    cleanup.push(projectRoot);
    await recordPlanHeartbeat({
      planId: plan().planId,
      projectRoot,
      plan: plan(),
      completedStepIds: ['spec', 'implement', 'test', 'review'],
      unresolvedItems: [],
      evidence: [
        { kind: 'requirements', summary: 'FR-1 已确认' },
        { kind: 'spec', summary: '规格闸门通过', reference: 'docs/specs/orders' },
        { kind: 'implementation', summary: '实现完成', revision: 'abc123' },
        { kind: 'test', summary: '测试通过', reference: 'npm test' },
        { kind: 'review', summary: '审查通过', reference: 'review-42' },
      ],
    });

    const result = await convergePlan({ planId: plan().planId, projectRoot });
    const resumed = await resumePlan(plan().planId, projectRoot);
    expect(result).toMatchObject({
      passed: true,
      blockers: [],
      memoryWriteAllowed: true,
      record: { status: 'converged' },
    });
    expect(resumed.nextAction).toContain('已收敛');
    await expect(
      recordPlanHeartbeat({
        planId: plan().planId,
        projectRoot,
        unresolvedItems: ['关闭后不应再写入'],
      })
    ).rejects.toThrow('禁止继续写入 Heartbeat');
  });
});
