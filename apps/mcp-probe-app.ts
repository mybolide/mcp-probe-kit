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
let memoryTotal = 0;
let visibleMemoryCount = 18;
let selectedMemory: Dict | null = null;
let basePlan: Dict = {};
let planSnapshot: Dict | null = null;
let planPollTimer: number | undefined;
let descriptionExpanded = false;
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numeric(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
  if (['active', 'ok', 'passed', 'completed', 'converged'].includes(normalized)) return 'ok';
  if (['blocked', 'failed', 'invalid', 'cancelled'].includes(normalized)) return 'bad';
  return 'warn';
}

function formatDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function truncate(value: string, max = 44): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function icon(name: 'memory' | 'search' | 'empty' | 'plan' | 'check' | 'alert'): string {
  const paths: Record<string, string> = {
    memory: '<path d="M8 6h8M8 10h8M8 14h5"/><rect x="4" y="3" width="16" height="18" rx="3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    empty: '<path d="M4 7h16M7 3h10l3 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7l3-4Z"/><path d="M9 12h6"/>',
    plan: '<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

async function callTool(name: string, args: Dict, silent = false): Promise<ToolResult> {
  if (!silent) {
    busy = true;
    notice = `正在调用 ${name}…`;
    render();
  }
  try {
    const result = (await app.callServerTool({ name, arguments: args })) as ToolResult;
    if (!silent) notice = result.isError ? `${name} 返回错误` : `${name} 已完成`;
    return result;
  } catch (error) {
    if (!silent) notice = `${name} 调用失败：${error instanceof Error ? error.message : String(error)}`;
    return { isError: true };
  } finally {
    if (!silent) busy = false;
    render();
  }
}

function memoryCard(item: Dict): string {
  const id = text(item.id);
  const tags = stringArray(item.tags).slice(0, 4);
  const selected = text(selectedMemory?.id) === id;
  return `<button class="memory-card${selected ? ' selected' : ''}" data-action="open-memory" data-id="${escapeHtml(id)}">
    <span class="card-head"><strong>${escapeHtml(text(item.name, id || '未命名记忆'))}</strong><span class="status-dot ${statusClass(item.status)}"></span></span>
    <span class="summary">${escapeHtml(text(item.summary, text(item.description, '无摘要')))}</span>
    <span class="meta-line"><span>${escapeHtml(text(item.type, 'unknown'))}</span><span>${escapeHtml(formatDate(item.updatedAt))}</span></span>
    ${tags.length ? `<span class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</span>` : ''}
  </button>`;
}

function renderMemoryDetail(): string {
  if (!selectedMemory) {
    return `<section class="panel memory-detail empty-detail"><div class="empty-visual">${icon('memory')}</div><div><h2>选择一条记忆</h2><p>在左侧选择记录，查看完整内容、来源、证据和生命周期状态。</p></div></section>`;
  }
  const item = selectedMemory;
  const evidence = stringArray(item.evidence);
  const tags = stringArray(item.tags);
  return `<section class="panel memory-detail">
    <div class="detail-title"><div><div class="section-kicker">记忆详情</div><h2>${escapeHtml(text(item.name, '未命名记忆'))}</h2><p>${escapeHtml(text(item.description))}</p></div><span class="pill ${statusClass(item.status)}">${escapeHtml(text(item.status, 'active'))}</span></div>
    <dl class="facts compact">
      <div><dt>类型</dt><dd>${escapeHtml(text(item.type, 'unknown'))}</dd></div>
      <div><dt>可信度</dt><dd>${escapeHtml(item.confidence ?? '—')}</dd></div>
      <div><dt>来源范围</dt><dd>${escapeHtml(text(item.sourceProject, '共享记忆'))}</dd></div>
      <div><dt>更新时间</dt><dd>${escapeHtml(formatDate(item.updatedAt))}</dd></div>
    </dl>
    ${tags.length ? `<div class="tags detail-tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <div class="content-section"><h3>摘要</h3><p>${escapeHtml(text(item.summary, '无摘要'))}</p></div>
    <div class="content-section"><h3>完整内容</h3><div class="document-body">${escapeHtml(text(item.content, '无内容'))}</div></div>
    ${text(item.applicability) ? `<div class="content-section"><h3>适用边界</h3><p>${escapeHtml(item.applicability)}</p></div>` : ''}
    ${evidence.length ? `<div class="content-section"><h3>验证证据</h3><ul class="evidence-list">${evidence.map((entry) => `<li>${icon('check')}<span>${escapeHtml(entry)}</span></li>`).join('')}</ul></div>` : ''}
    <div class="detail-actions"><button data-action="mark-stale" data-id="${escapeHtml(text(item.id))}">标记过期</button><button class="danger" data-action="delete-memory" data-id="${escapeHtml(text(item.id))}">删除记忆</button></div>
  </section>`;
}

function renderMemoryCenter(): string {
  const activeCount = memoryItems.filter((item) => text(item.status, 'active') === 'active').length;
  const inactiveCount = Math.max(0, memoryItems.length - activeCount);
  const visible = memoryItems.slice(0, visibleMemoryCount);
  return `<header class="app-header"><div class="brand-block"><div class="app-mark">${icon('memory')}</div><div><p class="eyebrow">Memory Center</p><h1>记忆中心</h1><p>搜索、审阅和治理可复用的项目经验。</p></div></div><span class="connection"><span></span>${busy ? '处理中' : '已连接'}</span></header>
  <section class="panel memory-toolbar">
    <form id="memory-search" class="search-box">${icon('search')}<input id="memory-query" name="query" placeholder="搜索错误信息、模块、方案或经验" autocomplete="off"><button class="primary" type="submit">搜索</button></form>
    <div class="toolbar-actions"><button data-action="list-memory">全部记忆</button><label class="check-control"><input id="include-inactive" type="checkbox" checked><span>包含失效记录</span></label></div>
  </section>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <section class="memory-stats"><div><strong>${memoryTotal || memoryItems.length}</strong><span>记录总数</span></div><div><strong>${activeCount}</strong><span>当前活跃</span></div><div><strong>${inactiveCount}</strong><span>过期或失效</span></div></section>
  <main class="memory-layout"><section class="panel memory-index"><div class="section-head"><div><div class="section-kicker">知识索引</div><h2>历史记忆</h2></div><span>${memoryItems.length} 条结果</span></div><div class="memory-list">${visible.length ? visible.map(memoryCard).join('') : `<div class="empty-state">${icon('empty')}<strong>暂无匹配结果</strong><span>调整关键词，或点击“全部记忆”重新加载。</span></div>`}</div>${memoryItems.length > visible.length ? `<button class="load-more" data-action="load-more">再显示 ${Math.min(18, memoryItems.length - visible.length)} 条</button>` : ''}</section>${renderMemoryDetail()}</main>`;
}

function resultPlan(result: ToolResult = lastResult): Dict {
  const structured = asDict(result.structuredContent);
  const metadata = asDict(structured.metadata);
  return asDict(metadata.plan ?? structured.plan);
}

function initialPlan(): Dict {
  return Object.keys(basePlan).length ? basePlan : resultPlan();
}

function currentPlanState() {
  const snapshot = asDict(planSnapshot);
  const record = asDict(snapshot.record);
  const plan = Object.keys(asDict(record.plan)).length ? asDict(record.plan) : initialPlan();
  const completed = new Set(stringArray(record.completedStepIds));
  const skipped = new Set(asArray(record.skippedSteps).map((item) => text(item.stepId)));
  const status = text(record.status, Object.keys(record).length ? 'active' : 'pending');
  const steps = asArray(plan.steps);
  const nextStepId = text(snapshot.nextStepId);
  const currentStepId = text(record.currentStepId);
  return { plan, record, steps, completed, skipped, status, currentStepId, nextStepId };
}

const STEP_LABELS: Record<string, string> = {
  'recall-memory': '召回记忆', context: '项目上下文', 'decompose-spec': '拆分子规格',
  'write-spec': '编写规格', 'check-spec': '规格检查', estimate: '工作量评估',
  'prepare-memory-candidate-feature': '沉淀候选', 'prepare-memory-candidate-bugfix': '沉淀候选',
};

function stepLabel(step: Dict, index: number): string {
  const id = text(step.id, `step-${index + 1}`);
  return STEP_LABELS[id] || text(step.title, text(step.description, id));
}

function stepState(step: Dict, state: ReturnType<typeof currentPlanState>): string {
  const id = text(step.id);
  if (state.status === 'converged' || state.completed.has(id)) return 'completed';
  if (state.skipped.has(id)) return 'skipped';
  if (state.currentStepId === id) return state.status === 'blocked' ? 'blocked' : 'running';
  return 'pending';
}

function renderStepper(state: ReturnType<typeof currentPlanState>): string {
  return `<div class="stepper" style="--step-count:${Math.max(1, state.steps.length)}">${state.steps.map((step, index) => {
    const status = stepState(step, state);
    const marker = status === 'completed' ? '✓' : status === 'blocked' ? '!' : index + 1;
    return `<div class="step-node ${status}"><div class="step-track"><span>${marker}</span></div><strong>${escapeHtml(stepLabel(step, index))}</strong><small>${status === 'completed' ? '已完成' : status === 'running' ? '进行中' : status === 'blocked' ? '已阻断' : status === 'skipped' ? '已跳过' : '等待中'}</small></div>`;
  }).join('')}</div>`;
}

function renderTaskWorkbench(): string {
  const state = currentPlanState();
  const plan = state.plan;
  const layout = asDict(asDict(lastResult.structuredContent).metadata).layoutDecision;
  const completedCount = state.steps.filter((step) => ['completed', 'skipped'].includes(stepState(step, state))).length;
  const progress = state.steps.length ? Math.round((completedCount / state.steps.length) * 100) : 0;
  const highlightedStepId = state.status === 'blocked'
    ? (state.currentStepId || state.nextStepId)
    : (state.nextStepId || state.currentStepId);
  const currentIndex = state.steps.findIndex((step) => text(step.id) === highlightedStepId);
  const currentStep = currentIndex >= 0 ? state.steps[currentIndex] : state.steps.find((step) => stepState(step, state) === 'pending');
  const currentVisualState = currentStep ? stepState(currentStep, state) : 'completed';
  const currentStatusLabel = currentVisualState === 'blocked'
    ? '已阻断'
    : currentVisualState === 'running'
      ? '进行中'
      : currentStep
        ? '下一步'
        : '完成';
  const planId = text(plan.planId, '—');
  const objective = text(lastInput.description, text(plan.objective, '等待工具结果…'));
  const workflow = text(plan.workflow, kind === 'bug-workbench' ? 'bugfix' : 'feature');
  const outputs = stringArray(currentStep?.outputs);
  return `<header class="app-header workbench-header"><div><p class="eyebrow">Development Workbench</p><h1>${kind === 'bug-workbench' ? 'Bug 修复工作台' : '功能开发工作台'}</h1><div class="objective${descriptionExpanded ? ' expanded' : ''}">${escapeHtml(objective)}</div><button class="text-button" data-action="toggle-description">${descriptionExpanded ? '收起需求' : '展开完整需求'}</button></div><span class="pill ${statusClass(state.status)}">${escapeHtml(workflow)}</span></header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <section class="panel progress-panel"><div class="progress-head"><div><span>计划进度</span><strong>${completedCount} / ${state.steps.length || 0}</strong></div><span>${progress}%</span></div><div class="progress-bar"><span style="width:${progress}%"></span></div>${renderStepper(state)}</section>
  <main class="workbench-grid"><section class="panel plan-overview"><div class="section-kicker">计划概览</div><h2>${escapeHtml(text(plan.objective, kind === 'bug-workbench' ? '定位并修复问题' : '实施新功能'))}</h2><div class="plan-chips"><span>${escapeHtml(text(asDict(layout).resolved, text(lastInput.spec_layout, 'auto')))}</span><span>${escapeHtml(text(plan.mode, 'delegated'))}</span><span>${state.steps.length} 个步骤</span></div><div class="plan-id"><span>Plan ID</span><code>${escapeHtml(truncate(planId, 42))}</code><button data-action="copy-plan" data-id="${escapeHtml(planId)}">复制</button></div><div class="actions stacked"><button class="primary" data-action="continue-chat">${state.status === 'blocked' ? '处理阻断项' : progress === 100 ? '查看完成结果' : '继续执行'}</button><button data-action="resume-plan" data-id="${escapeHtml(planId)}">刷新进度</button><button data-action="check-converge" data-id="${escapeHtml(planId)}">检查收敛</button></div></section>
  <section class="panel current-step"><div class="section-head"><div><div class="section-kicker">当前步骤</div><h2>${currentStep ? escapeHtml(stepLabel(currentStep, Math.max(currentIndex, 0))) : '计划已完成'}</h2></div><span class="pill ${currentVisualState === 'blocked' ? 'bad' : currentVisualState === 'completed' ? 'ok' : 'warn'}">${currentStatusLabel}</span></div>${currentStep ? `<div class="step-command"><span>${currentStep.tool ? 'MCP 工具' : 'Agent 动作'}</span><code>${escapeHtml(text(currentStep.tool, text(currentStep.action, 'host action')))}</code></div>${text(currentStep.note) ? `<p class="step-note">${escapeHtml(currentStep.note)}</p>` : ''}${outputs.length ? `<div class="output-list"><h3>预期产出</h3>${outputs.map((item) => `<div>${icon('check')}<span>${escapeHtml(item)}</span></div>`).join('')}</div>` : ''}` : `<div class="empty-state compact-empty">${icon('check')}<strong>全部步骤已完成</strong><span>运行收敛检查，确认规格、实现、测试和审查证据。</span></div>`}</section></main>`;
}

function renderProductWorkbench(): string {
  const structured = asDict(lastResult.structuredContent);
  const metadata = asDict(structured.metadata);
  const plan = asDict(metadata.plan ?? structured.plan);
  const steps = asArray(plan.steps);
  return `<header class="app-header"><div><p class="eyebrow">Product Workbench</p><h1>产品设计工作台</h1><p>${escapeHtml(text(lastInput.description, text(structured.summary, '从目标、用户和约束形成可执行产品方案。')))}</p></div><span class="pill warn">product</span></header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <main class="product-grid"><section class="panel"><div class="section-kicker">产品定义</div><h2>${escapeHtml(text(lastInput.product_name, text(lastInput.name, '当前产品方案')))}</h2><dl class="facts compact"><div><dt>目标用户</dt><dd>${escapeHtml(text(lastInput.target_users, '待明确'))}</dd></div><div><dt>约束条件</dt><dd>${escapeHtml(text(lastInput.constraints, '按当前输入'))}</dd></div></dl><details><summary>查看原始输入</summary><pre>${escapeHtml(pretty(lastInput))}</pre></details></section><section class="panel"><div class="section-head"><div><div class="section-kicker">交付路径</div><h2>产品到开发</h2></div><span>${steps.length} 步</span></div><div class="compact-timeline">${steps.length ? steps.map((step, index) => `<div><span>${index + 1}</span><p><strong>${escapeHtml(stepLabel(step, index))}</strong><small>${escapeHtml(text(step.tool, text(step.action)))}</small></p></div>`).join('') : '<div class="empty-state compact-empty">等待产品计划结果。</div>'}</div><div class="actions"><button data-action="continue-chat">继续完善</button><button class="primary" data-action="start-feature-chat">进入功能开发</button></div></section></main>`;
}

function renderConvergence(): string {
  const structured = asDict(lastResult.structuredContent);
  const passed = bool(structured.passed);
  const blockers = Array.isArray(structured.blockers) ? structured.blockers : [];
  const incomplete = stringArray(structured.incompleteStepIds);
  const missingEvidence = stringArray(structured.missingEvidenceKinds);
  return `<header class="app-header"><div><p class="eyebrow">Quality Gate</p><h1>计划收敛闸门</h1><p>以规格、实现、测试和审查证据判断计划是否真正完成。</p></div><span class="pill ${passed ? 'ok' : 'bad'}">${passed ? '已通过' : '未通过'}</span></header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <section class="panel convergence-hero ${passed ? 'passed' : 'blocked'}"><div class="gate-icon">${icon(passed ? 'check' : 'alert')}</div><div><div class="section-kicker">收敛结果</div><h2>${passed ? '计划已具备完成证据' : '仍有事项阻止计划完成'}</h2><p>${escapeHtml(text(structured.nextAction, passed ? '可以进入交付与记忆沉淀。' : '处理下列阻断项后重新检查。'))}</p></div><dl><div><dt>未完成步骤</dt><dd>${incomplete.length}</dd></div><div><dt>缺失证据</dt><dd>${missingEvidence.length}</dd></div><div><dt>记忆写入</dt><dd>${bool(structured.memoryWriteAllowed) ? '允许' : '禁止'}</dd></div></dl></section>
  <main class="convergence-grid"><section class="panel"><div class="section-kicker">阻断项</div><h2>${blockers.length ? `${blockers.length} 项待处理` : '没有阻断项'}</h2>${blockers.length ? `<ul class="blocker-list">${blockers.map((item) => `<li>${icon('alert')}<span>${escapeHtml(typeof item === 'string' ? item : pretty(item))}</span></li>`).join('')}</ul>` : `<div class="empty-state compact-empty">${icon('check')}<strong>闸门已清空</strong></div>`}</section><section class="panel"><div class="section-kicker">证据缺口</div><h2>验证覆盖</h2><div class="evidence-chips">${missingEvidence.length ? missingEvidence.map((item) => `<span>${escapeHtml(item)}</span>`).join('') : '<span class="complete">证据类型齐全</span>'}</div>${incomplete.length ? `<h3>未完成步骤</h3><div class="evidence-chips">${incomplete.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}</section></main>`;
}

function render(): void {
  if (kind === 'memory-center') root.innerHTML = renderMemoryCenter();
  else if (kind === 'product-workbench') root.innerHTML = renderProductWorkbench();
  else if (kind === 'convergence') root.innerHTML = renderConvergence();
  else root.innerHTML = renderTaskWorkbench();
}

async function loadMemoryList(): Promise<void> {
  const result = await callTool('list_memory_assets', { limit: 100, include_inactive: true });
  const structured = asDict(result.structuredContent);
  memoryItems = asArray(structured.items);
  memoryTotal = numeric(structured.total, memoryItems.length);
  visibleMemoryCount = 18;
  selectedMemory = null;
  render();
}

async function searchMemory(query: string): Promise<void> {
  const includeInactive = (document.getElementById('include-inactive') as HTMLInputElement | null)?.checked ?? true;
  const result = await callTool('search_memory', { query, limit: 50, include_inactive: includeInactive });
  memoryItems = asArray(asDict(result.structuredContent).results);
  memoryTotal = memoryItems.length;
  visibleMemoryCount = 18;
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

async function refreshPlanState(showNotice = false): Promise<void> {
  const planId = text(currentPlanState().plan.planId);
  if (!planId) return;
  const result = await callTool('resume_plan', {
    plan_id: planId,
    project_root: text(lastInput.project_root),
  }, !showNotice);
  const structured = asDict(result.structuredContent);
  if (bool(structured.found)) planSnapshot = structured;
  render();
}

function syncPlanPolling(): void {
  if (kind !== 'feature-workbench' && kind !== 'bug-workbench') return;
  if (planPollTimer !== undefined) window.clearInterval(planPollTimer);
  const planId = text(currentPlanState().plan.planId);
  if (!planId) return;
  planPollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && currentPlanState().status !== 'converged') {
      void refreshPlanState(false);
    }
  }, 4000);
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
  if (action === 'load-more') { visibleMemoryCount += 18; render(); }
  if (action === 'open-memory') void openMemory(id);
  if (action === 'toggle-description') { descriptionExpanded = !descriptionExpanded; render(); }
  if (action === 'copy-plan' && id) void navigator.clipboard.writeText(id).then(() => { notice = 'Plan ID 已复制'; render(); });
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
  if (action === 'resume-plan' && id) void refreshPlanState(true);
  if (action === 'check-converge' && id) void callTool('converge', { plan_id: id, project_root: text(lastInput.project_root) }).then((result) => { lastResult = result; render(); });
  if (action === 'continue-chat') void app.sendMessage({ role: 'user', content: [{ type: 'text', text: '继续执行当前工作台中的计划。每完成一步都调用 plan_heartbeat 写入真实步骤状态和证据，最后运行测试并检查收敛。' }] });
  if (action === 'start-feature-chat') void app.sendMessage({ role: 'user', content: [{ type: 'text', text: '基于当前产品方案进入功能开发，使用 start_feature 创建规格和执行计划。' }] });
});

app.addEventListener('toolinput', (params) => {
  lastInput = asDict(params.arguments);
  render();
});

app.addEventListener('toolresult', (params) => {
  lastResult = params as ToolResult;
  const receivedPlan = resultPlan(lastResult);
  if (asArray(receivedPlan.steps).length) basePlan = receivedPlan;
  if (kind === 'memory-center') {
    const structured = asDict(params.structuredContent);
    const results = asArray(structured.results);
    const items = asArray(structured.items);
    const asset = asDict(structured.asset);
    if (results.length) { memoryItems = results; memoryTotal = results.length; }
    if (items.length) { memoryItems = items; memoryTotal = numeric(structured.total, items.length); }
    if (asset.id) selectedMemory = asset;
  }
  render();
  syncPlanPolling();
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
  syncPlanPolling();
}

void main().catch((error) => {
  notice = `MCP App 初始化失败：${error instanceof Error ? error.message : String(error)}`;
  render();
});
