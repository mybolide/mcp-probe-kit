import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  isAbortError,
  throwIfAborted,
} from "./tool-execution-context.js";

export type CodeInsightMode = "auto" | "query" | "context" | "impact";
export type CodeInsightDirection = "upstream" | "downstream";

export interface CodeInsightRequest {
  mode?: CodeInsightMode;
  query?: string;
  target?: string;
  repo?: string;
  goal?: string;
  taskContext?: string;
  direction?: CodeInsightDirection;
  maxDepth?: number;
  includeTests?: boolean;
  signal?: AbortSignal;
}

export interface CodeInsightExecution {
  tool: string;
  ok: boolean;
  durationMs: number;
  args: Record<string, unknown>;
  text?: string;
  structuredContent?: unknown;
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

function splitArgs(raw: string | undefined): string[] {
  if (!raw) {
    return [...DEFAULT_GITNEXUS_ARGS];
  }
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function inferDefaultRepoName(): string | undefined {
  const explicit = process.env.MCP_GITNEXUS_REPO?.trim();
  if (explicit) {
    return explicit;
  }

  const pkgPath = path.join(process.cwd(), "package.json");
  try {
    if (fs.existsSync(pkgPath)) {
      const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      const pkgName = typeof parsed.name === "string" ? parsed.name.trim() : "";
      if (pkgName) {
        return pkgName;
      }
    }
  } catch {
    // ignore parse failure
  }

  const base = path.basename(process.cwd()).trim();
  return base || undefined;
}

function resolveBridgeCommand() {
  const command = (process.env.MCP_GITNEXUS_COMMAND || "npx").trim() || "npx";
  const args = splitArgs(process.env.MCP_GITNEXUS_ARGS);
  return { command, args };
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

function resolveMode(request: CodeInsightRequest): "query" | "context" | "impact" {
  const mode = request.mode || "auto";
  if (mode === "query" || mode === "context" || mode === "impact") {
    return mode;
  }

  if (request.target && request.direction) {
    return "impact";
  }
  if (request.target && !request.query) {
    return "context";
  }
  return "query";
}

async function callBridgeTool(
  client: Client,
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined
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

    if (isError) {
      return {
        tool,
        args,
        ok: false,
        durationMs,
        text,
        structuredContent: (result as Record<string, unknown>).structuredContent,
        error: text || `GitNexus 工具 ${tool} 返回错误`,
      };
    }

    return {
      tool,
      args,
      ok: true,
      durationMs,
      text,
      structuredContent: (result as Record<string, unknown>).structuredContent,
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
  const effectiveRepo = request.repo || inferDefaultRepoName();

  if (!isBridgeEnabled() || isEnvDisabled("MCP_ENABLE_GITNEXUS_BRIDGE")) {
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
      repo: effectiveRepo,
    };
  }

  if (Date.now() < bridgeFailureUntil) {
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
      repo: effectiveRepo,
    };
  }

  throwIfAborted(request.signal, "GitNexus bridge 已取消");
  const { command, args } = resolveBridgeCommand();
  const warnings: string[] = [];
  const executions: CodeInsightExecution[] = [];
  const stderrLogs: string[] = [];

  const transport = new StdioClientTransport({
    command,
    args,
    cwd: process.cwd(),
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
      executions.push(
        await callBridgeTool(
          client,
          "query",
          {
            query: queryText,
            ...(request.goal ? { goal: request.goal } : {}),
            ...(request.taskContext ? { task_context: request.taskContext } : {}),
            ...(effectiveRepo ? { repo: effectiveRepo } : {}),
          },
          request.signal
        )
      );
    };

    const runContext = async () => {
      if (!request.target) {
        warnings.push("缺少 target 参数，已跳过 context");
        return;
      }
      executions.push(
        await callBridgeTool(
          client,
          "context",
          {
            name: request.target,
            ...(effectiveRepo ? { repo: effectiveRepo } : {}),
          },
          request.signal
        )
      );
    };

    const runImpact = async () => {
      if (!request.target) {
        warnings.push("缺少 target 参数，已跳过 impact");
        return;
      }
      executions.push(
        await callBridgeTool(
          client,
          "impact",
          {
            target: request.target,
            direction: request.direction || "upstream",
            ...(request.maxDepth ? { maxDepth: request.maxDepth } : {}),
            ...(typeof request.includeTests === "boolean"
              ? { includeTests: request.includeTests }
              : {}),
            ...(effectiveRepo ? { repo: effectiveRepo } : {}),
          },
          request.signal
        )
      );
    };

    if (modeRequested === "auto") {
      await runQuery();
      if (request.target) {
        await runContext();
      }
      if (request.target && request.direction) {
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
    };
  } finally {
    await client.close().catch(() => undefined);
  }

  const successful = executions.filter((item) => item.ok);
  const failed = executions.filter((item) => !item.ok);

  bridgeFailureUntil = 0;
  bridgeFailureReason = "";

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
    };
  }

  const summaryParts = successful.map(
    (item) => `${item.tool}: ${shorten(item.text || "已返回结构化结果", 110)}`
  );
  const summary = `GitNexus 图谱增强已启用（${successful.length}/${executions.length} 成功）: ${summaryParts.join(" | ")}`;

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
}): Promise<EmbeddedGraphContext> {
  const bridge = await runCodeInsightBridge({
    mode: "query",
    query: `${input.featureName} ${input.description}`,
    goal: "Find related modules and execution flows for feature planning",
    taskContext: "start_feature planning",
    repo: input.repo,
    signal: input.signal,
  });
  return toEmbeddedGraphContext(bridge);
}

export async function buildBugfixGraphContext(input: {
  errorMessage: string;
  stackTrace?: string;
  signal?: AbortSignal;
  repo?: string;
}): Promise<EmbeddedGraphContext> {
  const query = [input.errorMessage, input.stackTrace].filter(Boolean).join("\n");
  const bridge = await runCodeInsightBridge({
    mode: "query",
    query,
    goal: "Find likely root-cause symbols and impacted flows for bug fixing",
    taskContext: "start_bugfix diagnosis",
    repo: input.repo,
    signal: input.signal,
  });
  return toEmbeddedGraphContext(bridge);
}
