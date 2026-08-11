import { describe, expect, it } from 'vitest';
import { architecture } from '../architecture.js';

describe('architecture tool', () => {
  it('can be called directly in assess mode without start_* or managed Plan', async () => {
    const response = await architecture({
      mode: 'assess',
      description: '评估订单与支付的数据所有权',
      collect_evidence: false,
      current_facts: [{
        statement: 'orders 与 payment 均写入 payment_status',
        classification: 'fact',
        evidence: ['src/orders/service.ts', 'src/payment/service.ts'],
      }],
      structural_causes: ['重复事实源'],
      protected_invariants: ['旧订单查询结果保持兼容'],
    });

    expect(response.isError).toBe(false);
    expect(response.structuredContent.methodology).toBe('arc8');
    expect(response.structuredContent.mode).toBe('assess');
    expect(response.structuredContent.validation.passed).toBe(true);
    expect(response.structuredContent.metadata.evidenceCollection).toBe(false);
  });

  it('design respects ARC-2/3 gates and returns truthful gaps', async () => {
    const response = await architecture({
      mode: 'design',
      description: '重新设计订单支付边界',
      collect_evidence: false,
    });

    expect(response.isError).toBe(false);
    expect(response.structuredContent.validation.passed).toBe(false);
    expect(response.structuredContent.validation.gaps.join('\n')).toContain('ARC-2');
    expect(response.content[0].text).toContain('结构化结果是架构工作表和门禁');
  });

  it('assess with explicitly empty evidence is blocked instead of reported as complete', async () => {
    const response = await architecture({
      mode: 'assess',
      description: '评估支付模块拆分',
      collect_evidence: false,
      current_facts: [],
      structural_causes: [],
      protected_invariants: [],
    });

    expect(response.isError).toBe(false);
    expect(response.structuredContent.validation.passed).toBe(false);
    expect(response.structuredContent.validation.gaps.join('\n')).toContain('ARC-2');
    expect(response.structuredContent.validation.gaps.join('\n')).toContain('ARC-3');
    expect(response.structuredContent.arc8Status.completedSteps).toEqual(['arc-1']);
    expect(response.structuredContent.arc8Status.blockedSteps).toEqual(
      expect.arrayContaining(['arc-2', 'arc-3']),
    );
  });

  it('save_to_docs returns Agent actions instead of writing project documents', async () => {
    const response = await architecture({
      mode: 'assess',
      description: '评估模块边界',
      collect_evidence: false,
      save_to_docs: true,
    });

    const plan = response.structuredContent.metadata.documentPlan;
    expect(plan.mode).toBe('delegated');
    expect(plan.steps[0].type).toBe('agent_action');
    expect(plan.steps[0].note).toContain('MCP 不直接重写');
  });

  it('rejects unsupported mode as a tool error', async () => {
    const response = await architecture({
      mode: 'invent',
      description: '评估架构',
      collect_evidence: false,
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('可选值');
  });
});
