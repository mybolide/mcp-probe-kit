#!/usr/bin/env node
// mcp-probe-kit — v5 记忆迁移：只读 v5 的 Qdrant collection，映射成 v6 通用记忆
// 默认 dry-run（只打印不落库）；--write 才写入 ~/.mcp-probe-kit/memory.db
import { pathToFileURL } from "node:url";
import { memoryConfig, normalizeTitle, openMemory, rememberAndIndex } from "../src/memory.js";

function pick(payload, keys) {
  for (const k of keys) {
    const v = payload?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function asTags(payload) {
  const raw = payload?.tags ?? payload?.tag ?? payload?.labels ?? [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  const extra = [payload?.sourceProject, payload?.project, payload?.language, payload?.stack].filter(Boolean);
  return [...new Set([...list, ...extra].map((t) => String(t).trim()).filter(Boolean))].slice(0, 8);
}

/** v5 的一条 memory asset → v6 的一条记忆；看不出来就不迁 */
export function mapV5Point(point) {
  const p = point?.payload ?? {};
  const body = pick(p, ["content", "text", "body", "description", "detail", "summary"]);
  if (!body) return null;
  // 没标题就用正文第一行当标题（比 id 生成的可检索）
  const title = pick(p, ["title", "name", "heading"]) ?? body.split("\n")[0].slice(0, 40).trim();
  if (!title) return null;
  const kindRaw = String(pick(p, ["kind", "type", "category", "scope"]) ?? "").toLowerCase();
  const kind = /pitfall|bug|坑|issue|gotcha/.test(kindRaw)
    ? "pitfall"
    : /how|fix|solution|做法|解决/.test(kindRaw)
      ? "howto"
      : /decision|决定|决策|adr/.test(kindRaw)
        ? "decision"
        : /prefer|偏好|约定|convention/.test(kindRaw)
          ? "preference"
          : /snippet|代码|片段|example/.test(kindRaw)
            ? "snippet"
            : "note";
  return {
    title: title.slice(0, 80),
    body: body.slice(0, 1200),
    kind,
    tags: asTags(p),
    project: pick(p, ["sourceProject", "project", "repo", "repository"]),
    source: "v5-import",
  };
}

export async function fetchV5Points(qdrantUrl, collection, { limit = 256 } = {}) {
  const base = String(qdrantUrl).replace(/\/+$/, "");
  const info = await fetch(`${base}/collections/${encodeURIComponent(collection)}`, { signal: AbortSignal.timeout(3000) });
  if (info.status !== 200) throw new Error(`v5 collection 不存在或不可读（HTTP ${info.status}）：${base}/${collection}`);
  const points = [];
  let offset = null;
  do {
    const res = await fetch(`${base}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit, with_payload: true, ...(offset ? { offset } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status >= 300) throw new Error(`scroll 失败 HTTP ${res.status}`);
    const json = await res.json();
    points.push(...(json?.result?.points ?? []));
    offset = json?.result?.next_page_offset ?? null;
  } while (offset);
  return points;
}

export async function runImport({ qdrantUrl, collection, dryRun = true, limit = 256, log = console.log } = {}) {
  const cfg = memoryConfig();
  const points = await fetchV5Points(qdrantUrl, collection, { limit });
  const mapped = points.map(mapV5Point).filter(Boolean);

  const db = openMemory(cfg);
  const existing = new Set(
    db
      .prepare("SELECT title FROM memories WHERE deleted_at IS NULL")
      .all()
      .map((r) => normalizeTitle(r.title)),
  );
  const result = { total: points.length, mapped: mapped.length, duplicates: 0, written: 0, indexed: 0, failed: 0, dryRun, sample: mapped.slice(0, 20) };
  for (const entry of mapped) {
    if (existing.has(normalizeTitle(entry.title))) {
      result.duplicates += 1;
      continue;
    }
    if (dryRun) continue;
    const res = await rememberAndIndex(entry, cfg);
    if (res.recorded) {
      result.written += 1;
      if (res.indexed) result.indexed += 1;
      existing.add(normalizeTitle(entry.title));
    } else {
      result.failed += 1;
    }
  }
  db.close();
  log(
    dryRun
      ? `v5 → v6 dry-run：读到 ${result.total} 条，可映射 ${result.mapped} 条，其中 ${result.duplicates} 条已存在。加 --write 才会写入 ${cfg.dbFile}`
      : `v5 → v6 写入完成：新增 ${result.written} 条（索引成功 ${result.indexed}，失败 ${result.failed}），跳过重复 ${result.duplicates} 条`,
  );
  for (const s of result.sample) log(`  · [${s.kind}] ${s.title}${s.project ? `（${s.project}）` : ""}`);
  return result;
}

function parseArgs(argv) {
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  return {
    qdrantUrl: flag("qdrant", process.env.MEMORY_QDRANT_URL ?? "http://127.0.0.1:6333"),
    collection: flag("collection", process.env.MEMORY_V5_COLLECTION ?? "memory"),
    dryRun: !argv.includes("--write"),
    limit: Number(flag("limit", 256)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    await runImport(opts);
  } catch (error) {
    console.error(`迁移失败：${error.message}`);
    console.error(`用法：node scripts/v5-import.mjs --qdrant http://127.0.0.1:6333 --collection <v5 的集合名> [--write]`);
    process.exit(1);
  }
}