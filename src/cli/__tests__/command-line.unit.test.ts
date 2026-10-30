import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VERSION } from "../../version.js";
import { runCommandLine } from "../command-line.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

function createGitProject(): string {
  const root = createProject();
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
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

  test("exec --result-only omits verbose bootstrap and retains authoritative response", async () => {
    const root = createGitProject();
    const output = captureStdout();

    const exitCode = await runCommandLine([
      "exec", "devcontrol", "--result-only", "--json",
      JSON.stringify({ action: "next", project_root: root, input: {} }),
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output());
    expect(parsed).toMatchObject({
      ok: true, tool: "devcontrol", version: VERSION,
      result: { nextTask: null },
    });
    expect(parsed).not.toHaveProperty("bootstrap");
    expect(parsed).not.toHaveProperty("runtime");
    expect(parsed).not.toHaveProperty("content");
    expect(output().length).toBeLessThan(4096);
    expect(fs.existsSync(path.join(root, ".agents/skills/mcp-probe-kit/SKILL.md")))
      .toBe(true);
  });

  test("exec 复用 Tool Registry 并返回结构化 JSON", async () => {
    const root = createGitProject();
    const output = captureStdout();

    const exitCode = await runCommandLine([
      "exec",
      "devcontrol",
      "--json",
      JSON.stringify({
        action: "next",
        project_root: root,
        input: {},
      }),
    ]);

    expect(exitCode).toBe(0);
    const payload = JSON.parse(output());
    expect(payload).toMatchObject({
      ok: true,
      tool: "devcontrol",
      version: VERSION,
      project: { root: path.resolve(root) },
      runtime: { versionAligned: true },
      structuredContent: { nextTask: null },
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
  test("UTF-8 BOM 输入能够正常解析", async () => {
    const root = createGitProject();
    const output = captureStdout();
    const payload = `﻿${JSON.stringify({
      action: "next",
      project_root: root,
      input: {},
    })}`;

    const exitCode = await runCommandLine(["exec", "devcontrol", "--json", payload]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(output())).toMatchObject({
      ok: true,
      structuredContent: { nextTask: null },
    });
  });

  test("工具级 --help 返回 Schema 而不是执行工具", async () => {
    const output = captureStdout();

    const exitCode = await runCommandLine(["exec", "devcontrol", "--help"]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(output())).toMatchObject({
      ok: true,
      tool: "devcontrol",
    });
  });

  test("CLI Git 工具在多工作区中选择实际 Git 仓库而不是首个非 Git 目录", async () => {
    const nonGit = createProject();
    const gitRoot = createGitProject();
    vi.stubEnv("WORKSPACE_FOLDER_PATHS", JSON.stringify([nonGit, gitRoot]));
    const output = captureStdout();

    const exitCode = await runCommandLine([
      "exec",
      "git_work_report",
      "--json",
      JSON.stringify({ start_date: "2020-01-01", end_date: "2030-01-01" }),
    ]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(output())).toMatchObject({
      ok: true,
      project: {
        root: path.resolve(gitRoot),
        source: "workspace-env",
      },
    });
  });

  test("GitNexus 显式索引拒绝非 Git 项目", async () => {
    const root = createProject();
    const output = captureStdout();
    const code = await runCommandLine([
      "doctor", "gitnexus", "--index", "--project-root", root,
    ]);
    expect(code).toBe(1);
    expect(output()).toContain("GITNEXUS_INDEX_ROOT_INVALID");
  });

  test("doctor gitnexus 默认只诊断，不触发安装", async () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "probe-gitnexus-doctor-"));
    tempDirs.push(runtimeRoot);
    vi.stubEnv("MCP_GITNEXUS_RUNTIME_ROOT", runtimeRoot);
    vi.stubEnv("MCP_GITNEXUS_MODE", "managed");
    vi.stubEnv("PATH", runtimeRoot);
    const output = captureStdout();

    const exitCode = await runCommandLine(["doctor", "gitnexus"]);

    expect(exitCode).toBe(0);
    const actual = JSON.parse(output());
    const managedSupported = Number(process.versions.node.split(".")[0]) >= 22;
    expect(actual).toMatchObject({
      ok: true,
      component: "gitnexus",
      mode: "managed",
      selectedStrategy: managedSupported ? "managed_pending" : "managed_unsupported",
      managed: { installed: false, valid: false },
      policy: {
        bundledInMainPackage: false,
        automaticGlobalInstall: false,
        exactVersion: true,
        integrityPinned: true,
      },
    });
    expect(fs.readdirSync(runtimeRoot)).toHaveLength(0);
  });

});
