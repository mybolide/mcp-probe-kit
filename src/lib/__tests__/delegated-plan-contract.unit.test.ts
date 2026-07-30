import { describe, expect, it } from 'vitest';
import {
  buildDelegatedPlanContract,
  createDelegatedPlanId,
  DELEGATED_PLAN_CONTRACT_VERSION,
} from '../delegated-plan-contract.js';

describe('delegated-plan-contract', () => {
  it('在不执行任何步骤的前提下包装 delegated plan', () => {
    const plan = buildDelegatedPlanContract({
      planId: 'feature-export-v1',
      workflow: 'feature',
      workflowVersion: '4.0.0',
      objective: '实现批量导出',
      steps: [
        { id: 'context', tool: 'code_insight', type: 'tool' },
        {
          id: 'implementation',
          type: 'agent_action',
          action: 'Agent 使用宿主能力实施代码',
          dependsOn: ['context'],
        },
      ],
    });

    expect(plan.mode).toBe('delegated');
    expect(plan.contractVersion).toBe(DELEGATED_PLAN_CONTRACT_VERSION);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].type).toBe('tool');
    expect(plan.steps[1].type).toBe('agent_action');
    expect(plan.memoryPolicy.allowNegativeMemory).toBe(true);
  });

  it('为相同工作流与输入生成稳定且不泄露完整内容的 planId', () => {
    const first = createDelegatedPlanId('bugfix', 'TypeError: Cannot read property of undefined');
    const second = createDelegatedPlanId('bugfix', 'TypeError: Cannot read property of undefined');

    expect(first).toBe(second);
    expect(first).toMatch(/^bugfix-/);
    expect(first.length).toBeLessThan(70);
  });

  it('拒绝重复步骤 ID', () => {
    expect(() =>
      buildDelegatedPlanContract({
        planId: 'duplicate-step',
        workflow: 'custom',
        workflowVersion: '4.0.0',
        objective: '验证重复步骤',
        steps: [{ id: 'same' }, { id: 'same' }],
      })
    ).toThrow('step id 重复');
  });

  it('拒绝依赖不存在的步骤', () => {
    expect(() =>
      buildDelegatedPlanContract({
        planId: 'unknown-dependency',
        workflow: 'custom',
        workflowVersion: '4.0.0',
        objective: '验证依赖',
        steps: [{ id: 'implementation', dependsOn: ['spec'] }],
      })
    ).toThrow('依赖未知步骤');
  });
});
