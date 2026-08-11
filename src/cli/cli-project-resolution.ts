import * as fs from 'node:fs';
import { resolveGitRepositoryForTool } from '../lib/git-repository.js';
import {
  resolveWorkspaceRootWithMeta,
  type WorkspaceRootResolution,
} from '../lib/workspace-root.js';
import { CliError } from './cli-error.js';

const GIT_PROJECT_TOOLS = new Set(['gencommit', 'git_work_report']);

export function resolveCliProjectForTool(
  toolName: string,
  input: Record<string, unknown>,
): WorkspaceRootResolution {
  const requested = extractRequestedProjectRoot(input);
  if (requested || !GIT_PROJECT_TOOLS.has(toolName)) {
    return resolveCliProject(input);
  }

  const root = resolveGitRepositoryForTool(undefined, toolName);
  return {
    root,
    source: process.env.WORKSPACE_FOLDER_PATHS?.trim() ? 'workspace-env' : 'cwd',
    explicitHonored: false,
  };
}

export function resolveRequiredWorkspace(
  explicitProjectRoot?: string,
): WorkspaceRootResolution {
  const resolution = resolveWorkspaceRootWithMeta(explicitProjectRoot);
  assertUsableWorkspace(resolution);
  return resolution;
}

function resolveCliProject(
  input: Record<string, unknown>,
): WorkspaceRootResolution {
  const requested = extractRequestedProjectRoot(input);
  const resolution = resolveWorkspaceRootWithMeta(requested);
  assertUsableWorkspace(resolution);
  return resolution;
}

function assertUsableWorkspace(resolution: WorkspaceRootResolution): void {
  if (resolution.source === 'package-fallback') {
    throw new CliError(
      'PROJECT_ROOT_NOT_FOUND',
      '未识别到用户项目目录，请在项目目录运行或使用 --project-root 指定',
      { resolved: resolution.root, warning: resolution.warning },
    );
  }
  if (!fs.existsSync(resolution.root) || !fs.statSync(resolution.root).isDirectory()) {
    throw new CliError(
      'PROJECT_ROOT_NOT_FOUND',
      `项目目录不存在: ${resolution.root}`,
    );
  }
}

function extractRequestedProjectRoot(input: Record<string, unknown>): string {
  for (const key of ['project_root', 'projectRoot', 'project_path']) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
