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
  --app-bg: var(--color-background-secondary, #f5f7fb);
  --panel: var(--color-background-primary, #ffffff);
  --panel-soft: var(--color-background-tertiary, #f0f3f8);
  --panel-hover: color-mix(in srgb, var(--panel-soft) 72%, var(--panel));
  --text: var(--color-text-primary, #121926);
  --muted: var(--color-text-secondary, #667085);
  --subtle: var(--color-text-tertiary, #98a2b3);
  --border: var(--color-border-primary, #d9e0ea);
  --border-strong: color-mix(in srgb, var(--border) 72%, var(--text));
  --accent: var(--color-text-info, #2563eb);
  --accent-soft: var(--color-background-info, color-mix(in srgb, var(--accent) 10%, var(--panel)));
  --accent-border: var(--color-border-info, color-mix(in srgb, var(--accent) 28%, var(--border)));
  --focus-ring: var(--color-ring-info, color-mix(in srgb, var(--accent) 24%, transparent));
  --success: var(--color-text-success, #087443);
  --success-soft: color-mix(in srgb, var(--success) 10%, var(--panel));
  --warning: var(--color-text-warning, #a15c00);
  --warning-soft: color-mix(in srgb, var(--warning) 10%, var(--panel));
  --danger: var(--color-text-danger, #b42318);
  --danger-soft: color-mix(in srgb, var(--danger) 9%, var(--panel));
  --radius-lg: var(--border-radius-xl, 14px);
  --radius-md: var(--border-radius-lg, 10px);
  --radius-sm: var(--border-radius-md, 8px);
  --shadow: var(--shadow-sm, 0 3px 12px rgba(16, 24, 40, .05), 0 1px 2px rgba(16, 24, 40, .03));
  font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
}
* { box-sizing: border-box; }
html { background: var(--app-bg); }
body { container-name: mcp-app; container-type: inline-size; margin: 0; overflow-x: hidden; background: var(--app-bg); color: var(--text); font-size: 12px; line-height: 1.42; }
button, input { font: inherit; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 26px; border: 1px solid var(--border); border-radius: 7px; padding: 3px 7px; background: var(--panel); color: var(--text); font-size: 10.5px; font-weight: 600; line-height: 1.2; cursor: pointer; transition: border-color .16s ease, background .16s ease, transform .16s ease; }
button:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: var(--panel-hover); }
button:active { transform: translateY(1px); }
button:disabled { opacity: .52; cursor: not-allowed; }
button.primary { border-color: var(--accent); background: var(--accent); color: var(--color-text-inverse, #fff); box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 22%, transparent); }
button.primary:hover { background: color-mix(in srgb, var(--accent) 88%, #000); }
button.danger { color: var(--danger); }
button.text-button { min-height: auto; padding: 2px 0; border: 0; background: transparent; color: var(--accent); font-size: 10.5px; }
button.text-button:hover { background: transparent; text-decoration: underline; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
input { min-width: 0; border: 0; outline: 0; padding: 6px; background: transparent; color: var(--text); font-size: 11.5px; }
input::placeholder { color: var(--subtle); }
#app { width: 100%; min-width: 0; max-width: 1080px; margin: 0 auto; padding: 6px; }
.icon { width: 16px; height: 16px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.app-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin: 0 0 10px; }
.app-header h1 { margin: 0; font-size: clamp(18px, 2.2vw, 20px); line-height: 1.18; letter-spacing: -.025em; }
.app-header p { max-width: 760px; margin: 3px 0 0; color: var(--muted); font-size: 11px; line-height: 1.38; }
.brand-block { display: flex; align-items: center; gap: 10px; }
.app-mark { display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid var(--accent-border); border-radius: 11px; background: var(--accent-soft); color: var(--accent); }
.app-mark .icon { width: 19px; height: 19px; }
.eyebrow, .section-kicker { margin: 0 0 2px !important; color: var(--accent) !important; font-size: 8px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
.connection { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; border: 1px solid var(--border); border-radius: 999px; padding: 4px 8px; background: var(--panel); color: var(--muted); font-size: 11px; box-shadow: 0 1px 2px rgba(16,24,40,.03); }
.connection > span { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 9px; padding: 8px; box-shadow: var(--shadow); }
.panel h2 { margin: 0; font-size: 14px; line-height: 1.32; letter-spacing: -.008em; }
.panel h3 { margin: 10px 0 5px; font-size: 11px; }
.panel p { font-size: 11.5px; line-height: 1.45; }
.notice { margin: 0 0 5px; border: 1px solid var(--accent-border); border-radius: 7px; padding: 4px 7px; color: var(--muted); background: var(--accent-soft); font-size: 10.5px; }
.pill { display: inline-flex; align-items: center; width: fit-content; flex: 0 0 auto; border-radius: 999px; padding: 3px 7px; font-size: 9px; font-weight: 700; line-height: 1.25; background: var(--panel-soft); }
.pill.ok { color: var(--success); background: var(--success-soft); }
.pill.warn { color: var(--warning); background: var(--warning-soft); }
.pill.bad { color: var(--danger); background: var(--danger-soft); }
.status-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--subtle); }
.status-dot.ok { background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
.status-dot.warn { background: var(--warning); box-shadow: 0 0 0 3px var(--warning-soft); }
.status-dot.bad { background: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }
.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; color: var(--muted); }
.section-head > span { font-size: 10.5px; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.actions.stacked { display: grid; grid-template-columns: 1fr 1fr; }
.actions.stacked .primary { grid-column: 1 / -1; }

.minimal-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
.minimal-header h1 { min-width: 0; overflow: hidden; margin: 0; color: var(--text); text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 1.25; font-weight: 650; }
.minimal-header > span { flex: 0 0 auto; color: var(--muted); font-size: 10px; font-weight: 650; }
.gate-state.ok { color: var(--success); }
.gate-state.bad { color: var(--danger); }
.task-shell { padding: 7px; }
.task-current { margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--border); }
.task-current h2 { margin: 0; font-size: 12.5px; line-height: 1.3; }
.task-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.task-actions-end { justify-content: flex-end; margin-top: 6px; padding-top: 5px; border-top: 1px solid var(--border); }
.task-actions button { min-height: 24px; }
.compact-outputs { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
.compact-outputs span { border: 1px solid var(--border); border-radius: 999px; padding: 2px 5px; background: var(--panel-soft); color: var(--muted); font-size: 9px; }
.memory-meta { display: flex; flex-wrap: wrap; gap: 4px 8px; margin: 3px 0 5px; color: var(--subtle); font-size: 9.5px; }
.detail-extra { margin-top: 6px; }
.detail-extra summary { font-size: 10px; }
.inline-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; margin: 0 0 5px; }
.inline-facts div { min-width: 0; display: flex; gap: 5px; padding: 4px 6px; border-radius: 6px; background: var(--panel-soft); }
.inline-facts dt { flex: 0 0 auto; color: var(--subtle); font-size: 9px; }
.inline-facts dd { min-width: 0; margin: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.gate-compact { display: grid; gap: 6px; }
.gate-section + .gate-section { padding-top: 6px; border-top: 1px solid var(--border); }
.gate-section h2 { margin: 0 0 4px; font-size: 11px; }
.gate-footer { display: flex; align-items: center; justify-content: space-between; gap: 7px; padding-top: 6px; border-top: 1px solid var(--border); color: var(--muted); font-size: 9.5px; }
.gate-clear { padding: 8px; color: var(--success); text-align: center; font-weight: 650; }

.memory-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px; margin-bottom: 5px; padding: 5px; }
.search-box { display: flex; align-items: center; min-width: 0; border: 1px solid var(--border); border-radius: 7px; padding-left: 6px; background: var(--panel-soft); }
.search-box:focus-within { border-color: var(--accent-border); box-shadow: 0 0 0 3px var(--focus-ring); }
.search-box input { flex: 1; }
.search-box button { min-height: 22px; margin: 2px; }
.toolbar-actions { display: flex; align-items: center; gap: 5px; }
.check-control { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10.5px; white-space: nowrap; }
.check-control input { width: 15px; height: 15px; accent-color: var(--accent); }
.memory-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
.memory-stats > div { display: flex; align-items: baseline; gap: 6px; border: 1px solid var(--border); border-radius: 9px; padding: 7px 10px; background: color-mix(in srgb, var(--panel) 84%, var(--app-bg)); }
.memory-stats strong { font-size: 16px; }
.memory-stats span { color: var(--muted); font-size: 10px; }
.memory-layout { display: grid; grid-template-columns: minmax(260px, 34%) minmax(0, 1fr); align-items: start; gap: 5px; }
.memory-index { padding: 6px; }
.memory-list { display: grid; gap: 3px; }
.memory-card { display: block; width: 100%; min-height: 0; padding: 6px; border-color: transparent; background: var(--panel-soft); text-align: left; font-weight: 400; }
.memory-card:hover { border-color: color-mix(in srgb, var(--accent) 28%, var(--border)); background: var(--panel-hover); }
.memory-card.selected { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent); }
.card-head, .meta-line, .tags { display: flex; align-items: center; gap: 8px; }
.card-head { justify-content: space-between; }
.card-head strong { min-width: 0; overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.summary { display: -webkit-box; overflow: hidden; margin: 2px 0 3px; color: var(--muted); line-height: 1.32; font-size: 10.5px; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
.meta-line { justify-content: space-between; color: var(--subtle); font-size: 10px; }
.tags { min-width: 0; flex-wrap: wrap; margin-top: 6px; }
.tag { max-width: 132px; overflow: hidden; border-radius: 999px; padding: 3px 7px; background: color-mix(in srgb, var(--panel) 70%, var(--panel-soft)); color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.load-more { width: 100%; margin-top: 6px; border-style: dashed; color: var(--accent); }
.memory-detail { position: sticky; top: 5px; min-height: 0; }
.empty-detail { display: grid; place-items: center; align-content: center; gap: 8px; text-align: center; color: var(--muted); }
.empty-detail p { max-width: 360px; margin: 6px auto 0; }
.empty-visual { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 12px; background: var(--panel-soft); color: var(--subtle); }
.empty-visual .icon { width: 21px; height: 21px; }
.detail-title { display: flex; justify-content: space-between; gap: 10px; }
.detail-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.detail-title h2 { font-size: 17px; }
.detail-title p { margin: 4px 0 0; color: var(--muted); }
.lifecycle-status { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10px; font-weight: 650; }
.lifecycle-status > span { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }
.lifecycle-status.ok { color: var(--success); }
.lifecycle-status.ok > span { background: var(--success); }
.lifecycle-status.warn { color: var(--warning); }
.lifecycle-status.warn > span { background: var(--warning); }
.lifecycle-status.bad { color: var(--danger); }
.lifecycle-status.bad > span { background: var(--danger); }
.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 10px 0; }
.facts.compact div { min-height: 50px; padding: 7px 9px; border: 1px solid color-mix(in srgb, var(--border) 70%, transparent); border-radius: 9px; background: var(--panel-soft); }
.facts dt { color: var(--muted); font-size: 9px; }
.facts dd { margin: 2px 0 0; overflow-wrap: anywhere; font-size: 11px; font-weight: 650; }
.detail-tags { margin: 0 0 4px; }
.content-section { padding-top: 10px; border-top: 1px solid var(--border); }
.content-section + .content-section { margin-top: 10px; }
.content-section h3 { margin: 0 0 5px; }
.content-section p { margin: 0; color: var(--muted); }
.document-body { max-height: 240px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--border); border-radius: 7px; padding: 7px; background: var(--panel-soft); color: var(--text); font: 11px/1.42 var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace); }
.evidence-list, .blocker-list { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.evidence-list li, .blocker-list li { display: flex; align-items: flex-start; gap: 8px; border-radius: 8px; padding: 7px 9px; background: var(--panel-soft); color: var(--muted); font-size: 12px; line-height: 1.45; }
.evidence-list .icon { color: var(--success); }
.blocker-list .icon { color: var(--danger); }
.detail-actions { display: flex; justify-content: flex-end; gap: 5px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
.empty-state { display: grid; justify-items: center; gap: 5px; padding: 18px 10px; color: var(--muted); text-align: center; }
.empty-state .icon { width: 26px; height: 26px; color: var(--subtle); }
.empty-state strong { color: var(--text); }
.empty-state span { max-width: 340px; font-size: 12px; }

.workbench-header .objective { display: -webkit-box; overflow: hidden; max-width: 850px; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.42; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.workbench-header .objective.expanded { display: block; }
.progress-panel { margin-bottom: 8px; padding: 10px; }
.progress-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.progress-head > div { display: flex; align-items: baseline; gap: 6px; }
.progress-head span { color: var(--muted); font-size: 10px; }
.progress-head strong { font-size: 13px; }
.progress-bar { height: 4px; overflow: hidden; border-radius: 999px; background: var(--panel-soft); }
.progress-bar > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .35s ease; }
.stepper { display: grid; grid-template-columns: repeat(var(--step-count), minmax(62px, 1fr)); overflow-x: auto; padding-bottom: 2px; }
.step-node { position: relative; min-width: 62px; padding: 0 2px; text-align: center; }
.step-track { position: relative; display: grid; place-items: center; height: 21px; }
.step-track::before, .step-track::after { content: ''; position: absolute; top: 50%; width: 50%; height: 2px; background: var(--border); transform: translateY(-50%); }
.step-track::before { left: 0; }
.step-track::after { right: 0; }
.step-node:first-child .step-track::before, .step-node:last-child .step-track::after { display: none; }
.step-track span { position: relative; z-index: 1; display: grid; width: 19px; height: 19px; place-items: center; border: 2px solid var(--border); border-radius: 50%; background: var(--panel); color: var(--subtle); font-size: 9px; font-weight: 750; }
.step-node strong { display: block; overflow: hidden; margin-top: 2px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font-size: 9.5px; }
.step-node small { display: none; }
.step-node.completed .step-track::before, .step-node.completed .step-track::after, .step-node.running .step-track::before { background: var(--accent); }
.step-node.completed .step-track span { border-color: var(--accent); background: var(--accent); color: #fff; }
.step-node.completed strong { color: var(--text); }
.step-node.running .step-track span { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.step-node.running strong { color: var(--accent); }
.step-node.blocked .step-track span { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }
.step-node.blocked strong { color: var(--danger); }
.step-node.skipped .step-track span { border-color: var(--warning); color: var(--warning); }
.workbench-grid { display: grid; grid-template-columns: minmax(240px, 30%) minmax(0, 1fr); align-items: start; gap: 8px; }
.plan-overview h2 { margin-top: 2px; font-size: 15px; }
.plan-chips, .evidence-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.plan-chips span, .evidence-chips span { border: 1px solid var(--border); border-radius: 999px; padding: 3px 7px; background: var(--panel-soft); color: var(--muted); font-size: 10px; }
.evidence-chips span.complete { color: var(--success); background: var(--success-soft); }
.plan-id { display: grid; grid-template-columns: 1fr auto; gap: 5px 7px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); }
.plan-id > span { grid-column: 1 / -1; color: var(--muted); font-size: 10px; }
.plan-id code { align-self: center; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.plan-id button { min-height: 30px; padding: 5px 9px; font-size: 10px; }
.current-step { min-height: 0; }
.step-command { display: flex; align-items: center; gap: 6px; margin-top: 4px; border: 1px solid var(--border); border-radius: 7px; padding: 5px 7px; background: var(--panel-soft); }
.step-command span { color: var(--muted); font-size: 10px; }
.step-command code { color: var(--accent); font-size: 11px; font-weight: 700; }
.step-note { margin: 8px 0 0; color: var(--muted); }
.output-list { margin-top: 10px; }
.output-list h3 { margin-top: 0; }
.output-list > div { display: flex; align-items: flex-start; gap: 5px; padding: 3px 0; color: var(--muted); font-size: 11px; }
.output-list .icon { color: var(--success); }
.compact-empty { min-height: 90px; align-content: center; }

.product-grid, .convergence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 8px; }
details { margin-top: 10px; }
summary { color: var(--accent); cursor: pointer; font-size: 12px; }
pre { max-height: 280px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0 0; border-radius: 9px; padding: 9px; background: #111827; color: #e5e7eb; font: 11px/1.55 var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace); }
.compact-timeline { display: grid; gap: 3px; margin-top: 5px; }
.compact-timeline > div { display: grid; grid-template-columns: 22px 1fr; align-items: start; gap: 5px; border: 1px solid var(--border); border-radius: 7px; padding: 5px; }
.compact-timeline > div > span { display: grid; width: 21px; height: 21px; place-items: center; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 10px; }
.compact-timeline p { display: grid; gap: 2px; margin: 0; }
.compact-timeline small { color: var(--muted); }
.convergence-hero { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-bottom: 8px; }
.convergence-hero.passed { border-color: color-mix(in srgb, var(--success) 28%, var(--border)); }
.convergence-hero.blocked { border-color: color-mix(in srgb, var(--danger) 24%, var(--border)); }
.gate-icon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 11px; }
.passed .gate-icon { background: var(--success-soft); color: var(--success); }
.blocked .gate-icon { background: var(--danger-soft); color: var(--danger); }
.gate-icon .icon { width: 20px; height: 20px; }
.convergence-hero h2 { margin: 1px 0 3px; }
.convergence-hero p { margin: 0; color: var(--muted); }
.gate-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.gate-actions button { min-height: 26px; padding: 4px 7px; font-size: 10.5px; }
.convergence-hero dl { display: flex; gap: 6px; margin: 0; }
.convergence-hero dl div { min-width: 68px; border-left: 1px solid var(--border); padding-left: 9px; }
.convergence-hero dt { color: var(--muted); font-size: 9px; }
.convergence-hero dd { margin: 2px 0 0; font-size: 12px; font-weight: 700; }

@media (max-width: 900px) {
  #app { padding: 10px; }
  .memory-layout, .workbench-grid, .product-grid, .convergence-grid { grid-template-columns: 1fr; }
  .memory-detail { position: static; min-height: 0; }
  .current-step { min-height: 0; }
  .convergence-hero { grid-template-columns: auto minmax(0, 1fr); }
  .convergence-hero dl { grid-column: 1 / -1; }
}
@media (max-width: 660px) {
  #app { padding: 6px; }
  .app-header, .brand-block { align-items: flex-start; }
  .app-header { flex-direction: column; gap: 12px; margin-bottom: 14px; }
  .app-header > *, .section-head > *, .panel, .memory-layout > *, .workbench-grid > *, .product-grid > *, .convergence-grid > * { min-width: 0; }
  .memory-toolbar { grid-template-columns: 1fr; }
  .toolbar-actions { justify-content: space-between; flex-wrap: wrap; }
  .memory-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .memory-stats > div { display: grid; justify-items: center; gap: 2px; padding: 10px 6px; text-align: center; }
  .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .actions.stacked { grid-template-columns: 1fr 1fr; }
  .actions.stacked .primary { grid-column: 1 / -1; }
  .stepper { display: grid; grid-template-columns: 1fr; gap: 0; overflow: visible; padding-bottom: 0; }
  .step-node { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; min-width: 0; padding: 2px 0; text-align: left; }
  .step-track { grid-column: 1; height: 30px; }
  .step-track::before, .step-track::after { left: 50%; right: auto; width: 2px; height: 50%; transform: translateX(-50%); }
  .step-track::before { top: 0; }
  .step-track::after { top: 50%; }
  .step-node strong { grid-column: 2; overflow: visible; margin: 0; padding-right: 8px; text-overflow: clip; white-space: normal; }
  .step-node small { display: none; }
  .step-command { flex-wrap: wrap; }
  .step-command code { min-width: 0; overflow-wrap: anywhere; }
  .convergence-hero dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; }
  .convergence-hero dl div { min-width: 0; }
}
@media (max-width: 460px) {
  #app { padding: 6px; }
  .panel { border-radius: 10px; padding: 10px; }
  .app-header { margin-top: 0; }
  .app-header h1 { font-size: 17px; }
  .brand-block { gap: 10px; }
  .app-mark { width: 32px; height: 32px; border-radius: 9px; }
  .app-mark .icon { width: 17px; height: 17px; }
  .connection { padding: 5px 8px; }
  .memory-toolbar { padding: 6px; }
  .search-box { padding-left: 8px; }
  .search-box input { width: 100%; padding-inline: 5px; }
  .search-box button { padding-inline: 10px; }
  .toolbar-actions { display: grid; grid-template-columns: 1fr; align-items: stretch; }
  .toolbar-actions button { width: 100%; }
  .check-control { justify-content: center; padding: 4px 0; }
  .memory-stats { gap: 6px; }
  .memory-stats strong { font-size: 16px; }
  .memory-stats span { font-size: 9px; }
  .memory-index { padding: 8px; }
  .detail-title { flex-direction: column; gap: 10px; }
  .detail-title h2 { font-size: 18px; }
  .facts { grid-template-columns: 1fr; }
  .document-body { max-height: 280px; padding: 11px; }
  .detail-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .progress-panel { padding: 9px; }
  .progress-head > div { gap: 6px; }
  .plan-id { grid-template-columns: minmax(0, 1fr) auto; }
  .actions { display: grid; grid-template-columns: 1fr; align-items: stretch; }
  .actions.stacked { display: grid; grid-template-columns: 1fr 1fr; align-items: stretch; }
  .actions.stacked .primary { grid-column: 1 / -1; }
  .actions button, .actions.stacked button { width: 100%; }
  .current-step, .compact-empty { min-height: 0; }
  .convergence-hero { grid-template-columns: 1fr; gap: 12px; }
  .gate-icon { width: 36px; height: 36px; border-radius: 10px; }
  .convergence-hero dl { grid-column: auto; gap: 4px; }
  .gate-actions { display: grid; grid-template-columns: 1fr; }
  .gate-actions button { width: 100%; }
  .convergence-hero dl div { padding-left: 8px; }
  .convergence-hero dd { font-size: 12px; }
  pre { max-height: 280px; }
}

@container mcp-app (max-width: 900px) {
  #app { padding: 10px; }
  .memory-layout, .workbench-grid, .product-grid, .convergence-grid { grid-template-columns: 1fr; }
  .memory-detail { position: static; min-height: 0; }
  .current-step { min-height: 0; }
  .convergence-hero { grid-template-columns: auto minmax(0, 1fr); }
  .convergence-hero dl { grid-column: 1 / -1; }
}
@container mcp-app (max-width: 660px) {
  #app { padding: 6px; }
  .app-header, .brand-block { align-items: flex-start; }
  .app-header { flex-direction: column; gap: 12px; margin-bottom: 14px; }
  .app-header > *, .section-head > *, .panel, .memory-layout > *, .workbench-grid > *, .product-grid > *, .convergence-grid > * { min-width: 0; }
  .memory-toolbar { grid-template-columns: 1fr; }
  .toolbar-actions { justify-content: space-between; flex-wrap: wrap; }
  .memory-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .memory-stats > div { display: grid; justify-items: center; gap: 2px; padding: 10px 6px; text-align: center; }
  .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .actions.stacked { grid-template-columns: 1fr 1fr; }
  .actions.stacked .primary { grid-column: 1 / -1; }
  .stepper { display: grid; grid-template-columns: 1fr; gap: 0; overflow: visible; padding-bottom: 0; }
  .step-node { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; min-width: 0; padding: 2px 0; text-align: left; }
  .step-track { grid-column: 1; height: 30px; }
  .step-track::before, .step-track::after { left: 50%; right: auto; width: 2px; height: 50%; transform: translateX(-50%); }
  .step-track::before { top: 0; }
  .step-track::after { top: 50%; }
  .step-node strong { grid-column: 2; overflow: visible; margin: 0; padding-right: 8px; text-overflow: clip; white-space: normal; }
  .step-node small { display: none; }
  .step-command { flex-wrap: wrap; }
  .step-command code { min-width: 0; overflow-wrap: anywhere; }
  .convergence-hero dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; }
  .convergence-hero dl div { min-width: 0; }
}
@container mcp-app (max-width: 460px) {
  #app { padding: 6px; }
  .panel { border-radius: 10px; padding: 10px; }
  .app-header { margin-top: 0; }
  .app-header h1 { font-size: 17px; }
  .brand-block { gap: 10px; }
  .app-mark { width: 32px; height: 32px; border-radius: 9px; }
  .app-mark .icon { width: 17px; height: 17px; }
  .connection { padding: 5px 8px; }
  .memory-toolbar { padding: 6px; }
  .search-box { padding-left: 8px; }
  .search-box input { width: 100%; padding-inline: 5px; }
  .search-box button { padding-inline: 10px; }
  .toolbar-actions { display: grid; grid-template-columns: 1fr; align-items: stretch; }
  .toolbar-actions button { width: 100%; }
  .check-control { justify-content: center; padding: 4px 0; }
  .memory-stats { gap: 6px; }
  .memory-stats strong { font-size: 16px; }
  .memory-stats span { font-size: 9px; }
  .memory-index { padding: 8px; }
  .detail-title { flex-direction: column; gap: 10px; }
  .detail-title h2 { font-size: 18px; }
  .facts { grid-template-columns: 1fr; }
  .document-body { max-height: 280px; padding: 11px; }
  .detail-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .progress-panel { padding: 9px; }
  .progress-head > div { gap: 6px; }
  .plan-id { grid-template-columns: minmax(0, 1fr) auto; }
  .actions { display: grid; grid-template-columns: 1fr; align-items: stretch; }
  .actions.stacked { display: grid; grid-template-columns: 1fr 1fr; align-items: stretch; }
  .actions.stacked .primary { grid-column: 1 / -1; }
  .actions button, .actions.stacked button { width: 100%; }
  .current-step, .compact-empty { min-height: 0; }
  .convergence-hero { grid-template-columns: 1fr; gap: 12px; }
  .gate-icon { width: 36px; height: 36px; border-radius: 10px; }
  .convergence-hero dl { grid-column: auto; gap: 4px; }
  .gate-actions { display: grid; grid-template-columns: 1fr; }
  .gate-actions button { width: 100%; }
  .convergence-hero dl div { padding-left: 8px; }
  .convergence-hero dd { font-size: 12px; }
  pre { max-height: 280px; }
}


/* Compact embedded-tool layout: status, current work, action, evidence. */
.compact-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; margin: 0 0 7px; }
.header-title { display: flex; align-items: baseline; min-width: 0; gap: 8px; }
.header-title h1 { flex: 0 0 auto; margin: 0; font-size: 15px; line-height: 1.2; letter-spacing: -.015em; }
.header-title > span { min-width: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; }
.header-meta { display: flex; align-items: center; flex: 0 0 auto; gap: 7px; }
.header-meta strong { font-size: 11px; font-variant-numeric: tabular-nums; }

.memory-index > .memory-list { margin-top: 0; }
.memory-detail.empty-detail { min-height: 96px; padding: 12px; }
.memory-meta { display: flex; flex-wrap: wrap; gap: 4px 9px; margin-top: 5px; color: var(--subtle); font-size: 9.5px; }
.detail-summary { display: -webkit-box; overflow: hidden; margin: 7px 0; color: var(--muted); font-size: 10.5px !important; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.detail-extra { margin-top: 7px; }
.detail-extra summary { color: var(--muted); font-size: 10px; }
.detail-extra > p { margin: 6px 0; color: var(--muted); }
.detail-extra .evidence-list { margin-top: 6px; }

.task-shell { padding: 9px; }
.progress-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; }
.progress-line > span { color: var(--muted); font-size: 9px; font-variant-numeric: tabular-nums; }
.task-shell .stepper { margin-top: 6px; }
.task-current { margin-top: 7px; border-top: 1px solid var(--border); padding-top: 7px; }
.task-current .section-head { align-items: center; }
.task-current .step-command { margin-top: 5px; border: 0; padding: 5px 7px; }
.task-current .step-command span { min-width: 0; overflow-wrap: anywhere; }
.compact-outputs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.compact-outputs span { border: 1px solid var(--border); border-radius: 999px; padding: 2px 6px; background: var(--panel-soft); color: var(--muted); font-size: 9px; }
.task-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; border-top: 1px solid var(--border); padding-top: 7px; }
.task-meta { display: flex; align-items: center; min-width: 0; gap: 5px; color: var(--subtle); font-size: 9px; }
.task-meta > span { flex: 0 0 auto; }
.task-meta code { min-width: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font: 9px/1.3 var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace); }
.task-meta button { min-height: 22px; flex: 0 0 auto; padding: 2px 5px; font-size: 9px; }
.task-actions { display: flex; align-items: center; flex: 0 0 auto; gap: 5px; margin-left: auto; }
.task-actions button { min-height: 24px; padding: 3px 7px; font-size: 10px; }

.product-compact { padding: 9px; }
.inline-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; margin: 0 0 7px; }
.inline-facts > div { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px; border-radius: 7px; padding: 5px 7px; background: var(--panel-soft); }
.inline-facts dt { color: var(--subtle); font-size: 9px; }
.inline-facts dd { min-width: 0; margin: 0; overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; }
.product-compact .compact-timeline { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 0; }
.product-compact .compact-timeline > div { padding: 5px 6px; }
.product-compact details { margin: 0; }
.product-compact details > summary { color: var(--muted); font-size: 9.5px; }

.gate-compact { padding: 9px; }
.gate-summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.gate-summary > strong { min-width: 0; font-size: 11.5px; font-weight: 650; }
.gate-summary .task-actions { margin-left: 0; }
.gate-metrics { display: flex; flex-wrap: wrap; gap: 5px 12px; margin-top: 7px; border-top: 1px solid var(--border); padding-top: 7px; color: var(--muted); font-size: 9.5px; }
.gate-metrics strong { color: var(--text); font-size: 10.5px; }
.gate-section { margin-top: 7px; border-top: 1px solid var(--border); padding-top: 7px; }
.gate-section h2 { margin: 0 0 5px; font-size: 11px; }
.gate-section .evidence-chips { margin-top: 4px; }
.gate-section .blocker-list li { padding: 5px 7px; font-size: 10.5px; }

@media (max-width: 660px) {
  .compact-header { align-items: center; }
  .product-compact .compact-timeline { grid-template-columns: 1fr; }
  .task-footer { align-items: flex-start; flex-direction: column; }
  .task-actions { width: 100%; margin-left: 0; }
  .task-actions button { flex: 1 1 0; }
  .gate-summary { align-items: flex-start; flex-direction: column; }
}
@media (max-width: 460px) {
  .compact-header { gap: 6px; }
  .header-title { display: grid; gap: 1px; }
  .header-title h1 { font-size: 14px; }
  .header-title > span { max-width: 270px; font-size: 9.5px; }
  .header-meta { gap: 5px; }
  .memory-toolbar { grid-template-columns: minmax(0, 1fr) auto; }
  .toolbar-actions { display: flex; align-items: center; gap: 5px; }
  .toolbar-actions button { width: auto; }
  .check-control { padding: 0; }
  .task-meta { width: 100%; flex-wrap: wrap; }
  .task-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .task-actions button { width: 100%; }
  .inline-facts { grid-template-columns: 1fr; }
  .gate-summary .task-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@container mcp-app (max-width: 660px) {
  .product-compact .compact-timeline { grid-template-columns: 1fr; }
  .task-footer { align-items: flex-start; flex-direction: column; }
  .task-actions { width: 100%; margin-left: 0; }
  .task-actions button { flex: 1 1 0; }
  .gate-summary { align-items: flex-start; flex-direction: column; }
}
@container mcp-app (max-width: 460px) {
  .header-title { display: grid; gap: 1px; }
  .header-title h1 { font-size: 14px; }
  .header-title > span { max-width: 270px; font-size: 9.5px; }
  .memory-toolbar { grid-template-columns: minmax(0, 1fr) auto; }
  .toolbar-actions { display: flex; align-items: center; gap: 5px; }
  .toolbar-actions button { width: auto; }
  .check-control { padding: 0; }
  .task-meta { width: 100%; flex-wrap: wrap; }
  .task-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .task-actions button { width: 100%; }
  .inline-facts { grid-template-columns: 1fr; }
  .gate-summary .task-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

`;
