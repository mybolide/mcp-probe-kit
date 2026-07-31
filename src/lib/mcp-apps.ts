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
  --accent-soft: color-mix(in srgb, var(--accent) 10%, var(--panel));
  --success: var(--color-text-success, #087443);
  --success-soft: color-mix(in srgb, var(--success) 10%, var(--panel));
  --warning: var(--color-text-warning, #a15c00);
  --warning-soft: color-mix(in srgb, var(--warning) 10%, var(--panel));
  --danger: var(--color-text-danger, #b42318);
  --danger-soft: color-mix(in srgb, var(--danger) 9%, var(--panel));
  --radius-lg: 18px;
  --radius-md: 12px;
  --shadow: 0 10px 30px rgba(16, 24, 40, .06), 0 1px 3px rgba(16, 24, 40, .04);
  font-family: var(--font-sans, Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
}
* { box-sizing: border-box; }
html { background: var(--app-bg); }
body { margin: 0; background: var(--app-bg); color: var(--text); }
button, input { font: inherit; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 38px; border: 1px solid var(--border); border-radius: 10px; padding: 8px 14px; background: var(--panel); color: var(--text); font-weight: 600; cursor: pointer; transition: border-color .16s ease, background .16s ease, transform .16s ease; }
button:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: var(--panel-hover); }
button:active { transform: translateY(1px); }
button:disabled { opacity: .52; cursor: not-allowed; }
button.primary { border-color: var(--accent); background: var(--accent); color: #fff; box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 22%, transparent); }
button.primary:hover { background: color-mix(in srgb, var(--accent) 88%, #000); }
button.danger { color: var(--danger); }
button.text-button { min-height: auto; padding: 4px 0; border: 0; background: transparent; color: var(--accent); font-size: 12px; }
button.text-button:hover { background: transparent; text-decoration: underline; }
input { min-width: 0; border: 0; outline: 0; padding: 10px 8px; background: transparent; color: var(--text); }
input::placeholder { color: var(--subtle); }
#app { max-width: 1120px; margin: 0 auto; padding: 22px; }
.icon { width: 18px; height: 18px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.app-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 22px; margin: 2px 0 18px; }
.app-header h1 { margin: 0; font-size: clamp(24px, 3.4vw, 32px); line-height: 1.16; letter-spacing: -.03em; }
.app-header p { max-width: 760px; margin: 7px 0 0; color: var(--muted); line-height: 1.55; }
.brand-block { display: flex; align-items: center; gap: 14px; }
.app-mark { display: grid; width: 44px; height: 44px; place-items: center; border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border)); border-radius: 14px; background: var(--accent-soft); color: var(--accent); }
.app-mark .icon { width: 23px; height: 23px; }
.eyebrow, .section-kicker { margin: 0 0 5px !important; color: var(--accent) !important; font-size: 10px; font-weight: 750; letter-spacing: .13em; text-transform: uppercase; }
.connection { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; border: 1px solid var(--border); border-radius: 999px; padding: 6px 10px; background: var(--panel); color: var(--muted); font-size: 12px; box-shadow: 0 1px 2px rgba(16,24,40,.03); }
.connection > span { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; box-shadow: var(--shadow); }
.panel h2 { margin: 0; font-size: 17px; line-height: 1.35; letter-spacing: -.01em; }
.panel h3 { margin: 18px 0 8px; font-size: 13px; }
.panel p { line-height: 1.62; }
.notice { margin: 0 0 14px; border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border)); border-radius: 11px; padding: 10px 13px; color: var(--muted); background: var(--accent-soft); font-size: 13px; }
.pill { display: inline-flex; align-items: center; width: fit-content; flex: 0 0 auto; border-radius: 999px; padding: 5px 10px; font-size: 11px; font-weight: 700; background: var(--panel-soft); }
.pill.ok { color: var(--success); background: var(--success-soft); }
.pill.warn { color: var(--warning); background: var(--warning-soft); }
.pill.bad { color: var(--danger); background: var(--danger-soft); }
.status-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--subtle); }
.status-dot.ok { background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
.status-dot.warn { background: var(--warning); box-shadow: 0 0 0 3px var(--warning-soft); }
.status-dot.bad { background: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }
.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; color: var(--muted); }
.section-head > span { font-size: 12px; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; margin-top: 18px; }
.actions.stacked { display: grid; grid-template-columns: 1fr 1fr; }
.actions.stacked .primary { grid-column: 1 / -1; }

.memory-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; margin-bottom: 12px; padding: 12px; }
.search-box { display: flex; align-items: center; min-width: 0; border: 1px solid var(--border); border-radius: 12px; padding-left: 12px; background: var(--panel-soft); }
.search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.search-box input { flex: 1; }
.search-box button { min-height: 36px; margin: 3px; }
.toolbar-actions { display: flex; align-items: center; gap: 10px; }
.check-control { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.check-control input { width: 15px; height: 15px; accent-color: var(--accent); }
.memory-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.memory-stats > div { display: flex; align-items: baseline; gap: 7px; border: 1px solid var(--border); border-radius: 12px; padding: 11px 14px; background: color-mix(in srgb, var(--panel) 84%, var(--app-bg)); }
.memory-stats strong { font-size: 18px; }
.memory-stats span { color: var(--muted); font-size: 11px; }
.memory-layout { display: grid; grid-template-columns: minmax(310px, 36%) minmax(0, 1fr); align-items: start; gap: 14px; }
.memory-index { padding: 14px; }
.memory-list { display: grid; gap: 8px; margin-top: 14px; }
.memory-card { display: block; width: 100%; min-height: 0; padding: 13px; border-color: transparent; background: var(--panel-soft); text-align: left; font-weight: 400; }
.memory-card:hover { border-color: color-mix(in srgb, var(--accent) 28%, var(--border)); background: var(--panel-hover); }
.memory-card.selected { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent); }
.card-head, .meta-line, .tags { display: flex; align-items: center; gap: 8px; }
.card-head { justify-content: space-between; }
.card-head strong { min-width: 0; overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.summary { display: -webkit-box; overflow: hidden; margin: 7px 0 9px; color: var(--muted); line-height: 1.48; font-size: 12px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.meta-line { justify-content: space-between; color: var(--subtle); font-size: 10px; }
.tags { min-width: 0; flex-wrap: wrap; margin-top: 9px; }
.tag { max-width: 132px; overflow: hidden; border-radius: 999px; padding: 3px 7px; background: color-mix(in srgb, var(--panel) 70%, var(--panel-soft)); color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.load-more { width: 100%; margin-top: 10px; border-style: dashed; color: var(--accent); }
.memory-detail { position: sticky; top: 12px; min-height: 490px; }
.empty-detail { display: grid; place-items: center; align-content: center; gap: 14px; text-align: center; color: var(--muted); }
.empty-detail p { max-width: 360px; margin: 6px auto 0; }
.empty-visual { display: grid; width: 58px; height: 58px; place-items: center; border-radius: 18px; background: var(--panel-soft); color: var(--subtle); }
.empty-visual .icon { width: 27px; height: 27px; }
.detail-title { display: flex; justify-content: space-between; gap: 18px; }
.detail-title h2 { font-size: 20px; }
.detail-title p { margin: 6px 0 0; color: var(--muted); }
.facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 16px 0; }
.facts.compact div { min-height: 66px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--border) 70%, transparent); border-radius: 11px; background: var(--panel-soft); }
.facts dt { color: var(--muted); font-size: 10px; }
.facts dd { margin: 5px 0 0; overflow-wrap: anywhere; font-size: 12px; font-weight: 650; }
.detail-tags { margin: 0 0 4px; }
.content-section { padding-top: 15px; border-top: 1px solid var(--border); }
.content-section + .content-section { margin-top: 15px; }
.content-section h3 { margin: 0 0 8px; }
.content-section p { margin: 0; color: var(--muted); }
.document-body { max-height: 360px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--border); border-radius: 12px; padding: 14px; background: var(--panel-soft); color: var(--text); font: 12px/1.65 var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace); }
.evidence-list, .blocker-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.evidence-list li, .blocker-list li { display: flex; align-items: flex-start; gap: 8px; border-radius: 10px; padding: 9px 11px; background: var(--panel-soft); color: var(--muted); font-size: 12px; line-height: 1.45; }
.evidence-list .icon { color: var(--success); }
.blocker-list .icon { color: var(--danger); }
.detail-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--border); }
.empty-state { display: grid; justify-items: center; gap: 7px; padding: 32px 12px; color: var(--muted); text-align: center; }
.empty-state .icon { width: 26px; height: 26px; color: var(--subtle); }
.empty-state strong { color: var(--text); }
.empty-state span { max-width: 340px; font-size: 12px; }

.workbench-header .objective { display: -webkit-box; overflow: hidden; max-width: 850px; margin-top: 7px; color: var(--muted); line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.workbench-header .objective.expanded { display: block; }
.progress-panel { margin-bottom: 14px; padding: 17px 18px 14px; }
.progress-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }
.progress-head > div { display: flex; align-items: baseline; gap: 9px; }
.progress-head span { color: var(--muted); font-size: 11px; }
.progress-head strong { font-size: 15px; }
.progress-bar { height: 6px; overflow: hidden; border-radius: 999px; background: var(--panel-soft); }
.progress-bar > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .35s ease; }
.stepper { display: grid; grid-template-columns: repeat(var(--step-count), minmax(82px, 1fr)); margin-top: 17px; overflow-x: auto; padding-bottom: 3px; }
.step-node { position: relative; min-width: 82px; padding: 0 6px; text-align: center; }
.step-track { position: relative; display: grid; place-items: center; height: 29px; }
.step-track::before, .step-track::after { content: ''; position: absolute; top: 50%; width: 50%; height: 2px; background: var(--border); transform: translateY(-50%); }
.step-track::before { left: 0; }
.step-track::after { right: 0; }
.step-node:first-child .step-track::before, .step-node:last-child .step-track::after { display: none; }
.step-track span { position: relative; z-index: 1; display: grid; width: 27px; height: 27px; place-items: center; border: 2px solid var(--border); border-radius: 50%; background: var(--panel); color: var(--subtle); font-size: 10px; font-weight: 750; }
.step-node strong { display: block; overflow: hidden; margin-top: 5px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.step-node small { color: var(--subtle); font-size: 9px; }
.step-node.completed .step-track::before, .step-node.completed .step-track::after, .step-node.running .step-track::before { background: var(--accent); }
.step-node.completed .step-track span { border-color: var(--accent); background: var(--accent); color: #fff; }
.step-node.completed strong { color: var(--text); }
.step-node.running .step-track span { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 0 5px var(--accent-soft); }
.step-node.running strong { color: var(--accent); }
.step-node.blocked .step-track span { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }
.step-node.blocked strong { color: var(--danger); }
.step-node.skipped .step-track span { border-color: var(--warning); color: var(--warning); }
.workbench-grid { display: grid; grid-template-columns: minmax(250px, 31%) minmax(0, 1fr); align-items: start; gap: 14px; }
.plan-overview h2 { margin-top: 3px; font-size: 17px; }
.plan-chips, .evidence-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
.plan-chips span, .evidence-chips span { border: 1px solid var(--border); border-radius: 999px; padding: 5px 9px; background: var(--panel-soft); color: var(--muted); font-size: 10px; }
.evidence-chips span.complete { color: var(--success); background: var(--success-soft); }
.plan-id { display: grid; grid-template-columns: 1fr auto; gap: 6px 8px; margin-top: 17px; padding-top: 15px; border-top: 1px solid var(--border); }
.plan-id > span { grid-column: 1 / -1; color: var(--muted); font-size: 10px; }
.plan-id code { align-self: center; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.plan-id button { min-height: 30px; padding: 5px 9px; font-size: 10px; }
.current-step { min-height: 310px; }
.step-command { display: flex; align-items: center; gap: 9px; margin-top: 20px; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; background: var(--panel-soft); }
.step-command span { color: var(--muted); font-size: 10px; }
.step-command code { color: var(--accent); font-size: 12px; font-weight: 700; }
.step-note { margin: 14px 0 0; color: var(--muted); }
.output-list { margin-top: 18px; }
.output-list h3 { margin-top: 0; }
.output-list > div { display: flex; align-items: flex-start; gap: 8px; padding: 7px 0; color: var(--muted); font-size: 12px; }
.output-list .icon { color: var(--success); }
.compact-empty { min-height: 190px; align-content: center; }

.product-grid, .convergence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 14px; }
details { margin-top: 16px; }
summary { color: var(--accent); cursor: pointer; font-size: 12px; }
pre { max-height: 360px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; margin: 12px 0 0; border-radius: 12px; padding: 13px; background: #111827; color: #e5e7eb; font: 11px/1.55 var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace); }
.compact-timeline { display: grid; gap: 8px; margin-top: 15px; }
.compact-timeline > div { display: grid; grid-template-columns: 26px 1fr; align-items: start; gap: 9px; border: 1px solid var(--border); border-radius: 11px; padding: 10px; }
.compact-timeline > div > span { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 10px; }
.compact-timeline p { display: grid; gap: 2px; margin: 0; }
.compact-timeline small { color: var(--muted); }
.convergence-hero { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 16px; margin-bottom: 14px; }
.convergence-hero.passed { border-color: color-mix(in srgb, var(--success) 28%, var(--border)); }
.convergence-hero.blocked { border-color: color-mix(in srgb, var(--danger) 24%, var(--border)); }
.gate-icon { display: grid; width: 52px; height: 52px; place-items: center; border-radius: 16px; }
.passed .gate-icon { background: var(--success-soft); color: var(--success); }
.blocked .gate-icon { background: var(--danger-soft); color: var(--danger); }
.gate-icon .icon { width: 25px; height: 25px; }
.convergence-hero h2 { margin: 2px 0 4px; }
.convergence-hero p { margin: 0; color: var(--muted); }
.convergence-hero dl { display: flex; gap: 8px; margin: 0; }
.convergence-hero dl div { min-width: 78px; border-left: 1px solid var(--border); padding-left: 12px; }
.convergence-hero dt { color: var(--muted); font-size: 9px; }
.convergence-hero dd { margin: 4px 0 0; font-size: 13px; font-weight: 700; }

@media (max-width: 820px) {
  #app { padding: 16px; }
  .memory-layout, .workbench-grid, .product-grid, .convergence-grid { grid-template-columns: 1fr; }
  .memory-detail { position: static; min-height: 390px; }
  .convergence-hero { grid-template-columns: auto 1fr; }
  .convergence-hero dl { grid-column: 1 / -1; }
}
@media (max-width: 620px) {
  #app { padding: 12px; }
  .app-header, .brand-block { align-items: flex-start; }
  .app-header { flex-direction: column; }
  .memory-toolbar { grid-template-columns: 1fr; }
  .toolbar-actions { justify-content: space-between; }
  .memory-stats { grid-template-columns: 1fr; }
  .memory-stats > div { justify-content: space-between; }
  .facts { grid-template-columns: 1fr; }
  .actions.stacked { grid-template-columns: 1fr; }
  .actions.stacked .primary { grid-column: auto; }
  .stepper { grid-template-columns: repeat(var(--step-count), minmax(92px, 1fr)); }
  .convergence-hero dl { display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; }
  .convergence-hero dl div { min-width: 0; }
}
`;
