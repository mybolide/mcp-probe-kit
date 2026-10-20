/**
 * Build a self-contained, project-local DevControl desktop bundle on the
 * CURRENT OS. The GitHub runner builds Win/mac independently to avoid
 * pretending a macOS-only smoke test validates Windows.
 *
 * Distribution is a bundled Node runtime + prebundled CLI, not a claim of
 * fully native GUI compilation. Double-click launchers require no installed
 * Node and always use the Git repository where the bundle is extracted.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.platform;
if (!['win32', 'darwin'].includes(platform)) {
  throw new Error('DevControl desktop distribution is supported on macOS/Windows only');
}
const label = platform === 'win32' ? 'windows' : 'macos';
const root = path.join(repo, 'dist', `devcontrol-${label}-${process.arch}`);
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
const installedRuntime = path.join(root, '.mcp-probe-kit', 'runtime');
const appDir = path.join(root, '.mcp-probe-kit', 'app');
fs.mkdirSync(installedRuntime, { recursive: true });
fs.mkdirSync(appDir, { recursive: true });
const nodeName = platform === 'win32' ? 'node.exe' : 'node';
const nodeBytes = fs.statSync(process.execPath).size;
// Homebrew may install an ~80 KiB Node shim linked to libnode + system-wide
// libuv, ICU and OpenSSL. Copying that executable is NOT a portable runtime.
// The release builders must use an official, self-contained Node binary.
if (nodeBytes < 5_000_000) {
  throw new Error(
    'Node executable is a dynamically linked shim. Package on GitHub macOS/Windows runner with official Node.js 22, not a Homebrew-linked runtime.',
  );
}
if (platform === 'darwin') {
  const linked = execFileSync('otool', ['-L', process.execPath], { encoding: 'utf8' })
    .split('\n').slice(1).map((line) => line.trim().split(' ')[0]).filter(Boolean);
  const external = linked.filter((lib) =>
    !lib.startsWith('/System/Library/') && !lib.startsWith('/usr/lib/'));
  if (external.length) {
    throw new Error('Node executable depends on external macOS libraries: ' + external.join(', '));
  }
}
fs.copyFileSync(process.execPath, path.join(installedRuntime, nodeName));
if (platform !== 'win32') fs.chmodSync(path.join(installedRuntime, nodeName), 0o755);
fs.copyFileSync(path.join(repo, 'build', 'index.js'), path.join(appDir, 'index.js'));
fs.writeFileSync(path.join(appDir, 'package.json'), '{"type":"module"}\n');
const resources = path.join(repo, 'build', 'resources', 'ui-ux-data');
if (fs.existsSync(resources)) {
  fs.cpSync(resources, path.join(appDir, 'resources', 'ui-ux-data'), { recursive: true });
}

if (platform === 'win32') {
  fs.writeFileSync(path.join(root, 'DevControl Workbench.cmd'), [
    '@echo off',
    'setlocal DisableDelayedExpansion',
    'set "PROJECT_ROOT=%~dp0"',
    'if not exist "%PROJECT_ROOT%.git" (',
    '  echo Copy this DevControl bundle into the root of a Git project.',
    '  pause',
    '  exit /b 1',
    ')',
    '"%PROJECT_ROOT%.mcp-probe-kit\\runtime\\node.exe" "%PROJECT_ROOT%.mcp-probe-kit\\app\\index.js" devcontrol desktop-open --project-root "%PROJECT_ROOT%."',
    'if errorlevel 1 pause',
    '',
  ].join('\r\n'));
} else {
  const bundle = path.join(root, 'DevControl Workbench.app');
  const macos = path.join(bundle, 'Contents', 'MacOS');
  fs.mkdirSync(macos, { recursive: true });
  fs.writeFileSync(path.join(bundle, 'Contents', 'Info.plist'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0"><dict>',
    '  <key>CFBundleExecutable</key><string>launcher</string>',
    '  <key>CFBundleIdentifier</key><string>io.github.mybolide.devcontrol.portable</string>',
    '  <key>CFBundleName</key><string>DevControl Workbench</string>',
    '  <key>CFBundlePackageType</key><string>APPL</string>',
    '</dict></plist>',
    '',
  ].join('\n'));
  const launcher = path.join(macos, 'launcher');
  fs.writeFileSync(launcher, [
    '#!/bin/sh', 'set -eu',
    'ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd -P)',
    'if [ ! -d "$ROOT/.git" ] && [ ! -f "$ROOT/.git" ]; then',
    '  /usr/bin/osascript -e \'display alert "DevControl" message "请将工作台放入 Git 项目根目录。"\'',
    '  exit 1', 'fi',
    'exec "$ROOT/.mcp-probe-kit/runtime/node" "$ROOT/.mcp-probe-kit/app/index.js" devcontrol desktop-open --project-root "$ROOT"',
    '',
  ].join('\n'));
  fs.chmodSync(launcher, 0o755);
}
const size = fs.statSync(path.join(installedRuntime, nodeName)).size;
console.log(JSON.stringify({ platform, architecture: process.arch, output: root,
  bundledNodeBytes: size, cliFile: path.join(appDir, 'index.js') }));
