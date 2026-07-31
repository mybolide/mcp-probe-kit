#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = packageJson.version;

const versionPatterns = [
  [/mcp-probe-kit@4\.0\.0-rc\.\d+/g, `mcp-probe-kit@${version}`],
  [/MCP Probe Kit v4\.0\.0-rc\.\d+/g, `MCP Probe Kit v${version}`],
  [/"version": "4\.0\.0-rc\.\d+"/g, `"version": "${version}"`],
];

function walk(directory, files = []) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (['node_modules', 'build', '.git', 'history-session'].includes(name)) continue;
      walk(path, files);
    } else if (/\.(md|json|html)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

const files = ['docs', 'i18n']
  .map((directory) => join(root, directory))
  .filter((directory) => statSync(directory).isDirectory())
  .flatMap((directory) => walk(directory));

let changed = 0;
for (const file of files) {
  let text = readFileSync(file, 'utf8');
  const before = text;
  for (const [pattern, replacement] of versionPatterns) {
    text = text.replace(pattern, replacement);
  }
  if (text === before) continue;
  writeFileSync(file, text, 'utf8');
  changed += 1;
  console.log('updated:', file.slice(root.length + 1));
}

console.log(`documentation version: ${version}; files updated: ${changed}`);
console.log('tool-surface counts are generated from tools-manifest.json and are not rewritten here.');
