import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  allowedHost, configureWorkspaceAccess, hasValidSession, isLoopback,
  lanAddresses, matchesAccessKey, sessionCookie, workspaceAccess,
  WORKSPACE_START_PORT,
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
  it("uses high ports and a distinct, Git-ignored access code per project", () => {
    expect(WORKSPACE_START_PORT).toBe(38180);
    const first = project(), second = project();
    const x = configureWorkspaceAccess(first, { lanEnabled: true });
    const y = configureWorkspaceAccess(second, { lanEnabled: true });
    expect(x.lanEnabled).toBe(true);
    expect(x.basePort).toBe(38180);
    expect(x.accessKey).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(y.accessKey).not.toBe(x.accessKey);
    expect(workspaceAccess(first).accessKey).toBe(x.accessKey);
    expect(execFileSync("git", ["status", "--porcelain"], {
      cwd: first, encoding: "utf8",
    })).toBe("");
    const file = path.join(first, ".mcp-probe-kit/state/workspace-server.json");
    expect(fs.existsSync(file)).toBe(true);
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o077).toBe(0);
  });

  it("authenticates LAN readers using an HttpOnly signed cookie, not Host spoofing", () => {
    const root = project(), other = project();
    const secret = configureWorkspaceAccess(root, { lanEnabled: true }).accessKey;
    const cookie = sessionCookie(root, secret, 1_800_000_000_000);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain(secret);
    expect(matchesAccessKey(secret, secret)).toBe(true);
    expect(matchesAccessKey(secret, "wrong")).toBe(false);
    expect(hasValidSession(root, secret, cookie, 1_800_000_000_000)).toBe(true);
    expect(hasValidSession(other, secret, cookie, 1_800_000_000_000)).toBe(false);
    expect(hasValidSession(root, secret, cookie, 1_800_700_000_000)).toBe(false);
    expect(hasValidSession(root, "rotated", cookie, 1_800_000_000_000)).toBe(false);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("192.168.0.107")).toBe(false);
    expect(allowedHost("127.0.0.1:38180", false)).toBe(true);
    expect(allowedHost("example.evil:38180", true)).toBe(false);
    expect(allowedHost("192.168.0.107:38180", false)).toBe(false);
    for (const address of lanAddresses()) {
      expect(allowedHost(address + ":38180", true)).toBe(true);
    }
  });

  it("rotating or disabling project access revokes old sessions", () => {
    const root = project();
    const config = configureWorkspaceAccess(root, { lanEnabled: true });
    const cookie = sessionCookie(root, config.accessKey);
    const changed = configureWorkspaceAccess(root, { lanEnabled: true, rotateKey: true });
    expect(changed.accessKey).not.toBe(config.accessKey);
    expect(hasValidSession(root, changed.accessKey, cookie)).toBe(false);
    const disabled = configureWorkspaceAccess(root, { lanEnabled: false });
    expect(disabled.lanEnabled).toBe(false);
    expect(disabled.accessKey).toBe(changed.accessKey);
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
