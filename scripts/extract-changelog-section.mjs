#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 提取指定版本的 Release Notes。
 * 用法: node scripts/extract-changelog-section.mjs v3.6.0
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawTag = process.argv[2]?.trim();

if (!rawTag) {
  console.error("用法: node scripts/extract-changelog-section.mjs <tag|version>");
  console.error("示例: node scripts/extract-changelog-section.mjs v3.6.0");
  process.exit(1);
}

const version = rawTag.replace(/^v/i, "");
const changelogPath = join(rootDir, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const header = `## [${version}]`;
const start = changelog.indexOf(header);

if (start === -1) {
  console.error(`[extract-changelog-section] CHANGELOG 中未找到 ${header}`);
  process.exit(1);
}

const lineEnd = changelog.indexOf("\n", start);
const bodyStart = lineEnd === -1 ? start + header.length : lineEnd + 1;
const nextSection = changelog.indexOf("\n## [", bodyStart);
const section = changelog.slice(bodyStart, nextSection === -1 ? undefined : nextSection).trim();

const notes = `${section}

---

## 📦 Installation

\`\`\`bash
npm install -g mcp-probe-kit@${version}
# or
npx mcp-probe-kit@${version}
\`\`\`

## 📚 Documentation

- [README](https://github.com/mybolide/mcp-probe-kit#readme)
- [CHANGELOG](https://github.com/mybolide/mcp-probe-kit/blob/main/CHANGELOG.md)
`;

process.stdout.write(notes);
