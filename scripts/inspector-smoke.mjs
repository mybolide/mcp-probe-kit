import { spawnSync } from 'node:child_process';

const inspectorVersion = '2.0.0';
const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : 'npm';
const args = npmExecPath
  ? [
      npmExecPath,
      'exec',
      '--yes',
      `--package=@modelcontextprotocol/inspector@${inspectorVersion}`,
      '--',
      'mcp-inspector',
      '--cli',
      process.execPath,
      'build/index.js',
      '--method',
      'tools/list',
    ]
  : [
      'exec',
      '--yes',
      `--package=@modelcontextprotocol/inspector@${inspectorVersion}`,
      '--',
      'mcp-inspector',
      '--cli',
      process.execPath,
      'build/index.js',
      '--method',
      'tools/list',
    ];

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  windowsHide: true,
  env: {
    ...process.env,
    MCP_PROTOCOL_MODE: 'auto',
    MCP_ENABLE_GITNEXUS_BRIDGE: '0',
  },
  maxBuffer: 20 * 1024 * 1024,
});

if (result.status !== 0) {
  throw new Error([
    `MCP Inspector ${inspectorVersion} failed with status ${result.status}`,
    result.error?.message,
    result.stdout,
    result.stderr,
  ].filter(Boolean).join('\n'));
}

const payload = JSON.parse(result.stdout);
const tools = Array.isArray(payload.tools) ? payload.tools : [];
const names = tools.map((tool) => tool.name);
for (const required of ['workflow', 'start_feature', 'plan_heartbeat', 'resume_plan', 'converge']) {
  if (!names.includes(required)) throw new Error(`Inspector tools/list missing ${required}`);
}
if (tools.length !== 33) throw new Error(`Inspector tools/list returned ${tools.length}, expected 33`);

console.log(JSON.stringify({
  passed: true,
  inspectorVersion,
  tools: tools.length,
  coreTools: ['workflow', 'start_feature', 'plan_heartbeat', 'resume_plan', 'converge'],
  serverStarted: result.stderr.includes('v4-sdk2-dual-era-20260730'),
}, null, 2));
