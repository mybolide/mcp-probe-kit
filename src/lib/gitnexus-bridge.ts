import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import spawn from "cross-spawn";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  isAbortError,
  throwIfAborted,
} from "./tool-execution-context.js";

export type CodeInsightMode = "auto" | "query" | "context" | "impact";
export type CodeInsightDirection = "upstream" | "downstream";
export type GitNexusLaunchStrategy = "local" | "npx" | "env";

export interface CodeInsightCandidate {
  uid?: string;
  name?: string;
  file_path?: string;
  kind?: string;
  [key: string]: unknown;
}

export interface CodeInsightAmbiguity {
  tool: string;
  message?: string;
  candidates: CodeInsightCandidate[];
}

export interface CodeInsightRequest {
  mode?: CodeInsightMode;
  query?: string;
  target?: string;
  uid?: string;
  filePath?: string;
  repo?: string;
  projectRoot?: string;
  goal?: string;
  taskContext?: string;
  direction?: CodeInsightDirection;
  maxDepth?: number;
  includeTests?: boolean;
  includeContent?: boolean;
  signal?: AbortSignal;
}

export interface CodeInsightExecution {
  tool: string;
  ok: boolean;
  durationMs: number;
  args: Record<string, unknown>;
  text?: string;
  structuredContent?: unknown;
  status?: string;
  error?: string;
}

export interface CodeInsightBridgeResult {
  provider: "gitnexus";
  enabled: boolean;
  available: boolean;
  degraded: boolean;
  modeRequested: CodeInsightMode;
  modeResolved: "query" | "context" | "impact";
  summary: string;
  executions: CodeInsightExecution[];
  warnings: string[];
  repo?: string;
  launcherStrategy: GitNexusLaunchStrategy;
  ambiguities: CodeInsightAmbiguity[];
  workspaceMode: "direct" | "temp-repo";
  sourceRoot: string;
  analysisRoot: string;
  pathMapped: boolean;
}

export interface EmbeddedGraphContext {
  enabled: boolean;
  available: boolean;
  degraded: boolean;
  summary: string;
  warnings: string[];
  provider: "gitnexus";
  mode: "query" | "context" | "impact";
  highlights: string[];
}

const DEFAULT_CONNECT_TIMEOUT_MS = readIntEnv("MCP_GITNEXUS_CONNECT_TIMEOUT_MS", 12000);
const DEFAULT_CALL_TIMEOUT_MS = readIntEnv("MCP_GITNEXUS_TIMEOUT_MS", 20000);
const DEFAULT_GITNEXUS_ARGS = ["-y", "gitnexus@latest", "mcp"];
const FAILURE_CACHE_TTL_MS = readIntEnv("MCP_GITNEXUS_FAILURE_CACHE_TTL_MS", 30000);
const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  ".gitnexus",
  ".mcp-probe-kit",
  ".playwright-cli",
  ".turbo",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".idea",
  ".vscode",
  ".gradle",
  ".npm",
  ".pnpm-store",
  ".yarn",
  ".cache",
  ".cargo",
  ".rustup",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "output",
  "temp",
  "tmp",
]);
const DEFAULT_IGNORED_FILES = [/^\.env(\..+)?$/i];

let bridgeFailureUntil = 0;
let bridgeFailureReason = "";

function readIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function isEnvDisabled(name: string): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return false;
  }
  return /^(0|false|no|off)$/i.test(value.trim());
}

function isBridgeEnabled(): boolean {
  const raw = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
  if (raw === undefined) {
    return process.env.NODE_ENV !== "test";
  }
  return !/^(0|false|no|off)$/i.test(raw.trim());
}

function splitArgs(raw: string | undefined, fallback: string[] = DEFAULT_GITNEXUS_ARGS): string[] {
  if (!raw) {
    return [...fallback];
  }
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function resolvePreferredRepoName(requestedRepo?: string): string | undefined {
  const requested = requestedRepo?.trim();
  if (requested) {
    return requested;
  }

  const explicit = process.env.MCP_GITNEXUS_REPO?.trim();
  if (explicit) {
    return explicit;
  }

  return undefined;
}

function resolveRequestedProjectRoot(projectRoot?: string): string {
  const requested = projectRoot?.trim();
  if (requested) {
    return path.resolve(requested);
  }
  return path.resolve(process.cwd());
}

function inferCandidateRepoNames(baseDir: string = process.cwd()): string[] {
  const candidates: string[] = [];

  const pkgPath = path.join(baseDir, "package.json");
  try {
    if (fs.existsSync(pkgPath)) {
      const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      const pkgName = typeof parsed.name === "string" ? parsed.name.trim() : "";
      if (pkgName) {
        candidates.push(pkgName);
      }
    }
  } catch {
    // ignore parse failure
  }

  const base = path.basename(baseDir).trim();
  if (base) {
    candidates.push(base);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function parseAvailableReposFromError(text: string): string[] {
  const match = text.match(/Available:\s*(.+)$/i);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isGitNexusCliCommand(command: string): boolean {
  const normalized = path.basename((command || "").trim()).toLowerCase();
  return normalized === "gitnexus"
    || normalized === "gitnexus.cmd"
    || normalized === "gitnexus.exe"
    || normalized === "gitnexus.bat";
}

function resolveNpxPackageArgs(bridgeArgs: string[]): string[] {
  const flags: string[] = [];
  let packageSpec = "gitnexus@latest";

  for (const arg of bridgeArgs) {
    if (arg === "mcp") {
      break;
    }
    if (arg.startsWith("-")) {
      flags.push(arg);
      continue;
    }
    packageSpec = arg;
    break;
  }

  return [...flags, packageSpec];
}

export function resolveGitNexusBridgeCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[]; strategy: GitNexusLaunchStrategy } {
  const explicitCommand = env.MCP_GITNEXUS_COMMAND?.trim();
  if (explicitCommand) {
    const args = splitArgs(
      env.MCP_GITNEXUS_ARGS,
      isGitNexusCliCommand(explicitCommand) ? ["mcp"] : DEFAULT_GITNEXUS_ARGS
    );
    return {
      ...resolveSpawnCommand(explicitCommand, args, platform, env),
      strategy: "env",
    };
  }

  const localCli = findExecutablePath("gitnexus", platform, env);
  if (localCli) {
    return {
      command: localCli,
      args: ["mcp"],
      strategy: "local",
    };
  }

  return {
    ...resolveSpawnCommand("npx", splitArgs(env.MCP_GITNEXUS_ARGS), platform, env),
    strategy: "npx",
  };
}

function resolveGitNexusCliCommand(
  subcommand: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
) {
  const explicitCommand = env.MCP_GITNEXUS_COMMAND?.trim();
  if (explicitCommand) {
    if (isGitNexusCliCommand(explicitCommand)) {
      return resolveSpawnCommand(explicitCommand, [subcommand], platform, env);
    }

    const bridgeArgs = splitArgs(env.MCP_GITNEXUS_ARGS);
    return resolveSpawnCommand(
      explicitCommand,
      [...resolveNpxPackageArgs(bridgeArgs), subcommand],
      platform,
      env
    );
  }

  const localCli = findExecutablePath("gitnexus", platform, env);
  if (localCli) {
    return {
      command: localCli,
      args: [subcommand],
    };
  }

  const bridgeArgs = splitArgs(env.MCP_GITNEXUS_ARGS);
  return resolveSpawnCommand("npx", [...resolveNpxPackageArgs(bridgeArgs), subcommand], platform, env);
}

export function resolveExecutableCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  const normalized = (command || "").trim();
  if (!normalized) {
    return resolveExecutableCommand("npx", platform, env);
  }

  if (path.isAbsolute(normalized) && fs.existsSync(normalized)) {
    return normalized;
  }

  const found = findExecutablePath(normalized, platform, env);
  if (found) {
    return found;
  }

  if (platform !== "win32") {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  if (lower.endsWith(".cmd") || lower.endsWith(".exe") || lower.endsWith(".bat")) {
    return normalized;
  }

  if (lower === "npx" || lower === "npm" || lower === "git") {
    return `${normalized}.cmd`;
  }

  return normalized;
}

function findExecutablePath(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const trimmed = (command || "").trim();
  if (!trimmed || path.isAbsolute(trimmed)) {
    return undefined;
  }

  const preferredPath = (candidates: string[]): string | undefined => {
    const existing = candidates.filter((candidate) => candidate && fs.existsSync(candidate));
    if (existing.length === 0) {
      return undefined;
    }

    if (platform !== "win32") {
      return existing[0];
    }

    const lower = trimmed.toLowerCase();
    const preferredExts =
      lower === "npx" || lower === "npm"
        ? [".cmd", ".exe", ".bat", ""]
        : lower === "git"
          ? [".exe", ".cmd", ".bat", ""]
          : [".exe", ".cmd", ".bat", ""];

    for (const ext of preferredExts) {
      const match = existing.find((candidate) => path.extname(candidate).toLowerCase() === ext);
      if (match) {
        return match;
      }
    }

    return existing[0];
  };

  if (platform === "win32") {
    try {
      const output = execFileSync("where.exe", [trimmed], {
        encoding: "utf-8",
        env,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }).trim();
      const candidates = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const preferred = preferredPath(candidates);
      if (preferred) {
        return preferred;
      }
    } catch {
      // fall back to PATH scan
    }
  }

  const pathEntries = (env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const lower = trimmed.toLowerCase();
  const extensions =
    platform === "win32"
      ? lower === "npx" || lower === "npm"
        ? [".cmd", ".exe", ".bat", ""]
        : lower === "git"
          ? [".exe", ".cmd", ".bat", ""]
          : [".exe", ".cmd", ".bat", ""]
      : [""];

  for (const entry of pathEntries) {
    for (const ext of extensions) {
      const candidate = path.join(entry, `${trimmed}${ext}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  if (platform === "win32" && trimmed.toLowerCase() === "git") {
    const commonCandidates = [
      path.join(env["ProgramFiles"] || "C:\\Program Files", "Git", "cmd", "git.exe"),
      path.join(env["ProgramFiles"] || "C:\\Program Files", "Git", "bin", "git.exe"),
      path.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "cmd", "git.exe"),
    ];
    return preferredPath(commonCandidates);
  }

  return undefined;
}

export function resolveSpawnCommand(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): { command: string; args: string[] } {
  const executable = resolveExecutableCommand(command, platform, env);

  return {
    command: executable,
    args,
  };
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function extractStructuredStatus(value: unknown): string | undefined {
  const status = toRecord(value)?.status;
  return typeof status === "string" ? status : undefined;
}

function extractStructuredMessage(value: unknown): string | undefined {
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "summary", "explanation", "detail"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function extractStructuredCandidates(value: unknown): CodeInsightCandidate[] {
  const candidates = toRecord(value)?.candidates;
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({ ...(item as Record<string, unknown>) }));
}

function buildAmbiguities(executions: CodeInsightExecution[]): CodeInsightAmbiguity[] {
  return executions
    .filter((item) => item.ok && item.status === "ambiguous")
    .map((item) => {
      const candidates = extractStructuredCandidates(item.structuredContent);
      const message = extractStructuredMessage(item.structuredContent) || item.text;
      return {
        tool: item.tool,
        message: message ? shorten(message, 220) : undefined,
        candidates,
      };
    });
}

const QUERY_STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this", "user", "flow",
  "sign", "code", "project", "module",
  "理解", "分析", "流程", "模块", "项目", "代码", "查询", "相关", "功能",
]);

function tokenizeQueryHints(...values: Array<string | undefined>): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const token of (value || "").toLowerCase().split(/[^a-z0-9_\u4e00-\u9fa5]+/)) {
      const normalized = token.trim();
      if (!normalized || QUERY_STOP_WORDS.has(normalized)) {
        continue;
      }
      if (normalized.length < 3 && !/[\u4e00-\u9fa5]/.test(normalized)) {
        continue;
      }
      tokens.add(normalized);
    }
  }
  return [...tokens];
}

function collectStringFields(
  value: unknown,
  depth: number = 0,
  bag: Array<{ key: string; value: string }> = [],
  currentKey: string = ""
): Array<{ key: string; value: string }> {
  if (depth > 3 || value == null) {
    return bag;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized) {
      bag.push({ key: currentKey.toLowerCase(), value: normalized });
    }
    return bag;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 12)) {
      collectStringFields(item, depth + 1, bag, currentKey);
    }
    return bag;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      collectStringFields(item, depth + 1, bag, key);
    }
  }
  return bag;
}

function scoreQueryCandidate(candidate: unknown, terms: string[]): number {
  const fields = collectStringFields(candidate);
  if (fields.length === 0 || terms.length === 0) {
    return 0;
  }

  let score = 0;
  let matchedTerms = 0;
  for (const term of terms) {
    let matched = false;
    for (const field of fields) {
      if (!field.value.includes(term)) {
        continue;
      }

      matched = true;
      if (field.key.includes("name") || field.key.includes("title") || field.key.includes("label")) {
        score += field.value === term ? 24 : 16;
      } else if (field.key.includes("path") || field.key.includes("file") || field.key.includes("module")) {
        score += 10;
      } else {
        score += 4;
      }
    }
    if (matched) {
      matchedTerms += 1;
    }
  }

  if (matchedTerms > 0) {
    score += matchedTerms * 5;
  }
  if (matchedTerms === terms.length) {
    score += 12;
  }

  const candidateRecord = toRecord(candidate);
  const priority = candidateRecord?.priority;
  if (typeof priority === "number" && Number.isFinite(priority)) {
    score += priority;
  }

  return score;
}

function describeQueryTopMatches(structuredContent: unknown): string | undefined {
  const processes = toRecord(structuredContent)?.processes;
  if (!Array.isArray(processes) || processes.length === 0) {
    return undefined;
  }

  const labels = processes
    .slice(0, 3)
    .map((item) => {
      const record = toRecord(item);
      return [
        record?.heuristicLabel,
        record?.title,
        record?.name,
        record?.processName,
      ].find((value) => typeof value === "string" && value.trim());
    })
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return labels.length > 0 ? `Top matches: ${labels.join(" | ")}` : undefined;
}

export function rerankQueryStructuredContent(
  structuredContent: unknown,
  hints: { query?: string; goal?: string; taskContext?: string }
): { structuredContent: unknown; changed: boolean; note?: string } {
  const record = toRecord(structuredContent);
  if (!record) {
    return { structuredContent, changed: false };
  }

  const terms = tokenizeQueryHints(hints.query, hints.goal, hints.taskContext);
  if (terms.length === 0) {
    return { structuredContent, changed: false };
  }

  let changed = false;
  const next = { ...record };

  for (const key of ["processes", "definitions"] as const) {
    const value = next[key];
    if (!Array.isArray(value) || value.length < 2) {
      continue;
    }

    const reranked = value
      .map((item, index) => ({
        item,
        index,
        score: scoreQueryCandidate(item, terms),
      }))
      .sort((a, b) => (b.score - a.score) || (a.index - b.index))
      .map((entry) => entry.item);

    const orderChanged = reranked.some((item, index) => item !== value[index]);
    if (orderChanged) {
      next[key] = reranked;
      changed = true;
    }
  }

  return {
    structuredContent: next,
    changed,
    note: changed ? describeQueryTopMatches(next) : undefined,
  };
}

function describeExecutionSummary(item: CodeInsightExecution): string {
  if (item.tool === "query") {
    const rerankedTopMatches = describeQueryTopMatches(item.structuredContent);
    if (rerankedTopMatches) {
      return shorten(rerankedTopMatches, 110);
    }
  }

  return shorten(item.text || "已返回结构化结果", 110);
}

function extractText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }
  const content = (result as Record<string, unknown>).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function shorten(text: string, maxLen: number = 260): string {
  if (!text) {
    return "";
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, maxLen - 3)}...`;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function findGitRoot(startDir: string): string | undefined {
  let current = path.resolve(startDir);

  while (true) {
    const gitPath = path.join(current, ".git");
    if (fs.existsSync(gitPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function createWorkspaceId(sourceRoot: string): string {
  const base = path.basename(sourceRoot).replace(/[^a-zA-Z0-9._-]+/g, "-") || "workspace";
  return `${base}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function shouldIgnoreForTempWorkspace(sourceRoot: string, entryPath: string): boolean {
  const relative = path.relative(sourceRoot, entryPath);
  if (!relative || relative.startsWith("..")) {
    return false;
  }

  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.some((part) => DEFAULT_IGNORED_DIRS.has(part))) {
    return true;
  }

  const name = parts[parts.length - 1] || "";
  return DEFAULT_IGNORED_FILES.some((pattern) => pattern.test(name));
}

async function runProcess(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
      windowsHide: true,
    });

    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} ${args.join(" ")} 退出码 ${code ?? "unknown"}`));
    });
  });
}

async function removePathWithRetry(targetPath: string, attempts: number = 6): Promise<void> {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      if (!fs.existsSync(targetPath)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (index + 1)));
  }

  if (fs.existsSync(targetPath)) {
    throw lastError instanceof Error
      ? lastError
      : new Error(`无法删除临时目录: ${targetPath}`);
  }
}

async function cleanupStaleTempWorkspaces(tempWorkspaceRoot: string, keepPath?: string): Promise<void> {
  if (!fs.existsSync(tempWorkspaceRoot)) {
    return;
  }

  const entries = fs.readdirSync(tempWorkspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const fullPath = path.join(tempWorkspaceRoot, entry.name);
    if (keepPath && path.resolve(fullPath) === path.resolve(keepPath)) {
      continue;
    }

    try {
      await removePathWithRetry(fullPath, 3);
    } catch {
      // keep best-effort cleanup silent; current run should not fail because of stale dirs
    }
  }
}

function copyIntoAnalysisWorkspace(sourceRoot: string, analysisRoot: string) {
  fs.mkdirSync(analysisRoot, { recursive: true });

  const walk = (fromDir: string, toDir: string) => {
    fs.mkdirSync(toDir, { recursive: true });
    const entries = fs.readdirSync(fromDir, { withFileTypes: true });

    for (const entry of entries) {
      const fromPath = path.join(fromDir, entry.name);
      if (shouldIgnoreForTempWorkspace(sourceRoot, fromPath)) {
        continue;
      }

      const toPath = path.join(toDir, entry.name);
      if (entry.isDirectory()) {
        walk(fromPath, toPath);
        continue;
      }
      if (entry.isFile()) {
        fs.copyFileSync(fromPath, toPath);
      }
    }
  };

  walk(sourceRoot, analysisRoot);
}

async function createTempAnalysisWorkspace(
  sourceRoot: string,
  signal?: AbortSignal,
  options?: { bootstrap?: boolean }
) {
  const tempWorkspaceRoot = path.join(sourceRoot, ".mcp-probe-kit", "gitnexus-temp");
  const workspaceId = createWorkspaceId(sourceRoot);
  const analysisRoot = path.join(tempWorkspaceRoot, workspaceId);

  fs.mkdirSync(tempWorkspaceRoot, { recursive: true });
  await cleanupStaleTempWorkspaces(tempWorkspaceRoot);
  copyIntoAnalysisWorkspace(sourceRoot, analysisRoot);

  throwIfAborted(signal, "GitNexus 临时工作区创建已取消");

  if (options?.bootstrap !== false) {
    const gitInit = resolveSpawnCommand("git", ["init", "-q"]);
    await runProcess(gitInit.command, gitInit.args, analysisRoot, signal);

    const analyzeCli = resolveGitNexusCliCommand("analyze");
    await runProcess(analyzeCli.command, analyzeCli.args, analysisRoot, signal);
  }

  return {
    workspaceMode: "temp-repo" as const,
    sourceRoot,
    analysisRoot,
    repoName: path.basename(analysisRoot),
    pathMapped: true,
    cleanup: async () => {
      if (options?.bootstrap !== false) {
        try {
          const cleanCli = resolveGitNexusCliCommand("clean");
          await runProcess(cleanCli.command, cleanCli.args, analysisRoot, undefined);
        } catch {
          // best effort cleanup only
        }
      }
      await removePathWithRetry(analysisRoot);
      try {
        const remaining = fs.existsSync(tempWorkspaceRoot)
          ? fs.readdirSync(tempWorkspaceRoot).filter(Boolean)
          : [];
        if (remaining.length === 0) {
          fs.rmSync(tempWorkspaceRoot, { recursive: true, force: true });
        }
      } catch {
        // best effort only
      }
    },
  };
}

export interface BridgeWorkspace {
  workspaceMode: "direct" | "temp-repo";
  sourceRoot: string;
  analysisRoot: string;
  repoName?: string;
  pathMapped: boolean;
  cleanup?: () => Promise<void>;
}

export async function prepareBridgeWorkspace(
  cwd: string = process.cwd(),
  signal?: AbortSignal,
  options?: { bootstrap?: boolean }
): Promise<BridgeWorkspace> {
  const resolvedCwd = path.resolve(cwd);
  const gitRoot = findGitRoot(resolvedCwd);
  if (gitRoot) {
    return {
      workspaceMode: "direct",
      sourceRoot: gitRoot,
      analysisRoot: gitRoot,
      repoName: inferCandidateRepoNames(gitRoot)[0],
      pathMapped: false,
    };
  }

  return createTempAnalysisWorkspace(resolvedCwd, signal, options);
}

async function ensureWorkspaceIndexed(workspace: BridgeWorkspace, signal?: AbortSignal): Promise<void> {
  if (workspace.workspaceMode !== "direct") {
    return;
  }

  const analyzeCli = resolveGitNexusCliCommand("analyze");
  await runProcess(analyzeCli.command, analyzeCli.args, workspace.analysisRoot, signal);
}

function isUnsafeHomeRoot(sourceRoot: string): boolean {
  return path.resolve(sourceRoot) === path.resolve(os.homedir());
}

function mapStringToSourceRoot(value: string, workspace: BridgeWorkspace): string {
  if (!workspace.pathMapped || !value) {
    return value;
  }

  const candidates: Array<[string, string]> = [
    [workspace.analysisRoot, workspace.sourceRoot],
    [workspace.analysisRoot.replace(/\\/g, "/"), workspace.sourceRoot.replace(/\\/g, "/")],
    [workspace.analysisRoot.replace(/\//g, "\\"), workspace.sourceRoot.replace(/\//g, "\\")],
  ];

  let mapped = value;
  for (const [from, to] of candidates) {
    if (from && mapped.includes(from)) {
      mapped = mapped.replaceAll(from, to);
    }
  }
  return mapped;
}

function mapValueToSourceRoot<T>(value: T, workspace: BridgeWorkspace): T {
  if (!workspace.pathMapped) {
    return value;
  }
  if (typeof value === "string") {
    return mapStringToSourceRoot(value, workspace) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapValueToSourceRoot(item, workspace)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        mapValueToSourceRoot(item, workspace),
      ])
    ) as T;
  }
  return value;
}

function resolveMode(request: CodeInsightRequest): "query" | "context" | "impact" {
  const mode = request.mode || "auto";
  if (mode === "query" || mode === "context" || mode === "impact") {
    return mode;
  }

  if ((request.target || request.uid) && request.direction) {
    return "impact";
  }
  if ((request.target || request.uid) && !request.query) {
    return "context";
  }
  return "query";
}

async function callBridgeTool(
  client: Client,
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  workspace?: BridgeWorkspace
): Promise<CodeInsightExecution> {
  const startedAt = Date.now();
  try {
    const result = await client.callTool(
      {
        name: tool,
        arguments: args,
      },
      undefined,
      {
        timeout: DEFAULT_CALL_TIMEOUT_MS,
        signal,
      }
    );
    const durationMs = Date.now() - startedAt;
    const text = extractText(result);
    const isError = Boolean((result as Record<string, unknown>).isError);
    const structuredContent = workspace
      ? mapValueToSourceRoot((result as Record<string, unknown>).structuredContent, workspace)
      : (result as Record<string, unknown>).structuredContent;
    const status = extractStructuredStatus(structuredContent);

    if (isError) {
      return {
        tool,
        args,
        ok: false,
        durationMs,
        text: workspace ? mapValueToSourceRoot(text, workspace) : text,
        structuredContent,
        status,
        error: workspace
          ? mapValueToSourceRoot(text || `GitNexus 工具 ${tool} 返回错误`, workspace)
          : text || `GitNexus 工具 ${tool} 返回错误`,
      };
    }

    return {
      tool,
      args,
      ok: true,
      durationMs,
      text: workspace ? mapValueToSourceRoot(text, workspace) : text,
      structuredContent,
      status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      tool,
      args,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: normalizeError(error),
    };
  }
}

export async function runCodeInsightBridge(
  request: CodeInsightRequest
): Promise<CodeInsightBridgeResult> {
  const modeRequested = request.mode || "auto";
  const modeResolved = resolveMode(request);
  const requestedProjectRoot = resolveRequestedProjectRoot(request.projectRoot);
  const launcher = resolveGitNexusBridgeCommand();

  if (!isBridgeEnabled() || isEnvDisabled("MCP_ENABLE_GITNEXUS_BRIDGE")) {
    const sourceRoot = findGitRoot(requestedProjectRoot) || requestedProjectRoot;
    return {
      provider: "gitnexus",
      enabled: false,
      available: false,
      degraded: true,
      modeRequested,
      modeResolved,
      summary: "GitNexus bridge 已禁用（MCP_ENABLE_GITNEXUS_BRIDGE=0）。",
      executions: [],
      warnings: ["bridge_disabled"],
      repo: resolvePreferredRepoName(request.repo),
      launcherStrategy: launcher.strategy,
      ambiguities: [],
      workspaceMode: "direct",
      sourceRoot,
      analysisRoot: sourceRoot,
      pathMapped: false,
    };
  }

  if (Date.now() < bridgeFailureUntil) {
    const sourceRoot = findGitRoot(requestedProjectRoot) || requestedProjectRoot;
    return {
      provider: "gitnexus",
      enabled: true,
      available: false,
      degraded: true,
      modeRequested,
      modeResolved,
      summary: `GitNexus bridge 暂不可用（缓存中）: ${bridgeFailureReason || "请稍后重试"}`,
      executions: [],
      warnings: ["bridge_failure_cached"],
      repo: resolvePreferredRepoName(request.repo),
      launcherStrategy: launcher.strategy,
      ambiguities: [],
      workspaceMode: "direct",
      sourceRoot,
      analysisRoot: sourceRoot,
      pathMapped: false,
    };
  }

  throwIfAborted(request.signal, "GitNexus bridge 已取消");
  if (isUnsafeHomeRoot(requestedProjectRoot) && !findGitRoot(requestedProjectRoot)) {
    return {
      provider: "gitnexus",
      enabled: true,
      available: false,
      degraded: true,
      modeRequested,
      modeResolved,
      summary: "GitNexus bridge 已降级：当前工作目录看起来是用户家目录。请显式传入 project_root 指向实际项目目录，避免复制 .gradle/.npm 等本地缓存。",
      executions: [],
      warnings: ["project_root_required", "unsafe_home_directory"],
      repo: resolvePreferredRepoName(request.repo),
      launcherStrategy: launcher.strategy,
      ambiguities: [],
      workspaceMode: "direct",
      sourceRoot: requestedProjectRoot,
      analysisRoot: requestedProjectRoot,
      pathMapped: false,
    };
  }

  const workspace = await prepareBridgeWorkspace(requestedProjectRoot, request.signal);
  await ensureWorkspaceIndexed(workspace, request.signal);
  const effectiveRepo =
    workspace.workspaceMode === "temp-repo"
      ? workspace.repoName
      : resolvePreferredRepoName(request.repo) || workspace.repoName;
  const { command, args } = launcher;
  const warnings: string[] = [];
  if (workspace.workspaceMode === "temp-repo") {
    warnings.push("temp_repo_workspace");
  }
  const executions: CodeInsightExecution[] = [];
  const stderrLogs: string[] = [];

  const transport = new StdioClientTransport({
    command,
    args,
    cwd: workspace.analysisRoot,
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (text.trim()) {
        stderrLogs.push(text.trim());
      }
    });
  }

  const client = new Client({
    name: "mcp-probe-kit-gitnexus-bridge",
    version: "1.0.0",
  });

  try {
    await client.connect(transport, {
      timeout: DEFAULT_CONNECT_TIMEOUT_MS,
      signal: request.signal,
    });
    throwIfAborted(request.signal, "GitNexus bridge 已取消");

    const runQuery = async () => {
      const queryText = request.query || request.target;
      if (!queryText) {
        warnings.push("缺少 query 参数，已跳过 query");
        return;
      }
      const execution = await callBridgeTool(
        client,
        "query",
        {
          query: queryText,
          ...(request.goal ? { goal: request.goal } : {}),
          ...(request.taskContext ? { task_context: request.taskContext } : {}),
          ...(request.includeContent ? { include_content: true } : {}),
          ...(effectiveRepo ? { repo: effectiveRepo } : {}),
        },
        request.signal,
        workspace
      );

      if (execution.ok) {
        const reranked = rerankQueryStructuredContent(execution.structuredContent, {
          query: queryText,
          goal: request.goal,
          taskContext: request.taskContext,
        });
        execution.structuredContent = reranked.structuredContent;
        if (reranked.changed) {
          warnings.push("query_results_reranked");
          if (reranked.note) {
            execution.text = execution.text
              ? `${reranked.note}\n\n${execution.text}`
              : reranked.note;
          }
        }
      }

      executions.push(execution);
    };

    const runContext = async () => {
      if (!request.target && !request.uid) {
        warnings.push("缺少 target/uid 参数，已跳过 context");
        return;
      }
      executions.push(
        await callBridgeTool(
          client,
          "context",
          {
            ...(request.uid ? { uid: request.uid } : { name: request.target }),
            ...(request.filePath ? { file_path: request.filePath } : {}),
            ...(request.includeContent ? { include_content: true } : {}),
            ...(effectiveRepo ? { repo: effectiveRepo } : {}),
          },
          request.signal,
          workspace
        )
      );
    };

    const runImpact = async () => {
      if (!request.target && !request.uid) {
        warnings.push("缺少 target/uid 参数，已跳过 impact");
        return;
      }
      executions.push(
        await callBridgeTool(
          client,
          "impact",
          {
            target: request.uid || request.target,
            direction: request.direction || "upstream",
            ...(request.maxDepth ? { maxDepth: request.maxDepth } : {}),
            ...(typeof request.includeTests === "boolean"
              ? { includeTests: request.includeTests }
              : {}),
            ...(effectiveRepo ? { repo: effectiveRepo } : {}),
          },
          request.signal,
          workspace
        )
      );
    };

    if (modeRequested === "auto") {
      await runQuery();
      if (request.target || request.uid) {
        await runContext();
      }
      if ((request.target || request.uid) && request.direction) {
        await runImpact();
      }
    } else if (modeResolved === "query") {
      await runQuery();
    } else if (modeResolved === "context") {
      await runContext();
    } else {
      await runImpact();
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    const hint = stderrLogs.length > 0 ? ` (${shorten(stderrLogs.join(" | "), 180)})` : "";
    const message = `GitNexus bridge 不可用：${normalizeError(error)}${hint}`;
    bridgeFailureReason = message;
    bridgeFailureUntil = Date.now() + FAILURE_CACHE_TTL_MS;

    return {
      provider: "gitnexus",
      enabled: true,
      available: false,
      degraded: true,
      modeRequested,
      modeResolved,
      summary: message,
      executions: [],
      warnings: ["bridge_unavailable", ...warnings],
      repo: effectiveRepo,
      launcherStrategy: launcher.strategy,
      ambiguities: [],
      workspaceMode: workspace.workspaceMode,
      sourceRoot: workspace.sourceRoot,
      analysisRoot: workspace.analysisRoot,
      pathMapped: workspace.pathMapped,
    };
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    await workspace.cleanup?.().catch(() => undefined);
  }

  const successful = executions.filter((item) => item.ok);
  const failed = executions.filter((item) => !item.ok);

  if (
    successful.length === 0
    && !effectiveRepo
    && failed.length > 0
    && failed.every((item) => (item.error || item.text || "").includes("Multiple repositories indexed"))
  ) {
    const availableRepos = parseAvailableReposFromError(
      failed.map((item) => item.error || item.text || "").join(" | ")
    );
    const retryRepo = inferCandidateRepoNames(workspace.sourceRoot).find((candidate) => availableRepos.includes(candidate));

    if (retryRepo) {
      return runCodeInsightBridge({
        ...request,
        repo: retryRepo,
      });
    }
  }

  bridgeFailureUntil = 0;
  bridgeFailureReason = "";
  const ambiguities = buildAmbiguities(successful);

  if (successful.length === 0) {
    const fallbackError =
      failed.length > 0
        ? shorten(failed.map((item) => `${item.tool}: ${item.error || "unknown error"}`).join(" | "), 220)
        : "未执行任何 GitNexus 调用";
    return {
      provider: "gitnexus",
      enabled: true,
      available: false,
      degraded: true,
      modeRequested,
      modeResolved,
      summary: `GitNexus bridge 已降级：${fallbackError}`,
      executions,
      warnings: ["bridge_call_failed", ...warnings],
      repo: effectiveRepo,
      launcherStrategy: launcher.strategy,
      ambiguities,
      workspaceMode: workspace.workspaceMode,
      sourceRoot: workspace.sourceRoot,
      analysisRoot: workspace.analysisRoot,
      pathMapped: workspace.pathMapped,
    };
  }

  const summary = ambiguities.length > 0
    ? `GitNexus 返回了 ${ambiguities.length} 个歧义结果，请指定 uid 或 file_path 后重试。`
    : `GitNexus 图谱增强已启用（${successful.length}/${executions.length} 成功）: ${successful
      .map((item) => `${item.tool}: ${describeExecutionSummary(item)}`)
      .join(" | ")}`;

  return {
    provider: "gitnexus",
    enabled: true,
    available: true,
    degraded: failed.length > 0,
    modeRequested,
    modeResolved,
    summary,
    executions,
    warnings,
    repo: effectiveRepo,
    launcherStrategy: launcher.strategy,
    ambiguities,
    workspaceMode: workspace.workspaceMode,
    sourceRoot: workspace.sourceRoot,
    analysisRoot: workspace.analysisRoot,
    pathMapped: workspace.pathMapped,
  };
}

function toEmbeddedGraphContext(result: CodeInsightBridgeResult): EmbeddedGraphContext {
  const highlights = result.executions
    .filter((item) => item.ok && item.text)
    .map((item) => `${item.tool}: ${shorten(item.text || "", 180)}`);

  return {
    enabled: result.enabled,
    available: result.available,
    degraded: result.degraded,
    summary: result.summary,
    warnings: result.warnings,
    provider: result.provider,
    mode: result.modeResolved,
    highlights,
  };
}

export async function buildFeatureGraphContext(input: {
  featureName: string;
  description: string;
  signal?: AbortSignal;
  repo?: string;
  projectRoot?: string;
}): Promise<EmbeddedGraphContext> {
  const bridge = await runCodeInsightBridge({
    mode: "auto",
    query: `${input.featureName} ${input.description}`,
    target: input.featureName,
    direction: "upstream",
    goal: "Find related modules and execution flows for feature planning",
    taskContext: "start_feature planning with query/context/impact narrowing",
    repo: input.repo,
    projectRoot: input.projectRoot,
    signal: input.signal,
  });
  return toEmbeddedGraphContext(bridge);
}

export async function buildBugfixGraphContext(input: {
  errorMessage: string;
  stackTrace?: string;
  signal?: AbortSignal;
  repo?: string;
  projectRoot?: string;
}): Promise<EmbeddedGraphContext> {
  const query = [input.errorMessage, input.stackTrace].filter(Boolean).join("\n");
  const bridge = await runCodeInsightBridge({
    mode: "query",
    query,
    goal: "Find likely root-cause symbols and impacted flows for bug fixing",
    taskContext: "start_bugfix diagnosis",
    repo: input.repo,
    projectRoot: input.projectRoot,
    signal: input.signal,
  });
  return toEmbeddedGraphContext(bridge);
}
