/**
 * An MCP connection is the lifecycle trigger for the project's dashboard.
 * Do not register a global daemon or require a separate user-run command.
 * A detached process serves the page so MCP restarts do not interrupt readers.
 */
import fs from "node:fs";
import path from "node:path";
import { ensureProjectWorkspaceRunning } from "./workspace-process.js";

export async function ensureProjectWorkspaceAtMcpStartup(
  workspaceRoot: string,
): Promise<{ started: boolean; url?: string; reason?: string }> {
  if (process.env.MCP_DEVCONTROL_AUTOSTART === "0") {
    return { started: false, reason: "Disabled by MCP_DEVCONTROL_AUTOSTART=0" };
  }
  if (Number(process.versions.node.split(".")[0]) < 22) {
    return { started: false, reason: "Project workbench requires Node.js 22+" };
  }
  const project = path.resolve(workspaceRoot);
  if (!fs.existsSync(path.join(project, ".git"))) {
    return { started: false, reason: "No Git project was resolved" };
  }
  const result = await ensureProjectWorkspaceRunning(project);
  return { started: true, url: result.url };
}
