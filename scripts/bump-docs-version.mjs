#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const versionPatterns = [
  [/v3\.6\.1/g, 'v3.6.2'],
  [/MCP Probe Kit v3\.6\.1/g, 'MCP Probe Kit v3.6.2'],
  [/"version": "v3\.6\.1"/g, '"version": "v3.6.2"'],
];

const toolPatterns = [
  [/29 tools/g, '30 tools'],
  [/29 Tools/g, '30 Tools'],
  [/29 outils/g, '30 outils'],
  [/29 Outils/g, '30 Outils'],
  [/29 herramientas/g, '30 herramientas'],
  [/29 Herramientas/g, '30 Herramientas'],
  [/29 ferramentas/g, '30 ferramentas'],
  [/29 Ferramentas/g, '30 Ferramentas'],
  [/29 个工具/g, '30 个工具'],
  [/29个工具/g, '30个工具'],
  [/29 个/g, '30 个'],
  [/29个/g, '30个'],
  [/29개 도구/g, '30개 도구'],
  [/29개 AI/g, '30개 AI'],
  [/29개/g, '30개'],
  [/29個/g, '30個'],
  [/29ツール/g, '30ツール'],
  [/29の/g, '30の'],
  [/29 AI/g, '30 AI'],
  [/currently 29 tools/g, 'currently 30 tools'],
  [/当前 29 个/g, '当前 30 个'],
  [/当前提供 29 个工具/g, '当前提供 30 个工具'],
  [/（当前 29 个）/g, '（当前 30 个）'],
  [/\(currently 29 tools\)/g, '(currently 30 tools)'],
  [/6 workflow orchestration tools/g, '1 workflow guide + 6 orchestration tools'],
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (['node_modules', 'build', '.git'].includes(name)) continue;
      walk(p, acc);
    } else if (/\.(md|json|html)$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

const files = ['docs', 'i18n'].flatMap((d) => walk(join(root, d)));
let changed = 0;
for (const file of files) {
  let text = readFileSync(file, 'utf8');
  const before = text;
  for (const [re, rep] of versionPatterns) text = text.replace(re, rep);
  for (const [re, rep] of toolPatterns) text = text.replace(re, rep);
  if (text !== before) {
    writeFileSync(file, text, 'utf8');
    changed++;
    console.log('updated:', file.slice(root.length + 1));
  }
}
console.log(`total files updated: ${changed}`);
