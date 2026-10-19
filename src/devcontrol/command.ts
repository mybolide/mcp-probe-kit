import fs from "node:fs";
import path from "node:path";
import { ProjectTaskLedger, DevControlError, type CreateWorkItem, type CompletionReport } from "./task-ledger.js";
import { serveDevControlStdio } from "./mcp-stdio.js";
import { serveDevControlBoard } from "./board-server.js";

type FlagMap = Map<string, string | boolean>;

function stringFlag(flags: FlagMap, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === "string" ? value : undefined;
}

function jsonInput(flags: FlagMap): Record<string, any> {
  const inline = stringFlag(flags, "json");
  const file = stringFlag(flags, "input");
  if (inline && file) throw new DevControlError("MULTIPLE_INPUTS", "Use either --json or --input");
  const raw = inline ?? (file ? fs.readFileSync(path.resolve(file), "utf8") : "{}");
  const decoded: unknown = JSON.parse(raw);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new DevControlError("INVALID_INPUT", "Input must be a JSON object");
  }
  return decoded as Record<string, any>;
}

export function dispatchDevControl(
  ledger: ProjectTaskLedger, operation: string, input: Record<string, any> = {},
): Record<string, unknown> {
  switch (operation) {
    case "next": return ledger.next();
    case "board-data": return ledger.board();
    case "status":
    case "list": return { tasks: ledger.list() };
    case "get": return ledger.get(String(input.id));
    case "create": return ledger.create(input as CreateWorkItem, String(input.actor ?? "agent-proposal"));
    case "subtask": {
      if (!input.parentId) throw new DevControlError("PARENT_REQUIRED", "Subtask needs parentId");
      return ledger.create(input as CreateWorkItem, String(input.actor ?? "agent-proposal"));
    }
    case "import-spec": return ledger.importSpec(input as never);
    case "dependency": return ledger.addDependency(
      String(input.id), String(input.dependsOn), String(input.actor ?? "agent-proposal"),
    );
    case "complete": return ledger.complete(
      String(input.id), String(input.leaseToken), input as CompletionReport,
    );
    case "approve": return ledger.approve(String(input.id), String(input.approvedBy));
    case "claim": return ledger.claim(
      String(input.id), String(input.agent), Number(input.ttlSeconds ?? 1800),
    );
    case "renew": return ledger.renew(
      String(input.id), String(input.leaseToken), Number(input.ttlSeconds ?? 1800),
    );
    case "release": return ledger.release(String(input.id), String(input.leaseToken));
    case "check": return ledger.checkStaged();
    case "report": return ledger.report(
      String(input.id), String(input.leaseToken),
      { kind: String(input.kind), reference: String(input.reference) },
      input.readyForReview === true,
    );
    case "verify": return ledger.verify(String(input.id), String(input.leaseToken));
    case "trace": return ledger.trace(String(input.id));
    default: throw new DevControlError("UNKNOWN_ACTION", `Unsupported DevControl operation: ${operation}`);
  }
}

export async function runDevControlCli(positionals: string[], flags: FlagMap): Promise<number> {
  const root = path.resolve(stringFlag(flags, "project-root") ?? process.cwd());
  const operation = positionals[0]?.trim() ?? "next";
  if (operation === "serve") {
    await serveDevControlStdio(root);
    return 0;
  }
  if (operation === "board") {
    const rawPort = stringFlag(flags, "port") ?? "4765";
    const port = Number(rawPort);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
      throw new DevControlError("INVALID_PORT", "Board port must be between 0 and 65535");
    }
    await serveDevControlBoard(root, port);
    return 0;
  }
  const ledger = new ProjectTaskLedger(root);
  try {
    const input = jsonInput(flags);
    const result = dispatchDevControl(ledger, operation, input);
    process.stdout.write(JSON.stringify({ ok: true, operation, result }, null, 2) + "\n");
    return "passed" in result && result.passed === false ? 1 : 0;
  } finally {
    ledger.close();
  }
}
