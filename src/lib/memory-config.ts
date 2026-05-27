export interface MemoryConfig {
  qdrantUrl: string;
  qdrantApiKey: string;
  qdrantCollection: string;
  embeddingUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingProvider: 'ollama' | 'openai-compatible';
  searchLimit: number;
  summaryMaxChars: number;
  /** Show sourcePath in search injection (default false for cross-repo pools) */
  searchShowSource: boolean;
  /** Minimum cosine score to include in search results; 0 = disabled */
  searchMinScore: number;
  /** When set, show sourcePath only if payload.sourceProject matches */
  repoId: string;
  /** Max chars of each asset content injected into start_* guides */
  injectionContentMaxChars: number;
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOptionalNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function getMemoryConfig(): MemoryConfig {
  const provider = (process.env.MEMORY_EMBEDDING_PROVIDER || 'ollama').trim().toLowerCase();

  return {
    qdrantUrl: normalizeBaseUrl(process.env.MEMORY_QDRANT_URL),
    qdrantApiKey: (process.env.MEMORY_QDRANT_API_KEY || '').trim(),
    qdrantCollection: (process.env.MEMORY_QDRANT_COLLECTION || 'mcp_probe_memory').trim(),
    embeddingUrl: normalizeBaseUrl(process.env.MEMORY_EMBEDDING_URL),
    embeddingApiKey: (process.env.MEMORY_EMBEDDING_API_KEY || '').trim(),
    embeddingModel: (process.env.MEMORY_EMBEDDING_MODEL || 'nomic-embed-text').trim(),
    embeddingProvider: provider === 'openai-compatible' ? 'openai-compatible' : 'ollama',
    searchLimit: getNumberEnv('MEMORY_SEARCH_LIMIT', 3),
    summaryMaxChars: getNumberEnv('MEMORY_SUMMARY_MAX_CHARS', 280),
    searchShowSource: getBooleanEnv('MEMORY_SEARCH_SHOW_SOURCE', false),
    searchMinScore: getOptionalNumberEnv('MEMORY_SEARCH_MIN_SCORE', 0),
    repoId: (process.env.MEMORY_REPO_ID || '').trim(),
    injectionContentMaxChars: getNumberEnv('MEMORY_INJECTION_CONTENT_MAX_CHARS', 1500),
  };
}

export function isMemoryEnabled(config: MemoryConfig = getMemoryConfig()): boolean {
  return Boolean(config.qdrantUrl && config.embeddingUrl && config.embeddingModel);
}

export function isMemoryReadEnabled(config: MemoryConfig = getMemoryConfig()): boolean {
  return Boolean(config.qdrantUrl);
}