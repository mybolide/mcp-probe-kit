import { collectGitDiffEvidence, type GitDiffEvidence, type GitDiffMode } from './git-diff-evidence.js';
import { compareReviewConsistency, type ReviewConsistencyResult } from './review-consistency.js';
import { resolveWorkspaceRoot } from './workspace-root.js';
import { JsonPlanStore } from '../plans/plan-store.js';
import type { PlanHeartbeatRecord } from '../plans/plan-types.js';

export interface UnavailableGitDiffEvidence {
  available: false;
  repositoryRoot: string;
  mode: GitDiffMode;
  changedFiles: [];
  untrackedFiles: [];
  diff: '';
  diffChars: 0;
  truncated: false;
  warnings: string[];
  error: string;
}

export type CodeReviewDiffEvidence = GitDiffEvidence | UnavailableGitDiffEvidence;

export interface CodeReviewEvidenceBundle {
  projectRoot?: string;
  diffEvidence?: CodeReviewDiffEvidence;
  planState?: PlanHeartbeatRecord | null;
  planContext?: Record<string, unknown>;
  consistency?: ReviewConsistencyResult;
  warnings: string[];
}

export interface CollectCodeReviewEvidenceInput {
  projectRoot?: string;
  planId?: string;
  collectDiff: boolean;
  diffMode?: GitDiffMode;
  baseRef?: string;
  headRef?: string;
  maxDiffChars?: number;
}

export function normalizeGitDiffMode(value: string): GitDiffMode {
  const mode = (value || 'auto').trim().toLowerCase();
  if (mode === 'auto' || mode === 'working' || mode === 'staged' || mode === 'range') {
    return mode;
  }
  throw new Error(`diff_mode 不支持: ${value}。可选值: auto, working, staged, range`);
}

function summarizePlan(record: PlanHeartbeatRecord): Record<string, unknown> {
  return {
    planId: record.planId,
    workflow: record.plan.workflow,
    objective: record.plan.objective,
    status: record.status,
    currentStepId: record.currentStepId ?? null,
    declaredScope: record.declaredScope ?? record.plan.declaredScope ?? null,
    requiredEvidenceKinds: record.plan.requiredEvidenceKinds,
    qualityGates: record.plan.qualityGates,
    completionCriteria: record.plan.completionCriteria,
    steps: record.plan.steps.map((step) => ({
      id: step.id,
      type: step.type,
      tool: step.tool,
      action: step.action,
      when: step.when,
      outputs: step.outputs ?? [],
      expectedOutputs: step.expectedOutputs ?? [],
      completionEvidence: step.completionEvidence ?? [],
      qualityGates: step.qualityGates ?? [],
    })),
    completedStepIds: record.completedStepIds,
    skippedSteps: record.skippedSteps,
    unresolvedItems: record.unresolvedItems,
    evidence: record.evidence,
    artifacts: record.artifacts,
    architectureCandidates: record.architectureCandidates,
    acceptanceResults: record.acceptanceResults,
    runtimeEvidence: record.runtimeEvidence,
    lastVerifiedRevision: record.lastVerifiedRevision ?? null,
    lastConvergence: record.lastConvergence ?? null,
  };
}

export async function collectCodeReviewEvidence(
  input: CollectCodeReviewEvidenceInput,
): Promise<CodeReviewEvidenceBundle> {
  const warnings: string[] = [];
  if (!input.projectRoot && !input.planId && !input.collectDiff) return { warnings };
  const projectRoot = resolveWorkspaceRoot(input.projectRoot ?? '').replace(/\\/g, '/');
  const mode = input.diffMode ?? 'auto';
  let planState: PlanHeartbeatRecord | null | undefined;
  if (input.planId) {
    try {
      planState = await new JsonPlanStore(projectRoot).read(input.planId);
    } catch (error) {
      warnings.push(`读取 Plan 状态失败: ${error instanceof Error ? error.message : String(error)}`);
      planState = null;
    }
  }

  let diffEvidence: CodeReviewDiffEvidence | undefined;
  if (input.collectDiff) {
    try {
      diffEvidence = collectGitDiffEvidence({
        projectRoot,
        mode,
        baseRef: input.baseRef,
        headRef: input.headRef,
        maxDiffChars: input.maxDiffChars,
      });
      warnings.push(...diffEvidence.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diffEvidence = {
        available: false,
        repositoryRoot: projectRoot,
        mode,
        changedFiles: [],
        untrackedFiles: [],
        diff: '',
        diffChars: 0,
        truncated: false,
        warnings: [message],
        error: message,
      };
      warnings.push(message);
    }
  }

  const consistency = diffEvidence?.available
    ? compareReviewConsistency({
        repositoryRoot: diffEvidence.repositoryRoot,
        diff: diffEvidence,
        plan: planState,
        requestedPlanId: input.planId,
      })
    : undefined;

  return {
    projectRoot,
    ...(diffEvidence ? { diffEvidence } : {}),
    ...(planState !== undefined ? { planState } : {}),
    ...(planState ? { planContext: summarizePlan(planState) } : {}),
    ...(consistency ? { consistency } : {}),
    warnings,
  };
}

export function renderConsistencyEvidence(bundle: CodeReviewEvidenceBundle): string {
  const sections: string[] = [];
  if (bundle.diffEvidence) {
    if (bundle.diffEvidence.available) {
      sections.push([
        `- Git root: ${bundle.diffEvidence.repositoryRoot}`,
        `- Diff mode: ${bundle.diffEvidence.mode}`,
        `- Current revision: ${bundle.diffEvidence.currentRevision ?? 'unborn/unknown'}`,
        `- Changed files: ${bundle.diffEvidence.changedFiles.length}`,
        `- Untracked files: ${bundle.diffEvidence.untrackedFiles.length}`,
        `- Diff truncated: ${bundle.diffEvidence.truncated}`,
      ].join('\n'));
    } else {
      sections.push(`- Git diff unavailable: ${bundle.diffEvidence.error}`);
    }
  }
  if (bundle.planContext) {
    sections.push(`- Plan loaded: ${String(bundle.planContext.planId)} (${String(bundle.planContext.workflow)})`);
  }
  if (bundle.consistency) {
    const findings = bundle.consistency.findings.length > 0
      ? bundle.consistency.findings.map((item, index) => [
          `${index + 1}. [${item.severity}/${item.category}] ${item.message}`,
          `   Evidence: ${item.evidence.join('；') || 'none'}`,
          `   Action: ${item.suggestion}`,
        ].join('\n')).join('\n')
      : '- No deterministic consistency gaps detected.';
    sections.push(`### Deterministic Consistency Findings\n${findings}`);
  }
  if (bundle.warnings.length > 0) {
    sections.push(`### Evidence Warnings\n${bundle.warnings.map((item) => `- ${item}`).join('\n')}`);
  }
  return sections.length > 0
    ? `## Git / Plan Evidence\n\n${sections.join('\n\n')}`
    : '';
}
