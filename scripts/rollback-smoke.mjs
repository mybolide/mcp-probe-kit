import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const rollbackVersion = process.env.MCP_ROLLBACK_VERSION || '3.7.0';
const npmExecPath = process.env.npm_execpath;
const tempRoot = await mkdtemp(join(tmpdir(), 'mcp-rollback-smoke-'));

try {
  await mkdir(tempRoot, { recursive: true });
  await writeFile(
    join(tempRoot, 'package.json'),
    JSON.stringify({ name: 'mcp-probe-rollback-smoke', private: true }, null, 2) + '\n',
    'utf8'
  );
  runNpm([
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--prefer-online',
    `mcp-probe-kit@${rollbackVersion}`,
  ], tempRoot);

  const packagePath = join(tempRoot, 'node_modules', 'mcp-probe-kit', 'package.json');
  const installedPackage = JSON.parse(await readFile(packagePath, 'utf8'));
  assert(installedPackage.version === rollbackVersion, `rollback installed ${installedPackage.version}`);

  const serverPath = join(tempRoot, 'node_modules', 'mcp-probe-kit', 'build', 'index.js');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: tempRoot,
    env: {
      ...process.env,
      MCP_ENABLE_GITNEXUS_BRIDGE: '0',
      MCP_PROJECT_ROOT: tempRoot,
    },
    stderr: 'pipe',
  });
  let stderrText = '';
  transport.stderr?.on('data', (chunk) => { stderrText += chunk.toString(); });
  const client = new Client(
    { name: 'rollback-v3-client', version: '1.0.0' },
    { capabilities: {} }
  );
  client.setVersionNegotiation({ mode: 'legacy' });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    assert(names.includes('start_feature'), 'rollback package missing start_feature');
    assert(names.includes('start_bugfix'), 'rollback package missing start_bugfix');
    assert(names.includes('check_spec'), 'rollback package missing check_spec');
    assert(names.length >= 30, `rollback package exposed only ${names.length} tools`);

    console.log(JSON.stringify({
      passed: true,
      rollbackVersion,
      clientEra: client.getProtocolEra(),
      tools: names.length,
      coreTools: ['start_feature', 'start_bugfix', 'check_spec'].filter((name) => names.includes(name)),
      serverOutputObserved: stderrText.length > 0,
    }, null, 2));
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function runNpm(args, cwd) {
  const command = npmExecPath ? process.execPath : 'npm';
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error([
      `npm ${args.join(' ')} failed with status ${result.status}`,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
