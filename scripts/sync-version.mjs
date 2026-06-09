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

// 每个目标文件：路径 + 一个就地更新版本号字段的函数
const targets = [
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

const changed = [];
for (const { file, update } of targets) {
  const path = join(rootDir, file);
  const data = readJson(path);
  const before = JSON.stringify(data);
  update(data);
  if (JSON.stringify(data) !== before) {
    writeJson(path, data);
    changed.push(file);
  }
}

if (changed.length > 0) {
  console.log(`[sync-version] 同步到 ${version}: ${changed.join(', ')}`);
} else {
  console.log(`[sync-version] 已是 ${version}，无需更新`);
}
