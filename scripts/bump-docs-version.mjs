#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const versionPatterns = [
  [/v3\.6\.2/g, 'v3.6.3'],
  [/MCP Probe Kit v3\.6\.2/g, 'MCP Probe Kit v3.6.3'],
  [/"version": "v3\.6\.2"/g, '"version": "v3.6.3"'],
];

const toolPatterns = [
  [/30 tools/g, '33 tools'],
  [/30 Tools/g, '33 Tools'],
  [/30 outils/g, '33 outils'],
  [/30 Outils/g, '33 Outils'],
  [/30 herramientas/g, '33 herramientas'],
  [/30 Herramientas/g, '33 Herramientas'],
  [/30 ferramentas/g, '33 ferramentas'],
  [/30 Ferramentas/g, '33 Ferramentas'],
  [/30 个工具/g, '33 个工具'],
  [/30个工具/g, '33个工具'],
  [/30개 도구/g, '33개 도구'],
  [/30個のツール/g, '33個のツール'],
  [/30のツール/g, '33のツール'],
  [/30ツール/g, '33ツール'],
  [/currently 30 tools/g, 'currently 33 tools'],
  [/当前提供 30 个工具/g, '当前提供 33 个工具'],
  [/\(currently 30 tools\)/g, '(currently 33 tools)'],
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
