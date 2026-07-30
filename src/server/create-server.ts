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

const EXTENSIONS_CAPABILITY_KEY = "io.github.mybolide/extensions";

export interface ProbeServerRuntime {
  server: Server;
  decorator: ResultDecorator;
}

export function createProbeServer(): ProbeServerRuntime {
  const extensionsCapabilityEnabled = envEnabled("MCP_ENABLE_EXTENSIONS_CAPABILITY");
  const uiAppsEnabled = envEnabled("MCP_ENABLE_UI_APPS");
  const traceMetaKey = process.env.MCP_TRACE_META_KEY || "trace";
  const graphSnapshotDir = resolveGraphSnapshotDir();
  const graphStore = new GraphSnapshotStore(graphSnapshotDir);
  const uiStore = new UiAppResourceStore(uiAppsEnabled);
  const decorator = new ResultDecorator(traceMetaKey, graphStore, uiStore);

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
  });
  registerResourceHandlers(server, {
    extensionsCapabilityEnabled,
    traceMetaKey,
    graphStore,
    uiStore,
  });

  return { server, decorator };
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
