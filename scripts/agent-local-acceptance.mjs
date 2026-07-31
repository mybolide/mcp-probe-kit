import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { COMPACT_TOOL_COUNT, PACKAGE_VERSION } from './release-surface.mjs';

const projectRoot = await mkdtemp(join(tmpdir(), 'mcp-agent-acceptance-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['build/index.js'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    MCP_PROTOCOL_MODE: 'auto',
    MCP_ENABLE_GITNEXUS_BRIDGE: '0',
    MCP_TOOLSET: 'compact',
    MEMORY_QDRANT_URL: '',
    MEMORY_EMBEDDING_URL: '',
    MEMORY_EMBEDDING_MODEL: '',
  },
  stderr: 'pipe',
});

let stderrText = '';
transport.stderr?.on('data', (chunk) => {
  stderrText += chunk.toString();
});

const client = new Client(
  { name: 'mcp-probe-local-agent', version: PACKAGE_VERSION },
  { capabilities: {} }
);
client.setVersionNegotiation({ mode: { pin: '2026-07-28' } });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert(
    tools.tools.length === COMPACT_TOOL_COUNT,
    `expected ${COMPACT_TOOL_COUNT} compact tools, got ${tools.tools.length}`
  );

  const shortIntent = await client.callTool({
    name: 'workflow',
    arguments: {
      intent: '继续开发',
      scenario: 'auto',
      project_root: projectRoot,
    },
  });
  assert(shortIntent.isError !== true, 'short intent routing returned an error');

  const fullIntent = [
    `继续 MCP Probe Kit v${PACKAGE_VERSION} 发布候选开发：`,
    '- 校验 npm next 标签与 Git Tag/package version 一致性；',
    '- GitHub Release 标记 prerelease，RC 不覆盖 latest；',
    '- Node.js 20、Legacy/Modern 双协议与同步降级；',
    '- Agent Evals、完整 release gate 与 npm pack 校验；',
    '- 真实客户端兼容矩阵保持 pending，完成实机验收前不得发布稳定版；',
    '- RC 不发布到正式 MCP Registry。',
  ].join('\n');

  const routed = await client.callTool({
    name: 'workflow',
    arguments: {
      intent: fullIntent,
      scenario: 'auto',
      project_root: projectRoot,
    },
  });
  assert(routed.isError !== true, 'full intent routing returned an error');
  assert(routed.structuredContent?.firstTool === 'start_feature', 'full intent did not route to start_feature');
  assert(
    routed.structuredContent?.firstToolArgsHint?.spec_layout === 'auto',
    'full intent did not preserve spec_layout=auto'
  );

  const feature = await client.callTool({
    name: 'start_feature',
    arguments: {
      feature_name: 'mcp-v4-rc-readiness',
      description: fullIntent,
      spec_layout: 'auto',
      project_root: projectRoot,
    },
  });
  assert(feature.isError !== true, 'start_feature returned an error');
  const featureMetadata = feature.structuredContent?.metadata;
  const featurePlan = featureMetadata?.plan;
  assert(featurePlan?.workflow === 'feature', 'start_feature did not return a feature plan');
  assert(
    featureMetadata?.layoutDecision?.resolved === 'parent-child',
    `expected parent-child, got ${featureMetadata?.layoutDecision?.resolved}`
  );
  assert(
    featurePlan.steps?.some((step) => step.id === 'decompose-spec'),
    'parent-child plan is missing decompose-spec'
  );

  const initialHeartbeat = await client.callTool({
    name: 'plan_heartbeat',
    arguments: {
      plan_id: featurePlan.planId,
      project_root: projectRoot,
      plan: featurePlan,
      current_step_id: featurePlan.steps?.[0]?.id,
      unresolved_items: ['尚未执行规格、实现、测试和审查'],
      evidence: [{ kind: 'requirements', summary: '已从当前对话重建完整 RC 范围' }],
    },
  });
  assert(initialHeartbeat.structuredContent?.stored === true, 'feature heartbeat was not stored');

  const resumed = await client.callTool({
    name: 'resume_plan',
    arguments: { plan_id: featurePlan.planId, project_root: projectRoot },
  });
  assert(resumed.structuredContent?.found === true, 'feature plan could not be resumed');

  const rejectedConverge = await client.callTool({
    name: 'converge',
    arguments: { plan_id: featurePlan.planId, project_root: projectRoot },
  });
  assert(rejectedConverge.structuredContent?.passed === false, 'unfinished feature plan converged unexpectedly');
  assert(
    rejectedConverge.structuredContent?.memoryWriteAllowed === false,
    'unfinished feature plan allowed long-term memory write'
  );

  const completedPlan = {
    planId: 'agent-acceptance-completed-plan',
    mode: 'delegated',
    contractVersion: '2.0.0',
    workflow: 'feature',
    workflowVersion: PACKAGE_VERSION,
    objective: '验证证据齐全后才允许收敛',
    steps: [{ id: 'verify-release', action: 'verify' }],
    globalRules: [],
    completionCriteria: ['发布证据完整'],
    memoryPolicy: {
      recallBeforeExecution: true,
      extractAfterValidation: true,
      writeOnlyReusableKnowledge: true,
      allowNegativeMemory: true,
    },
  };
  const completedHeartbeat = await client.callTool({
    name: 'plan_heartbeat',
    arguments: {
      plan_id: completedPlan.planId,
      project_root: projectRoot,
      plan: completedPlan,
      completed_step_ids: ['verify-release'],
      last_verified_revision: 'local-agent-acceptance',
      evidence: [
        { kind: 'requirements', summary: 'RC 发布范围已确认' },
        { kind: 'spec', summary: 'RC 发布规则已确认', reference: 'CHANGELOG.md' },
        { kind: 'implementation', summary: '发布渠道保护已实现', revision: 'local-agent-acceptance' },
        { kind: 'test', summary: '本地 Agent 验收通过', reference: 'acceptance:agent' },
        {
          kind: 'review',
          summary: 'RC 不覆盖 latest，稳定 Registry 未启用',
          reference: '.github/workflows/release.yml',
        },
      ],
    },
  });
  assert(completedHeartbeat.structuredContent?.stored === true, 'completed heartbeat was not stored');

  const acceptedConverge = await client.callTool({
    name: 'converge',
    arguments: { plan_id: completedPlan.planId, project_root: projectRoot },
  });
  assert(acceptedConverge.structuredContent?.passed === true, 'completed plan did not converge');
  assert(
    acceptedConverge.structuredContent?.memoryWriteAllowed === true,
    'completed plan did not allow post-convergence memory write'
  );

  console.log(JSON.stringify({
    clientEra: client.getProtocolEra(),
    tools: tools.tools.length,
    shortIntent: {
      scenario: shortIntent.structuredContent?.scenario,
      confidence: shortIntent.structuredContent?.confidence,
      firstTool: shortIntent.structuredContent?.firstTool,
      forwardedDescription: shortIntent.structuredContent?.firstToolArgsHint?.description,
    },
    reconstructedIntent: {
      scenario: routed.structuredContent?.scenario,
      confidence: routed.structuredContent?.confidence,
      firstTool: routed.structuredContent?.firstTool,
      specLayoutHint: routed.structuredContent?.firstToolArgsHint?.spec_layout,
    },
    featurePlan: {
      planId: featurePlan.planId,
      layout: featureMetadata?.layoutDecision?.resolved,
      layoutScore: featureMetadata?.layoutDecision?.score,
      layoutReasons: featureMetadata?.layoutDecision?.reasons,
      hasDecomposeSpec: featurePlan.steps?.some((step) => step.id === 'decompose-spec'),
      resumedNextStep: resumed.structuredContent?.nextStepId,
    },
    unfinishedConverge: {
      passed: rejectedConverge.structuredContent?.passed,
      memoryWriteAllowed: rejectedConverge.structuredContent?.memoryWriteAllowed,
      blockers: rejectedConverge.structuredContent?.blockers,
    },
    completedConverge: {
      passed: acceptedConverge.structuredContent?.passed,
      memoryWriteAllowed: acceptedConverge.structuredContent?.memoryWriteAllowed,
    },
    serverStarted: stderrText.includes('v4-sdk2-dual-era-20260730'),
  }, null, 2));
} finally {
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
  await rm(projectRoot, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
