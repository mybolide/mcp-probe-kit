import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type GitNexusMode = "auto" | "managed" | "system" | "off";
export type GitNexusInstaller = "pnpm" | "npm";

export interface GitNexusCompatibility {
  version: string;
  packageSpec: string;
  integrity: string;
  minNodeMajor: number;
  platforms: readonly NodeJS.Platform[];
  analyzeArgs?: readonly string[];
  runtimeEnv?: Readonly<Record<string, string>>;
  license: "PolyForm-Noncommercial-1.0.0";
}

function hasWindowsOpenSslRuntime(directory: string): boolean {
  try {
    return fs.statSync(directory).isDirectory()
      && fs.existsSync(path.join(directory, "libssl-3-x64.dll"))
      && fs.existsSync(path.join(directory, "libcrypto-3-x64.dll"));
  } catch {
    return false;
  }
}

export function resolveGitForWindowsRuntimeBin(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  if (platform !== "win32") return undefined;

  const explicit = env.MCP_GITNEXUS_WINDOWS_RUNTIME_BIN?.trim();
  if (explicit && hasWindowsOpenSslRuntime(explicit)) return path.resolve(explicit);

  const gitPath = findExecutablePath("git", env, platform);
  if (!gitPath) return undefined;
  const gitDir = path.dirname(path.resolve(gitPath));
  const parent = path.dirname(gitDir);
  const candidates = [
    gitDir,
    path.join(parent, "mingw64", "bin"),
    path.join(path.dirname(parent), "mingw64", "bin"),
  ];
  return candidates.find(hasWindowsOpenSslRuntime);
}

export function buildManagedGitNexusProcessEnv(
  compatibility: GitNexusCompatibility,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  options: { provisionExtensions?: boolean } = {}
): Record<string, string> {
  const normalized = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  for (const [key, value] of Object.entries(compatibility.runtimeEnv ?? {})) {
    const existing = Number(normalized[key]);
    normalized[key] = key === "GITNEXUS_WORKER_POOL_SIZE" && Number.isInteger(existing) && existing >= 1
      ? String(existing)
      : String(value);
  }
  if (options.provisionExtensions) {
    normalized.GITNEXUS_LBUG_EXTENSION_INSTALL = "auto";
  }

  const windowsRuntimeBin = resolveGitForWindowsRuntimeBin(env, platform);
  if (windowsRuntimeBin) {
    const currentPath = normalized.PATH || normalized.Path || normalized.path || "";
    delete normalized.Path;
    delete normalized.path;
    normalized.PATH = [windowsRuntimeBin, currentPath].filter(Boolean).join(path.delimiter);
  }
  return normalized;
}

export interface GitNexusRuntimeFingerprint {
  platform: NodeJS.Platform;
  arch: string;
  nodeMajor: number;
}

export interface ManagedGitNexusManifest {
  schemaVersion: 1;
  provider: "gitnexus";
  version: string;
  packageSpec: string;
  integrity: string;
  license: string;
  managedBy: "mcp-probe-kit";
  mcpProbeKitVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  nodeMajor: number;
  installer: GitNexusInstaller;
  installedAt: string;
  cliRelativePath: string;
}

export interface GitNexusRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  nodeVersion?: string;
  signal?: AbortSignal;
}

export const GITNEXUS_CLI_RELATIVE_PATH = "node_modules/gitnexus/dist/cli/index.js";
export const GITNEXUS_MANIFEST_FILE = "runtime.json";
export const GITNEXUS_DEFAULT_INSTALL_TIMEOUT_MS = 10 * 60_000;

export const GITNEXUS_COMPATIBILITY_MATRIX: readonly GitNexusCompatibility[] = [
  {
    version: "1.6.9",
    packageSpec: "gitnexus@1.6.9",
    integrity: "sha512-Rq5LXFygx7jjMp/YFsIAcnnzuKvvCsb4rxHFILnu05ZOqk7xNXTUSMRa968EOCbxcKFxnhKYaGXoabOUeGZX6A==",
    minNodeMajor: 22,
    platforms: ["win32", "darwin", "linux"],
    analyzeArgs: ["--workers", "1"],
    runtimeEnv: { GITNEXUS_WORKER_POOL_SIZE: "1" },
    license: "PolyForm-Noncommercial-1.0.0",
  },
] as const;

export function resolveGitNexusMode(env: NodeJS.ProcessEnv = process.env): GitNexusMode {
  const raw = env.MCP_GITNEXUS_MODE?.trim().toLowerCase();
  if (!raw) return "auto";
  if (raw === "auto" || raw === "managed" || raw === "system" || raw === "off") {
    return raw;
  }
  return "auto";
}

export function isGitNexusAutoInstallEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = env.MCP_GITNEXUS_AUTO_INSTALL?.trim();
  return raw !== undefined && /^(1|true|yes|on)$/i.test(raw);
}

export function resolveCompatibleGitNexus(
  nodeVersion: string = process.versions.node,
  platform: NodeJS.Platform = process.platform
): GitNexusCompatibility {
  const nodeMajor = parseNodeMajor(nodeVersion);
  const platformEntries = GITNEXUS_COMPATIBILITY_MATRIX.filter((entry) =>
    entry.platforms.includes(platform)
  );
  if (platformEntries.length === 0) {
    throw new Error(`GitNexus 托管运行时暂不支持平台: ${platform}`);
  }
  const match = platformEntries.find((entry) => nodeMajor >= entry.minNodeMajor);
  if (!match) {
    throw new Error(
      `GitNexus 托管运行时在 ${platform} 要求 Node.js >= ${Math.min(...platformEntries.map((entry) => entry.minNodeMajor))}，当前为 ${nodeVersion}`
    );
  }
  return match;
}

export function tryResolveCompatibleGitNexus(
  nodeVersion: string = process.versions.node,
  platform: NodeJS.Platform = process.platform
): GitNexusCompatibility | undefined {
  try {
    return resolveCompatibleGitNexus(nodeVersion, platform);
  } catch {
    return undefined;
  }
}

export function parseNodeMajor(nodeVersion: string): number {
  const match = nodeVersion.trim().match(/^v?(\d+)/);
  const major = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(major) || major <= 0) {
    throw new Error(`无法识别 Node.js 版本: ${nodeVersion}`);
  }
  return major;
}

export function resolveGitNexusRuntimeRoot(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string {
  const explicit = env.MCP_GITNEXUS_RUNTIME_ROOT?.trim();
  if (explicit) return path.resolve(explicit);

  if (platform === "win32") {
    const base = env.LOCALAPPDATA?.trim() || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "mcp-probe-kit", "runtimes", "gitnexus");
  }

  const cacheHome = env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), ".cache");
  return path.join(cacheHome, "mcp-probe-kit", "runtimes", "gitnexus");
}

export function findSystemGitNexusCli(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  return findExecutablePath("gitnexus", env, platform);
}

export function findPackageManager(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): { command: string; installer: GitNexusInstaller } {
  const preference = env.MCP_GITNEXUS_PACKAGE_MANAGER?.trim().toLowerCase();
  if (preference !== "npm") {
    const pnpm = findExecutablePath("pnpm", env, platform);
    if (pnpm) return { command: pnpm, installer: "pnpm" };
    if (preference === "pnpm") {
      throw new Error("MCP_GITNEXUS_PACKAGE_MANAGER=pnpm，但未找到 pnpm 可执行文件");
    }
  }

  const npm = findExecutablePath("npm", env, platform);
  if (npm) return { command: npm, installer: "npm" };
  throw new Error("未找到 pnpm 或 npm，无法安装 GitNexus 托管运行时");
}

export function findExecutablePath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  const pathValue = env.PATH || env.Path || env.path || "";
  if (!pathValue) return undefined;
  const extensions = platform === "win32"
    ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidates = platform === "win32"
        ? [path.join(directory, `${name}${extension}`), path.join(directory, `${name}${extension.toLowerCase()}`)]
        : [path.join(directory, name)];
      for (const candidate of candidates) {
        if (isExecutableFile(candidate, platform)) return candidate;
      }
    }
  }
  return undefined;
}

function isExecutableFile(filePath: string, platform: NodeJS.Platform): boolean {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    if (platform === "win32") return true;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
