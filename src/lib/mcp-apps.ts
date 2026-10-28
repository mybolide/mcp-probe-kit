import { MCP_APP_BUNDLE } from '../resources/generated/mcp-app-bundle.js';
import { V5_APP_STYLES } from './v5-app-styles.js';

export const MCP_APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
const MCP_APP_RESOURCE_URI_META_KEY = 'ui/resourceUri';

export type McpAppKind =
  | 'memory-center'
  | 'devcontrol-workbench';

export interface McpAppResourceDefinition {
  uri: string;
  name: string;
  description: string;
  kind: McpAppKind;
}

export const MCP_APP_RESOURCES: readonly McpAppResourceDefinition[] = [
  {
    uri: 'ui://mcp-probe-kit/memory-center',
    name: 'MCP Probe Kit Memory Center',
    description: 'Browse, search, inspect, update, and delete memory assets.',
    kind: 'memory-center',
  },
  {
    uri: 'ui://mcp-probe-kit/devcontrol-workbench',
    name: 'MCP Probe Kit SQLite DevControl',
    description: 'Read-only project tasks, features, bugs and ideas from the single DevControl SQLite ledger.',
    kind: 'devcontrol-workbench',
  },
] as const;

const RESOURCE_BY_URI = new Map(MCP_APP_RESOURCES.map((resource) => [resource.uri, resource]));

const TOOL_RESOURCE_URI: Readonly<Record<string, string>> = {
  search_memory: 'ui://mcp-probe-kit/memory-center',
  read_memory_asset: 'ui://mcp-probe-kit/memory-center',
  memorize_asset: 'ui://mcp-probe-kit/memory-center',
  update_memory_asset: 'ui://mcp-probe-kit/memory-center',
  delete_memory_asset: 'ui://mcp-probe-kit/memory-center',
  scan_and_extract_patterns: 'ui://mcp-probe-kit/memory-center',
  list_memory_assets: 'ui://mcp-probe-kit/memory-center',
  devcontrol: 'ui://mcp-probe-kit/devcontrol-workbench',
};

export function getMcpAppResource(uri: string): McpAppResourceDefinition | undefined {
  return RESOURCE_BY_URI.get(uri);
}

export function getMcpAppResourceUri(toolName: string): string | undefined {
  return TOOL_RESOURCE_URI[toolName];
}

export function isMcpUiAppTool(toolName: string): boolean {
  return Boolean(getMcpAppResourceUri(toolName));
}

export function supportsMcpApps(clientCapabilities: unknown): boolean {
  if (!clientCapabilities || typeof clientCapabilities !== 'object') return false;
  const extensions = (clientCapabilities as Record<string, unknown>).extensions;
  if (!extensions || typeof extensions !== 'object') return false;
  const ui = (extensions as Record<string, unknown>)[MCP_APPS_EXTENSION_ID];
  if (!ui || typeof ui !== 'object') return false;
  const mimeTypes = (ui as Record<string, unknown>).mimeTypes;
  return Array.isArray(mimeTypes) && mimeTypes.includes(MCP_APP_MIME_TYPE);
}

export type McpAppToolVisibility = 'model' | 'app';

export function buildMcpAppToolMeta(
  toolName: string,
  clientCapabilities: unknown,
  enabled: boolean,
  visibility: readonly McpAppToolVisibility[] = ['model', 'app'],
): Record<string, unknown> | undefined {
  const resourceUri = getMcpAppResourceUri(toolName);
  if (!enabled || !resourceUri || !supportsMcpApps(clientCapabilities)) return undefined;
  return {
    ui: {
      resourceUri,
      visibility: [...visibility],
    },
    [MCP_APP_RESOURCE_URI_META_KEY]: resourceUri,
  };
}

export interface McpAppHtmlOptions {
  demo?: unknown;
}

export function buildMcpAppHtml(
  resource: McpAppResourceDefinition,
  options: McpAppHtmlOptions = {},
): string {
  const demoScript = options.demo === undefined
    ? ''
    : `<script>window.__MCP_PROBE_DEMO__=${serializeInlineJson(options.demo)};</script>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(resource.name)}</title>
  <style>${V5_APP_STYLES}</style>
</head>
<body>
  <div id="app" data-app-kind="${escapeHtml(resource.kind)}"></div>
  ${demoScript}
  <script>${MCP_APP_BUNDLE}</script>
</body>
</html>`.replace(/[ \t]+$/gm, '');
}

function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) =>
    String.raw`\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
