import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  documentTitle,
  metadata,
  parseCheckpointRecords,
  parseInitialInputRecords,
} from './markdown.js';
import {
  emptyScanReport,
  latestNumber,
  type HistoryDocument,
  type ManifestEntry,
  type MemoryManifest,
  type MemoryReference,
  type MemoryState,
  type ScanReport,
} from './types.js';
import { DEFAULT_HISTORY_DIR } from '../history-session-config.js';

const STATE_ITEM_LIMIT = 12;
const STATE_TEXT_LIMIT = 512;
const STATE_FOCUS_LIMIT = 2048;
const STATE_REFERENCE_LIMIT = 8;

export class HistoryLock {
  private readonly fd: number;
  constructor(fd: number) {
    this.fd = fd;
  }
  release(): void {
    try {
      fs.closeSync(this.fd);
    } catch {
      /* ignore */
    }
  }
}

export function resolveHistoryDir(projectRoot: string, historyDir?: string): string {
  const root = path.resolve(projectRoot);
  const raw = (historyDir ?? DEFAULT_HISTORY_DIR).trim() || DEFAULT_HISTORY_DIR;
  const candidate = path.resolve(root, raw);
  if (!candidate.startsWith(root + path.sep) && candidate !== root) {
    throw historyError('PATH_OUTSIDE_WORKSPACE', 'history_dir must be inside project root', false);
  }
  return candidate;
}

export function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function lockDirectory(historyDir: string): HistoryLock {
  ensureDirectory(historyDir);
  const lockPath = path.join(historyDir, '.history.lock');
  const fd = fs.openSync(lockPath, 'a+');
  try {
    fs.fchmodSync?.(fd, 0o600);
  } catch {
    /* optional */
  }
  // Best-effort exclusive hint via O_EXCL temp marker; primary safety is sync write under lock file handle.
  return new HistoryLock(fd);
}

export function scan(projectRoot: string, historyDir: string): ScanReport {
  const report = emptyScanReport();
  if (!fs.existsSync(historyDir)) return report;
  const root = path.resolve(projectRoot);
  for (const name of fs.readdirSync(historyDir)) {
    if (name === 'README.md' || name === 'index.json' || name === '.history.lock' || name.startsWith('.history-tmp-') || name === 'memory') {
      continue;
    }
    const full = path.join(historyDir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const ext = path.extname(name);
    const stem = path.basename(name, ext);
    const number = Number(stem);
    if (ext !== '.md' || !Number.isInteger(number) || number < 1 || String(number) !== stem) {
      report.invalidFiles.push(name);
      continue;
    }
    const content = fs.readFileSync(full, 'utf8');
    if (!content.trim()) report.emptyFiles.push(name);
    const rel = toPosix(path.relative(root, full));
    const status = (metadata(content, 'Status') ?? 'active').toLowerCase();
    report.documents.push({
      number,
      path: rel,
      content,
      sessionKey: metadata(content, 'Session key'),
      createdAt: metadata(content, 'Created'),
      updatedAt: metadata(content, 'Updated'),
      sealed: status === 'sealed',
    });
  }
  report.documents.sort((a, b) => a.number - b.number);
  report.numbers = report.documents.map((d) => d.number);
  const latest = latestNumber(report);
  if (latest !== undefined) {
    const present = new Set(report.numbers);
    for (let i = 1; i <= latest; i += 1) {
      if (!present.has(i)) report.missingNumbers.push(i);
    }
  }
  // Sealed archives may retain the same session_key after soft rotation.
  const keyCounts = new Map<string, number>();
  for (const doc of report.documents) {
    if (!doc.sessionKey || doc.sealed) continue;
    keyCounts.set(doc.sessionKey, (keyCounts.get(doc.sessionKey) ?? 0) + 1);
  }
  report.duplicateSessionKeys = [...keyCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
  return report;
}

export function writeMarkdown(filePath: string, content: string): void {
  atomicWrite(filePath, content);
}

export function sha256Text(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function buildManifest(report: ScanReport): MemoryManifest {
  const entries: ManifestEntry[] = report.documents.map((document) => ({
    number: document.number,
    path: document.path,
    title: documentTitle(document.content, document.number),
    created_at: document.createdAt ?? '',
    updated_at: document.updatedAt ?? '',
    bytes: Buffer.byteLength(document.content, 'utf8'),
    sha256: sha256Text(document.content),
    keywords: keywords(document),
  }));
  const digest = createHash('sha256');
  for (const entry of entries) {
    digest.update(String(entry.number));
    digest.update(entry.sha256);
  }
  return {
    version: 2,
    archive_revision: `sha256:${digest.digest('hex')}`,
    entries,
  };
}

export function buildState(
  report: ScanReport,
  manifest: MemoryManifest,
  currentNumber: number | undefined,
  timestamp: string,
  stateRevision: number,
): MemoryState {
  const currentDocument = report.documents.find((d) => d.number === currentNumber);
  const currentFocus =
    (currentDocument && latestUserFocus(currentDocument.content))
    || (currentDocument ? documentTitle(currentDocument.content, currentDocument.number) : '尚未记录当前焦点');

  const recentChanges: string[] = [];
  const openItems: string[] = [];
  for (const document of [...report.documents].reverse()) {
    for (const record of latestRevisions(parseCheckpointRecords(document.content)).reverse()) {
      pushBounded(recentChanges, record.files_changed);
      pushBounded(recentChanges, record.decisions);
      pushBounded(openItems, record.remaining_issues);
      pushBounded(openItems, record.next_actions);
    }
  }

  const references = [...manifest.entries]
    .reverse()
    .filter((entry) => entry.number !== currentNumber)
    .slice(0, STATE_REFERENCE_LIMIT)
    .map((entry) => ({
      number: entry.number,
      path: entry.path,
      reason: '最近历史档案；可按需读取原文',
    }));

  return {
    version: 2,
    state_revision: stateRevision,
    archive_revision: manifest.archive_revision,
    generated_at: timestamp,
    current_session: currentNumber === undefined
      ? undefined
      : manifest.entries
        .find((entry) => entry.number === currentNumber)
        ?.path
        ? {
            number: currentNumber,
            path: manifest.entries.find((e) => e.number === currentNumber)!.path,
            reason: '当前会话档案',
          }
        : undefined,
    current_focus: truncateText(currentFocus, STATE_FOCUS_LIMIT),
    recent_changes: recentChanges,
    open_items: openItems,
    references,
  };
}

export function readState(historyDir: string): MemoryState | undefined {
  return readJson(path.join(historyDir, 'memory', 'state.json'));
}

export function writeState(historyDir: string, state: MemoryState): void {
  ensureDirectory(path.join(historyDir, 'memory'));
  atomicWrite(path.join(historyDir, 'memory', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

export function writeManifest(historyDir: string, manifest: MemoryManifest): void {
  ensureDirectory(path.join(historyDir, 'memory'));
  atomicWrite(path.join(historyDir, 'memory', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function readManifest(historyDir: string): MemoryManifest | undefined {
  return readJson(path.join(historyDir, 'memory', 'manifest.json'));
}

export function archiveNeedsRotate(
  content: string,
  limits: { maxLines: number; maxBytes: number },
): boolean {
  const lines = content.split(/\r?\n/).length;
  const bytes = Buffer.byteLength(content, 'utf8');
  return lines >= limits.maxLines || bytes >= limits.maxBytes;
}

export function relativeArchivePath(projectRoot: string, historyDir: string, number: number): string {
  return toPosix(path.relative(path.resolve(projectRoot), path.join(historyDir, `${number}.md`)));
}

export function historyError(code: string, message: string, retryable: boolean, details?: unknown): Error {
  const error = new Error(message) as Error & { code?: string; retryable?: boolean; details?: unknown };
  error.code = code;
  error.retryable = retryable;
  error.details = details;
  return error;
}

function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  ensureDirectory(dir);
  const tmp = path.join(dir, `.history-tmp-${randomUUID()}`);
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }
}

function readJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function keywords(document: HistoryDocument): string[] {
  const values = [
    documentTitle(document.content, document.number),
    ...parseInitialInputRecords(document.content).map((r) => r.raw_user_input),
    ...parseCheckpointRecords(document.content).flatMap((r) => [r.user_intent, r.raw_user_input]),
  ];
  return tokenize(values.join(' ')).slice(0, 32);
}

function tokenize(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/i).filter((t) => t.length >= 2))];
}

function latestUserFocus(content: string): string | undefined {
  const checkpoints = parseCheckpointRecords(content);
  if (checkpoints.length) {
    const latest = checkpoints.reduce((a, b) => (b.revision >= a.revision ? b : a));
    if (latest.raw_user_input.trim()) return latest.raw_user_input;
    if (latest.user_intent.trim()) return latest.user_intent;
  }
  const initials = parseInitialInputRecords(content);
  if (initials.length) {
    return initials.reduce((a, b) => (b.revision >= a.revision ? b : a)).raw_user_input;
  }
  return undefined;
}

function latestRevisions<T extends { turn_id: string; revision: number }>(records: T[]): T[] {
  const map = new Map<string, T>();
  for (const record of records) {
    const existing = map.get(record.turn_id);
    if (!existing || record.revision >= existing.revision) map.set(record.turn_id, record);
  }
  return [...map.values()];
}

function pushBounded(target: string[], values: string[]): void {
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || target.includes(trimmed)) continue;
    if (target.length >= STATE_ITEM_LIMIT) return;
    target.push(truncateText(trimmed, STATE_TEXT_LIMIT));
  }
}

function truncateText(value: string, max: number): string {
  return Buffer.byteLength(value, 'utf8') <= max ? value : value.slice(0, max);
}

export type { MemoryReference };
