import { readFileSync } from 'node:fs';

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

const packageJson = readJson('../package.json');
const manifest = readJson('../tools-manifest.json');

export const PACKAGE_VERSION = packageJson.version;
export const COMPACT_TOOL_COUNT = manifest.toolsets?.compact?.count ?? 24;
export const COMPACT_WITH_MEMORY_TOOL_COUNT =
  manifest.toolsets?.compactWithMemory?.count ?? 30;
export const MEMORY_CONDITIONAL_TOOL_COUNT =
  manifest.toolsets?.memoryConditional?.count ?? 6;
export const APP_ONLY_TOOL_COUNT = manifest.toolsets?.appOnly?.count ?? 1;
export const FULL_TOOL_COUNT = manifest.toolsets?.full?.count ?? manifest.totalTools ?? 34;
