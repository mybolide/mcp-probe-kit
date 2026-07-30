import { describe, expect, test } from 'vitest';
import { normalizeMemoryPayload, payloadToMemoryFields } from '../memory-payload.js';

describe('memory-payload', () => {
  test('maps legacy kind/title/source fields to current schema', () => {
    const normalized = normalizeMemoryPayload({
      kind: 'extracted_pattern',
      title: 'Feishu submit success but sync_failed',
      source: 'scan_and_extract_patterns-fallback',
      content: 'Pattern: proxy mismatch',
      tags: ['feishu', 'pattern'],
      created_at: '2026-05-25T11:20:06.705Z',
    });

    expect(normalized.name).toBe('Feishu submit success but sync_failed');
    expect(normalized.type).toBe('pattern');
    expect(normalized.summary).toContain('Pattern');
    expect(normalized.createdAt).toBe('2026-05-25T11:20:06.705Z');
  });

  test('payloadToMemoryFields preserves standard asset fields', () => {
    const fields = payloadToMemoryFields({
      id: 'asset-1',
      name: 'purchase-create-submit-404',
      type: 'bugfix',
      description: '送审 404',
      summary: 'res.data.purchase.id',
      content: '【现象】404',
      tags: ['bugfix'],
      confidence: 0.95,
      createdAt: '2026-05-27T04:28:04.684Z',
      updatedAt: '2026-05-27T04:28:04.684Z',
    });

    expect(fields.name).toBe('purchase-create-submit-404');
    expect(fields.type).toBe('bugfix');
    expect(fields.tags).toEqual(['bugfix']);
    expect(fields.status).toBe('active');
    expect(fields.evidence).toEqual([]);
  });

  test('归一化负面记忆生命周期别名', () => {
    const fields = payloadToMemoryFields({
      id: 'negative-1',
      name: '错误根因判断',
      type: 'false_root_cause',
      description: '曾错误归因于缓存',
      summary: '缓存不是根因',
      content: '复现实验证明关闭缓存仍失败',
      evidence: ['A/B 实验', '错误日志'],
      applicable_when: '订单导出超时',
      expires_at: '2027-01-01T00:00:00.000Z',
      supersedes_ids: ['negative-old'],
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(fields.type).toBe('false_root_cause');
    expect(fields.evidence).toEqual(['A/B 实验', '错误日志']);
    expect(fields.applicability).toBe('订单导出超时');
    expect(fields.expiresAt).toBe('2027-01-01T00:00:00.000Z');
    expect(fields.supersedes).toEqual(['negative-old']);
  });
});
