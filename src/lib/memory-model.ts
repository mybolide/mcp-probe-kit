export const NEGATIVE_MEMORY_TYPES = [
  'failed_approach',
  'false_root_cause',
  'regression_case',
] as const;

export const MEMORY_STATUSES = [
  'active',
  'stale',
  'expired',
  'superseded',
  'retracted',
] as const;

export type NegativeMemoryType = (typeof NEGATIVE_MEMORY_TYPES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryLifecycleFields {
  evidence?: string[];
  applicability?: string;
  status?: MemoryStatus;
  expiresAt?: string;
  supersedes?: string[];
  supersededBy?: string;
}

export interface MemoryAsset extends MemoryLifecycleFields {
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

export interface MemorySearchResult extends MemoryLifecycleFields {
  id: string;
  score: number;
  name: string;
  type: string;
  description: string;
  summary: string;
  content: string;
  tags: string[];
  confidence?: number;
  sourceProject?: string;
  sourcePath?: string;
}

export interface MemorySearchOptions {
  limit?: number;
  minScore?: number;
  preferTypes?: string[];
  preferTags?: string[];
  includeInactive?: boolean;
}

export function isNegativeMemoryType(value: string): value is NegativeMemoryType {
  return NEGATIVE_MEMORY_TYPES.includes(value as NegativeMemoryType);
}

export function normalizeMemoryStatus(value: unknown): MemoryStatus {
  return MEMORY_STATUSES.includes(value as MemoryStatus)
    ? (value as MemoryStatus)
    : 'active';
}

export function normalizeOptionalIsoDate(
  value: unknown,
  fieldName: string
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} 必须是有效 ISO 日期时间`);
  }
  return date.toISOString();
}

export function resolveMemoryStatus(
  item: Pick<MemoryLifecycleFields, 'status' | 'expiresAt' | 'supersededBy'>,
  now: Date = new Date()
): MemoryStatus {
  const status = normalizeMemoryStatus(item.status);
  if (status !== 'active') return status;
  if (item.supersededBy) return 'superseded';
  if (item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'active';
}

export function isMemorySearchEligible(
  item: Pick<MemoryLifecycleFields, 'status' | 'expiresAt' | 'supersededBy'>,
  now: Date = new Date()
): boolean {
  return resolveMemoryStatus(item, now) === 'active';
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

export function mergeMemoryTags(...groups: string[][]): string[] {
  return [...new Set(groups.flat().map((item) => item.trim()).filter(Boolean))];
}
