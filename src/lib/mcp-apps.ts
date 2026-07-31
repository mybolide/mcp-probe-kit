import { MCP_APP_BUNDLE } from '../resources/generated/mcp-app-bundle.js';

export const MCP_APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
const MCP_APP_RESOURCE_URI_META_KEY = 'ui/resourceUri';

export type McpAppKind =
  | 'memory-center'
  | 'feature-workbench'
  | 'bug-workbench'
  | 'product-workbench'
  | 'convergence';

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
    uri: 'ui://mcp-probe-kit/feature-workbench',
    name: 'MCP Probe Kit Feature Workbench',
    description: 'Interactive feature plan and delegated execution workbench.',
    kind: 'feature-workbench',
  },
  {
    uri: 'ui://mcp-probe-kit/bug-workbench',
    name: 'MCP Probe Kit Bug Workbench',
    description: 'Interactive root-cause, fix plan, and regression workbench.',
    kind: 'bug-workbench',
  },
  {
    uri: 'ui://mcp-probe-kit/product-workbench',
    name: 'MCP Probe Kit Product Workbench',
    description: 'Interactive product definition and product-to-feature handoff.',
    kind: 'product-workbench',
  },
  {
    uri: 'ui://mcp-probe-kit/convergence',
    name: 'MCP Probe Kit Convergence Gate',
    description: 'Interactive evidence and convergence quality gate.',
    kind: 'convergence',
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
  start_feature: 'ui://mcp-probe-kit/feature-workbench',
  start_bugfix: 'ui://mcp-probe-kit/bug-workbench',
  start_product: 'ui://mcp-probe-kit/product-workbench',
  converge: 'ui://mcp-probe-kit/convergence',
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

export function buildMcpAppHtml(resource: McpAppResourceDefinition): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(resource.name)}</title>
  <style>${APP_STYLES}</style>
</head>
<body>
  <div id="app" data-app-kind="${escapeHtml(resource.kind)}"></div>
  <script>${MCP_APP_BUNDLE}</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const APP_STYLES = `
:root {
  color-scheme: light dark;
  --app-bg: var(--color-background-secondary, #f3f5f8);
  --panel: var(--color-background-primary, #ffffff);
  --panel-2: var(--color-background-tertiary, #eef2f7);
  --text: var(--color-text-primary, #17202a);
  --muted: var(--color-text-secondary, #637083);
  --border: var(--color-border-primary, #dce2ea);
  --accent: var(--color-text-info, #1769e0);
  --success: var(--color-text-success, #14804a);
  --warning: var(--color-text-warning, #9a6500);
  --danger: var(--color-text-danger, #b42318);
  --radius: var(--border-radius-lg, 14px);
  font-family: var(--font-sans, Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--app-bg); color: var(--text); }
button, input { font: inherit; }
button { border: 1px solid var(--border); border-radius: 9px; padding: 8px 12px; background: var(--panel); color: var(--text); cursor: pointer; }
button:hover { border-color: var(--accent); }
button:disabled { opacity: .55; cursor: not-allowed; }
button.danger { color: var(--danger); }
input { min-width: 0; border: 1px solid var(--border); border-radius: 9px; padding: 10px 12px; background: var(--panel); color: var(--text); }
#app { max-width: 1180px; margin: 0 auto; padding: 18px; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.topbar h1 { margin: 0; font-size: 24px; line-height: 1.25; }
.topbar p { margin: 6px 0 0; color: var(--muted); }
.eyebrow { margin: 0 0 4px !important; color: var(--accent) !important; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.connection { padding: 5px 10px; border: 1px solid var(--border); border-radius: 999px; color: var(--success); background: var(--panel); font-size: 12px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.04)); }
.panel h2 { margin: 0 0 12px; font-size: 16px; }
.panel h3 { margin: 16px 0 6px; font-size: 13px; }
.panel p { line-height: 1.55; }
.toolbar { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.toolbar form { display: flex; flex: 1; gap: 8px; }
.toolbar input[type="text"], .toolbar input:not([type]) { flex: 1; }
.toolbar-actions { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; }
.notice { margin: 0 0 12px; border: 1px solid var(--border); border-radius: 9px; padding: 9px 12px; color: var(--muted); background: var(--panel); }
.memory-layout { display: grid; grid-template-columns: minmax(280px, 38%) minmax(0, 1fr); gap: 12px; }
.list { min-height: 420px; }
.section-head { display: flex; align-items: center; justify-content: space-between; color: var(--muted); }
.memory-list { display: grid; gap: 8px; max-height: 690px; overflow: auto; padding-right: 3px; }
.memory-card { display: block; width: 100%; text-align: left; padding: 12px; }
.card-head, .meta-line, .tags, .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.card-head { justify-content: space-between; }
.summary { display: block; margin: 7px 0; color: var(--muted); line-height: 1.45; }
.meta-line { font-size: 11px; color: var(--muted); }
.tag { border-radius: 999px; padding: 2px 7px; background: var(--panel-2); color: var(--muted); font-size: 11px; }
.pill { display: inline-flex; align-items: center; width: fit-content; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 650; background: var(--panel-2); }
.pill.ok { color: var(--success); }
.pill.warn { color: var(--warning); }
.pill.bad { color: var(--danger); }
.detail.empty { display: grid; min-height: 420px; place-items: center; text-align: center; color: var(--muted); }
.detail-title { display: flex; justify-content: space-between; gap: 12px; }
.detail-title h2 { margin-bottom: 4px; }
.detail-title p { margin: 0; color: var(--muted); }
.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 14px 0; }
.facts div { padding: 10px; border-radius: 10px; background: var(--panel-2); }
.facts dt { color: var(--muted); font-size: 11px; }
.facts dd { margin: 3px 0 0; overflow-wrap: anywhere; }
pre { max-height: 390px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; padding: 12px; border-radius: 10px; background: #0d1726; color: #e5edf7; font: 12px/1.5 var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace); }
.dashboard { display: grid; grid-template-columns: minmax(260px, 36%) minmax(0, 1fr); gap: 12px; }
.timeline { display: grid; gap: 9px; }
.step { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; padding: 10px; border: 1px solid var(--border); border-radius: 10px; }
.step > span { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 50%; background: var(--panel-2); color: var(--accent); font-size: 11px; }
.step p { margin: 4px 0 0; color: var(--muted); }
.empty-state { padding: 24px 10px; text-align: center; color: var(--muted); }
@media (max-width: 760px) {
  #app { padding: 12px; }
  .toolbar, .topbar { flex-direction: column; }
  .toolbar form { width: 100%; }
  .memory-layout, .dashboard { grid-template-columns: 1fr; }
  .memory-list { max-height: 430px; }
}
`;
