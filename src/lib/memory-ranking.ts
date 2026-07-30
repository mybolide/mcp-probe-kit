import type { MemoryConfig } from './memory-config.js';
import type { MemorySearchResult } from './memory-model.js';

export type MemoryScope = 'project' | 'shared';

export interface MemoryRankingOptions {
  preferTypes?: string[];
  preferTags?: string[];
  config: MemoryConfig;
}

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

  const preferenceTier = (item: MemorySearchResult): number => {
    let tier = 0;
    if (preferredTypes.has(item.type.toLowerCase())) tier += 2;
    if (item.tags.some((tag) => preferredTags.has(tag.toLowerCase()))) tier += 1;
    return tier;
  };

  const adjustedScore = (item: MemorySearchResult): number => {
    const projectBoost =
      classifyMemoryScope(item, options.config) === 'project'
        ? options.config.projectPriorityBoost
        : 0;
    const confidence = clamp(item.confidence ?? 0.5, 0, 1);
    return item.score + projectBoost + confidence * 0.01;
  };

  return [...results].sort((a, b) => {
    const tierDiff = preferenceTier(b) - preferenceTier(a);
    if (tierDiff !== 0) return tierDiff;

    const scoreDiff = adjustedScore(b) - adjustedScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    return b.score - a.score;
  });
}

function normalizeIdentity(value: string | undefined): string {
  return (value ?? '').trim().replace(/\\/g, '/').replace(/\.git$/i, '').toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
