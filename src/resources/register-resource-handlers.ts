import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NAME, VERSION } from "../version.js";
import {
  PROJECT_BOOTSTRAP_URI,
  discoverProjectResources,
  readProjectResourceContent,
} from "../lib/project-mcp-resources.js";
import { resolveWorkspaceRoot } from "../lib/workspace-root.js";
import { listToolDefinitions } from "../server/tool-registry.js";
import { GraphSnapshotStore } from "./graph-snapshot-store.js";
import { UiAppResourceStore } from "./ui-app-resource-store.js";

export interface ResourceHandlerOptions {
  extensionsCapabilityEnabled: boolean;
  traceMetaKey: string;
  graphStore: GraphSnapshotStore;
  uiStore: UiAppResourceStore;
}

export function registerResourceHandlers(
  server: Server,
  options: ResourceHandlerOptions
): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [
      {
        uri: "probe://status",
        name: "服务器状态",
        description: "MCP Probe Kit 服务器当前状态",
        mimeType: "application/json",
      },
      {
        uri: PROJECT_BOOTSTRAP_URI,
        name: "项目 MCP 自检",
        description:
          "读取时自动补齐 Skill + AGENTS.md，并返回 probe://project/skill|agents|context|graph 入口",
        mimeType: "application/json",
      },
    ];

    try {
      resources.push(...options.uiStore.list());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MCP Probe Kit] resources/list UI 资源合并失败: ${message}`);
    }
    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === "probe://status") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(buildStatus(server, options), null, 2),
          },
        ],
      };
    }

    if (uri === PROJECT_BOOTSTRAP_URI || uri.startsWith("probe://project/")) {
      try {
        const content = readProjectResourceContent(uri, resolveWorkspaceRoot(""));
        if (!content) throw new Error(`未知项目 resource: ${uri}`);
        return { contents: [content] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`读取项目 resource 失败 (${uri}): ${message}`);
      }
    }

    if (uri.startsWith("ui://")) {
      const content = options.uiStore.read(uri);
      if (!content) throw new Error(`未知 UI 资源: ${uri}`);
      return { contents: [content] };
    }

    const graphContent = options.graphStore.read(uri);
    if (graphContent) return { contents: [graphContent] };

    throw new Error(`未知资源: ${uri}`);
  });
}

function buildStatus(server: Server, options: ResourceHandlerOptions) {
  return {
    status: "running",
    timestamp: new Date().toISOString(),
    serverInfo: {
      name: NAME,
      version: VERSION,
      description: "AI 驱动的完整研发工具集",
    },
    extensions: {
      enabled: options.extensionsCapabilityEnabled,
      traceMetaKey: options.traceMetaKey,
      uiAppsEnabled: options.uiStore.enabled,
    },
    experimentalTasksStreaming: {
      requestStream: typeof server.experimental.tasks.requestStream === "function",
      createMessageStream: typeof server.experimental.tasks.createMessageStream === "function",
      elicitInputStream: typeof server.experimental.tasks.elicitInputStream === "function",
    },
    graphSnapshots: options.graphStore.status(),
    toolCount: listToolDefinitions().length,
    projectResources: discoverProjectResourceStatus(),
  };
}

function discoverProjectResourceStatus() {
  try {
    const discovered = discoverProjectResources(resolveWorkspaceRoot(""));
    return {
      bootstrapUri: PROJECT_BOOTSTRAP_URI,
      projectRoot: toPosixPath(discovered.projectRoot),
      available: discovered.resources.filter((item) => item.exists).map((item) => item.uri),
      note: "读取 probe://project/bootstrap 时执行 Skill/AGENTS 自动补齐",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { bootstrapUri: PROJECT_BOOTSTRAP_URI, error: message };
  }
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}
