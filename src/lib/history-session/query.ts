import * as path from 'node:path';
import {
  DEFAULT_READ_MAX_BYTES,
  MAX_READ_MAX_BYTES,
} from '../history-session-config.js';
import {
  buildManifest,
  historyError,
  resolveHistoryDir,
  scan,
  sha256Text,
} from './storage.js';
import type { SearchHit } from './types.js';

export function searchHistorySession(
  projectRoot: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const historyDir = resolveHistoryDir(projectRoot, typeof args.history_dir === 'string' ? args.history_dir : undefined);
  const report = scan(projectRoot, historyDir);
  const manifest = buildManifest(report);
  const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const limit = clampInt(args.limit, 10, 1, 50);
  const cursor = clampInt(args.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
  const tokens = query ? query.split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(Boolean) : [];

  let hits: SearchHit[] = manifest.entries.map((entry) => {
    const doc = report.documents.find((d) => d.number === entry.number)!;
    let score = 0;
    const hayTitle = entry.title.toLowerCase();
    const hayKw = entry.keywords.join(' ').toLowerCase();
    const hayBody = doc.content.toLowerCase();
    if (!tokens.length) {
      score = Date.parse(entry.updated_at || entry.created_at) || entry.number;
    } else {
      for (const token of tokens) {
        if (hayTitle.includes(token)) score += 16;
        if (hayKw.includes(token)) score += 10;
        if (hayBody.includes(token)) score += 4;
      }
    }
    const idx = tokens.length ? hayBody.indexOf(tokens[0]) : 0;
    const snippetStart = Math.max(0, idx - 40);
    const snippet = doc.content.slice(snippetStart, snippetStart + 160).replace(/\s+/g, ' ').trim();
    return {
      number: entry.number,
      path: entry.path,
      title: entry.title,
      score,
      snippet,
      sha256: entry.sha256,
      updated_at: entry.updated_at,
    };
  });

  hits = hits
    .filter((h) => !tokens.length || h.score > 0)
    .sort((a, b) => b.score - a.score || b.number - a.number);
  const page = hits.slice(cursor, cursor + limit);
  const next = cursor + limit < hits.length ? cursor + limit : null;
  return {
    results: page,
    total: hits.length,
    cursor,
    limit,
    next_cursor: next,
  };
}

export function readHistorySession(
  projectRoot: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const historyDir = resolveHistoryDir(projectRoot, typeof args.history_dir === 'string' ? args.history_dir : undefined);
  const report = scan(projectRoot, historyDir);
  let document = typeof args.number === 'number' || typeof args.number === 'string'
    ? report.documents.find((d) => d.number === Number(args.number))
    : undefined;
  if (!document && typeof args.path === 'string') {
    const normalized = args.path.replace(/\\/g, '/');
    document = report.documents.find(
      (d) => d.path === normalized || d.path.endsWith(`/${path.basename(normalized)}`),
    );
  }
  if (!document) {
    throw historyError('HISTORY_READ_NOT_FOUND', 'Archive not found.', false);
  }

  const bytes = Buffer.from(document.content, 'utf8');
  const contentHash = sha256Text(document.content);
  if (typeof args.expected_hash === 'string' && args.expected_hash && args.expected_hash !== contentHash) {
    throw historyError('HISTORY_ARCHIVE_CHANGED', 'Archive content hash changed; restart read from cursor 0.', true, {
      expected_hash: args.expected_hash,
      content_hash: contentHash,
    });
  }

  const cursor = clampInt(args.cursor, 0, 0, bytes.length);
  if (cursor > bytes.length || (cursor > 0 && cursor < bytes.length && !isUtf8CharBoundary(bytes, cursor))) {
    throw historyError('HISTORY_CURSOR_INVALID', 'cursor must be a UTF-8 character boundary.', false, {
      cursor,
      total_bytes: bytes.length,
    });
  }

  const maxBytes = clampInt(args.max_bytes, DEFAULT_READ_MAX_BYTES, 1, MAX_READ_MAX_BYTES);
  let end = Math.min(bytes.length, cursor + maxBytes);
  while (end < bytes.length && !isUtf8CharBoundary(bytes, end)) end -= 1;
  if (end === cursor && end < bytes.length) {
    end = Math.min(bytes.length, cursor + 4);
    while (end < bytes.length && !isUtf8CharBoundary(bytes, end)) end += 1;
  }

  const slice = bytes.subarray(cursor, end).toString('utf8');
  return {
    number: document.number,
    path: document.path,
    content: slice,
    cursor,
    next_cursor: end < bytes.length ? end : null,
    total_bytes: bytes.length,
    content_hash: contentHash,
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function isUtf8CharBoundary(bytes: Buffer, index: number): boolean {
  if (index <= 0 || index >= bytes.length) return true;
  return (bytes[index] & 0xc0) !== 0x80;
}
