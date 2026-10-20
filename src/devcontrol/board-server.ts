/** Local read-only DevControl Kanban. The board is a projection of SQLite. */
import http, { type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { ProjectTaskLedger, DevControlError } from "./task-ledger.js";
import { boardHtml } from "./board-html.js";
import { projectHtml } from "./project-html.js";
import { projectContext, readProjectDoc } from "./project-catalog.js";

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
export function createDevControlBoardServer(source: string | ProjectTaskLedger): http.Server {
  const owned = typeof source === "string";
  const ledger = typeof source === "string" ? new ProjectTaskLedger(source) : source;
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? "").toLowerCase();
    if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host)) {
      respond(res, 403, "Loopback only");
      return;
    }
    if (req.method !== "GET") {
      respond(res, 405, "Read-only board");
      return;
    }
    const route = new URL(req.url ?? "/", "http://localhost").pathname;
    const nonce = randomBytes(18).toString("base64");
    try {
      if (route === "/") {
        respond(res, 200, projectHtml(nonce), nonce, "text/html; charset=utf-8", "none", true);
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
      const notFound = error instanceof DevControlError && error.code === "TASK_NOT_FOUND";
      respond(res, notFound ? 404 : 500, JSON.stringify({ error: notFound ? "Unknown task" : "Server error" }),
        nonce, "application/json");
    }
  });
  if (owned) server.on("close", () => ledger.close());
  return server;
}

export async function serveDevControlBoard(root: string, port = 4765): Promise<void> {
  const server = createDevControlBoardServer(root);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const selectedPort = typeof address === "object" && address ? address.port : port;
  process.stdout.write(`DevControl 看板（本机只读）: http://127.0.0.1:${selectedPort}/\n`);
  await new Promise<void>((resolve) => server.once("close", resolve));
}
