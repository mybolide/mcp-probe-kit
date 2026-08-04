import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { buildDelegatedPlanContract } from '../../lib/delegated-plan-contract.js';
import { createProbeServer } from '../../server/create-server.js';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Plan MCP tools integration', () => {
  test('heartbeat、resume、converge 完成协议闭环', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'plan-tools-mcp-'));
    cleanup.push(projectRoot);
    const { server } = createProbeServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: 'plan-tools-test', version: '1.0.0' },
      { capabilities: {} }
    );
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['plan_heartbeat', 'resume_plan', 'converge'])
      );

      const plan = buildDelegatedPlanContract({
        planId: 'feature-plan-tools-abc123',
        workflow: 'feature',
        workflowVersion: '4.0.0',
        objective: '验证 Plan 工具协议闭环',
        completionCriteria: ['全部步骤与证据一致'],
        steps: [{ id: 'done', action: 'verify' }],
      });
      await assertHeartbeat(client, plan, projectRoot);
      await assertResume(client, plan.planId, projectRoot);
      await assertConverge(client, plan.planId, projectRoot);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

async function assertHeartbeat(
  client: Client,
  plan: ReturnType<typeof buildDelegatedPlanContract>,
  projectRoot: string
) {
  const result = await client.callTool({
    name: 'plan_heartbeat',
    arguments: {
      plan_id: plan.planId,
      project_root: projectRoot,
      plan,
      completed_step_ids: ['done'],
      evidence: convergenceEvidence(),
      declared_scope: { modules: ['src/plans'] },
      artifacts: [{ kind: 'report', summary: 'Plan 验证报告', reference: 'plan-report' }],
      acceptance_results: [{ gate_id: 'protocol-check', passed: true, summary: '协议检查通过' }],
      runtime_evidence: [{ kind: 'mcp', summary: 'MCP 调用成功', reference: 'in-memory' }],
    },
  });
  expect(result.isError ?? false).toBe(false);
  expect(result.structuredContent).toMatchObject({
    stored: true,
    planId: plan.planId,
    completedStepIds: ['done'],
    declaredScope: { modules: ['src/plans'] },
    artifactCount: 1,
    acceptanceResultCount: 1,
    runtimeEvidenceCount: 1,
  });
}

async function assertResume(client: Client, planId: string, projectRoot: string) {
  const result = await client.callTool({
    name: 'resume_plan',
    arguments: { plan_id: planId, project_root: projectRoot },
  });
  expect(result.isError ?? false).toBe(false);
  expect(result.structuredContent).toMatchObject({
    found: true,
    readyStepIds: [],
    record: {
      declaredScope: { modules: ['src/plans'] },
      artifacts: [expect.objectContaining({ summary: 'Plan 验证报告' })],
      acceptanceResults: [expect.objectContaining({ gateId: 'protocol-check' })],
      runtimeEvidence: [expect.objectContaining({ kind: 'mcp' })],
    },
  });
}

async function assertConverge(client: Client, planId: string, projectRoot: string) {
  const result = await client.callTool({
    name: 'converge',
    arguments: { plan_id: planId, project_root: projectRoot },
  });
  expect(result.isError ?? false).toBe(false);
  expect(result.structuredContent).toMatchObject({
    passed: true,
    status: 'converged',
    memoryWriteAllowed: true,
  });
}

function convergenceEvidence() {
  return [
    { kind: 'requirements', summary: '范围已确认' },
    { kind: 'spec', summary: '规格已确认', reference: 'docs/specs/demo' },
    { kind: 'implementation', summary: '实现完成', revision: 'abc123' },
    { kind: 'test', summary: '测试通过', reference: 'npm test' },
    { kind: 'review', summary: '审查通过', reference: 'review-1' },
  ];
}
