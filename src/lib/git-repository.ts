import * as fs from 'node:fs';
import * as path from 'node:path';

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
