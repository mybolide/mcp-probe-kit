/** Local, per-project workbench process registry. Never share it across repos. */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { ensureDatabaseIgnored, resolveProjectDatabase } from "./project-storage.js";

interface DatabaseSync {
  exec(query: string): void;
  prepare(query: string): {
    get(...args: (string | number)[]): Record<string, string | number | null> | undefined;
    run(...args: (string | number)[]): unknown;
  };
  close(): void;
}

export interface WorkspaceRuntime {
  port: number;
  pid: number;
  instanceId: string;
  startedAt: string;
  version: string;
  lanEnabled: boolean;
}

function withDatabase<T>(root: string, action: (db: DatabaseSync) => T): T {
  const project = path.resolve(root);
  const database = resolveProjectDatabase(project);
  ensureDatabaseIgnored(project, database);
  fs.mkdirSync(path.dirname(database), { recursive: true });
  const sqlite = createRequire(import.meta.url)("node:sqlite") as {
    DatabaseSync: new (file: string) => DatabaseSync;
  };
  const db = new sqlite.DatabaseSync(database);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec(`CREATE TABLE IF NOT EXISTS dc_workspace_runtime (
      project_root TEXT PRIMARY KEY,
      port INTEGER NOT NULL CHECK(port BETWEEN 1 AND 65535),
      pid INTEGER NOT NULL CHECK(pid > 0),
      instance_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      version TEXT NOT NULL,
      lan_enabled INTEGER NOT NULL CHECK(lan_enabled IN (0,1)),
      updated_at TEXT NOT NULL
    )`);
    return action(db);
  } finally {
    db.close();
  }
}

export function readWorkspaceRuntime(root: string): WorkspaceRuntime | null {
  return withDatabase(root, (db) => {
    const row = db.prepare("SELECT * FROM dc_workspace_runtime WHERE project_root = ?")
      .get(path.resolve(root));
    if (!row) return null;
    return {
      port: Number(row.port), pid: Number(row.pid),
      instanceId: String(row.instance_id), startedAt: String(row.started_at),
      version: String(row.version), lanEnabled: row.lan_enabled === 1,
    };
  });
}

export function writeWorkspaceRuntime(root: string, instance: WorkspaceRuntime): void {
  withDatabase(root, (db) => {
    db.prepare(`INSERT INTO dc_workspace_runtime
      (project_root,port,pid,instance_id,started_at,version,lan_enabled,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_root) DO UPDATE SET
      port=excluded.port, pid=excluded.pid, instance_id=excluded.instance_id,
      started_at=excluded.started_at,version=excluded.version,
      lan_enabled=excluded.lan_enabled,updated_at=excluded.updated_at`).run(
      path.resolve(root), instance.port, instance.pid, instance.instanceId,
      instance.startedAt, instance.version, instance.lanEnabled ? 1 : 0,
      new Date().toISOString(),
    );
  });
}
