/** Dedicated opt-in DevControl MCP surface, not part of the main feature tool list. */
import readline from "node:readline";
import { dispatchDevControl } from "./command.js";
import { DevControlError, ProjectTaskLedger } from "./task-ledger.js";
import { ensureProjectWorkspaceAtMcpStartup } from "./startup.js";
import { ensureProjectWorkspaceRunning } from "./workspace-process.js";
import { lanAddresses } from "./workspace-access.js";
import { resolveWorkbenchLocale } from "./i18n.js";

const operations = [
  "idea-capture", "idea-list", "idea-get", "idea-assess", "idea-review", "idea-decide",
  "release-work-plan", "release-work-review", "release-work-stage", "release-work-approve",
  "release-work-scope-review", "release-work-scope-stage", "release-work-scope-get",
  "release-work-scope-independent-review", "release-work-scope-approve",
  "release-plan", "plan-review", "plan-propose", "plan-revise", "plan-approve",
  "onboard", "next", "list", "get", "features", "feature-get", "feature-save", "feature-validate",
  "feature-task-brief", "feature-task-plan", "feature-task-plans", "feature-task-review", "feature-task-stage", "feature-task-propose", "feature-task-approve",
  "feature-export", "work-items", "work-record", "architecture-sync",
  "bug-get", "bug-step-save", "bug-task-link",
  "create", "subtask", "dependency", "approve",
  "claim", "renew", "release", "check", "report", "complete", "verify",
  "trace", "board-data", "import-spec",
  "local-developer", "execution-contract", "workspace-link",
  "decision-save", "decision-get",
  "hook-status", "hook-install",
];
const requiredFields: Record<string, string[]> = {
  "idea-capture":["release","title","description","sourceRef","submittedBy"],
  "idea-list":[],
  "idea-get":["id"],
  "idea-assess":["id","expectedRevision","assessment"],
  "idea-review":["id","expectedRevision","review"],
  "idea-decide":["id","expectedRevision","expectedReviewHash","approvedBy",
    "disposition","reason","explicitAuthorization"],
  "release-work-plan": ["release"],
  "release-work-review": ["plan"],
  "release-work-stage": ["plan","actor"],
  "release-work-approve": ["release","expectedHash"],
  "release-work-scope-review": ["proposal"],
  "release-work-scope-stage": ["proposal","actor"],
  "release-work-scope-get": ["release"],
  "release-work-scope-independent-review": ["release","review","expectedProposalHash"],
  "release-work-scope-approve": ["release","expectedProposalHash","expectedReviewHash","approvedBy","reason","explicitAuthorization"],
  "release-plan": [], "plan-review": ["plan"],
  "plan-propose": ["plan","actor"],
  "plan-revise": ["plan","actor","expectedPreviousHash"],
  "plan-approve": ["release","approvedBy","expectedHash"],
  onboard: [], next: [], list: [], "board-data": [], features: [],
  "local-developer": [],
  "hook-status": [], "hook-install": [],
  "execution-contract":["id"],
  "decision-get":["id"],
  "decision-save":["id","leaseToken","question","decision","rationale",
    "alternatives","consequences","verificationPlan","status"],
  "workspace-link":[],
  "feature-get": ["name"], "feature-save": ["name", "sections"],
  "feature-validate": ["name"], "feature-export": ["name"],
  "feature-task-brief": ["name"],
  "feature-task-plan": ["name"],
  "feature-task-plans": [],
  "feature-task-review": ["name", "expectedFeatureRevision", "plan"],
  "feature-task-stage": ["name", "expectedFeatureRevision", "plan", "actor"],
  "feature-task-propose": ["name", "expectedFeatureRevision", "plan", "actor"],
  "feature-task-approve": ["name", "expectedHash"],
  "work-items": [], "work-record": ["kind", "title", "description"],
  "bug-get": ["id"],
  "bug-step-save": ["id", "step", "status", "summary", "evidence", "actor", "expectedRevision"],
  "bug-task-link": ["id", "taskId", "role", "actor"],
  "architecture-sync": ["id", "reviewer"],
  get: ["id"],
  create: ["id", "title", "allowedPaths", "requiredGates"],
  subtask: ["id", "title", "parentId", "allowedPaths", "requiredGates"],
  dependency: ["id", "dependsOn"], approve: ["id", "approvedBy"],
  claim: ["id", "agent"], renew: ["id", "leaseToken"],
  release: ["id", "leaseToken"], check: [],
  report: ["id", "leaseToken", "kind", "reference"],
  complete: ["id", "leaseToken", "summary", "implementation", "verification"],
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
  void ensureProjectWorkspaceAtMcpStartup(projectRoot)
    .then((result) => {
      if (result.started) console.error(`[DevControl] Workbench: ${result.url}`);
    })
    .catch((error: unknown) => {
      console.error(`[DevControl] Auto-start failed: ${error instanceof Error ? error.message : String(error)}`);
    });
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
            serverInfo: { name: "mcp-probe-kit-devcontrol-rc", version: "0.4.0" },
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
                    "planId", "id", "title", "allowedPaths", "requiredGates",
                    "manifestPath", "parentTaskId", "idPrefix", "agent",
                    "leaseToken", "ttlSeconds", "kind", "reference", "readyForReview",
                    "summary", "implementation", "verification", "remaining",
                    "name", "format", "sections", "featureName", "topLevelDocument",
                    "sourceRef", "description", "reviewer", "architectureImpact",
                    "plan", "expectedHash", "expectedPreviousHash",
                    "step", "status", "evidence", "expectedRevision", "expectedFeatureRevision", "taskId", "role",
                    "language","submittedBy","assessment","review","disposition",
                    "expectedReviewHash","reason","explicitAuthorization"])]
                    .map((field) => [field, ["allowedPaths", "requiredGates", "dependsOn", "evidence"].includes(field)
                      ? { type: "array", items: { type: "string" } }
                      : ["priority", "ttlSeconds", "step", "expectedRevision", "expectedFeatureRevision"].includes(field) ? { type: "integer" }
                      : ["readyForReview","explicitAuthorization"].includes(field) ? { type: "boolean" }
                      : field === "architectureImpact" ? { type: "boolean" }
                      : ["plan","assessment","review"].includes(field) ? { type: "object" }
                      : field === "sections" ? {
                        type: "object", additionalProperties: false, properties: {
                          requirements: { type: "string" },
                          design: { type: "string" },
                          tasks: { type: "string" },
                        },
                      } : { type: "string" }]),
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
              const result=operation==="workspace-link" ?
                await (async()=>{
                  const language=typeof params.arguments.language==="string"?
                    resolveWorkbenchLocale(params.arguments.language):null;
                  const suffix=(language?"?lang="+encodeURIComponent(language):"")+"#tasks";
                  const host=await ensureProjectWorkspaceRunning(projectRoot);
                  return {localUrl:host.url+suffix,
                    lanUrls:host.lanEnabled?lanAddresses().map(ip=>
                      "http://"+ip+":"+host.port+"/"+suffix):[],
                    language:language??"browser-preference",
                    languageSource:language?"explicit chat-host hint":"browser Accept-Language fallback",
                    note:"Language is scoped to a viewer URL, never shared in the project database."};
                })():dispatchDevControl(ledger, operation, params.arguments);
              answer = response(parsed.id, {
                content: [{ type: "text", text: JSON.stringify(result) }],
                structuredContent: result,
                isError: "passed" in result && result.passed === false,
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
