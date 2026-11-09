/** Validate the exact frozen v5 package as a standalone consumer would.
 * This never rebuilds source, publishes npm, or touches a real project.
 * Its only task/feature writes occur in disposable Git fixtures. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { create as createTar } from 'tar';
import { COMPACT_WITH_HISTORY_TOOL_COUNT, PACKAGE_VERSION } from './release-surface.mjs';
import { runBoundedCommand } from './lib/bounded-command.mjs';

const temp = await mkdtemp(join(tmpdir(), 'mcp-v5-package-smoke-'));
const root = process.cwd();
const frozenPath = join(root, 'build', 'index.js');
const frozen = await fingerprint(frozenPath);
let client, transport;
const check = (value, message) => { if (!value) throw Error(message); };

function run(program, args, options = {}) {
  const result = runBoundedCommand(program, args, {
    encoding: 'utf8', windowsHide: true, timeout: 45_000, ...options,
  });
  check(result.status === 0,
    `${program} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout || result.error?.message}`);
  return result.stdout;
}

function npmInstall(tarball, cwd) {
  const npmPath = process.env.npm_execpath;
  const program = npmPath ? process.execPath : 'npm';
  const args = npmPath ? [npmPath] : [];
  return run(program, [...args, 'install', '--ignore-scripts', '--no-audit',
    '--no-fund', '--prefer-offline', tarball], { cwd, timeout: 90_000 });
}

function cli(serverPath, projectRoot, action, input) {
  const stdout = run(process.execPath, [serverPath, 'exec', 'devcontrol', '--stdin'], {
    cwd: projectRoot,
    input: JSON.stringify({ action, project_root: projectRoot, input }),
    timeout: 30_000,
    env: { ...process.env, MCP_DEVCONTROL_AUTOSTART: '0',
      MCP_ENABLE_GITNEXUS_BRIDGE: '0', MEMORY_QDRANT_URL: '',
      MEMORY_EMBEDDING_URL: '', MEMORY_EMBEDDING_MODEL: '' },
  });
  const payload = JSON.parse(stdout);
  check(payload.ok === true && payload.structuredContent,
    `Installed v5 CLI ${action} did not return a structured success`);
  check(payload.runtime?.versionAligned === true,
    'Installed v5 CLI runtime is not version-aligned');
  return payload;
}

async function fingerprint(filename) {
  const [bytes, info] = await Promise.all([readFile(filename), stat(filename)]);
  return { size: info.size, mtime: info.mtimeMs,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function unchanged(stage) {
  const current = await fingerprint(frozenPath);
  check(current.sha256 === frozen.sha256 && current.size === frozen.size &&
    current.mtime === frozen.mtime, `Frozen build was modified ${stage}`);
}

try {
  const staging = join(temp, 'staging');
  const pack = join(temp, 'pack');
  const consumer = join(temp, 'consumer');
  const project = join(temp, 'project');
  await mkdir(join(staging, 'build', 'resources'), { recursive: true });
  await mkdir(pack, { recursive: true });
  await mkdir(consumer, { recursive: true });
  await mkdir(project, { recursive: true });
  for (const name of ['package.json', 'README.md', 'LICENSE'])
    await cp(join(root, name), join(staging, name));
  await cp(frozenPath, join(staging, 'build', 'index.js'));
  await cp(join(root, 'build', 'resources', 'ui-ux-data'),
    join(staging, 'build', 'resources', 'ui-ux-data'), { recursive: true });

  // A frozen candidate must be installed exactly as reviewed; neither npm
  // prepare nor any script may silently change its compiled bytes.
  const name = `mcp-probe-kit-${PACKAGE_VERSION}.tgz`;
  const tarball = join(pack, name);
  await createTar({gzip: true, cwd: staging, file: tarball,
    prefix: 'package/', portable: true},
  ['package.json', 'README.md', 'LICENSE', 'build/index.js', 'build/resources/ui-ux-data']);
  check((await fingerprint(join(staging, 'build', 'index.js'))).sha256 === frozen.sha256,
    'Frozen source bytes changed during packaging');
  await unchanged('after tar creation');
  await writeFile(join(consumer, 'package.json'),
    JSON.stringify({ name: 'mcp-v5-consumer', private: true }) + '\n');
  npmInstall(tarball, consumer);

  const installed = join(consumer, 'node_modules', 'mcp-probe-kit');
  const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  check(pkg.version === PACKAGE_VERSION, 'Installed package version mismatch');
  const serverPath = join(installed, 'build', 'index.js');
  check((await fingerprint(serverPath)).sha256 === frozen.sha256,
    'Installed build SHA-256 does not match frozen artifact');
  await stat(join(installed, 'build', 'resources', 'ui-ux-data', 'promax-colors.csv'));
  // Verify the single-file production bundle really runs without SDK
  // node_modules. Runtime dependencies must not mask omitted bundle files.
  const nodeModules = join(consumer, 'node_modules');
  for (const entry of await readdir(nodeModules, { withFileTypes: true }))
    if (entry.name !== 'mcp-probe-kit')
      await rm(join(nodeModules, entry.name), { recursive: true, force: true });
  check(!(await readdir(nodeModules)).includes('@modelcontextprotocol'),
    'Standalone test still contains the MCP SDK outside the bundle');

  await writeFile(join(project, 'README.md'), '# Disposable v5 package fixture\n');
  execFileSync('git', ['init', '-q', project], { timeout: 3000 });
  execFileSync('git', ['-C', project, 'config', 'user.name', 'Package Smoke'], { timeout: 3000 });
  execFileSync('git', ['-C', project, 'config', 'user.email', 'smoke@example.invalid'], { timeout: 3000 });
  execFileSync('git', ['-C', project, 'add', 'README.md'], { timeout: 3000 });
  execFileSync('git', ['-C', project, 'commit', '-qm', 'initial'], { timeout: 3000 });
  const next = cli(serverPath, project, 'next', {});
  check(!next.structuredContent.nextTask,
    'An empty frozen project should have no task to claim');

  // Installer bootstraps the same managed Skill/AGENTS and pinned fallback
  // for a newly-connected user, without touching the machine's other repos.
  const manifest = JSON.parse(await readFile(join(project,
    '.mcp-probe-kit', 'runtime.json'), 'utf8'));
  check(manifest.version === PACKAGE_VERSION, 'CLI fallback manifest version mismatch');
  const agents = await readFile(join(project, 'AGENTS.md'), 'utf8');
  const skill = await readFile(join(project, '.agents', 'skills',
    'mcp-probe-kit', 'SKILL.md'), 'utf8');
  check(agents.includes('session-resume-r44') &&
    skill.includes('session-resume-r44'),
    'Installed package did not generate the v5 soft Writer guidance');
  const ps = await readFile(join(project, '.mcp-probe-kit', 'bin', 'probe.ps1'), 'utf8');
  const shellPath = join(project, '.mcp-probe-kit', 'bin', 'probe');
  const shell = await readFile(shellPath, 'utf8');
  check(ps.includes(`mcp-probe-kit@${PACKAGE_VERSION}`) &&
    shell.includes(`mcp-probe-kit@${PACKAGE_VERSION}`),
    'Generated CLI wrappers did not pin their MCP version');
  check(shell.startsWith('#!/usr/bin/env sh') && shell.includes('"$@"'),
    'POSIX CLI fallback must forward arguments safely');

  let wrapperExecuted = null;
  if (process.platform !== 'win32') {
    check(((await stat(shellPath)).mode & 0o111) !== 0,
      'POSIX CLI wrapper is not executable');
    run('sh', ['-n', shellPath], { cwd: project });
    const fake = join(temp, 'fake-bin');
    const fakeNpx = join(fake, 'npx');
    const captured = join(temp, 'wrapper-args.txt');
    await mkdir(fake, { recursive: true });
    await writeFile(fakeNpx,
      '#!/usr/bin/env sh\nprintf "%s\\n" "$@" > "$MCP_PROBE_WRAPPER_CAPTURE"\n');
    await chmod(fakeNpx, 0o755);
    run(shellPath, ['status', '--project-root', '.'], {
      cwd: project, timeout: 10_000,
      env: { ...process.env, PATH: fake + delimiter + (process.env.PATH || ''),
        MCP_PROBE_WRAPPER_CAPTURE: captured,
        MCP_PROBE_NPX_CACHE: join(temp, 'cache') },
    });
    const args = (await readFile(captured, 'utf8')).trim().split(/\r?\n/);
    check(args.includes('--yes') && args.includes('--cache') &&
      args.includes(`mcp-probe-kit@${PACKAGE_VERSION}`) && args.includes('status'),
      'POSIX CLI fallback did not faithfully forward pinned arguments');
    wrapperExecuted = true;
  }

  const draft = cli(serverPath, project, 'feature-create', {
    name: 'package-audit', description: 'Disposable package installation contract audit',
  });
  const stored = cli(serverPath, project, 'feature-get', { name: 'package-audit' });
  check(draft.structuredContent.status === 'draft' &&
    stored.structuredContent.revision === 1 &&
    stored.structuredContent.name === 'package-audit',
    'Packed CLI must store a draft in SQLite, never silently approve a Gate');

  transport = new StdioClientTransport({
    command: process.execPath, args: [serverPath], cwd: consumer,
    env: { ...process.env, MCP_PROJECT_ROOT: project,
      MCP_DEVCONTROL_AUTOSTART: '0', MCP_ENABLE_GITNEXUS_BRIDGE: '0',
      MCP_TOOLSET: 'compact', MCP_HISTORY_SESSION: '1',
      MEMORY_QDRANT_URL: '', MEMORY_EMBEDDING_URL: '', MEMORY_EMBEDDING_MODEL: '' },
    stderr: 'pipe',
  });
  client = new Client({ name: 'packed-v5-consumer', version: '1.0.0' },
    { capabilities: {} });
  client.setVersionNegotiation({ mode: { pin: '2026-07-28' } });
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  check(tools.length === COMPACT_WITH_HISTORY_TOOL_COUNT &&
    tools.some(t => t.name === 'devcontrol') &&
    !tools.some(t => ['workflow','resume_plan','converge'].includes(t.name)),
    'Packed server leaked old v4 tools or omitted v5 DevControl');
  const response = await client.callTool({name:'devcontrol',arguments:{
    action:'next',project_root:project,input:{}}});
  check(response.isError !== true && response.structuredContent !== undefined,
    'Packed standalone MCP did not handle a real devcontrol next call');

  await unchanged('after isolated package installation and MCP calls');
  console.log(JSON.stringify({passed:true,version:pkg.version,
    frozenSha256:frozen.sha256,installedBuildMatches:true,sqliteDraft:true,
    cliFallbackPinned:true,unixWrapperExecuted:wrapperExecuted,
    guidanceRevision:'r44',modelTools:tools.length,retiredV4ToolsAbsent:true},null,2));
} finally {
  await client?.close().catch(()=>undefined);
  await transport?.close().catch(()=>undefined);
  await rm(temp,{recursive:true,force:true});
}
