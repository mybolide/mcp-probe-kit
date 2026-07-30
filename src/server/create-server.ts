import * as path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  InMemoryTaskMessageQueue,
  InMemoryTaskStore,
} from "@modelcontextprotocol/sdk/experimental/index.js";
import { NAME, VERSION } from "../version.js";
import { GraphSnapshotStore } from "../resources/graph-snapshot-store.js";
import { UiAppResourceStore } from "../resources/ui-app-resource-store.js";
import { registerResourceHandlers } from "../resources/register-resource-handlers.js";
import { registerToolHandlers } from "./register-tool-handlers.js";
import { ResultDecorator } from "./result-decorator.js";
import {
  InMemoryInternalTaskStore,
  JsonFileInternalTaskStore,
  type InternalTaskStore,
} from "../tasks/task-store.js";
import { InternalTaskRuntime } from "../tasks/task-runtime.js";
import type { InternalTaskRecord } from "../tasks/task-types.js";

const EXTENSIONS_CAPABILITY_KEY = "io.github.mybolide/extensions";

export interface ProbeServerRuntime {
  server: Server;
  decorator: ResultDecorator;
  taskRuntime: InternalTaskRuntime;
  taskRuntimeReady: Promise<InternalTaskRecord[]>;
}

export function createProbeServer(): ProbeServerRuntime {
  const extensionsCapabilityEnabled = envEnabled("MCP_ENABLE_EXTENSIONS_CAPABILITY");
  const uiAppsEnabled = envEnabled("MCP_ENABLE_UI_APPS");
  const traceMetaKey = process.env.MCP_TRACE_META_KEY || "trace";
  const graphSnapshotDir = resolveGraphSnapshotDir();
  const graphStore = new GraphSnapshotStore(graphSnapshotDir);
  const uiStore = new UiAppResourceStore(uiAppsEnabled);
  const decorator = new ResultDecorator(traceMetaKey, graphStore, uiStore);
  const taskStore = createInternalTaskStore();
  const taskRuntime = new InternalTaskRuntime(taskStore);
  const taskRuntimeReady = recoverPersistedTasks(taskRuntime, taskStore);

  const capabilities: Record<string, unknown> = {
    tools: {},
    resources: {},
    tasks: {
      list: {},
      cancel: {},
      requests: { tools: { call: {} } },
    },
  };
  if (extensionsCapabilityEnabled) {
    capabilities.experimental = {
      [EXTENSIONS_CAPABILITY_KEY]: {
        traceMetaPassthrough: true,
        traceMetaKey,
        uiApps: uiAppsEnabled,
        uiAppsMetaKey: "ui.resourceUri",
      },
    };
  }

  const server = new Server(
    { name: NAME, version: VERSION },
    {
      capabilities: capabilities as never,
      taskStore: new InMemoryTaskStore(),
      taskMessageQueue: new InMemoryTaskMessageQueue(),
    }
  );

  registerToolHandlers(server, decorator, {
    progressNotificationsEnabled: envEnabled("MCP_PROGRESS_NOTIFICATIONS"),
    taskRuntime,
  });
  registerResourceHandlers(server, {
    extensionsCapabilityEnabled,
    traceMetaKey,
    graphStore,
    uiStore,
  });

  return { server, decorator, taskRuntime, taskRuntimeReady };
}

function envEnabled(name: string): boolean {
  const raw = process.env[name];
  return raw !== undefined && /^(1|true|yes|on)$/i.test(raw.trim());
}

function resolveGraphSnapshotDir(): string {
  const raw = process.env.MCP_GRAPH_SNAPSHOT_DIR?.trim();
  if (!raw) {
    return path.resolve(process.cwd(), ".mcp-probe-kit", "graph-snapshots");
  }
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function createInternalTaskStore(): InternalTaskStore {
  const mode = (process.env.MCP_TASK_STORE ?? "memory").trim().toLowerCase();
  if (mode === "memory") return new InMemoryInternalTaskStore();
  if (mode !== "json") {
    throw new Error(`不支持的 MCP_TASK_STORE: ${mode}（可选 memory/json）`);
  }

  const configuredPath = process.env.MCP_TASK_STORE_PATH?.trim();
  const filePath = configuredPath
    ? path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath)
    : path.resolve(process.cwd(), ".mcp-probe-kit", "tasks.json");
  return new JsonFileInternalTaskStore(filePath);
}

function recoverPersistedTasks(
  runtime: InternalTaskRuntime,
  store: InternalTaskStore
): Promise<InternalTaskRecord[]> {
  if (!(store instanceof JsonFileInternalTaskStore)) return Promise.resolve([]);
  return runtime.recoverInterrupted(() => ({
    reason: "服务重启后缺少可重建的执行器，请重新发起对应工具调用",
  }));
}
