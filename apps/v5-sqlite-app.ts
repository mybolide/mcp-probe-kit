/**
 * v5 MCP Apps: SQLite DevControl workbench + independent Memory Center.
 * No delegated plans, Markdown checkpoints, or state writes from the UI.
 * The Host/Agent still owns approval, execution and real Gate attestation.
 */
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps/app-with-deps';

declare const __MCP_PROBE_VERSION__: string;
type Dict = Record<string, unknown>;
type View = 'tasks' | 'features' | 'bugs' | 'ideas';
type Snapshot = { action: string; data: Dict };
const root = document.getElementById('app') as HTMLElement;
const kind = root.dataset.appKind || 'devcontrol-workbench';
const app = new App(
  { name: 'MCP Probe Kit', version: __MCP_PROBE_VERSION__ },
  { displayModes: ['inline', 'fullscreen'] }, { autoResize: true, strict: false },
);
let projectRoot = '';
let view: View = 'tasks';
let latest: Snapshot | null = null;
let busy = false;
let message = '';
let memoryResults: Dict[] = [];
let memoryQuery = '';

function dict(value: unknown): Dict {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Dict : {};
}
function array(value: unknown): Dict[] {
  return Array.isArray(value) ? value.map(dict).filter((value) => Object.keys(value).length > 0) : [];
}
function str(value: unknown): string { return typeof value === 'string' ? value : ''; }
function esc(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function short(value: unknown, length = 140): string {
  const text = str(value).trim();
  return text.length <= length ? text : text.slice(0, length - 1) + '…';
}
function resultData(result: unknown): Dict {
  const content = dict(result);
  return dict(content.structuredContent ?? dict(content.result).structuredContent);
}
function isFailure(result: unknown): boolean {
  const data = dict(result);
  const content = resultData(result);
  return data.isError === true || content.ok === false;
}
function itemTitle(row: Dict): string {
  return str(row.title ?? row.name ?? row.summary ?? row.description ?? row.id) || '未命名';
}
function itemId(row: Dict): string { return str(row.id ?? row.taskId ?? row.name); }
function itemStatus(row: Dict): string {
  return str(row.status ?? row.state ?? row.disposition ?? row.stage ?? 'pending');
}
function payloadRows(): Dict[] {
  const d = latest?.data ?? {};
  if (view === 'tasks') return array(d.tasks ?? d.items);
  if (view === 'features') return array(d.features);
  if (view === 'bugs') return array(d.items ?? d.tasks);
  return array(d.ideas ?? d.items);
}
function renderDevControl(): void {
  const rows = payloadRows();
  const title = ({ tasks: '任务', features: '需求 / Feature', bugs: 'Bug', ideas: 'Idea' } as const)[view];
  root.innerHTML = `<header class="top"><div><div class="eyebrow">MCP PROBE KIT · V5</div>
    <h1>DevControl <span>SQLite</span></h1><p>唯一研发状态源 · 只读工作台</p></div>
    <span class="tag">v${esc(__MCP_PROBE_VERSION__)}</span></header>
    <form id="project-form" class="project-form"><label for="project-root">目标 Git 项目目录</label>
      <div class="project-row"><input id="project-root" name="projectRoot" placeholder="/path/to/your/project"
        value="${esc(projectRoot)}" required autocomplete="off">
        <button type="submit" ${busy ? 'disabled' : ''}>读取 SQLite</button></div></form>
    <nav class="tabs" aria-label="SQLite 研发账本分类">
      ${(['tasks','features','bugs','ideas'] as View[]).map((key) =>
        `<button type="button" data-view="${key}" class="${key === view ? 'active' : ''}">${esc(({tasks:'任务', features:'Feature', bugs:'Bug', ideas:'Idea'} as const)[key])}</button>`).join('')}</nav>
    ${message ? `<div class="notice" role="status">${esc(message)}</div>` : ''}
    <div class="list-head"><strong>${title}</strong><span>${latest ? `${rows.length} 条 · SQLite 查询结果` : '尚未读取'}</span>
      <button class="refresh" data-action="refresh" ${busy || !projectRoot ? 'disabled' : ''}>刷新</button></div>
    <main class="cards">${!latest
      ? '<div class="empty">输入目标 Git 项目目录并读取。任务、Feature、Bug、Idea 均来自 DevControl SQLite，不创建另一套 Plan。</div>'
      : rows.length
        ? rows.slice(0, 120).map((item) => `<article class="item"><div class="item-top">
          <strong>${esc(short(itemTitle(item), 110))}</strong>
          <span class="status">${esc(itemStatus(item))}</span></div>
          <p>${esc(short(item.description ?? item.rationale ?? itemId(item), 230))}</p>
          <small>${esc(itemId(item))}</small></article>`).join('')
        : '<div class="empty">当前分类没有记录。不会从文件或旧 Delegated Plan 推测任务。</div>'}</main>
    <footer>仅展示真实查询结果。批准、领取任务、编辑和测试验收必须由 Agent 通过 DevControl 正式合同执行。</footer>`;
}
function renderMemory(): void {
  root.innerHTML = `<header class="top"><div><div class="eyebrow">MCP PROBE KIT · MEMORY</div>
    <h1>Memory Center</h1><p>跨项目经验检索，与 SQLite 项目任务状态独立</p></div></header>
    <form id="memory-form" class="project-form"><label for="memory-query">检索可复用经验</label>
      <div class="project-row"><input name="query" id="memory-query" value="${esc(memoryQuery)}" placeholder="Search memory" autocomplete="off">
      <button type="submit" ${busy ? 'disabled' : ''}>检索</button></div></form>
    ${message ? `<div class="notice" role="status">${esc(message)}</div>` : ''}
    <div class="list-head"><strong>经验资产</strong><span>${memoryResults.length} 条</span></div>
    <main class="cards">${memoryResults.length
      ? memoryResults.map((item) => `<article class="item"><strong>${esc(short(itemTitle(item),100))}</strong>
        <p>${esc(short(item.summary ?? item.content,260))}</p><small>${esc(itemId(item))}</small></article>`).join('')
      : '<div class="empty">尚无匹配记录，Memory 不参与研发任务审批与状态。</div>'}</main>`;
}
function render(): void { if (kind === 'memory-center') renderMemory(); else renderDevControl(); }
async function refresh(): Promise<void> {
  if (!projectRoot || busy) return;
  busy = true; message = '正在读取项目 SQLite…'; render();
  const action = ({ tasks: 'list', features: 'features', bugs: 'work-items', ideas: 'idea-list' } as const)[view];
  try {
    const result = await app.callServerTool({
      name: 'devcontrol', arguments: { action, project_root: projectRoot,
        input: view === 'bugs' ? { kind: 'bug' } : {} },
    });
    const data = resultData(result);
    if (isFailure(result)) {
      latest = null;
      message = 'DevControl 查询失败：' + short(data.message ?? data.code ?? '未知错误');
    } else {
      latest = { action, data };
      message = '已读取 DevControl SQLite；未创建或修改任务。';
    }
  } catch (err) {
    latest = null;
    message = 'DevControl 无法访问：' + String(err instanceof Error ? err.message : err);
  } finally { busy = false; render(); }
}
async function searchMemory(): Promise<void> {
  if (busy) return;
  busy = true; message = '正在检索 Memory…'; render();
  try {
    const result = await app.callServerTool({ name: 'search_memory',
      arguments: { query: memoryQuery, limit: 50, include_inactive: false } });
    const data = resultData(result);
    memoryResults = array(data.results ?? data.items);
    message = isFailure(result) ? 'Memory 检索失败' : 'Memory 检索完成';
  } catch (err) { message = String(err instanceof Error ? err.message : err); }
  finally { busy = false; render(); }
}
root.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  event.preventDefault();
  const values = new FormData(form);
  if (form.id === 'project-form') {
    const nextRoot = str(values.get('projectRoot')).trim();
    if (nextRoot !== projectRoot) latest = null;
    projectRoot = nextRoot;
    void refresh();
  }
  if (form.id === 'memory-form') {
    memoryQuery = str(values.get('query')).trim();
    void searchMemory();
  }
});
root.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-view],[data-action]');
  if (!target) return;
  if (target.dataset.view) {
    view = target.dataset.view as View; latest = null;
    if (projectRoot) void refresh(); else render();
  }
  if (target.dataset.action === 'refresh') void refresh();
});
app.addEventListener('toolinput', (event) => {
  const args = dict(event.arguments);
  const fromTool = str(args.project_root);
  if (fromTool && fromTool !== projectRoot) { projectRoot = fromTool; latest = null; }
  render();
});
app.addEventListener('toolresult', (event) => {
  if (kind !== 'devcontrol-workbench') return;
  const data = resultData(event);
  const action = str(dict(event).action);
  if (data.tasks && (!action || action === 'list')) {
    latest = { action: 'list', data }; view = 'tasks'; render();
  }
});
app.addEventListener('hostcontextchanged', (event) => {
  if (event.theme) applyDocumentTheme(event.theme);
  if (event.styles?.variables) applyHostStyleVariables(event.styles.variables);
});
async function start(): Promise<void> {
  const demo = window.__MCP_PROBE_DEMO__;
  if (demo?.enabled) {
    if (kind === 'devcontrol-workbench') {
      projectRoot = str(demo.projectRoot) || '/sample/your-git-project';
      view = 'tasks';
      latest = { action: 'list', data: { tasks: array(demo.tasks) } };
    } else {
      memoryResults = array(demo.memoryItems);
    }
    message = '演示数据（不连接真实项目）';
    render();
    return;
  }
  render();
  await app.connect();
  const context = app.getHostContext();
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (kind === 'memory-center') await searchMemory();
}
declare global { interface Window { __MCP_PROBE_DEMO__?: {
  enabled?: boolean; projectRoot?: string; tasks?: Dict[]; memoryItems?: Dict[];
} } }
void start().catch((err) => { message = 'MCP App 初始化失败：' + String(err); render(); });
