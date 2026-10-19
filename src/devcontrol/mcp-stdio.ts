/** Dedicated opt-in DevControl MCP surface, not part of the main feature tool list. */
import readline from "node:readline";
import { dispatchDevControl } from "./command.js";
import { DevControlError, ProjectTaskLedger } from "./task-ledger.js";

const operations = [
  "next", "list", "get", "create", "subtask", "dependency", "approve",
  "claim", "check", "report", "verify", "trace", "import-spec",
];
const requiredFields: Record<string, string[]> = {
  next: [], list: [], get: ["id"],
  create: ["id", "title", "allowedPaths", "requiredGates"],
  subtask: ["id", "title", "parentId", "allowedPaths", "requiredGates"],
  dependency: ["id", "dependsOn"], approve: ["id", "approvedBy"],
  claim: ["id", "agent"], check: [], report: ["id", "leaseToken", "kind", "reference"],
  verify: ["id", "leaseToken"], trace: ["id"],
  "import-spec": ["manifestPath", "parentTaskId", "idPrefix", "allowedPaths", "requiredGates"],
};

function response(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function error(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
export async function serveDevControlStdio(projectRoot: string): Promise<void> {
  const ledger = new ProjectTaskLedger(projectRoot);
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let answer: unknown;
      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(line);
        if (!parsed || parsed.jsonrpc !== "2.0") {
          answer = error(parsed?.id ?? null, -32600, "Invalid JSON-RPC request");
        } else if (!Object.prototype.hasOwnProperty.call(parsed, "id")) {
          continue; // Notification. No stdout response.
        } else if (parsed.method === "initialize") {
          answer = response(parsed.id, {
            protocolVersion: "2025-06-18",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "mcp-probe-kit-devcontrol-rc", version: "0.2.0" },
            instructions: "Project-level task registry and gates; Delegated Plans remain separate.",
          });
        } else if (parsed.method === "ping") {
          answer = response(parsed.id, {});
        } else if (parsed.method === "tools/list") {
          answer = response(parsed.id, {
            tools: operations.map((operation) => ({
              name: `devcontrol_${operation}`,
              description: `Project task ledger: ${operation}. Verification is based on committed evidence.`,
              inputSchema: {
                type: "object",
                additionalProperties: false,
                required: requiredFields[operation] ?? [],
                properties: Object.fromEntries(
                  [...new Set([...(requiredFields[operation] ?? []), "actor", "approvedBy",
                    "dependsOn", "parentId", "track", "release", "priority", "specId",
                    "planId", "ttlSeconds", "kind", "reference", "readyForReview"])]
                    .map((field) => [field, ["allowedPaths", "requiredGates", "dependsOn"].includes(field)
                      ? { type: "array", items: { type: "string" } }
                      : field === "priority" || field === "ttlSeconds" ? { type: "integer" }
                      : field === "readyForReview" ? { type: "boolean" } : { type: "string" }]),
                ),
              },
            })),
          });
        } else if (parsed.method === "tools/call") {
          const params = parsed.params ?? {};
          const operation = String(params.name ?? "").replace(/^devcontrol_/, "");
          if (!operations.includes(operation) || typeof params.arguments !== "object" ||
              params.arguments === null || Array.isArray(params.arguments)) {
            answer = error(parsed.id, -32602, "Invalid DevControl tool or parameters");
          } else {
            try {
              const result = dispatchDevControl(ledger, operation, params.arguments);
              answer = response(parsed.id, {
                content: [{ type: "text", text: JSON.stringify(result) }],
                structuredContent: result,
                isError: result.passed === false,
              });
            } catch (err) {
              const info = err instanceof DevControlError
                ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
              answer = response(parsed.id, {
                content: [{ type: "text", text: info }], isError: true,
              });
            }
          }
        } else {
          answer = error(parsed.id, -32601, "Unsupported method");
        }
      } catch (err) {
        answer = error(null, -32700, err instanceof Error ? err.message : "Invalid JSON");
      }
      process.stdout.write(JSON.stringify(answer) + "\n");
    }
  } finally {
    ledger.close();
  }
}
