import * as fs from "node:fs";
import * as path from "node:path";
import spawn from "cross-spawn";
import { VERSION } from "../version.js";
import {
  GITNEXUS_CLI_RELATIVE_PATH,
  GITNEXUS_DEFAULT_INSTALL_TIMEOUT_MS,
  GITNEXUS_MANIFEST_FILE,
  buildManagedGitNexusProcessEnv,
  findExecutablePath,
  findPackageManager,
  type GitNexusCompatibility,
  type GitNexusInstaller,
  type GitNexusRuntimeFingerprint,
  type GitNexusRuntimeOptions,
  type ManagedGitNexusManifest,
} from "./gitnexus-runtime-config.js";

export interface ManagedGitNexusInstallationTarget {
  compatibility: GitNexusCompatibility;
  fingerprint: GitNexusRuntimeFingerprint;
  runtimeRoot: string;
  installRoot: string;
  manifestPath: string;
  cliPath: string;
}

async function verifyManagedRuntimeCapabilities(
  cliPath: string,
  tempRoot: string,
  target: ManagedGitNexusInstallationTarget,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  baseEnv: NodeJS.ProcessEnv
): Promise<void> {
  const runtimeEnv = buildManagedGitNexusProcessEnv(
    target.compatibility,
    baseEnv,
    target.fingerprint.platform,
    { provisionExtensions: true }
  );
  const doctor = await runProcess(
    process.execPath,
    [cliPath, "doctor"],
    tempRoot,
    Math.min(timeoutMs, 5 * 60_000),
    signal,
    runtimeEnv,
    target.fingerprint.platform
  );
  if (!/Full-text search:\s+available/i.test(doctor.stdout)) {
    throw new Error(`GitNexus FTS 运行时不可用: ${doctor.stdout || doctor.stderr}`);
  }

  const smokeRoot = path.join(tempRoot, ".capability-smoke");
  fs.mkdirSync(smokeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(smokeRoot, "index.ts"),
    "export function add(a: number, b: number) { return a + b; }\n",
    "utf8"
  );
  try {
    const analyze = await runProcess(
      process.execPath,
      [
        cliPath,
        "analyze",
        "--skip-git",
        "--skip-agents-md",
        ...(target.compatibility.analyzeArgs ?? []),
      ],
      smokeRoot,
      Math.min(timeoutMs, 3 * 60_000),
      signal,
      runtimeEnv,
      target.fingerprint.platform
    );
    const combined = `${analyze.stdout}\n${analyze.stderr}`;
    if (!/indexed successfully/i.test(combined)) {
      throw new Error(`GitNexus 能力探针未完成索引: ${combined}`);
    }
    if (/FTS extension unavailable|full-text\/BM25 search is disabled/i.test(combined)) {
      throw new Error(`GitNexus 能力探针检测到 FTS 降级: ${combined}`);
    }
  } finally {
    try {
      await runProcess(
        process.execPath,
        [cliPath, "clean", "--force"],
        smokeRoot,
        30_000,
        undefined,
        runtimeEnv,
        target.fingerprint.platform
      );
    } catch {
      // Best effort cleanup only.
    }
    await removePathWithRetry(smokeRoot);
  }
}

export interface ManagedGitNexusInstallationResult {
  manifest: ManagedGitNexusManifest;
  installedNow: boolean;
}

const LOCK_WAIT_INTERVAL_MS = 250;
const STALE_LOCK_MS = 15 * 60_000;

export async function installManagedGitNexusRuntime(
  target: ManagedGitNexusInstallationTarget,
  options: GitNexusRuntimeOptions = {}
): Promise<ManagedGitNexusInstallationResult> {
  const env = options.env ?? process.env;
  const timeoutMs = readPositiveInt(
    env.MCP_GITNEXUS_INSTALL_TIMEOUT_MS,
    GITNEXUS_DEFAULT_INSTALL_TIMEOUT_MS
  );
  fs.mkdirSync(path.dirname(target.installRoot), { recursive: true });
  const lockPath = `${target.installRoot}.install.lock`;
  const lock = await acquireInstallLock(lockPath, timeoutMs, options.signal);
  if (!lock.acquired) {
    throw new Error("等待 GitNexus 托管运行时安装超时");
  }

  const tempRoot = `${target.installRoot}.tmp-${process.pid}-${Date.now()}`;
  try {
    const existingManifest = readExistingManifest(target);
    if (existingManifest) {
      return { manifest: existingManifest, installedNow: false };
    }
    await removePathWithRetry(tempRoot);
    fs.mkdirSync(tempRoot, { recursive: true });
    writeRuntimePackageFiles(tempRoot, target.compatibility.version);

    const packageManager = await resolveInstaller(env, target.fingerprint.platform, options.signal);
    const installEnv = {
      ...env,
      GITNEXUS_SKIP_OPTIONAL_GRAMMARS:
        env.GITNEXUS_SKIP_OPTIONAL_GRAMMARS?.trim() || "1",
    };
    await installDependencies(
      packageManager,
      tempRoot,
      target.runtimeRoot,
      timeoutMs,
      options.signal,
      installEnv,
      target.fingerprint.platform
    );
    verifyInstalledPackage(tempRoot, target.compatibility, packageManager.installer);
    const cliPath = path.join(tempRoot, ...GITNEXUS_CLI_RELATIVE_PATH.split("/"));
    await runProcess(
      process.execPath,
      [cliPath, "--version"],
      tempRoot,
      Math.min(timeoutMs, 15_000),
      options.signal,
      installEnv,
      target.fingerprint.platform
    );
    await verifyManagedRuntimeCapabilities(
      cliPath,
      tempRoot,
      target,
      timeoutMs,
      options.signal,
      installEnv
    );

    const manifest: ManagedGitNexusManifest = {
      schemaVersion: 1,
      provider: "gitnexus",
      version: target.compatibility.version,
      packageSpec: target.compatibility.packageSpec,
      integrity: target.compatibility.integrity,
      license: target.compatibility.license,
      managedBy: "mcp-probe-kit",
      mcpProbeKitVersion: VERSION,
      platform: target.fingerprint.platform,
      arch: target.fingerprint.arch,
      nodeMajor: target.fingerprint.nodeMajor,
      installer: packageManager.installer,
      installedAt: new Date().toISOString(),
      cliRelativePath: GITNEXUS_CLI_RELATIVE_PATH,
    };
    fs.writeFileSync(
      path.join(tempRoot, GITNEXUS_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    if (fs.existsSync(target.installRoot)) {
      await removePathWithRetry(target.installRoot);
    }
    fs.renameSync(tempRoot, target.installRoot);
    return { manifest, installedNow: true };
  } finally {
    await removePathWithRetry(tempRoot);
    releaseInstallLock(lockPath, lock.fd);
  }
}

function readExistingManifest(
  target: ManagedGitNexusInstallationTarget
): ManagedGitNexusManifest | undefined {
  if (!fs.existsSync(target.manifestPath) || !fs.existsSync(target.cliPath)) return undefined;
  try {
    const manifest = JSON.parse(
      fs.readFileSync(target.manifestPath, "utf8")
    ) as ManagedGitNexusManifest;
    if (
      manifest.schemaVersion !== 1 ||
      manifest.provider !== "gitnexus" ||
      manifest.version !== target.compatibility.version ||
      manifest.integrity !== target.compatibility.integrity ||
      manifest.platform !== target.fingerprint.platform ||
      manifest.arch !== target.fingerprint.arch ||
      manifest.nodeMajor !== target.fingerprint.nodeMajor
    ) {
      return undefined;
    }
    return manifest;
  } catch {
    return undefined;
  }
}

async function resolveInstaller(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  signal?: AbortSignal
): Promise<{ command: string; installer: GitNexusInstaller }> {
  const selected = findPackageManager(env, platform);
  if (selected.installer !== "pnpm") return selected;

  try {
    const result = await runProcess(
      selected.command,
      ["--version"],
      process.cwd(),
      15_000,
      signal,
      env,
      platform
    );
    const major = Number(result.stdout.trim().match(/^(\d+)/)?.[1]);
    if (Number.isInteger(major) && major >= 11) return selected;
  } catch {
    // Fall through to npm.
  }

  const npm = findExecutablePath("npm", env, platform);
  if (!npm) {
    throw new Error("GitNexus 托管安装要求 pnpm >= 11，且未找到 npm 兜底");
  }
  return { command: npm, installer: "npm" };
}

function writeRuntimePackageFiles(root: string, version: string): void {
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({
      name: "mcp-probe-kit-gitnexus-runtime",
      private: true,
      version: "0.0.0",
      dependencies: { gitnexus: version },
    }, null, 2)}\n`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(root, "pnpm-workspace.yaml"),
    `${renderPnpmBuildPolicy()}\n`,
    "utf8"
  );
}

function renderPnpmBuildPolicy(): string {
  const allowed = [
    "@ladybugdb/core",
    "gitnexus",
    "tree-sitter",
    "tree-sitter-c",
    "tree-sitter-cpp",
    "tree-sitter-c-sharp",
    "tree-sitter-go",
    "tree-sitter-java",
    "tree-sitter-javascript",
    "tree-sitter-php",
    "tree-sitter-python",
    "tree-sitter-ruby",
    "tree-sitter-rust",
    "tree-sitter-typescript",
  ];
  const denied = [
    "@scarf/scarf",
    "onnxruntime-node",
    "protobufjs",
    "sharp",
    "tree-sitter-cli",
    "tree-sitter-dart",
    "tree-sitter-kotlin",
    "tree-sitter-swift",
  ];
  return [
    "allowBuilds:",
    ...allowed.map((name) => `  ${quoteYamlKey(name)}: true`),
    ...denied.map((name) => `  ${quoteYamlKey(name)}: false`),
  ].join("\n");
}

function quoteYamlKey(value: string): string {
  return JSON.stringify(value);
}

async function installDependencies(
  packageManager: { command: string; installer: GitNexusInstaller },
  root: string,
  runtimeRoot: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): Promise<void> {
  if (packageManager.installer === "pnpm") {
    const storeDir = path.resolve(
      env.MCP_GITNEXUS_PNPM_STORE?.trim() || path.join(runtimeRoot, "pnpm-store")
    );
    fs.mkdirSync(storeDir, { recursive: true });
    await runProcess(
      packageManager.command,
      [
        "install",
        "--prod",
        "--config.blockExoticSubdeps=false",
        "--store-dir",
        storeDir,
        "--fetch-timeout",
        "300000",
        "--fetch-retries",
        "5",
        "--network-concurrency",
        "4",
      ],
      root,
      timeoutMs,
      signal,
      env,
      platform
    );
    return;
  }

  const npmCache = path.resolve(
    env.MCP_GITNEXUS_NPM_CACHE?.trim() || path.join(runtimeRoot, "npm-cache")
  );
  fs.mkdirSync(npmCache, { recursive: true });
  await runProcess(
    packageManager.command,
    [
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--save-exact",
      "--package-lock=true",
      "--cache",
      npmCache,
      "--fetch-timeout=300000",
      "--fetch-retries=5",
    ],
    root,
    timeoutMs,
    signal,
    env,
    platform
  );
}

function verifyInstalledPackage(
  root: string,
  compatibility: GitNexusCompatibility,
  installer: GitNexusInstaller
): void {
  const packagePath = path.join(root, "node_modules", "gitnexus", "package.json");
  if (!fs.existsSync(packagePath)) throw new Error("GitNexus package.json 未生成");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version?: string };
  if (packageJson.version !== compatibility.version) {
    throw new Error(`GitNexus 版本不一致: ${packageJson.version || "missing"}`);
  }

  if (installer === "pnpm") {
    verifyPnpmLock(root, compatibility);
  } else {
    verifyNpmLock(root, compatibility);
  }
}

function verifyPnpmLock(root: string, compatibility: GitNexusCompatibility): void {
  const lockText = fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
  const packageHeader = `  gitnexus@${compatibility.version}:`;
  const start = lockText.indexOf(packageHeader);
  if (start < 0) throw new Error("pnpm-lock.yaml 缺少 GitNexus 精确版本");
  const block = lockText.slice(start, start + 500);
  if (!block.includes(`integrity: ${compatibility.integrity}`)) {
    throw new Error("GitNexus pnpm integrity 校验失败");
  }
}

function verifyNpmLock(root: string, compatibility: GitNexusCompatibility): void {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")) as {
    packages?: Record<string, { version?: string; integrity?: string }>;
  };
  const installed = lock.packages?.["node_modules/gitnexus"];
  if (installed?.version !== compatibility.version) {
    throw new Error(`GitNexus lockfile 版本不一致: ${installed?.version || "missing"}`);
  }
  if (installed.integrity !== compatibility.integrity) {
    throw new Error("GitNexus npm integrity 校验失败");
  }
}

async function acquireInstallLock(
  lockPath: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ acquired: boolean; fd?: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`);
      return { acquired: true, fd };
    } catch (error) {
      if (!isErrorCode(error, "EEXIST")) throw error;
      if (isStaleLock(lockPath)) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      await sleep(LOCK_WAIT_INTERVAL_MS, signal);
    }
  }
  return { acquired: false };
}

function releaseInstallLock(lockPath: string, fd?: number): void {
  if (fd !== undefined) {
    try { fs.closeSync(fd); } catch { /* ignore */ }
  }
  fs.rmSync(lockPath, { force: true });
}

function isStaleLock(lockPath: string): boolean {
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs > STALE_LOCK_MS;
  } catch {
    return false;
  }
}

async function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): Promise<{ stdout: string; stderr: string }> {
  throwIfAborted(signal);
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      detached: platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let forcedError: Error | undefined;
    const append = (current: string, chunk: Buffer | string) => (current + String(chunk)).slice(-64_000);
    child.stdout?.on("data", (chunk: Buffer | string) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer | string) => { stderr = append(stderr, chunk); });

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve({ stdout, stderr });
    };
    const stop = (error: Error) => {
      if (forcedError) return;
      forcedError = error;
      terminateProcessTree(child.pid, platform);
      setTimeout(() => finish(error), 5_000).unref?.();
    };
    const onAbort = () => stop(
      signal?.reason instanceof Error ? signal.reason : new Error("GitNexus 安装已取消")
    );
    const timer = setTimeout(() => {
      stop(new Error(`GitNexus 安装命令超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error: Error) => finish(forcedError || error));
    child.on("close", (code: number | null) => {
      if (forcedError) return finish(forcedError);
      if (code === 0) finish();
      else finish(new Error(`GitNexus 安装命令失败 (${code ?? "unknown"}): ${stderr || stdout}`));
    });
  });
}

function terminateProcessTree(pid: number | undefined, platform: NodeJS.Platform): void {
  if (!pid) return;
  if (platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  }
}

async function removePathWithRetry(target: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isBusyFileSystemError(error) || attempt === 7) return;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
}

function isBusyFileSystemError(error: unknown): boolean {
  return ["EBUSY", "EPERM", "ENOTEMPTY"].some((code) => isErrorCode(error, code));
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === code
  );
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error("GitNexus 安装已取消");
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("GitNexus 安装已取消"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
