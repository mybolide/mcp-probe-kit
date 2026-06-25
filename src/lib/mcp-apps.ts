/**
 * MCP Apps 预览 HTML 生成（text/html resource）
 */

export interface McpAppToolResult {
  content?: unknown;
  structuredContent?: unknown;
}

export const MCP_UI_APP_TOOLS = new Set([
  'ui_design_system',
  'ui_search',
  'sync_ui_data',
  'start_ui',
  'start_product',
  'search_memory',
  'code_insight',
]);

export function isMcpUiAppTool(name: string): boolean {
  return MCP_UI_APP_TOOLS.has(name);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractTextBlocks(result: McpAppToolResult): string {
  if (!Array.isArray(result.content)) {
    return '';
  }
  return result.content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      const text = (item as Record<string, unknown>).text;
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

const BASE_STYLES = `
  :root { color-scheme: light dark; --bg: #f4f7fb; --card: #fff; --text: #1e2a35; --muted: #4f6880; --accent: #2563eb; --ok: #15803d; --warn: #b45309; --border: #d8e2ec; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f1720; --card: #162231; --text: #e8f0fa; --muted: #9fb3c8; --accent: #60a5fa; --ok: #4ade80; --warn: #fbbf24; --border: #2a3b4f; }
  }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: var(--bg); color: var(--text); }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 20px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; margin-bottom: 14px; }
  h1 { margin: 0 0 6px; font-size: 22px; }
  h2 { margin: 0 0 10px; font-size: 15px; color: var(--muted); font-weight: 600; }
  .meta { color: var(--muted); font-size: 12px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-ok { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
  .badge-warn { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
  .badge-info { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre { white-space: pre-wrap; word-break: break-word; background: #0f1720; color: #d9e7f7; border-radius: 10px; padding: 12px; font-size: 12px; line-height: 1.45; margin: 0; }
  .item { border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 10px; }
  .item h3 { margin: 0 0 6px; font-size: 15px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
  .score { font-size: 12px; color: var(--muted); }
  .summary { font-size: 13px; line-height: 1.5; margin: 6px 0; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  button { border: 1px solid var(--border); background: var(--card); color: var(--text); border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer; }
  button:hover { border-color: var(--accent); color: var(--accent); }
  details { margin-top: 8px; }
  summary { cursor: pointer; color: var(--accent); font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  a { color: var(--accent); }
`;

function wrapAppHtml(title: string, body: string): string {
  const now = new Date().toISOString();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · MCP Apps</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Generated at ${escapeHtml(now)} · MCP Probe Kit Apps</div>
    </div>
    ${body}
  </div>
</body>
</html>`;
}

export function buildGenericMcpAppHtml(
  toolName: string,
  args: unknown,
  result: McpAppToolResult
): string {
  const structured = result.structuredContent
    ? JSON.stringify(result.structuredContent, null, 2)
    : '{}';
  const argJson = JSON.stringify(args ?? {}, null, 2);
  const textBlocks = extractTextBlocks(result);

  return wrapAppHtml(
    toolName,
    `<div class="card"><h2>Text Output</h2><pre>${escapeHtml(textBlocks || '(no text output)')}</pre></div>
<div class="card"><h2>Structured Content</h2><pre>${escapeHtml(structured)}</pre></div>
<div class="card"><h2>Arguments</h2><pre>${escapeHtml(argJson)}</pre></div>`
  );
}

export function buildSearchMemoryAppHtml(
  args: unknown,
  result: McpAppToolResult
): string {
  const structured =
    result.structuredContent && typeof result.structuredContent === 'object'
      ? (result.structuredContent as Record<string, unknown>)
      : {};
  const results = Array.isArray(structured.results) ? structured.results : [];
  const query = typeof structured.query === 'string' ? structured.query : '';
  const count = typeof structured.count === 'number' ? structured.count : results.length;
  const handles = structured.handles && typeof structured.handles === 'object'
    ? structured.handles
    : {};

  const itemsHtml = results.length === 0
    ? '<div class="card"><p>未找到相关记忆</p></div>'
    : results
      .map((raw, index) => {
        const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        const id = typeof item.id === 'string' ? item.id : '';
        const name = typeof item.name === 'string' ? item.name : `result-${index + 1}`;
        const type = typeof item.type === 'string' ? item.type : 'unknown';
        const score = typeof item.score === 'number' ? item.score.toFixed(3) : '—';
        const summary = typeof item.summary === 'string' ? item.summary : '';
        const description = typeof item.description === 'string' ? item.description : '';
        const content = typeof item.content === 'string' ? item.content : '';
        const tags = Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [];
        const readPayload = JSON.stringify({ asset_id: id });

        return `<article class="item" data-id="${escapeHtml(id)}">
  <h3>${escapeHtml(name)} <span class="badge badge-info">${escapeHtml(type)}</span></h3>
  <div class="row"><span class="score">score=${escapeHtml(score)}</span>${tags.map((t) => `<span class="badge badge-info">${escapeHtml(t)}</span>`).join('')}</div>
  ${summary ? `<div class="summary"><strong>摘要</strong> ${escapeHtml(summary)}</div>` : ''}
  ${description ? `<div class="summary"><strong>描述</strong> ${escapeHtml(description)}</div>` : ''}
  <div class="actions">
    <button type="button" data-copy='${escapeHtml(readPayload)}'>复制 read_memory_asset</button>
    <code>id: ${escapeHtml(id)}</code>
  </div>
  ${content ? `<details><summary>展开 content</summary><pre>${escapeHtml(content)}</pre></details>` : ''}
</article>`;
      })
      .join('');

  const script = `<script>
document.querySelectorAll('button[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const payload = btn.getAttribute('data-copy') || '';
    try {
      await navigator.clipboard.writeText('read_memory_asset ' + payload);
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = '复制 read_memory_asset'; }, 1200);
    } catch (e) {
      btn.textContent = '复制失败';
    }
  });
});
</script>`;

  return wrapAppHtml(
    'search_memory',
    `<div class="card">
  <h2>检索结果</h2>
  <div class="meta">query: ${escapeHtml(query || '(n/a)')} · ${count} 条</div>
</div>
${itemsHtml}
<div class="card"><h2>Handles</h2><pre>${escapeHtml(JSON.stringify(handles, null, 2))}</pre></div>
${script}`
  );
}

function statusBadge(status: string): string {
  if (status === 'ok') return 'badge-ok';
  if (status === 'ambiguous' || status === 'degraded') return 'badge-warn';
  return 'badge-info';
}

export function buildCodeInsightAppHtml(
  args: unknown,
  result: McpAppToolResult
): string {
  const structured =
    result.structuredContent && typeof result.structuredContent === 'object'
      ? (result.structuredContent as Record<string, unknown>)
      : {};
  const status = typeof structured.status === 'string' ? structured.status : 'unknown';
  const summary = typeof structured.summary === 'string' ? structured.summary : '';
  const provider = typeof structured.provider === 'string' ? structured.provider : '';
  const mode = structured.mode && typeof structured.mode === 'object'
    ? (structured.mode as Record<string, unknown>)
    : {};
  const warnings = Array.isArray(structured.warnings)
    ? structured.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  const executions = Array.isArray(structured.executions) ? structured.executions : [];
  const ambiguities = Array.isArray(structured.ambiguities) ? structured.ambiguities : [];
  const handles = structured.handles && typeof structured.handles === 'object' ? structured.handles : {};
  const nextAction = typeof structured.nextAction === 'string' ? structured.nextAction : '';

  const execRows = executions
    .map((raw) => {
      const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const tool = typeof row.tool === 'string' ? row.tool : '—';
      const ok = row.ok === true;
      const text = typeof row.text === 'string' ? row.text.slice(0, 400) : '';
      return `<tr><td>${escapeHtml(tool)}</td><td><span class="badge ${ok ? 'badge-ok' : 'badge-warn'}">${ok ? 'ok' : 'fail'}</span></td><td><pre>${escapeHtml(text || '—')}</pre></td></tr>`;
    })
    .join('');

  const ambiguityHtml = ambiguities.length > 0
    ? `<div class="card"><h2>歧义候选</h2><pre>${escapeHtml(JSON.stringify(ambiguities, null, 2))}</pre></div>`
    : '';

  const graphSnapshot =
    handles && typeof handles === 'object' && typeof (handles as Record<string, unknown>).graph_snapshot === 'string'
      ? String((handles as Record<string, unknown>).graph_snapshot)
      : '';
  const graphResource =
    handles && typeof handles === 'object' && typeof (handles as Record<string, unknown>).graph_resource === 'string'
      ? String((handles as Record<string, unknown>).graph_resource)
      : 'probe://graph/latest';

  return wrapAppHtml(
    'code_insight',
    `<div class="card">
  <h2>分析摘要</h2>
  <div class="row">
    <span class="badge ${statusBadge(status)}">${escapeHtml(status)}</span>
    <span class="meta">provider: ${escapeHtml(provider || 'n/a')}</span>
    <span class="meta">mode: ${escapeHtml(String(mode.requested ?? '?'))} → ${escapeHtml(String(mode.resolved ?? '?'))}</span>
  </div>
  <p class="summary">${escapeHtml(summary || '(no summary)')}</p>
  ${nextAction ? `<p class="summary"><strong>下一步</strong> ${escapeHtml(nextAction)}</p>` : ''}
  ${warnings.length > 0 ? `<p class="summary"><strong>警告</strong> ${escapeHtml(warnings.join(' · '))}</p>` : ''}
  <div class="actions">
    <a href="${escapeHtml(graphResource)}">图谱资源</a>
    ${graphSnapshot ? `<a href="${escapeHtml(graphSnapshot)}">本次快照</a>` : ''}
  </div>
</div>
<div class="card">
  <h2>执行详情</h2>
  <table><thead><tr><th>Tool</th><th>Status</th><th>Output</th></tr></thead><tbody>${execRows || '<tr><td colspan="3">无</td></tr>'}</tbody></table>
</div>
${ambiguityHtml}
<div class="card"><h2>Arguments</h2><pre>${escapeHtml(JSON.stringify(args ?? {}, null, 2))}</pre></div>
<div class="card"><h2>Handles</h2><pre>${escapeHtml(JSON.stringify(handles, null, 2))}</pre></div>`
  );
}

export function buildMcpAppHtml(
  toolName: string,
  args: unknown,
  result: McpAppToolResult
): string {
  if (toolName === 'search_memory') {
    return buildSearchMemoryAppHtml(args, result);
  }
  if (toolName === 'code_insight') {
    return buildCodeInsightAppHtml(args, result);
  }
  return buildGenericMcpAppHtml(toolName, args, result);
}
