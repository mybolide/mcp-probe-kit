import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  COMPACT_TOOL_COUNT,
  FULL_TOOL_COUNT,
  PACKAGE_VERSION,
} from './release-surface.mjs';

const inspectorVersion = '2.0.0';
const toolManifest = JSON.parse(readFileSync('tools-manifest.json', 'utf8'));
const registeredAppOnly = toolManifest.toolsets?.appOnly?.tools ?? [];
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
assert(
  registeredAppOnly.length === 1 && registeredAppOnly[0] === 'list_memory_assets',
  `manifest app-only registry mismatch: ${JSON.stringify(registeredAppOnly)}`,
);
for (const surface of [compact, full]) {
  assert(
    surface.appOnlyNames.length === 0,
    `${surface.toolset} tools/list leaked app-only actions: ${surface.appOnlyNames.join(', ')}`,
  );
  assert(
    !surface.rawNames.includes('list_memory_assets'),
    `${surface.toolset} tools/list exposed list_memory_assets to the model/client surface`,
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
  registeredAppOnly,
  coreTools: [
    'workflow',
    'start_feature',
    'start_product',
    'gencommit',
    'plan_heartbeat',
    'resume_plan',
    'converge',
  ],
  serverStarted: compact.stderr.includes(`MCP Probe Kit v${PACKAGE_VERSION} 已启动`),
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
    tools.length === expectedModelCount,
    `Inspector ${toolset} raw surface returned ${tools.length}, expected model-only ${expectedModelCount}`,
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
