/** Local read-only DevControl Kanban. The board is a projection of SQLite. */
import http, { type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { ProjectTaskLedger, DevControlError } from "./task-ledger.js";
import { boardHtml } from "./board-html.js";
import { projectHtml } from "./project-html.js";
import { projectContext, readProjectDoc } from "./project-catalog.js";
import { searchHistorySession, readHistorySession } from "../lib/history-session/index.js";
import {
  allowedHost, configureWorkspaceAccess, hasValidSession, isLoopback,
  lanAddresses, matchesAccessKey, sessionCookie, workspaceAccess,
} from "./workspace-access.js";

export const WORKSPACE_SCHEMA_VERSION = "0.7.0";

function loginPage(nonce: string, failed = false): string {
  return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DevControl · 局域网登录</title>
<style nonce="${nonce}">
*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;font:15px system-ui,-apple-system,sans-serif;color:#e6eefb;background:radial-gradient(circle at 40% 0,#163553,#09111f 65%)}
main{width:min(430px,calc(100% - 36px));padding:36px;background:#121f30;border:1px solid #304c68;border-radius:18px}
h1{font-size:25px;margin:8px 0}p{color:#a5b9d0;line-height:1.8;font-size:13px}
label{display:block;margin:25px 0 10px}input{width:100%;font:inherit;background:#0b1828;color:#fff;padding:14px;border:1px solid #466985;border-radius:9px}
button{width:100%;margin-top:17px;padding:14px;border:0;border-radius:9px;background:#3186ac;color:#fff;font-weight:700;cursor:pointer}
.error{color:#ffb1a3}.hint{font-size:12px;color:#7795b0}
</style></head><body><main>
<p>DEVCONTROL · LOCAL NETWORK</p><h1>连接项目研发工作台</h1>
<p>该工作台包含项目需求、架构、Bug 和 History Session。请使用开发机本地工作台显示的项目访问码登录。</p>
${failed ? '<p class="error">访问码错误或尝试过于频繁，请重试。</p>' : ''}
<form method="post" action="/login"><label for="key">项目访问码</label>
<input id="key" name="accessKey" type="password" maxlength="150" autocomplete="off" required>
<button type="submit">进入项目工作台</button></form>
<p class="hint">仅限受信任的局域网；普通 HTTP 不加密，跨不可信网络请使用 VPN 或 HTTPS 反向代理。</p>
</main></body></html>`;
}

interface BoardServerOptions {
  lanEnabled?: boolean;
  accessKey?: string;
}

function respond(
  res: ServerResponse, status: number, body: string, nonce = "",
  type = "text/plain; charset=utf-8", frame: "none" | "sameorigin" = "none",
  childFrames = false,
): void {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": frame === "sameorigin" ? "SAMEORIGIN" : "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; ${childFrames ? "frame-src 'self'; " : ""}base-uri 'none'; frame-ancestors '${frame === "sameorigin" ? "self" : "none"}'`,
  });
  res.end(body);
}

/** Injectable ledger lets tests use the same isolated database without a second connection. */
export function createDevControlBoardServer(
  source: string | ProjectTaskLedger, options: BoardServerOptions = {},
): http.Server {
  const owned = typeof source === "string";
  const ledger = typeof source === "string" ? new ProjectTaskLedger(source) : source;
  const config = workspaceAccess(ledger.root);
  const lanEnabled = options.lanEnabled ?? config.lanEnabled;
  const accessKey = options.accessKey ?? config.accessKey;
  if (lanEnabled && !accessKey) {
    if (owned) ledger.close();
    throw new DevControlError("LAN_AUTH_REQUIRED",
      "LAN workbench cannot start without a project-local access key");
  }
  const failures = new Map<string, { count: number; since: number }>();
  const server = http.createServer((req, res) => {
    // Live project settings immediately revoke remote access and old cookies
    // after lan-disable / rotate-key, even before the listener is restarted.
    const live = options.lanEnabled === undefined ? workspaceAccess(ledger.root) : null;
    const enabledNow = live?.lanEnabled ?? lanEnabled;
    const keyNow = live?.accessKey ?? accessKey;
    if (!allowedHost(req.headers.host, enabledNow)) {
      respond(res, 403, "Unrecognized project host");
      return;
    }
    const local = isLoopback(req.socket.remoteAddress);
    const authenticated = local || (enabledNow &&
      hasValidSession(ledger.root, keyNow, req.headers.cookie));
    const nonce = randomBytes(18).toString("base64");
    const route = new URL(req.url ?? "/", "http://localhost").pathname;
    if (!authenticated) {
      if (route === "/login" && req.method === "POST" && enabledNow) {
        const remote = req.socket.remoteAddress ?? "unknown";
        const now = Date.now();
        const entry = failures.get(remote);
        if (entry && now - entry.since < 300_000 && entry.count >= 10) {
          respond(res, 429, "Too many login attempts"); return;
        }
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 2048) req.destroy();
        });
        req.on("end", () => {
          const submitted = new URLSearchParams(body).get("accessKey") ?? "";
          if (matchesAccessKey(keyNow, submitted)) {
            failures.delete(remote);
            res.writeHead(303, {
              Location: "/", "Set-Cookie": sessionCookie(ledger.root, keyNow),
              "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
            });
            res.end();
          } else {
            if (failures.size > 1000) failures.clear();
            const fresh = !entry || now - entry.since >= 300_000;
            failures.set(remote, {
              since: fresh ? now : entry.since,
              count: fresh ? 1 : entry.count + 1,
            });
            respond(res, 401, loginPage(nonce, true), nonce, "text/html; charset=utf-8");
          }
        });
        return;
      }
      if (req.method === "GET" && (route === "/" || route === "/login")) {
        respond(res, 200, loginPage(nonce), nonce, "text/html; charset=utf-8");
      } else {
        respond(res, 401, '{"error":"Project access code required"}',
          nonce, "application/json; charset=utf-8");
      }
      return;
    }
    if (req.method !== "GET") {
      respond(res, 405, "Read-only board");
      return;
    }
    try {
      if (route === "/") {
        respond(res, 200, projectHtml(nonce), nonce, "text/html; charset=utf-8", "none", true);
      } else if (route === "/api/meta") {
        respond(res, 200, JSON.stringify({
          root: ledger.root, schema: "devcontrol-project-workspace",
          version: WORKSPACE_SCHEMA_VERSION, lanEnabled: enabledNow,
        }), nonce, "application/json; charset=utf-8");
      } else if (route === "/api/access") {
        if (!local) { respond(res, 403, "Local machine only"); return; }
        const serverAddress = server.address();
        const port = typeof serverAddress === "object" && serverAddress
          ? serverAddress.port : null;
        respond(res, 200, JSON.stringify({
          lanEnabled: enabledNow, accessKey: enabledNow ? keyNow : null,
          urls: enabledNow && port ? lanAddresses().map((ip) => `http://${ip}:${port}/`) : [],
        }), nonce, "application/json; charset=utf-8");
      } else if (route === "/board") {
        const embedded = new URL(req.url ?? "/", "http://localhost").searchParams.get("embedded") === "1";
        respond(res, 200, boardHtml(nonce, embedded), nonce, "text/html; charset=utf-8", "sameorigin");
      } else if (route === "/api/project") {
        respond(res, 200, JSON.stringify(projectContext(ledger.root)), nonce, "application/json; charset=utf-8");
      } else if (route === "/api/docs") {
        const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("path") ?? "";
        try {
          respond(res, 200, JSON.stringify(readProjectDoc(ledger.root, requested)),
            nonce, "application/json; charset=utf-8");
        } catch {
          respond(res, 404, '{"error":"Document not found in project index"}',
            nonce, "application/json; charset=utf-8");
        }
      } else if (route === "/api/board") {
        respond(res, 200, JSON.stringify(ledger.board()), nonce, "application/json; charset=utf-8");
      } else if (route === "/api/features") {
        respond(res, 200, JSON.stringify({ features: ledger.listFeatures() }),
          nonce, "application/json; charset=utf-8");
      } else if (route === "/api/work-items") {
        respond(res, 200, JSON.stringify({ items: ledger.listWorkItems() }),
          nonce, "application/json; charset=utf-8");
      } else if (route === "/api/history") {
        const params = new URL(req.url ?? "/", "http://localhost").searchParams;
        respond(res, 200, JSON.stringify(searchHistorySession(ledger.root, {
          query: params.get("q") ?? "",
          limit: Math.min(30, Math.max(1, Number(params.get("limit")) || 20)),
          cursor: Math.max(0, Number(params.get("cursor")) || 0),
        })), nonce, "application/json; charset=utf-8");
      } else if (/^\/api\/history\/[1-9]\d*$/.test(route)) {
        const number = Number(route.slice("/api/history/".length));
        if (!Number.isSafeInteger(number)) {
          respond(res, 400, "Invalid archive number"); return;
        }
        const params = new URL(req.url ?? "/", "http://localhost").searchParams;
        const result = readHistorySession(ledger.root, {
          number,
          cursor: Math.max(0, Number(params.get("cursor")) || 0),
          max_bytes: Math.min(32_768, Math.max(128, Number(params.get("max_bytes")) || 16_384)),
          expected_hash: params.get("expected_hash") ?? "",
        });
        respond(res, 200, JSON.stringify(result), nonce, "application/json; charset=utf-8");
      } else if (/^\/api\/features\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:export)$/.test(route)) {
        const name = route.slice("/api/features/".length).replace(/\/export$/, "");
        const fmt = new URL(req.url ?? "/", "http://localhost").searchParams.get("format");
        if (fmt !== "markdown" && fmt !== "json") {
          respond(res, 400, "Choose markdown or json"); return;
        }
        const content = ledger.exportFeature(name, fmt);
        res.writeHead(200, {
          "Content-Type": fmt === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="feature-${name}.${fmt === "json" ? "json" : "md"}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy": "default-src 'none'",
        });
        res.end(content);
      } else if (/^\/api\/features\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route)) {
        const name = route.slice("/api/features/".length);
        respond(res, 200, JSON.stringify(ledger.getFeature(name)),
          nonce, "application/json; charset=utf-8");
      } else if (route.startsWith("/api/tasks/")) {
        const id = decodeURIComponent(route.slice("/api/tasks/".length));
        if (!/^[A-Z][A-Z0-9-]{1,39}$/.test(id)) {
          respond(res, 404, '{"error":"Unknown task"}', nonce, "application/json");
          return;
        }
        const { task, evidence, completion, audit } = ledger.trace(id);
        // Never serialize leases or their tokens into HTML/API response.
        const events = audit.map((entry: Record<string, unknown>) => ({
          id: entry.id, event: entry.event, actor: entry.actor, created_at: entry.created_at,
        }));
        respond(res, 200, JSON.stringify({ task, evidence, completion, audit: events }),
          nonce, "application/json; charset=utf-8");
      } else {
        respond(res, 404, "Not found");
      }
    } catch (error) {
      const notFound = error instanceof DevControlError &&
        ["TASK_NOT_FOUND", "FEATURE_NOT_FOUND"].includes(error.code) ||
        (error instanceof Error &&
          (error as Error & { code?: string }).code === "HISTORY_READ_NOT_FOUND");
      respond(res, notFound ? 404 : 500, JSON.stringify({ error: notFound ? "Unknown task" : "Server error" }),
        nonce, "application/json");
    }
  });
  if (owned) server.on("close", () => ledger.close());
  return server;
}

export async function serveDevControlBoard(root: string, port = 38180): Promise<void> {
  const access = workspaceAccess(root);
  if (access.lanEnabled && !access.accessKey) configureWorkspaceAccess(root, { lanEnabled: true });
  const server = createDevControlBoardServer(root);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, workspaceAccess(root).lanEnabled ? "0.0.0.0" : "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const selectedPort = typeof address === "object" && address ? address.port : port;
  const urls = access.lanEnabled ? lanAddresses().map((ip) => `http://${ip}:${selectedPort}/`) : [];
  process.stdout.write(`DevControl 工作台: http://127.0.0.1:${selectedPort}/${urls.length
    ? "\nLAN（需要项目访问码）: " + urls.join(", ") : ""}\n`);
  await new Promise<void>((resolve) => server.once("close", resolve));
}
