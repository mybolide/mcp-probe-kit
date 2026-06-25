import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  resolveFromWorkspaceFolderPathsEnv,
  resolveWorkspaceRoot,
  resolveWorkspaceRootWithMeta,
} from "../workspace-root.js";

const original = process.env.WORKSPACE_FOLDER_PATHS;
const tempDirs: string[] = [];

afterEach(() => {
  if (original === undefined) {
    delete process.env.WORKSPACE_FOLDER_PATHS;
  } else {
    process.env.WORKSPACE_FOLDER_PATHS = original;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("workspace-root WORKSPACE_FOLDER_PATHS", () => {
  test("解析 JSON 数组形式", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, "package.json"), "{}", "utf8");
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([root]);

    expect(resolveFromWorkspaceFolderPathsEnv()).toBe(path.resolve(root));
    expect(resolveWorkspaceRoot("")).toBe(path.resolve(root));
  });

  test("客户端工作区路径不向父级 layout 上爬", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ws-parent-"));
    const child = path.join(parent, "my-app");
    tempDirs.push(parent);
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(child, "package.json"), "{}", "utf8");
    fs.mkdirSync(path.join(parent, "docs", ".mcp-probe"), { recursive: true });
    fs.writeFileSync(
      path.join(parent, "docs", ".mcp-probe", "layout.json"),
      JSON.stringify({ version: 1, indexPath: "AGENTS.md", contextRoot: "docs" }),
      "utf8"
    );

    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([child]);
    const resolution = resolveWorkspaceRootWithMeta("");
    expect(resolution.root).toBe(path.resolve(child));
    expect(resolution.source).toBe("workspace-env");
  });
});

describe("workspace-root explicit project_root", () => {
  test("显式绝对路径优先，不走上级 layout", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ws-parent-"));
    const child = path.join(parent, "my-app");
    tempDirs.push(parent);
    fs.mkdirSync(child, { recursive: true });
    fs.mkdirSync(path.join(parent, "docs", ".mcp-probe"), { recursive: true });
    fs.writeFileSync(
      path.join(parent, "docs", ".mcp-probe", "layout.json"),
      JSON.stringify({ version: 1, indexPath: "AGENTS.md", contextRoot: "docs" }),
      "utf8"
    );

    const resolution = resolveWorkspaceRootWithMeta(child);
    expect(resolution.root).toBe(path.resolve(child));
    expect(resolution.explicitHonored).toBe(true);
    expect(resolution.source).toBe("explicit");
  });

  test("显式路径无效时返回 warning", () => {
    const resolution = resolveWorkspaceRootWithMeta("not/a/valid/root");
    expect(resolution.explicitHonored).toBe(false);
    expect(resolution.warning).toMatch(/未能采用传入的 project_root/);
  });

  test("不把盘符根目录当作工作区", () => {
    const original = process.env.INIT_CWD;
    process.env.INIT_CWD = "D:\\";
    try {
      const resolution = resolveWorkspaceRootWithMeta("");
      expect(resolution.root).not.toBe("D:\\");
    } finally {
      if (original === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = original;
      }
    }
  });
});
