import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';

// This records the source actually compiled into the published runtime, not
// the Git HEAD of whichever user project later loads the MCP package. A
// source archive without .git remains usable but is visibly unidentifiable.
let buildCommit = process.env.GITHUB_SHA ?? '';
let buildDirty = null;
if (!/^[0-9a-f]{7,40}$/i.test(buildCommit)) {
  try {
    buildCommit = execFileSync('git', ['rev-parse', 'HEAD'],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { buildCommit = ''; }
}
try {
  buildDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'],
    { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0;
} catch { /* Source archives without Git cannot prove clean source provenance. */ }
const builtAt = new Date().toISOString();

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'build/index.js',
  define: {
    __MCP_BUILD_COMMIT__: JSON.stringify(buildCommit || null),
    __MCP_BUILD_TIME__: JSON.stringify(builtAt),
    __MCP_BUILD_DIRTY__: JSON.stringify(buildDirty),
  },
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  sourcemap: false,
  legalComments: 'none',
});
