/**
 * Per-project workbench network configuration. No global configuration,
 * shared credentials, cloud service or database. LAN is opt-in.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ensureDatabaseIgnored, resolveProjectDatabase } from "./project-storage.js";

export const WORKSPACE_START_PORT = 38180;
export const WORKSPACE_PORT_ATTEMPTS = 80;
const COOKIE_NAME = "devcontrol_session";
const COOKIE_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface WorkspaceAccess {
  lanEnabled: boolean;
  basePort: number;
  accessKey: string;
}

function configPath(project: string): string {
  return path.join(path.dirname(resolveProjectDatabase(project)), "workspace-server.json");
}

export function workspaceAccess(project: string): WorkspaceAccess {
  const filename = configPath(project);
  if (!fs.existsSync(filename)) return {
    lanEnabled: false, basePort: WORKSPACE_START_PORT, accessKey: "",
  };
  const parsed = JSON.parse(fs.readFileSync(filename, "utf8")) as Partial<WorkspaceAccess>;
  const port = Number(parsed.basePort);
  return {
    lanEnabled: parsed.lanEnabled === true,
    basePort: Number.isSafeInteger(port) && port >= 1025 && port <= 65535
      ? port : WORKSPACE_START_PORT,
    accessKey: typeof parsed.accessKey === "string" ? parsed.accessKey : "",
  };
}

export function configureWorkspaceAccess(
  project: string, input: { lanEnabled: boolean; rotateKey?: boolean },
): WorkspaceAccess {
  const existing = workspaceAccess(project);
  const next: WorkspaceAccess = {
    lanEnabled: input.lanEnabled,
    basePort: existing.basePort,
    accessKey: input.rotateKey || !existing.accessKey
      ? randomBytes(24).toString("base64url") : existing.accessKey,
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
      if (!iface.internal && iface.family === "IPv4") results.add(iface.address);
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

function digest(secret: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function equal(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function matchesAccessKey(actual: string, supplied: string): boolean {
  return !!actual && !!supplied && equal(digest(actual, "check"), digest(supplied, "check"));
}

export function sessionCookie(project: string, secret: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + COOKIE_AGE_SECONDS;
  const signature = digest(secret, project + "|" + expires).toString("base64url");
  return `${COOKIE_NAME}=v1.${expires}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_AGE_SECONDS}`;
}

export function hasValidSession(
  project: string, secret: string, cookieHeader: string | undefined, now = Date.now(),
): boolean {
  if (!secret || !cookieHeader || cookieHeader.length > 4096) return false;
  const value = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE_NAME + "="))?.slice(COOKIE_NAME.length + 1);
  const match = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!match) return false;
  const expiry = Number(match[1]), nowSeconds = Math.floor(now / 1000);
  if (expiry < nowSeconds || expiry > nowSeconds + COOKIE_AGE_SECONDS) return false;
  const expected = digest(secret, project + "|" + expiry);
  return equal(expected, Buffer.from(match[2], "base64url"));
}
