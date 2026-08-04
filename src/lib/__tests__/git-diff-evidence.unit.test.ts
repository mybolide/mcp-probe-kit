import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { collectGitDiffEvidence } from '../git-diff-evidence.js';

const roots: string[] = [];

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-diff-evidence-'));
  roots.push(root);
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test User']);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'base.ts'), 'export const value = 1;\n', 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'initial']);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('git diff evidence', () => {
  test('auto 收集相对 HEAD 的 tracked 与 untracked 变更', () => {
    const root = makeRepo();
    fs.writeFileSync(path.join(root, 'src', 'base.ts'), 'export const value = 2;\n', 'utf8');
    fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'export const next = true;\n', 'utf8');

    const evidence = collectGitDiffEvidence({ projectRoot: root, mode: 'auto' });

    expect(evidence.available).toBe(true);
    expect(evidence.currentRevision).toBeTruthy();
    expect(evidence.diff).toContain('value = 2');
    expect(evidence.changedFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'src/base.ts', status: 'M' }),
      expect.objectContaining({ path: 'src/new.ts', status: '??', untracked: true }),
    ]));
    expect(evidence.untrackedFiles).toEqual(['src/new.ts']);
  });

  test('working 与 staged 模式严格分离', () => {
    const root = makeRepo();
    fs.writeFileSync(path.join(root, 'src', 'base.ts'), 'export const value = 2;\n', 'utf8');
    git(root, ['add', 'src/base.ts']);
    fs.writeFileSync(path.join(root, 'src', 'working.ts'), 'export const working = true;\n', 'utf8');

    const staged = collectGitDiffEvidence({ projectRoot: root, mode: 'staged' });
    const working = collectGitDiffEvidence({ projectRoot: root, mode: 'working' });

    expect(staged.changedFiles.map((item) => item.path)).toContain('src/base.ts');
    expect(staged.diff).toContain('value = 2');
    expect(working.changedFiles.map((item) => item.path)).toContain('src/working.ts');
    expect(working.diff).not.toContain('value = 2');
  });

  test('range 模式支持两个 revision，并明确截断大 diff', () => {
    const root = makeRepo();
    const base = git(root, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(root, 'src', 'base.ts'), `export const value = '${'x'.repeat(3000)}';\n`, 'utf8');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'large change']);
    const head = git(root, ['rev-parse', 'HEAD']);

    const evidence = collectGitDiffEvidence({
      projectRoot: root,
      mode: 'range',
      baseRef: base,
      headRef: head,
      maxDiffChars: 1000,
    });

    expect(evidence.baseRef).toBe(base);
    expect(evidence.headRef).toBe(head);
    expect(evidence.truncated).toBe(true);
    expect(evidence.diffChars).toBeGreaterThan(1000);
    expect(evidence.diff).toContain('Git diff 已截断');
  });
});
