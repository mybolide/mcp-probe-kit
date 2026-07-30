import { describe, expect, test } from 'vitest';
import type { MemoryConfig } from '../memory-config.js';
import type { MemorySearchResult } from '../memory-client.js';
import {
  classifyMemoryScope,
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
  searchContentMaxChars: 1500,
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
});
