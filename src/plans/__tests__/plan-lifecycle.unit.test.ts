import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { buildDelegatedPlanContract } from '../../lib/delegated-plan-contract.js';
import { convergePlan } from '../plan-converge.js';
import { recordPlanHeartbeat } from '../plan-heartbeat.js';
import { resumePlan } from '../plan-resume.js';
import { JsonPlanStore } from '../plan-store.js';

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

  test('heartbeat 保存并合并作用域、产物、候选、验收和运行证据', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-metadata-'));
    cleanup.push(projectRoot);
    const metadataPlan = buildDelegatedPlanContract({
      ...plan(),
      declaredScope: { modules: ['orders'], exclusions: ['payments'] },
      qualityGates: ['architecture-drift'],
    });

    await recordPlanHeartbeat({
      planId: metadataPlan.planId,
      projectRoot,
      plan: metadataPlan,
      artifacts: [{ kind: 'report', summary: '架构报告', reference: 'docs/architecture/orders.md' }],
      memoryCandidates: [{ summary: '订单导出验证模式', evidence: ['npm test'] }],
      architectureCandidates: [{ summary: '订单边界候选', status: 'validated' }],
      acceptanceResults: [{ gateId: 'architecture-drift', passed: true, summary: '未发现漂移' }],
      runtimeEvidence: [{ kind: 'smoke', summary: '导出接口冒烟通过', reference: 'smoke-1' }],
    });
    await recordPlanHeartbeat({
      planId: metadataPlan.planId,
      projectRoot,
      artifacts: [{ id: 'release-note', kind: 'doc', summary: '发布说明' }],
      memoryCandidates: [{ summary: '订单导出验证模式', status: 'validated', evidence: ['npm test'] }],
    });

    const resumed = await resumePlan(metadataPlan.planId, projectRoot);
    expect(resumed.record).toMatchObject({
      declaredScope: { modules: ['orders'], exclusions: ['payments'] },
      artifacts: expect.arrayContaining([
        expect.objectContaining({ summary: '架构报告' }),
        expect.objectContaining({ id: 'release-note' }),
      ]),
      memoryCandidates: [expect.objectContaining({ summary: '订单导出验证模式', status: 'validated' })],
      architectureCandidates: [expect.objectContaining({ status: 'validated' })],
      acceptanceResults: [expect.objectContaining({ gateId: 'architecture-drift', passed: true })],
      runtimeEvidence: [expect.objectContaining({ kind: 'smoke' })],
    });
  });

  test('Plan 质量闸门必须有通过的 acceptanceResult，调用参数不能削弱证据要求', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-quality-gate-'));
    cleanup.push(projectRoot);
    const gatedPlan = buildDelegatedPlanContract({
      planId: 'feature-quality-gate',
      workflow: 'feature',
      workflowVersion: '4.0.0',
      objective: '验证质量闸门',
      completionCriteria: ['实现和验证完成'],
      requiredEvidenceKinds: ['test'],
      qualityGates: ['security-review'],
      steps: [{ id: 'done', action: 'verify' }],
    });
    await recordPlanHeartbeat({
      planId: gatedPlan.planId,
      projectRoot,
      plan: gatedPlan,
      completedStepIds: ['done'],
      evidence: [{ kind: 'test', summary: '测试通过', reference: 'npm test' }],
      acceptanceResults: [{ gateId: 'security-review', passed: false, summary: '仍有问题' }],
    });

    const blocked = await convergePlan({
      planId: gatedPlan.planId,
      projectRoot,
      requiredEvidenceKinds: [],
    });
    expect(blocked.passed).toBe(false);
    expect(blocked.missingQualityGates).toEqual(['security-review']);

    await recordPlanHeartbeat({
      planId: gatedPlan.planId,
      projectRoot,
      status: 'active',
      acceptanceResults: [{ gateId: 'security-review', passed: true, summary: '安全审查通过' }],
    });
    const passed = await convergePlan({ planId: gatedPlan.planId, projectRoot });
    expect(passed.passed).toBe(true);
    expect(passed.record.lastConvergence?.requiredEvidenceKinds).toEqual(['test']);
  });

  test('自定义只读 Plan 可声明空证据集，但仍要求步骤和 completionCriteria 完成', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-custom-readonly-'));
    cleanup.push(projectRoot);
    const readOnlyPlan = buildDelegatedPlanContract({
      planId: 'custom-readonly-plan',
      workflow: 'custom',
      workflowVersion: '4.0.0',
      objective: '只读检查模块边界',
      completionCriteria: ['分析完成'],
      requiredEvidenceKinds: [],
      steps: [{ id: 'inspect', action: 'inspect' }],
    });
    await recordPlanHeartbeat({
      planId: readOnlyPlan.planId,
      projectRoot,
      plan: readOnlyPlan,
      completedStepIds: ['inspect'],
    });

    const result = await convergePlan({ planId: readOnlyPlan.planId, projectRoot });
    expect(result).toMatchObject({ passed: true, missingEvidenceKinds: [] });
  });

  test('converge 调用参数只能增加证据要求，不能移除 Plan 已声明要求', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-evidence-union-'));
    cleanup.push(projectRoot);
    const evidencePlan = buildDelegatedPlanContract({
      planId: 'custom-evidence-union',
      workflow: 'custom',
      workflowVersion: '4.0.0',
      objective: '验证证据并集',
      completionCriteria: ['验证完成'],
      requiredEvidenceKinds: ['test'],
      steps: [{ id: 'done', action: 'verify' }],
    });
    await recordPlanHeartbeat({
      planId: evidencePlan.planId,
      projectRoot,
      plan: evidencePlan,
      completedStepIds: ['done'],
      evidence: [{ kind: 'requirements', summary: '范围确认' }],
    });

    const result = await convergePlan({
      planId: evidencePlan.planId,
      projectRoot,
      requiredEvidenceKinds: ['requirements'],
    });
    expect(result.passed).toBe(false);
    expect(result.missingEvidenceKinds).toEqual(['test']);
    expect(result.record.lastConvergence?.requiredEvidenceKinds).toEqual([
      'test',
      'requirements',
    ]);
  });

  test('旧状态文件缺少新增字段时可直接读取并补全默认值', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-old-state-'));
    cleanup.push(projectRoot);
    const oldPlan = plan();
    const plansDir = join(projectRoot, '.mcp-probe-kit', 'plans');
    await mkdir(plansDir, { recursive: true });
    await writeFile(
      join(plansDir, `${oldPlan.planId}.json`),
      JSON.stringify({
        schemaVersion: '1.0.0',
        planId: oldPlan.planId,
        plan: {
          ...oldPlan,
          requiredEvidenceKinds: undefined,
          qualityGates: undefined,
          declaredScope: undefined,
        },
        status: 'active',
        completedStepIds: [],
        skippedSteps: [],
        unresolvedItems: [],
        evidence: [],
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
      }),
      'utf8',
    );

    const record = await new JsonPlanStore(projectRoot).read(oldPlan.planId);
    expect(record?.plan.requiredEvidenceKinds).toEqual([
      'requirements',
      'spec',
      'implementation',
      'test',
      'review',
    ]);
    expect(record).toMatchObject({
      artifacts: [],
      memoryCandidates: [],
      architectureCandidates: [],
      acceptanceResults: [],
      runtimeEvidence: [],
    });
  });
});
