import * as fs from "node:fs";
import * as path from "node:path";
import { VERSION } from "../version.js";
import { compareSemver } from "./workflow-skill-version.js";

export const CLI_RUNTIME_MANIFEST_REL_PATH = ".mcp-probe-kit/runtime.json";
export const CLI_BIN_DIR_REL_PATH = ".mcp-probe-kit/bin";
export const CLI_POWERSHELL_REL_PATH = `${CLI_BIN_DIR_REL_PATH}/probe.ps1`;
export const CLI_CMD_REL_PATH = `${CLI_BIN_DIR_REL_PATH}/probe.cmd`;
export const CLI_SHELL_REL_PATH = `${CLI_BIN_DIR_REL_PATH}/probe`;

const CLI_VERSION_MARKER = "mcp-probe-kit-cli-version";

export interface CliFallbackFileResult {
  path: string;
  created: boolean;
  updated: boolean;
  skipped: boolean;
}

export interface CliRuntimeManifest {
  schemaVersion: 1;
  package: "mcp-probe-kit";
  version: string;
  packageSpec: string;
  source: "mcp-bootstrap";
  generatedByVersion: string;
  installedAt: string;
  wrappers: {
    powershell: string;
    cmd: string;
    shell: string;
  };
}

export interface CliFallbackEnsureResult {
  version: string;
  packageSpec: string;
  manifestPath: string;
  preservedNewerVersion: boolean;
  files: CliFallbackFileResult[];
}

export function readCliRuntimeManifest(projectRoot: string): CliRuntimeManifest | null {
  const manifestPath = path.join(path.resolve(projectRoot), CLI_RUNTIME_MANIFEST_REL_PATH);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Partial<CliRuntimeManifest>;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.package !== "mcp-probe-kit" ||
      typeof parsed.version !== "string" ||
      typeof parsed.packageSpec !== "string"
    ) {
      return null;
    }
    return parsed as CliRuntimeManifest;
  } catch {
    return null;
  }
}

export function ensureCliFallback(
  projectRoot: string,
  requestedVersion: string = VERSION
): CliFallbackEnsureResult {
  const root = path.resolve(projectRoot);
  const existingManifest = readCliRuntimeManifest(root);
  const discoveredVersion = discoverInstalledCliVersion(root, existingManifest?.version ?? null);
  const version =
    discoveredVersion && compareSemver(discoveredVersion, requestedVersion) > 0
      ? discoveredVersion
      : requestedVersion;
  const packageSpec = `mcp-probe-kit@${version}`;
  const localSourceCheckout = isLocalSourceCheckout(root, version);
  const installedAt =
    existingManifest?.version === version && existingManifest.installedAt
      ? existingManifest.installedAt
      : new Date().toISOString();

  const files: CliFallbackFileResult[] = [];
  files.push(
    ensureTextFile(root, CLI_POWERSHELL_REL_PATH, renderPowerShellWrapper(version, localSourceCheckout)),
    ensureTextFile(root, CLI_CMD_REL_PATH, renderCmdWrapper(version, localSourceCheckout)),
    ensureTextFile(root, CLI_SHELL_REL_PATH, renderShellWrapper(version, localSourceCheckout), true)
  );

  const manifest: CliRuntimeManifest = {
    schemaVersion: 1,
    package: "mcp-probe-kit",
    version,
    packageSpec,
    source: "mcp-bootstrap",
    generatedByVersion: VERSION,
    installedAt,
    wrappers: {
      powershell: CLI_POWERSHELL_REL_PATH,
      cmd: CLI_CMD_REL_PATH,
      shell: CLI_SHELL_REL_PATH,
    },
  };
  files.push(
    ensureTextFile(
      root,
      CLI_RUNTIME_MANIFEST_REL_PATH,
      `${JSON.stringify(manifest, null, 2)}\n`
    )
  );

  return {
    version,
    packageSpec,
    manifestPath: CLI_RUNTIME_MANIFEST_REL_PATH,
    preservedNewerVersion:
      Boolean(discoveredVersion) && compareSemver(discoveredVersion!, requestedVersion) > 0,
    files,
  };
}

function isLocalSourceCheckout(projectRoot: string, version: string): boolean {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const localEntryPath = path.join(projectRoot, "build", "index.js");
  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(localEntryPath)) return false;
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    return packageJson.name === "mcp-probe-kit" && packageJson.version === version;
  } catch {
    return false;
  }
}

function discoverInstalledCliVersion(
  projectRoot: string,
  manifestVersion: string | null
): string | null {
  const candidates = [manifestVersion];
  for (const relPath of [CLI_POWERSHELL_REL_PATH, CLI_CMD_REL_PATH, CLI_SHELL_REL_PATH]) {
    const absolute = path.join(projectRoot, relPath);
    if (!fs.existsSync(absolute)) continue;
    try {
      const content = fs.readFileSync(absolute, "utf8");
      const match = content.match(
        new RegExp(`${CLI_VERSION_MARKER}:\\s*([^\\s]+)`, "i")
      );
      if (match?.[1]) candidates.push(match[1].trim());
    } catch {
      // Ignore unreadable stale wrappers and repair them from the requested version.
    }
  }
  return candidates
    .filter((value): value is string => Boolean(value?.trim()))
    .sort((left, right) => compareSemver(right, left))[0] ?? null;
}

function ensureTextFile(
  projectRoot: string,
  relPath: string,
  content: string,
  executable = false
): CliFallbackFileResult {
  const absolute = path.join(projectRoot, relPath);
  const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
  if (existing === content) {
    if (executable) ensureExecutable(absolute);
    return { path: relPath, created: false, updated: false, skipped: true };
  }

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  atomicWriteFile(absolute, content);
  if (executable) ensureExecutable(absolute);
  return {
    path: relPath,
    created: existing === null,
    updated: existing !== null,
    skipped: false,
  };
}

function atomicWriteFile(filePath: string, content: string): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  try {
    fs.renameSync(tempPath, filePath);
  } catch {
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function ensureExecutable(filePath: string): void {
  if (process.platform === "win32") return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // The wrapper can still be invoked with `sh <path>` on restricted filesystems.
  }
}

function renderPowerShellWrapper(version: string, localSourceCheckout: boolean): string {
  const localBranch = localSourceCheckout
    ? String.raw`} elseif (Test-Path -LiteralPath $LocalCheckoutEntry) {
  & node $LocalCheckoutEntry @ProbeArguments
  exit $LASTEXITCODE
`
    : '';
  return `# ${CLI_VERSION_MARKER}: ${version}\n` + String.raw`param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ProbeArguments
)

$ErrorActionPreference = "Stop"
$PackageSpec = "mcp-probe-kit@${version}"
$WrapperRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$LocalCheckoutEntry = Join-Path $WrapperRoot "build\index.js"
$CacheRoot = if ($env:MCP_PROBE_NPX_CACHE) {
  $env:MCP_PROBE_NPX_CACHE
} elseif ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "mcp-probe-kit\npm-cache"
} else {
  Join-Path $WrapperRoot ".mcp-probe-kit\npm-cache"
}

if ($env:MCP_PROBE_LOCAL_ENTRY) {
  & node $env:MCP_PROBE_LOCAL_ENTRY @ProbeArguments
  exit $LASTEXITCODE
${localBranch}} else {
  & npx.cmd --yes --cache $CacheRoot $PackageSpec @ProbeArguments
  exit $LASTEXITCODE
}
`;
}

function renderCmdWrapper(version: string, localSourceCheckout: boolean): string {
  const localBranch = localSourceCheckout
    ? `) else if exist "%MCP_PROBE_WRAPPER_ROOT%\\build\\index.js" (\r\n` +
      `  call node "%MCP_PROBE_WRAPPER_ROOT%\\build\\index.js" %*\r\n`
    : '';
  return `@echo off\r\n` +
    `rem ${CLI_VERSION_MARKER}: ${version}\r\n` +
    `setlocal\r\n` +
    `for %%I in ("%~dp0..\\..") do set "MCP_PROBE_WRAPPER_ROOT=%%~fI"\r\n` +
    `if defined MCP_PROBE_NPX_CACHE (\r\n` +
    `  set "MCP_PROBE_CACHE=%MCP_PROBE_NPX_CACHE%"\r\n` +
    `) else (\r\n` +
    `  set "MCP_PROBE_CACHE=%LOCALAPPDATA%\\mcp-probe-kit\\npm-cache"\r\n` +
    `)\r\n` +
    `if defined MCP_PROBE_LOCAL_ENTRY (\r\n` +
    `  call node "%MCP_PROBE_LOCAL_ENTRY%" %*\r\n` +
    localBranch +
    `) else (\r\n` +
    `  call npx.cmd --yes --cache "%MCP_PROBE_CACHE%" mcp-probe-kit@${version} %*\r\n` +
    `)\r\n` +
    `set "MCP_PROBE_EXIT=%ERRORLEVEL%"\r\n` +
    `exit /b %MCP_PROBE_EXIT%\r\n`;
}

function renderShellWrapper(version: string, localSourceCheckout: boolean): string {
  const localBranch = localSourceCheckout
    ? `if [ -f "$WRAPPER_ROOT/build/index.js" ]; then\n` +
      `  exec node "$WRAPPER_ROOT/build/index.js" "$@"\n` +
      `fi\n`
    : '';
  return `#!/usr/bin/env sh\n` +
    `# ${CLI_VERSION_MARKER}: ${version}\n` +
    `set -eu\n\n` +
    `WRAPPER_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"\n` +
    `CACHE_ROOT="\${MCP_PROBE_NPX_CACHE:-\${XDG_CACHE_HOME:-$HOME/.cache}/mcp-probe-kit/npm-cache}"\n` +
    `if [ -n "\${MCP_PROBE_LOCAL_ENTRY:-}" ]; then\n` +
    `  exec node "$MCP_PROBE_LOCAL_ENTRY" "$@"\n` +
    `fi\n` +
    localBranch +
    `exec npx --yes --cache "$CACHE_ROOT" "mcp-probe-kit@${version}" "$@"\n`;
}
