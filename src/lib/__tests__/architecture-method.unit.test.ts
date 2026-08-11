import { describe, expect, it } from 'vitest';
import {
  buildArchitectureMethod,
  normalizeArchitectureMode,
} from '../architecture-method.js';

const currentFacts = [
  {
    statement: 'orders 模块直接写入 payment 状态表',
    classification: 'fact' as const,
    evidence: ['src/orders/service.ts:42'],
  },
];

const alternatives = [
  { id: 'a', name: '最小适配', summary: '保留现状并增加适配层' },
  { id: 'b', name: '所有权收口', summary: 'payment 成为唯一写入者' },
];

it('assess 输出 ARC-1 至 ARC-3 方法状态且不强制设计证据', () => {
  const result = buildArchitectureMethod({
    mode: 'assess',
    description: '评估订单与支付状态所有权混乱问题',
    currentFacts,
    structuralCauses: ['数据所有权不清'],
    protectedInvariants: ['订单确认结果保持兼容'],
  });

  expect(result.methodology).toBe('arc8');
  expect(result.validation.passed).toBe(true);
  expect(result.arc8Status.completedSteps).toEqual(['arc-1', 'arc-2', 'arc-3']);
  expect(result.arc8Status.notInScopeSteps).toEqual([
    'arc-4',
    'arc-5',
    'arc-6',
    'arc-7',
    'arc-8',
  ]);
  expect(result.steps.slice(3).every((step) => step.status === 'not_in_scope')).toBe(true);
  expect(result.arc8Status.nextStep).toBeNull();
  expect(result.validation.gaps).toEqual([]);
});

it('design 缺少当前事实、根因和不变量时被 ARC-2/3 门禁阻断', () => {
  const result = buildArchitectureMethod({
    mode: 'design',
    description: '设计新的订单支付边界',
  });

  expect(result.validation.passed).toBe(false);
  expect(result.validation.gaps.join('\n')).toContain('ARC-2');
  expect(result.validation.gaps.join('\n')).toContain('ARC-3');
  expect(result.arc8Status.blockedSteps.length).toBeGreaterThan(0);
});

it('assess 缺少事实、结构性根因和保护不变量时被 ARC-2/3 门禁阻断', () => {
  const result = buildArchitectureMethod({
    mode: 'assess',
    description: '评估支付模块拆分',
    currentFacts: [],
    structuralCauses: [],
    protectedInvariants: [],
  });

  expect(result.validation.passed).toBe(false);
  expect(result.validation.gaps.join('\n')).toContain('ARC-2');
  expect(result.validation.gaps.join('\n')).toContain('ARC-3');
  expect(result.arc8Status.completedSteps).toEqual(['arc-1']);
  expect(result.arc8Status.blockedSteps).toEqual(
    expect.arrayContaining(['arc-2', 'arc-3']),
  );
});

it('validate 对数据或契约变化强制要求迁移与回滚', () => {
  const result = buildArchitectureMethod({
    mode: 'validate',
    description: '验证支付状态所有权收口方案',
    currentFacts,
    structuralCauses: ['重复事实源'],
    protectedInvariants: ['旧 API 响应保持兼容'],
    alternatives,
    decision: { recommended: '所有权收口', rationale: ['消除双写'] },
    targetArchitecture: {
      boundaries: ['payment owns payment status'],
      dataOwnership: ['payment service owns payment_status'],
      publicContracts: ['GET /orders/:id response remains compatible'],
    },
    transitionPlan: { stages: ['introduce read adapter'] },
  });

  expect(result.validation.passed).toBe(false);
  expect(result.validation.gaps).toContain('ARC-6 涉及数据或契约变化但缺少迁移方案');
  expect(result.validation.gaps).toContain('ARC-6 涉及数据或契约变化但缺少回滚方案');
});

it('完整 design 通过当前阶段门禁并生成 ADR 与 Memory 候选', () => {
  const result = buildArchitectureMethod({
    mode: 'design',
    description: '设计支付状态唯一所有者',
    currentFacts,
    structuralCauses: ['orders 与 payment 双写同一状态'],
    protectedInvariants: ['旧订单查询保持一致'],
    alternatives,
    decision: {
      recommended: '所有权收口',
      rationale: ['唯一事实源'],
      rejectedAlternatives: ['最小适配：仍保留双写'],
    },
    targetArchitecture: {
      boundaries: ['payment owns payment status'],
      allowedDependencies: ['orders -> payment API'],
      forbiddenDependencies: ['orders -> payment database'],
      dataOwnership: ['payment owns payment_status'],
      publicContracts: ['payment status query API'],
      protectedBehaviors: ['old order response'],
    },
    transitionPlan: {
      stages: ['add API', 'switch reads', 'remove old writes'],
      migration: ['reconcile historical rows'],
      rollback: ['feature flag restores old reader'],
      cleanup: ['remove orders payment_status writes'],
    },
  });

  expect(result.validation.passed).toBe(true);
  expect(result.adrCandidate.status).toBe('proposed');
  expect(result.memoryCandidate.status).toBe('candidate');
  expect(result.memoryCandidate.validated).toBe(true);
});

it('drift 缺少真实 diff 与运行证据时失败', () => {
  const result = buildArchitectureMethod({
    mode: 'drift',
    description: '核验订单支付重构漂移',
    currentFacts,
    targetArchitecture: { boundaries: ['payment owns payment status'] },
  });

  expect(result.validation.passed).toBe(false);
  expect(result.validation.gaps.join('\n')).toContain('真实 diff');
  expect(result.validation.gaps.join('\n')).toContain('运行证据');
});

it('drift 识别禁止依赖与临时兼容残留', () => {
  const result = buildArchitectureMethod({
    mode: 'drift',
    description: '核验订单支付重构漂移',
    currentFacts,
    targetArchitecture: {
      boundaries: ['payment owns payment status'],
      forbiddenDependencies: ['orders -> payment-db'],
    },
    transitionPlan: { cleanup: ['remove legacy adapter'] },
    diff: [
      '+++ src/orders/repository.ts',
      '+ import { paymentTable } from "payment-db";',
      '+ // TODO remove temporary compatibility',
    ].join('\n'),
    runtimeEvidence: ['architecture graph snapshot'],
  });

  expect(result.validation.driftFindings.join('\n')).toContain('禁止依赖');
  expect(result.validation.driftFindings.join('\n')).toContain('临时兼容');
  expect(result.validation.passed).toBe(false);
});

describe('normalizeArchitectureMode', () => {
  it('defaults to assess and rejects unsupported values', () => {
    expect(normalizeArchitectureMode(undefined)).toBe('assess');
    expect(() => normalizeArchitectureMode('plan')).toThrow(/可选值/);
  });
});
