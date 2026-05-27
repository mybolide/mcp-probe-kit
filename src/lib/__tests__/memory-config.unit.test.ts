import { afterEach, describe, expect, test, vi } from 'vitest';
import { getMemoryConfig, isMemoryEnabled, isMemoryReadEnabled } from '../memory-config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('memory-config 单元测试', () => {
  test('默认未配置时记忆读写均关闭', () => {
    vi.stubEnv('MEMORY_QDRANT_URL', '');
    vi.stubEnv('MEMORY_EMBEDDING_URL', '');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', '');

    const config = getMemoryConfig();

    expect(isMemoryEnabled(config)).toBe(false);
    expect(isMemoryReadEnabled(config)).toBe(false);
  });

  test('仅配置 qdrant 时只开启只读能力', () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008');
    vi.stubEnv('MEMORY_EMBEDDING_URL', '');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', '');

    const config = getMemoryConfig();

    expect(isMemoryReadEnabled(config)).toBe(true);
    expect(isMemoryEnabled(config)).toBe(false);
  });

  test('qdrant、embedding url 和 model 齐全时开启记忆服务', () => {
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:50008/');
    vi.stubEnv('MEMORY_EMBEDDING_URL', 'http://127.0.0.1:11434/api/embeddings/');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', 'nomic-embed-text');

    const config = getMemoryConfig();

    expect(config.qdrantUrl).toBe('http://127.0.0.1:50008');
    expect(config.embeddingUrl).toBe('http://127.0.0.1:11434/api/embeddings');
    expect(isMemoryReadEnabled(config)).toBe(true);
    expect(isMemoryEnabled(config)).toBe(true);
  });

  test('记忆检索展示与阈值环境变量', () => {
    vi.stubEnv('MEMORY_SEARCH_SHOW_SOURCE', 'true');
    vi.stubEnv('MEMORY_SEARCH_MIN_SCORE', '0.72');
    vi.stubEnv('MEMORY_REPO_ID', 'my-org/my-repo');

    const config = getMemoryConfig();

    expect(config.searchShowSource).toBe(true);
    expect(config.searchMinScore).toBe(0.72);
    expect(config.repoId).toBe('my-org/my-repo');
  });
});