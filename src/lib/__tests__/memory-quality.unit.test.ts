import { describe, expect, test } from 'vitest';
import type { MemoryAsset } from '../memory-model.js';
import {
  assertMemoryLifecycleTransition,
  buildMemoryDedupKey,
  buildMemoryIdentityKey,
  buildMemoryStorageId,
  collectActiveIdentityConflicts,
  parseMemoryConflictPolicy,
  parseMemoryStatus,
  validateMemoryContentQuality,
  validateSupersessionTargets,
} from '../memory-quality.js';

function asset(overrides: Partial<MemoryAsset> = {}): MemoryAsset {
  return {
    id: 'asset-1',
    name: 'Retry With Jitter',
    type: 'pattern',
    description: 'retry pattern',
    summary: 'retry pattern',
    content: 'retry()',
    tags: ['retry'],
    confidence: 0.8,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('memory quality', () => {
  test('非法状态和冲突策略必须明确拒绝，不能静默变 active', () => {
    expect(() => parseMemoryStatus('actve')).toThrow(/status 不支持/);
    expect(() => parseMemoryConflictPolicy('merge')).toThrow(/conflict_policy 不支持/);
  });

  test('稳定存储 ID 是 Qdrant 可接受的确定性 UUID', () => {
    const dedupKey = buildMemoryDedupKey({
      type: 'pattern',
      sourceProject: 'acme/orders',
      normalizedContentHash: 'abc123',
    });
    const first = buildMemoryStorageId({ dedupKey });
    const second = buildMemoryStorageId({ dedupKey });

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('身份键忽略大小写、常见分隔符和 git 后缀', () => {
    expect(buildMemoryIdentityKey({
      name: 'Retry-With_Jitter',
      type: 'Pattern',
      sourceProject: 'Acme/Orders.git',
    })).toBe(buildMemoryIdentityKey({
      name: 'retry with jitter',
      type: 'pattern',
      sourceProject: 'acme\\orders',
    }));
  });

  test('只把同身份且 active 的资产识别为冲突', () => {
    const conflicts = collectActiveIdentityConflicts(
      { name: 'retry with jitter', type: 'pattern', sourceProject: 'acme/orders' },
      [
        asset({ id: 'active', sourceProject: 'acme/orders' }),
        asset({ id: 'stale', sourceProject: 'acme/orders', status: 'stale' }),
        asset({ id: 'other-project', sourceProject: 'other/orders' }),
      ],
    );

    expect(conflicts.map((item) => item.assetId)).toEqual(['active']);
  });

  test('负面记忆和撤回记忆都必须保留证据', () => {
    expect(() => validateMemoryContentQuality({
      type: 'false_root_cause',
      evidence: [],
      status: 'active',
    })).toThrow(/evidence/);
    expect(() => validateMemoryContentQuality({
      type: 'pattern',
      evidence: [],
      status: 'retracted',
    })).toThrow(/撤回原因/);
  });

  test('superseded/retracted 与 supersedes 历史关系不可逆改写', () => {
    const superseded = asset({
      status: 'superseded',
      supersededBy: 'asset-new',
      supersedes: ['asset-old'],
    });

    expect(() => assertMemoryLifecycleTransition(
      superseded,
      { ...superseded, status: 'active', supersededBy: undefined },
    )).toThrow(/不允许改写或清除|不允许恢复/);
    expect(() => assertMemoryLifecycleTransition(
      superseded,
      { ...superseded, supersedes: [] },
    )).toThrow(/不允许删除已有关系/);
  });

  test('supersede 不允许自指、跨 scope 或覆盖已有 successor', () => {
    const successor = asset({ id: 'new', sourceProject: 'acme/orders' });
    expect(() => validateSupersessionTargets(successor, [successor])).toThrow(/自身/);
    expect(() => validateSupersessionTargets(successor, [
      asset({ id: 'shared', sourceProject: undefined }),
    ])).toThrow(/跨 Memory scope/);
    expect(() => validateSupersessionTargets(successor, [
      asset({ id: 'old', sourceProject: 'acme/orders', supersededBy: 'other' }),
    ])).toThrow(/已被.*替代/);
  });
});
