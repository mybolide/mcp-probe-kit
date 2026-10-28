import { collectGitDiffEvidence, type GitDiffEvidence, type GitDiffMode } from './git-diff-evidence.js';
import { resolveWorkspaceRoot } from './workspace-root.js';
import { ProjectTaskLedger } from '../devcontrol/task-ledger.js';

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
  planState?: null;
  planContext?: Record<string, unknown>;
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

export async function collectCodeReviewEvidence(
  input: CollectCodeReviewEvidenceInput,
): Promise<CodeReviewEvidenceBundle> {
  const warnings: string[] = [];
  if (!input.projectRoot && !input.planId && !input.collectDiff) return { warnings };
  const projectRoot = resolveWorkspaceRoot(input.projectRoot ?? '').replace(/\\/g, '/');
  const mode = input.diffMode ?? 'auto';
  let planContext: Record<string, unknown> | undefined;
  if (input.planId) {
    let ledger: ProjectTaskLedger | undefined;
    try {
      ledger = new ProjectTaskLedger(projectRoot);
      planContext = { taskId: input.planId, executionContract: ledger.executionContract(input.planId) };
    } catch (error) {
      warnings.push(`读取 DevControl SQLite 任务合同失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      ledger?.close();
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

  return {
    projectRoot,
    ...(diffEvidence ? { diffEvidence } : {}),
    ...(planContext ? { planContext } : {}),
    warnings,
  };
}

export function renderConsistencyEvidence(bundle: CodeReviewEvidenceBundle): string {
  const sections: string[] = [];
  if (bundle.diffEvidence) {
    if (bundle.diffEvidence.available) {
      sections.push([
        `- Git root: ${bundle.diffEvidence.repositoryRoot}`,
        `- Git scope: ${bundle.diffEvidence.scopePath ?? '.'}`,
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
    sections.push(`- DevControl SQLite task loaded: ${String(bundle.planContext.taskId)} (execution contract)`);
  }
  if (bundle.warnings.length > 0) {
    sections.push(`### Evidence Warnings\n${bundle.warnings.map((item) => `- ${item}`).join('\n')}`);
  }
  return sections.length > 0
    ? `## Git / SQLite DevControl Evidence\n\n${sections.join('\n\n')}`
    : '';
}
