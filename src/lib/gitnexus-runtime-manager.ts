import * as fs from "node:fs";
import * as path from "node:path";
import {
  GITNEXUS_CLI_RELATIVE_PATH,
  GITNEXUS_MANIFEST_FILE,
  parseNodeMajor,
  resolveCompatibleGitNexus,
  resolveGitNexusMode,
  resolveGitNexusRuntimeRoot,
  type GitNexusCompatibility,
  type GitNexusRuntimeFingerprint,
  type GitNexusRuntimeOptions,
  type ManagedGitNexusManifest,
} from "./gitnexus-runtime-config.js";
import {
  installManagedGitNexusRuntime,
  type ManagedGitNexusInstallationTarget,
} from "./gitnexus-runtime-installer.js";

export * from "./gitnexus-runtime-config.js";

export interface ManagedGitNexusInspection {
  mode: ReturnType<typeof resolveGitNexusMode>;
  compatibility: GitNexusCompatibility;
  fingerprint: GitNexusRuntimeFingerprint;
  runtimeRoot: string;
  installRoot: string;
  manifestPath: string;
  cliPath: string;
  installed: boolean;
  valid: boolean;
  reason?: string;
  manifest?: ManagedGitNexusManifest;
}

export interface ManagedGitNexusEnsureResult extends ManagedGitNexusInspection {
  installedNow: boolean;
}

const installationPromises = new Map<string, Promise<ManagedGitNexusEnsureResult>>();

export function inspectManagedGitNexusRuntime(
  options: GitNexusRuntimeOptions = {}
): ManagedGitNexusInspection {
  const target = resolveInstallationTarget(options);
  const manifest = readManagedManifest(target.manifestPath);
  const installed = fs.existsSync(target.installRoot);
  const base = {
    mode: resolveGitNexusMode(options.env ?? process.env),
    compatibility: target.compatibility,
    fingerprint: target.fingerprint,
    runtimeRoot: target.runtimeRoot,
    installRoot: target.installRoot,
    manifestPath: target.manifestPath,
    cliPath: target.cliPath,
    installed,
  };

  if (!installed) return { ...base, valid: false, reason: "managed_runtime_missing" };
  if (!manifest) return { ...base, valid: false, reason: "managed_manifest_invalid" };
  const mismatch = validateManifest(manifest, target.compatibility, target.fingerprint);
  if (mismatch) return { ...base, valid: false, reason: mismatch, manifest };
  if (!fs.existsSync(target.cliPath)) {
    return { ...base, valid: false, reason: "managed_cli_missing", manifest };
  }
  return { ...base, valid: true, manifest };
}

export async function ensureManagedGitNexusRuntime(
  options: GitNexusRuntimeOptions = {}
): Promise<ManagedGitNexusEnsureResult> {
  const initial = inspectManagedGitNexusRuntime(options);
  if (initial.valid) return { ...initial, installedNow: false };

  const existing = installationPromises.get(initial.installRoot);
  if (existing) return existing;

  const promise = performInstall(initial, options)
    .finally(() => installationPromises.delete(initial.installRoot));
  installationPromises.set(initial.installRoot, promise);
  return promise;
}

async function performInstall(
  initial: ManagedGitNexusInspection,
  options: GitNexusRuntimeOptions
): Promise<ManagedGitNexusEnsureResult> {
  const result = await installManagedGitNexusRuntime(
    {
      compatibility: initial.compatibility,
      fingerprint: initial.fingerprint,
      runtimeRoot: initial.runtimeRoot,
      installRoot: initial.installRoot,
      manifestPath: initial.manifestPath,
      cliPath: initial.cliPath,
    },
    options
  );
  const inspected = inspectManagedGitNexusRuntime(options);
  if (!inspected.valid) {
    throw new Error(`GitNexus 托管运行时安装后校验失败: ${inspected.reason || "unknown"}`);
  }
  return { ...inspected, installedNow: result.installedNow };
}

function resolveInstallationTarget(
  options: GitNexusRuntimeOptions
): ManagedGitNexusInstallationTarget {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const nodeMajor = parseNodeMajor(nodeVersion);
  const compatibility = resolveCompatibleGitNexus(nodeVersion, platform);
  const fingerprint: GitNexusRuntimeFingerprint = { platform, arch, nodeMajor };
  const runtimeRoot = resolveGitNexusRuntimeRoot(env, platform);
  const installRoot = path.join(
    runtimeRoot,
    compatibility.version,
    `${platform}-${arch}-node${nodeMajor}`
  );
  return {
    compatibility,
    fingerprint,
    runtimeRoot,
    installRoot,
    manifestPath: path.join(installRoot, GITNEXUS_MANIFEST_FILE),
    cliPath: path.join(installRoot, ...GITNEXUS_CLI_RELATIVE_PATH.split("/")),
  };
}

function validateManifest(
  manifest: ManagedGitNexusManifest,
  compatibility: GitNexusCompatibility,
  fingerprint: GitNexusRuntimeFingerprint
): string | undefined {
  if (manifest.schemaVersion !== 1 || manifest.provider !== "gitnexus") {
    return "managed_manifest_invalid";
  }
  if (manifest.version !== compatibility.version) return "managed_version_mismatch";
  if (manifest.integrity !== compatibility.integrity) return "managed_integrity_mismatch";
  if (manifest.platform !== fingerprint.platform || manifest.arch !== fingerprint.arch) {
    return "managed_platform_mismatch";
  }
  if (manifest.nodeMajor !== fingerprint.nodeMajor) return "managed_node_mismatch";
  return undefined;
}

function readManagedManifest(manifestPath: string): ManagedGitNexusManifest | undefined {
  if (!fs.existsSync(manifestPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ManagedGitNexusManifest;
  } catch {
    return undefined;
  }
}
