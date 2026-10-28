/** Real isolated SQLite v5 functional check. No v4 file Spec creation. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runV5DevControlTool } from '../src/devcontrol/model-tool.js';
import { MCP_APP_RESOURCES } from '../src/lib/mcp-apps.js';
import { listToolDefinitions } from '../src/server/tool-registry.js';
const root = mkdtempSync(join(tmpdir(), 'mcp-v5-functional-'));
try {
  execFileSync('git', ['init', '-q', root], { timeout: 3000, windowsHide: true });
  for (const action of ['onboard', 'next', 'list', 'idea-list']) {
    const result = await runV5DevControlTool({ action, project_root: root, input: {} });
    if (result.isError) throw Error(`DevControl ${action} failed: ${JSON.stringify(result.structuredContent)}`);
  }
  const names = listToolDefinitions().map(({ name }) => name);
  if (!names.includes('devcontrol') || names.includes('resume_plan')
    || names.includes('start_feature') || names.includes('converge')) {
    throw Error('v4 workflow unexpectedly visible through current v5 Registry');
  }
  if (MCP_APP_RESOURCES.length !== 2 || !MCP_APP_RESOURCES.some((r) => r.kind === 'devcontrol-workbench')) {
    throw Error('v5 App resource list is not SQLite DevControl + Memory');
  }
  console.log(JSON.stringify({
    passed: true, version: '5.0.0', sqlite: true, toolCount: names.length,
    resources: MCP_APP_RESOURCES.map(({ uri }) => uri), disposableGitProject: true,
  }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
