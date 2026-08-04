import { createHash } from 'node:crypto';
import {
  MEMORY_STATUSES,
  isNegativeMemoryType,
  normalizeStringArray,
  resolveMemoryStatus,
  type MemoryAsset,
  type MemoryStatus,
} from './memory-model.js';

export const MEMORY_CONFLICT_POLICIES = [
  'reject',
  'supersede',
  'allow_parallel',
] as const;

export type MemoryConflictPolicy = (typeof MEMORY_CONFLICT_POLICIES)[number];

export interface MemoryIdentityInput {
  name: string;
  type: string;
  sourceProject?: string;
}

export function buildMemoryStorageId(input: {
  dedupKey: string;
}): string {
  const hex = createHash('sha256')
    .update(input.dedupKey)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function buildMemoryDedupKey(input: {
  type: string;
  sourceProject?: string;
  normalizedContentHash: string;
}): string {
  return createHash('sha256')
    .update(JSON.stringify({
      type: normalizeMemoryIdentityText(input.type),
      sourceProject: normalizeMemoryProjectIdentity(input.sourceProject),
      normalizedContentHash: input.normalizedContentHash,
    }))
    .digest('hex');
}

export interface MemoryConflict {
  assetId: string;
  name: string;
  type: string;
  sourceProject?: string;
  status: MemoryStatus;
  reason: 'identity_conflict';
}

export function parseMemoryStatus(value: unknown, fieldName = 'status'): MemoryStatus {
  const normalized = String(value ?? '').trim();
  if (!MEMORY_STATUSES.includes(normalized as MemoryStatus)) {
    throw new Error(
      `${fieldName} 不支持: ${normalized || '(empty)'}。可选值: ${MEMORY_STATUSES.join(', ')}`,
    );
  }
  return normalized as MemoryStatus;
}

export function parseMemoryConflictPolicy(value: unknown): MemoryConflictPolicy {
  const normalized = String(value ?? 'reject').trim() || 'reject';
  if (!MEMORY_CONFLICT_POLICIES.includes(normalized as MemoryConflictPolicy)) {
    throw new Error(
      `conflict_policy 不支持: ${normalized}。可选值: ${MEMORY_CONFLICT_POLICIES.join(', ')}`,
    );
  }
  return normalized as MemoryConflictPolicy;
}

export function normalizeMemoryProjectIdentity(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.git$/i, '')
    .replace(/\/+$/g, '')
    .toLowerCase();
}

export function normalizeMemoryIdentityText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_./\\]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .replace(/\s+/g, ' ');
}

export function buildMemoryIdentityKey(input: MemoryIdentityInput): string {
  const payload = JSON.stringify({
    name: normalizeMemoryIdentityText(input.name),
    type: normalizeMemoryIdentityText(input.type),
    sourceProject: normalizeMemoryProjectIdentity(input.sourceProject),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function collectActiveIdentityConflicts(
  candidate: MemoryIdentityInput,
  existing: MemoryAsset[],
): MemoryConflict[] {
  const candidateKey = buildMemoryIdentityKey(candidate);
  return existing
    .filter((asset) => buildMemoryIdentityKey(asset) === candidateKey)
    .filter((asset) => resolveMemoryStatus(asset) === 'active')
    .map((asset) => ({
      assetId: asset.id,
      name: asset.name,
      type: asset.type,
      sourceProject: asset.sourceProject,
      status: resolveMemoryStatus(asset),
      reason: 'identity_conflict' as const,
    }));
}

export function validateMemoryContentQuality(input: {
  type: string;
  evidence?: string[];
  status?: MemoryStatus;
  supersededBy?: string;
}): void {
  const evidence = normalizeStringArray(input.evidence);
  if (isNegativeMemoryType(input.type) && evidence.length === 0) {
    throw new Error(`${input.type} 必须提供 evidence，记录失败、证伪或回归依据`);
  }
  if (input.status === 'retracted' && evidence.length === 0) {
    throw new Error('retracted 记忆必须提供 evidence，说明撤回原因和证据');
  }
  if (input.status === 'superseded' && !input.supersededBy) {
    throw new Error('status=superseded 时必须提供 superseded_by');
  }
}

export function assertMemoryLifecycleTransition(
  existing: MemoryAsset,
  next: MemoryAsset,
): void {
  const previousStatus = resolveMemoryStatus(existing);
  const nextStatus = resolveMemoryStatus(next);

  if (existing.supersededBy && next.supersededBy !== existing.supersededBy) {
    throw new Error(
      `资产 ${existing.id} 已被 ${existing.supersededBy} 替代，superseded_by 不允许改写或清除`,
    );
  }
  if (previousStatus === 'retracted' && nextStatus !== 'retracted') {
    throw new Error(`资产 ${existing.id} 已撤回，不允许恢复为 ${nextStatus}`);
  }
  if (previousStatus === 'superseded' && !['superseded', 'retracted'].includes(nextStatus)) {
    throw new Error(`资产 ${existing.id} 已被替代，不允许恢复为 ${nextStatus}`);
  }

  const previousSupersedes = new Set(normalizeStringArray(existing.supersedes));
  const nextSupersedes = new Set(normalizeStringArray(next.supersedes));
  const removed = [...previousSupersedes].filter((id) => !nextSupersedes.has(id));
  if (removed.length > 0) {
    throw new Error(
      `supersedes 是历史关系，不允许删除已有关系: ${removed.join(', ')}`,
    );
  }

  validateMemoryContentQuality({
    type: next.type,
    evidence: next.evidence,
    status: nextStatus,
    supersededBy: next.supersededBy,
  });
}

export function validateSupersessionTargets(
  successor: MemoryAsset,
  targets: MemoryAsset[],
): void {
  const successorProject = normalizeMemoryProjectIdentity(successor.sourceProject);
  for (const target of targets) {
    if (target.id === successor.id) {
      throw new Error('记忆资产不能替代自身');
    }
    const targetProject = normalizeMemoryProjectIdentity(target.sourceProject);
    if (targetProject !== successorProject) {
      throw new Error(
        `不能跨 Memory scope 建立 supersede：${target.id}(${targetProject || 'shared'}) -> ${successor.id}(${successorProject || 'shared'})`,
      );
    }
    if (resolveMemoryStatus(target) === 'retracted') {
      throw new Error(`已撤回资产 ${target.id} 不能作为 supersede 目标`);
    }
    if (target.supersededBy && target.supersededBy !== successor.id) {
      throw new Error(
        `资产 ${target.id} 已被 ${target.supersededBy} 替代，不能再次指向 ${successor.id}`,
      );
    }
  }
}
