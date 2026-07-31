import type {
  ListResourcesResult,
  ReadResourceResult,
  Server,
} from "@modelcontextprotocol/server";
import { CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/server";
import { NAME, VERSION } from "../version.js";
import {
  PROJECT_BOOTSTRAP_URI,
  discoverProjectResources,
  readProjectResourceContent,
} from "../lib/project-mcp-resources.js";
import { resolveWorkspaceRoot } from "../lib/workspace-root.js";
import {
  listAppOnlyToolNames,
  listToolDefinitions,
  listToolDefinitionsForToolset,
} from "../server/tool-registry.js";
import { getToolsetFromEnv } from "../lib/toolset-manager.js";
import {
  MCP_APPS_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
  supportsMcpApps,
} from "../lib/mcp-apps.js";
import { GraphSnapshotStore } from "./graph-snapshot-store.js";
import { UiAppResourceStore } from "./ui-app-resource-store.js";
import {
  resolveProtocolEra,
  resolveProtocolFeatures,
  type ProtocolMode,
} from "../protocol/protocol-capabilities.js";
import { supportsFormElicitation } from "../protocol/requirements-input-bridge.js";

export interface ResourceHandlerOptions {
  extensionsCapabilityEnabled: boolean;
  traceMetaKey: string;
  graphStore: GraphSnapshotStore;
  uiStore: UiAppResourceStore;
  protocolMode: ProtocolMode;
}

export function registerResourceHandlers(
  server: Server,
  options: ResourceHandlerOptions
): void {
  server.setRequestHandler("resources/list", async (_request, ctx): Promise<ListResourcesResult> => {
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

    const clientCapabilities =
      server.getClientCapabilities() ??
      (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[
        CLIENT_CAPABILITIES_META_KEY
      ];
    if (options.uiStore.enabled && supportsMcpApps(clientCapabilities)) {
      try {
        resources.push(...options.uiStore.list());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[MCP Probe Kit] resources/list UI 资源合并失败: ${message}`);
      }
    }
    return { resources };
  });

  server.setRequestHandler(
    "resources/read",
    async (request, ctx): Promise<ReadResourceResult> => {
      const { uri } = request.params;

      if (uri === "probe://status") {
        const envelopeCapabilities = (
          ctx.mcpReq.envelope as Record<string, unknown> | undefined
        )?.[CLIENT_CAPABILITIES_META_KEY];
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                buildStatus(server, options, envelopeCapabilities),
                null,
                2
              ),
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
        const clientCapabilities =
          server.getClientCapabilities() ??
          (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[
            CLIENT_CAPABILITIES_META_KEY
          ];
        if (!options.uiStore.enabled || !supportsMcpApps(clientCapabilities)) {
          throw new Error(`客户端未协商 MCP Apps，不能读取 UI 资源: ${uri}`);
        }
        const content = options.uiStore.read(uri);
        if (!content) throw new Error(`未知 UI 资源: ${uri}`);
        return { contents: [content] };
      }

      const graphContent = options.graphStore.read(uri);
      if (graphContent) return { contents: [graphContent] };

      throw new Error(`未知资源: ${uri}`);
    }
  );
}

function buildStatus(
  server: Server,
  options: ResourceHandlerOptions,
  envelopeCapabilities?: unknown
) {
  const negotiatedVersion = server.getNegotiatedProtocolVersion();
  const era = resolveProtocolEra(negotiatedVersion);
  const clientCapabilities = server.getClientCapabilities() ?? envelopeCapabilities;
  const toolset = getToolsetFromEnv();
  const visibleToolCount = listToolDefinitionsForToolset(toolset).length;
  const features = resolveProtocolFeatures({
    era,
    formElicitationSupported: supportsFormElicitation(
      server,
      envelopeCapabilities
    ),
    progressEnabled: envEnabled("MCP_PROGRESS_NOTIFICATIONS"),
    appsEnabled: options.uiStore.enabled && supportsMcpApps(clientCapabilities),
    modernTasksEnabled: false,
  });
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
      uiAppsNegotiated: options.uiStore.enabled && supportsMcpApps(clientCapabilities),
      uiAppsExtensionId: MCP_APPS_EXTENSION_ID,
      uiAppsMimeType: MCP_APP_MIME_TYPE,
    },
    protocol: {
      mode: options.protocolMode,
      era,
      negotiatedVersion: negotiatedVersion ?? null,
      features,
    },
    graphSnapshots: options.graphStore.status(),
    tools: {
      toolset,
      visibleModelToolCount: visibleToolCount,
      registeredModelToolCount: listToolDefinitions().length,
      appOnlyToolCount: listAppOnlyToolNames().length,
    },
    toolCount: visibleToolCount,
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

function envEnabled(name: string): boolean {
  const raw = process.env[name];
  return raw !== undefined && /^(1|true|yes|on)$/i.test(raw.trim());
}
