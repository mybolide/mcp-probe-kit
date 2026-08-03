import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  buildManagedGitNexusProcessEnv,
  ensureManagedGitNexusRuntime,
  findSystemGitNexusCli,
  inspectManagedGitNexusRuntime,
  resolveCompatibleGitNexus,
  resolveGitForWindowsRuntimeBin,
  resolveGitNexusMode,
  resolveGitNexusRuntimeRoot,
} from "../gitnexus-runtime-manager.js";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function createFakeNpm(root: string): { binDir: string; counterPath: string } {
  const binDir = path.join(root, "fake-bin");
  fs.mkdirSync(binDir, { recursive: true });
  const counterPath = path.join(root, "npm-invocations.txt");
  const scriptPath = path.join(binDir, "fake-npm.cjs");
  fs.writeFileSync(scriptPath, `
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
const version = pkg.dependencies.gitnexus;
const integrityByVersion = {
  "1.6.9": "sha512-Rq5LXFygx7jjMp/YFsIAcnnzuKvvCsb4rxHFILnu05ZOqk7xNXTUSMRa968EOCbxcKFxnhKYaGXoabOUeGZX6A=="
};
const packageRoot = path.join(cwd, "node_modules", "gitnexus");
const cliDir = path.join(packageRoot, "dist", "cli");
fs.mkdirSync(cliDir, { recursive: true });
fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ name: "gitnexus", version }, null, 2));
const cliSource = [
  "#!/usr/bin/env node",
  "const command = process.argv[2] || '--version';",
  "if (command === 'doctor') {",
  "  console.log('Full-text search: available');",
  "} else if (command === 'analyze') {",
  "  console.log('Repository indexed successfully');",
  "} else if (command === 'clean') {",
  "  console.log('Cleaned');",
  "} else {",
  "  console.log(" + JSON.stringify(version) + ");",
  "}",
  "",
].join("\\n");
fs.writeFileSync(path.join(cliDir, "index.js"), cliSource);
fs.writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "": { dependencies: { gitnexus: version } },
    "node_modules/gitnexus": { version, integrity: integrityByVersion[version] }
  }
}, null, 2));
fs.appendFileSync(${JSON.stringify(counterPath)}, "1\\n");
`, "utf8");

  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(binDir, "npm.cmd"),
      `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
      "utf8"
    );
  } else {
    const npmPath = path.join(binDir, "npm");
    fs.writeFileSync(
      npmPath,
      `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`,
      "utf8"
    );
    fs.chmodSync(npmPath, 0o755);
  }
  return { binDir, counterPath };
}

function createHangingNpm(root: string): { binDir: string; childPidPath: string } {
  const binDir = path.join(root, "hanging-bin");
  fs.mkdirSync(binDir, { recursive: true });
  const childPidPath = path.join(root, "hanging-child.pid");
  const heldFilePath = path.join(root, "held-open.txt");
  const childScript = path.join(binDir, "held-child.cjs");
  fs.writeFileSync(childScript, `
const fs = require("node:fs");
const fd = fs.openSync(${JSON.stringify(heldFilePath)}, "w");
fs.writeSync(fd, "held");
setInterval(() => {}, 1000);
`, "utf8");
  const parentScript = path.join(binDir, "hanging-npm.cjs");
  fs.writeFileSync(parentScript, `
const fs = require("node:fs");
const cp = require("node:child_process");
const child = cp.spawn(process.execPath, [${JSON.stringify(childScript)}], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(childPidPath)}, String(child.pid));
setInterval(() => {}, 1000);
`, "utf8");

  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(binDir, "npm.cmd"),
      `@echo off\r\n"${process.execPath}" "${parentScript}" %*\r\n`,
      "utf8"
    );
  }
  return { binDir, childPidPath };
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("GitNexus managed runtime", () => {
  test("按平台选择经过真实验证的 GitNexus，Node 20 快速降级", () => {
    expect(() => resolveCompatibleGitNexus("20.18.0", "win32")).toThrow(/Node\.js >= 22/);
    expect(() => resolveCompatibleGitNexus("21.7.0", "darwin")).toThrow(/Node\.js >= 22/);
    expect(resolveCompatibleGitNexus("22.14.0", "win32").version).toBe("1.6.9");
    expect(resolveCompatibleGitNexus("24.1.0", "darwin").version).toBe("1.6.9");
    expect(resolveCompatibleGitNexus("24.1.0", "linux").version).toBe("1.6.9");
    expect(resolveCompatibleGitNexus("24.1.0", "darwin").analyzeArgs).toEqual(["--workers", "1"]);
    expect(resolveCompatibleGitNexus("24.1.0", "darwin").runtimeEnv).toEqual({
      GITNEXUS_WORKER_POOL_SIZE: "1",
    });
    expect(() => resolveCompatibleGitNexus("24.1.0", "freebsd")).toThrow(/暂不支持平台/);
  });

  test("Windows 托管运行时会发现 Git for Windows 的 OpenSSL 目录并注入 PATH", () => {
    const root = makeTempRoot("gitnexus-git-runtime-");
    const cmdDir = path.join(root, "cmd");
    const runtimeBin = path.join(root, "mingw64", "bin");
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.mkdirSync(runtimeBin, { recursive: true });
    fs.writeFileSync(path.join(cmdDir, "git.cmd"), "@echo off\r\n", "utf8");
    fs.writeFileSync(path.join(runtimeBin, "libssl-3-x64.dll"), "ssl", "utf8");
    fs.writeFileSync(path.join(runtimeBin, "libcrypto-3-x64.dll"), "crypto", "utf8");

    const env = {
      PATH: cmdDir,
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
      GITNEXUS_WORKER_POOL_SIZE: "4",
    };
    expect(resolveGitForWindowsRuntimeBin(env, "win32")).toBe(runtimeBin);

    const compatibility = resolveCompatibleGitNexus("22.0.0", "win32");
    const managedEnv = buildManagedGitNexusProcessEnv(
      compatibility,
      env,
      "win32",
      { provisionExtensions: true }
    );
    expect(managedEnv.PATH.split(path.delimiter)[0]).toBe(runtimeBin);
    expect(managedEnv.GITNEXUS_WORKER_POOL_SIZE).toBe("4");
    expect(managedEnv.GITNEXUS_LBUG_EXTENSION_INSTALL).toBe("auto");
  });

  test("模式默认为 auto，并支持 managed/system/off", () => {
    expect(resolveGitNexusMode({})).toBe("auto");
    expect(resolveGitNexusMode({ MCP_GITNEXUS_MODE: "managed" })).toBe("managed");
    expect(resolveGitNexusMode({ MCP_GITNEXUS_MODE: "system" })).toBe("system");
    expect(resolveGitNexusMode({ MCP_GITNEXUS_MODE: "off" })).toBe("off");
    expect(resolveGitNexusMode({ MCP_GITNEXUS_MODE: "bad" })).toBe("auto");
  });

  test("运行时目录支持显式覆盖", () => {
    const root = makeTempRoot("gitnexus-runtime-root-");
    expect(resolveGitNexusRuntimeRoot({ MCP_GITNEXUS_RUNTIME_ROOT: root })).toBe(path.resolve(root));
  });

  test("能够发现系统 GitNexus CLI", () => {
    const root = makeTempRoot("gitnexus-system-cli-");
    const fileName = process.platform === "win32" ? "gitnexus.cmd" : "gitnexus";
    const cliPath = path.join(root, fileName);
    fs.writeFileSync(cliPath, process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n", "utf8");
    if (process.platform !== "win32") fs.chmodSync(cliPath, 0o755);
    const found = findSystemGitNexusCli({
      PATH: root,
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
    });
    expect(found?.toLowerCase()).toBe(cliPath.toLowerCase());
  });

  test("首次安装使用独立目录、完整性校验和原子复用", async () => {
    const root = makeTempRoot("gitnexus-managed-install-");
    const runtimeRoot = path.join(root, "runtime");
    const fake = createFakeNpm(root);
    const env = {
      ...process.env,
      PATH: `${fake.binDir}${path.delimiter}${process.env.PATH || ""}`,
      MCP_GITNEXUS_RUNTIME_ROOT: runtimeRoot,
      MCP_GITNEXUS_INSTALL_TIMEOUT_MS: "5000",
      MCP_GITNEXUS_PACKAGE_MANAGER: "npm",
    };

    const [first, concurrent] = await Promise.all([
      ensureManagedGitNexusRuntime({ env, nodeVersion: "22.0.0" }),
      ensureManagedGitNexusRuntime({ env, nodeVersion: "22.0.0" }),
    ]);
    expect(first.valid).toBe(true);
    expect(concurrent.valid).toBe(true);
    expect(first.compatibility.version).toBe(resolveCompatibleGitNexus("22.0.0", process.platform).version);
    expect(fs.existsSync(first.cliPath)).toBe(true);
    expect(first.manifest?.integrity).toBe(first.compatibility.integrity);
    expect(fs.readFileSync(fake.counterPath, "utf8").trim().split(/\r?\n/)).toHaveLength(1);

    const second = await ensureManagedGitNexusRuntime({ env, nodeVersion: "22.0.0" });
    expect(second.installedNow).toBe(false);
    expect(inspectManagedGitNexusRuntime({ env, nodeVersion: "22.0.0" }).valid).toBe(true);
    expect(fs.readFileSync(fake.counterPath, "utf8").trim().split(/\r?\n/)).toHaveLength(1);
  });

  test("Node 指纹变化时不会复用旧原生运行时", async () => {
    const root = makeTempRoot("gitnexus-fingerprint-");
    const runtimeRoot = path.join(root, "runtime");
    const fake = createFakeNpm(root);
    const env = {
      ...process.env,
      PATH: `${fake.binDir}${path.delimiter}${process.env.PATH || ""}`,
      MCP_GITNEXUS_RUNTIME_ROOT: runtimeRoot,
      MCP_GITNEXUS_INSTALL_TIMEOUT_MS: "5000",
      MCP_GITNEXUS_PACKAGE_MANAGER: "npm",
    };
    const installed = await ensureManagedGitNexusRuntime({ env, nodeVersion: "22.0.0" });
    expect(installed.valid).toBe(true);
    expect(installed.compatibility.version).toBe(resolveCompatibleGitNexus("22.0.0", process.platform).version);
    expect(inspectManagedGitNexusRuntime({ env, nodeVersion: "24.0.0" }).valid).toBe(false);
    expect(inspectManagedGitNexusRuntime({ env, nodeVersion: "24.0.0" }).reason).toBe("managed_runtime_missing");
  });

  test.runIf(process.platform === "win32")("安装超时会终止 npm 整个进程树并清理临时目录", async () => {
    const root = makeTempRoot("gitnexus-timeout-tree-");
    const runtimeRoot = path.join(root, "runtime");
    const hanging = createHangingNpm(root);
    const env = {
      ...process.env,
      PATH: `${hanging.binDir}${path.delimiter}${process.env.PATH || ""}`,
      MCP_GITNEXUS_RUNTIME_ROOT: runtimeRoot,
      MCP_GITNEXUS_INSTALL_TIMEOUT_MS: "3000",
      MCP_GITNEXUS_PACKAGE_MANAGER: "npm",
    };

    const startedAt = Date.now();
    await expect(ensureManagedGitNexusRuntime({ env, nodeVersion: "22.0.0" })).rejects.toThrow(/超时/);
    expect(Date.now() - startedAt).toBeLessThan(10_000);

    await new Promise((resolve) => setTimeout(resolve, 500));
    const childPid = Number(fs.readFileSync(hanging.childPidPath, "utf8"));
    try {
      expect(processExists(childPid)).toBe(false);
      const versionRoot = path.join(runtimeRoot, resolveCompatibleGitNexus("22.0.0", process.platform).version);
      const leftovers = fs.existsSync(versionRoot) ? fs.readdirSync(versionRoot) : [];
      expect(leftovers.filter((name) => name.includes(".tmp-") || name.endsWith(".install.lock"))).toEqual([]);
    } finally {
      if (processExists(childPid)) {
        const { spawnSync } = await import("node:child_process");
        spawnSync("taskkill", ["/PID", String(childPid), "/T", "/F"], { windowsHide: true });
      }
    }
  });

});
