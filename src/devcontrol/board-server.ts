/** Local read-only DevControl Kanban. The board is a projection of SQLite. */
import http, { type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { VERSION } from "../version.js";
import { ProjectTaskLedger, DevControlError } from "./task-ledger.js";
import { boardHtml } from "./board-html.js";
import { projectHtml } from "./project-html.js";
import { devControlGuide } from './action-guide.js';
import { resolveWorkbenchLocale } from "./i18n.js";
import { projectContext, readProjectDoc } from "./project-catalog.js";
import { projectOnboarding } from "./project-onboarding.js";
import { publicProjectSettings, saveProjectSettings } from "./project-settings.js";
import { searchHistorySession, readHistorySession } from "../lib/history-session/index.js";
import {
  allowedHost, isLoopback, isPrivateLanAddress, lanAddresses, workspaceAccess,
} from "./workspace-access.js";

// Bump when transport behavior changes so MCP never reuses an older process
// that still presents a now-obsolete login screen.
export const WORKSPACE_SCHEMA_VERSION = "0.11.0";

interface BoardServerOptions {
  lanEnabled?: boolean;
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
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'self'; ${childFrames ? "frame-src 'self'; " : ""}base-uri 'none'; frame-ancestors '${frame === "sameorigin" ? "self" : "none"}'`,
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
  const settingsToken = randomBytes(32).toString("hex");
  const server = http.createServer((req, res) => {
    // LAN disable revokes remote access immediately, without a restart.
    const live = options.lanEnabled === undefined ? workspaceAccess(ledger.root) : null;
    const enabledNow = live?.lanEnabled ?? lanEnabled;
    if (!allowedHost(req.headers.host, enabledNow)) {
      respond(res, 403, "Unrecognized project host");
      return;
    }
    const local = isLoopback(req.socket.remoteAddress);
    // Never accept arbitrary public IP sources even if the machine exposes
    // its 0.0.0.0 listener on more than one network interface.
    if (!local && !(enabledNow && isPrivateLanAddress(req.socket.remoteAddress))) {
      respond(res, 403, "Private LAN only");
      return;
    }
    const nonce = randomBytes(18).toString("base64");
    const route = new URL(req.url ?? "/", "http://localhost").pathname;
    // The public/LAN workbench is read-only; only THIS computer may edit
    // project settings, with an explicit same-origin JSON request + CSRF
    // challenge. Ordinary HTML forms, forged cross-site POST and CORS do not
    // authorize configuration or secret updates.
    if(route==="/api/settings"&&req.method==="POST"){
      const origin=String(req.headers.origin??"");
      const host=String(req.headers.host??"");
      const contentType=String(req.headers["content-type"]??"").split(";")[0].trim().toLowerCase();
      if(!local||req.headers["x-mcp-settings-token"]!==settingsToken||
          origin!==`http://${host}`||contentType!=="application/json"||
          (req.headers["sec-fetch-site"]&&req.headers["sec-fetch-site"]!=="same-origin")){
        respond(res,403,"Local settings authorization required");
        return;
      }
      let raw="",tooLarge=false;
      req.on("data",(chunk:Buffer)=>{
        raw+=chunk.toString("utf8");
        if(raw.length>16_384)tooLarge=true;
      });
      req.on("end",()=>{
        if(tooLarge){respond(res,413,"Settings request too large");return;}
        try{
          const saved=saveProjectSettings(ledger.root,JSON.parse(raw));
          respond(res,200,JSON.stringify({...saved,csrfToken:settingsToken}),nonce,
            "application/json; charset=utf-8");
        }catch{
          // Never echo invalid inputs, credentials, filenames or stack traces.
          respond(res,400,'{"error":"Invalid settings update"}',nonce,
            "application/json; charset=utf-8");
        }
      });
      return;
    }
    if (req.method !== "GET") {
      respond(res, 405, "Read-only board");
      return;
    }
    try {
      if (route === "/") {
        const reqUrl=new URL(req.url ?? "/", "http://localhost");
        const locale=resolveWorkbenchLocale(reqUrl.searchParams.get("lang"),
          String(req.headers["accept-language"]??""));
        respond(res, 200, projectHtml(nonce, locale), nonce, "text/html; charset=utf-8", "none", true);
      } else if (route === "/api/meta") {
        respond(res, 200, JSON.stringify({
          root: ledger.root, schema: "devcontrol-project-workspace",
          product: "mcp-probe-kit",
          version: VERSION,
          workspaceSchemaVersion: WORKSPACE_SCHEMA_VERSION,
          lanEnabled: enabledNow,
          // Process identity is only exposed to the local supervisor, not LAN guests.
          ...(local ? {
            pid: process.pid,
            instanceId: process.env.DEVCONTROL_WORKSPACE_INSTANCE_ID ?? null,
            startedAt: process.env.DEVCONTROL_WORKSPACE_STARTED_AT ?? null,
          } : {}),
        }), nonce, "application/json; charset=utf-8");
      } else if (route === '/api/guide') {
        const intent=new URL(req.url??'/', 'http://localhost').searchParams.get('intent')??'';
        respond(res,200,JSON.stringify(devControlGuide({intent})),nonce,
          'application/json; charset=utf-8');
      } else if (route === "/api/settings") {
        if(!local){respond(res,403,"Local-only settings");return;}
        respond(res,200,JSON.stringify({
          ...publicProjectSettings(ledger.root),csrfToken:settingsToken,
        }),nonce,"application/json; charset=utf-8");
      } else if (route === "/api/access") {
        const serverAddress = server.address();
        const port = typeof serverAddress === "object" && serverAddress
          ? serverAddress.port : null;
        respond(res, 200, JSON.stringify({
          lanEnabled: enabledNow,
          urls: enabledNow && port ? lanAddresses().map((ip) => `http://${ip}:${port}/`) : [],
        }), nonce, "application/json; charset=utf-8");
      } else if (route === "/board") {
        const embedded = new URL(req.url ?? "/", "http://localhost").searchParams.get("embedded") === "1";
        respond(res, 200, boardHtml(nonce, embedded), nonce, "text/html; charset=utf-8", "sameorigin");
      } else if (route === "/api/project") {
        respond(res, 200, JSON.stringify(projectContext(ledger.root)), nonce, "application/json; charset=utf-8");
      } else if (route === "/api/onboarding") {
        respond(res, 200, JSON.stringify(projectOnboarding(
          ledger.root, ledger.list(), ledger.hasReviewedProductPlan())),
          nonce, "application/json; charset=utf-8");
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
      } else if (route === "/api/local-developer") {
        // This host's effective Git author profile, not the historical author list
        // and not the LAN viewer's local Git identity.
        respond(res, 200, JSON.stringify(ledger.localDeveloper()), nonce,
          "application/json; charset=utf-8");
      } else if (route === "/api/release-plan") {
        const release = new URL(req.url ?? "/", "http://localhost").searchParams.get("release") ??
          ledger.primaryRelease();
        if (release && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(release)) {
          respond(res, 400, '{"error":"Invalid release"}', nonce, "application/json");return;
        }
        respond(res, 200, JSON.stringify(ledger.releasePlan(release)), nonce, "application/json; charset=utf-8");
      } else if (route === "/api/release-work-plan") {
        const release = new URL(req.url ?? "/", "http://localhost").searchParams.get("release") ??
          ledger.primaryRelease();
        if(release && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(release)){
          respond(res,400,'{"error":"Invalid release"}',nonce,"application/json");return;
        }
        respond(res,200,JSON.stringify(ledger.releaseWorkPlan(release)),nonce,"application/json; charset=utf-8");
      } else if (route === "/api/features") {
        respond(res, 200, JSON.stringify({ features: ledger.listFeatures() }),
          nonce, "application/json; charset=utf-8");
      } else if (route === "/api/feature-task-plans") {
        respond(res, 200, JSON.stringify({ plans: ledger.listFeatureTaskPlans() }),
          nonce, "application/json; charset=utf-8");
      } else if (route === "/api/work-items") {
        respond(res, 200, JSON.stringify({ items: ledger.listWorkItems() }),
          nonce, "application/json; charset=utf-8");
      } else if (/^\/api\/bugs\/BUG-[A-F0-9]{15}$/.test(route)) {
        const id = route.slice("/api/bugs/".length);
        respond(res, 200, JSON.stringify(ledger.bugDetail(id)),
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
      } else if (/^\/api\/features\/[a-z0-9]+(?:-[a-z0-9]+)*\/task-brief$/.test(route)) {
        const name = route.slice("/api/features/".length).replace(/\/task-brief$/, "");
        respond(res, 200, JSON.stringify(ledger.featureTaskBrief(name)), nonce,
          "application/json; charset=utf-8");
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
        const decision = ledger.getDecision(id).decision;
        const detailAudit = ledger.taskDetailAudit(id);
        respond(res, 200, JSON.stringify({ task, evidence, completion, audit: events, decision, detailAudit }),
          nonce, "application/json; charset=utf-8");
      } else {
        respond(res, 404, "Not found");
      }
    } catch (error) {
      const notFound = error instanceof DevControlError &&
        ["TASK_NOT_FOUND", "FEATURE_NOT_FOUND", "BUG_NOT_FOUND"].includes(error.code) ||
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
    ? "\nLAN（免登录）: " + urls.join(", ") : ""}\n`);
  await new Promise<void>((resolve) => server.once("close", resolve));
}
