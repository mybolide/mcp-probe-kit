import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  resolveWorkspaceRoot,
} from './workspace-root.js';

export function findGitRepositoryRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) return null;

  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function assertGitRepository(startPath: string, toolName: string): string {
  const root = findGitRepositoryRoot(startPath);
  if (!root) {
    throw new Error(`当前项目不是 Git 仓库，${toolName} 不适用: ${path.resolve(startPath)}`);
  }
  return root;
}

export function resolveGitRepositoryForTool(
  explicitProjectRoot: string | undefined,
  toolName: string,
  runtimeCwd = process.cwd(),
): string {
  if (explicitProjectRoot?.trim()) {
    return assertGitRepository(resolveWorkspaceRoot(explicitProjectRoot), toolName);
  }

  const clientWorkspaces = listClientWorkspacePaths();
  for (const clientWorkspace of clientWorkspaces) {
    const clientGitRoot = findGitRepositoryRoot(clientWorkspace);
    if (clientGitRoot) return clientGitRoot;
  }
  if (clientWorkspaces.length > 0) {
    throw new Error(
      `客户端工作区不是 Git 仓库，${toolName} 无法安全选择项目。`
      + `请显式传入 project_root。工作区: ${clientWorkspaces.join(', ')}`,
    );
  }

  const cwdGitRoot = findGitRepositoryRoot(runtimeCwd);
  if (cwdGitRoot) return cwdGitRoot;

  return assertGitRepository(resolveWorkspaceRoot(), toolName);
}

function listClientWorkspacePaths(): string[] {
  const raw = process.env.WORKSPACE_FOLDER_PATHS?.trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => path.resolve(String(item)))
          .filter((item) => fs.existsSync(item) && fs.statSync(item).isDirectory());
      }
    } catch {
      return [];
    }
  }
  const resolved = path.resolve(raw);
  return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
    ? [resolved]
    : [];
}
