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
import { createHash } from "node:crypto";
import { DevControlError } from "./task-ledger.js";
import { WORKSPACE_SCHEMA_VERSION } from "./board-server.js";
import {
  WORKSPACE_PORT_ATTEMPTS, WORKSPACE_START_PORT, workspaceAccess,
} from "./workspace-access.js";

interface RunningProject {
  root: string;
  lanEnabled: boolean;
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
            ? { root: meta.root, lanEnabled: meta.lanEnabled === true } : null);
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
  const access = workspaceAccess(project);
  const start = access.basePort || WORKSPACE_START_PORT;
  for (let port = start; port <= Math.min(65535, start + WORKSPACE_PORT_ATTEMPTS - 1); port++) {
    const previous = await existingProject(port);
    if (previous && path.resolve(previous.root) === project &&
        previous.lanEnabled === access.lanEnabled) {
      return {
        url: `http://127.0.0.1:${port}/`,
        port, lanEnabled: access.lanEnabled, reused: true, pid: null,
      };
    }
    if (previous || !(await canBind(port, access.lanEnabled ? "0.0.0.0" : "127.0.0.1"))) continue;

    const logFile = path.join(os.tmpdir(),
      `devcontrol-${projectFingerprint(project)}.log`);
    const output = fs.openSync(logFile, "a");
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, [
        entry, "devcontrol", "board", "--project-root", project,
        "--port", String(port),
      ], {
        cwd: project, detached: true, windowsHide: true,
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
          running.lanEnabled === access.lanEnabled) {
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
}
