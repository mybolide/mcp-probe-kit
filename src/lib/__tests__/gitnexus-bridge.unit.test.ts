import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import spawn from "cross-spawn";
import { afterEach, describe, expect, test } from "vitest";
import {
  extractResolvedSymbolIdFromContext,
  prepareBridgeWorkspace,
  resolveExecutableCommand,
  resolveGitNexusBridgeCommand,
  resolveSpawnCommand,
  rerankQueryStructuredContent,
} from "../gitnexus-bridge.js";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

async function runSpawned(command: string, args: string[]) {
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe("gitnexus-bridge workspace preparation", () => {
  test("Windows 下将 npx/git 解析为 cmd 可执行文件", () => {
    const npxResolved = resolveExecutableCommand("npx", "win32").toLowerCase();
    expect(npxResolved).toContain("npx");
    if (npxResolved.includes("\\")) {
      expect(npxResolved.endsWith(".cmd") || npxResolved.endsWith("\\npx")).toBe(true);
    }
    expect(resolveExecutableCommand("git", "win32").toLowerCase()).toContain("git");
    expect(resolveExecutableCommand("npx", "linux").toLowerCase()).toContain("npx");
  });

  test("Windows 下 npx 命令直接交给底层 spawn 处理", () => {
    const wrapped = resolveSpawnCommand("npx", ["-y", "gitnexus@latest", "mcp"], "win32");
    expect(wrapped.command.toLowerCase()).not.toContain("cmd.exe");
    expect(wrapped.command.toLowerCase()).toContain("npx");
    expect(wrapped.args).toEqual(["-y", "gitnexus@latest", "mcp"]);
  });

  test("优先使用本地 gitnexus CLI 启动 bridge", () => {
    const root = makeTempDir("gitnexus-cli-");
    const executable = path.join(root, "gitnexus.cmd");
    fs.writeFileSync(executable, "@echo off\r\necho gitnexus %*\r\n", "utf-8");

    const resolved = resolveGitNexusBridgeCommand({
      PATH: root,
      PATHEXT: ".CMD;.EXE;.BAT",
    }, "win32");

    expect(resolved.strategy).toBe("local");
    expect(resolved.command).toBe(executable);
    expect(resolved.args).toEqual(["mcp"]);
  });

  test("显式 MCP_GITNEXUS_COMMAND 配置优先于本地 CLI 自动发现", () => {
    const resolved = resolveGitNexusBridgeCommand({
      MCP_GITNEXUS_COMMAND: "npx",
      MCP_GITNEXUS_ARGS: "-y gitnexus@1.4.1 mcp",
      PATH: "",
    }, "win32");

    expect(resolved.strategy).toBe("env");
    expect(resolved.command.toLowerCase()).toContain("npx");
    expect(resolved.args).toEqual(["-y", "gitnexus@1.4.1", "mcp"]);
  });

  test("query 结果会按关键词对流程做轻量重排", () => {
    const reranked = rerankQueryStructuredContent({
      processes: [
        { heuristicLabel: "Main -> Sleep", priority: 0.12, summary: "background idle loop" },
        { heuristicLabel: "Login -> GenerateToken", priority: 0.08, filePath: "src/auth/login.ts" },
      ],
    }, {
      query: "login authentication user signin auth",
      goal: "理解登录流程",
    });

    expect(reranked.changed).toBe(true);
    expect((reranked.structuredContent as any).processes[0].heuristicLabel).toBe("Login -> GenerateToken");
    expect(reranked.note).toMatch(/Top matches/i);
  });

  test("impact 可复用 context 解析出的 symbol id", () => {
    expect(
      extractResolvedSymbolIdFromContext({
        target: { id: "Method:sysAuthController.js:login:18", name: "login" },
      })
    ).toBe("Method:sysAuthController.js:login:18");

    expect(
      extractResolvedSymbolIdFromContext({
        symbol: { uid: "Function:src/auth.ts:login" },
      })
    ).toBe("Function:src/auth.ts:login");
  });

  test.runIf(process.platform === "win32")("Windows 下带空格路径的 cmd 可执行文件可以真实启动", async () => {
    const root = makeTempDir("gitnexus-space-");
    const executable = path.join(root, "Program Files", "tool.cmd");
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, "@echo off\r\necho ok %*\r\n", "utf-8");

    const wrapped = resolveSpawnCommand(executable, ["-y", "gitnexus@latest", "mcp"], "win32");
    const result = await runSpawned(wrapped.command, wrapped.args);

    expect(wrapped.command).toBe(executable);
    expect(wrapped.args).toEqual(["-y", "gitnexus@latest", "mcp"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ok");
    expect(result.stdout).toContain("-y");
    expect(result.stdout).toContain("gitnexus@latest");
    expect(result.stdout).toContain("mcp");
  });

  test.runIf(process.platform === "win32")("Windows 下 resolveSpawnCommand 生成的 npx 命令可真实执行", async () => {
    const spawned = resolveSpawnCommand("npx", ["--version"], "win32");
    const result = await runSpawned(spawned.command, spawned.args);

    expect(result.code).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  test("Windows 下 git.exe 直接启动，不走 git.cmd 壳层", () => {
    const resolved = resolveExecutableCommand("git", "win32").toLowerCase();
    const spawned = resolveSpawnCommand("git", ["init", "-q"], "win32");

    expect(resolved).toContain("git");
    expect(resolved.endsWith(".exe") || resolved === "git" || resolved === "git.cmd").toBe(true);
    expect(spawned.command.toLowerCase()).toContain("git");
  });

  test("git 目录直接使用源仓库", async () => {
    const repoRoot = makeTempDir("gitnexus-direct-");
    fs.mkdirSync(path.join(repoRoot, ".git"));
    fs.mkdirSync(path.join(repoRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "video-pipeline" }, null, 2),
      "utf-8"
    );

    const nested = path.join(repoRoot, "src");
    const workspace = await prepareBridgeWorkspace(nested);

    expect(workspace.workspaceMode).toBe("direct");
    expect(workspace.sourceRoot).toBe(repoRoot);
    expect(workspace.analysisRoot).toBe(repoRoot);
    expect(workspace.repoName).toBe("video-pipeline");
    expect(workspace.pathMapped).toBe(false);
    expect(workspace.cleanup).toBeUndefined();
  });

  test("non-git 目录创建项目内一次性工作区并忽略敏感目录", async () => {
    const sourceRoot = makeTempDir("gitnexus-temp-");
    fs.writeFileSync(path.join(sourceRoot, "index.ts"), "export const ok = true;\n", "utf-8");
    fs.mkdirSync(path.join(sourceRoot, "node_modules", "left-pad"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n", "utf-8");
    fs.mkdirSync(path.join(sourceRoot, ".mcp-probe-kit"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, ".env"), "TOKEN=secret\n", "utf-8");
    fs.mkdirSync(path.join(sourceRoot, "output"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "output", "video.mp4"), "binary-ish\n", "utf-8");

    const workspace = await prepareBridgeWorkspace(sourceRoot, undefined, { bootstrap: false });

    expect(workspace.workspaceMode).toBe("temp-repo");
    expect(workspace.sourceRoot).toBe(sourceRoot);
    expect(workspace.analysisRoot).toContain(path.join(sourceRoot, ".mcp-probe-kit", "gitnexus-temp"));
    expect(fs.existsSync(path.join(workspace.analysisRoot, "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(workspace.analysisRoot, "node_modules"))).toBe(false);
    expect(fs.existsSync(path.join(workspace.analysisRoot, ".mcp-probe-kit"))).toBe(false);
    expect(fs.existsSync(path.join(workspace.analysisRoot, ".env"))).toBe(false);
    expect(fs.existsSync(path.join(workspace.analysisRoot, "output"))).toBe(false);

    const tempWorkspaceRoot = path.dirname(workspace.analysisRoot);
    await workspace.cleanup?.();
    expect(fs.existsSync(workspace.analysisRoot)).toBe(false);
    expect(fs.existsSync(tempWorkspaceRoot)).toBe(false);
  });
});
