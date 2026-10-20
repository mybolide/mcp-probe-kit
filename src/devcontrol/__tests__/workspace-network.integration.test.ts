import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ProjectTaskLedger } from "../task-ledger.js";
import { createDevControlBoardServer } from "../board-server.js";
import { configureWorkspaceAccess } from "../workspace-access.js";
import { ensureProjectWorkspaceRunning } from "../workspace-process.js";

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
      expect((await fetch(base + "/login", { method: "POST" })).status).toBe(405);
      configureWorkspaceAccess(root, { lanEnabled: false });
      expect((await fetch(base + "/api/board")).status).toBe(403);
      expect((await fetch(base + "/")).status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ledger.close();
    }
  });

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
      expect(reused).toMatchObject({ reused: true, port, lanEnabled: false, pid: null });
      expect(fs.existsSync(path.join(root, "DevControl Workbench.app"))).toBe(false);
      expect(fs.existsSync(path.join(root, "DevControl Workbench.cmd"))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ledger.close();
    }
  });
});
