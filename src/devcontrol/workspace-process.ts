/**
 * Runtime-only workbench lifecycle, shared by Windows and macOS MCP hosts.
 * A connected project's MCP server starts or reuses its own dashboard.
 * There are no .app/.exe/.cmd clients or OS-specific distribution artifacts.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { DevControlError } from "./task-ledger.js";
import { WORKSPACE_SCHEMA_VERSION } from "./board-server.js";
import { readWorkspaceRuntime, writeWorkspaceRuntime, type WorkspaceRuntime } from "./workspace-runtime.js";
import { resolveProjectDatabase } from "./project-storage.js";
import {
  WORKSPACE_PORT_ATTEMPTS, WORKSPACE_START_PORT, workspaceAccess,
} from "./workspace-access.js";

interface RunningProject {
  root: string;
  lanEnabled: boolean;
  pid: number | null;
  instanceId: string | null;
  startedAt: string | null;
}

async function existingProject(port: number): Promise<RunningProject | null> {
  return new Promise((resolve) => {
    const request = http.get({
      hostname: "127.0.0.1", port, path: "/api/meta", timeout: 800,
    }, (response) => {
      let output = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        output += chunk;
        if (output.length > 32_000) response.destroy();
      });
      response.on("end", () => {
        try {
          const meta = JSON.parse(output);
          resolve(response.statusCode === 200 &&
            meta.version === WORKSPACE_SCHEMA_VERSION &&
            meta.schema === "devcontrol-project-workspace" &&
            typeof meta.root === "string"
            ? {
              root: meta.root, lanEnabled: meta.lanEnabled === true,
              pid: Number.isSafeInteger(meta.pid) && meta.pid > 0 ? meta.pid : null,
              instanceId: typeof meta.instanceId === "string" ? meta.instanceId : null,
              startedAt: typeof meta.startedAt === "string" ? meta.startedAt : null,
            } : null);
        } catch {
          resolve(null);
        }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(null));
  });
}

async function canBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Atomic per-project startup lock across simultaneous MCP connections.
 * Never delete a lock held by a live PID. Old abandoned locks are recovered
 * only after the owner is demonstrably absent.
 */
async function withStartupLock<T>(root: string, run: () => Promise<T>): Promise<T> {
  const lockPath = path.join(path.dirname(resolveProjectDatabase(root)), "workspace-start.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let owned = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const handle = fs.openSync(lockPath, "wx", 0o600);
      try {
        fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, at: Date.now() }));
      } finally {
        fs.closeSync(handle);
      }
      owned = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const existing = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid: number; at: number };
        if (Number.isSafeInteger(existing.pid) && existing.pid > 0 &&
            Number.isFinite(existing.at) && Date.now() - existing.at > 30_000) {
          let alive = true;
          try { process.kill(existing.pid, 0); } catch (e) {
            alive = (e as NodeJS.ErrnoException).code !== "ESRCH";
          }
          if (!alive) {
            fs.rmSync(lockPath, { force: true });
            continue;
          }
        }
      } catch { /* A partially written lock is never treated as permission to kill. */ }
      await wait(100);
    }
  }
  if (!owned) throw new DevControlError("WORKSPACE_START_BUSY", "Another MCP process holds the workbench startup lock");
  try { return await run(); } finally { fs.rmSync(lockPath, { force: true }); }
}

function isRecordedInstance(
  root: string, port: number, running: RunningProject | null,
  record: WorkspaceRuntime | null,
): boolean {
  return !!running && !!record && record.port === port &&
    record.version === WORKSPACE_SCHEMA_VERSION &&
    path.resolve(running.root) === root &&
    running.pid === record.pid && running.pid !== process.pid &&
    !!running.instanceId && running.instanceId === record.instanceId &&
    !!running.startedAt && running.startedAt === record.startedAt;
}

async function stopRecordedInstance(port: number, host: string, record: WorkspaceRuntime): Promise<boolean> {
  try { process.kill(record.pid, "SIGTERM"); } catch { return false; }
  for (let attempt = 0; attempt < 35; attempt++) {
    if (await canBind(port, host)) return true;
    await wait(100);
  }
  return false;
}

function projectFingerprint(project: string): string {
  return createHash("sha256").update(project).digest("hex").slice(0, 12);
}

export interface ProjectWorkspaceProcess {
  url: string;
  port: number;
  lanEnabled: boolean;
  reused: boolean;
  pid: number | null;
}

export async function ensureProjectWorkspaceRunning(
  root: string, options: { cliEntry?: string } = {},
): Promise<ProjectWorkspaceProcess> {
  const project = path.resolve(root);
  if (!fs.existsSync(path.join(project, ".git"))) {
    throw new DevControlError("NOT_GIT_PROJECT", "DevControl requires the project Git root");
  }
  const entry = path.resolve(options.cliEntry ?? process.argv[1]);
  if (!fs.existsSync(entry)) {
    throw new DevControlError("CLI_NOT_FOUND", "The installed MCP CLI entry was not found");
  }
  return withStartupLock(project, async () => {
  const access = workspaceAccess(project);
  const historical = readWorkspaceRuntime(project);
  const start = historical?.port ?? access.basePort ?? WORKSPACE_START_PORT;
  for (let port = start; port <= Math.min(65535, start + WORKSPACE_PORT_ATTEMPTS - 1); port++) {
    const previous = await existingProject(port);
    const bindHost = access.lanEnabled ? "0.0.0.0" : "127.0.0.1";
    if (isRecordedInstance(project, port, previous, historical)) {
      // A verified prior project instance is deliberately restarted on MCP
      // initialization. Unknown/PID-reused processes must NEVER be signalled.
      if (!(await stopRecordedInstance(port, bindHost, historical!))) continue;
    } else if (previous && path.resolve(previous.root) === project &&
        previous.lanEnabled === access.lanEnabled) {
      // Migration: a legacy server predates the process registry. Reuse rather
      // than accumulate additional ports; without strong identity never kill it.
      if (previous.pid && previous.instanceId && previous.startedAt) {
        writeWorkspaceRuntime(project, {
          port, pid: previous.pid, instanceId: previous.instanceId,
          startedAt: previous.startedAt, version: WORKSPACE_SCHEMA_VERSION,
          lanEnabled: access.lanEnabled,
        });
      }
      return {
        url: `http://127.0.0.1:${port}/`,
        port, lanEnabled: access.lanEnabled, reused: true, pid: previous.pid,
      };
    } else if (previous) {
      continue;
    }
    if (!(await canBind(port, bindHost))) continue;

    const logFile = path.join(os.tmpdir(),
      `devcontrol-${projectFingerprint(project)}.log`);
    const output = fs.openSync(logFile, "a");
    let child: ReturnType<typeof spawn>;
    const instanceId = randomUUID();
    const startedAt = new Date().toISOString();
    try {
      child = spawn(process.execPath, [
        entry, "devcontrol", "board", "--project-root", project,
        "--port", String(port),
      ], {
        cwd: project, detached: true, windowsHide: true,
        env: {
          ...process.env,
          DEVCONTROL_WORKSPACE_INSTANCE_ID: instanceId,
          DEVCONTROL_WORKSPACE_STARTED_AT: startedAt,
        },
        stdio: ["ignore", output, output],
      });
      child.unref();
    } finally {
      fs.closeSync(output);
    }
    for (let attempt = 0; attempt < 30; attempt++) {
      await wait(180);
      const running = await existingProject(port);
      if (running && path.resolve(running.root) === project &&
          running.lanEnabled === access.lanEnabled &&
          running.pid === child.pid && running.instanceId === instanceId &&
          running.startedAt === startedAt) {
        writeWorkspaceRuntime(project, {
          port, pid: running.pid!, instanceId, startedAt,
          version: WORKSPACE_SCHEMA_VERSION, lanEnabled: access.lanEnabled,
        });
        return {
          url: `http://127.0.0.1:${port}/`,
          port, lanEnabled: access.lanEnabled,
          reused: false, pid: child.pid ?? null,
        };
      }
      if (child.exitCode !== null) break;
    }
    if (child.pid) {
      try { process.kill(child.pid, "SIGTERM"); } catch { /* process already exited */ }
    }
  }
  throw new DevControlError("NO_LOCAL_PORT",
    `Could not start project workbench on ports ${start}-${Math.min(65535, start + WORKSPACE_PORT_ATTEMPTS - 1)}`);
  });
}
