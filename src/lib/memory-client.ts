import { createHash, randomUUID } from 'node:crypto';
import { getMemoryConfig, isMemoryEnabled, isMemoryReadEnabled, type MemoryConfig } from './memory-config.js';
import { normalizeMemoryPayload, payloadToMemoryFields } from './memory-payload.js';

export interface MemoryAsset {
  id: string;
  name: string;
  type: string;
  description: string;
  summary: string;
  content: string;
  tags: string[];
  confidence: number;
  sourceProject?: string;
  sourcePath?: string;
  usage?: string;
  contentHash?: string;
  normalizedContentHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemorySearchResult {
  id: string;
  score: number;
  name: string;
  type: string;
  description: string;
  summary: string;
  tags: string[];
  sourceProject?: string;
  sourcePath?: string;
}

export interface MemorySearchOptions {
  limit?: number;
  minScore?: number;
  preferTypes?: string[];
  preferTags?: string[];
}

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

function ensureArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function buildEmbeddingInput(input: {
  name: string;
  type: string;
  description: string;
  summary: string;
  tags: string[];
  usage?: string;
  content: string;
}): string {
  return [
    `name: ${input.name}`,
    `type: ${input.type}`,
    `description: ${input.description}`,
    `summary: ${input.summary}`,
    input.tags.length > 0 ? `tags: ${input.tags.join(', ')}` : '',
    input.usage ? `usage: ${input.usage}` : '',
    `content:\n${input.content}`,
  ]
    .filter(Boolean)
    .join('\n\n');
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

  private async findExistingAssetByNormalizedContentHash(normalizedContentHash: string): Promise<MemoryAsset | null> {
    const data = await this.requestJson<{ result?: { points?: QdrantPoint[] } }>(
      `${this.config.qdrantUrl}/collections/${encodeURIComponent(this.config.qdrantCollection)}/points/scroll`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          limit: 1,
          with_payload: true,
          with_vectors: false,
          filter: {
            must: [
              {
                key: 'normalizedContentHash',
                match: {
                  value: normalizedContentHash,
                },
              },
            ],
          },
        }),
      }
    );

    const rawPayload = data.result?.points?.[0]?.payload;
    if (!rawPayload) {
      return null;
    }

    const fields = payloadToMemoryFields(rawPayload);
    return {
      ...fields,
      id: fields.id || String(rawPayload.id || ''),
    };
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
      tags: ensureArray(input.tags),
      confidence: numberOr(input.confidence, 0.5),
      sourceProject: input.sourceProject,
      sourcePath: input.sourcePath,
      usage: input.usage,
      contentHash: hashes.contentHash,
      normalizedContentHash: hashes.normalizedContentHash,
      createdAt: now,
      updatedAt: now,
    };

    const vector = await this.embed(
      buildEmbeddingInput({
        name: asset.name,
        type: asset.type,
        description: asset.description,
        summary: asset.summary,
        tags: asset.tags,
        usage: asset.usage,
        content: asset.content,
      })
    );

    await this.ensureCollection(vector.length);

    const existing = await this.findExistingAssetByNormalizedContentHash(asset.normalizedContentHash || '');
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
        tags: fields.tags,
        sourceProject: fields.sourceProject,
        sourcePath: fields.sourcePath,
      };
    });

    const ranked = rankSearchResults(mapped, options.preferTypes, options.preferTags);
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
}

function rankSearchResults(
  results: MemorySearchResult[],
  preferTypes: string[] = [],
  preferTags: string[] = []
): MemorySearchResult[] {
  if (preferTypes.length === 0 && preferTags.length === 0) {
    return [...results].sort((a, b) => b.score - a.score);
  }

  const preferredTypes = new Set(preferTypes.map((item) => item.toLowerCase()));
  const preferredTags = new Set(preferTags.map((item) => item.toLowerCase()));

  const scoreBoost = (item: MemorySearchResult): number => {
    let boost = 0;
    if (preferredTypes.has(item.type.toLowerCase())) {
      boost += 2;
    }
    if (item.tags.some((tag) => preferredTags.has(tag.toLowerCase()))) {
      boost += 1;
    }
    return boost;
  };

  return [...results].sort((a, b) => {
    const boostDiff = scoreBoost(b) - scoreBoost(a);
    if (boostDiff !== 0) {
      return boostDiff;
    }
    return b.score - a.score;
  });
}

export function createMemoryClient(): MemoryClient {
  return new MemoryClient();
}