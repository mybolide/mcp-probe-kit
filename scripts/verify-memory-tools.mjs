/**
 * Simulates MCP hosts that only surface content[0].text (e.g. opencode).
 * Exit 0 when memory CRUD tools produce usable text + structured handles.
 *
 * Notes:
 * - read_memory_asset only needs MEMORY_QDRANT_URL
 * - search_memory also needs MEMORY_EMBEDDING_URL + MEMORY_EMBEDDING_MODEL (and a running embedding service)
 * - update/delete live CRUD roundtrip: set VERIFY_MEMORY_CRUD=1 (mutates Qdrant)
 */
import { readMemoryAsset } from '../build/tools/read_memory_asset.js';
import { searchMemory } from '../build/tools/search_memory.js';
import { updateMemoryAsset } from '../build/tools/update_memory_asset.js';
import { deleteMemoryAsset } from '../build/tools/delete_memory_asset.js';
import { memorizeAsset } from '../build/tools/memorize_asset.js';
import { buildMemoryAssetHandles } from '../build/lib/handles.js';
import { getMemoryConfig, isMemoryEnabled, isMemoryReadEnabled } from '../build/lib/memory-config.js';

const summary = {
  mock: 'pending',
  liveSearch: 'pending',
  liveRead: 'pending',
  liveUpdateDelete: 'pending',
};

function textOnly(result) {
  if (!result?.content?.[0]?.text) {
    throw new Error('Missing content[0].text');
  }
  return result.content[0].text;
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label}: text missing ${JSON.stringify(needle)}`);
  }
}

async function probeEmbedding(config) {
  if (!config.embeddingUrl || !config.embeddingModel) {
    return { ok: false, reason: 'MEMORY_EMBEDDING_URL 或 MEMORY_EMBEDDING_MODEL 未配置' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (config.embeddingApiKey) {
    headers.Authorization = `Bearer ${config.embeddingApiKey}`;
  }

  const body =
    config.embeddingProvider === 'openai-compatible'
      ? { model: config.embeddingModel, input: 'ping' }
      : { model: config.embeddingModel, prompt: 'ping' };

  try {
    const res = await fetch(config.embeddingUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { ok: false, reason: `embedding HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function qdrantHeaders(config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.qdrantApiKey) {
    headers['api-key'] = config.qdrantApiKey;
  }
  return headers;
}

async function probeQdrant(config) {
  if (!config.qdrantUrl) {
    return { ok: false, reason: 'MEMORY_QDRANT_URL 未配置' };
  }

  try {
    const res = await fetch(
      `${config.qdrantUrl}/collections/${encodeURIComponent(config.qdrantCollection)}`,
      { headers: qdrantHeaders(config), signal: AbortSignal.timeout(8000) }
    );
    if (res.status === 401) {
      return { ok: false, reason: 'Qdrant 401 — 请设置 MEMORY_QDRANT_API_KEY' };
    }
    if (!res.ok) {
      return { ok: false, reason: `Qdrant HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function verifyWithMock() {
  const mockAsset = {
    id: '6c97bd10-654e-4f25-a560-99f7469dc11a',
    name: 'playwright-e2e-testing-speed-pattern',
    type: 'pattern',
    description: 'Speed up Playwright E2E suites',
    summary: 'Playwright E2E parallelization pattern',
    content: 'export const parallelWorkers = 4;\n// use project-based sharding',
    tags: ['pattern', 'e2e'],
    confidence: 0.9,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const { formatReadMemoryAssetText, formatSearchMemoryResultsText } = await import(
    '../build/lib/memory-orchestration.js'
  );

  const searchText = formatSearchMemoryResultsText([
    {
      id: mockAsset.id,
      score: 0.678,
      name: mockAsset.name,
      type: mockAsset.type,
      description: mockAsset.description,
      summary: mockAsset.summary,
      content: mockAsset.content,
      tags: mockAsset.tags,
    },
  ]);
  assertIncludes(searchText, '--- content ---', 'search_memory');
  assertIncludes(searchText, 'export const parallelWorkers = 4;', 'search_memory');
  assertIncludes(searchText, 'id: 6c97bd10-654e-4f25-a560-99f7469dc11a', 'search_memory');
  assertIncludes(searchText, 'Playwright E2E parallelization pattern', 'search_memory');

  const readText = formatReadMemoryAssetText(mockAsset);
  assertIncludes(readText, '--- content ---', 'read_memory_asset');
  assertIncludes(readText, 'export const parallelWorkers = 4;', 'read_memory_asset');

  const handles = buildMemoryAssetHandles([{ id: mockAsset.id, name: mockAsset.name }]);
  if (!handles[0]?.tool || handles[0].tool !== 'read_memory_asset') {
    throw new Error('handles: expected read_memory_asset tool');
  }

  console.log('[mock] search_memory text preview:\n', searchText.slice(0, 400));
  console.log('\n[mock] read_memory_asset text preview:\n', readText.slice(0, 500));
  summary.mock = 'PASS';
}

async function resolveLiveAssetId() {
  const fromEnv = process.env.VERIFY_MEMORY_ASSET_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const config = getMemoryConfig();
  if (!config.qdrantUrl) {
    return null;
  }

  const res = await fetch(
    `${config.qdrantUrl}/collections/${encodeURIComponent(config.qdrantCollection)}/points/scroll`,
    {
      method: 'POST',
      headers: qdrantHeaders(config),
      body: JSON.stringify({ limit: 1, with_payload: true, with_vector: false }),
    }
  );
  if (!res.ok) {
    throw new Error(`Qdrant scroll failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  const id = data?.result?.points?.[0]?.id;
  return typeof id === 'string' ? id : null;
}

async function verifyLiveSearch(config, qdrantProbe) {
  if (!isMemoryEnabled(config)) {
    summary.liveSearch = 'SKIP (memory write/search env incomplete)';
    console.log('\n[live] search_memory SKIP: 未配置完整记忆环境变量');
    return;
  }

  if (!qdrantProbe.ok) {
    summary.liveSearch = `SKIP (${qdrantProbe.reason})`;
    console.log('\n[live] search_memory SKIP:', qdrantProbe.reason);
    return;
  }

  const embedding = await probeEmbedding(config);
  if (!embedding.ok) {
    summary.liveSearch = `SKIP (${embedding.reason})`;
    console.log('\n[live] search_memory SKIP: embedding 不可用 —', embedding.reason);
    console.log('       提示: 设置 MEMORY_EMBEDDING_PROVIDER=openai-compatible');
    console.log('       并确认 MEMORY_EMBEDDING_URL / API_KEY / MODEL 可访问');
    return;
  }

  const query = process.env.VERIFY_MEMORY_QUERY?.trim() || 'axios http';
  const searchResult = await searchMemory({ query, limit: 1 });
  if (searchResult.isError) {
    summary.liveSearch = `FAIL (${textOnly(searchResult).slice(0, 120)})`;
    throw new Error(`live search_memory failed: ${textOnly(searchResult)}`);
  }

  const searchText = textOnly(searchResult);
  assertIncludes(searchText, 'id:', 'live search_memory');
  console.log('\n[live] search_memory text:\n', searchText.slice(0, 500));
  summary.liveSearch = 'PASS';
}

async function verifyLiveRead(config, qdrantProbe) {
  if (!isMemoryReadEnabled(config)) {
    summary.liveRead = 'SKIP (MEMORY_QDRANT_URL not set)';
    console.log('\n[live] read_memory_asset SKIP: MEMORY_QDRANT_URL 未配置');
    return;
  }

  if (!qdrantProbe.ok) {
    summary.liveRead = `SKIP (${qdrantProbe.reason})`;
    console.log('\n[live] read_memory_asset SKIP:', qdrantProbe.reason);
    return;
  }

  const assetId = await resolveLiveAssetId();
  if (!assetId) {
    throw new Error('live: no asset id from Qdrant scroll');
  }

  const readResult = await readMemoryAsset({ asset_id: assetId });
  if (readResult.isError) {
    summary.liveRead = `FAIL (${textOnly(readResult).slice(0, 120)})`;
    throw new Error(`live read_memory_asset failed: ${textOnly(readResult)}`);
  }

  const readText = textOnly(readResult);
  assertIncludes(readText, '--- content ---', 'live read_memory_asset');
  if (readText.length < 200) {
    throw new Error(`live read_memory_asset: text too short (${readText.length} chars)`);
  }

  console.log('\n[live] read_memory_asset text (first 600 chars):\n', readText.slice(0, 600));
  console.log('\n[live] read_memory_asset OK asset_id=', assetId);
  summary.liveRead = 'PASS';
}

async function verifyLiveUpdateDelete(config, qdrantProbe) {
  if (process.env.VERIFY_MEMORY_CRUD !== '1') {
    summary.liveUpdateDelete = 'SKIP (set VERIFY_MEMORY_CRUD=1 to run mutating CRUD roundtrip)';
    console.log('\n[live] update/delete SKIP: VERIFY_MEMORY_CRUD 未启用');
    return;
  }

  if (!isMemoryEnabled(config)) {
    summary.liveUpdateDelete = 'SKIP (memory write env incomplete)';
    console.log('\n[live] update/delete SKIP: 未配置完整记忆环境变量');
    return;
  }

  if (!qdrantProbe.ok) {
    summary.liveUpdateDelete = `SKIP (${qdrantProbe.reason})`;
    console.log('\n[live] update/delete SKIP:', qdrantProbe.reason);
    return;
  }

  const embedding = await probeEmbedding(config);
  if (!embedding.ok) {
    summary.liveUpdateDelete = `SKIP (${embedding.reason})`;
    console.log('\n[live] update/delete SKIP: embedding 不可用');
    return;
  }

  const stamp = Date.now();
  const createResult = await memorizeAsset({
    name: `verify-crud-${stamp}`,
    type: 'pattern',
    description: 'verify-memory-tools CRUD roundtrip',
    summary: `crud probe ${stamp}`,
    content: `export const crudProbe = ${stamp};`,
    tags: ['verify', 'crud'],
  });

  if (createResult.isError) {
    throw new Error(`live memorize failed: ${textOnly(createResult)}`);
  }

  const assetId = createResult.structuredContent?.asset?.id;
  if (!assetId) {
    throw new Error('live memorize: missing asset id in structuredContent');
  }

  const previewDelete = await deleteMemoryAsset({ asset_id: assetId });
  if (previewDelete.isError || !previewDelete.structuredContent?.requires_confirmation) {
    throw new Error('live delete preview: expected requires_confirmation=true');
  }
  assertIncludes(textOnly(previewDelete), '待确认删除', 'live delete preview');

  const updateResult = await updateMemoryAsset({
    asset_id: assetId,
    summary: `crud probe updated ${stamp}`,
  });
  if (updateResult.isError || !updateResult.structuredContent?.updated) {
    throw new Error(`live update failed: ${textOnly(updateResult)}`);
  }
  if (!updateResult.structuredContent?.handles?.memory_assets?.[0]?.id) {
    throw new Error('live update: missing handles.memory_assets');
  }

  const deleteResult = await deleteMemoryAsset({ asset_id: assetId, confirm: true });
  if (deleteResult.isError || !deleteResult.structuredContent?.deleted) {
    throw new Error(`live delete failed: ${textOnly(deleteResult)}`);
  }

  console.log('\n[live] update/delete CRUD roundtrip OK asset_id=', assetId);
  summary.liveUpdateDelete = 'PASS';
}

async function main() {
  const config = getMemoryConfig();
  console.log('Memory verify');
  console.log('  QDRANT_URL:', config.qdrantUrl || '(not set)');
  console.log('  EMBEDDING_URL:', config.embeddingUrl || '(not set)');
  console.log('  EMBEDDING_MODEL:', config.embeddingModel || '(not set)');
  console.log('  EMBEDDING_PROVIDER:', config.embeddingProvider);
  console.log('  QDRANT_API_KEY:', config.qdrantApiKey ? '(set)' : '(not set)');

  await verifyWithMock();
  const qdrantProbe = await probeQdrant(config);
  await verifyLiveSearch(config, qdrantProbe);
  await verifyLiveRead(config, qdrantProbe);
  await verifyLiveUpdateDelete(config, qdrantProbe);

  console.log('\n--- summary ---');
  console.log('  mock formatter:', summary.mock);
  console.log('  live search_memory:', summary.liveSearch);
  console.log('  live read_memory_asset:', summary.liveRead);
  console.log('  live update/delete:', summary.liveUpdateDelete);

  if (
    summary.liveRead.startsWith('FAIL') ||
    summary.liveSearch.startsWith('FAIL') ||
    summary.liveUpdateDelete.startsWith('FAIL') ||
    summary.mock !== 'PASS'
  ) {
    process.exitCode = 1;
    console.log('\nFAILED: mock 或 live 检查未通过。');
    return;
  }

  const skipped = [summary.liveSearch, summary.liveRead, summary.liveUpdateDelete].some((s) =>
    String(s).startsWith('SKIP')
  );
  console.log(
    skipped
      ? '\nPASSED: 核心读写链路可用；SKIP 项请按上方提示补齐 Qdrant / embedding / CRUD 环境。'
      : '\nPASSED: search/read/update/delete 记忆链路均通过。'
  );
}

await main();
