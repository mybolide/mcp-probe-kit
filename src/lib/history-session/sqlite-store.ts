/**
 * History Session's project-local SQLite storage adapter.
 *
 * History Session remains the SOLE owner of conversation archives, initial
 * inputs, checkpoint semantics, bounded continuation, search and pagination.
 * DevControl reads those archives; this is NOT the cross-project Qdrant Memory
 * service and not a duplicate dc_work_items "memory" table.
 *
 * Numbered Markdown archives are imported losslessly. While an already
 * running older MCP process is still writing those files, subsequent reads
 * reconcile newer append-only archives rather than treating the initial
 * import as proof that the migration has finished.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { ensureDatabaseIgnored, resolveProjectDatabase } from '../../devcontrol/project-storage.js';
import { metadata, parseCheckpointRecords, parseInitialInputRecords } from './markdown.js';

interface StoreStatement {
  run(...args: Array<string | number>): unknown;
  all(...args: Array<string | number>): Array<Record<string, unknown>>;
  get(...args: Array<string | number>): Record<string, unknown> | undefined;
}
interface StoreDatabase {
  exec(sql: string): void;
  prepare(sql: string): StoreStatement;
  close(): void;
}

const req = createRequire(import.meta.url);

export function usesHistorySqlite(projectRoot: string, historyDir: string): boolean {
  const mode = process.env.MCP_HISTORY_STORAGE?.trim().toLowerCase();
  if (mode && mode !== 'sqlite') {
    throw new Error('V5_SQLITE_ONLY: MCP_HISTORY_STORAGE=files/markdown is removed. Import old archives into project SQLite.');
  }
  if (Number.parseInt(process.versions.node.split('.')[0] || '0', 10) < 22) {
    throw new Error('V5_REQUIRES_NODE22: History and DevControl require Node.js 22+.');
  }
  const root = path.resolve(projectRoot);
  if (path.resolve(historyDir) !== path.join(root, 'docs', 'history-session')) {
    throw new Error('V5_SQLITE_ONLY: custom history_dir is unsupported. Use the project SQLite hs_* history.');
  }
  if (!fs.existsSync(path.join(root, '.git'))) {
    throw new Error('V5_GIT_PROJECT_REQUIRED: History SQLite needs a real Git project root.');
  }
  return true;
}

/** Only the default project history directory may use the SQLite bridge. */
export function sqliteProjectForHistoryDir(historyDir: string): string | null {
  const normalized = path.resolve(historyDir);
  if (path.basename(normalized) !== 'history-session' ||
      path.basename(path.dirname(normalized)) !== 'docs') {
    throw new Error('V5_SQLITE_ONLY: history_dir must be <Git project>/docs/history-session (virtual locator).');
  }
  const project = path.dirname(path.dirname(normalized));
  return usesHistorySqlite(project, normalized) ? project : null;
}

function withDatabase<T>(projectRoot: string, read: (db: StoreDatabase) => T): T {
  const dbPath = resolveProjectDatabase(projectRoot);
  ensureDatabaseIgnored(projectRoot, dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { DatabaseSync } = req('node:sqlite') as {
    DatabaseSync: new (file: string) => StoreDatabase;
  };
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS hs_archive (
        number INTEGER PRIMARY KEY CHECK(number>0),
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hs_derived (
        key TEXT PRIMARY KEY CHECK(key IN ('state','manifest')),
        content TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hs_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    migrateExistingMarkdown(projectRoot, db);
    return read(db);
  } finally {
    db.close();
  }
}

function migrateExistingMarkdown(projectRoot: string, db: StoreDatabase): void {
  const dir = path.join(projectRoot, 'docs', 'history-session');
  if (!fs.existsSync(dir)) return;
  // Do not trust a one-time 'legacy_import_done' flag. Another older MCP
  // process may keep writing 2.md/3.md after the initial SQLite import.
  // Compare content hashes, never overwrite a newer SQLite-only revision.
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[1-9]\d*\.md$/.test(entry.name));
  if (!files.length) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const entry of files) {
      const number = Number(entry.name.slice(0, -3));
      if (!Number.isSafeInteger(number)) continue;
      const filePath = path.join(dir, entry.name);
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.trim()) continue;
      const fileModified = fs.statSync(filePath).mtime;
      const saved = db.prepare('SELECT content,updated_at FROM hs_archive WHERE number=?')
        .get(number);
      if (!saved) {
        db.prepare(
          'INSERT INTO hs_archive(number,content,updated_at) VALUES(?,?,?)',
        ).run(number, content, fileModified.toISOString());
        continue;
      }
      if (String(saved.content) === content) continue;
      const savedTimestamp = Date.parse(String(saved.updated_at));
      if (Number.isFinite(savedTimestamp) && fileModified.getTime() <= savedTimestamp) {
        continue; // SQLite has a newer, authoritative revision.
      }
      if (!preservesPriorHistory(String(saved.content), content)) {
        // Fail closed on divergent writers. Keep BOTH originals untouched and
        // save only digests for diagnostics; never overwrite session content.
        const digest = (text: string) => createHash('sha256').update(text).digest('hex');
        db.prepare(`INSERT INTO hs_meta(key,value) VALUES(?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
          .run(`legacy_conflict_${number}`,
            JSON.stringify({ sqlite: digest(String(saved.content)), file: digest(content) }));
        continue;
      }
      db.prepare('UPDATE hs_archive SET content=?,updated_at=? WHERE number=?')
        .run(content, fileModified.toISOString(), number);
      db.prepare('DELETE FROM hs_meta WHERE key=?').run(`legacy_conflict_${number}`);
    }
    db.prepare("INSERT OR IGNORE INTO hs_meta(key,value) VALUES('legacy_import_done',?)")
      .run(new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** A newer Markdown writer may append checkpoints or revise the first input.
 * It may NOT silently discard any SQLite checkpoint or original input. */
function preservesPriorHistory(previous: string, newer: string): boolean {
  if (metadata(previous, 'Session key') !== metadata(newer, 'Session key') ||
    metadata(previous, 'Created') !== metadata(newer, 'Created')) return false;
  const covers = <T>(older: T[], incoming: T[]) => {
    const signatures = new Set(incoming.map((item) => JSON.stringify(item)));
    return older.every((item) => signatures.has(JSON.stringify(item)));
  };
  return covers(parseCheckpointRecords(previous), parseCheckpointRecords(newer)) &&
    covers(parseInitialInputRecords(previous), parseInitialInputRecords(newer));
}

export function readSqliteHistoryDocuments(projectRoot: string): Array<{
  number: number; content: string;
}> {
  return withDatabase(projectRoot, (db) =>
    db.prepare('SELECT number,content FROM hs_archive ORDER BY number').all()
      .map((row) => ({ number: Number(row.number), content: String(row.content) })));
}

export function writeSqliteHistoryDocument(
  projectRoot: string, number: number, content: string,
): void {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('Invalid History Session archive number');
  }
  withDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO hs_archive(number,content,updated_at) VALUES(?,?,?)
      ON CONFLICT(number) DO UPDATE SET
        content=excluded.content,updated_at=excluded.updated_at
    `).run(number, content, new Date().toISOString());
  });
}

export function readSqliteHistoryDerived<T>(
  projectRoot: string, key: 'state' | 'manifest',
): T | undefined {
  return withDatabase(projectRoot, (db) => {
    const row = db.prepare('SELECT content FROM hs_derived WHERE key=?').get(key);
    if (!row) return undefined;
    try {
      return JSON.parse(String(row.content)) as T;
    } catch {
      return undefined;
    }
  });
}

export function writeSqliteHistoryDerived(
  projectRoot: string, key: 'state' | 'manifest', value: unknown,
): void {
  withDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO hs_derived(key,content) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET content=excluded.content
    `).run(key, JSON.stringify(value));
  });
}
