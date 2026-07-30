import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const npmExecPath = process.env.npm_execpath;
const root = process.cwd();
const tempRoot = await mkdtemp(join(tmpdir(), 'mcp-package-smoke-'));
const packDir = join(tempRoot, 'pack');
const consumerDir = join(tempRoot, 'consumer');

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, 'package.json'),
    JSON.stringify({ name: 'mcp-probe-package-smoke', private: true }, null, 2) + '\n',
    'utf8'
  );

  const packed = runNpm(
    ['pack', '--json', '--ignore-scripts', '--pack-destination', packDir],
    root
  );
  const packResult = JSON.parse(packed.stdout);
  const artifact = packResult[0];
  assert(artifact?.filename, 'npm pack did not return a filename');
  assert(artifact.version === '4.0.0-rc.1', `unexpected packed version: ${artifact.version}`);
  assert(
    artifact.files?.some((file) => file.path === 'build/index.js'),
    'packed artifact is missing build/index.js'
  );
  assert(
    !artifact.files?.some((file) => file.path.includes('__tests__') || file.path.endsWith('.test.js')),
    'packed artifact contains test files'
  );

  const tarballPath = resolve(packDir, basename(artifact.filename));
  runNpm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--prefer-offline',
      tarballPath,
    ],
    consumerDir
  );

  const installedPackagePath = join(
    consumerDir,
    'node_modules',
    'mcp-probe-kit',
    'package.json'
  );
  const installedPackage = JSON.parse(await readFile(installedPackagePath, 'utf8'));
  assert(installedPackage.version === '4.0.0-rc.1', 'installed package version mismatch');

  const serverPath = join(
    consumerDir,
    'node_modules',
    'mcp-probe-kit',
    'build',
    'index.js'
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: consumerDir,
    env: {
      ...process.env,
      MCP_PROTOCOL_MODE: 'auto',
      MCP_ENABLE_GITNEXUS_BRIDGE: '0',
    },
    stderr: 'pipe',
  });
  let stderrText = '';
  transport.stderr?.on('data', (chunk) => {
    stderrText += chunk.toString();
  });
  const client = new Client(
    { name: 'packed-rc-consumer', version: '1.0.0' },
    { capabilities: {} }
  );
  client.setVersionNegotiation({ mode: { pin: '2026-07-28' } });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert(tools.tools.length === 33, `packed server exposed ${tools.tools.length} tools`);
    const routed = await client.callTool({
      name: 'workflow',
      arguments: {
        intent: '开发并验证 MCP Probe Kit v4 RC 发布候选，覆盖双协议、Agent Evals 和发布渠道保护',
        scenario: 'auto',
        project_root: consumerDir,
      },
    });
    assert(routed.structuredContent?.firstTool === 'start_feature', 'packed server routing mismatch');

    console.log(JSON.stringify({
      version: installedPackage.version,
      tarball: artifact.filename,
      packedEntries: artifact.entryCount,
      packedSize: artifact.size,
      clientEra: client.getProtocolEra(),
      tools: tools.tools.length,
      firstTool: routed.structuredContent?.firstTool,
      started: stderrText.includes('v4-sdk2-dual-era-20260730'),
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
