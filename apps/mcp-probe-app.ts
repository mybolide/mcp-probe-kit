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

type DemoFrame = {
  input?: Dict;
  result?: ToolResult;
  memoryItems?: Dict[];
  memoryTotal?: number;
  selectedMemory?: Dict | null;
  planSnapshot?: Dict | null;
  notice?: string;
};

type DemoConfig = {
  enabled?: boolean;
  autoplay?: boolean;
  intervalMs?: number;
  frames?: DemoFrame[];
};

declare global {
  interface Window {
    __MCP_PROBE_DEMO__?: DemoConfig;
  }
}

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
let demoTimer: number | undefined;
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

function applyDemoFrame(frame: DemoFrame): void {
  if (frame.input) lastInput = asDict(frame.input);
  if (frame.result) {
    lastResult = frame.result;
    const receivedPlan = resultPlan(lastResult);
    if (asArray(receivedPlan.steps).length) basePlan = receivedPlan;
  }
  if (frame.memoryItems) {
    memoryItems = frame.memoryItems.map(asDict);
    memoryTotal = numeric(frame.memoryTotal, memoryItems.length);
  }
  if ('selectedMemory' in frame) {
    selectedMemory = frame.selectedMemory ? asDict(frame.selectedMemory) : null;
  }
  if ('planSnapshot' in frame) {
    planSnapshot = frame.planSnapshot ? asDict(frame.planSnapshot) : null;
  }
  notice = text(frame.notice);
  render();
}

function startDemoPlayback(config: DemoConfig): void {
  const frames = Array.isArray(config.frames) ? config.frames : [];
  if (!frames.length) {
    render();
    return;
  }
  const queryFrame = Number(new URLSearchParams(window.location.search).get('frame'));
  const fixedFrame = Number.isInteger(queryFrame) && queryFrame >= 0 && queryFrame < frames.length
    ? queryFrame
    : null;
  let index = fixedFrame ?? 0;
  applyDemoFrame(frames[index]);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  if (fixedFrame !== null || config.autoplay === false || reducedMotion || frames.length < 2) return;
  const intervalMs = Math.max(900, numeric(config.intervalMs, 1800));
  demoTimer = window.setInterval(() => {
    index = (index + 1) % frames.length;
    applyDemoFrame(frames[index]);
  }, intervalMs);
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

function lifecycleLabel(status: unknown): string {
  const normalized = text(status, 'active').toLowerCase();
  if (normalized === 'active') return '有效';
  if (normalized === 'stale') return '已过期';
  if (['invalid', 'deleted', 'expired'].includes(normalized)) return '已失效';
  return normalized || '未知';
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
  const selected = text(selectedMemory?.id) === id;
  return `<button class="memory-card${selected ? ' selected' : ''}" data-action="open-memory" data-id="${escapeHtml(id)}">
    <span class="card-head"><strong>${escapeHtml(text(item.name, id || '未命名'))}</strong><span class="status-dot ${statusClass(item.status)}"></span></span>
    <span class="summary">${escapeHtml(text(item.summary, text(item.description, '无摘要')))}</span>
    <span class="meta-line"><span>${escapeHtml(text(item.type, 'unknown'))}</span><span>${escapeHtml(formatDate(item.updatedAt))}</span></span>
  </button>`;
}

function renderMemoryDetail(): string {
  if (!selectedMemory) return `<section class="panel memory-detail empty-detail"><span>选择一条记忆</span></section>`;
  const item = selectedMemory;
  const evidence = stringArray(item.evidence);
  const applicability = text(item.applicability);
  return `<section class="panel memory-detail">
    <div class="detail-heading"><h2>${escapeHtml(text(item.name, '未命名记忆'))}</h2><span class="lifecycle-status ${statusClass(item.status)}"><span></span>${escapeHtml(lifecycleLabel(item.status))}</span></div>
    <div class="memory-meta"><span>${escapeHtml(text(item.type, 'unknown'))}</span><span>${escapeHtml(text(item.sourceProject, '共享'))}</span><span>${escapeHtml(formatDate(item.updatedAt))}</span></div>
    <div class="document-body">${escapeHtml(text(item.content, text(item.summary, '无内容')))}</div>
    ${(applicability || evidence.length) ? `<details class="detail-extra"><summary>边界与证据${evidence.length ? ` · ${evidence.length}` : ''}</summary>${applicability ? `<p>${escapeHtml(applicability)}</p>` : ''}${evidence.length ? `<ul class="evidence-list">${evidence.map((entry) => `<li>${icon('check')}<span>${escapeHtml(entry)}</span></li>`).join('')}</ul>` : ''}</details>` : ''}
    <div class="detail-actions"><button data-action="mark-stale" data-id="${escapeHtml(text(item.id))}">过期</button><button class="danger" data-action="delete-memory" data-id="${escapeHtml(text(item.id))}">删除</button></div>
  </section>`;
}

function renderMemoryCenter(): string {
  const visible = memoryItems.slice(0, visibleMemoryCount);
  return `<header class="minimal-header"><h1>记忆</h1><span>${memoryTotal || memoryItems.length}</span></header>
  <section class="panel memory-toolbar">
    <form id="memory-search" class="search-box">${icon('search')}<input id="memory-query" name="query" placeholder="搜索" autocomplete="off"><button class="primary" type="submit">搜索</button></form>
    <div class="toolbar-actions"><button data-action="list-memory">全部</button><label class="check-control"><input id="include-inactive" type="checkbox" checked><span>含失效</span></label></div>
  </section>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <main class="memory-layout"><section class="panel memory-index"><div class="memory-list">${visible.length ? visible.map(memoryCard).join('') : `<div class="empty-state compact-empty"><strong>无结果</strong></div>`}</div>${memoryItems.length > visible.length ? `<button class="load-more" data-action="load-more">更多 ${Math.min(18, memoryItems.length - visible.length)}</button>` : ''}</section>${renderMemoryDetail()}</main>`;
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
  const evidence = asArray(record.evidence);
  return { plan, record, steps, completed, skipped, status, currentStepId, nextStepId, evidence };
}

const STEP_LABELS: Record<string, string> = {
  'recall-memory': '召回记忆', context: '项目上下文', 'decompose-spec': '拆分子规格',
  'write-spec': '编写规格', 'check-spec': '规格检查', estimate: '工作量评估',
  'prepare-memory-candidate-feature': '沉淀候选', 'prepare-memory-candidate-bugfix': '沉淀候选',
};

const STATUS_LABELS: Record<string, string> = {
  completed: '已完成', running: '执行中', blocked: '已阻断', pending: '待执行', skipped: '已跳过',
};

const EVIDENCE_LABELS: Record<string, string> = {
  requirements: '需求', spec: '规格', implementation: '实现',
  test: '测试', review: '审查', memory: '记忆', other: '其他',
};

function stepStateLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

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

function renderPlanSteps(state: ReturnType<typeof currentPlanState>): string {
  if (!state.steps.length) {
    return '<div class="wb-empty-plan">等待 Host 提供计划数据</div>';
  }
  return `<ol class="plan-steps">${state.steps.map((step, index) => {
    const status = stepState(step, state);
    const marker = status === 'completed' ? '✓' : status === 'blocked' ? '!' : index + 1;
    return `<li class="plan-step ${status}" title="${escapeHtml(stepStateLabel(status))}">
      <span class="step-marker" aria-hidden="true">${escapeHtml(String(marker))}</span>
      <span class="step-name">${escapeHtml(stepLabel(step, index))}</span>
      <span class="step-hint">${escapeHtml(stepStateLabel(status))}</span>
    </li>`;
  }).join('')}</ol>`;
}

function renderTaskWorkbench(): string {
  const state = currentPlanState();
  const plan = state.plan;
  const completedCount = state.steps.filter((step) => ['completed', 'skipped'].includes(stepState(step, state))).length;
  const highlightedStepId = state.status === 'blocked'
    ? (state.currentStepId || state.nextStepId)
    : (state.nextStepId || state.currentStepId);
  const currentIndex = state.steps.findIndex((step) => text(step.id) === highlightedStepId);
  const currentStep = currentIndex >= 0 ? state.steps[currentIndex] : state.steps.find((step) => stepState(step, state) === 'pending');
  const displayIndex = currentStep ? state.steps.indexOf(currentStep) : -1;
  const objective = text(plan.objective, text(lastInput.description, kind === 'bug-workbench' ? '修复问题' : '实施功能'));
  const outputs = stringArray(currentStep?.outputs);
  const evidence = state.evidence.slice(0, 4);
  const planId = text(plan.planId);
  const total = state.steps.length || 0;
  const hasPlan = total > 0;
  const primaryLabel = !hasPlan
    ? '返回对话'
    : state.status === 'blocked'
      ? '处理阻断'
      : completedCount === total
        ? '查看结果'
        : '继续';
  const currentStatus = currentStep ? stepState(currentStep, state) : hasPlan ? 'completed' : 'pending';
  const percent = total ? Math.min(100, Math.round((completedCount / total) * 100)) : 0;
  const statusBadge = state.status === 'blocked'
    ? '<span class="status-badge bad">已阻断</span>'
    : state.status === 'converged'
      ? '<span class="status-badge ok">已收敛</span>'
      : state.status === 'cancelled'
        ? '<span class="status-badge bad">已取消</span>'
        : state.status === 'active'
          ? '<span class="status-badge run">执行中</span>'
          : '<span class="status-badge pending">待执行</span>';
  const blockedBanner = state.status === 'blocked'
    ? `<div class="blocked-banner">${icon('alert')}<span>当前步骤已阻断，处理后再继续执行</span></div>`
    : '';
  const planSteps = renderPlanSteps(state);
  const planHeading = `<div class="wb-plan-head"><span class="wb-plan-label">计划</span><span class="wb-plan-count">${completedCount}/${total || 0}</span></div>`;
  const outputsBlock = outputs.length
    ? `<div class="def"><dt>产出</dt><dd><span class="output-text">${outputs.map(escapeHtml).join('<span class="out-sep"> · </span>')}</span></dd></div>`
    : '';
  const evidenceBlock = evidence.length
    ? `<div class="def"><dt>证据${state.evidence.length > evidence.length ? ` · ${state.evidence.length}` : ''}</dt><dd>${evidence.map((entry) => `<div class="ev-row"><span class="ev-kind">${escapeHtml(EVIDENCE_LABELS[text(entry.kind)] || text(entry.kind, '其他'))}</span><span class="ev-text">${escapeHtml(text(entry.summary))}</span></div>`).join('')}</dd></div>`
    : '';
  const currentTitle = currentStep
    ? escapeHtml(stepLabel(currentStep, Math.max(displayIndex, 0)))
    : hasPlan
      ? '全部步骤已完成'
      : '等待计划数据';
  const emptyPlanHint = hasPlan
    ? ''
    : '<p class="wb-empty-hint">Host 尚未提供可用计划。可返回对话重新调用当前工具。</p>';
  return `<header class="minimal-header wb-header">
    <h1 title="${escapeHtml(objective)}">${kind === 'bug-workbench' ? 'Bug 修复' : '功能开发'} · ${escapeHtml(truncate(objective, 54))}</h1>
    <div class="wb-header-meta">${statusBadge}<span class="status-count">${hasPlan ? `已完成 <strong>${completedCount}</strong> / ${total} 步` : '计划未就绪'}</span><div class="progress-track"><span style="width:${percent}%"></span></div></div>
  </header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  ${blockedBanner}
  <section class="wb-shell">
    <div class="wb-grid">
      <aside class="wb-plan wb-plan-desktop" aria-label="计划步骤">${planHeading}${planSteps}</aside>
      <main class="wb-main">
        <div class="wb-current${currentStatus === 'running' ? ' is-running' : ''}${currentStatus === 'blocked' ? ' is-blocked' : ''}">
          <div class="wb-current-head">
            ${displayIndex >= 0 ? `<span class="wb-step-index">${displayIndex + 1}</span>` : ''}
            <h2>${currentTitle}</h2>
            <span class="wb-state ${currentStatus}">${stepStateLabel(currentStatus)}</span>
          </div>
          ${currentStep ? `<div class="wb-command"><code>${escapeHtml(text(currentStep.tool, text(currentStep.action, 'host action')))}</code>${text(currentStep.note) ? `<span>${escapeHtml(currentStep.note)}</span>` : ''}</div>` : ''}
          ${emptyPlanHint}
          ${(outputsBlock || evidenceBlock) ? `<dl class="wb-defs">${outputsBlock}${evidenceBlock}</dl>` : ''}
        </div>
        <div class="wb-actions task-actions task-actions-end">
          ${planId ? `<span class="wb-planid" title="${escapeHtml(planId)}">plan · ${escapeHtml(planId)}</span>` : ''}
          <div class="wb-buttons">
            ${planId ? `<button class="wb-secondary" data-action="resume-plan" data-id="${escapeHtml(planId)}">刷新</button>
            <button class="wb-secondary" data-action="check-converge" data-id="${escapeHtml(planId)}">收敛</button>` : ''}
            <button class="primary" data-action="continue-chat">${primaryLabel}</button>
          </div>
        </div>
      </main>
    </div>
    <details class="wb-plan-mobile">
      <summary><span class="wb-plan-label">计划步骤</span><span class="wb-plan-count">${completedCount}/${total || 0}</span></summary>
      ${planSteps}
    </details>
  </section>`;
}

function renderProductWorkbench(): string {
  const structured = asDict(lastResult.structuredContent);
  const metadata = asDict(structured.metadata);
  const plan = asDict(metadata.plan ?? structured.plan);
  const steps = asArray(plan.steps);
  const productBrief = asDict(metadata.productBrief);
  const productName = text(lastInput.product_name, text(lastInput.name, '产品方案'));
  const targetUsers = text(lastInput.target_users, text(productBrief.targetUsers, '待明确'));
  const constraints = text(lastInput.constraints, text(productBrief.constraints, '无'));
  return `<header class="minimal-header task-title"><h1 title="${escapeHtml(productName)}">产品设计 · ${escapeHtml(truncate(productName, 54))}</h1><span>${steps.length} 步</span></header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <section class="panel product-compact"><dl class="inline-facts"><div><dt>用户</dt><dd>${escapeHtml(targetUsers)}</dd></div><div><dt>约束</dt><dd>${escapeHtml(constraints)}</dd></div></dl><div class="compact-timeline">${steps.length ? steps.map((step, index) => `<div><span>${index + 1}</span><p><strong>${escapeHtml(stepLabel(step, index))}</strong><small>${escapeHtml(text(step.tool, text(step.action)))}</small></p></div>`).join('') : '<div class="empty-state compact-empty">等待计划</div>'}</div><div class="task-actions task-actions-end"><button data-action="continue-chat">继续完善</button><button class="primary" data-action="start-feature-chat">进入开发</button></div></section>`;
}

function renderConvergence(): string {
  const structured = asDict(lastResult.structuredContent);
  const passed = bool(structured.passed);
  const blockers = Array.isArray(structured.blockers) ? structured.blockers : [];
  const incomplete = stringArray(structured.incompleteStepIds);
  const missingEvidence = stringArray(structured.missingEvidenceKinds);
  const convergencePlanId = text(structured.planId, text(lastInput.plan_id, text(asDict(structured.plan).planId)));
  return `<header class="minimal-header"><h1>收敛</h1><span class="gate-state ${passed ? 'ok' : 'bad'}">${passed ? '通过' : '未通过'}</span></header>
  ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
  <section class="panel gate-compact">
    ${blockers.length ? `<div class="gate-section"><h2>阻断</h2><ul class="blocker-list">${blockers.map((item) => `<li>${icon('alert')}<span>${escapeHtml(typeof item === 'string' ? item : pretty(item))}</span></li>`).join('')}</ul></div>` : ''}
    ${incomplete.length ? `<div class="gate-section"><h2>未完成</h2><div class="evidence-chips">${incomplete.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div></div>` : ''}
    ${missingEvidence.length ? `<div class="gate-section"><h2>缺证据</h2><div class="evidence-chips">${missingEvidence.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div></div>` : ''}
    ${passed && !blockers.length && !incomplete.length && !missingEvidence.length ? '<div class="gate-clear">可交付</div>' : ''}
    <div class="gate-footer"><span>记忆写入：${bool(structured.memoryWriteAllowed) ? '允许' : '禁止'}</span><div class="task-actions">${passed ? '<button data-action="continue-chat">查看结果</button>' : '<button class="primary" data-action="return-plan">继续执行</button>'}${convergencePlanId ? `<button data-action="rerun-converge" data-id="${escapeHtml(convergencePlanId)}">重检</button>` : ''}</div></div>
  </section>`;
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
  if (window.__MCP_PROBE_DEMO__?.enabled) {
    event.preventDefault();
    return;
  }
  if (form.id !== 'memory-search') return;
  event.preventDefault();
  const query = text(new FormData(form).get('query')).trim();
  if (query) void searchMemory(query);
});

root.addEventListener('click', (event) => {
  if (window.__MCP_PROBE_DEMO__?.enabled) return;
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target || busy) return;
  const action = target.dataset.action;
  const id = target.dataset.id || '';
  if (action === 'list-memory') void loadMemoryList();
  if (action === 'load-more') { visibleMemoryCount += 18; render(); }
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
  if (action === 'resume-plan' && id) void refreshPlanState(true);
  if (action === 'check-converge' && id) void callTool('converge', { plan_id: id, project_root: text(lastInput.project_root) }).then((result) => { lastResult = result; render(); });
  if (action === 'rerun-converge' && id) void callTool('converge', { plan_id: id, project_root: text(lastInput.project_root) }).then((result) => { lastResult = result; render(); });
  if (action === 'return-plan') void app.sendMessage({ role: 'user', content: [{ type: 'text', text: '返回当前计划继续执行未完成步骤，补齐缺失证据。每完成一步调用 plan_heartbeat，完成后重新运行 converge。' }] });
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
  const demo = window.__MCP_PROBE_DEMO__;
  if (demo?.enabled) {
    startDemoPlayback(demo);
    return;
  }
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
