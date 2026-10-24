import * as fs from "node:fs";
import * as path from "node:path";
import { VERSION } from "../version.js";
import { compareSemver } from "./workflow-skill-version.js";
import {
  ensureCliLocalEnvExample,
  ensureCliLocalEnvTemplate,
} from "./cli-local-env.js";

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

function hasPinnedLocalVerify(projectRoot: string, version: string): boolean {
  const installedRoot = path.join(
    projectRoot, ".mcp-probe-kit", "local-verify", "node_modules", "mcp-probe-kit",
  );
  if (!fs.existsSync(path.join(installedRoot, "build", "index.js"))) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(installedRoot, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
    };
    return pkg.name === "mcp-probe-kit" && pkg.version === version;
  } catch {
    return false;
  }
}

export interface CliRuntimeManifest {
  schemaVersion: 1;
  package: "mcp-probe-kit";
  version: string;
  packageSpec: string;
  /** Local development installs must not query npm for an unpublished build. */
  localOnly?: boolean;
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
  const localOnly =
    existingManifest?.localOnly === true || hasPinnedLocalVerify(root, version);
  const installedAt =
    existingManifest?.version === version && existingManifest.installedAt
      ? existingManifest.installedAt
      : new Date().toISOString();

  const files: CliFallbackFileResult[] = [];
  files.push(
    ensureTextFile(root, CLI_POWERSHELL_REL_PATH, renderPowerShellWrapper(version, localSourceCheckout, localOnly)),
    ensureTextFile(root, CLI_CMD_REL_PATH, renderCmdWrapper(version, localSourceCheckout, localOnly)),
    ensureTextFile(root, CLI_SHELL_REL_PATH, renderShellWrapper(version, localSourceCheckout, localOnly), true)
  );

  const manifest: CliRuntimeManifest = {
    schemaVersion: 1,
    package: "mcp-probe-kit",
    version,
    packageSpec,
    localOnly,
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

  const localEnvExample = ensureCliLocalEnvExample(root);
  if (localEnvExample.created) {
    files.push({
      path: localEnvExample.path,
      created: true,
      updated: false,
      skipped: false,
    });
  }
  const localEnvTemplate = ensureCliLocalEnvTemplate(root);
  if (localEnvTemplate.created) {
    files.push({
      path: localEnvTemplate.path,
      created: true,
      updated: false,
      skipped: false,
    });
  }

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
    try {
      fs.renameSync(tempPath, filePath);
    } catch {
      // Windows cannot rename over an existing file; copy then drop the temp.
      fs.copyFileSync(tempPath, filePath);
    }
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

export function unpublishedPinHint(version: string): string {
  return (
    `mcp-probe-kit CLI: npm could not resolve mcp-probe-kit@${version}. ` +
    `If this exact version is unpublished, npm often reports ETARGET. Do not use @latest/@next or a global install. ` +
    `Set MCP_PROBE_LOCAL_ENTRY to a local build/index.js, or use ` +
    `.mcp-probe-kit/local-verify/node_modules/mcp-probe-kit or node_modules/mcp-probe-kit.`
  );
}

function renderPowerShellWrapper(version: string, localSourceCheckout: boolean, localOnly: boolean): string {
  const checkoutBranch = localSourceCheckout
    ? String.raw`} elseif (Test-Path -LiteralPath $LocalCheckoutEntry) {
  & node $LocalCheckoutEntry @ProbeArguments
  exit $LASTEXITCODE
`
    : "";
  const hint = unpublishedPinHint(version).replace(/"/g, '`"');
  return `# ${CLI_VERSION_MARKER}: ${version}\n` + String.raw`param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ProbeArguments
)

$ErrorActionPreference = "Stop"
$PackageSpec = "mcp-probe-kit@${version}"
$WrapperRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$LocalCheckoutEntry = Join-Path $WrapperRoot "build\index.js"
$LocalVerifyEntry = Join-Path $WrapperRoot ".mcp-probe-kit\local-verify\node_modules\mcp-probe-kit\build\index.js"
$NodeModulesEntry = Join-Path $WrapperRoot "node_modules\mcp-probe-kit\build\index.js"
$LocalOnly = ${localOnly ? "$true" : "$false"}
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
${checkoutBranch}} elseif (Test-Path -LiteralPath $LocalVerifyEntry) {
  & node -e 'try { process.exit(require(process.argv[1]).version === process.argv[2] ? 0 : 1) } catch { process.exit(1) }' (Join-Path $WrapperRoot ".mcp-probe-kit\local-verify\node_modules\mcp-probe-kit\package.json") "${version}"
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("Local MCP build version mismatch. Restore the pinned local-verify package.")
    exit 1
  }
  & node $LocalVerifyEntry @ProbeArguments
  exit $LASTEXITCODE
} elseif (Test-Path -LiteralPath $NodeModulesEntry) {
  & node -e 'try { process.exit(require(process.argv[1]).version === process.argv[2] ? 0 : 1) } catch { process.exit(1) }' (Join-Path $WrapperRoot "node_modules\mcp-probe-kit\package.json") "${version}"
  if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("Local MCP build version mismatch. Restore the pinned node_modules package.")
    exit 1
  }
  & node $NodeModulesEntry @ProbeArguments
  exit $LASTEXITCODE
} else {
  if ($LocalOnly -or $env:MCP_PROBE_LOCAL_ONLY -eq "1") {
    [Console]::Error.WriteLine("Local MCP build is missing; npm fallback disabled. Restore local-verify for the pinned version.")
    exit 1
  }
  $env:NPM_CONFIG_FETCH_RETRIES = "0"
  & npx.cmd --yes --cache $CacheRoot $PackageSpec @ProbeArguments
  $ProbeExit = $LASTEXITCODE
  if ($ProbeExit -ne 0) {
    [Console]::Error.WriteLine("${hint}")
  }
  exit $ProbeExit
}
`;
}

function renderCmdWrapper(version: string, localSourceCheckout: boolean, localOnly: boolean): string {
  const checkoutBranch = localSourceCheckout
    ? `) else if exist "%MCP_PROBE_WRAPPER_ROOT%\\build\\index.js" (\r\n` +
      `  call node "%MCP_PROBE_WRAPPER_ROOT%\\build\\index.js" %*\r\n` +
      `  exit /b !ERRORLEVEL!\r\n`
    : "";
  const hint = unpublishedPinHint(version);
  return `@echo off\r\n` +
    `rem ${CLI_VERSION_MARKER}: ${version}\r\n` +
    `setlocal EnableDelayedExpansion\r\n` +
    `for %%I in ("%~dp0..\\..") do set "MCP_PROBE_WRAPPER_ROOT=%%~fI"\r\n` +
    `if defined MCP_PROBE_NPX_CACHE (\r\n` +
    `  set "MCP_PROBE_CACHE=%MCP_PROBE_NPX_CACHE%"\r\n` +
    `) else (\r\n` +
    `  set "MCP_PROBE_CACHE=%LOCALAPPDATA%\\mcp-probe-kit\\npm-cache"\r\n` +
    `)\r\n` +
    `if defined MCP_PROBE_LOCAL_ENTRY (\r\n` +
    `  call node "%MCP_PROBE_LOCAL_ENTRY%" %*\r\n` +
    `  exit /b !ERRORLEVEL!\r\n` +
    checkoutBranch +
    `) else if exist "%MCP_PROBE_WRAPPER_ROOT%\\.mcp-probe-kit\\local-verify\\node_modules\\mcp-probe-kit\\build\\index.js" (\r\n` +
    `  node -e "try{process.exit(require(process.argv[1]).version===process.argv[2]?0:1)}catch(e){process.exit(1)}" "%MCP_PROBE_WRAPPER_ROOT%\\.mcp-probe-kit\\local-verify\\node_modules\\mcp-probe-kit\\package.json" "${version}"\r\n` +
    `  if errorlevel 1 (\r\n` +
    `    echo Local MCP build version mismatch. Restore pinned local-verify. 1>&2\r\n` +
    `    exit /b 1\r\n` +
    `  )\r\n` +
    `  call node "%MCP_PROBE_WRAPPER_ROOT%\\.mcp-probe-kit\\local-verify\\node_modules\\mcp-probe-kit\\build\\index.js" %*\r\n` +
    `  exit /b !ERRORLEVEL!\r\n` +
    `) else if exist "%MCP_PROBE_WRAPPER_ROOT%\\node_modules\\mcp-probe-kit\\build\\index.js" (\r\n` +
    `  node -e "try{process.exit(require(process.argv[1]).version===process.argv[2]?0:1)}catch(e){process.exit(1)}" "%MCP_PROBE_WRAPPER_ROOT%\\node_modules\\mcp-probe-kit\\package.json" "${version}"\r\n` +
    `  if errorlevel 1 (\r\n` +
    `    echo Local MCP build version mismatch. Restore pinned node_modules package. 1>&2\r\n` +
    `    exit /b 1\r\n` +
    `  )\r\n` +
    `  call node "%MCP_PROBE_WRAPPER_ROOT%\\node_modules\\mcp-probe-kit\\build\\index.js" %*\r\n` +
    `  exit /b !ERRORLEVEL!\r\n` +
    `) else (\r\n` +
    `  if "${localOnly ? "1" : "0"}"=="1" (\r\n` +
    `    echo Local MCP build is missing; npm fallback disabled. Restore local-verify. 1>&2\r\n` +
    `    exit /b 1\r\n` +
    `  )\r\n` +
    `  if /I "%MCP_PROBE_LOCAL_ONLY%"=="1" (\r\n` +
    `    echo MCP_PROBE_LOCAL_ONLY prohibits npm fallback. 1>&2\r\n` +
    `    exit /b 1\r\n` +
    `  )\r\n` +
    `  set "NPM_CONFIG_FETCH_RETRIES=0"\r\n` +
    `  call npx.cmd --yes --cache "%MCP_PROBE_CACHE%" mcp-probe-kit@${version} %*\r\n` +
    `  set "MCP_PROBE_NPX_EXIT=!ERRORLEVEL!"\r\n` +
    `  if not "!MCP_PROBE_NPX_EXIT!"=="0" (\r\n` +
    `    echo ${hint} 1>&2\r\n` +
    `  )\r\n` +
    `  exit /b !MCP_PROBE_NPX_EXIT!\r\n` +
    `)\r\n`;
}

function renderShellWrapper(version: string, localSourceCheckout: boolean, localOnly: boolean): string {
  const checkoutBranch = localSourceCheckout
    ? `if [ -f "$WRAPPER_ROOT/build/index.js" ]; then\n` +
      `  exec node "$WRAPPER_ROOT/build/index.js" "$@"\n` +
      `fi\n`
    : "";
  const hint = unpublishedPinHint(version).replace(/"/g, '\\"');
  return `#!/usr/bin/env sh\n` +
    `# ${CLI_VERSION_MARKER}: ${version}\n` +
    `set -eu\n\n` +
    `WRAPPER_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"\n` +
    `CACHE_ROOT="\${MCP_PROBE_NPX_CACHE:-\${XDG_CACHE_HOME:-$HOME/.cache}/mcp-probe-kit/npm-cache}"\n` +
    `if [ -n "\${MCP_PROBE_LOCAL_ENTRY:-}" ]; then\n` +
    `  exec node "$MCP_PROBE_LOCAL_ENTRY" "$@"\n` +
    `fi\n` +
    checkoutBranch +
    `if [ -f "$WRAPPER_ROOT/.mcp-probe-kit/local-verify/node_modules/mcp-probe-kit/build/index.js" ]; then\n` +
    `  if ! node -e 'try{process.exit(require(process.argv[1]).version===process.argv[2]?0:1)}catch{process.exit(1)}' "$WRAPPER_ROOT/.mcp-probe-kit/local-verify/node_modules/mcp-probe-kit/package.json" "${version}"; then\n` +
    `    echo "Local MCP build version mismatch. Restore pinned local-verify." >&2\n` +
    `    exit 1\n` +
    `  fi\n` +
    `  exec node "$WRAPPER_ROOT/.mcp-probe-kit/local-verify/node_modules/mcp-probe-kit/build/index.js" "$@"\n` +
    `fi\n` +
    `if [ -f "$WRAPPER_ROOT/node_modules/mcp-probe-kit/build/index.js" ]; then\n` +
    `  if ! node -e 'try{process.exit(require(process.argv[1]).version===process.argv[2]?0:1)}catch{process.exit(1)}' "$WRAPPER_ROOT/node_modules/mcp-probe-kit/package.json" "${version}"; then\n` +
    `    echo "Local MCP build version mismatch. Restore pinned node_modules package." >&2\n` +
    `    exit 1\n` +
    `  fi\n` +
    `  exec node "$WRAPPER_ROOT/node_modules/mcp-probe-kit/build/index.js" "$@"\n` +
    `fi\n` +
    `if [ "\${MCP_PROBE_LOCAL_ONLY:-0}" = "1" ] || [ "${localOnly ? "1" : "0"}" = "1" ]; then\n` +
    `  echo "Local MCP build missing: npm fallback disabled. Restore pinned local-verify." >&2\n` +
    `  exit 1\n` +
    `fi\n` +
    `NPM_CONFIG_FETCH_RETRIES=0 npx --yes --cache "$CACHE_ROOT" "mcp-probe-kit@${version}" "$@" || {\n` +
    `  echo "${hint}" >&2\n` +
    `  exit 1\n` +
    `}\n`;
}
