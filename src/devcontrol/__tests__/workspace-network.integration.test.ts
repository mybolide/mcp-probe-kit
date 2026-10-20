import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ProjectTaskLedger } from "../task-ledger.js";
import { createDevControlBoardServer } from "../board-server.js";
import { configureWorkspaceAccess } from "../workspace-access.js";
import { ensureProjectWorkspaceRunning } from "../workspace-process.js";
import { readWorkspaceRuntime, writeWorkspaceRuntime } from "../workspace-runtime.js";
import { WORKSPACE_SCHEMA_VERSION } from "../board-server.js";
import net from "node:net";
import http from "node:http";

const directories: string[] = [];
function project(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devcontrol-auth-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  directories.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("project workbench HTTP LAN access", () => {
  it("allows trusted private LAN readers without login and revokes access on lan-disable", async () => {
    const root = project();
    configureWorkspaceAccess(root, { lanEnabled: true });
    const ledger = new ProjectTaskLedger(root);
    const server = createDevControlBoardServer(ledger);
    // Simulate a remote network socket without binding a public IP in a test
    // runner. The production handler must use remoteAddress, not Host header.
    server.prependListener("request", (request) => {
      Object.defineProperty(request.socket, "remoteAddress", {
        configurable: true, value: "192.168.0.20",
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const base = "http://127.0.0.1:" +
        (typeof address === "object" && address ? address.port : 0);
      expect((await fetch(base + "/api/board")).status).toBe(200);
      expect((await fetch(base + "/api/history")).status).toBe(200);
      const guest = await fetch(base + "/");
      expect(guest.status).toBe(200);
      expect(await guest.text()).toContain("项目总览");
      const access = await fetch(base + "/api/access");
      expect(access.status).toBe(200);
      expect(await access.text()).not.toContain("accessKey");
      const meta = await fetch(base + "/api/meta");
      expect((await meta.json())).not.toHaveProperty("pid");
      // Remote LAN readers cannot obtain process identity used by the local supervisor.
      expect((await fetch(base + "/login", { method: "POST" })).status).toBe(405);
      configureWorkspaceAccess(root, { lanEnabled: false });
      expect((await fetch(base + "/api/board")).status).toBe(403);
      expect((await fetch(base + "/")).status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ledger.close();
    }
  });

  it("saves a working port and restarts only its verified prior process", async () => {
    const root = project();
    const probe = net.createServer();
    await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
    const info = probe.address();
    const basePort = typeof info === "object" && info ? info.port : 0;
    await new Promise<void>(resolve => probe.close(() => resolve()));
    const fakeCli = path.join(root, "test-workspace-server.cjs");
    fs.writeFileSync(fakeCli, `
const http=require("node:http");
const args=process.argv.slice(2);
const port=Number(args[args.indexOf("--port")+1]);
const root=args[args.indexOf("--project-root")+1];
const server=http.createServer((req,res)=>{
  if(req.url!=="/api/meta"){res.statusCode=404;return res.end();}
  res.setHeader("Content-Type","application/json");
  res.end(JSON.stringify({
    root,schema:"devcontrol-project-workspace",version:${JSON.stringify(WORKSPACE_SCHEMA_VERSION)},
    lanEnabled:false,pid:process.pid,instanceId:process.env.DEVCONTROL_WORKSPACE_INSTANCE_ID,
    startedAt:process.env.DEVCONTROL_WORKSPACE_STARTED_AT,
  }));
});
server.listen(port,"127.0.0.1");
process.on("SIGTERM",()=>server.close(()=>process.exit(0)));
`);
    // Workbench CLI fallback may choose its own start port.
    const config = path.join(root, ".mcp-probe-kit/state/workspace-server.json");
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config, JSON.stringify({ lanEnabled: false, basePort }));
    let secondPid: number | null = null;
    let firstPid: number | null = null;
    try {
      const first = await ensureProjectWorkspaceRunning(root, { cliEntry: fakeCli });
      firstPid = first.pid;
      expect(first).toMatchObject({ port: basePort, reused: false });
      expect(readWorkspaceRuntime(root)).toMatchObject({
        port: basePort, pid: firstPid, version: WORKSPACE_SCHEMA_VERSION,
      });
      const second = await ensureProjectWorkspaceRunning(root, { cliEntry: fakeCli });
      secondPid = second.pid;
      expect(second).toMatchObject({ port: basePort, reused: false });
      expect(secondPid).not.toBe(firstPid);
      expect(readWorkspaceRuntime(root)).toMatchObject({ port: basePort, pid: secondPid });
    } finally {
      for (const pid of [firstPid, secondPid]) {
        if (pid) { try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ } }
      }
    }
  }, 20_000);

  it("never kills an unrelated listener occupying the recorded port", async () => {
    const root = project();
    const unrelated = http.createServer((_req, res) => res.end("unrelated listener"));
    await new Promise<void>(resolve => unrelated.listen(0, "127.0.0.1", resolve));
    const address = unrelated.address();
    const busyPort = typeof address === "object" && address ? address.port : 0;
    writeWorkspaceRuntime(root, {
      port: busyPort, pid: process.pid, instanceId: "not-our-workspace",
      startedAt: "2026-10-20T00:00:00Z",
      version: WORKSPACE_SCHEMA_VERSION, lanEnabled: false,
    });
    const config = path.join(root, ".mcp-probe-kit/state/workspace-server.json");
    fs.writeFileSync(config, JSON.stringify({ lanEnabled: false, basePort: busyPort }));
    const fakeCli = path.join(root, "test-workspace-server.cjs");
    fs.writeFileSync(fakeCli, `
const http=require("node:http");
const args=process.argv.slice(2),port=Number(args[args.indexOf("--port")+1]),root=args[args.indexOf("--project-root")+1];
const server=http.createServer((req,res)=>res.end(JSON.stringify({
  schema:"devcontrol-project-workspace",version:${JSON.stringify(WORKSPACE_SCHEMA_VERSION)},
  root,lanEnabled:false,pid:process.pid,instanceId:process.env.DEVCONTROL_WORKSPACE_INSTANCE_ID,
  startedAt:process.env.DEVCONTROL_WORKSPACE_STARTED_AT
})));
server.listen(port,"127.0.0.1");
process.on("SIGTERM",()=>server.close(()=>process.exit(0)));
`);
    let workerPid: number | null = null;
    try {
      const result = await ensureProjectWorkspaceRunning(root, { cliEntry: fakeCli });
      workerPid = result.pid;
      expect(result.port).toBeGreaterThan(busyPort);
      expect(unrelated.listening).toBe(true);
      expect(readWorkspaceRuntime(root)?.port).toBe(result.port);
    } finally {
      if (workerPid) { try { process.kill(workerPid, "SIGTERM"); } catch { /* exited */ } }
      await new Promise<void>(resolve => unrelated.close(() => resolve()));
    }
  }, 20_000);

  it("rejects non-private IPv4 readers regardless of Host or cookies", async () => {
    const root = project();
    configureWorkspaceAccess(root, { lanEnabled: true });
    const ledger = new ProjectTaskLedger(root);
    const server = createDevControlBoardServer(ledger);
    server.prependListener("request", (request) => {
      Object.defineProperty(request.socket, "remoteAddress", {
        configurable: true, value: "8.8.8.8",
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const base = "http://127.0.0.1:" +
        (typeof address === "object" && address ? address.port : 0);
      expect((await fetch(base + "/api/project")).status).toBe(403);
      expect((await fetch(base + "/")).status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ledger.close();
    }
  });

  it("reuses the identical project's existing service without installing a desktop client", async () => {
    const root = project();
    const ledger = new ProjectTaskLedger(root);
    const server = createDevControlBoardServer(ledger);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const info = server.address();
      const port = typeof info === "object" && info ? info.port : 0;
      const filename = path.join(root, ".mcp-probe-kit/state/workspace-server.json");
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, JSON.stringify({
        lanEnabled: false, basePort: port,
      }));
      const reused = await ensureProjectWorkspaceRunning(root, {
        cliEntry: process.execPath,
      });
      expect(reused).toMatchObject({ reused: true, port, lanEnabled: false, pid: process.pid });
      expect(fs.existsSync(path.join(root, "DevControl Workbench.app"))).toBe(false);
      expect(fs.existsSync(path.join(root, "DevControl Workbench.cmd"))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ledger.close();
    }
  });
});
