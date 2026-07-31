import { performance } from 'node:perf_hooks';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { COMPACT_TOOL_COUNT, PACKAGE_VERSION } from './release-surface.mjs';

const coldRounds = positiveInt(process.env.MCP_STABILITY_COLD_ROUNDS, 4);
const hotCalls = positiveInt(process.env.MCP_STABILITY_HOT_CALLS, 40);
const concurrentClients = positiveInt(process.env.MCP_STABILITY_CONCURRENT_CLIENTS, 4);
const concurrentCalls = positiveInt(process.env.MCP_STABILITY_CONCURRENT_CALLS, 8);
const roots = [];
const timings = [];
const failures = [];

try {
  for (const era of ['legacy', 'modern']) {
    for (let round = 0; round < coldRounds; round += 1) {
      await record(`cold-${era}-${round + 1}`, () => runSession({ era, calls: 1 }));
    }
  }

  await record('hot-modern', () => runSession({ era: 'modern', calls: hotCalls }));
  await record('memory-degradation', runMemoryDegradation);

  const concurrent = Array.from({ length: concurrentClients }, (_, index) =>
    record(`concurrent-modern-${index + 1}`, () =>
      runSession({ era: 'modern', calls: concurrentCalls })
    )
  );
  await Promise.all(concurrent);

  await record('modern-rejects-legacy', () => expectRejected('modern', 'legacy'));
  await record('legacy-rejects-modern', () => expectRejected('legacy', 'modern'));

  if (failures.length > 0) {
    throw new Error(`stability failures: ${failures.map((item) => `${item.name}: ${item.error}`).join(' | ')}`);
  }

  const durations = timings.map((item) => item.durationMs).sort((a, b) => a - b);
  console.log(JSON.stringify({
    passed: true,
    version: PACKAGE_VERSION,
    configuration: { coldRounds, hotCalls, concurrentClients, concurrentCalls },
    totals: {
      scenarios: timings.length,
      workflowCalls: coldRounds * 2 + hotCalls + concurrentClients * concurrentCalls + 1,
      failures: 0,
    },
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: Math.max(...durations),
    },
    scenarios: timings,
  }, null, 2));
} finally {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

async function runSession({ era, calls, extraEnv = {} }) {
  const projectRoot = await createRoot(`stability-${era}`);
  const session = await connect({ era, serverMode: 'auto', projectRoot, extraEnv });
  try {
    const tools = await session.client.listTools();
    assert(
      tools.tools.length === COMPACT_TOOL_COUNT,
      `${era} compact tools/list returned ${tools.tools.length}`
    );
    const status = await session.client.readResource({ uri: 'probe://status' });
    const content = status.contents[0];
    assert(content && 'text' in content, `${era} status resource missing`);
    const payload = JSON.parse(content.text);
    assert(payload.protocol.era === era, `${era} negotiated as ${payload.protocol.era}`);

    for (let index = 0; index < calls; index += 1) {
      const result = await session.client.callTool({
        name: 'workflow',
        arguments: {
          intent: `开发稳定 RC 能力 ${index + 1}，覆盖双协议、Agent 路由和发布验证`,
          scenario: 'feature',
          project_root: projectRoot,
        },
      });
      assert(result.isError !== true, `${era} workflow call ${index + 1} failed`);
      assert(result.structuredContent?.firstTool === 'start_feature', `${era} workflow route mismatch`);
    }
    assert(session.stderr().includes('v4-sdk2-dual-era-20260730'), `${era} startup marker missing`);
  } finally {
    await session.close();
  }
}

async function runMemoryDegradation() {
  const projectRoot = await createRoot('stability-memory');
  const session = await connect({
    era: 'modern',
    serverMode: 'auto',
    projectRoot,
    extraEnv: {
      MEMORY_QDRANT_URL: 'http://127.0.0.1:1',
      MEMORY_EMBEDDING_URL: 'http://127.0.0.1:1/api/embeddings',
      MEMORY_EMBEDDING_MODEL: 'unreachable-test-model',
    },
  });
  try {
    const startedAt = performance.now();
    const result = await session.client.callTool({
      name: 'start_feature',
      arguments: {
        feature_name: 'memory-degradation-stability',
        description: '开发一个简单功能并验证 Memory 服务不可用时仍能生成 delegated plan',
        project_root: projectRoot,
      },
    });
    const durationMs = Math.round(performance.now() - startedAt);
    assert(result.isError !== true, 'Memory degradation blocked start_feature');
    assert(result.structuredContent?.metadata?.plan?.workflow === 'feature', 'Memory degradation lost feature plan');
    assert(durationMs < 10_000, `Memory degradation exceeded 10s: ${durationMs}ms`);
  } finally {
    await session.close();
  }
}

async function expectRejected(serverMode, clientEra) {
  const projectRoot = await createRoot(`reject-${serverMode}-${clientEra}`);
  let session;
  try {
    session = await connect({ era: clientEra, serverMode, projectRoot });
  } catch {
    return;
  }
  await session.close();
  throw new Error(`${serverMode} server accepted ${clientEra} client unexpectedly`);
}

async function connect({ era, serverMode, projectRoot, extraEnv = {} }) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['build/index.js'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      MCP_TOOLSET: 'compact',
      MEMORY_QDRANT_URL: '',
      MEMORY_EMBEDDING_URL: '',
      MEMORY_EMBEDDING_MODEL: '',
      ...extraEnv,
      MCP_PROTOCOL_MODE: serverMode,
      MCP_PROJECT_ROOT: projectRoot,
      MCP_ENABLE_GITNEXUS_BRIDGE: '0',
    },
    stderr: 'pipe',
  });
  let stderrText = '';
  transport.stderr?.on('data', (chunk) => { stderrText += chunk.toString(); });
  const client = new Client(
    { name: `stability-${era}`, version: PACKAGE_VERSION },
    { capabilities: {} }
  );
  client.setVersionNegotiation({ mode: era === 'modern' ? { pin: '2026-07-28' } : 'legacy' });
  await client.connect(transport);
  return {
    client,
    stderr: () => stderrText,
    close: async () => {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    },
  };
}

async function record(name, operation) {
  const startedAt = performance.now();
  try {
    await operation();
    timings.push({ name, durationMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    failures.push({ name, error: error instanceof Error ? error.message : String(error) });
  }
}

async function createRoot(label) {
  const root = await mkdtemp(join(tmpdir(), `${label}-`));
  roots.push(root);
  return root;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
