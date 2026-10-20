/**
 * History Session's project-local SQLite storage adapter.
 *
 * History Session remains the SOLE owner of conversation archives, initial
 * inputs, checkpoint semantics, bounded continuation, search and pagination.
 * DevControl reads those archives; this is NOT the cross-project Qdrant Memory
 * service and not a duplicate dc_work_items "memory" table.
 *
 * Previously written numbered Markdown archives are IMPORTED losslessly on
 * first read. They are left untouched for safe rollback; new sessions and
 * checkpoints do not create further numbered .md documents.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ensureDatabaseIgnored, resolveProjectDatabase } from '../../devcontrol/project-storage.js';

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
  if (mode === 'files' || mode === 'markdown') return false;
  if (Number.parseInt(process.versions.node.split('.')[0] || '0', 10) < 22) return false;
  const root = path.resolve(projectRoot);
  if (path.resolve(historyDir) !== path.join(root, 'docs', 'history-session')) return false;
  return fs.existsSync(path.join(root, '.git'));
}

/** Only the default project history directory may use the SQLite bridge. */
export function sqliteProjectForHistoryDir(historyDir: string): string | null {
  const normalized = path.resolve(historyDir);
  if (path.basename(normalized) !== 'history-session' ||
      path.basename(path.dirname(normalized)) !== 'docs') return null;
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
  if (db.prepare("SELECT value FROM hs_meta WHERE key='legacy_import_done'").get()) return;
  const dir = path.join(projectRoot, 'docs', 'history-session');
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT value FROM hs_meta WHERE key='legacy_import_done'").get() &&
        fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !/^[1-9]\d*\.md$/.test(entry.name)) continue;
        const number = Number(entry.name.slice(0, -3));
        const filePath = path.join(dir, entry.name);
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.trim()) {
          db.prepare(
            'INSERT OR IGNORE INTO hs_archive(number,content,updated_at) VALUES(?,?,?)',
          ).run(number, content, fs.statSync(filePath).mtime.toISOString());
        }
      }
    }
    db.prepare("INSERT OR IGNORE INTO hs_meta(key,value) VALUES('legacy_import_done',?)")
      .run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
