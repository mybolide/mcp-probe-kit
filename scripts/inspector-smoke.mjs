import { spawnSync } from 'node:child_process';
import {
  COMPACT_TOOL_COUNT,
  FULL_TOOL_COUNT,
} from './release-surface.mjs';

const inspectorVersion = '2.0.0';
const compact = runInspector('compact', COMPACT_TOOL_COUNT);
const full = runInspector('full', FULL_TOOL_COUNT);

for (const required of [
  'workflow',
  'start_feature',
  'start_product',
  'gencommit',
  'plan_heartbeat',
  'resume_plan',
  'converge',
]) {
  assert(compact.modelNames.includes(required), `compact tools/list missing ${required}`);
}
for (const hidden of ['add_feature', 'fix_bug', 'sync_ui_data', 'ask_user']) {
  assert(
    !compact.modelNames.includes(hidden),
    `compact model surface unexpectedly includes ${hidden}`,
  );
  assert(
    full.modelNames.includes(hidden),
    `full compatibility model surface missing ${hidden}`,
  );
}
for (const surface of [compact, full]) {
  assert(
    surface.appOnlyNames.includes('list_memory_assets'),
    `${surface.toolset} Inspector surface is missing list_memory_assets app-only action`,
  );
}

console.log(JSON.stringify({
  passed: true,
  inspectorVersion,
  compact: {
    rawTools: compact.rawNames.length,
    modelTools: compact.modelNames.length,
    appOnlyTools: compact.appOnlyNames,
  },
  full: {
    rawTools: full.rawNames.length,
    modelTools: full.modelNames.length,
    appOnlyTools: full.appOnlyNames,
  },
  coreTools: [
    'workflow',
    'start_feature',
    'start_product',
    'gencommit',
    'plan_heartbeat',
    'resume_plan',
    'converge',
  ],
  serverStarted: compact.stderr.includes('v4-sdk2-dual-era-20260730'),
}, null, 2));

function runInspector(toolset, expectedModelCount) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : 'npm';
  const inspectorArgs = [
    'mcp-inspector',
    '--cli',
    process.execPath,
    'build/index.js',
    '--method',
    'tools/list',
    '-e',
    'MCP_PROTOCOL_MODE=auto',
    '-e',
    'MCP_ENABLE_GITNEXUS_BRIDGE=0',
    '-e',
    `MCP_TOOLSET=${toolset}`,
  ];
  const args = npmExecPath
    ? [
        npmExecPath,
        'exec',
        '--yes',
        `--package=@modelcontextprotocol/inspector@${inspectorVersion}`,
        '--',
        ...inspectorArgs,
      ]
    : [
        'exec',
        '--yes',
        `--package=@modelcontextprotocol/inspector@${inspectorVersion}`,
        '--',
        ...inspectorArgs,
      ];

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error([
      `MCP Inspector ${inspectorVersion} (${toolset}) failed with status ${result.status}`,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }

  const payload = JSON.parse(result.stdout);
  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  const modelTools = tools.filter(isModelVisible);
  const appOnlyTools = tools.filter(isAppOnly);

  assert(
    modelTools.length === expectedModelCount,
    `Inspector ${toolset} model surface returned ${modelTools.length}, expected ${expectedModelCount}`,
  );
  assert(
    appOnlyTools.length === 1,
    `Inspector ${toolset} returned ${appOnlyTools.length} app-only actions, expected 1`,
  );
  assert(
    tools.length === expectedModelCount + appOnlyTools.length,
    `Inspector ${toolset} raw surface returned ${tools.length}, expected ${expectedModelCount + appOnlyTools.length}`,
  );

  return {
    toolset,
    rawNames: tools.map((tool) => tool.name),
    modelNames: modelTools.map((tool) => tool.name),
    appOnlyNames: appOnlyTools.map((tool) => tool.name),
    stderr: result.stderr,
  };
}

function getVisibility(tool) {
  const visibility = tool?._meta?.ui?.visibility;
  return Array.isArray(visibility) ? visibility : undefined;
}

function isModelVisible(tool) {
  const visibility = getVisibility(tool);
  return !visibility || visibility.includes('model');
}

function isAppOnly(tool) {
  const visibility = getVisibility(tool);
  return Boolean(visibility?.includes('app') && !visibility.includes('model'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
