import { describe, expect, test } from 'vitest';
import type { MemoryConfig } from '../memory-config.js';
import { loadMemoryInjectionContext } from '../memory-orchestration.js';

const config: MemoryConfig = {
  qdrantUrl: 'http://127.0.0.1:6333',
  qdrantApiKey: '',
  qdrantCollection: 'test',
  embeddingUrl: 'http://127.0.0.1:11434/api/embeddings',
  embeddingApiKey: '',
  embeddingModel: 'nomic-embed-text',
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

describe('memory degradation', () => {
  test('Qdrant 检索失败时返回降级状态且不抛出异常', async () => {
    const context = await loadMemoryInjectionContext('orders timeout', 'bugfix', {
      config,
      client: {
        isEnabled: () => true,
        isReadEnabled: () => true,
        search: async () => {
          throw new Error('Qdrant unavailable');
        },
        getAsset: async () => null,
      },
    });

    expect(context).toMatchObject({
      enabled: true,
      available: false,
      degraded: true,
      results: [],
      error: 'Qdrant unavailable',
    });
  });
});
