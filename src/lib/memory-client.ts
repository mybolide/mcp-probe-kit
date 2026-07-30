import { createHash, randomUUID } from 'node:crypto';
import { getMemoryConfig, isMemoryEnabled, isMemoryReadEnabled, type MemoryConfig } from './memory-config.js';
import { buildMemoryEmbeddingInput } from './memory-embedding.js';
import {
  isMemorySearchEligible,
  normalizeMemoryStatus,
  normalizeStringArray,
  resolveMemoryStatus,
  type MemoryAsset,
  type MemorySearchOptions,
  type MemorySearchResult,
  type MemoryStatus,
} from './memory-model.js';
import { normalizeMemoryPayload, payloadToMemoryFields } from './memory-payload.js';
import { rankMemorySearchResults } from './memory-ranking.js';
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
export function normalizeContentForHash(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function buildMemoryContentHashes(content: string): { contentHash: string; normalizedContentHash: string } {
  return {
    contentHash: sha256Hex(content),
    normalizedContentHash: sha256Hex(normalizeContentForHash(content)),
  };
}
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

  private async requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  private async ensureCollection(vectorSize: number): Promise<void> {
    const url = `${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}`;
    const exists = await fetch(url, { headers: this.buildHeaders(false) });
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
        }
      );
      const vector = data.data?.[0]?.embedding;
      if (!vector || !Array.isArray(vector) || vector.length === 0) {
        throw new Error('Embedding 服务未返回有效向量');
      }
      return vector;
    }

    const data = await this.requestJson<{ embedding?: number[] }>(this.config.embeddingUrl, {
      method: 'POST',
      headers: this.buildEmbeddingHeaders(),
      body: JSON.stringify({
        model: this.config.embeddingModel,
        prompt: text,
      }),
    });
    if (!data.embedding || !Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new Error('Embedding 服务未返回有效向量');
    }
    return data.embedding;
  }

  private async findExistingAsset(input: {
    normalizedContentHash: string;
    type: string;
    sourceProject?: string;
  }): Promise<MemoryAsset | null> {
    const data = await this.requestJson<{ result?: { points?: QdrantPoint[] } }>(
      `${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}/points/scroll`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          limit: 20,
          with_payload: true,
          with_vectors: false,
          filter: {
            must: [
              {
                key: 'normalizedContentHash',
                match: { value: input.normalizedContentHash },
              },
            ],
          },
        }),
      }
    );

    const expectedProject = normalizeProjectIdentity(input.sourceProject);
    for (const point of data.result?.points ?? []) {
      if (!point.payload) continue;
      const fields = payloadToMemoryFields(point.payload);
      if (fields.type !== input.type) continue;
      if (normalizeProjectIdentity(fields.sourceProject) !== expectedProject) continue;
      return { ...fields, id: fields.id || String(point.id) };
    }
    return null;
  }

  async upsertAsset(input: {
    name: string;
    type: string;
    description: string;
    summary: string;
    content: string;
    tags?: string[];
    confidence?: number;
    sourceProject?: string;
    sourcePath?: string;
    usage?: string;
    evidence?: string[];
    applicability?: string;
    status?: MemoryStatus;
    expiresAt?: string;
    supersedes?: string[];
    supersededBy?: string;
  }): Promise<MemoryAsset> {
    if (!this.isEnabled()) {
      throw new Error('记忆系统未启用');
    }

    const now = new Date().toISOString();
    const hashes = buildMemoryContentHashes(input.content);
    const asset: MemoryAsset = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      description: input.description,
      summary: input.summary,
      content: input.content,
      tags: normalizeStringArray(input.tags),
      confidence: numberOr(input.confidence, 0.5),
      sourceProject: input.sourceProject,
      sourcePath: input.sourcePath,
      usage: input.usage,
      evidence: normalizeStringArray(input.evidence),
      applicability: input.applicability,
      status: normalizeMemoryStatus(input.status),
      expiresAt: input.expiresAt,
      supersedes: normalizeStringArray(input.supersedes),
      supersededBy: input.supersededBy,
      contentHash: hashes.contentHash,
      normalizedContentHash: hashes.normalizedContentHash,
      createdAt: now,
      updatedAt: now,
    };
    asset.status = resolveMemoryStatus(asset);

    const vector = await this.embed(
      buildMemoryEmbeddingInput({
        name: asset.name,
        type: asset.type,
        description: asset.description,
        summary: asset.summary,
        tags: asset.tags,
        usage: asset.usage,
        evidence: asset.evidence,
        applicability: asset.applicability,
        status: asset.status,
        content: asset.content,
      })
    );

    await this.ensureCollection(vector.length);

    const existing = await this.findExistingAsset({
      normalizedContentHash: asset.normalizedContentHash || '',
      type: asset.type,
      sourceProject: asset.sourceProject,
    });
    if (existing) {
      return existing;
    }

    await this.requestJson(`${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}/points?wait=true`, {
      method: 'PUT',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        points: [
          {
            id: asset.id,
            vector,
            payload: asset,
          },
        ],
      }),
    });

    return asset;
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
    patch: {
      name?: string;
      type?: string;
      description?: string;
      summary?: string;
      content?: string;
      tags?: string[];
      confidence?: number;
      sourceProject?: string;
      sourcePath?: string;
      usage?: string;
      evidence?: string[];
      applicability?: string;
      status?: MemoryStatus;
      expiresAt?: string | null;
      supersedes?: string[];
      supersededBy?: string;
    }
  ): Promise<{ updated: boolean; asset: MemoryAsset | null }> {
    if (!this.isEnabled()) {
      throw new Error('记忆系统未启用');
    }

    const existing = await this.getAsset(assetId);
    if (!existing) {
      return { updated: false, asset: null };
    }

    const asset: MemoryAsset = {
      ...existing,
      name: patch.name ?? existing.name,
      type: patch.type ?? existing.type,
      description: patch.description ?? existing.description,
      summary: patch.summary ?? existing.summary,
      content: patch.content ?? existing.content,
      tags: patch.tags ?? existing.tags,
      confidence: patch.confidence ?? existing.confidence,
      sourceProject: patch.sourceProject !== undefined ? patch.sourceProject : existing.sourceProject,
      sourcePath: patch.sourcePath !== undefined ? patch.sourcePath : existing.sourcePath,
      usage: patch.usage !== undefined ? patch.usage : existing.usage,
      evidence: patch.evidence ?? existing.evidence,
      applicability:
        patch.applicability !== undefined ? patch.applicability : existing.applicability,
      status:
        patch.status ?? (patch.supersededBy ? 'superseded' : existing.status),
      expiresAt:
        patch.expiresAt !== undefined ? patch.expiresAt ?? undefined : existing.expiresAt,
      supersedes: patch.supersedes ?? existing.supersedes,
      supersededBy:
        patch.supersededBy !== undefined ? patch.supersededBy : existing.supersededBy,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    asset.status = resolveMemoryStatus(asset);

    const hashes = buildMemoryContentHashes(asset.content);
    asset.contentHash = hashes.contentHash;
    asset.normalizedContentHash = hashes.normalizedContentHash;

    const vector = await this.embed(
      buildMemoryEmbeddingInput({
        name: asset.name,
        type: asset.type,
        description: asset.description,
        summary: asset.summary,
        tags: asset.tags,
        usage: asset.usage,
        evidence: asset.evidence,
        applicability: asset.applicability,
        status: asset.status,
        content: asset.content,
      })
    );

    await this.ensureCollection(vector.length);

    await this.requestJson(
      `${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}/points?wait=true`,
      {
        method: 'PUT',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          points: [
            {
              id: assetId,
              vector,
              payload: asset,
            },
          ],
        }),
      }
    );

    return { updated: true, asset };
  }
}
export function createMemoryClient(): MemoryClient {
  return new MemoryClient();
}
function normalizeProjectIdentity(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.git$/i, '')
    .toLowerCase();
}