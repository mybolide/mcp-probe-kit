import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverProjectRootFromLayout } from "./project-context-layout.js";

/** Schema / 文档：project_root 参数说明（自动探测，无需用户配置 MCP_PROJECT_ROOT） */
export const PROJECT_ROOT_SCHEMA_DESCRIPTION =
  "可选。项目根目录绝对路径；未传时自动从 MCP 客户端工作区解析（如 Cursor 注入 WORKSPACE_FOLDER_PATHS、OpenCode/客户端配置的 cwd 等）。仅边缘场景需手动传入。";

/** MCP 客户端注入的工作区路径（最高优先级，信任客户端，不向父级 layout 上爬） */
const RUNTIME_CWD_ENV_KEYS = ["INIT_CWD", "PWD", "CWD"] as const;

/** 用户可选覆盖（不要求在 MCP 配置里逐个填写） */
const OPTIONAL_OVERRIDE_ENV_KEYS = [
  "MCP_PROJECT_ROOT",
  "MCP_WORKSPACE_ROOT",
  "CURSOR_WORKSPACE_ROOT",
  "WORKSPACE_ROOT",
  "PROJECT_ROOT",
  "OPENCODE_WORKSPACE",
  "OPENCODE_CWD",
  "OPENCODE_PROJECT_ROOT",
  "VSCODE_CWD",
  "CLAUDE_PROJECT_DIR",
  "CODEX_CWD",
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
  "opencode.json",
  ".opencode",
  "AGENTS.md",
  ".agents",
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

/** 解析 MCP 客户端注入的 WORKSPACE_FOLDER_PATHS（如 Cursor） */
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
    if (
      current !== packageRoot &&
      !isFilesystemRoot(current) &&
      looksLikeWorkspaceRoot(current)
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * 信任 MCP 客户端注入的工作区路径：仅在客户端给定目录及其子树内找 marker，
 * 不向父级 layout 上爬（避免 monorepo 父目录抢走子项目）。
 */
function resolveTrustedClientWorkspace(clientPath: string, packageRoot: string): string {
  if (looksLikeWorkspaceRoot(clientPath)) {
    return clientPath;
  }
  return findWorkspaceAncestor(clientPath, packageRoot) ?? clientPath;
}

function isFilesystemRoot(target: string): boolean {
  const normalized = path.resolve(target);
  return normalized === path.parse(normalized).root;
}

function isUsableWorkspaceCandidate(target: string | null, packageRoot: string): target is string {
  if (!isExistingDirectory(target)) {
    return false;
  }
  if (target === packageRoot || isFilesystemRoot(target)) {
    return false;
  }
  return true;
}

function resolveFromEnvKeys(
  keys: readonly string[],
  packageRoot: string
): string | null {
  for (const key of keys) {
    const candidate = safeResolve(process.env[key] || "");
    const resolved = findWorkspaceAncestor(candidate, packageRoot);
    if (resolved) {
      return resolved;
    }
    if (isUsableWorkspaceCandidate(candidate, packageRoot)) {
      return candidate;
    }
  }
  return null;
}

function buildPackageFallbackWarning(resolved: string): string {
  return [
    "未能自动识别用户项目根目录，Skill/AGENTS.md 可能写入了 mcp-probe-kit 安装目录。",
    "请从目标项目目录打开 MCP 客户端（Cursor / OpenCode 等会自动传入工作区），",
    "或在工具参数中传 project_root 绝对路径。",
    `当前回退路径: ${resolved}`,
  ].join(" ");
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

export type WorkspaceRootSource =
  | "explicit"
  | "explicit-not-yet-created"
  | "workspace-env"
  | "layout"
  | "env"
  | "cwd"
  | "package-fallback";

export interface WorkspaceRootResolution {
  root: string;
  source: WorkspaceRootSource;
  /** 用户传入的 project_root 原始值 */
  explicitRequested?: string;
  /** 是否采用了用户显式路径（未回退到 MCP 安装目录等） */
  explicitHonored: boolean;
  warning?: string;
}

function buildExplicitIgnoredWarning(requested: string, resolved: string): string {
  return [
    `未能采用传入的 project_root: ${requested}`,
    `实际使用: ${resolved}`,
    "请传绝对路径（Windows 建议 E:/project 或 E:\\\\project），或从目标项目目录打开 MCP 客户端以自动识别工作区。",
  ].join(" ");
}

function resolveAutoWorkspaceRoot(packageRoot: string): WorkspaceRootResolution {
  const fromWorkspaceEnv = resolveFromWorkspaceFolderPathsEnv();
  if (fromWorkspaceEnv) {
    const root = resolveTrustedClientWorkspace(fromWorkspaceEnv, packageRoot);
    return {
      root,
      source: "workspace-env",
      explicitHonored: false,
    };
  }

  const cwd = safeResolve(process.cwd());
  if (isUsableWorkspaceCandidate(cwd, packageRoot)) {
    if (looksLikeWorkspaceRoot(cwd)) {
      return { root: cwd, source: "cwd", explicitHonored: false };
    }
    const fromCwdAncestor = findWorkspaceAncestor(cwd, packageRoot);
    if (fromCwdAncestor) {
      return { root: fromCwdAncestor, source: "cwd", explicitHonored: false };
    }
  }

  const fromRuntimeCwd = resolveFromEnvKeys(RUNTIME_CWD_ENV_KEYS, packageRoot);
  if (fromRuntimeCwd) {
    return { root: fromRuntimeCwd, source: "env", explicitHonored: false };
  }

  const fromOverride = resolveFromEnvKeys(OPTIONAL_OVERRIDE_ENV_KEYS, packageRoot);
  if (fromOverride) {
    return { root: fromOverride, source: "env", explicitHonored: false };
  }

  if (isExistingDirectory(cwd)) {
    const fromLayout = discoverProjectRootFromLayout(cwd);
    if (fromLayout) {
      return { root: fromLayout, source: "layout", explicitHonored: false };
    }
  }

  return {
    root: packageRoot,
    source: "package-fallback",
    explicitHonored: false,
    warning: buildPackageFallbackWarning(packageRoot),
  };
}

/**
 * 解析项目根目录。
 * 若调用方显式传入 project_root（非空），优先信任该路径，不再向上游走 layout 到父目录。
 */
export function resolveWorkspaceRootWithMeta(
  explicitProjectRoot?: string
): WorkspaceRootResolution {
  const explicitRaw = (explicitProjectRoot || "").trim();
  const explicit = safeResolve(explicitRaw);
  const packageRoot = getRuntimePackageRoot();

  if (explicitRaw) {
    if (isExistingDirectory(explicit)) {
      return {
        root: explicit!,
        source: "explicit",
        explicitRequested: explicitRaw,
        explicitHonored: true,
      };
    }
    const userMeantAbsolute =
      path.isAbsolute(explicitRaw) ||
      /^[a-zA-Z]:[\\/]/.test(explicitRaw) ||
      explicitRaw.startsWith("/") ||
      explicitRaw.startsWith("\\\\");
    if (explicit && userMeantAbsolute) {
      return {
        root: explicit,
        source: "explicit-not-yet-created",
        explicitRequested: explicitRaw,
        explicitHonored: true,
        warning: `project_root 目录尚不存在，将按该路径创建 Skill/AGENTS.md: ${explicit}`,
      };
    }
    const fallback = resolveAutoWorkspaceRoot(packageRoot);
    return {
      root: fallback.root,
      source: fallback.source,
      explicitRequested: explicitRaw,
      explicitHonored: false,
      warning: buildExplicitIgnoredWarning(explicitRaw, fallback.root),
    };
  }

  return resolveAutoWorkspaceRoot(packageRoot);
}

export function resolveWorkspaceRoot(explicitProjectRoot?: string): string {
  return resolveWorkspaceRootWithMeta(explicitProjectRoot).root;
}

export function toWorkspacePath(explicitProjectRoot?: string): string {
  return resolveWorkspaceRoot(explicitProjectRoot).replace(/\\/g, "/");
}
