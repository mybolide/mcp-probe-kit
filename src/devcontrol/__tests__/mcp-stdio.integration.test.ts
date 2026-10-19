import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";

const suite = Number(process.versions.node.split(".")[0]) >= 22 ? describe : describe.skip;
const repository = process.cwd();

suite("DevControl dedicated MCP stdio", () => {
  it("negotiates, enumerates task actions, and returns next eligible task", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-devcontrol-mcp-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      fs.mkdirSync(path.join(root, ".neyna"), { recursive: true });
      fs.writeFileSync(path.join(root, ".neyna/devcontrol-plan.json"), JSON.stringify({
        schema_version: 1,
        tasks: [
          { id: "F0", title: "Ready", track: "product", release: "V0.1", depends_on: [],
            allowed_paths: ["docs/**"], required_gates: ["docs"],
            bootstrap: { status: "verified", evidence: "fixture" } },
          { id: "F1", title: "API", track: "product", release: "V0.1", depends_on: ["F0"],
            allowed_paths: ["docs/**"], required_gates: ["docs"] },
        ],
      }));
      const processHandle = spawn(process.execPath, [
        path.join(repository, "node_modules/tsx/dist/cli.mjs"),
        path.join(repository, "src/index.ts"), "devcontrol", "serve",
        "--project-root", root,
      ], { cwd: repository, stdio: ["pipe", "pipe", "pipe"] });
      const requests = [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "devcontrol_next", arguments: {} } },
      ];
      let stdout = "";
      let stderr = "";
      processHandle.stdout.on("data", (data) => { stdout += data.toString(); });
      processHandle.stderr.on("data", (data) => { stderr += data.toString(); });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        processHandle.once("error", reject);
        processHandle.once("exit", (code) => resolve(code));
        processHandle.stdin.end(requests.map((item) => JSON.stringify(item)).join("\n") + "\n");
      });
      expect(exitCode, stderr).toBe(0);
      const results = stdout.trim().split("\n").map((line) => JSON.parse(line));
      expect(results.map((x) => x.id)).toEqual([1, 2, 3]);
      expect(results[0].result.serverInfo.name).toBe("mcp-probe-kit-devcontrol-rc");
      expect(results[1].result.tools.some((tool: any) => tool.name === "devcontrol_import-spec")).toBe(true);
      expect(results[1].result.tools.some((tool: any) => tool.name === "devcontrol_renew")).toBe(true);
      expect(results[1].result.tools.some((tool: any) => tool.name === "devcontrol_release")).toBe(true);
      expect(results[2].result.structuredContent.nextTask.id).toBe("F1");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});
