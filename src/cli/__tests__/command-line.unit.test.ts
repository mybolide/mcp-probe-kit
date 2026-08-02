import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VERSION } from "../../version.js";
import { runCommandLine } from "../command-line.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-cli-"));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"cli-demo"}\n', "utf8");
  return root;
}

function captureStdout() {
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  }) as typeof process.stdout.write);
  return () => output;
}

describe("mcp-probe-kit CLI", () => {
  test("无参数时保留 stdio MCP 启动行为", async () => {
    await expect(runCommandLine([])).resolves.toBeNull();
  });

  test("exec 复用 Tool Registry 并返回结构化 JSON", async () => {
    const root = createProject();
    const output = captureStdout();

    const exitCode = await runCommandLine([
      "exec",
      "workflow",
      "--json",
      JSON.stringify({
        intent: "开发一个本地任务看板",
        scenario: "feature",
        project_root: root,
      }),
    ]);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(output());
    expect(payload).toMatchObject({
      ok: true,
      tool: "workflow",
      version: VERSION,
      project: { root: path.resolve(root) },
      runtime: { versionAligned: true },
      structuredContent: { firstTool: "start_feature" },
    });
    expect(fs.existsSync(path.join(root, ".mcp-probe-kit/bin/probe.ps1"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agents/skills/mcp-probe-kit/SKILL.md"))).toBe(true);
  });

  test("install-agent 自动安装版本锁定启动器", async () => {
    const root = createProject();
    fs.mkdirSync(path.join(root, ".cursor"), { recursive: true });
    const output = captureStdout();

    const exitCode = await runCommandLine([
      "install-agent",
      "--project-root",
      root,
    ]);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(output());
    expect(payload.installed.cliFallback.packageSpec).toBe(`mcp-probe-kit@${VERSION}`);
    expect(
      fs.readFileSync(path.join(root, ".cursor/rules/mcp-probe-kit.mdc"), "utf8")
    ).toContain(`mcp-probe-kit@${VERSION}`);
  });

  test("未知工具返回稳定错误码", async () => {
    const output = captureStdout();

    const exitCode = await runCommandLine(["exec", "missing_tool", "--json", "{}"]);

    expect(exitCode).toBe(1);
    expect(JSON.parse(output())).toMatchObject({
      ok: false,
      code: "UNKNOWN_TOOL",
    });
  });
});
