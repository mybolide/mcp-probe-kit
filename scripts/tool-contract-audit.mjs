import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const roots = [];
const clients = [];
const cleanupTasks = [];
const results = [];
const phantomTools = ['init_component_catalog', 'render_ui', 'gen_prd', 'gen_prototype'];
const compactHiddenTools = ['add_feature', 'fix_bug', 'sync_ui_data', 'ask_user'];

try {
  const projectRoot = await createFixtureProject();
  const memory = await startMemoryMock();

  const compact = await connect({ toolset: 'compact', projectRoot, memory: false, apps: false });
  const compactTools = new Set((await compact.client.listTools()).tools.map((tool) => tool.name));
  await auditToolSet('compact', compact, compactTools, compactFixtures(projectRoot), {
    forbiddenTextTools: [...compactHiddenTools, ...phantomTools],
  });

  const compactMemory = await connect({
    toolset: 'compact', projectRoot, memory: true, apps: false, memoryUrl: memory.url,
  });
  const compactMemoryTools = new Set((await compactMemory.client.listTools()).tools.map((tool) => tool.name));
  await auditMemoryTools(compactMemory, compactMemoryTools, projectRoot);
  for (const [name, args] of memoryClosureFixtures(projectRoot)) {
    await auditCall('compact-memory-closure', compactMemory.client, compactMemoryTools, name, args, {
      forbiddenTextTools: [...compactHiddenTools, ...phantomTools],
    });
  }

  const full = await connect({ toolset: 'full', projectRoot, memory: true, apps: false, memoryUrl: memory.url });
  const fullTools = new Set((await full.client.listTools()).tools.map((tool) => tool.name));
  await auditToolSet('full-compatibility', full, fullTools, fullFixtures(projectRoot), {
    forbiddenTextTools: phantomTools,
  });

  const apps = await connect({ toolset: 'compact', projectRoot, memory: true, apps: true, memoryUrl: memory.url });
  const rawAppTools = (await apps.client.listTools()).tools;
  const appToolNames = new Set(rawAppTools.map((tool) => tool.name));
  assert(appToolNames.has('list_memory_assets'), 'Apps tools/list missing list_memory_assets');
  await auditCall('app-only', apps.client, appToolNames, 'list_memory_assets', { limit: 20, offset: 0 }, {
    forbiddenTextTools: phantomTools,
  });
  const appDefinition = rawAppTools.find((tool) => tool.name === 'list_memory_assets');
  assert(JSON.stringify(appDefinition?._meta ?? {}).includes('app'), 'list_memory_assets is not marked app-only');

  const legacy = await connect({ toolset: 'compact', projectRoot, memory: false, apps: false, era: 'legacy' });
  const legacyTools = new Set((await legacy.client.listTools()).tools.map((tool) => tool.name));
  await auditCall('legacy-sample', legacy.client, legacyTools, 'workflow', {
    intent: '实现审计日志功能', scenario: 'feature', project_root: projectRoot,
  }, { forbiddenTextTools: [...compactHiddenTools, ...phantomTools] });

  const failed = results.filter((item) => !item.passed);
  const report = {
    passed: failed.length === 0,
    generatedAt: new Date().toISOString(),
    totals: { calls: results.length, passed: results.length - failed.length, failed: failed.length },
    surfaces: {
      compact: compactTools.size,
      compactWithMemory: compactMemoryTools.size,
      full: fullTools.size,
      appsRaw: appToolNames.size,
    },
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exitCode = 1;
} finally {
  await Promise.all(clients.splice(0).map(async ({ client, transport }) => {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }));
  await Promise.all(cleanupTasks.splice(0).map((task) => task()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

async function auditToolSet(surface, connection, visible, fixtures, options) {
  for (const [name, args] of fixtures) {
    assert(visible.has(name), `${surface} tools/list missing fixture tool ${name}`);
    await auditCall(surface, connection.client, visible, name, args, options);
  }
}

async function auditMemoryTools(connection, visible, projectRoot) {
  const create = await auditCall('compact-memory', connection.client, visible, 'memorize_asset', {
    name: 'Audit memory asset',
    type: 'pattern',
    description: 'Contract audit fixture',
    summary: 'Validated reusable audit fixture',
    content: 'Use contract audit fixtures to validate model-visible tool closure.',
    source_project: 'audit/project',
    confidence: 0.9,
    tags: ['audit', 'contract'],
  }, { forbiddenTextTools: [...compactHiddenTools, ...phantomTools] });
  const assetId = findString(create.structured, ['id', 'asset_id', 'assetId']);
  assert(assetId, 'memorize_asset did not return an asset id');

  await auditCall('compact-memory', connection.client, visible, 'search_memory', {
    query: 'contract audit fixture', limit: 5,
  }, { forbiddenTextTools: [...compactHiddenTools, ...phantomTools] });
  await auditCall('compact-memory', connection.client, visible, 'read_memory_asset', {
    asset_id: assetId,
  }, { forbiddenTextTools: [...compactHiddenTools, ...phantomTools] });
  await auditCall('compact-memory', connection.client, visible, 'update_memory_asset', {
    asset_id: assetId, summary: 'Updated audit fixture', status: 'active',
  }, { forbiddenTextTools: [...compactHiddenTools, ...phantomTools] });
  await auditCall('compact-memory', connection.client, visible, 'scan_and_extract_patterns', {
    content: 'export function stableRetry(task) { return task(); }',
    project_name: 'audit-project', max_patterns: 3,
  }, { forbiddenTextTools: [...compactHiddenTools, ...phantomTools] });
  await auditCall('compact-memory', connection.client, visible, 'delete_memory_asset', {
    asset_id: assetId, confirm: true,
  }, { forbiddenTextTools: [...compactHiddenTools, ...phantomTools] });
}

async function auditCall(surface, client, visible, name, args, options = {}) {
  const entry = { surface, tool: name, passed: false, errors: [], references: [] };
  try {
    const response = await client.callTool({ name, arguments: args });
    const text = (response.content ?? [])
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
    const structured = response.structuredContent;
    entry.isError = response.isError === true;
    entry.textChars = text.length;
    entry.hasStructuredContent = structured !== undefined;

    if (response.isError === true) entry.errors.push('fixture returned isError=true');
    if (!text.trim()) entry.errors.push('text guidance is empty');
    if (structured === undefined) entry.errors.push('structuredContent is missing');

    const refs = collectToolReferences(structured);
    entry.references = refs;
    for (const ref of refs) {
      if (!visible.has(ref)) entry.errors.push(`structured reference is not visible: ${ref}`);
      if (!text.includes(ref)) entry.errors.push(`structured reference missing from text: ${ref}`);
    }
    for (const forbidden of options.forbiddenTextTools ?? []) {
      const escaped = escapeRegExp(forbidden);
      const pattern = new RegExp('(?:调用|call|tool|工具)[^\\n]{0,80}\\b' + escaped + '\\b|`' + escaped + '`', 'i');
      if (pattern.test(text)) entry.errors.push(`text exposes unavailable/phantom tool: ${forbidden}`);
    }
    if (findPlanSteps(structured).some((step) => step.tool === 'manual')) {
      entry.errors.push('structured plan uses manual as a tool');
    }

    entry.passed = entry.errors.length === 0;
    entry.structured = structured;
    results.push(stripLarge(entry));
    return { text, structured, response };
  } catch (error) {
    entry.errors.push(error instanceof Error ? error.message : String(error));
    results.push(entry);
    return { text: '', structured: undefined, response: undefined };
  }
}

function compactFixtures(projectRoot) {
  return [
    ['init_project', { input: 'Create a small task CLI', project_name: 'audit-app', project_root: join(projectRoot, 'new-app') }],
    ['gencommit', { changes: 'Added contract audit and tests', type: 'test' }],
    ['git_work_report', { start_date: '2020-01-01', end_date: '2030-01-01' }],
    ['code_review', { code: 'export const add = (a, b) => a + b;', focus: 'quality' }],
    ['code_insight', { mode: 'query', query: 'tool registry', project_root: projectRoot }],
    ['refactor', { code: 'function f(x){return x}', goal: 'Improve naming and typing' }],
    ['gentest', { code: 'export const add = (a, b) => a + b;', framework: 'vitest' }],
    ['workflow', { intent: '实现用户认证和审计功能', scenario: 'feature', project_root: projectRoot }],
    ['init_project_context', { docs_dir: 'docs', project_root: projectRoot }],
    ['estimate', { task_description: 'Add authentication and audit logs', team_size: 2 }],
    ['check_spec', { feature_name: 'audit-feature', docs_dir: 'docs', project_root: projectRoot }],
    ['start_feature', { feature_name: 'audit-start-feature', description: 'Add account authentication', project_root: projectRoot, spec_layout: 'flat' }],
    ['start_bugfix', { error_message: 'GET /health returns 500', project_root: projectRoot }],
    ['start_onboard', { project_path: projectRoot, docs_dir: 'docs' }],
    ['start_ralph', { goal: 'Run one bounded audit iteration', max_iterations: 1, max_minutes: 1 }],
    ['interview', { description: 'Add organization invitations', feature_name: 'org-invitations' }],
    ['ui_design_system', { product_type: 'SaaS', description: 'Developer dashboard', stack: 'react' }],
    ['ui_search', { mode: 'catalog', category: 'components', limit: 3 }],
    ['start_ui', { description: 'Developer dashboard', framework: 'react', mode: 'manual', project_root: projectRoot }],
    ['start_product', { description: 'AI developer tool catalog for teams', product_name: 'Probe Hub', product_type: 'SaaS', docs_dir: 'docs', project_root: projectRoot }],
    ...planLifecycleFixtures(projectRoot),
  ];
}

function planLifecycleFixtures(projectRoot) {
  const plan = {
    planId: 'contract-audit-plan', mode: 'delegated', contractVersion: '2.0.0',
    workflow: 'feature', workflowVersion: '4.0.0-rc.2', objective: 'Audit plan lifecycle',
    steps: [{ id: 'verify', type: 'agent_action', action: 'verify', outputs: [] }],
    globalRules: [], completionCriteria: ['evidence complete'],
    memoryPolicy: { recallBeforeExecution: false, extractAfterValidation: false, writeOnlyReusableKnowledge: true, allowNegativeMemory: true },
  };
  return [
    ['plan_heartbeat', {
      plan_id: plan.planId, project_root: projectRoot, plan, completed_step_ids: ['verify'],
      last_verified_revision: 'audit-revision', unresolved_items: [],
      evidence: [
        { kind: 'requirements', summary: 'scope confirmed' },
        { kind: 'spec', summary: 'spec confirmed', reference: 'audit-spec' },
        { kind: 'implementation', summary: 'implementation confirmed', revision: 'audit-revision' },
        { kind: 'test', summary: 'tests passed', reference: 'audit-test' },
        { kind: 'review', summary: 'review passed', reference: 'audit-review' },
      ],
    }],
    ['resume_plan', { plan_id: plan.planId, project_root: projectRoot }],
    ['converge', { plan_id: plan.planId, project_root: projectRoot }],
  ];
}

function memoryClosureFixtures(projectRoot) {
  return [
    ['workflow', { intent: '实现带历史经验复用的登录功能', scenario: 'feature', project_root: projectRoot }],
    ['start_feature', { feature_name: 'memory-feature', description: 'Add login with reusable validation', project_root: projectRoot, spec_layout: 'flat' }],
    ['start_ui', { description: 'Login screen', framework: 'react', mode: 'manual', project_root: projectRoot }],
  ];
}

function fullFixtures(projectRoot) {
  return [
    ['add_feature', { feature_name: 'full-audit-feature', description: 'Compatibility spec fixture', docs_dir: 'docs', spec_layout: 'flat' }],
    ['fix_bug', { error_message: 'Compatibility fixture failure', project_root: projectRoot }],
    ['sync_ui_data', { check_only: true, verbose: false }],
    ['ask_user', { question: 'Confirm compatibility fixture?', context: 'contract audit' }],
  ];
}

async function connect({ toolset, projectRoot, memory, memoryUrl, apps, era = 'modern' }) {
  const env = {
    ...process.env,
    MCP_PROTOCOL_MODE: 'auto',
    MCP_TOOLSET: toolset,
    MCP_ENABLE_GITNEXUS_BRIDGE: '0',
    MCP_PROJECT_ROOT: projectRoot,
    MEMORY_QDRANT_URL: memory ? memoryUrl : '',
    MEMORY_QDRANT_COLLECTION: 'audit',
    MEMORY_EMBEDDING_URL: memory ? `${memoryUrl}/embed` : '',
    MEMORY_EMBEDDING_MODEL: memory ? 'audit-embed' : '',
    MEMORY_EMBEDDING_PROVIDER: 'ollama',
    MEMORY_REPO_ID: 'audit/project',
    MCP_ENABLE_UI_APPS: apps ? 'true' : 'false',
  };
  const transport = new StdioClientTransport({
    command: process.execPath, args: ['build/index.js'], cwd: process.cwd(), env, stderr: 'pipe',
  });
  const capabilities = apps
    ? { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } }
    : {};
  const client = new Client({ name: `tool-contract-${toolset}-${era}`, version: '1.0.0' }, { capabilities });
  client.setVersionNegotiation({ mode: era === 'legacy' ? 'legacy' : { pin: '2026-07-28' } });
  await client.connect(transport);
  clients.push({ client, transport });
  return { client, transport };
}

async function createFixtureProject() {
  const root = await mkdtemp(join(tmpdir(), 'mcp-tool-contract-'));
  roots.push(root);
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'docs', 'specs', 'audit-feature'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'audit-project', scripts: { test: 'node -e "process.exit(0)"' } }, null, 2));
  await writeFile(join(root, 'src', 'index.ts'), 'export const health = () => true;\n');
  await writeFile(join(root, 'docs', 'specs', 'audit-feature', 'requirements.md'), '# Requirements\n\n## FR-1\nThe audit MUST pass.\n\n### Acceptance Criteria\n- Contract report passes.\n');
  await writeFile(join(root, 'docs', 'specs', 'audit-feature', 'design.md'), '# Design\n\n## Architecture\nUse an MCP client fixture.\n\n## FR Coverage\n| FR | Design |\n|---|---|\n| FR-1 | Contract audit |\n');
  await writeFile(join(root, 'docs', 'specs', 'audit-feature', 'tasks.md'), '# Tasks\n\n- [x] 1. Run contract audit _Requirements: FR-1_\n');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'audit@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Contract Audit'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['commit', '-m', 'chore: initialize audit fixture'], { cwd: root, stdio: 'ignore' });
  return root;
}

async function startMemoryMock() {
  const points = new Map();
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, data) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === '/embed') return send(200, { embedding: [0.1, 0.2, 0.3, 0.4] });
    if (/\/collections\/[^/]+$/.test(url.pathname)) return send(200, { result: { status: 'green' } });
    if (url.pathname.endsWith('/points/scroll')) {
      return send(200, { result: { points: [...points.values()].map((point) => ({ id: point.id, payload: point.payload })), next_page_offset: null } });
    }
    if (url.pathname.endsWith('/points/search')) {
      return send(200, { result: [...points.values()].map((point) => ({ id: point.id, score: 0.95, payload: point.payload })) });
    }
    if (url.pathname.endsWith('/points/delete')) {
      for (const id of body.points ?? []) points.delete(String(id));
      return send(200, { result: { status: 'completed' } });
    }
    const pointMatch = url.pathname.match(/\/points\/([^/]+)$/);
    if (pointMatch && req.method === 'GET') {
      const point = points.get(decodeURIComponent(pointMatch[1]));
      return send(200, { result: point ? { id: point.id, payload: point.payload } : null });
    }
    if (url.pathname.includes('/points') && req.method === 'PUT') {
      for (const point of body.points ?? []) points.set(String(point.id), point);
      return send(200, { result: { status: 'completed' } });
    }
    return send(200, { result: true });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  cleanupTasks.push(() => new Promise((resolve) => server.close(resolve)));
  return { url };
}

function collectToolReferences(value) {
  const refs = new Set();
  const visit = (node, path = []) => {
    if (Array.isArray(node)) return node.forEach((item, index) => visit(item, [...path, String(index)]));
    if (!node || typeof node !== 'object') return;
    for (const [childKey, child] of Object.entries(node)) {
      const childPath = [...path, childKey];
      const insideHandles = childPath.includes('handles');
      if (!insideHandles && ['tool', 'next_tool', 'firstTool'].includes(childKey) && typeof child === 'string' && child) {
        refs.add(child);
      }
      visit(child, childPath);
    }
  };
  visit(value);
  return [...refs].sort();
}

function findPlanSteps(value) {
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.steps)) found.push(...node.steps.filter((step) => step && typeof step === 'object'));
    Object.values(node).forEach(visit);
  };
  visit(value);
  return found;
}

function findString(value, keys) {
  if (!value || typeof value !== 'object') return '';
  for (const key of keys) if (typeof value[key] === 'string') return value[key];
  for (const child of Object.values(value)) {
    const found = findString(child, keys);
    if (found) return found;
  }
  return '';
}

function stripLarge(entry) {
  const { structured, ...rest } = entry;
  return rest;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
