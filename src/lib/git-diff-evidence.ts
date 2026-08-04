import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { assertGitRepository } from './git-repository.js';

export type GitDiffMode = 'auto' | 'working' | 'staged' | 'range';

export interface GitChangedFile {
  path: string;
  status: string;
  oldPath?: string;
  additions?: number;
  deletions?: number;
  binary?: boolean;
  untracked?: boolean;
}

export interface GitDiffEvidence {
  available: true;
  repositoryRoot: string;
  mode: GitDiffMode;
  currentRevision?: string;
  branch?: string;
  baseRef?: string;
  headRef?: string;
  changedFiles: GitChangedFile[];
  untrackedFiles: string[];
  diff: string;
  diffChars: number;
  truncated: boolean;
  warnings: string[];
}

export interface CollectGitDiffInput {
  projectRoot: string;
  mode?: GitDiffMode;
  baseRef?: string;
  headRef?: string;
  maxDiffChars?: number;
}

interface GitCommandResult {
  ok: boolean;
  stdout: string;
  error?: string;
}

const MAX_GIT_OUTPUT = 16 * 1024 * 1024;

function runGit(root: string, args: string[]): GitCommandResult {
  try {
    return {
      ok: true,
      stdout: execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: MAX_GIT_OUTPUT,
      }),
    };
  } catch (error) {
    const err = error as { stderr?: string | Buffer; message?: string };
    const stderr = typeof err.stderr === 'string'
      ? err.stderr
      : Buffer.isBuffer(err.stderr)
        ? err.stderr.toString('utf8')
        : '';
    return {
      ok: false,
      stdout: '',
      error: stderr.trim() || err.message || 'git command failed',
    };
  }
}

function safeRef(value: string | undefined, field: string): string | undefined {
  const ref = value?.trim();
  if (!ref) return undefined;
  if (ref.startsWith('-') || !/^[A-Za-z0-9][A-Za-z0-9._/@{}~^:+-]*$/.test(ref)) {
    throw new Error(`${field} 不是安全的 Git ref: ${ref}`);
  }
  return ref;
}

function normalizedLimit(value: number | undefined): number {
  const limit = value ?? 120_000;
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1_000 || limit > 500_000) {
    throw new Error('max_diff_chars 必须是 1000 到 500000 之间的整数');
  }
  return limit;
}

function hasHead(root: string): boolean {
  return runGit(root, ['rev-parse', '--verify', 'HEAD']).ok;
}

function diffCommandSets(
  root: string,
  mode: GitDiffMode,
  baseRef?: string,
  headRef?: string,
): string[][] {
  if (mode === 'working') return [['diff', '--no-ext-diff', '--no-color', '--']];
  if (mode === 'staged') return [['diff', '--cached', '--no-ext-diff', '--no-color', '--']];
  if (mode === 'range') {
    if (!baseRef || !headRef) throw new Error('diff_mode=range 时必须提供 base_ref 和 head_ref');
    return [['diff', '--no-ext-diff', '--no-color', baseRef, headRef, '--']];
  }
  if (hasHead(root)) return [['diff', '--no-ext-diff', '--no-color', 'HEAD', '--']];
  return [
    ['diff', '--cached', '--no-ext-diff', '--no-color', '--'],
    ['diff', '--no-ext-diff', '--no-color', '--'],
  ];
}

function metadataCommandSets(
  root: string,
  mode: GitDiffMode,
  flag: '--name-status' | '--numstat',
  baseRef?: string,
  headRef?: string,
): string[][] {
  const suffix = flag === '--name-status' ? [flag] : [flag];
  if (mode === 'working') return [['diff', ...suffix, '--']];
  if (mode === 'staged') return [['diff', '--cached', ...suffix, '--']];
  if (mode === 'range') {
    if (!baseRef || !headRef) throw new Error('diff_mode=range 时必须提供 base_ref 和 head_ref');
    return [['diff', ...suffix, baseRef, headRef, '--']];
  }
  if (hasHead(root)) return [['diff', ...suffix, 'HEAD', '--']];
  return [
    ['diff', '--cached', ...suffix, '--'],
    ['diff', ...suffix, '--'],
  ];
}

function collectOutputs(root: string, commands: string[][], warnings: string[]): string {
  const parts: string[] = [];
  for (const args of commands) {
    const result = runGit(root, args);
    if (!result.ok) {
      warnings.push(`git ${args.join(' ')} 失败: ${result.error}`);
      continue;
    }
    if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
  }
  return parts.join('\n');
}

function parseNameStatus(text: string): Map<string, GitChangedFile> {
  const files = new Map<string, GitChangedFile>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0]?.trim() ?? '';
    if (!status) continue;
    if ((status.startsWith('R') || status.startsWith('C')) && parts.length >= 3) {
      const oldPath = normalizePath(parts[1] ?? '');
      const filePath = normalizePath(parts[2] ?? '');
      if (filePath && !isInternalPlanState(filePath)) {
        files.set(filePath, { path: filePath, oldPath, status });
      }
      continue;
    }
    const filePath = normalizePath(parts[1] ?? '');
    if (filePath && !isInternalPlanState(filePath)) {
      files.set(filePath, { path: filePath, status });
    }
  }
  return files;
}

function applyNumstat(files: Map<string, GitChangedFile>, text: string): void {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const additionsRaw = parts[0] ?? '';
    const deletionsRaw = parts[1] ?? '';
    const filePath = normalizePath(parts.at(-1) ?? '');
    if (!filePath || isInternalPlanState(filePath)) continue;
    const current = files.get(filePath) ?? { path: filePath, status: 'M' };
    files.set(filePath, {
      ...current,
      ...(additionsRaw === '-' ? { binary: true } : { additions: Number(additionsRaw) }),
      ...(deletionsRaw === '-' ? { binary: true } : { deletions: Number(deletionsRaw) }),
    });
  }
}

function collectUntracked(root: string, warnings: string[]): string[] {
  const result = runGit(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (!result.ok) {
    warnings.push(`无法读取未跟踪文件: ${result.error}`);
    return [];
  }
  return result.stdout
    .split('\0')
    .map(normalizePath)
    .filter((item) => Boolean(item) && !isInternalPlanState(item));
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function isInternalPlanState(filePath: string): boolean {
  return /^\.mcp-probe-kit\/plans\//.test(filePath);
}

function optionalGitValue(root: string, args: string[]): string | undefined {
  const result = runGit(root, args);
  return result.ok && result.stdout.trim() ? result.stdout.trim() : undefined;
}

export function collectGitDiffEvidence(input: CollectGitDiffInput): GitDiffEvidence {
  const repositoryRoot = assertGitRepository(input.projectRoot, 'code_review');
  const mode = input.mode ?? 'auto';
  const baseRef = safeRef(input.baseRef, 'base_ref');
  const headRef = safeRef(input.headRef, 'head_ref');
  const maxDiffChars = normalizedLimit(input.maxDiffChars);
  const warnings: string[] = [];
  const diff = collectOutputs(
    repositoryRoot,
    diffCommandSets(repositoryRoot, mode, baseRef, headRef),
    warnings,
  );
  const nameStatus = collectOutputs(
    repositoryRoot,
    metadataCommandSets(repositoryRoot, mode, '--name-status', baseRef, headRef),
    warnings,
  );
  const numstat = collectOutputs(
    repositoryRoot,
    metadataCommandSets(repositoryRoot, mode, '--numstat', baseRef, headRef),
    warnings,
  );
  const files = parseNameStatus(nameStatus);
  applyNumstat(files, numstat);
  const untrackedFiles = mode === 'range' ? [] : collectUntracked(repositoryRoot, warnings);
  if (untrackedFiles.length > 0) {
    warnings.push(`存在 ${untrackedFiles.length} 个未跟踪文件；Git 证据只包含文件名，Agent 必须显式读取内容后才能审查。`);
  }
  for (const filePath of untrackedFiles) {
    if (!files.has(filePath)) {
      files.set(filePath, { path: filePath, status: '??', untracked: true });
    }
  }
  const truncated = diff.length > maxDiffChars;
  const boundedDiff = truncated
    ? `${diff.slice(0, maxDiffChars)}\n\n/* ... Git diff 已截断；完整变更需由 Agent 在仓库中继续读取 ... */`
    : diff;
  const currentRevision = optionalGitValue(repositoryRoot, ['rev-parse', '--verify', 'HEAD']);
  const branch = optionalGitValue(repositoryRoot, ['branch', '--show-current']);

  return {
    available: true,
    repositoryRoot: path.resolve(repositoryRoot).replace(/\\/g, '/'),
    mode,
    ...(currentRevision ? { currentRevision } : {}),
    ...(branch ? { branch } : {}),
    ...(baseRef ? { baseRef } : {}),
    ...(headRef ? { headRef } : {}),
    changedFiles: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    untrackedFiles,
    diff: boundedDiff,
    diffChars: diff.length,
    truncated,
    warnings,
  };
}
