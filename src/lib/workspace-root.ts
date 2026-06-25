import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverProjectRootFromLayout } from "./project-context-layout.js";

const WORKSPACE_ENV_KEYS = [
  "WORKSPACE_FOLDER_PATHS",
  "MCP_PROJECT_ROOT",
  "MCP_WORKSPACE_ROOT",
  "CURSOR_WORKSPACE_ROOT",
  "WORKSPACE_ROOT",
  "PROJECT_ROOT",
  "INIT_CWD",
  "PWD",
] as const;

const WORKSPACE_MARKERS = [
  ".git",
  "package.json",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "package-lock.json",
  "tsconfig.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  ".cursor",
  ".vscode",
  ".kiro",
  "src",
  "app",
  "docs",
] as const;

const COMMON_ROOT_DIRS = new Set([
  "src",
  "app",
  "lib",
  "test",
  "tests",
  "spec",
  "specs",
  "docs",
  "scripts",
  "packages",
  "services",
  "server",
  "client",
  "components",
  "utils",
  "bin",
  "config",
  "examples",
]);

function safeResolve(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return path.resolve(trimmed);
  } catch {
    return null;
  }
}

function isExistingDirectory(target: string | null): target is string {
  if (!target) {
    return false;
  }

  try {
    return fs.existsSync(target) && fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function getRuntimePackageRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "..", "..");
}

/** MCP 包自身安装目录（bootstrap 误写此处说明工作区未解析成功） */
export function getMcpPackageInstallRoot(): string {
  return getRuntimePackageRoot();
}

/** 解析 Cursor 等客户端注入的 WORKSPACE_FOLDER_PATHS */
export function resolveFromWorkspaceFolderPathsEnv(): string | null {
  const raw = process.env.WORKSPACE_FOLDER_PATHS?.trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = safeResolve(String(parsed[0]));
        if (isExistingDirectory(first)) {
          return first;
        }
      }
    } catch {
      // fall through
    }
  }

  const firstSegment = raw.split(/[|;]/)[0]?.trim() || raw;
  const candidate = safeResolve(firstSegment);
  return isExistingDirectory(candidate) ? candidate : null;
}

function looksLikeWorkspaceRoot(target: string): boolean {
  return WORKSPACE_MARKERS.some((marker) => fs.existsSync(path.join(target, marker)));
}

function findWorkspaceAncestor(start: string | null, packageRoot: string): string | null {
  if (!isExistingDirectory(start)) {
    return null;
  }

  let current = start;
  while (true) {
    if (current !== packageRoot && looksLikeWorkspaceRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function isLikelyProjectNamedRelativePath(inputPath?: string): boolean {
  if (!inputPath || path.isAbsolute(inputPath)) {
    return false;
  }

  const normalized = inputPath.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!normalized || normalized.startsWith("../")) {
    return false;
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 2) {
    return false;
  }

  const [firstSegment, secondSegment] = segments;
  if (COMMON_ROOT_DIRS.has(firstSegment.toLowerCase())) {
    return false;
  }

  if (!/^[a-z0-9._-]+$/i.test(firstSegment)) {
    return false;
  }

  return COMMON_ROOT_DIRS.has(secondSegment.toLowerCase()) || firstSegment.includes("-");
}

export function buildProjectRootRetryHint(inputPath?: string) {
  const normalized = (inputPath || "").replace(/\\/g, "/").trim();
  const relativePath = normalized.split("/").slice(1).join("/") || "app/utils";

  return {
    preferred: {
      project_root: "C:/path/to/your/project",
      path: relativePath,
    },
    fallback: {
      project_root: "C:/path/to/your/project",
    },
  };
}

export function resolveWorkspaceRoot(explicitProjectRoot?: string): string {
  const explicit = safeResolve(explicitProjectRoot || "");
  if (isExistingDirectory(explicit)) {
    return discoverProjectRootFromLayout(explicit) ?? explicit;
  }

  const fromCursorWorkspace = resolveFromWorkspaceFolderPathsEnv();
  if (fromCursorWorkspace) {
    return discoverProjectRootFromLayout(fromCursorWorkspace) ?? fromCursorWorkspace;
  }

  const packageRoot = getRuntimePackageRoot();
  const cwd = safeResolve(process.cwd()) || packageRoot;

  const fromLayout = discoverProjectRootFromLayout(cwd);
  if (fromLayout) {
    return fromLayout;
  }

  for (const key of WORKSPACE_ENV_KEYS) {
    const candidate = safeResolve(process.env[key] || "");
    const resolved = findWorkspaceAncestor(candidate, packageRoot);
    if (resolved) {
      return resolved;
    }
  }

  const cwdWorkspace = findWorkspaceAncestor(cwd, packageRoot);
  if (cwdWorkspace) {
    return cwdWorkspace;
  }

  return packageRoot;
}

export function toWorkspacePath(explicitProjectRoot?: string): string {
  return resolveWorkspaceRoot(explicitProjectRoot).replace(/\\/g, "/");
}