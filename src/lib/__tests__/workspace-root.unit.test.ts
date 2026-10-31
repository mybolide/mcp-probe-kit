import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  assertManagedWriteRootSafe,
  getManagedWriteRootRejection,
  resolveFromWorkspaceFolderPathsEnv,
  resolveWorkspaceRoot,
  resolveWorkspaceRootWithMeta,
} from "../workspace-root.js";
import {
  ensureMcpProbeKitBootstrapAtStartup,
  ensureMcpProbeKitBootstrapForToolCall,
} from "../workflow-skill-installer.js";

const original = process.env.WORKSPACE_FOLDER_PATHS;
const originalConfiguredRoot = process.env.MCP_PROJECT_ROOT;
const originalWorkspaceRoot = process.env.MCP_WORKSPACE_ROOT;
const originalCwd = process.cwd();
const tempDirs: string[] = [];

beforeEach(() => {
  delete process.env.MCP_PROJECT_ROOT;
  delete process.env.MCP_WORKSPACE_ROOT;
});

afterEach(() => {
  process.chdir(originalCwd);
  if (original === undefined) {
    delete process.env.WORKSPACE_FOLDER_PATHS;
  } else {
    process.env.WORKSPACE_FOLDER_PATHS = original;
  }
  if (originalConfiguredRoot === undefined) {
    delete process.env.MCP_PROJECT_ROOT;
  } else {
    process.env.MCP_PROJECT_ROOT = originalConfiguredRoot;
  }
  if (originalWorkspaceRoot === undefined) {
    delete process.env.MCP_WORKSPACE_ROOT;
  } else {
    process.env.MCP_WORKSPACE_ROOT = originalWorkspaceRoot;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("workspace-root configured MCP_PROJECT_ROOT", () => {
  function parentAndChild() {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ws-explicit-env-"));
    const child = path.join(parent, "app");
    tempDirs.push(parent);
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(parent, "package.json"), "{}", "utf8");
    fs.writeFileSync(path.join(child, "package.json"), "{}", "utf8");
    return { parent, child };
  }

  test("parent MCP_PROJECT_ROOT wins over child cwd, with no child bootstrap writes", () => {
    const { parent, child } = parentAndChild();
    process.chdir(child);
    delete process.env.WORKSPACE_FOLDER_PATHS;
    process.env.MCP_PROJECT_ROOT = parent;

    const resolved = resolveWorkspaceRootWithMeta();
    expect(resolved).toMatchObject({ root: parent, source: "explicit-env", explicitHonored: true });

    const startup = ensureMcpProbeKitBootstrapAtStartup();
    expect(startup.error).toBeUndefined();
    expect(startup.bootstrap?.projectRoot).toBe(parent);
    expect(fs.existsSync(path.join(parent, ".agents", "skills", "mcp-probe-kit", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(child, ".agents"))).toBe(false);
    expect(fs.existsSync(path.join(child, "AGENTS.md"))).toBe(false);
    expect(fs.existsSync(path.join(child, ".mcp-probe-kit"))).toBe(false);
  });

  test("parent MCP_PROJECT_ROOT wins over WORKSPACE_FOLDER_PATHS pointing to child", () => {
    const { parent, child } = parentAndChild();
    process.chdir(child);
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([child]);
    process.env.MCP_PROJECT_ROOT = parent;

    const resolved = resolveWorkspaceRootWithMeta();
    expect(resolved.root).toBe(parent);
    expect(resolved.source).toBe("explicit-env");
    expect(resolveWorkspaceRoot(child)).toBe(child); // Explicit tool argument remains highest priority.
  });

  test("MCP_PROJECT_ROOT wins over another configured root and other explicit overrides win over client cwd", () => {
    const { parent, child } = parentAndChild();
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "ws-other-root-"));
    tempDirs.push(other);
    fs.writeFileSync(path.join(other, "package.json"), "{}", "utf8");
    process.chdir(child);
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([child]);
    process.env.MCP_WORKSPACE_ROOT = other;
    expect(resolveWorkspaceRootWithMeta().root).toBe(other);
    process.env.MCP_PROJECT_ROOT = parent;
    expect(resolveWorkspaceRootWithMeta()).toMatchObject({ root: parent, source: "explicit-env" });
  });

  test("invalid configured roots fail closed rather than writing to cwd", () => {
    const { parent, child } = parentAndChild();
    process.chdir(child);
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([child]);
    for (const invalid of [".", path.join(parent, "missing"), os.homedir()]) {
      process.env.MCP_PROJECT_ROOT = invalid;
      expect(() => resolveWorkspaceRootWithMeta()).toThrow(/MCP_PROJECT_ROOT/);
      expect(() => ensureMcpProbeKitBootstrapAtStartup()).toThrow(/MCP_PROJECT_ROOT/);
      expect(() => ensureMcpProbeKitBootstrapForToolCall("code_insight", {})).toThrow(/MCP_PROJECT_ROOT/);
      expect(fs.existsSync(path.join(child, "AGENTS.md"))).toBe(false);
    }
  });

  test("auto-detection still uses the child workspace when no root is configured", () => {
    const { child } = parentAndChild();
    process.chdir(child);
    delete process.env.MCP_PROJECT_ROOT;
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([child]);
    const resolved = resolveWorkspaceRootWithMeta();
    expect(resolved.root).toBe(child);
    expect(resolved.source).toBe("workspace-env");
  });
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

  test("拒绝将用户家目录和文件系统根目录作为托管写入根目录", () => {
    expect(getManagedWriteRootRejection(os.homedir())).toMatch(/用户家目录/);
    expect(() => assertManagedWriteRootSafe(os.homedir())).toThrow(/独立的项目子目录/);

    const filesystemRoot = path.parse(path.resolve(process.cwd())).root;
    expect(getManagedWriteRootRejection(filesystemRoot)).toMatch(/根目录/);
    expect(() => assertManagedWriteRootSafe(filesystemRoot)).toThrow(/独立的项目子目录/);

    if (process.platform === "win32") {
      const alternateDriveRoot = filesystemRoot.toLowerCase().startsWith("e:") ? "D:\\" : "E:\\";
      expect(getManagedWriteRootRejection(alternateDriveRoot)).toMatch(/文件系统根目录/);
      expect(() => assertManagedWriteRootSafe(alternateDriveRoot)).toThrow(/独立的项目子目录/);
    }
  });

  test("允许用户家目录下的独立项目子目录", () => {
    const child = path.join(os.homedir(), "workspace", "safe-project");
    expect(getManagedWriteRootRejection(child)).toBeNull();
    expect(() => assertManagedWriteRootSafe(child)).not.toThrow();
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
