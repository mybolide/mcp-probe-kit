function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

/**
 * Unify legacy Qdrant payloads (kind/title/source) with the current asset schema.
 */
export function normalizeMemoryPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...payload };

  if (!normalized.name && typeof normalized.title === 'string') {
    normalized.name = normalized.title;
  }

  if (!normalized.type && typeof normalized.kind === 'string') {
    const kind = normalized.kind;
    normalized.type = kind === 'extracted_pattern' ? 'pattern' : kind;
  }

  if (!normalized.description) {
    if (typeof normalized.title === 'string') {
      normalized.description = normalized.title;
    } else if (typeof normalized.source === 'string') {
      normalized.description = `Legacy memory from ${normalized.source}`;
    }
  }

  if (!normalized.summary && typeof normalized.content === 'string') {
    normalized.summary = truncate(normalized.content, 280);
  }

  if (!normalized.createdAt && typeof normalized.created_at === 'string') {
    normalized.createdAt = normalized.created_at;
  }

  if (!normalized.updatedAt) {
    if (typeof normalized.updated_at === 'string') {
      normalized.updatedAt = normalized.updated_at;
    } else if (typeof normalized.createdAt === 'string') {
      normalized.updatedAt = normalized.createdAt;
    }
  }

  return normalized;
}

export function payloadToMemoryFields(payload: Record<string, unknown>): {
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
} {
  const p = normalizeMemoryPayload(payload);

  const tags = Array.isArray(p.tags)
    ? p.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    id: String(p.id || ''),
    name: String(p.name || ''),
    type: String(p.type || ''),
    description: String(p.description || ''),
    summary: String(p.summary || ''),
    content: String(p.content || ''),
    tags,
    confidence: typeof p.confidence === 'number' && Number.isFinite(p.confidence) ? p.confidence : 0.5,
    sourceProject: typeof p.sourceProject === 'string' ? p.sourceProject : undefined,
    sourcePath: typeof p.sourcePath === 'string' ? p.sourcePath : undefined,
    usage: typeof p.usage === 'string' ? p.usage : undefined,
    contentHash: typeof p.contentHash === 'string' ? p.contentHash : undefined,
    normalizedContentHash:
      typeof p.normalizedContentHash === 'string' ? p.normalizedContentHash : undefined,
    createdAt: String(p.createdAt || ''),
    updatedAt: String(p.updatedAt || ''),
  };
}
