/**
 * Per-project workbench network configuration. No global configuration,
 * shared credentials, cloud service or database. LAN is opt-in.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ensureDatabaseIgnored, resolveProjectDatabase } from "./project-storage.js";

export const WORKSPACE_START_PORT = 38180;
export const WORKSPACE_PORT_ATTEMPTS = 80;

export interface WorkspaceAccess {
  lanEnabled: boolean;
  basePort: number;
}

/** Not a login mechanism: only distinguish private LAN clients from public IPs. */
export function isPrivateLanAddress(address?: string | null): boolean {
  if (!address) return false;
  const value = address.replace(/^::ffff:/i, "");
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const nums = parts.map(Number);
  if (nums.some((n) => n > 255)) return false;
  return nums[0] === 10 || (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31) ||
    (nums[0] === 192 && nums[1] === 168);
}

function configPath(project: string): string {
  return path.join(path.dirname(resolveProjectDatabase(project)), "workspace-server.json");
}

export function workspaceAccess(project: string): WorkspaceAccess {
  const filename = configPath(project);
  if (!fs.existsSync(filename)) return {
    lanEnabled: false, basePort: WORKSPACE_START_PORT,
  };
  const parsed = JSON.parse(fs.readFileSync(filename, "utf8")) as Partial<WorkspaceAccess>;
  const port = Number(parsed.basePort);
  const access = {
    lanEnabled: parsed.lanEnabled === true,
    basePort: Number.isSafeInteger(port) && port >= 1025 && port <= 65535
      ? port : WORKSPACE_START_PORT,
  };
  // Automatically scrub abandoned credential fields from pre-passwordless
  // installations. The Web workbench no longer has an authentication flow.
  if (Object.keys(parsed).some((key) => !["lanEnabled", "basePort"].includes(key))) {
    ensureDatabaseIgnored(project, resolveProjectDatabase(project));
    fs.writeFileSync(filename, JSON.stringify(access, null, 2) + "\n", { mode: 0o600 });
    try { fs.chmodSync(filename, 0o600); } catch { /* Windows */ }
  }
  return access;
}

export function configureWorkspaceAccess(
  project: string, input: { lanEnabled: boolean },
): WorkspaceAccess {
  const existing = workspaceAccess(project);
  const next: WorkspaceAccess = {
    lanEnabled: input.lanEnabled,
    basePort: existing.basePort,
  };
  const file = configPath(project);
  ensureDatabaseIgnored(project, resolveProjectDatabase(project));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* Windows ignores Unix modes */ }
  return next;
}

export function lanAddresses(): string[] {
  const results = new Set<string>();
  for (const network of Object.values(os.networkInterfaces())) {
    for (const iface of network ?? []) {
      if (!iface.internal && iface.family === "IPv4" && isPrivateLanAddress(iface.address)) {
        results.add(iface.address);
      }
    }
  }
  return [...results].sort();
}

export function isLoopback(address?: string | null): boolean {
  return !!address && (/^127\./.test(address) ||
    address === "::1" || /^::ffff:127\./.test(address));
}

export function allowedHost(hostHeader: string | undefined, lanEnabled: boolean): boolean {
  if (!hostHeader || !/^[a-zA-Z0-9.\-]+(?::\d{1,5})?$/.test(hostHeader)) return false;
  const hostname = hostHeader.replace(/:\d{1,5}$/, "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" ||
    (lanEnabled && lanAddresses().includes(hostname));
}
