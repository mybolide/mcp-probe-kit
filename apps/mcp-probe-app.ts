import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps/app-with-deps';

declare const __MCP_PROBE_VERSION__: string;

type Dict = Record<string, unknown>;
type ToolResult = {
  content?: unknown;
  structuredContent?: Dict;
  isError?: boolean;
};

const root = document.getElementById('app') as HTMLElement;
const kind = root.dataset.appKind || 'task-workbench';
const app = new App(
  { name: 'MCP Probe Kit', version: __MCP_PROBE_VERSION__ },
  { displayModes: ['inline', 'fullscreen'] },
  { autoResize: true, strict: false },
);

let lastInput: Dict = {};
let lastResult: ToolResult = {};
let memoryItems: Dict[] = [];
let selectedMemory: Dict | null = null;
let busy = false;
let notice = '';

function asDict(value: unknown): Dict {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

function asArray(value: unknown): Dict[] {
  return Array.isArray(value)
    ? value.filter((item): item is Dict => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pretty(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function statusClass(status: unknown): string {
  const normalized = text(status).toLowerCase();
  if (['active', 'ok', 'passed', 'completed'].includes(normalized)) return 'ok';
  if (['stale', 'blocked', 'failed', 'invalid'].includes(normalized)) return 'bad';
  return 'warn';
}

async function callTool(name: string, args: Dict): Promise<ToolResult> {
  busy = true;
  notice = `正在调用 ${name}…`;
  render();
  try {
    const result = (await app.callServerTool({ name, arguments: args })) as ToolResult;
    notice = result.isError ? `${name} 返回错误` : `${name} 已完成`;
    return result;
  } catch (error) {
    notice = `${name} 调用失败：${error instanceof Error ? error.message : String(error)}`;
    return { isError: true };
  } finally {
    busy = false;
    render();
  }
}

function memoryCard(item: Dict): string {
  const id = text(item.id);
  const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const score = typeof item.score === 'number' ? `<span class="muted">相关度 ${item.score.toFixed(3)}</span>` : '';
  return `<button class="memory-card" data-action="open-memory" data-id="${escapeHtml(id)}">
    <span class="card-head"><strong>${escapeHtml(text(item.name, id || '未命名记忆'))}</strong><span class="pill ${statusClass(item.status)}">${escapeHtml(text(item.status, 'active'))}</span></span>
    <span class="summary">${escapeHtml(text(item.summary, text(item.description, '无摘要')))}</span>
    <span class="meta-line"><span>${escapeHtml(text(item.type, 'unknown'))}</span>${score}<span>${escapeHtml(text(item.updatedAt, text(item.sourceProject)))}</span></span>
    <span class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</span>
  </button>`;
}

function renderMemoryDetail(): string {
  if (!selectedMemory) {
    return `<section class="panel detail empty"><div><h2>选择一条记忆</h2><p>查看完整内容、来源、状态和证据。</p></div></section>`;
  }
  const item = selectedMemory;
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return `<section class="panel detail">
    <div class="detail-title"><div><h2>${escapeHtml(text(item.name, '未命名记忆'))}</h2><p>${escapeHtml(text(item.description))}</p></div><span class="pill ${statusClass(item.status)}">${escapeHtml(text(item.status, 'active'))}</span></div>
    <dl class="facts">
      <div><dt>类型</dt><dd>${escapeHtml(text(item.type, 'unknown'))}</dd></div>
      <div><dt>可信度</dt><dd>${escapeHtml(item.confidence ?? '—')}</dd></div>
      <div><dt>来源项目</dt><dd>${escapeHtml(text(item.sourceProject, '共享'))}</dd></div>
      <div><dt>更新时间</dt><dd>${escapeHtml(text(item.updatedAt, '—'))}</dd></div>
    </dl>
    <div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
    <h3>摘要</h3><p>${escapeHtml(text(item.summary, '无摘要'))}</p>
    <h3>完整内容</h3><pre>${escapeHtml(text(item.content, '无内容'))}</pre>
    ${text(item.applicability) ? `<h3>适用边界</h3><p>${escapeHtml(item.applicability)}</p>` : ''}
    ${evidence.length ? `<h3>验证证据</h3><ul>${evidence.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>` : ''}
    <div class="actions">
      <button data-action="mark-stale" data-id="${escapeHtml(text(item.id))}">标记过期</button>
      <button class="danger" data-action="delete-memory" data-id="${escapeHtml(text(item.id))}">删除</button>
    </div>
  </section>`;
}

function renderMemoryCenter(): string {
  return `<header class="topbar"><div><p class="eyebrow">MCP Apps</p><h1>Memory Center</h1><p>浏览、搜索和治理 MCP Probe Kit 的历史记忆。</p></div><span class="connection">${busy ? '处理中' : '已连接'}</span></header>
  <section class="toolbar panel">
    <form id="memory-search"><input id="memory-query" name="query" placeholder="搜索问题、模块、错误信息或经验…" autocomplete="off"><button type="submit">搜索</button></form>
    <div class="toolbar-actions"><button data-action="list-memory">全部记忆</button><label><input id="include-inactive" type="checkbox" checked>包含过期/失效</label></div>
  </section>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <main class="memory-layout"><section class="panel list"><div class="section-head"><h2>历史记忆</h2><span>${memoryItems.length} 条</span></div><div class="memory-list">${memoryItems.length ? memoryItems.map(memoryCard).join('') : '<div class="empty-state">暂无结果。点击“全部记忆”或输入关键词搜索。</div>'}</div></section>${renderMemoryDetail()}</main>`;
}

function planFromResult(): Dict {
  const structured = asDict(lastResult.structuredContent);
  const metadata = asDict(structured.metadata);
  return asDict(metadata.plan ?? structured.plan);
}

function renderTaskWorkbench(): string {
  const plan = planFromResult();
  const steps = asArray(plan.steps);
  const layout = asDict(asDict(lastResult.structuredContent).metadata).layoutDecision;
  return `<header class="topbar"><div><p class="eyebrow">Development Workbench</p><h1>${kind === 'bug-workbench' ? 'Bug 修复工作台' : '功能开发工作台'}</h1><p>${escapeHtml(text(lastInput.description, text(plan.objective, '等待工具结果…')))}</p></div><span class="pill ${statusClass(plan.status)}">${escapeHtml(text(plan.workflow, kind === 'bug-workbench' ? 'bugfix' : 'feature'))}</span></header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <main class="dashboard"><section class="panel"><h2>任务概览</h2><dl class="facts"><div><dt>Plan ID</dt><dd>${escapeHtml(text(plan.planId, '—'))}</dd></div><div><dt>规格布局</dt><dd>${escapeHtml(text(asDict(layout).resolved, text(lastInput.spec_layout, 'auto')))}</dd></div><div><dt>模式</dt><dd>${escapeHtml(text(plan.mode, 'delegated'))}</dd></div><div><dt>步骤数</dt><dd>${steps.length}</dd></div></dl><div class="actions"><button data-action="resume-plan" data-id="${escapeHtml(text(plan.planId))}">恢复计划</button><button data-action="check-converge" data-id="${escapeHtml(text(plan.planId))}">检查收敛</button><button data-action="continue-chat">继续执行</button></div></section>
  <section class="panel"><h2>执行步骤</h2><div class="timeline">${steps.length ? steps.map((step, index) => `<div class="step"><span>${index + 1}</span><div><strong>${escapeHtml(text(step.id, `step-${index + 1}`))}</strong><p>${escapeHtml(text(step.action, text(step.description)))}</p></div></div>`).join('') : '<div class="empty-state">工具完成后将在这里显示计划步骤。</div>'}</div></section></main>`;
}

function renderProductWorkbench(): string {
  const structured = asDict(lastResult.structuredContent);
  const metadata = asDict(structured.metadata);
  return `<header class="topbar"><div><p class="eyebrow">Product Workbench</p><h1>产品设计工作台</h1><p>${escapeHtml(text(lastInput.description, text(structured.summary, '从目标、用户和约束形成可执行产品方案。')))}</p></div></header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <main class="dashboard"><section class="panel"><h2>产品输入</h2><pre>${escapeHtml(pretty(lastInput))}</pre></section><section class="panel"><h2>方案输出</h2><pre>${escapeHtml(pretty(metadata.plan ?? structured))}</pre><div class="actions"><button data-action="continue-chat">继续完善产品方案</button><button data-action="start-feature-chat">进入功能开发</button></div></section></main>`;
}

function renderConvergence(): string {
  const structured = asDict(lastResult.structuredContent);
  const passed = bool(structured.passed);
  const blockers = Array.isArray(structured.blockers) ? structured.blockers : [];
  const evidence = Array.isArray(structured.evidence) ? structured.evidence : [];
  return `<header class="topbar"><div><p class="eyebrow">Quality Gate</p><h1>计划收敛闸门</h1><p>核对规格、实现、测试和审查证据。</p></div><span class="pill ${passed ? 'ok' : 'bad'}">${passed ? '通过' : '未通过'}</span></header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <main class="dashboard"><section class="panel"><h2>结果</h2><dl class="facts"><div><dt>Plan ID</dt><dd>${escapeHtml(text(structured.planId, text(lastInput.plan_id, '—')))}</dd></div><div><dt>记忆写入</dt><dd>${bool(structured.memoryWriteAllowed) ? '允许' : '禁止'}</dd></div><div><dt>阻断项</dt><dd>${blockers.length}</dd></div><div><dt>证据</dt><dd>${evidence.length}</dd></div></dl></section><section class="panel"><h2>阻断项</h2>${blockers.length ? `<ul>${blockers.map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : pretty(item))}</li>`).join('')}</ul>` : '<div class="empty-state">没有阻断项。</div>'}<h2>证据</h2><pre>${escapeHtml(pretty(evidence))}</pre></section></main>`;
}

function render(): void {
  if (kind === 'memory-center') root.innerHTML = renderMemoryCenter();
  else if (kind === 'product-workbench') root.innerHTML = renderProductWorkbench();
  else if (kind === 'convergence') root.innerHTML = renderConvergence();
  else root.innerHTML = renderTaskWorkbench();
}

async function loadMemoryList(): Promise<void> {
  const result = await callTool('list_memory_assets', { limit: 100, include_inactive: true });
  memoryItems = asArray(asDict(result.structuredContent).items);
  selectedMemory = null;
  render();
}

async function searchMemory(query: string): Promise<void> {
  const includeInactive = (document.getElementById('include-inactive') as HTMLInputElement | null)?.checked ?? true;
  const result = await callTool('search_memory', { query, limit: 50, include_inactive: includeInactive });
  memoryItems = asArray(asDict(result.structuredContent).results);
  selectedMemory = null;
  render();
}

async function openMemory(id: string): Promise<void> {
  const result = await callTool('read_memory_asset', { asset_id: id });
  selectedMemory = asDict(asDict(result.structuredContent).asset);
  render();
  if (selectedMemory.id) {
    await app.updateModelContext({
      content: [{ type: 'text', text: `用户正在 Memory Center 查看记忆：${text(selectedMemory.name)} (${text(selectedMemory.id)})` }],
    }).catch(() => undefined);
  }
}

root.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  if (form.id !== 'memory-search') return;
  event.preventDefault();
  const query = text(new FormData(form).get('query')).trim();
  if (query) void searchMemory(query);
});

root.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target || busy) return;
  const action = target.dataset.action;
  const id = target.dataset.id || '';
  if (action === 'list-memory') void loadMemoryList();
  if (action === 'open-memory') void openMemory(id);
  if (action === 'mark-stale') void (async () => {
    await callTool('update_memory_asset', { asset_id: id, status: 'stale' });
    await openMemory(id);
  })();
  if (action === 'delete-memory') void (async () => {
    if (!window.confirm('确认删除这条记忆？此操作不可撤销。')) return;
    const preview = await callTool('delete_memory_asset', { asset_id: id, confirm: false });
    if (asDict(preview.structuredContent).requires_confirmation) {
      await callTool('delete_memory_asset', { asset_id: id, confirm: true });
    }
    await loadMemoryList();
  })();
  if (action === 'resume-plan' && id) void callTool('resume_plan', { plan_id: id, project_root: text(lastInput.project_root) });
  if (action === 'check-converge' && id) void callTool('converge', { plan_id: id, project_root: text(lastInput.project_root) }).then((result) => { lastResult = result; render(); });
  if (action === 'continue-chat') void app.sendMessage({ role: 'user', content: [{ type: 'text', text: '继续执行当前工作台中的计划，完成后运行测试并更新收敛证据。' }] });
  if (action === 'start-feature-chat') void app.sendMessage({ role: 'user', content: [{ type: 'text', text: '基于当前产品方案进入功能开发，使用 start_feature 创建规格和执行计划。' }] });
});

app.addEventListener('toolinput', (params) => {
  lastInput = asDict(params.arguments);
  render();
});

app.addEventListener('toolresult', (params) => {
  lastResult = params as ToolResult;
  if (kind === 'memory-center') {
    const structured = asDict(params.structuredContent);
    const results = asArray(structured.results);
    const asset = asDict(structured.asset);
    if (results.length) memoryItems = results;
    if (asset.id) selectedMemory = asset;
  }
  render();
});

app.addEventListener('hostcontextchanged', (context) => {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
});

async function main(): Promise<void> {
  render();
  await app.connect();
  const context = app.getHostContext();
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (kind === 'memory-center') await loadMemoryList();
}

void main().catch((error) => {
  notice = `MCP App 初始化失败：${error instanceof Error ? error.message : String(error)}`;
  render();
});
