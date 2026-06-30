#!/usr/bin/env node
// 以 package.json 的 version 为唯一真相源，同步到其他静态文件。
// 由 prebuild 自动调用，避免手动改版本时遗漏。

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));
const writeJson = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8');

const pkgPath = join(rootDir, 'package.json');
const version = readJson(pkgPath).version;
const displayVersion = `v${version}`;

// 每个目标文件：路径 + 一个就地更新版本号字段的函数
const jsonTargets = [
  {
    file: 'tools-manifest.json',
    update: (data) => {
      data.version = version;
      if (data.structuredOutput) data.structuredOutput.version = version;
    },
  },
  {
    file: 'server.json',
    update: (data) => {
      data.version = version;
      if (Array.isArray(data.packages)) {
        for (const p of data.packages) p.version = version;
      }
    },
  },
];

const docTextTargets = [
  'docs/i18n/en.json',
  'docs/i18n/zh-CN.json',
  'docs/i18n/ja.json',
  'docs/i18n/ko.json',
  'docs/index.html',
  'docs/pages/getting-started.html',
  'docs/pages/all-tools.html',
  'docs/pages/examples.html',
  'docs/pages/migration.html',
];

/** 文档中的产品版本号（v3.x.y），不影响端口号等其它数字 */
function bumpProductVersionInText(content) {
  return content.replace(/v3\.\d+\.\d+/g, displayVersion);
}

const changed = [];

for (const { file, update } of jsonTargets) {
  const path = join(rootDir, file);
  const data = readJson(path);
  const before = JSON.stringify(data);
  update(data);
  if (JSON.stringify(data) !== before) {
    writeJson(path, data);
    changed.push(file);
  }
}

for (const rel of docTextTargets) {
  const path = join(rootDir, rel);
  const before = readFileSync(path, 'utf-8');
  const after = bumpProductVersionInText(before);
  if (after !== before) {
    writeFileSync(path, after, 'utf-8');
    changed.push(rel);
  }
}

if (changed.length > 0) {
  console.log(`[sync-version] 同步到 ${version}: ${changed.join(', ')}`);
} else {
  console.log(`[sync-version] 已是 ${version}，无需更新`);
}
