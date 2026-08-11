import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveGitRepositoryForTool } from '../git-repository.js';

const originalWorkspaceFolders = process.env.WORKSPACE_FOLDER_PATHS;
const tempDirs: string[] = [];

afterEach(() => {
  if (originalWorkspaceFolders === undefined) delete process.env.WORKSPACE_FOLDER_PATHS;
  else process.env.WORKSPACE_FOLDER_PATHS = originalWorkspaceFolders;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createGitRepo(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(root);
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return root;
}

describe('resolveGitRepositoryForTool', () => {
  test('客户端工作区不是 Git 仓库时拒绝回退到 MCP 进程仓库', () => {
    const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-env-'));
    tempDirs.push(unrelated);
    const repo = createGitRepo('git-tool-cwd-');
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([unrelated]);

    expect(() => resolveGitRepositoryForTool(undefined, 'gencommit', repo))
      .toThrow(/无法安全选择项目.*project_root/);
  });

  test('客户端工作区本身是 Git 仓库时优先使用客户端工作区', () => {
    const clientRepo = createGitRepo('git-tool-client-');
    const cwdRepo = createGitRepo('git-tool-cwd-');
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([clientRepo]);

    expect(resolveGitRepositoryForTool(undefined, 'git_work_report', cwdRepo))
      .toBe(path.resolve(clientRepo));
  });

  test('多工作区中选择实际 Git 仓库而不是第一个非 Git 目录', () => {
    const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-multi-'));
    tempDirs.push(unrelated);
    const clientRepo = createGitRepo('git-tool-client-');
    const cwdRepo = createGitRepo('git-tool-cwd-');
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([unrelated, clientRepo]);

    expect(resolveGitRepositoryForTool(undefined, 'git_work_report', cwdRepo))
      .toBe(path.resolve(clientRepo));
  });

  test('没有客户端工作区时允许使用当前进程 Git 仓库', () => {
    delete process.env.WORKSPACE_FOLDER_PATHS;
    const repo = createGitRepo('git-tool-cwd-');

    expect(resolveGitRepositoryForTool(undefined, 'gencommit', repo))
      .toBe(path.resolve(repo));
  });
});
