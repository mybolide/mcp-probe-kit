import { getMemoryConfig, isMemoryEnabled, isMemoryReadEnabled, type MemoryConfig } from './memory-config.js';
import {
  listMemoryAssetHistory,
  type MemoryHistoryOptions,
  type MemoryHistoryResult,
} from './memory-history.js';
import {
  isMemorySearchEligible,
  resolveMemoryStatus,
  type MemoryAsset,
  type MemorySearchOptions,
  type MemorySearchResult,
} from './memory-model.js';
import { normalizeMemoryPayload, payloadToMemoryFields } from './memory-payload.js';
import { rankMemorySearchResults } from './memory-ranking.js';
import {
  updateMemoryAssetWithQuality,
  upsertMemoryAssetWithQuality,
  type MemoryAssetPatch,
  type MemoryAssetWriteInput,
  type MemoryUpdateOutcome,
  type MemoryWriteDependencies,
  type MemoryWriteOutcome,
} from './memory-write-operations.js';
export type { MemoryAsset, MemorySearchOptions, MemorySearchResult } from './memory-model.js';
interface QdrantPoint {
  id: string;
  score?: number;
  payload?: Record<string, unknown>;
  vector?: number[];
}
function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export { buildMemoryContentHashes, normalizeContentForHash } from './memory-hash.js';
export class MemoryClient {
  constructor(private readonly config: MemoryConfig = getMemoryConfig()) {}

  isEnabled(): boolean {
    return isMemoryEnabled(this.config);
  }

  isReadEnabled(): boolean {
    return isMemoryReadEnabled(this.config);
  }

  private buildHeaders(includeJson: boolean = true): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.config.qdrantApiKey) {
      headers['api-key'] = this.config.qdrantApiKey;
    }
    return headers;
  }

  private buildEmbeddingHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.embeddingApiKey) {
      headers.Authorization = `Bearer ${this.config.embeddingApiKey}`;
    }
    return headers;
  }

  private dependencyError(
    dependency: 'Embedding' | 'Qdrant',
    url: string,
    error: unknown,
  ): Error {
    const cause = error instanceof Error && error.cause instanceof Error
      ? error.cause
      : error instanceof Error
        ? error
        : null;
    const code = cause && 'code' in cause && typeof cause.code === 'string'
      ? ` (${cause.code})`
      : '';
    const reason = cause?.message && cause.message !== 'fetch failed'
      ? `: ${cause.message}`
      : '';
    const model = dependency === 'Embedding' && this.config.embeddingModel
      ? `，model=${this.config.embeddingModel}`
      : '';
    return new Error(`${dependency} 服务不可达: ${url}${model}${code}${reason}`);
  }

  private async requestJson<T>(
    url: string,
    init?: RequestInit,
    dependency: 'Embedding' | 'Qdrant' = 'Qdrant',
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      throw this.dependencyError(dependency, url, error);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `${dependency} 服务请求失败: ${url}，HTTP ${response.status}${body ? `: ${body}` : ''}`
      );
    }
    return response.json() as Promise<T>;
  }

  private async ensureCollection(vectorSize: number): Promise<void> {
    const url = `${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}`;
    let exists: Response;
    try {
      exists = await fetch(url, { headers: this.buildHeaders(false) });
    } catch (error) {
      throw this.dependencyError('Qdrant', url, error);
    }
    if (exists.ok) {
      return;
    }

    if (exists.status !== 404) {
      throw new Error(`Qdrant collection check failed: HTTP ${exists.status}`);
    }

    await this.requestJson(url, {
      method: 'PUT',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      }),
    });
  }

  async embed(text: string): Promise<number[]> {
    if (!this.config.embeddingUrl) {
      throw new Error('MEMORY_EMBEDDING_URL 未配置');
    }

    if (this.config.embeddingProvider === 'openai-compatible') {
      const data = await this.requestJson<{ data?: Array<{ embedding?: number[] }> }>(
        this.config.embeddingUrl,
        {
          method: 'POST',
          headers: this.buildEmbeddingHeaders(),
          body: JSON.stringify({
            model: this.config.embeddingModel,
            input: text,
          }),
        },
        'Embedding',
      );
      const vector = data.data?.[0]?.embedding;
      if (!vector || !Array.isArray(vector) || vector.length === 0) {
        throw new Error('Embedding 服务未返回有效向量');
      }
      return vector;
    }

    const data = await this.requestJson<{ embedding?: number[] }>(
      this.config.embeddingUrl,
      {
        method: 'POST',
        headers: this.buildEmbeddingHeaders(),
        body: JSON.stringify({
          model: this.config.embeddingModel,
          prompt: text,
        }),
      },
      'Embedding',
    );
    if (!data.embedding || !Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new Error('Embedding 服务未返回有效向量');
    }
    return data.embedding;
  }

  async upsertAsset(input: MemoryAssetWriteInput): Promise<MemoryAsset> {
    const outcome = await this.upsertAssetWithQuality(input);
    return outcome.asset;
  }

  async upsertAssetWithQuality(
    input: MemoryAssetWriteInput,
  ): Promise<MemoryWriteOutcome> {
    if (!this.isEnabled()) throw new Error('记忆系统未启用');
    return upsertMemoryAssetWithQuality(this.writeDependencies(), input);
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const limit = options.limit ?? this.config.searchLimit;
    const minScore = options.minScore ?? this.config.searchMinScore;
    const fetchLimit = Math.min(Math.max(limit * 4, limit), 50);

    const vector = await this.embed(query);
    const data = await this.requestJson<{ result?: QdrantPoint[] }>(
      `${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}/points/search`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          vector,
          limit: fetchLimit,
          with_payload: true,
        }),
      }
    );

    const mapped = (data.result || []).map((point) => {
      const payload = normalizeMemoryPayload(point.payload || {});
      const fields = payloadToMemoryFields(payload);
      return {
        id: String(point.id),
        score: numberOr(point.score, 0),
        name: fields.name,
        type: fields.type,
        description: fields.description,
        summary: truncate(fields.summary, this.config.summaryMaxChars),
        content: fields.content,
        tags: fields.tags,
        confidence: fields.confidence,
        evidence: fields.evidence,
        applicability: fields.applicability,
        status: resolveMemoryStatus(fields),
        expiresAt: fields.expiresAt,
        supersedes: fields.supersedes,
        supersededBy: fields.supersededBy,
        sourceProject: fields.sourceProject,
        sourcePath: fields.sourcePath,
        createdAt: fields.createdAt,
        updatedAt: fields.updatedAt,
      };
    });

    const eligible = options.includeInactive
      ? mapped
      : mapped.filter((item) => isMemorySearchEligible(item));
    const ranked = rankMemorySearchResults(eligible, {
      preferTypes: options.preferTypes,
      preferTags: options.preferTags,
      config: this.config,
    });
    const filtered =
      minScore > 0 ? ranked.filter((item) => item.score >= minScore) : ranked;

    return filtered.slice(0, limit);
  }

  async listAssets(
    options: MemoryHistoryOptions = {},
  ): Promise<MemoryHistoryResult> {
    if (!this.isReadEnabled()) return { items: [], total: 0 };
    return listMemoryAssetHistory({
      config: this.config,
      headers: this.buildHeaders(),
      requestJson: <T>(url: string, init?: RequestInit) =>
        this.requestJson<T>(url, init),
      options,
    });
  }

  async getAsset(assetId: string): Promise<MemoryAsset | null> {
    if (!this.isReadEnabled()) {
      return null;
    }

    const data = await this.requestJson<{ result?: { payload?: Record<string, unknown> } | null }>(
      `${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}/points/${encodeURIComponent(assetId)}`,
      {
        method: 'GET',
        headers: this.buildHeaders(false),
      }
    );

    const rawPayload = data.result?.payload;
    if (!rawPayload) {
      return null;
    }

    const fields = payloadToMemoryFields(rawPayload);
    return {
      ...fields,
      id: fields.id || assetId,
    };
  }

  async deleteAsset(assetId: string): Promise<{ deleted: boolean; asset: MemoryAsset | null }> {
    if (!this.isReadEnabled()) {
      throw new Error('记忆系统未启用');
    }

    const asset = await this.getAsset(assetId);
    if (!asset) {
      return { deleted: false, asset: null };
    }

    await this.requestJson(
      `${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}/points/delete?wait=true`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          points: [assetId],
        }),
      }
    );

    return { deleted: true, asset };
  }

  async updateAsset(
    assetId: string,
    patch: MemoryAssetPatch,
  ): Promise<MemoryUpdateOutcome> {
    if (!this.isEnabled()) throw new Error('记忆系统未启用');
    return updateMemoryAssetWithQuality(
      this.writeDependencies(),
      assetId,
      patch,
    );
  }

  private writeDependencies(): MemoryWriteDependencies {
    return {
      config: this.config,
      embed: (text) => this.embed(text),
      ensureCollection: (vectorSize) => this.ensureCollection(vectorSize),
      requestJson: <T>(url: string, init?: RequestInit) =>
        this.requestJson<T>(url, init),
      getAsset: (assetId) => this.getAsset(assetId),
    };
  }
}
export function createMemoryClient(): MemoryClient {
  return new MemoryClient();
}
