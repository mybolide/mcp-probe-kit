import { memorizeAsset } from '../build/tools/memorize_asset.js';
import { createMemoryClient } from '../build/lib/memory-client.js';

async function main() {
  const qdrantResponse = await fetch('http://127.0.0.1:50008/collections');
  const qdrantJson = await qdrantResponse.json();

  const embeddingResponse = await fetch('http://127.0.0.1:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.MEMORY_EMBEDDING_MODEL || 'nomic-embed-text',
      prompt: 'memory smoke',
    }),
  });
  const embeddingJson = await embeddingResponse.json();

  const client = createMemoryClient();

  const memorizeResult = await memorizeAsset({
    name: 'memory-smoke-asset',
    description: '本地 smoke test 资产',
    summary: '用于验证本地沉淀与检索链路',
    content: 'export const memorySmoke = true;',
    tags: ['smoke', 'memory'],
  });

  const searchResult = client.isEnabled()
    ? await client.search('memory smoke test asset')
    : [];

  console.log(JSON.stringify({
    health: {
      qdrant_ok: qdrantResponse.ok,
      qdrant_collections: qdrantJson?.result?.collections?.length ?? null,
      embedding_ok: embeddingResponse.ok,
      embedding_dims: Array.isArray(embeddingJson?.embedding) ? embeddingJson.embedding.length : null,
    },
    client: {
      enabled: client.isEnabled(),
      readEnabled: client.isReadEnabled(),
    },
    memorizeResult,
    searchTop3: searchResult.slice(0, 3),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});