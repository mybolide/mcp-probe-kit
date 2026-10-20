/**
 * A zero-command daily entry for macOS.
 *
 * Installation creates a local Finder .app bundle inside the project.
 * Double-clicking it reuses (or starts) the local-only DevControl workbench
 * and opens the system browser. It never adds a login daemon or cloud server.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { DevControlError } from "./task-ledger.js";
import { WORKSPACE_SCHEMA_VERSION } from "./board-server.js";

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function openLocalUrl(url: string): void {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url)) {
    throw new DevControlError("UNSAFE_URL", "Only local DevControl URLs may be opened");
  }
  if (process.platform === "win32") {
    // cmd's builtin start needs a blank title argument. URL is validated and
    // contains no shell metacharacters; no arbitrary user input is evaluated.
    execFileSync("cmd.exe", ["/d", "/s", "/c", `start "" "${url}"`], {
      timeout: 8_000, windowsHide: true,
    });
  } else if (process.platform === "darwin") {
    execFileSync("/usr/bin/open", [url], { timeout: 8_000 });
  } else {
    execFileSync("xdg-open", [url], { timeout: 8_000 });
  }
}

/** Windows double-clickable project launcher, without a shell service/daemon. */
export function installWindowsDesktopLauncher(root: string, cliEntry = process.argv[1]): {
  bundle: string; displayName: string; status: string;
} {
  if (process.platform !== "win32") {
    throw new DevControlError("UNSUPPORTED_OS", "Windows launcher can only be installed on Windows");
  }
  const project = path.resolve(root);
  if (!fs.existsSync(path.join(project, ".git"))) {
    throw new DevControlError("NOT_GIT_PROJECT", "Launcher requires its own Git project root");
  }
  const entry = path.resolve(cliEntry);
  if (!fs.existsSync(entry)) throw new DevControlError("CLI_NOT_FOUND", "DevControl runtime was not found");
  const file = path.join(project, safeAppName(path.basename(project)) + " Workbench.cmd");
  // Encoded paths containing '%' could be expanded by cmd.exe. Reject them
  // rather than generate a script whose arguments are mutated at runtime.
  if ([entry, project].some((value) => /[%\r\n"\u0000]/.test(value))) {
    throw new DevControlError("UNSAFE_WINDOWS_PATH", "Windows launcher paths cannot contain %, quotes or newlines");
  }
  const script = [
    "@echo off",
    "setlocal DisableDelayedExpansion",
    "set \"PROJECT_ROOT=%~dp0\"",
    "set \"NODE=node\"",
    'if exist "%PROJECT_ROOT%.mcp-probe-kit\\runtime\\node.exe" set "NODE=%PROJECT_ROOT%.mcp-probe-kit\\runtime\\node.exe"',
    `set "ENTRY=${entry}"`,
    'if not exist "%ENTRY%" (',
    "  echo DevControl runtime is missing. Reinstall the workspace.",
    "  pause",
    "  exit /b 1",
    ")",
    '"%NODE%" "%ENTRY%" devcontrol desktop-open --project-root "%PROJECT_ROOT%."',
    "if errorlevel 1 pause",
    "",
  ].join("\r\n");
  fs.writeFileSync(file, script, "utf8");
  excludeLocalApp(project, path.basename(file));
  return { bundle: file, displayName: path.basename(file), status: "ready-for-double-click" };
}

export function installDesktopLauncher(root: string, cliEntry = process.argv[1]): {
  bundle: string; displayName: string; status: string;
} {
  if (process.platform === "darwin") return installMacDesktopLauncher(root, cliEntry);
  if (process.platform === "win32") return installWindowsDesktopLauncher(root, cliEntry);
  throw new DevControlError("UNSUPPORTED_OS", "Desktop launcher supports macOS and Windows");
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0,12);
}

function safeAppName(name: string): string {
  return name.replace(/[^A-Za-z0-9_\-\u3400-\u9fff ]/g, "-").slice(0, 70) || "Project";
}

function excludeLocalApp(root: string, bundleName: string): void {
  const gitFolder = path.join(root, ".git");
  const exclude = fs.existsSync(gitFolder) && fs.statSync(gitFolder).isDirectory()
    ? path.join(gitFolder, "info", "exclude") : null;
  if (!exclude) return; // Git worktrees may have a .git file; no unsafe writes.
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  const previous = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8") : "";
  const rule = "/" + bundleName + (bundleName.endsWith(".app") ? "/" : "");
  if (!previous.split("\n").includes(rule)) {
    fs.appendFileSync(exclude, (previous.endsWith("\n") || !previous ? "" : "\n") +
      "# Local DevControl Finder launcher (generated)\n" + rule + "\n");
  }
}

export function installMacDesktopLauncher(root: string, cliEntry = process.argv[1]): {
  bundle: string; displayName: string; status: string;
} {
  if (process.platform !== "darwin") {
    throw new DevControlError("UNSUPPORTED_OS",
      "Finder desktop launcher currently supports macOS only; use MCP Apps on other platforms.");
  }
  const project = path.resolve(root);
  if (!fs.existsSync(path.join(project, ".git"))) {
    throw new DevControlError("NOT_GIT_PROJECT", "Launcher must be created inside a Git project root");
  }
  const entry = path.resolve(cliEntry);
  if (!fs.existsSync(entry)) {
    throw new DevControlError("CLI_NOT_FOUND", "Installed mcp-probe-kit CLI is missing");
  }
  const displayName = safeAppName(path.basename(project)) + " Workbench";
  const bundle = path.join(project, displayName + ".app");
  const macos = path.join(bundle, "Contents", "MacOS");
  fs.mkdirSync(macos, { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>${xml(displayName)}</string>
  <key>CFBundleDisplayName</key><string>${xml(displayName)}</string>
  <key>CFBundleIdentifier</key><string>io.github.mybolide.devcontrol.${shortHash(project)}</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.5.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
</dict></plist>`;
  fs.writeFileSync(path.join(bundle, "Contents", "Info.plist"), plist, "utf8");
  // The project path is resolved relative to the bundle: moving the repository
  // with its launcher does not break the project lookup. Runtime entry is
  // explicit so a local project install never fetches a remote npm 'latest'.
  const script = `#!/bin/sh
set -eu
PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd -P)
if [ -x "/opt/homebrew/opt/node@22/bin/node" ]; then
  NODE="/opt/homebrew/opt/node@22/bin/node"
elif [ -x "/usr/local/bin/node" ]; then
  NODE="/usr/local/bin/node"
else
  NODE=$(command -v node || true)
fi
if [ -z "$NODE" ]; then
  /usr/bin/osascript -e 'display alert "DevControl" message "找不到 Node.js 22，请先完成工作台安装。"'
  exit 1
fi
ENTRY=${shellQuote(entry)}
if [ ! -f "$ENTRY" ]; then
  /usr/bin/osascript -e 'display alert "DevControl" message "本机 mcp-probe-kit 候选安装丢失，请重新安装工作台。"'
  exit 1
fi
exec "$NODE" "$ENTRY" devcontrol desktop-open --project-root "$PROJECT_ROOT"
`;
  const exec = path.join(macos, "launcher");
  fs.writeFileSync(exec, script, { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(exec, 0o755);
  excludeLocalApp(project, path.basename(bundle));
  return { bundle, displayName, status: "ready-for-double-click" };
}

async function existingRoot(port: number): Promise<string | null> {
  return await new Promise((resolve) => {
    const request = http.get({
      hostname: "127.0.0.1", port, path: "/api/meta", timeout: 900,
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        text += chunk;
        if (text.length > 100_000) response.destroy();
      });
      response.on("end", () => {
        try {
          const data = JSON.parse(text);
          resolve(response.statusCode === 200 &&
            data.version === WORKSPACE_SCHEMA_VERSION &&
            data.schema === "devcontrol-project-workspace" ?
              String(data.root ?? "") : null);
        } catch { resolve(null); }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(null));
  });
}

async function canBind(port: number): Promise<boolean> {
  const net = await import("node:net");
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function openDesktopWorkspace(
  root: string, options: { noBrowser?: boolean; cliEntry?: string } = {},
): Promise<{ url: string; reused: boolean; pid: number | null }> {
  const project = path.resolve(root);
  const entry = path.resolve(options.cliEntry ?? process.argv[1]);
  if (!fs.existsSync(entry)) throw new DevControlError("CLI_NOT_FOUND", "Cannot start installed CLI");
  const basePort = 4765;
  // Allow multiple projects on the same Mac. Never silently reuse a server
  // from another project, even when it happens to listen on 4765.
  for (let port = basePort; port < basePort + 24; port++) {
    const previous = await existingRoot(port);
    if (previous && path.resolve(previous) === project) {
      const url = `http://127.0.0.1:${port}/`;
      if (!options.noBrowser) openLocalUrl(url);
      return { url, reused: true, pid: null };
    }
    if (previous || !(await canBind(port))) continue;
    const log = path.join(os.tmpdir(), `devcontrol-${shortHash(project)}.log`);
    const out = fs.openSync(log, "a");
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, [
        entry, "devcontrol", "board", "--project-root", project, "--port", String(port),
      ], { cwd: project, stdio: ["ignore", out, out], detached: true });
      child.unref();
    } finally {
      fs.closeSync(out);
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      await wait(140);
      if (await existingRoot(port) === project) {
        const url = `http://127.0.0.1:${port}/`;
        if (!options.noBrowser) openLocalUrl(url);
        return { url, reused: false, pid: child.pid ?? null };
      }
      if (child.exitCode !== null) break;
    }
    // Abort a misbehaving process before trying an alternate port.
    if (child.pid) {
      try { process.kill(child.pid, "SIGTERM"); } catch { /* already exited */ }
    }
  }
  throw new DevControlError("NO_LOCAL_PORT",
    "Could not open a local DevControl workspace; inspect the local service log.");
}
