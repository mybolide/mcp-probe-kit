import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { COMPACT_TOOL_COUNT, PACKAGE_VERSION } from './release-surface.mjs';

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
  const packResult = parseNpmPackJson(packed.stdout);
  const artifact = packResult[0];
  assert(artifact?.filename, 'npm pack did not return a filename');
  assert(artifact.version === PACKAGE_VERSION, `unexpected packed version: ${artifact.version}`);
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
  assert(installedPackage.version === PACKAGE_VERSION, 'installed package version mismatch');

  const installedNodeModules = join(consumerDir, 'node_modules');
  for (const entry of await readdir(installedNodeModules, { withFileTypes: true })) {
    if (entry.name === 'mcp-probe-kit') continue;
    await rm(join(installedNodeModules, entry.name), { recursive: true, force: true });
  }
  const remainingRuntimeEntries = await readdir(installedNodeModules);
  assert(
    !remainingRuntimeEntries.includes('@modelcontextprotocol'),
    'standalone smoke must run without installed MCP SDK dependencies'
  );


  const serverPath = join(
    consumerDir,
    'node_modules',
    'mcp-probe-kit',
    'build',
    'index.js'
  );
  const cliProjectDir = join(tempRoot, 'cli-project');
  await mkdir(cliProjectDir, { recursive: true });
  await writeFile(
    join(cliProjectDir, 'package.json'),
    JSON.stringify({ name: 'mcp-probe-cli-smoke', private: true }, null, 2) + '\n',
    'utf8'
  );
  const cliResult = spawnSync(
    process.execPath,
    [serverPath, 'exec', 'workflow', '--stdin'],
    {
      cwd: cliProjectDir,
      input: JSON.stringify({
        intent: 'Verify the packed CLI fallback routes a feature request',
        scenario: 'feature',
        project_root: cliProjectDir,
      }),
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        MCP_ENABLE_GITNEXUS_BRIDGE: '0',
        MEMORY_QDRANT_URL: '',
        MEMORY_EMBEDDING_URL: '',
        MEMORY_EMBEDDING_MODEL: '',
      },
    }
  );
  assert(
    cliResult.status === 0,
    `packed CLI failed: ${cliResult.stderr || cliResult.stdout}`
  );
  const cliPayload = JSON.parse(cliResult.stdout);
  assert(cliPayload.ok === true, 'packed CLI returned ok=false');
  assert(
    cliPayload.structuredContent?.firstTool === 'start_feature',
    'packed CLI routing mismatch'
  );
  assert(
    cliPayload.runtime?.versionAligned === true,
    'packed CLI runtime versions are not aligned'
  );
  const cliManifest = JSON.parse(
    await readFile(join(cliProjectDir, '.mcp-probe-kit', 'runtime.json'), 'utf8')
  );
  assert(cliManifest.version === PACKAGE_VERSION, 'packed CLI manifest version mismatch');
  const cliPowerShellWrapper = await readFile(
    join(cliProjectDir, '.mcp-probe-kit', 'bin', 'probe.ps1'),
    'utf8'
  );
  assert(
    cliPowerShellWrapper.includes(`mcp-probe-kit@${PACKAGE_VERSION}`),
    'packed CLI wrapper is not pinned to the package version'
  );
  const cliShellWrapperPath = join(cliProjectDir, '.mcp-probe-kit', 'bin', 'probe');
  const cliShellWrapper = await readFile(cliShellWrapperPath, 'utf8');
  assert(cliShellWrapper.startsWith('#!/usr/bin/env sh'), 'packed Unix CLI wrapper lacks a POSIX shebang');
  assert(
    cliShellWrapper.includes(`mcp-probe-kit@${PACKAGE_VERSION}`),
    'packed Unix CLI wrapper is not pinned to the package version'
  );
  assert(cliShellWrapper.includes('"$@"'), 'packed Unix CLI wrapper does not preserve arguments');

  let cliUnixWrapperExecuted = null;
  if (process.platform !== 'win32') {
    const shellStat = await stat(cliShellWrapperPath);
    assert((shellStat.mode & 0o111) !== 0, 'packed Unix CLI wrapper is not executable');
    const syntaxResult = spawnSync('sh', ['-n', cliShellWrapperPath], {
      cwd: cliProjectDir,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert(
      syntaxResult.status === 0,
      `packed Unix CLI wrapper syntax failed: ${syntaxResult.stderr || syntaxResult.stdout}`
    );

    const fakeBin = join(tempRoot, 'fake-bin');
    const fakeNpx = join(fakeBin, 'npx');
    const capturePath = join(tempRoot, 'unix-wrapper-args.txt');
    await mkdir(fakeBin, { recursive: true });
    await writeFile(
      fakeNpx,
      '#!/usr/bin/env sh\nprintf "%s\n" "$@" > "$MCP_PROBE_WRAPPER_CAPTURE"\n',
      'utf8'
    );
    await chmod(fakeNpx, 0o755);
    const wrapperResult = spawnSync(
      cliShellWrapperPath,
      ['status', '--project-root', '.'],
      {
        cwd: cliProjectDir,
        encoding: 'utf8',
        windowsHide: true,
        env: {
          ...process.env,
          PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
          MCP_PROBE_WRAPPER_CAPTURE: capturePath,
          MCP_PROBE_NPX_CACHE: join(tempRoot, 'unix-wrapper-cache'),
        },
      }
    );
    assert(
      wrapperResult.status === 0,
      `packed Unix CLI wrapper execution failed: ${wrapperResult.stderr || wrapperResult.stdout}`
    );
    const capturedArgs = (await readFile(capturePath, 'utf8')).trim().split(/\r?\n/);
    assert(capturedArgs.includes('--yes'), 'packed Unix CLI wrapper omitted --yes');
    assert(capturedArgs.includes('--cache'), 'packed Unix CLI wrapper omitted --cache');
    assert(
      capturedArgs.includes(`mcp-probe-kit@${PACKAGE_VERSION}`),
      'packed Unix CLI wrapper executed a different package version'
    );
    assert(capturedArgs.includes('status'), 'packed Unix CLI wrapper did not forward the command');
    cliUnixWrapperExecuted = true;
  }
  const cliPlanId = 'feature-packed-cli-lifecycle';
  const cliPlan = {
    planId: cliPlanId,
    mode: 'delegated',
    contractVersion: '2.0.0',
    workflow: 'feature',
    workflowVersion: '4.0.0',
    objective: 'Verify plan state survives separate packed CLI processes',
    steps: [{ id: 'done', action: 'verify', type: 'agent_action' }],
    globalRules: [],
    completionCriteria: ['All evidence is present'],
    memoryPolicy: {
      recallBeforeExecution: true,
      extractAfterValidation: true,
      writeOnlyReusableKnowledge: true,
      allowNegativeMemory: true,
    },
    executionStatePolicy: {
      heartbeatTool: 'plan_heartbeat',
      resumeTool: 'resume_plan',
      convergenceTool: 'converge',
      heartbeatAfterEachStep: true,
      persistPlanOnFirstHeartbeat: true,
    },
  };
  const heartbeatPayload = runPackedCli(serverPath, cliProjectDir, 'plan_heartbeat', {
    plan_id: cliPlanId,
    project_root: cliProjectDir,
    plan: cliPlan,
    completed_step_ids: ['done'],
    evidence: [
      { kind: 'requirements', summary: 'Scope confirmed' },
      { kind: 'spec', summary: 'Spec confirmed', reference: 'docs/specs/demo' },
      { kind: 'implementation', summary: 'Implementation completed', revision: 'abc123' },
      { kind: 'test', summary: 'Tests passed', reference: 'npm test' },
      { kind: 'review', summary: 'Review passed', reference: 'review-1' },
    ],
  });
  assert(heartbeatPayload.structuredContent?.stored === true, 'packed CLI heartbeat failed');
  const resumePayload = runPackedCli(serverPath, cliProjectDir, 'resume_plan', {
    plan_id: cliPlanId,
    project_root: cliProjectDir,
  });
  assert(resumePayload.structuredContent?.found === true, 'packed CLI resume failed');
  assert(
    resumePayload.structuredContent?.readyStepIds?.length === 0,
    'packed CLI resume lost completed plan state'
  );
  const convergePayload = runPackedCli(serverPath, cliProjectDir, 'converge', {
    plan_id: cliPlanId,
    project_root: cliProjectDir,
  });
  assert(convergePayload.structuredContent?.passed === true, 'packed CLI converge failed');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: consumerDir,
    env: {
      ...process.env,
      MCP_PROTOCOL_MODE: 'auto',
      MCP_ENABLE_GITNEXUS_BRIDGE: '0',
      MCP_TOOLSET: 'compact',
      MEMORY_QDRANT_URL: '',
      MEMORY_EMBEDDING_URL: '',
      MEMORY_EMBEDDING_MODEL: '',
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
    assert(
      tools.tools.length === COMPACT_TOOL_COUNT,
      `packed server exposed ${tools.tools.length} tools, expected ${COMPACT_TOOL_COUNT}`
    );
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
      cliFirstTool: cliPayload.structuredContent?.firstTool,
      cliVersionAligned: cliPayload.runtime?.versionAligned,
      cliWrapperPinned: cliPowerShellWrapper.includes(`mcp-probe-kit@${PACKAGE_VERSION}`),
      cliUnixWrapperPinned: cliShellWrapper.includes(`mcp-probe-kit@${PACKAGE_VERSION}`),
      cliUnixWrapperExecuted,
      cliPlanLifecycle: {
        heartbeatStored: heartbeatPayload.structuredContent?.stored,
        resumeFound: resumePayload.structuredContent?.found,
        converged: convergePayload.structuredContent?.passed,
      },
      started: stderrText.includes(`MCP Probe Kit v${PACKAGE_VERSION} 已启动`),
    }, null, 2));
  } catch (error) {
    throw new Error([
      error instanceof Error ? error.stack || error.message : String(error),
      stderrText ? 'server stderr:\n' + stderrText : '',
    ].filter(Boolean).join('\n'));
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}



function runPackedCli(serverPath, cwd, tool, input) {
  const result = spawnSync(
    process.execPath,
    [serverPath, 'exec', tool, '--stdin'],
    {
      cwd,
      input: JSON.stringify(input),
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        MCP_ENABLE_GITNEXUS_BRIDGE: '0',
        MEMORY_QDRANT_URL: '',
        MEMORY_EMBEDDING_URL: '',
        MEMORY_EMBEDDING_MODEL: '',
      },
    }
  );
  assert(
    result.status === 0,
    `packed CLI ${tool} failed: ${result.stderr || result.stdout}`
  );
  const payload = JSON.parse(result.stdout);
  assert(payload.ok === true, `packed CLI ${tool} returned ok=false`);
  return payload;
}

function parseNpmPackJson(output) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/(?:^|\r?\n)(\[\s*\{[\s\S]*\])$/);
    if (!match) {
      throw new Error(`npm pack did not return parseable JSON:\n${trimmed}`);
    }
    return JSON.parse(match[1]);
  }
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
