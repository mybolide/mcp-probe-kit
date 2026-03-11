#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  InMemoryTaskMessageQueue,
  InMemoryTaskStore,
} from "@modelcontextprotocol/sdk/experimental/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ProgressNotificationSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { 
  initProject, gencommit,
  codeReview, codeInsight, gentest, refactor,
  initProjectContext, addFeature, fixBug, estimate,
  startFeature, startBugfix, startOnboard,
  startRalph, interview, askUser,
  uiDesignSystem, uiSearch, syncUiData, startUi,
  startProduct, gitWorkReport
} from "./tools/index.js";
import { VERSION, NAME } from "./version.js";
import { allToolSchemas } from "./schemas/index.js";
import { filterTools, getToolsetFromEnv } from "./lib/toolset-manager.js";
import {
  isAbortError,
  type ToolExecutionContext,
} from "./lib/tool-execution-context.js";

type ToolResult = {
  content?: unknown;
  isError?: boolean;
  structuredContent?: unknown;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
};

interface UiAppResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  text: string;
  createdAt: string;
}

interface GraphSnapshot {
  id: string;
  uri: string;
  toolName: string;
  createdAt: string;
  status: string;
  summary: string;
  payload: unknown;
  jsonFilePath?: string;
  markdownFilePath?: string;
}

const EXTENSIONS_CAPABILITY_KEY = "io.github.mybolide/extensions";
const MAX_UI_APP_RESOURCES = 30;
const MAX_GRAPH_SNAPSHOTS = 20;
const DEFAULT_GRAPH_SNAPSHOT_DIR = path.resolve(
  process.cwd(),
  ".mcp-probe-kit",
  "graph-snapshots"
);
const uiAppResources = new Map<string, UiAppResource>();
const uiAppResourceOrder: string[] = [];
const graphSnapshots = new Map<string, GraphSnapshot>();
const graphSnapshotOrder: string[] = [];

function isEnvEnabled(name: string, fallback: boolean = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function resolveGraphSnapshotDir(): string {
  const raw = process.env.MCP_GRAPH_SNAPSHOT_DIR?.trim();
  if (!raw) {
    return DEFAULT_GRAPH_SNAPSHOT_DIR;
  }
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

const extensionsCapabilityEnabled = isEnvEnabled("MCP_ENABLE_EXTENSIONS_CAPABILITY", false);
const uiAppsEnabled = isEnvEnabled("MCP_ENABLE_UI_APPS", false);
const traceMetaKey = process.env.MCP_TRACE_META_KEY || "trace";
const graphSnapshotDir = resolveGraphSnapshotDir();

const serverCapabilities: Record<string, unknown> = {
  tools: {},
  resources: {},
  tasks: {
    list: {},
    cancel: {},
    requests: {
      tools: {
        call: {},
      },
    },
  },
};

if (extensionsCapabilityEnabled) {
  serverCapabilities.experimental = {
    [EXTENSIONS_CAPABILITY_KEY]: {
      traceMetaPassthrough: true,
      traceMetaKey,
      uiApps: uiAppsEnabled,
      uiAppsMetaKey: "ui.resourceUri",
    },
  };
}

function getTraceMeta(meta: unknown): unknown {
  if (!meta || typeof meta !== "object") {
    return undefined;
  }

  const metaRecord = meta as Record<string, unknown>;
  if (traceMetaKey in metaRecord) {
    return metaRecord[traceMetaKey];
  }

  return metaRecord.trace;
}

function withTraceMeta(result: ToolResult, traceMeta: unknown): ToolResult {
  if (traceMeta === undefined) {
    return result;
  }

  return {
    ...result,
    _meta: {
      ...(result._meta ?? {}),
      [traceMetaKey]: traceMeta,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isUiTool(name: string): boolean {
  return [
    "ui_design_system",
    "ui_search",
    "sync_ui_data",
    "start_ui",
    "start_product",
  ].includes(name);
}

function buildUiResourceHtml(name: string, args: unknown, result: ToolResult): string {
  const structured = result.structuredContent
    ? JSON.stringify(result.structuredContent, null, 2)
    : "{}";
  const argJson = JSON.stringify(args ?? {}, null, 2);
  const textBlocks = Array.isArray(result.content)
    ? result.content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }
        const text = (item as Record<string, unknown>).text;
        return typeof text === "string" ? text : "";
      })
      .filter(Boolean)
      .join("\n\n")
    : "";

  const now = new Date().toISOString();

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)} · MCP Apps</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #f4f7fb; color: #1e2a35; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 24px; }
    .card { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 4px 18px rgba(30,42,53,.08); margin-bottom: 16px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    h2 { margin: 0 0 10px; font-size: 16px; color: #2f4a65; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0f1720; color: #d9e7f7; border-radius: 10px; padding: 12px; font-size: 12px; line-height: 1.45; }
    .meta { color: #4f6880; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${escapeHtml(name)}</h1>
      <div class="meta">Generated at ${escapeHtml(now)} · MCP Apps preview</div>
    </div>
    <div class="card">
      <h2>Text Output</h2>
      <pre>${escapeHtml(textBlocks || "(no text output)")}</pre>
    </div>
    <div class="card">
      <h2>Structured Content</h2>
      <pre>${escapeHtml(structured)}</pre>
    </div>
    <div class="card">
      <h2>Arguments</h2>
      <pre>${escapeHtml(argJson)}</pre>
    </div>
  </div>
</body>
</html>`;
}

function putUiAppResource(
  toolName: string,
  args: unknown,
  result: ToolResult
): string {
  const uid = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const uri = `ui://mcp-probe-kit/${toolName}/${uid}`;

  const entry: UiAppResource = {
    uri,
    name: `UI Preview · ${toolName}`,
    description: `MCP Apps preview generated by ${toolName}`,
    mimeType: "text/html",
    text: buildUiResourceHtml(toolName, args, result),
    createdAt: new Date().toISOString(),
  };

  uiAppResources.set(uri, entry);
  uiAppResourceOrder.push(uri);

  while (uiAppResourceOrder.length > MAX_UI_APP_RESOURCES) {
    const oldest = uiAppResourceOrder.shift();
    if (oldest) {
      uiAppResources.delete(oldest);
    }
  }

  return uri;
}

function withUiResourceMeta(result: ToolResult, resourceUri: string): ToolResult {
  const currentUi = result._meta?.ui;
  const currentUiRecord =
    currentUi && typeof currentUi === "object"
      ? (currentUi as Record<string, unknown>)
      : {};

  return {
    ...result,
    _meta: {
      ...(result._meta ?? {}),
      ui: {
        ...currentUiRecord,
        resourceUri,
      },
    },
  };
}

function withGraphSnapshotMeta(result: ToolResult, snapshot: GraphSnapshot): ToolResult {
  const currentGraphMeta = result._meta?.graph;
  const currentGraphMetaRecord =
    currentGraphMeta && typeof currentGraphMeta === "object"
      ? (currentGraphMeta as Record<string, unknown>)
      : {};

  return {
    ...result,
    _meta: {
      ...(result._meta ?? {}),
      graph: {
        ...currentGraphMetaRecord,
        snapshotUri: snapshot.uri,
        snapshotId: snapshot.id,
        status: snapshot.status,
        createdAt: snapshot.createdAt,
        jsonFilePath: snapshot.jsonFilePath ?? null,
        markdownFilePath: snapshot.markdownFilePath ?? null,
      },
    },
  };
}

function trimText(value: string, maxLen: number): string {
  if (value.length <= maxLen) {
    return value;
  }
  return `${value.slice(0, maxLen - 3)}...`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function makeSafeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "snapshot";
}

function ensureGraphSnapshotDir(): void {
  if (!fs.existsSync(graphSnapshotDir)) {
    fs.mkdirSync(graphSnapshotDir, { recursive: true });
  }
}

function renderGraphSnapshotMarkdown(snapshot: GraphSnapshot): string {
  return [
    "# Graph Snapshot",
    "",
    `- id: ${snapshot.id}`,
    `- tool: ${snapshot.toolName}`,
    `- status: ${snapshot.status}`,
    `- createdAt: ${snapshot.createdAt}`,
    `- summary: ${snapshot.summary}`,
    "",
    "## Payload",
    "```json",
    JSON.stringify(snapshot.payload, null, 2),
    "```",
    "",
  ].join("\n");
}

function persistGraphSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  try {
    ensureGraphSnapshotDir();
    const safeTool = makeSafeFileSegment(snapshot.toolName);
    const baseName = `${snapshot.id}-${safeTool}`;
    const jsonPath = path.join(graphSnapshotDir, `${baseName}.json`);
    const markdownPath = path.join(graphSnapshotDir, `${baseName}.md`);

    const jsonText = JSON.stringify(
      {
        id: snapshot.id,
        uri: snapshot.uri,
        toolName: snapshot.toolName,
        createdAt: snapshot.createdAt,
        status: snapshot.status,
        summary: snapshot.summary,
        payload: snapshot.payload,
      },
      null,
      2
    );

    fs.writeFileSync(jsonPath, jsonText, "utf-8");
    fs.writeFileSync(markdownPath, renderGraphSnapshotMarkdown(snapshot), "utf-8");

    return {
      ...snapshot,
      jsonFilePath: toPosixPath(jsonPath),
      markdownFilePath: toPosixPath(markdownPath),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[MCP Probe Kit] graph snapshot persist failed: ${message}`);
    return snapshot;
  }
}

function sanitizeGraphPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.slice(0, 20).map((item) => sanitizeGraphPayload(item));
  }

  const record = payload as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      next[key] = trimText(value, 6000);
      continue;
    }
    if (key === "executions" && Array.isArray(value)) {
      next[key] = value.slice(0, 8).map((item) => {
        if (!item || typeof item !== "object") {
          return item;
        }
        const exec = item as Record<string, unknown>;
        return {
          ...exec,
          text: typeof exec.text === "string" ? trimText(exec.text, 6000) : exec.text,
        };
      });
      continue;
    }
    next[key] = sanitizeGraphPayload(value);
  }
  return next;
}

function readGraphPayload(toolName: string, result: ToolResult): {
  status: string;
  summary: string;
  payload: unknown;
} | null {
  if (result.isError) {
    return null;
  }

  if (toolName === "code_insight" && result.structuredContent && typeof result.structuredContent === "object") {
    const structured = result.structuredContent as Record<string, unknown>;
    const status = typeof structured.status === "string" ? structured.status : "ok";
    const summary = typeof structured.summary === "string"
      ? structured.summary
      : "code_insight 图谱结果";
    return {
      status,
      summary,
      payload: sanitizeGraphPayload(structured),
    };
  }

  if ((toolName === "start_feature" || toolName === "start_bugfix")
    && result.structuredContent
    && typeof result.structuredContent === "object") {
    const structured = result.structuredContent as Record<string, unknown>;
    const metadata = structured.metadata;
    if (!metadata || typeof metadata !== "object") {
      return null;
    }
    const graphContext = (metadata as Record<string, unknown>).graphContext;
    if (!graphContext || typeof graphContext !== "object") {
      return null;
    }
    const graphRecord = graphContext as Record<string, unknown>;
    const status = graphRecord.available === false ? "degraded" : "ok";
    const summary = typeof graphRecord.summary === "string"
      ? graphRecord.summary
      : `${toolName} 图谱上下文`;
    return {
      status,
      summary,
      payload: sanitizeGraphPayload({
        graphContext,
        plan: (metadata as Record<string, unknown>).plan ?? null,
      }),
    };
  }

  return null;
}

function rememberGraphSnapshot(
  toolName: string,
  result: ToolResult
): GraphSnapshot | null {
  const graph = readGraphPayload(toolName, result);
  if (!graph) {
    return null;
  }

  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const uri = `probe://graph/${id}`;
  const snapshot = persistGraphSnapshot({
    id,
    uri,
    toolName,
    createdAt: new Date().toISOString(),
    status: graph.status,
    summary: graph.summary,
    payload: graph.payload,
  });

  graphSnapshots.set(id, snapshot);
  graphSnapshotOrder.push(id);

  while (graphSnapshotOrder.length > MAX_GRAPH_SNAPSHOTS) {
    const oldest = graphSnapshotOrder.shift();
    if (oldest) {
      graphSnapshots.delete(oldest);
    }
  }

  return snapshot;
}

function decorateResult(
  toolName: string,
  args: unknown,
  raw: ToolResult,
  traceMeta: unknown
): ToolResult {
  let result = withTraceMeta(raw, traceMeta);

  const snapshot = rememberGraphSnapshot(toolName, result);
  if (snapshot) {
    result = withGraphSnapshotMeta(result, snapshot);
  }

  if (uiAppsEnabled && isUiTool(toolName) && !result.isError) {
    const resourceUri = putUiAppResource(toolName, args, result);
    result = withUiResourceMeta(result, resourceUri);
  }

  return result;
}

// 创建MCP服务器实例
const server = new Server(
  {
    name: NAME,
    version: VERSION,
  },
  {
    capabilities: serverCapabilities as any,
    taskStore: new InMemoryTaskStore(),
    taskMessageQueue: new InMemoryTaskMessageQueue(),
  }
);

// 定义工具列表 - 从 schemas 导入，并根据工具集过滤
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolset = getToolsetFromEnv();
  const filteredTools = filterTools(allToolSchemas, toolset);
  
  console.error(`[MCP Probe Kit] 当前工具集: ${toolset} (${filteredTools.length}/${allToolSchemas.length} 个工具)`);
  
  return {
    tools: filteredTools,
  };
});

async function executeTool(
  name: string,
  args: unknown,
  context?: ToolExecutionContext
) {
  switch (name) {
    case "init_project":
      return await initProject(args as any);
    case "gencommit":
      return await gencommit(args as any);
    case "code_review":
      return await codeReview(args as any);
    case "code_insight":
      return await codeInsight(args as any, context);
    case "gentest":
      return await gentest(args as any);
    case "refactor":
      return await refactor(args as any);
    case "init_project_context":
      return await initProjectContext(args as any);
    case "add_feature":
      return await addFeature(args as any);
    case "fix_bug":
      return await fixBug(args as any);
    case "estimate":
      return await estimate(args as any);
    case "start_feature":
      return await startFeature(args as any, context);
    case "start_bugfix":
      return await startBugfix(args as any, context);
    case "start_onboard":
      return await startOnboard(args as any, context);
    case "start_ralph":
      return await startRalph(args as any, context);
    case "interview":
      return await interview(args as any);
    case "ask_user":
      return await askUser(args as any);
    case "ui_design_system":
      return await uiDesignSystem(args as any);
    case "ui_search":
      return await uiSearch(args as any);
    case "sync_ui_data":
      return await syncUiData(args as any, context);
    case "start_ui":
      return await startUi(args as any, context);
    case "start_product":
      return await startProduct((args ?? {}) as any, context);
    case "git_work_report":
      return await gitWorkReport(args as any);
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

function makeToolError(errorMessage: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `错误: ${errorMessage}`,
      },
    ],
    isError: true,
  };
}

function isTerminalTaskStatus(status: string) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;
  const taskRequest = request.params.task;
  const traceMeta = getTraceMeta(extra._meta);

  const emitProgress = async (progress: number, message: string) => {
    const progressToken = extra._meta?.progressToken;

    if (progressToken === undefined) {
      return;
    }

    try {
      await extra.sendNotification(
        ProgressNotificationSchema.parse({
          method: "notifications/progress",
          params: {
            progressToken,
            progress,
            total: 100,
            message,
            ...(traceMeta === undefined
              ? {}
              : {
                  _meta: {
                    [traceMetaKey]: traceMeta,
                  },
                }),
          },
        })
      );
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      console.error(`[MCP Probe Kit] progress notification failed: ${err}`);
    }
  };

  if (taskRequest) {
    if (!extra.taskStore) {
      return withTraceMeta(
        makeToolError("服务器未启用任务存储，无法创建任务"),
        traceMeta
      );
    }

    const task = await extra.taskStore.createTask({
      ttl: extra.taskRequestedTtl ?? taskRequest.ttl,
    });

    const taskAbortController = new AbortController();
    const cancelWatcher = setInterval(() => {
      void (async () => {
        try {
          const latestTask = await extra.taskStore?.getTask(task.taskId);
          if (latestTask?.status === "cancelled" && !taskAbortController.signal.aborted) {
            taskAbortController.abort();
          }
        } catch {
          // ignore watcher errors
        }
      })();
    }, 400);

    const onRequestAbort = () => taskAbortController.abort();
    extra.signal.addEventListener("abort", onRequestAbort, { once: true });

    const taskContext: ToolExecutionContext = {
      signal: taskAbortController.signal,
      traceMeta,
      reportProgress: async (progress, message) => {
        const normalized = Math.max(0, Math.min(100, Math.round(progress)));
        await emitProgress(normalized, message);
        try {
          await extra.taskStore?.updateTaskStatus(
            task.taskId,
            "working",
            `[${normalized}%] ${message}`
          );
        } catch {
          // task may have already reached terminal status
        }
      },
    };

    // 后台执行任务，不阻塞当前请求，立即返回 taskId 给客户端轮询。
    void (async () => {
      try {
        await taskContext.reportProgress?.(5, `开始执行工具: ${name}`);
        const rawResult = await executeTool(name, args, taskContext);

        if (!rawResult || typeof rawResult !== "object") {
          throw new Error(`工具 ${name} 返回了无效响应`);
        }

        const result = decorateResult(name, args, rawResult as ToolResult, traceMeta);
        const latestTask = await extra.taskStore?.getTask(task.taskId);

        if (!latestTask || isTerminalTaskStatus(latestTask.status)) {
          return;
        }

        const status = result && typeof result === "object" && "isError" in result && result.isError
          ? "failed"
          : "completed";
        await extra.taskStore?.storeTaskResult(task.taskId, status, result as any);
      } catch (error) {
        if (isAbortError(error)) {
          const latestTask = await extra.taskStore?.getTask(task.taskId);
          if (!latestTask || isTerminalTaskStatus(latestTask.status)) {
            return;
          }

          await extra.taskStore?.storeTaskResult(
            task.taskId,
            "failed",
            withTraceMeta(makeToolError(`工具执行已取消: ${name}`), traceMeta)
          );
          return;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const latestTask = await extra.taskStore?.getTask(task.taskId);

        if (!latestTask || isTerminalTaskStatus(latestTask.status)) {
          return;
        }

        await extra.taskStore?.storeTaskResult(
          task.taskId,
          "failed",
          withTraceMeta(makeToolError(errorMessage), traceMeta)
        );
      }
    })().catch((error) => {
      const err = error instanceof Error ? error.message : String(error);
      console.error(`[MCP Probe Kit] task execution failed: ${err}`);
    }).finally(() => {
      clearInterval(cancelWatcher);
      extra.signal.removeEventListener("abort", onRequestAbort);
    });

    return withTraceMeta({ task }, traceMeta);
  }

  const ensureNotAborted = () => {
    if (extra.signal.aborted) {
      throw new Error(`工具执行已取消: ${name}`);
    }
  };

  const toolContext: ToolExecutionContext = {
    signal: extra.signal,
    traceMeta,
    reportProgress: async (progress, message) => {
      const normalized = Math.max(0, Math.min(100, Math.round(progress)));
      await emitProgress(normalized, message);
    },
  };

  try {
    ensureNotAborted();
    await emitProgress(5, `开始执行工具: ${name}`);

    const rawResult = await executeTool(name, args, toolContext);
    if (!rawResult || typeof rawResult !== "object") {
      throw new Error(`工具 ${name} 返回了无效响应`);
    }

    ensureNotAborted();
    const result = decorateResult(name, args, rawResult as ToolResult, traceMeta);
    await emitProgress(100, `工具执行完成: ${name}`);
    return result;
  } catch (error) {
    if (extra.signal.aborted) {
      await emitProgress(100, `工具执行已取消: ${name}`);
    } else {
      await emitProgress(100, `工具执行失败: ${name}`);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return withTraceMeta(makeToolError(errorMessage), traceMeta);
  }
});

// 定义资源列表
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = [
    {
      uri: "probe://status",
      name: "服务器状态",
      description: "MCP Probe Kit 服务器当前状态",
      mimeType: "application/json",
    },
    {
      uri: "probe://graph/latest",
      name: "图谱快照（最新）",
      description: "最近一次 code_insight 或 start_* 生成的图谱快照",
      mimeType: "application/json",
    },
    {
      uri: "probe://graph/history",
      name: "图谱快照（历史）",
      description: `最近 ${graphSnapshotOrder.length} 条图谱快照摘要`,
      mimeType: "application/json",
    },
    {
      uri: "probe://graph/latest.md",
      name: "图谱快照（最新 Markdown）",
      description: "最近一次图谱快照的 Markdown 视图",
      mimeType: "text/markdown",
    },
    {
      uri: "probe://graph/files",
      name: "图谱快照（文件索引）",
      description: `图谱快照落盘目录: ${toPosixPath(graphSnapshotDir)}`,
      mimeType: "application/json",
    },
  ];

  for (const id of graphSnapshotOrder.slice().reverse().slice(0, 10)) {
    const snapshot = graphSnapshots.get(id);
    if (!snapshot) {
      continue;
    }
    resources.push({
      uri: snapshot.uri,
      name: `图谱快照 · ${snapshot.toolName}`,
      description: `${snapshot.status} · ${trimText(snapshot.summary, 120)} (${snapshot.createdAt})`,
      mimeType: "application/json",
    });
  }

  if (uiAppsEnabled) {
    for (const uri of uiAppResourceOrder.slice().reverse()) {
      const entry = uiAppResources.get(uri);
      if (!entry) {
        continue;
      }
      resources.push({
        uri: entry.uri,
        name: entry.name,
        description: `${entry.description} (${entry.createdAt})`,
        mimeType: entry.mimeType,
      });
    }
  }

  return {
    resources,
  };
});

// 读取资源
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "probe://status") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              status: "running",
              timestamp: new Date().toISOString(),
              serverInfo: {
                name: NAME,
                version: VERSION,
                description: "AI 驱动的完整研发工具集",
              },
              extensions: {
                enabled: extensionsCapabilityEnabled,
                traceMetaKey,
                uiAppsEnabled,
              },
              experimentalTasksStreaming: {
                requestStream: typeof server.experimental.tasks.requestStream === "function",
                createMessageStream: typeof server.experimental.tasks.createMessageStream === "function",
                elicitInputStream: typeof server.experimental.tasks.elicitInputStream === "function",
              },
              graphSnapshots: {
                count: graphSnapshotOrder.length,
                snapshotDir: toPosixPath(graphSnapshotDir),
                latest: (() => {
                  const latestId = graphSnapshotOrder[graphSnapshotOrder.length - 1];
                  if (!latestId) {
                    return null;
                  }
                  const latest = graphSnapshots.get(latestId);
                  if (!latest) {
                    return null;
                  }
                  return {
                    id: latest.id,
                    uri: latest.uri,
                    toolName: latest.toolName,
                    status: latest.status,
                    summary: trimText(latest.summary, 140),
                    createdAt: latest.createdAt,
                    jsonFilePath: latest.jsonFilePath ?? null,
                    markdownFilePath: latest.markdownFilePath ?? null,
                  };
                })(),
              },
              toolCount: allToolSchemas.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (uri.startsWith("ui://")) {
    const entry = uiAppResources.get(uri);
    if (!entry) {
      throw new Error(`未知 UI 资源: ${uri}`);
    }

    return {
      contents: [
        {
          uri: entry.uri,
          mimeType: entry.mimeType,
          text: entry.text,
        },
      ],
    };
  }

  if (uri === "probe://graph/latest") {
    const latestId = graphSnapshotOrder[graphSnapshotOrder.length - 1];
    if (!latestId) {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                status: "empty",
                message: "暂无图谱快照，请先调用 code_insight 或 start_feature/start_bugfix。",
              },
              null,
              2
            ),
          },
        ],
      };
    }
    const snapshot = graphSnapshots.get(latestId);
    if (!snapshot) {
      throw new Error(`图谱快照不存在: ${latestId}`);
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              id: snapshot.id,
              uri: snapshot.uri,
              toolName: snapshot.toolName,
              createdAt: snapshot.createdAt,
              status: snapshot.status,
              summary: snapshot.summary,
              payload: snapshot.payload,
              files: {
                json: snapshot.jsonFilePath ?? null,
                markdown: snapshot.markdownFilePath ?? null,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (uri === "probe://graph/latest.md") {
    const latestId = graphSnapshotOrder[graphSnapshotOrder.length - 1];
    if (!latestId) {
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: "# Graph Snapshot\n\n暂无图谱快照，请先调用 code_insight 或 start_feature/start_bugfix。",
          },
        ],
      };
    }

    const snapshot = graphSnapshots.get(latestId);
    if (!snapshot) {
      throw new Error(`图谱快照不存在: ${latestId}`);
    }

    const markdown =
      snapshot.markdownFilePath && fs.existsSync(snapshot.markdownFilePath)
        ? fs.readFileSync(snapshot.markdownFilePath, "utf-8")
        : renderGraphSnapshotMarkdown(snapshot);

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: markdown,
        },
      ],
    };
  }

  if (uri === "probe://graph/history") {
    const history = graphSnapshotOrder
      .slice()
      .reverse()
      .map((id) => graphSnapshots.get(id))
      .filter((item): item is GraphSnapshot => Boolean(item))
      .map((item) => ({
        id: item.id,
        uri: item.uri,
        toolName: item.toolName,
        createdAt: item.createdAt,
        status: item.status,
        summary: trimText(item.summary, 200),
        files: {
          json: item.jsonFilePath ?? null,
          markdown: item.markdownFilePath ?? null,
        },
      }));

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              count: history.length,
              items: history,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (uri === "probe://graph/files") {
    const latestId = graphSnapshotOrder[graphSnapshotOrder.length - 1];
    const latest = latestId ? graphSnapshots.get(latestId) ?? null : null;
    const hasDir = fs.existsSync(graphSnapshotDir);
    const files = hasDir
      ? fs
          .readdirSync(graphSnapshotDir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && /\.(json|md)$/i.test(entry.name))
          .map((entry) => toPosixPath(path.join(graphSnapshotDir, entry.name)))
          .sort((a, b) => b.localeCompare(a))
          .slice(0, 40)
      : [];

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              snapshotDir: toPosixPath(graphSnapshotDir),
              exists: hasDir,
              latest: latest
                ? {
                    id: latest.id,
                    uri: latest.uri,
                    toolName: latest.toolName,
                    jsonFilePath: latest.jsonFilePath ?? null,
                    markdownFilePath: latest.markdownFilePath ?? null,
                  }
                : null,
              files,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (uri.startsWith("probe://graph/")) {
    const id = uri.slice("probe://graph/".length);
    if (!id || id === "latest" || id === "history" || id === "files" || id === "latest.md") {
      throw new Error(`未知图谱资源: ${uri}`);
    }
    const snapshot = graphSnapshots.get(id);
    if (!snapshot) {
      throw new Error(`图谱快照不存在: ${id}`);
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              id: snapshot.id,
              uri: snapshot.uri,
              toolName: snapshot.toolName,
              createdAt: snapshot.createdAt,
              status: snapshot.status,
              summary: snapshot.summary,
              payload: snapshot.payload,
              files: {
                json: snapshot.jsonFilePath ?? null,
                markdown: snapshot.markdownFilePath ?? null,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`未知资源: ${uri}`);
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Probe Kit 服务器已启动");
}

// 启动服务器
main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
