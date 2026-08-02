import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { VERSION } from "../../version.js";
import {
  CLI_CMD_REL_PATH,
  CLI_POWERSHELL_REL_PATH,
  CLI_RUNTIME_MANIFEST_REL_PATH,
  CLI_SHELL_REL_PATH,
  ensureCliFallback,
  readCliRuntimeManifest,
} from "../cli-fallback-installer.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-cli-fallback-"));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"demo"}\n', "utf8");
  return root;
}

describe("cli-fallback-installer", () => {
  test("生成精确版本启动器和运行清单", () => {
    const root = tempRoot();

    const result = ensureCliFallback(root);

    expect(result.version).toBe(VERSION);
    expect(result.packageSpec).toBe(`mcp-probe-kit@${VERSION}`);
    expect(result.files.filter((file) => file.created)).toHaveLength(4);

    const manifest = readCliRuntimeManifest(root);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      package: "mcp-probe-kit",
      version: VERSION,
      packageSpec: `mcp-probe-kit@${VERSION}`,
    });

    for (const relPath of [CLI_POWERSHELL_REL_PATH, CLI_CMD_REL_PATH, CLI_SHELL_REL_PATH]) {
      const text = fs.readFileSync(path.join(root, relPath), "utf8");
      expect(text).toContain(`mcp-probe-kit@${VERSION}`);
      expect(text).not.toContain("mcp-probe-kit@latest");
      expect(text).not.toContain("mcp-probe-kit@next");
    }
    const shellPath = path.join(root, CLI_SHELL_REL_PATH);
    const shell = fs.readFileSync(shellPath, "utf8");
    expect(shell.startsWith("#!/usr/bin/env sh")).toBe(true);
    expect(shell).toContain('"$@"');
    if (process.platform !== "win32") {
      expect(fs.statSync(shellPath).mode & 0o111).not.toBe(0);
    }
    expect(fs.existsSync(path.join(root, CLI_RUNTIME_MANIFEST_REL_PATH))).toBe(true);
  });

  test("同版本重复执行不重写文件", () => {
    const root = tempRoot();
    const first = ensureCliFallback(root);
    const manifestPath = path.join(root, CLI_RUNTIME_MANIFEST_REL_PATH);
    const firstManifest = fs.readFileSync(manifestPath, "utf8");

    const second = ensureCliFallback(root);

    expect(first.files.some((file) => file.created)).toBe(true);
    expect(second.files.every((file) => file.skipped)).toBe(true);
    expect(fs.readFileSync(manifestPath, "utf8")).toBe(firstManifest);
  });

  test("旧进程不会覆盖更高版本启动器", () => {
    const root = tempRoot();
    const higherVersion = "999.0.0";
    ensureCliFallback(root, higherVersion);

    const result = ensureCliFallback(root, VERSION);

    expect(result.version).toBe(higherVersion);
    expect(result.preservedNewerVersion).toBe(true);
    expect(readCliRuntimeManifest(root)?.version).toBe(higherVersion);
    expect(
      fs.readFileSync(path.join(root, CLI_POWERSHELL_REL_PATH), "utf8")
    ).toContain(`mcp-probe-kit@${higherVersion}`);
  });
});
