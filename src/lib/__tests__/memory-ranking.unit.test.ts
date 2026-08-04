import { describe, expect, test } from 'vitest';
import type { MemoryConfig } from '../memory-config.js';
import type { MemorySearchResult } from '../memory-client.js';
import {
  classifyMemoryScope,
  explainMemoryRanking,
  rankMemorySearchResults,
} from '../memory-ranking.js';

const config: MemoryConfig = {
  qdrantUrl: '',
  qdrantApiKey: '',
  qdrantCollection: 'test',
  embeddingUrl: '',
  embeddingApiKey: '',
  embeddingModel: 'test',
  embeddingProvider: 'ollama',
  searchLimit: 3,
  summaryMaxChars: 280,
  searchShowSource: false,
  searchMinScore: 0,
  repoId: 'acme/orders',
  projectPriorityBoost: 0.08,
  injectionContentMaxChars: 1500,
  injectionTotalMaxChars: 9000,
  searchContentMaxChars: 1500,
  searchTotalMaxChars: 12000,
};

function result(
  id: string,
  score: number,
  sourceProject?: string
): MemorySearchResult {
  return {
    id,
    score,
    name: id,
    type: 'pattern',
    description: '',
    summary: '',
    content: '',
    tags: ['pattern'],
    confidence: 0.8,
    sourceProject,
  };
}

describe('memory ranking', () => {
  test('同等相关度下当前项目记忆优先于共享经验', () => {
    const ranked = rankMemorySearchResults(
      [result('shared', 0.84, 'other/repo'), result('project', 0.8, 'ACME/orders.git')],
      { config }
    );

    expect(ranked.map((item) => item.id)).toEqual(['project', 'shared']);
    expect(classifyMemoryScope(ranked[0], config)).toBe('project');
  });

  test('项目优先不会掩盖明显更高相关的共享经验', () => {
    const ranked = rankMemorySearchResults(
      [result('project', 0.55, 'acme/orders'), result('shared', 0.95, 'other/repo')],
      { config }
    );

    expect(ranked[0]?.id).toBe('shared');
  });

  test('类型与标签偏好仍高于作用域排序', () => {
    const project = { ...result('project', 0.9, 'acme/orders'), type: 'code', tags: [] };
    const shared = { ...result('shared', 0.7, 'other/repo'), type: 'bugfix', tags: ['root-cause'] };
    const ranked = rankMemorySearchResults([project, shared], {
      config,
      preferTypes: ['bugfix'],
      preferTags: ['root-cause'],
    });

    expect(ranked[0]?.id).toBe('shared');
  });

  test('includeInactive 审计结果中 active 始终优先于 retracted', () => {
    const active = { ...result('active', 0.6), status: 'active' as const };
    const retracted = { ...result('retracted', 0.99), status: 'retracted' as const };

    const ranked = rankMemorySearchResults([retracted, active], { config });

    expect(ranked.map((item) => item.id)).toEqual(['active', 'retracted']);
  });

  test('同生命周期和相关度下，有证据和适用边界的结论优先', () => {
    const weak = {
      ...result('weak', 0.8),
      type: 'failed_approach',
      evidence: [],
    };
    const strong = {
      ...result('strong', 0.8),
      type: 'failed_approach',
      evidence: ['load-test-42', 'regression-test'],
      applicability: '仅适用于高并发订单导出',
    };

    const ranked = rankMemorySearchResults([weak, strong], { config });
    const strongRank = explainMemoryRanking(strong, { config });
    const weakRank = explainMemoryRanking(weak, { config });

    expect(ranked[0]?.id).toBe('strong');
    expect(strongRank.evidenceBoost).toBeGreaterThan(0);
    expect(weakRank.weakNegativePenalty).toBeGreaterThan(0);
    expect(strongRank.adjustedScore).toBeGreaterThan(weakRank.adjustedScore);
  });

  test('完全同分时更新时间新者优先，最终以 id 保证稳定顺序', () => {
    const old = { ...result('old', 0.8), updatedAt: '2026-01-01T00:00:00.000Z' };
    const current = { ...result('current', 0.8), updatedAt: '2026-08-01T00:00:00.000Z' };

    expect(rankMemorySearchResults([old, current], { config })[0]?.id).toBe('current');
  });
});
