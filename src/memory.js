// mcp-probe-kit — 通用记忆：跨项目复用的经验（坑 / 解法 / 决策 / 偏好 / 片段）
// - 记忆是用户级的（~/.mcp-probe-kit/memory.db），不按项目分区；project 字段只是出处溯源，可空
// - 写入不依赖任务：任何时刻都可以 memory.write；task.close 只是其中一个方便入口
// - SQLite 是真源，Qdrant 只是可重建的向量索引；向量栈不可用时降级为关键词检索
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const DDL = `
CREATE TABLE IF NOT EXISTS memories(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  tags_json TEXT NOT NULL DEFAULT '[]',
  project TEXT,
  source TEXT NOT NULL DEFAULT 'agent',
  status TEXT NOT NULL DEFAULT 'active',
  quality INTEGER NOT NULL DEFAULT 0,
  quality_reasons TEXT NOT NULL DEFAULT '[]',
  search_text TEXT NOT NULL,
  point_id TEXT,
  index_state TEXT NOT NULL DEFAULT 'pending',
  index_error TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_memories_state ON memories(index_state);
CREATE INDEX IF NOT EXISTS ix_memories_kind ON memories(kind);
CREATE INDEX IF NOT EXISTS ix_memories_status ON memories(status);
`;

export const MEMORY_KINDS = ["pitfall", "howto", "decision", "preference", "snippet", "note"];

const now = () => new Date().toISOString();

export function memoryConfig(env = process.env) {
  const provider = String(env.MEMORY_EMBEDDING_PROVIDER ?? "ollama").trim().toLowerCase();
  const isOpenAI = provider === "openai" || provider === "openai-compatible";
  return {
    enabled: String(env.MCP_PROBE_KIT_MEMORY ?? "on").toLowerCase() !== "off",
    dbFile: env.MCP_PROBE_KIT_MEMORY_DB ?? path.join(os.homedir(), ".mcp-probe-kit", "memory.db"),
    provider: isOpenAI ? "openai" : "ollama",
    embeddingUrl: String(env.MEMORY_EMBEDDING_URL ?? (isOpenAI ? "http://127.0.0.1:8000/v1" : "http://127.0.0.1:11434")).replace(/\/+$/, ""),
    model: env.MEMORY_EMBEDDING_MODEL ?? (isOpenAI ? "text-embedding-3-small" : "nomic-embed-text"),
    apiKey: env.MEMORY_EMBEDDING_API_KEY ?? "",
    qdrantUrl: String(env.MEMORY_QDRANT_URL ?? "http://127.0.0.1:6333").replace(/\/+$/, ""),
    collection: env.MEMORY_QDRANT_COLLECTION ?? "mcp-probe-kit_memory",
    timeoutMs: Number(env.MEMORY_TIMEOUT_MS ?? 2500),
    minScore: Number(env.MEMORY_MIN_SCORE ?? 0.55),
    dedupeScore: Number(env.MEMORY_DEDUPE_SCORE ?? 0.9),
  };
}

export function openMemory(cfg = memoryConfig()) {
  fs.mkdirSync(path.dirname(cfg.dbFile), { recursive: true });
  const db = new DatabaseSync(cfg.dbFile);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  db.exec(DDL);
  migrate(db);
  return db;
}

/** 检索用的规范化文本：小写 + 去标点 + 中文 bigram（让 LIKE 也能命中中文片段） */
export function searchText(...parts) {
  const raw = parts.filter(Boolean).join(" \n ").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
  const grams = [];
  for (const chunk of raw.split(" ")) {
    if (chunk.length > 2 && /[\u4e00-\u9fa5]/.test(chunk)) {
      for (let i = 0; i < chunk.length - 1; i += 1) grams.push(chunk.slice(i, i + 2));
    }
  }
  return `${raw} ${grams.join(" ")}`.trim();
}

// ── 向量栈（Ollama / OpenAI-compatible 嵌入 + Qdrant REST） ────────────────

async function httpJson(url, { method = "GET", body, apiKey, timeoutMs }) {
  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

export async function embed(cfg, text) {
  const input = String(text).slice(0, 4000);
  if (cfg.provider === "openai") {
    const res = await httpJson(`${cfg.embeddingUrl}/embeddings`, {
      method: "POST",
      body: { model: cfg.model, input },
      apiKey: cfg.apiKey,
      timeoutMs: cfg.timeoutMs,
    });
    if (res.status !== 200) throw new Error(`embedding HTTP ${res.status}`);
    const vec = res.json?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || !vec.length) throw new Error("embedding 响应没有向量");
    return vec;
  }
  const res = await httpJson(`${cfg.embeddingUrl}/api/embeddings`, {
    method: "POST",
    body: { model: cfg.model, prompt: input },
    timeoutMs: cfg.timeoutMs,
  });
  if (res.status !== 200) throw new Error(`embedding HTTP ${res.status}`);
  const vec = res.json?.embedding;
  if (!Array.isArray(vec) || !vec.length) throw new Error("embedding 响应没有向量");
  return vec;
}

async function collectionExists(cfg) {
  const res = await httpJson(`${cfg.qdrantUrl}/collections/${cfg.collection}`, { timeoutMs: cfg.timeoutMs });
  return res.status === 200;
}

async function ensureCollection(cfg, size) {
  if (await collectionExists(cfg)) return;
  const res = await httpJson(`${cfg.qdrantUrl}/collections/${cfg.collection}`, {
    method: "PUT",
    body: { vectors: { size, distance: "Cosine" } },
    timeoutMs: cfg.timeoutMs,
  });
  if (res.status >= 300 && res.status !== 409) throw new Error(`qdrant 建集合失败 HTTP ${res.status}`);
}

async function upsertPoint(cfg, point) {
  const res = await httpJson(`${cfg.qdrantUrl}/collections/${cfg.collection}/points?wait=true`, {
    method: "PUT",
    body: { points: [point] },
    timeoutMs: cfg.timeoutMs,
  });
  if (res.status >= 300) throw new Error(`qdrant upsert 失败 HTTP ${res.status}`);
}

async function queryVectors(cfg, vector, limit, minScore = cfg.minScore) {
  const res = await httpJson(`${cfg.qdrantUrl}/collections/${cfg.collection}/points/search`, {
    method: "POST",
    body: { vector, limit, with_payload: true },
    timeoutMs: cfg.timeoutMs,
  });
  if (res.status === 404) return [];
  return (res.json?.result ?? []).filter((hit) => (hit.score ?? 0) >= minScore);
}

// ── 写：先落真源，再建索引 ────────────────────────────────────────────────

// ── 写：先落真源，再建索引 ────────────────────────────────────────────────

/** 老库升级：补 status/quality 两列（v6-alpha 自用，轻量迁移） */
function migrate(db) {
  const cols = new Set(db.prepare("PRAGMA table_info(memories)").all().map((c) => c.name));
  if (!cols.has("status")) db.exec("ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  if (!cols.has("quality")) db.exec("ALTER TABLE memories ADD COLUMN quality INTEGER NOT NULL DEFAULT 0");
  if (!cols.has("quality_reasons")) db.exec("ALTER TABLE memories ADD COLUMN quality_reasons TEXT NOT NULL DEFAULT '[]'");
}

/**
 * 资格判定：不是所有踩过的坑都配进记忆库。
 * 一次性手滑（拼错/漏文件/改名）、没有可观测信号、写死项目私有路径的，一律进隔离区。
 */
const ONE_OFF = /(拼写|拼错|typo|漏了|忘了|忘记|手滑|误删|重命名|改了?文件名|写错文件名)/i;
const SIGNAL = /(E_[A-Z_]{3,}|Error:|error:|Exception|Traceback|exit code|报错|失败|超时|timeout|panic|assert)/i;
const SOLUTION = /(解法|解决|改成|改为|换成|改用|补上|加上|去掉|删掉|替换|升级|降级|回滚|重装|配置|设置|清缓存|重跑|install|patch|fix)/i;

export function qualify({ title = "", body = "", kind = "note" }, { projectTokens = [] } = {}) {
  const text = `${title}\n${body}`;
  const reasons = [];
  // 「当出现 X 时，用 Y」的通用写法本身就算合格结构（不需要报错码也能被复用）
  const isRule = /当出现[\s\S]{1,140}?(?:时|的时候)[，,]?[\s\S]{0,140}?(?:用|采用|使用|改成|改为|补|加|删|换|回滚|重跑)/.test(text);
  if (String(body).trim().length < 30) reasons.push("too-short");
  if (!SIGNAL.test(text) && !isRule) reasons.push("no-observable-signal");
  // 只看「解法」是不是一次性：症状里出现错误码不代表经验可复用
  if (ONE_OFF.test(body)) reasons.push("one-off");
  if (!SOLUTION.test(body) && !isRule) reasons.push("no-solution");
  if (projectTokens.some((t) => t && String(t).length >= 4 && text.includes(String(t)))) reasons.push("project-specific");
  return { ok: reasons.length === 0, reasons };
}

export const normalizeTitle = (s) => String(s ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "").slice(0, 60);

/** 隔离区提示：不合格的经验不是丢掉，而是要求改写成「通则」再记 */
export function generalizeHint(reasons = []) {
  const why = reasons.length ? `（原因：${reasons.join(" / ")}）` : "";
  return {
    code: "E_MEMORY_CANDIDATE",
    reasons,
    ask: `这条经验不够通用，已进隔离区${why}。请改写成通则后再 memory.write 一次：当出现 <现象/报错> 时，用 <做法>（原因：<为什么>）。`,
    template: "当出现 X 时，用 Y（原因：Z）",
    example: {
      action: "memory.write",
      args: {
        title: "当 X 时用 Y",
        body: "当出现 <现象/报错> 时，用 <做法>（原因：<为什么>）",
        kind: "howto",
        tags: ["<技术栈>"],
      },
    },
  };
}
export function remember(db, { title, body, kind = "note", tags = [], project = null, source = "agent", status = "active", reasons = [] }) {
  const cleanTitle = String(title ?? "").trim();
  const cleanBody = String(body ?? "").trim();
  if (!cleanTitle) throw Object.assign(new Error("memory 需要标题"), { code: "E_CONTRACT" });
  if (!cleanBody) throw Object.assign(new Error("memory 需要内容"), { code: "E_CONTRACT" });

  // 去重：同一件事（标题规范化后相同）不重复入库，只补证据与计数
  const norm = normalizeTitle(cleanTitle);
  const dup = db
    .prepare("SELECT * FROM memories WHERE deleted_at IS NULL")
    .all()
    .find((row) => normalizeTitle(row.title) === norm);
  if (dup) {
    if (cleanBody.length > String(dup.body).length) db.prepare("UPDATE memories SET body=? WHERE id=?").run(cleanBody, dup.id);
    db.prepare("UPDATE memories SET hits=hits+1 WHERE id=?").run(dup.id);
    return { ...db.prepare("SELECT * FROM memories WHERE id=?").get(dup.id), deduped: true };
  }

  const id = `M-${crypto.randomUUID().slice(0, 8)}`;
  const quality = Math.max(0, 100 - reasons.length * 25);
  db.prepare(
    "INSERT INTO memories(id,title,body,kind,tags_json,project,source,status,quality,quality_reasons,search_text,point_id,index_state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id,
    cleanTitle,
    cleanBody,
    MEMORY_KINDS.includes(kind) ? kind : "note",
    JSON.stringify(tags ?? []),
    project,
    source,
    status === "active" ? "active" : "candidate",
    quality,
    JSON.stringify(reasons ?? []),
    searchText(cleanTitle, cleanBody, (tags ?? []).join(" "), kind),
    crypto.randomUUID(),
    "pending",
    now(),
  );
  return db.prepare("SELECT * FROM memories WHERE id=?").get(id);
}

/** 建索引；失败只标记（向量是可重建缓存），永远不抛给调用方 */
/** 用给定向量建/更新索引；失败只标记（向量是可重建缓存） */
async function upsertIndexed(db, cfg, row, vector) {
  try {
    await ensureCollection(cfg, vector.length);
    await upsertPoint(cfg, {
      id: row.point_id,
      vector,
      payload: { id: row.id, title: row.title, body: row.body, kind: row.kind, tags: JSON.parse(row.tags_json ?? "[]"), project: row.project },
    });
    db.prepare("UPDATE memories SET index_state='indexed', index_error=NULL WHERE id=?").run(row.id);
    return { indexed: true };
  } catch (error) {
    db.prepare("UPDATE memories SET index_state='failed', index_error=? WHERE id=?").run(String(error.message).slice(0, 200), row.id);
    return { indexed: false, reason: error.message };
  }
}

export async function indexMemory(db, cfg, row) {
  let vector;
  try {
    vector = await embed(cfg, `${row.title}\n${row.body}`);
  } catch (error) {
    db.prepare("UPDATE memories SET index_state='failed', index_error=? WHERE id=?").run(String(error.message).slice(0, 200), row.id);
    return { indexed: false, reason: error.message };
  }
  return upsertIndexed(db, cfg, row, vector);
}

/** 语义重复：合并到已有条目（留更长正文、并标签、hits+1，候选遇到合格经验自动晋升） */
function mergeMemory(db, existing, entry) {
  const tags = [...new Set([...JSON.parse(existing.tags_json ?? "[]"), ...(entry.tags ?? [])])];
  const body = String(entry.body ?? "").length > String(existing.body ?? "").length ? entry.body : existing.body;
  const status = entry.status === "active" ? "active" : existing.status;
  db.prepare("UPDATE memories SET body=?, tags_json=?, status=?, hits=hits+1, search_text=? WHERE id=?").run(
    body,
    JSON.stringify(tags),
    status,
    searchText(existing.title, body, tags.join(" "), existing.kind),
    existing.id,
  );
  return db.prepare("SELECT * FROM memories WHERE id=?").get(existing.id);
}

/** 编辑 + 可选晋升（控制台「改一句话再收进记忆」用这个） */
export async function editMemory(cfg, id, { title, body } = {}, { promote = false } = {}) {
  const db = openMemory(cfg);
  try {
    const row = db.prepare("SELECT * FROM memories WHERE id=?").get(id);
    if (!row) return { updated: false, reason: "not found" };
    const nextTitle = String(title ?? row.title).trim() || row.title;
    const nextBody = String(body ?? row.body).trim() || row.body;
    db.prepare("UPDATE memories SET title=?, body=?, search_text=? WHERE id=?").run(
      nextTitle,
      nextBody,
      searchText(nextTitle, nextBody, row.tags_json ?? "", row.kind),
      id,
    );
    if (promote) db.prepare("UPDATE memories SET status='active', index_state='pending' WHERE id=?").run(id);
    const fresh = db.prepare("SELECT * FROM memories WHERE id=?").get(id);
    const index = fresh.status === "active" ? await indexMemory(db, cfg, fresh) : { indexed: null };
    return { updated: true, id, status: fresh.status, indexed: index.indexed };
  } finally {
    db.close();
  }
}

/** 一步写记忆：落库 + 建索引（索引失败不影响返回） */
export async function rememberAndIndex(opts, cfg = memoryConfig()) {
  if (!cfg.enabled) return { recorded: false, reason: "MCP_PROBE_KIT_MEMORY=off" };
  let db;
  try {
    db = openMemory(cfg);
    // 只有「经验类」（pitfall/howto）需要过资格判定；偏好/决策/片段是显式知识，直接生效
    const entry = { ...opts };
    if (!entry.status) {
      if (entry.kind === "pitfall" || entry.kind === "howto") {
        const { ok, reasons } = qualify(entry, { projectTokens: entry.projectTokens ?? [] });
        entry.status = ok ? "active" : "candidate";
        entry.reasons = reasons;
      } else {
        entry.status = "active";
      }
    }
    delete entry.projectTokens;

    // 语义去重：和已有记忆太像就不新增，合并正文/标签并 hits+1（向量不可用时退回标题去重）
    let vector = null;
    try {
      vector = await embed(cfg, `${entry.title}\n${entry.body}`);
      const near = await queryVectors(cfg, vector, 3, cfg.dedupeScore);
      const hit = near[0];
      if (hit?.payload?.id) {
        const existing = db.prepare("SELECT * FROM memories WHERE id=? AND deleted_at IS NULL").get(hit.payload.id);
        if (existing) {
          const merged = mergeMemory(db, existing, entry);
          let indexed = null;
          if (merged.status === "active") {
            const r = await indexMemory(db, cfg, merged);
            indexed = r.indexed;
          }
          return {
            recorded: true,
            id: merged.id,
            status: merged.status,
            deduped: true,
            score: Number((hit.score ?? 0).toFixed(3)),
            indexed,
          };
        }
      }
    } catch {
      /* 向量栈不可用：继续走标题级去重 */
    }

    const row = remember(db, entry);
    // 隔离区的候选不建索引、不参与召回：它们还没证明值得复用
    if (row.status !== "active") return { recorded: true, id: row.id, status: "candidate", reasons: JSON.parse(row.quality_reasons ?? "[]") };
    const index = vector ? await upsertIndexed(db, cfg, row, vector) : await indexMemory(db, cfg, row);
    return { recorded: true, id: row.id, status: "active", indexed: index.indexed, indexError: index.reason ?? null };
  } catch (error) {
    return { recorded: false, reason: String(error.message).slice(0, 160) };
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/** 晋升：候选 → 正式（建索引，进入召回） */
export async function promoteMemory(cfg, id) {
  const db = openMemory(cfg);
  try {
    const row = db.prepare("SELECT * FROM memories WHERE id=?").get(id);
    if (!row) return { promoted: false, reason: "not found" };
    db.prepare("UPDATE memories SET status='active', index_state='pending' WHERE id=?").run(id);
    const fresh = db.prepare("SELECT * FROM memories WHERE id=?").get(id);
    const index = await indexMemory(db, cfg, fresh);
    return { promoted: true, indexed: index.indexed, indexError: index.reason ?? null };
  } finally {
    db.close();
  }
}

export function demoteMemory(cfg, id) {
  const db = openMemory(cfg);
  try {
    return db.prepare("UPDATE memories SET status='candidate' WHERE id=? AND deleted_at IS NULL").run(id).changes === 1;
  } finally {
    db.close();
  }
}

export async function reindexPending(db, cfg) {
  const rows = db.prepare("SELECT * FROM memories WHERE index_state<>'indexed' AND deleted_at IS NULL").all();
  let ok = 0;
  for (const row of rows) {
    const res = await indexMemory(db, cfg, row);
    if (res.indexed) ok += 1;
  }
  return { total: rows.length, indexed: ok };
}

// ── 读 ──────────────────────────────────────────────────────────────────

function likeSearch(db, text, limit) {
  const words = String(text)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .slice(0, 8);
  if (!words.length) return [];
  const where = words.map(() => "search_text LIKE ?").join(" OR ");
  return db
    .prepare(`SELECT * FROM memories WHERE status='active' AND deleted_at IS NULL AND (${where}) ORDER BY hits DESC, created_at DESC LIMIT ?`)
    .all(...words.map((w) => `%${w}%`), limit);
}

function bumpHits(db, ids) {
  const stmt = db.prepare("UPDATE memories SET hits=hits+1 WHERE id=?");
  for (const id of ids) stmt.run(id);
}

export const card = (row, score) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  kind: row.kind,
  tags: JSON.parse(row.tags_json ?? "[]"),
  project: row.project,
  created_at: row.created_at,
  ...(score === undefined ? {} : { score: Number(score.toFixed(3)) }),
});

export function recentMemories(db, limit = 3) {
  return db.prepare("SELECT * FROM memories WHERE status='active' AND deleted_at IS NULL ORDER BY hits DESC, created_at DESC LIMIT ?").all(limit);
}

export async function searchMemories(cfg, db, { query, limit = 5 }) {
  const text = String(query ?? "").trim();
  if (!text) return { memories: recentMemories(db, limit).map((r) => card(r)), mode: "recent" };
  try {
    const vector = await embed(cfg, text);
    const hits = await queryVectors(cfg, vector, limit);
    if (!hits.length) return { memories: [], mode: "vector" };
    const rows = hits
      .map((hit) => {
        const row = db.prepare("SELECT * FROM memories WHERE id=? AND status='active' AND deleted_at IS NULL").get(hit.payload?.id);
        return row ? card(row, hit.score) : null;
      })
      .filter(Boolean);
    bumpHits(db, rows.map((r) => r.id));
    return { memories: rows, mode: "vector" };
  } catch (error) {
    const rows = likeSearch(db, text, limit);
    bumpHits(db, rows.map((r) => r.id));
    return { memories: rows.map((r) => card(r)), mode: "keyword", degraded: String(error.message).slice(0, 160) };
  }
}

/**
 * 开局召回：不要求有任务。有任务时用标题/scope 作查询，没有就取最常用/最新。
 * 任何异常都吞掉——记忆不可用不该影响开工。
 */
export async function recallMemories(root, task = null, { limit = 3 } = {}) {
  const cfg = memoryConfig();
  if (!cfg.enabled) return { memories: [], mode: "off" };
  let db;
  try {
    db = openMemory(cfg);
    const query = task ? `${task.title ?? ""} ${(task.scope ?? []).join(" ")} ${task.kind ?? ""}`.trim() : "";
    const { memories, mode, degraded } = await searchMemories(cfg, db, { query, limit });
    return { memories, mode, degraded, project: root ? path.basename(root) : null };
  } catch (error) {
    return { memories: [], mode: "error", degraded: String(error.message).slice(0, 160) };
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/** task.close 的便捷入口：失败过的任务自动记一条 pitfall（project 只是出处） */
export async function rememberTaskPitfall(root, task, resolvedBy, lastFailure, cfg = memoryConfig()) {
  if (!cfg.enabled) return { recorded: false, reason: "MCP_PROBE_KIT_MEMORY=off" };
  const entry = {
    title: task.title,
    body: `现象：${String(lastFailure ?? "（未记录失败详情）").slice(0, 500)}\n解法：${String(resolvedBy).slice(0, 800)}`,
    kind: "pitfall",
    tags: [...(task.scope ?? []), task.kind].filter(Boolean).slice(0, 6),
    project: root ? path.basename(root) : null,
    source: "task-close",
    projectTokens: [root ? path.basename(root) : null],
  };
  return rememberAndIndex(entry, cfg);
}

// ── 治理 / 观测 ──────────────────────────────────────────────────────────

export function memoryStatus(cfg = memoryConfig()) {
  if (!cfg.enabled) return { enabled: false, reason: "MCP_PROBE_KIT_MEMORY=off" };
  try {
    const db = openMemory(cfg);
    const byStatus = Object.fromEntries(db.prepare("SELECT status, COUNT(*) n FROM memories WHERE deleted_at IS NULL GROUP BY status").all().map((c) => [c.status, c.n]));
    const byState = Object.fromEntries(db.prepare("SELECT index_state, COUNT(*) n FROM memories WHERE deleted_at IS NULL GROUP BY index_state").all().map((c) => [c.index_state, c.n]));
    const byKind = Object.fromEntries(db.prepare("SELECT kind, COUNT(*) n FROM memories WHERE deleted_at IS NULL GROUP BY kind").all().map((c) => [c.kind, c.n]));
    const total = db.prepare("SELECT COUNT(*) n FROM memories").get().n;
    db.close();
    return {
      enabled: true,
      file: cfg.dbFile,
      total,
      byStatus,
      byState,
      byKind,
      embedding: `${cfg.provider}:${cfg.model} @ ${cfg.embeddingUrl}`,
      qdrant: `${cfg.qdrantUrl}/${cfg.collection}`,
    };
  } catch (error) {
    return { enabled: true, error: String(error.message).slice(0, 200) };
  }
}

export function listMemories(cfg, limit = 20, kind = null, status = null) {
  if (!cfg.enabled) return [];
  try {
    const db = openMemory(cfg);
    const where = ["deleted_at IS NULL"];
    const args2 = [];
    if (kind) {
      where.push("kind=?");
      args2.push(kind);
    }
    if (status) {
      where.push("status=?");
      args2.push(status);
    }
    const rows = db
      .prepare(`SELECT * FROM memories WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`)
      .all(...args2, limit);
    db.close();
    return rows.map((r) => card(r));
  } catch {
    return [];
  }
}

export function softDeleteMemory(cfg, id) {
  const db = openMemory(cfg);
  const res = db.prepare("UPDATE memories SET deleted_at=? WHERE id=? AND deleted_at IS NULL").run(now(), id);
  db.close();
  return res.changes === 1;
}

/** 导出 markdown：可进 git、可读、可备份（真源仍是 SQLite） */
export function exportMemories(cfg, limit = 500) {
  const db = openMemory(cfg);
  const rows = db.prepare("SELECT * FROM memories WHERE deleted_at IS NULL ORDER BY kind, created_at DESC LIMIT ?").all(limit);
  db.close();
  const lines = ["# mcp-probe-kit 记忆", ""];
  for (const row of rows) {
    const tags = JSON.parse(row.tags_json ?? "[]");
    lines.push(`## ${row.title}`, "", `- kind: ${row.kind}${row.project ? ` · 出自 ${row.project}` : ""}${tags.length ? ` · tags: ${tags.join(", ")}` : ""}`, "", row.body, "");
  }
  return lines.join("\n");
}