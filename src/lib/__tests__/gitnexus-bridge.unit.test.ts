import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { prepareBridgeWorkspace, resolveExecutableCommand, resolveSpawnCommand } from "../gitnexus-bridge.js";

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

  test("Windows 下将 cmd 工具包装为 cmd.exe /c 启动", () => {
    const wrapped = resolveSpawnCommand("npx", ["-y", "gitnexus@latest", "mcp"], "win32");
    expect(wrapped.command.toLowerCase()).toContain("cmd");
    expect(wrapped.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(String(wrapped.args[3]).toLowerCase()).toContain("npx");
  });

  test("Windows 下带空格路径的 cmd 可执行文件会被正确加引号", () => {
    const root = makeTempDir("gitnexus-space-");
    const executable = path.join(root, "Program Files", "nodejs", "npx.cmd");
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, "@echo off\r\n", "utf-8");

    const wrapped = resolveSpawnCommand(executable, ["-y", "gitnexus@latest", "mcp"], "win32");

    expect(wrapped.command.toLowerCase()).toContain("cmd");
    expect(wrapped.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(wrapped.args[3]).toBe(`"${executable}"`);
  });

  test("Windows 下 git.exe 直接启动，不走 git.cmd 壳层", () => {
    const resolved = resolveExecutableCommand("git", "win32").toLowerCase();
    const spawned = resolveSpawnCommand("git", ["init", "-q"], "win32");

    expect(resolved).toContain("git");
    expect(resolved.endsWith(".exe") || resolved === "git").toBe(true);
    expect(spawned.command.toLowerCase()).not.toContain("cmd.exe /d /s /c git.cmd");
    if (spawned.command.toLowerCase().includes("cmd")) {
      expect(String(spawned.args[3]).toLowerCase()).not.toContain("git.cmd");
    } else {
      expect(spawned.command.toLowerCase()).toContain("git");
    }
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
