import { describe, expect, test } from 'vitest';
import {
  mergeAcceptanceResults,
  mergeCandidates,
  mergeRuntimeEvidence,
  normalizeAcceptanceResults,
  normalizePlanCandidates,
  normalizePlanJsonObject,
  normalizeRuntimeEvidence,
} from '../plan-state-metadata.js';

describe('plan-state-metadata', () => {
  test('同一逻辑候选更新状态时保持稳定 ID 并替换旧记录', () => {
    const first = normalizePlanCandidates(
      [{ summary: '统一订单数据所有权', status: 'candidate', evidence: ['design'] }],
      'architectureCandidates',
      '2026-08-04T00:00:00.000Z',
    );
    const updated = normalizePlanCandidates(
      [{ summary: '统一订单数据所有权', status: 'validated', evidence: ['drift passed'] }],
      'architectureCandidates',
      '2026-08-04T01:00:00.000Z',
    );

    expect(updated[0].id).toBe(first[0].id);
    expect(mergeCandidates(first, updated)).toEqual([
      expect.objectContaining({ status: 'validated', evidence: ['drift passed'] }),
    ]);
  });

  test('同一 gate_id 的新验收结果替换旧结果', () => {
    const failed = normalizeAcceptanceResults([
      { gate_id: 'security-review', passed: false, summary: '仍有高风险问题' },
    ]);
    const passed = normalizeAcceptanceResults([
      { gate_id: 'security-review', passed: true, summary: '问题已关闭' },
    ]);

    expect(mergeAcceptanceResults(failed, passed)).toEqual([
      expect.objectContaining({ gateId: 'security-review', passed: true }),
    ]);
  });

  test('重复运行证据按稳定键去重', () => {
    const evidence = normalizeRuntimeEvidence([
      { kind: 'smoke', summary: 'API 200', reference: 'smoke-1' },
    ]);
    expect(mergeRuntimeEvidence(evidence, evidence)).toHaveLength(1);
  });

  test('作用域拒绝不可 JSON 序列化值', () => {
    expect(() => normalizePlanJsonObject({ callback: () => undefined }, 'declaredScope'))
      .toThrow('不可序列化值');
  });
});
