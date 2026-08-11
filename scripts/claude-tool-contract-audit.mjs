import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const CLAUDE_COMMAND = resolveClaudeCommand();

function resolveClaudeCommand() {
  const configured = process.env.CLAUDE_COMMAND?.trim();
  if (process.platform !== 'win32') return configured || 'claude';

  const directCandidates = [];
  if (configured) {
    if (/\.(?:cmd|bat)$/i.test(configured)) {
      directCandidates.push(
        join(dirname(resolve(configured)), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      );
    } else {
      directCandidates.push(configured);
    }
  }
  directCandidates.push(
    join(dirname(process.execPath), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
  );

  const direct = directCandidates.find((candidate) => existsSync(candidate));
  return direct || configured || 'claude';
}

async function inspectAgentsMdIntegrity(projectRoot) {
  const agentsPath = join(projectRoot, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    return {
      passed: false,
      missing: true,
      beginCount: 0,
      endCount: 0,
      titleCount: 0,
      bytes: 0,
    };
  }
  const content = await readFile(agentsPath, 'utf8');
  const beginCount = (content.match(/<!-- mcp-probe:context begin/g) || []).length;
  const endCount = (content.match(/<!-- mcp-probe:context end -->/g) || []).length;
  const titleCount = (content.match(/^## MCP(?:（必须先调）| \(call first\))$/gm) || []).length;
  return {
    passed: beginCount === 1 && endCount === 1 && titleCount === 1,
    beginCount,
    endCount,
    titleCount,
    bytes: Buffer.byteLength(content),
  };
}
const BUILD_ENTRY = resolve('build/index.js');
const batches = [];
const cleanup = [];
const AUDIT_ONLY = new Set((process.env.CLAUDE_AUDIT_ONLY || '').split(',').map((item) => item.trim()).filter(Boolean));

try {
  assertClaudeAvailable();
  const projectRoot = await createFixtureProject();
  const memory = await startMemoryMock();
  const configs = {
    compact: await writeMcpConfig(projectRoot, 'compact', false, memory.url),
    memory: await writeMcpConfig(projectRoot, 'compact', true, memory.url),
    full: await writeMcpConfig(projectRoot, 'full', true, memory.url),
  };

  batches.push(await runBatch({
    id: 'project-routing',
    config: configs.compact,
    tools: ['init_project', 'workflow', 'init_project_context', 'estimate', 'check_spec'],
    calls: [
      ['init_project', { input: 'Create a minimal audit task CLI', project_name: 'agent-audit-app', project_root: join(projectRoot, 'new-app') }],
      ['workflow', { intent: '实现用户认证和审计日志功能', scenario: 'feature', project_root: projectRoot }],
      ['init_project_context', { docs_dir: 'docs', project_root: projectRoot }],
      ['estimate', { task_description: 'Add authentication and audit logs', team_size: 2, experience_level: 'senior' }],
      ['check_spec', { feature_name: 'audit-feature', docs_dir: 'docs', project_root: projectRoot }],
    ],
  }));

  batches.push(await runBatch({
    id: 'architecture-empty-assess',
    config: configs.compact,
    tools: ['architecture'],
    calls: [[
      'architecture',
      {
        mode: 'assess',
        description: '评估支付模块拆分',
        project_root: projectRoot,
        collect_evidence: false,
        current_facts: [],
        structural_causes: [],
        protected_invariants: [],
      },
    ]],
    dynamicInstructions: [
      'The tool call itself should succeed but the assessment gate must not pass: validation.passed=false, only ARC-1 completed, ARC-2 and ARC-3 blocked, with explicit evidence gaps.',
    ],
  }));

  batches.push(await runBatch({
    id: 'init-context-only',
    config: configs.compact,
    tools: ['init_project_context'],
    calls: [[
      'init_project_context',
      { docs_dir: 'docs', project_root: projectRoot },
    ]],
  }));

  batches.push(await runBatch({
    id: 'git-report-only',
    config: configs.compact,
    tools: ['git_work_report'],
    calls: [[
      'git_work_report',
      { start_date: '2020-01-01', end_date: '2030-01-01', project_root: projectRoot },
    ]],
  }));

  batches.push(await runBatch({
    id: 'code-review-only',
    config: configs.compact,
    tools: ['code_review'],
    calls: [[
      'code_review',
      { code: 'export const add = (a, b) => a + b;', focus: 'quality' },
    ]],
  }));

  batches.push(await runBatch({
    id: 'memory-search-only',
    config: configs.memory,
    tools: ['search_memory'],
    calls: [[
      'search_memory',
      { query: 'Agent audit memory', limit: 5 },
    ]],
  }));

  batches.push(await runBatch({
    id: 'project-core-a',
    config: configs.compact,
    tools: ['init_project', 'workflow'],
    calls: [
      ['init_project', { input: 'Create a minimal audit task CLI', project_name: 'agent-audit-small', project_root: join(projectRoot, 'small-app') }],
      ['workflow', { intent: '实现用户认证和审计日志功能', scenario: 'feature', project_root: projectRoot }],
    ],
  }));

  batches.push(await runBatch({
    id: 'project-core-b',
    config: configs.compact,
    tools: ['init_project_context', 'estimate', 'check_spec'],
    calls: [
      ['init_project_context', { docs_dir: 'docs', project_root: projectRoot }],
      ['estimate', { task_description: 'Add authentication and audit logs', team_size: 2, experience_level: 'senior' }],
      ['check_spec', { feature_name: 'audit-feature', docs_dir: 'docs', project_root: projectRoot }],
    ],
  }));

  batches.push(await runBatch({
    id: 'code-git-a',
    config: configs.compact,
    tools: ['gencommit', 'git_work_report', 'code_review'],
    calls: [
      ['gencommit', { changes: 'Added final acceptance closure tests', type: 'test' }],
      ['git_work_report', { start_date: '2020-01-01', end_date: '2030-01-01', project_root: projectRoot }],
      ['code_review', { code: 'export const add = (a, b) => a + b;', focus: 'quality' }],
    ],
  }));

  batches.push(await runBatch({
    id: 'code-git-b',
    config: configs.compact,
    tools: ['code_insight', 'refactor', 'gentest'],
    calls: [
      ['code_insight', { mode: 'query', query: 'tool registry', project_root: projectRoot }],
      ['refactor', { code: 'function f(x){return x}', goal: 'Improve naming and typing' }],
      ['gentest', { code: 'export const add = (a, b) => a + b;', framework: 'vitest' }],
    ],
  }));

  batches.push(await runBatch({
    id: 'workflow-spec-only',
    config: configs.compact,
    tools: ['workflow'],
    calls: [[
      'workflow',
      {
        intent: '输出退款功能的规格文档，不进行代码实现。',
        project_root: projectRoot,
      },
    ]],
    dynamicInstructions: [
      'The result must route to scenario=spec and firstTool=check_spec, with conflict=false and requiresClarification=false. A suppressed feature candidate is acceptable, but feature must not be selected.',
    ],
  }));

  batches.push(await runBatch({
    id: 'workflow-product-prototype',
    config: configs.compact,
    tools: ['workflow'],
    calls: [[
      'workflow',
      {
        intent: '创建产品 PRD，并制作产品原型和UI方向。',
        project_root: projectRoot,
      },
    ]],
    dynamicInstructions: [
      'The result must route to scenario=product and firstTool=start_product, with conflict=false and requiresClarification=false. Prototype and UI direction are nested product-planning steps, not an independent UI conflict.',
    ],
  }));

  batches.push(await runBatch({
    id: 'workflow-explore-call-relations',
    config: configs.compact,
    tools: ['workflow'],
    calls: [[
      'workflow',
      {
        intent: '分析当前订单模块的调用关系，不修改代码。',
        project_root: projectRoot,
      },
    ]],
    dynamicInstructions: [
      'The result must route to scenario=explore and firstTool=code_insight, with conflict=false and requiresClarification=false.',
    ],
  }));

  batches.push(await runBatch({
    id: 'workflow-architecture-feature-conflict',
    config: configs.compact,
    tools: ['workflow'],
    calls: [[
      'workflow',
      {
        intent: '修改支付系统架构，同时新增会员功能。',
        project_root: projectRoot,
      },
    ]],
    dynamicInstructions: [
      'The result must expose an unresolved independent-deliverable conflict: scenario=unknown, firstTool=null, conflict=true, requiresClarification=true, with architecture and feature represented as candidates.',
    ],
  }));

  batches.push(await runBatch({
    id: 'workflow-product',
    config: configs.compact,
    tools: ['workflow'],
    calls: [
      ['workflow', {
        intent: '规划一个面向开发团队的 AI 工具目录产品',
        project_root: projectRoot,
      }],
    ],
    dynamicInstructions: [
      'The workflow result must select the product-delivery route: scenario=product, firstTool=start_product, routingDecision.conflict=false, and requiresClarification=false. The audience phrase 开发团队 must not cause feature routing.',
    ],
  }));

  batches.push(await runBatch({
    id: 'workflow-conflict',
    config: configs.compact,
    tools: ['workflow'],
    calls: [
      ['workflow', {
        intent: '修复线上 500 Bug，同时重新设计模块边界、依赖方向和数据所有权架构',
        project_root: projectRoot,
      }],
    ],
    dynamicInstructions: [
      'The workflow result must expose an unresolved independent-intent conflict: scenario=unknown, firstTool=null, routingDecision.conflict=true, and requiresClarification=true.',
    ],
  }));

  batches.push(await runBatch({
    id: 'code-git',
    config: configs.compact,
    tools: ['gencommit', 'git_work_report', 'code_review', 'code_insight', 'refactor', 'gentest'],
    calls: [
      ['gencommit', { changes: 'Added agent contract audit and closure tests', type: 'test' }],
      ['git_work_report', { start_date: '2020-01-01', end_date: '2030-01-01' }],
      ['code_review', { code: 'export const add = (a, b) => a + b;', focus: 'quality' }],
      ['code_insight', { mode: 'query', query: 'tool registry', project_root: projectRoot }],
      ['refactor', { code: 'function f(x){return x}', goal: 'Improve naming and typing' }],
      ['gentest', { code: 'export const add = (a, b) => a + b;', framework: 'vitest' }],
    ],
  }));

  batches.push(await runBatch({
    id: 'development-orchestration',
    config: configs.compact,
    tools: ['start_feature', 'start_bugfix', 'start_onboard', 'interview'],
    calls: [
      ['start_feature', { feature_name: 'agent-auth', description: 'Add account authentication', project_root: projectRoot, spec_layout: 'flat' }],
      ['start_bugfix', { error_message: 'GET /health returns 500', project_root: projectRoot }],
      ['start_onboard', { project_path: projectRoot, docs_dir: 'docs' }],
      ['interview', { description: 'Add organization invitations', feature_name: 'org-invitations' }],
    ],
  }));

  batches.push(await runBatch({
    id: 'ui-product',
    config: configs.compact,
    tools: ['ui_design_system', 'ui_search', 'start_ui', 'start_product'],
    calls: [
      ['ui_design_system', { product_type: 'SaaS', description: 'Developer dashboard', stack: 'react' }],
      ['ui_search', { mode: 'catalog', category: 'components', limit: 3 }],
      ['start_ui', { description: 'Developer dashboard', framework: 'react', mode: 'manual', project_root: projectRoot }],
      ['start_product', { description: 'AI developer tool catalog for teams', product_name: 'Probe Hub', product_type: 'SaaS', docs_dir: 'docs', project_root: projectRoot }],
    ],
  }));

  const lifecyclePlan = {
    planId: 'claude-agent-contract-plan',
    mode: 'delegated',
    contractVersion: '2.0.0',
    workflow: 'feature',
    workflowVersion: '4.0.0-rc.2',
    objective: 'Validate real Agent plan lifecycle',
    steps: [{ id: 'verify', type: 'agent_action', action: 'verify', outputs: [] }],
    globalRules: [],
    completionCriteria: ['evidence complete'],
    memoryPolicy: {
      recallBeforeExecution: false,
      extractAfterValidation: false,
      writeOnlyReusableKnowledge: true,
      allowNegativeMemory: true,
    },
  };
  batches.push(await runBatch({
    id: 'ralph-plan-lifecycle',
    config: configs.compact,
    tools: ['start_ralph', 'plan_heartbeat', 'resume_plan', 'converge'],
    calls: [
      ['start_ralph', { goal: 'Run one bounded agent audit iteration', max_iterations: 1, max_minutes: 1 }],
      ['plan_heartbeat', {
        plan_id: lifecyclePlan.planId,
        project_root: projectRoot,
        plan: lifecyclePlan,
        completed_step_ids: ['verify'],
        last_verified_revision: 'agent-audit-revision',
        unresolved_items: [],
        evidence: [
          { kind: 'requirements', summary: 'scope confirmed' },
          { kind: 'spec', summary: 'spec confirmed', reference: 'agent-audit-spec' },
          { kind: 'implementation', summary: 'implementation confirmed', revision: 'agent-audit-revision' },
          { kind: 'test', summary: 'tests passed', reference: 'agent-audit-test' },
          { kind: 'review', summary: 'review passed', reference: 'agent-audit-review' },
        ],
      }],
      ['resume_plan', { plan_id: lifecyclePlan.planId, project_root: projectRoot }],
      ['converge', { plan_id: lifecyclePlan.planId, project_root: projectRoot }],
    ],
  }));

  batches.push(await runMemoryBatch(configs.memory, projectRoot));

  batches.push(await runBatch({
    id: 'full-compatibility',
    config: configs.full,
    tools: ['add_feature', 'fix_bug', 'architecture', 'sync_ui_data', 'ask_user'],
    calls: [
      ['add_feature', { feature_name: 'full-agent-audit', description: 'Compatibility specification fixture', docs_dir: 'docs', spec_layout: 'flat' }],
      ['fix_bug', { error_message: 'Compatibility fixture failure', project_root: projectRoot }],
      ['architecture', {
        mode: 'assess',
        description: 'Assess whether the fixture tool registry and protocol adapters have clear ownership boundaries without changing implementation.',
        project_root: projectRoot,
        scope: ['tool registry', 'protocol adapters'],
        constraints: ['read-only assessment', 'preserve public tool contracts'],
        collect_evidence: false,
      }],
      ['sync_ui_data', { check_only: true, verbose: false }],
      ['ask_user', { question: 'Confirm compatibility fixture?', context: 'real Agent contract audit' }],
    ],
  }));

  const expectedTools = batches.flatMap((batch) => batch.expectedTools);
  const calledTools = batches.flatMap((batch) => batch.calledTools);
  const uniqueExpected = [...new Set(expectedTools)];
  const uniqueCalled = [...new Set(calledTools)];
  const missing = uniqueExpected.filter((tool) => !uniqueCalled.includes(tool));
  const unexpected = uniqueCalled.filter((tool) => !uniqueExpected.includes(tool));
  const assessmentFailures = batches.flatMap((batch) => batch.assessments)
    .filter((item) => !item.purposeUnderstood || !item.guidanceReadable || !item.textStructuredConsistent || !item.nextStepExecutable || item.issues.length > 0);
  const batchFailures = batches.filter((batch) => !batch.passed);
  const agentsMdIntegrity = await inspectAgentsMdIntegrity(projectRoot);
  const report = {
    passed:
      missing.length === 0
      && unexpected.length === 0
      && assessmentFailures.length === 0
      && batchFailures.length === 0
      && agentsMdIntegrity.passed,
    generatedAt: new Date().toISOString(),
    claudeVersion: getClaudeVersion(),
    totals: {
      expectedTools: uniqueExpected.length,
      calledTools: uniqueCalled.length,
      batches: batches.length,
      passedBatches: batches.length - batchFailures.length,
      failedBatches: batchFailures.length,
      assessmentFailures: assessmentFailures.length,
    },
    missing,
    unexpected,
    agentsMdIntegrity,
    batches,
  };
  const reportPath = process.env.CLAUDE_AUDIT_REPORT?.trim();
  if (reportPath) {
    const absoluteReportPath = resolve(reportPath);
    await mkdir(dirname(absoluteReportPath), { recursive: true });
    await writeFile(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (/^(1|true|yes|on)$/i.test(process.env.CLAUDE_AUDIT_QUIET || '')) {
    console.log(JSON.stringify({
      passed: report.passed,
      claudeVersion: report.claudeVersion,
      totals: report.totals,
      missing: report.missing,
      unexpected: report.unexpected,
      reportPath: reportPath ? resolve(reportPath) : null,
    }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  if (!report.passed) process.exitCode = 1;
} finally {
  await Promise.all(cleanup.splice(0).map((task) => task()));
}

async function runMemoryBatch(config, projectRoot) {
  return runBatch({
    id: 'memory-crud',
    config,
    tools: ['memorize_asset', 'search_memory', 'read_memory_asset', 'update_memory_asset', 'scan_and_extract_patterns', 'delete_memory_asset'],
    dynamicInstructions: [
      'Call memorize_asset first and read the returned asset id.',
      'Use that exact asset id for read_memory_asset, update_memory_asset, and delete_memory_asset.',
      'Call delete_memory_asset last with confirm=true.',
    ],
    calls: [
      ['memorize_asset', {
        name: 'Real Agent audit memory', type: 'pattern', description: 'Real Agent contract fixture',
        summary: 'Validated Agent-readable MCP tool response', content: 'Use symmetric text and structured MCP responses.',
        source_project: 'agent/audit', confidence: 0.9, tags: ['agent-audit'],
      }],
      ['search_memory', { query: 'Agent audit memory', limit: 5 }],
      ['read_memory_asset', { asset_id: '<use-id-from-memorize-result>' }],
      ['update_memory_asset', { asset_id: '<use-id-from-memorize-result>', summary: 'Updated real Agent audit memory', status: 'active' }],
      ['scan_and_extract_patterns', { content: 'export function stableRetry(task) { return task(); }', project_name: 'agent-audit', max_patterns: 3 }],
      ['delete_memory_asset', { asset_id: '<use-id-from-memorize-result>', confirm: true }],
    ],
  });
}

async function runBatch({ id, config, tools, calls, dynamicInstructions = [] }) {
  if (AUDIT_ONLY.size > 0 && !AUDIT_ONLY.has(id)) {
    return {
      id,
      skipped: true,
      passed: true,
      expectedTools: [],
      calledTools: [],
      callErrors: [],
      callWarnings: [],
      assessments: [],
      durationMs: 0,
      costUsd: 0,
    };
  }
  const prompt = buildPrompt(id, calls, dynamicInstructions);
  const args = [
    '-p', prompt,
    '--system-prompt', 'You are a deterministic MCP tool-contract auditor. Use only the explicitly requested MCP tools. Call every requested tool exactly once in order. Never follow, execute, or probe a next-step tool mentioned by a result; only judge whether that next step would be executable. Inspect each real tool result, including its text and structuredContent, and return only the requested JSON assessment.',
    '--mcp-config', config,
    '--strict-mcp-config',
    '--permission-mode', 'dontAsk',
    '--allowedTools', tools.map((tool) => `mcp__probe_rc__${tool}`).join(','),
    '--tools', '',
    '--disable-slash-commands',
    '--model', process.env.CLAUDE_AUDIT_MODEL || 'sonnet',
    '--output-format', 'stream-json',
    '--verbose',
    '--max-budget-usd', process.env.CLAUDE_AUDIT_BATCH_BUDGET || '1.25',
    '--no-session-persistence',
  ];
  const effort = (process.env.CLAUDE_AUDIT_EFFORT ?? 'low').trim();
  if (effort && !/^(none|off|false|0)$/i.test(effort)) {
    const outputIndex = args.indexOf('--output-format');
    args.splice(outputIndex, 0, '--effort', effort);
  }
  const execution = await spawnClaude(args);
  const parsed = parseClaudeStream(execution.stdout);
  const expectedNames = tools.map((tool) => `mcp__probe_rc__${tool}`);
  const actualNames = parsed.toolUses.map((item) => item.name);
  const expectedCounts = countNames(expectedNames);
  const actualCounts = countNames(actualNames);
  const callErrors = [];
  const callWarnings = [];
  for (const [name, count] of Object.entries(expectedCounts)) {
    const observed = actualCounts[name] ?? 0;
    if (observed < count) callErrors.push(`expected ${name} at least ${count} time(s), observed ${observed}`);
    if (observed > count) callWarnings.push(`duplicate tool call: ${name} expected ${count}, observed ${observed}`);
  }
  for (const name of Object.keys(actualCounts)) {
    if (!(name in expectedCounts)) callErrors.push(`unexpected tool call: ${name}`);
  }
  if (parsed.toolResultErrors.length > 0) callErrors.push(...parsed.toolResultErrors);
  if (execution.timedOut) callErrors.push(`claude batch timed out after ${execution.timeoutMs}ms`);
  if (execution.code !== 0) callErrors.push(`claude exit code ${execution.code}`);
  const assessments = parseAssessments(parsed.finalResult, tools);
  const assessedNames = new Set(assessments.map((item) => item.tool));
  for (const tool of tools) {
    if (!assessedNames.has(tool)) callErrors.push(`missing final assessment: ${tool}`);
  }
  return {
    id,
    passed: callErrors.length === 0 && assessments.every(isPassingAssessment),
    expectedTools: tools,
    calledTools: actualNames.map(stripMcpPrefix),
    callErrors,
    callWarnings,
    assessments,
    durationMs: execution.durationMs,
    costUsd: parsed.totalCostUsd,
    diagnostics: callErrors.length > 0 ? {
      resultMeta: parsed.resultMeta,
      finalResultTail: parsed.finalResult.slice(-2000),
      stderrTail: execution.stderr.slice(-2000),
    } : undefined,
  };
}

function buildPrompt(id, calls, dynamicInstructions) {
  return `Run real MCP Agent contract audit batch "${id}".\n\nCall these MCP tools exactly once each, in this exact order, using the specified logical arguments:\n${calls.map(([tool, args], index) => `${index + 1}. mcp__probe_rc__${tool}\n${JSON.stringify(args, null, 2)}`).join('\n\n')}\n\n${dynamicInstructions.join('\n')}\n\nAfter every call, inspect the returned text and structuredContent. A tool passes only when:\n- you understand its purpose and responsibilities;\n- its guidance is readable and actionable;\n- text and structuredContent do not contradict each other;\n- every stated next MCP tool is actually available to you, or the response clearly marks the step as an Agent/Host action;\n- the response does not claim work was completed when it only returned guidance.\n\nReturn only valid JSON with this exact shape:\n{"assessments":[{"tool":"tool_name_without_prefix","purposeUnderstood":true,"guidanceReadable":true,"textStructuredConsistent":true,"nextStepExecutable":true,"issues":[]}]}\nInclude one assessment for every requested tool. The issues array must contain only actual contract failures; do not list degraded-but-honest behavior or non-blocking observations as issues. Do not add markdown.`;
}

function parseClaudeStream(stdout) {
  const events = stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const toolUses = [];
  const toolResultErrors = [];
  let finalResult = '';
  let totalCostUsd = null;
  let resultMeta = null;
  for (const event of events) {
    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      for (const item of event.message.content) {
        if (item?.type === 'tool_use' && typeof item.name === 'string') toolUses.push({ name: item.name, input: item.input });
      }
    }
    if (event.type === 'user' && Array.isArray(event.message?.content)) {
      for (const item of event.message.content) {
        if (item?.type === 'tool_result' && item.is_error === true) toolResultErrors.push(`tool_result error for ${item.tool_use_id}`);
      }
    }
    if (event.type === 'result') {
      finalResult = event.result ?? '';
      totalCostUsd = event.total_cost_usd ?? null;
      resultMeta = {
        subtype: event.subtype ?? null,
        isError: Boolean(event.is_error),
        errors: event.errors ?? [],
        stopReason: event.stop_reason ?? null,
        durationMs: event.duration_ms ?? null,
        numTurns: event.num_turns ?? null,
      };
      if (event.is_error) toolResultErrors.push(...(event.errors ?? ['Claude result marked error']));
    }
  }
  return { toolUses, toolResultErrors, finalResult, totalCostUsd, resultMeta };
}

function parseAssessments(text, expectedTools) {
  const candidate = extractJson(text);
  let parsed;
  try { parsed = JSON.parse(candidate); } catch { return []; }
  const values = Array.isArray(parsed?.assessments) ? parsed.assessments : [];
  return values
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      tool: String(item.tool ?? ''),
      purposeUnderstood: item.purposeUnderstood === true,
      guidanceReadable: item.guidanceReadable === true,
      textStructuredConsistent: item.textStructuredConsistent === true,
      nextStepExecutable: item.nextStepExecutable === true,
      issues: Array.isArray(item.issues) ? item.issues.map(String) : ['issues must be an array'],
    }))
    .filter((item) => expectedTools.includes(item.tool));
}

function extractJson(text) {
  const trimmed = String(text ?? '').trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

async function spawnClaude(args) {
  const started = Date.now();
  const configuredTimeout = Number(process.env.CLAUDE_AUDIT_BATCH_TIMEOUT_MS || 180000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 180000;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(CLAUDE_COMMAND, args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      stderr += `\nClaude audit batch exceeded ${timeoutMs}ms and was terminated.`;
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } else {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      }
    }, timeoutMs);
    timeout.unref();
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolvePromise({
        code: timedOut ? 124 : code,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        timeoutMs,
      });
    });
  });
}

async function writeMcpConfig(projectRoot, toolset, memoryEnabled, memoryUrl) {
  const configPath = join(projectRoot, `mcp-${toolset}-${memoryEnabled ? 'memory' : 'plain'}.json`);
  const config = {
    mcpServers: {
      probe_rc: {
        command: process.execPath,
        args: [BUILD_ENTRY],
        env: {
          MCP_PROTOCOL_MODE: 'auto',
          MCP_TOOLSET: toolset,
          MCP_ENABLE_GITNEXUS_BRIDGE: '0',
          MCP_PROJECT_ROOT: projectRoot,
          MEMORY_QDRANT_URL: memoryEnabled ? memoryUrl : '',
          MEMORY_QDRANT_COLLECTION: 'agent-audit',
          MEMORY_EMBEDDING_URL: memoryEnabled ? `${memoryUrl}/embed` : '',
          MEMORY_EMBEDDING_MODEL: memoryEnabled ? 'agent-audit-embed' : '',
          MEMORY_EMBEDDING_PROVIDER: 'ollama',
          MEMORY_REPO_ID: 'agent/audit',
        },
      },
    },
  };
  await writeFile(configPath, JSON.stringify(config), 'utf8');
  return configPath;
}

async function createFixtureProject() {
  const root = await mkdtemp(join(tmpdir(), 'mcp-claude-agent-audit-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'docs', 'specs', 'audit-feature'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'agent-audit-project', scripts: { test: 'node -e "process.exit(0)"' } }, null, 2));
  await writeFile(join(root, 'src', 'index.ts'), 'export const health = () => true;\n');
  await writeFile(join(root, 'docs', 'specs', 'audit-feature', 'requirements.md'), '# Requirements\n\n## FR-1\nThe audit MUST pass.\n\n### Acceptance Criteria\n- Contract report passes.\n');
  await writeFile(join(root, 'docs', 'specs', 'audit-feature', 'design.md'), '# Design\n\n## Architecture\nUse an MCP client fixture.\n\n## FR Coverage\n| FR | Design |\n|---|---|\n| FR-1 | Contract audit |\n');
  await writeFile(join(root, 'docs', 'specs', 'audit-feature', 'tasks.md'), '# Tasks\n\n- [x] 1. Run contract audit _Requirements: FR-1_\n');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'agent-audit@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Agent Audit'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['commit', '-m', 'chore: initialize agent audit fixture'], { cwd: root, stdio: 'ignore' });
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
    if (url.pathname.endsWith('/points/scroll')) return send(200, { result: { points: [...points.values()].map((point) => ({ id: point.id, payload: point.payload })), next_page_offset: null } });
    if (url.pathname.endsWith('/points/search')) return send(200, { result: [...points.values()].map((point) => ({ id: point.id, score: 0.95, payload: point.payload })) });
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
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  cleanup.push(() => new Promise((resolvePromise) => server.close(resolvePromise)));
  return { url: `http://127.0.0.1:${address.port}` };
}

function assertClaudeAvailable() {
  const result = spawnSync(CLAUDE_COMMAND, ['--version'], { encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(`Claude CLI unavailable: ${result.stderr || result.error}`);
}

function getClaudeVersion() {
  const result = spawnSync(CLAUDE_COMMAND, ['--version'], { encoding: 'utf8', shell: false });
  return result.stdout.trim();
}

function countNames(names) {
  return Object.fromEntries([...new Set(names)].map((name) => [name, names.filter((item) => item === name).length]));
}

function stripMcpPrefix(name) {
  return name.replace(/^mcp__probe_rc__/, '');
}

function isPassingAssessment(item) {
  return item.purposeUnderstood && item.guidanceReadable && item.textStructuredConsistent && item.nextStepExecutable && item.issues.length === 0;
}
