import { buildMemoryContentHashes } from './memory-hash.js';
import {
  mergeMemoryTags,
  normalizeStringArray,
  resolveMemoryStatus,
  type MemoryAsset,
  type MemoryStatus,
} from './memory-model.js';
import {
  assertMemoryLifecycleTransition,
  buildMemoryDedupKey,
  buildMemoryIdentityKey,
  buildMemoryStorageId,
  collectActiveIdentityConflicts,
  normalizeMemoryProjectIdentity,
  parseMemoryConflictPolicy,
  parseMemoryStatus,
  validateMemoryContentQuality,
  validateSupersessionTargets,
  type MemoryConflict,
  type MemoryConflictPolicy,
} from './memory-quality.js';
import { withMemoryIdentityLock } from './memory-write-lock.js';
import {
  buildMemoryWriteEmbeddingText,
  listExistingAssets,
  loadAssets,
  persistAssets,
  type MemoryWriteDependencies,
} from './memory-write-storage.js';

export type { MemoryWriteDependencies } from './memory-write-storage.js';

function selectAvailableStorageId(
  dedupKey: string,
  existing: MemoryAsset[],
): string {
  const occupied = new Set(existing.map((asset) => asset.id));
  for (let revision = 0; revision < 10000; revision += 1) {
    const storageKey = revision === 0
      ? dedupKey
      : `${dedupKey}:revision:${revision}`;
    const id = buildMemoryStorageId({ dedupKey: storageKey });
    if (!occupied.has(id)) return id;
  }
  throw new Error('同一 Memory 内容的历史版本过多，无法分配新的稳定存储 ID');
}

export interface MemoryAssetWriteInput {
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
  conflictPolicy?: MemoryConflictPolicy;
}

export interface MemoryAssetPatch {
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
  conflictPolicy?: MemoryConflictPolicy;
}

export type MemoryWriteDisposition = 'created' | 'deduplicated' | 'superseding' | 'parallel';

export interface MemoryWriteOutcome {
  asset: MemoryAsset;
  disposition: MemoryWriteDisposition;
  conflicts: MemoryConflict[];
  supersededAssetIds: string[];
}

export interface MemoryUpdateOutcome {
  updated: boolean;
  asset: MemoryAsset | null;
  disposition?: 'updated' | 'superseding' | 'parallel';
  conflicts?: MemoryConflict[];
  supersededAssetIds?: string[];
}

export async function upsertMemoryAssetWithQuality(
  deps: MemoryWriteDependencies,
  input: MemoryAssetWriteInput,
): Promise<MemoryWriteOutcome> {
  if (input.supersededBy) {
    throw new Error(
      '新建 Memory 资产不支持 superseded_by。请先创建 successor，再用 update_memory_asset 将已有旧资产指向 successor。',
    );
  }
  const identityKey = buildMemoryIdentityKey(input);
  const inputHashes = buildMemoryContentHashes(input.content);
  const dedupKey = buildMemoryDedupKey({
    type: input.type,
    sourceProject: input.sourceProject,
    normalizedContentHash: inputHashes.normalizedContentHash,
  });
  return withMemoryIdentityLock(`dedup:${dedupKey}`, () =>
    withMemoryIdentityLock(`identity:${identityKey}`, async () => {
    const candidate = buildNewAsset(input, identityKey, dedupKey, inputHashes);
    validateMemoryContentQuality(candidate);
    const candidateVector = await deps.embed(buildMemoryWriteEmbeddingText(candidate));
    await deps.ensureCollection(candidateVector.length);

    const existing = await listExistingAssets(deps);
    const duplicate = findActiveExactDuplicate(candidate, existing);
    const conflicts = collectActiveIdentityConflicts(candidate, existing)
      .filter((item) => item.assetId !== duplicate?.id);
    const conflictPolicy = parseMemoryConflictPolicy(input.conflictPolicy);

    if (duplicate) {
      const requestedTargets = normalizeStringArray(input.supersedes);
      const autoTargets = conflictPolicy === 'supersede'
        ? conflicts.map((item) => item.assetId)
        : [];
      const targetIds = normalizeStringArray([...requestedTargets, ...autoTargets]);
      if (targetIds.length === 0) {
        return {
          asset: duplicate,
          disposition: 'deduplicated',
          conflicts,
          supersededAssetIds: [],
        };
      }
      const linked = await persistSupersession(deps, duplicate, targetIds);
      return {
        asset: linked.successor,
        disposition: 'superseding',
        conflicts,
        supersededAssetIds: linked.targets.map((item) => item.id),
      };
    }

    candidate.id = selectAvailableStorageId(dedupKey, existing);

    const explicitTargets = normalizeStringArray(input.supersedes);
    const uncoveredConflicts = conflicts.filter(
      (item) => !explicitTargets.includes(item.assetId),
    );
    if (uncoveredConflicts.length > 0 && conflictPolicy === 'reject') {
      throw new Error(
        `检测到同身份 Memory 冲突: ${uncoveredConflicts.map((item) => item.assetId).join(', ')}。`
        + '请使用 conflict_policy=supersede 明确替代，或 conflict_policy=allow_parallel 保留并行版本。',
      );
    }

    const targetIds = normalizeStringArray([
      ...explicitTargets,
      ...(conflictPolicy === 'supersede'
        ? conflicts.map((item) => item.assetId)
        : []),
    ]);
    if (targetIds.length > 0) {
      const linked = await persistSupersession(
        deps,
        candidate,
        targetIds,
        candidateVector,
      );
      return {
        asset: linked.successor,
        disposition: 'superseding',
        conflicts,
        supersededAssetIds: linked.targets.map((item) => item.id),
      };
    }

    await persistAssets(deps, [candidate], new Map([[candidate.id, candidateVector]]));
    return {
      asset: candidate,
      disposition: conflicts.length > 0 ? 'parallel' : 'created',
      conflicts,
      supersededAssetIds: [],
    };
    })
  );
}

export async function updateMemoryAssetWithQuality(
  deps: MemoryWriteDependencies,
  assetId: string,
  patch: MemoryAssetPatch,
): Promise<MemoryUpdateOutcome> {
  const existing = await deps.getAsset(assetId);
  if (!existing) return { updated: false, asset: null };

  const next = buildUpdatedAsset(existing, patch);
  assertMemoryLifecycleTransition(existing, next);

  const needsConflictScan =
    patch.name !== undefined
    || patch.type !== undefined
    || patch.sourceProject !== undefined
    || patch.content !== undefined
    || patch.conflictPolicy !== undefined;
  const allAssets = needsConflictScan ? await listExistingAssets(deps) : [];
  const conflicts = needsConflictScan
    ? collectActiveIdentityConflicts(next, allAssets)
        .filter((item) => item.assetId !== existing.id)
    : [];
  const conflictPolicy = parseMemoryConflictPolicy(patch.conflictPolicy);
  const explicitTargets = normalizeStringArray(patch.supersedes);
  const uncovered = conflicts.filter((item) => !explicitTargets.includes(item.assetId));
  if (uncovered.length > 0 && conflictPolicy === 'reject') {
    throw new Error(
      `更新后将与同身份 Memory 冲突: ${uncovered.map((item) => item.assetId).join(', ')}。`
      + '请显式 supersede 或使用 conflict_policy=allow_parallel。',
    );
  }

  const targetIds = normalizeStringArray([
    ...explicitTargets,
    ...(conflictPolicy === 'supersede'
      ? conflicts.map((item) => item.assetId)
      : []),
  ]);
  const changed = new Map<string, MemoryAsset>();
  changed.set(next.id, next);

  if (targetIds.length > 0) {
    const targets = await loadAssets(deps, targetIds);
    validateSupersessionTargets(next, targets);
    next.supersedes = mergeMemoryTags(next.supersedes ?? [], targetIds);
    for (const target of targets) {
      changed.set(target.id, markSuperseded(target, next.id));
    }
  }

  if (next.supersededBy) {
    const successor = await deps.getAsset(next.supersededBy);
    if (!successor) throw new Error(`superseded_by 指向不存在的资产: ${next.supersededBy}`);
    validateSupersessionTargets(successor, [next]);
    changed.set(successor.id, {
      ...successor,
      supersedes: mergeMemoryTags(successor.supersedes ?? [], [next.id]),
      updatedAt: new Date().toISOString(),
    });
    changed.set(next.id, markSuperseded(next, successor.id));
  }

  await persistAssets(deps, [...changed.values()]);
  return {
    updated: true,
    asset: changed.get(next.id) ?? next,
    disposition:
      targetIds.length > 0 || next.supersededBy
        ? 'superseding'
        : conflicts.length > 0
          ? 'parallel'
          : 'updated',
    conflicts,
    supersededAssetIds: targetIds,
  };
}

function buildNewAsset(
  input: MemoryAssetWriteInput,
  identityKey = buildMemoryIdentityKey(input),
  dedupKey?: string,
  precomputedHashes?: ReturnType<typeof buildMemoryContentHashes>,
): MemoryAsset {
  const now = new Date().toISOString();
  const hashes = precomputedHashes ?? buildMemoryContentHashes(input.content);
  const resolvedDedupKey = dedupKey ?? buildMemoryDedupKey({
    type: input.type,
    sourceProject: input.sourceProject,
    normalizedContentHash: hashes.normalizedContentHash,
  });
  const status = input.supersededBy
    ? 'superseded'
    : input.status === undefined
      ? 'active'
      : parseMemoryStatus(input.status);
  const asset: MemoryAsset = {
    id: buildMemoryStorageId({
      dedupKey: resolvedDedupKey,
    }),
    identityKey,
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
    status,
    expiresAt: input.expiresAt,
    supersedes: normalizeStringArray(input.supersedes),
    supersededBy: input.supersededBy,
    contentHash: hashes.contentHash,
    normalizedContentHash: hashes.normalizedContentHash,
    createdAt: now,
    updatedAt: now,
  };
  asset.status = resolveMemoryStatus(asset);
  return asset;
}

function buildUpdatedAsset(existing: MemoryAsset, patch: MemoryAssetPatch): MemoryAsset {
  const next: MemoryAsset = {
    ...existing,
    name: patch.name ?? existing.name,
    type: patch.type ?? existing.type,
    description: patch.description ?? existing.description,
    summary: patch.summary ?? existing.summary,
    content: patch.content ?? existing.content,
    tags: patch.tags ?? existing.tags,
    confidence: patch.confidence ?? existing.confidence,
    sourceProject:
      patch.sourceProject !== undefined ? patch.sourceProject : existing.sourceProject,
    sourcePath: patch.sourcePath !== undefined ? patch.sourcePath : existing.sourcePath,
    usage: patch.usage !== undefined ? patch.usage : existing.usage,
    evidence: patch.evidence ?? existing.evidence,
    applicability:
      patch.applicability !== undefined ? patch.applicability : existing.applicability,
    status: patch.status !== undefined
      ? parseMemoryStatus(patch.status)
      : patch.supersededBy
        ? 'superseded'
        : existing.status,
    expiresAt:
      patch.expiresAt !== undefined ? patch.expiresAt ?? undefined : existing.expiresAt,
    supersedes: patch.supersedes
      ? mergeMemoryTags(existing.supersedes ?? [], patch.supersedes)
      : existing.supersedes,
    supersededBy:
      patch.supersededBy !== undefined ? patch.supersededBy : existing.supersededBy,
    updatedAt: new Date().toISOString(),
  };
  next.identityKey = buildMemoryIdentityKey(next);
  const hashes = buildMemoryContentHashes(next.content);
  next.contentHash = hashes.contentHash;
  next.normalizedContentHash = hashes.normalizedContentHash;
  next.status = resolveMemoryStatus(next);
  return next;
}

async function persistSupersession(
  deps: MemoryWriteDependencies,
  successorInput: MemoryAsset,
  targetIds: string[],
  successorVector?: number[],
): Promise<{ successor: MemoryAsset; targets: MemoryAsset[] }> {
  const targets = await loadAssets(deps, targetIds);
  const successor = {
    ...successorInput,
    supersedes: mergeMemoryTags(successorInput.supersedes ?? [], targetIds),
    updatedAt: new Date().toISOString(),
  };
  validateSupersessionTargets(successor, targets);
  const updatedTargets = targets.map((target) => markSuperseded(target, successor.id));
  const vectors = successorVector
    ? new Map<string, number[]>([[successor.id, successorVector]])
    : undefined;
  await persistAssets(deps, [successor, ...updatedTargets], vectors);
  return { successor, targets: updatedTargets };
}

function markSuperseded(asset: MemoryAsset, successorId: string): MemoryAsset {
  const next = {
    ...asset,
    status: 'superseded' as const,
    supersededBy: successorId,
    updatedAt: new Date().toISOString(),
  };
  assertMemoryLifecycleTransition(asset, next);
  return next;
}

function findActiveExactDuplicate(
  candidate: MemoryAsset,
  existing: MemoryAsset[],
): MemoryAsset | undefined {
  const project = normalizeMemoryProjectIdentity(candidate.sourceProject);
  return existing.find((asset) =>
    resolveMemoryStatus(asset) === 'active'
    && asset.normalizedContentHash === candidate.normalizedContentHash
    && asset.type === candidate.type
    && normalizeMemoryProjectIdentity(asset.sourceProject) === project
  );
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
