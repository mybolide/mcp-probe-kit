import type { MemoryConfig } from './memory-config.js';
import {
  isNegativeMemoryType,
  resolveMemoryStatus,
  type MemorySearchResult,
  type MemoryStatus,
} from './memory-model.js';

export type MemoryScope = 'project' | 'shared';

export interface MemoryRankingOptions {
  preferTypes?: string[];
  preferTags?: string[];
  config: MemoryConfig;
}

export interface MemoryRankingBreakdown {
  lifecycleStatus: MemoryStatus;
  lifecycleTier: number;
  preferenceTier: number;
  vectorScore: number;
  projectBoost: number;
  confidenceBoost: number;
  evidenceBoost: number;
  applicabilityBoost: number;
  weakNegativePenalty: number;
  adjustedScore: number;
}

const LIFECYCLE_TIERS: Record<MemoryStatus, number> = {
  active: 5,
  stale: 4,
  expired: 3,
  superseded: 2,
  retracted: 1,
};

export function classifyMemoryScope(
  item: Pick<MemorySearchResult, 'sourceProject'>,
  config: MemoryConfig
): MemoryScope {
  const repoId = normalizeIdentity(config.repoId);
  const sourceProject = normalizeIdentity(item.sourceProject);
  return repoId && sourceProject === repoId ? 'project' : 'shared';
}

export function rankMemorySearchResults(
  results: MemorySearchResult[],
  options: MemoryRankingOptions
): MemorySearchResult[] {
  const preferredTypes = new Set(
    (options.preferTypes ?? []).map((item) => item.toLowerCase())
  );
  const preferredTags = new Set(
    (options.preferTags ?? []).map((item) => item.toLowerCase())
  );

  const breakdown = (item: MemorySearchResult) => explainMemoryRanking(item, {
    ...options,
    preferTypes: [...preferredTypes],
    preferTags: [...preferredTags],
  });

  return [...results].sort((a, b) => {
    const aRank = breakdown(a);
    const bRank = breakdown(b);

    const lifecycleDiff = bRank.lifecycleTier - aRank.lifecycleTier;
    if (lifecycleDiff !== 0) return lifecycleDiff;

    const tierDiff = bRank.preferenceTier - aRank.preferenceTier;
    if (tierDiff !== 0) return tierDiff;

    const scoreDiff = bRank.adjustedScore - aRank.adjustedScore;
    if (scoreDiff !== 0) return scoreDiff;

    const updatedDiff = timestamp(b.updatedAt) - timestamp(a.updatedAt);
    if (updatedDiff !== 0) return updatedDiff;
    return a.id.localeCompare(b.id);
  });
}

export function explainMemoryRanking(
  item: MemorySearchResult,
  options: MemoryRankingOptions,
): MemoryRankingBreakdown {
  const preferredTypes = new Set(
    (options.preferTypes ?? []).map((value) => value.toLowerCase()),
  );
  const preferredTags = new Set(
    (options.preferTags ?? []).map((value) => value.toLowerCase()),
  );
  let preferenceTier = 0;
  if (preferredTypes.has(item.type.toLowerCase())) preferenceTier += 2;
  if (item.tags.some((tag) => preferredTags.has(tag.toLowerCase()))) preferenceTier += 1;

  const lifecycleStatus = resolveMemoryStatus(item);
  const projectBoost = classifyMemoryScope(item, options.config) === 'project'
    ? options.config.projectPriorityBoost
    : 0;
  const confidenceBoost = clamp(item.confidence ?? 0.5, 0, 1) * 0.02;
  const evidenceCount = Math.min(item.evidence?.length ?? 0, 3);
  const evidenceBoost = evidenceCount * 0.01;
  const applicabilityBoost = item.applicability?.trim() ? 0.015 : 0;
  const weakNegativePenalty = isNegativeMemoryType(item.type)
    ? (evidenceCount === 0 ? 0.12 : 0) + (!item.applicability?.trim() ? 0.03 : 0)
    : 0;
  const adjustedScore = item.score
    + projectBoost
    + confidenceBoost
    + evidenceBoost
    + applicabilityBoost
    - weakNegativePenalty;

  return {
    lifecycleStatus,
    lifecycleTier: LIFECYCLE_TIERS[lifecycleStatus],
    preferenceTier,
    vectorScore: item.score,
    projectBoost,
    confidenceBoost,
    evidenceBoost,
    applicabilityBoost,
    weakNegativePenalty,
    adjustedScore,
  };
}

function normalizeIdentity(value: string | undefined): string {
  return (value ?? '').trim().replace(/\\/g, '/').replace(/\.git$/i, '').toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function timestamp(value: string | undefined): number {
  return Date.parse(value ?? '') || 0;
}
