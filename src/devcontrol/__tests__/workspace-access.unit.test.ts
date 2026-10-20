import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  allowedHost, configureWorkspaceAccess, isLoopback, isPrivateLanAddress,
  lanAddresses, workspaceAccess, WORKSPACE_START_PORT,
} from "../workspace-access.js";
import { ensureProjectWorkspaceAtMcpStartup } from "../startup.js";

const roots: string[] = [];
function project(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devcontrol-lan-"));
  roots.push(dir);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("project workbench LAN access", () => {
  it("uses high ports and independent Git-ignored LAN configurations for projects", () => {
    expect(WORKSPACE_START_PORT).toBe(38180);
    const first = project(), second = project();
    const x = configureWorkspaceAccess(first, { lanEnabled: true });
    const y = configureWorkspaceAccess(second, { lanEnabled: true });
    expect(x.lanEnabled).toBe(true);
    expect(x.basePort).toBe(38180);
    expect(y.lanEnabled).toBe(true);
    expect(workspaceAccess(first)).toEqual(x);
    expect("accessKey" in x).toBe(false);
    expect(execFileSync("git", ["status", "--porcelain"], {
      cwd: first, encoding: "utf8",
    })).toBe("");
    const file = path.join(first, ".mcp-probe-kit/state/workspace-server.json");
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).not.toContain("accessKey");
    configureWorkspaceAccess(second, { lanEnabled: false });
    expect(workspaceAccess(second).lanEnabled).toBe(false);
    expect(workspaceAccess(first).lanEnabled).toBe(true);
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o077).toBe(0);
  });

  it("permits private LAN IPv4 clients while rejecting public and malformed addresses", () => {
    expect(isPrivateLanAddress("192.168.0.20")).toBe(true);
    expect(isPrivateLanAddress("10.2.3.4")).toBe(true);
    expect(isPrivateLanAddress("172.31.42.20")).toBe(true);
    expect(isPrivateLanAddress("::ffff:192.168.0.20")).toBe(true);
    expect(isPrivateLanAddress("172.32.0.1")).toBe(false);
    expect(isPrivateLanAddress("8.8.8.8")).toBe(false);
    expect(isPrivateLanAddress("169.254.209.114")).toBe(false);
    expect(isPrivateLanAddress("192.168.300.1")).toBe(false);
    expect(isPrivateLanAddress("192.168.bad.20")).toBe(false);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("192.168.0.107")).toBe(false);
    expect(allowedHost("127.0.0.1:38180", false)).toBe(true);
    expect(allowedHost("example.evil:38180", true)).toBe(false);
    expect(allowedHost("192.168.0.107:38180", false)).toBe(false);
    for (const address of lanAddresses()) {
      expect(allowedHost(address + ":38180", true)).toBe(true);
    }
  });

  it("disabling LAN persists without leaving a credential behind", () => {
    const root = project();
    const config = configureWorkspaceAccess(root, { lanEnabled: true });
    const disabled = configureWorkspaceAccess(root, { lanEnabled: false });
    expect(config.lanEnabled).toBe(true);
    expect(disabled.lanEnabled).toBe(false);
    expect("accessKey" in disabled).toBe(false);
  });

  it("auto-start can be disabled without touching project files", async () => {
    const root = project();
    const previous = process.env.MCP_DEVCONTROL_AUTOSTART;
    process.env.MCP_DEVCONTROL_AUTOSTART = "0";
    try {
      expect(await ensureProjectWorkspaceAtMcpStartup(root)).toMatchObject({
        started: false, reason: expect.stringContaining("MCP_DEVCONTROL_AUTOSTART"),
      });
    } finally {
      if (previous === undefined) delete process.env.MCP_DEVCONTROL_AUTOSTART;
      else process.env.MCP_DEVCONTROL_AUTOSTART = previous;
    }
  });
});
