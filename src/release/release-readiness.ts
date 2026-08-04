import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveReleaseChannel } from './release-channel.js';

export interface ReleaseReadinessCheck {
  id: string;
  passed: boolean;
  severity: 'error' | 'warning';
  expected: unknown;
  actual: unknown;
  message: string;
}

export interface ReleaseReadinessReport {
  passed: boolean;
  generatedAt: string;
  packageVersion: string;
  checks: ReleaseReadinessCheck[];
  totals: {
    checks: number;
    errors: number;
    warnings: number;
  };
}

interface PackageManifest {
  version?: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
}

interface ToolManifest {
  version?: string;
  totalTools?: number;
  structuredOutput?: { version?: string };
  toolsets?: Record<string, { count?: number; tools?: string[] }>;
}

interface PackageLockManifest {
  version?: string;
  packages?: Record<string, { version?: string }>;
}

interface ServerManifest {
  version?: string;
  packages?: Array<{ version?: string }>;
}

const SDK_PACKAGES = [
  '@modelcontextprotocol/server',
  '@modelcontextprotocol/client',
  '@modelcontextprotocol/core',
] as const;

export function verifyReleaseReadiness(
  workspaceRoot: string = process.cwd(),
  now: Date = new Date()
): ReleaseReadinessReport {
  const packageJson = readJson<PackageManifest>(workspaceRoot, 'package.json');
  const packageLock = readJson<PackageLockManifest>(workspaceRoot, 'package-lock.json');
  const serverManifest = readJson<ServerManifest>(workspaceRoot, 'server.json');
  const toolManifest = readJson<ToolManifest>(workspaceRoot, 'tools-manifest.json');
  const checks: ReleaseReadinessCheck[] = [];
  const dependencies = packageJson.dependencies ?? {};
  const packageVersion = packageJson.version ?? '';
  const releaseChannel = safeReleaseChannel(packageVersion);

  checks.push(check(
    'v4-release-version',
    Boolean(releaseChannel && /^4\./.test(packageVersion)),
    'error',
    'valid 4.x SemVer release or prerelease',
    packageVersion || 'missing',
    'RC 或稳定版提交必须使用有效的 4.x SemVer 版本'
  ));
  checks.push(check(
    'version-parity',
    [
      packageLock.version,
      packageLock.packages?.['']?.version,
      serverManifest.version,
      ...(serverManifest.packages ?? []).map((item) => item.version),
      toolManifest.version,
      toolManifest.structuredOutput?.version,
    ].every((item) => item === packageVersion),
    'error',
    packageVersion,
    {
      packageLock: packageLock.version,
      packageLockRoot: packageLock.packages?.['']?.version,
      server: serverManifest.version,
      serverPackages: (serverManifest.packages ?? []).map((item) => item.version),
      toolManifest: toolManifest.version,
      structuredOutput: toolManifest.structuredOutput?.version,
    },
    'package、lockfile、server metadata 与 Tool Manifest 版本必须完全一致'
  ));

  checks.push(check(
    'node-runtime',
    currentNodeMajor() >= 20,
    'error',
    'Node.js >= 20',
    process.version,
    'v4 SDK 运行时必须使用 Node.js 20 或更高版本'
  ));
  checks.push(check(
    'node-engine',
    packageJson.engines?.node === '>=20.0.0',
    'error',
    '>=20.0.0',
    packageJson.engines?.node,
    'package.json 必须明确声明 Node.js 20 最低版本'
  ));

  for (const packageName of SDK_PACKAGES) {
    checks.push(check(
      `sdk-${packageName.split('/').at(-1)}`,
      dependencies[packageName] === '2.0.0',
      'error',
      '2.0.0',
      dependencies[packageName],
      `${packageName} 必须锁定经过验证的精确版本`
    ));
  }
  checks.push(check(
    'sdk-ext-apps',
    packageJson.devDependencies?.['@modelcontextprotocol/ext-apps'] === '1.7.2',
    'error',
    '1.7.2',
    packageJson.devDependencies?.['@modelcontextprotocol/ext-apps'],
    'MCP Apps 必须使用已经验证的官方扩展 SDK 精确版本'
  ));
  checks.push(check(
    'legacy-sdk-removed',
    !Object.prototype.hasOwnProperty.call(dependencies, '@modelcontextprotocol/sdk'),
    'error',
    'absent',
    dependencies['@modelcontextprotocol/sdk'] ?? 'absent',
    '顶层依赖不得继续加载旧单包 SDK'
  ));
  checks.push(check(
    'tool-count',
    toolManifest.totalTools === 34,
    'error',
    34,
    toolManifest.totalTools,
    'Tool Manifest 必须包含 34 个模型可见工具'
  ));
  const compactTools = toolManifest.toolsets?.compact?.tools ?? [];
  const compactWithMemoryTools =
    toolManifest.toolsets?.compactWithMemory?.tools ?? [];
  const memoryConditionalTools =
    toolManifest.toolsets?.memoryConditional?.tools ?? [];
  const appOnlyTools = toolManifest.toolsets?.appOnly?.tools ?? [];
  checks.push(check(
    'compact-tool-surface',
    toolManifest.toolsets?.compact?.count === 24 &&
      compactTools.length === 24 &&
      ['start_product', 'gencommit', 'converge', 'architecture'].every((name) => compactTools.includes(name)) &&
      ['add_feature', 'fix_bug', 'sync_ui_data', 'ask_user'].every(
        (name) => !compactTools.includes(name)
      ),
    'error',
    { count: 24, required: ['start_product', 'gencommit', 'converge', 'architecture'], hidden: ['add_feature', 'fix_bug', 'sync_ui_data', 'ask_user'] },
    { count: toolManifest.toolsets?.compact?.count, tools: compactTools },
    '默认模型工具面必须固定为审核后的 24 个工具'
  ));
  checks.push(check(
    'memory-conditional-surface',
    toolManifest.toolsets?.compactWithMemory?.count === 30 &&
      compactWithMemoryTools.length === 30 &&
      toolManifest.toolsets?.memoryConditional?.count === 6 &&
      memoryConditionalTools.length === 6,
    'error',
    { compactWithMemory: 30, memoryConditional: 6 },
    {
      compactWithMemory: toolManifest.toolsets?.compactWithMemory?.count,
      memoryConditional: toolManifest.toolsets?.memoryConditional?.count,
    },
    'Memory 配置后必须只增量暴露 6 个记忆工具'
  ));
  checks.push(check(
    'app-only-surface',
    toolManifest.toolsets?.appOnly?.count === 1 &&
      appOnlyTools.length === 1 &&
      appOnlyTools[0] === 'list_memory_assets',
    'error',
    ['list_memory_assets'],
    appOnlyTools,
    'Memory Center 的历史列表动作必须保持 app-only，不计入模型可见工具面'
  ));
  checks.push(check(
    'full-compatibility-surface',
    toolManifest.toolsets?.full?.count === 34,
    'error',
    34,
    toolManifest.toolsets?.full?.count,
    'MCP_TOOLSET=full 必须保留 34 工具兼容面'
  ));

  checks.push(check(
    'workflow-toolset-plan-tools',
    ['plan_heartbeat', 'resume_plan', 'converge'].every((toolName) =>
      toolManifest.toolsets?.workflow?.tools?.includes(toolName)
    ),
    'error',
    ['plan_heartbeat', 'resume_plan', 'converge'],
    toolManifest.toolsets?.workflow?.tools ?? [],
    'Workflow 工具集必须暴露计划状态、恢复和收敛工具'
  ));

  const requiredPackageFiles = ['build', 'README.md', 'LICENSE'];
  checks.push(check(
    'package-files',
    requiredPackageFiles.every((item) => packageJson.files?.includes(item)),
    'error',
    requiredPackageFiles,
    packageJson.files ?? [],
    'npm 包必须包含运行产物、README 和许可证'
  ));
  checks.push(fileCheck(workspaceRoot, 'scripts/clean-build.mjs'));
  checks.push(fileCheck(workspaceRoot, 'scripts/gitnexus-sidecar-smoke.mjs'));
  checks.push(fileCheck(workspaceRoot, 'src/lib/gitnexus-runtime-config.ts'));
  checks.push(fileCheck(workspaceRoot, 'src/lib/gitnexus-runtime-installer.ts'));
  checks.push(fileCheck(workspaceRoot, 'src/lib/gitnexus-runtime-manager.ts'));
  checks.push(fileCheck(workspaceRoot, 'docs/migration-v3-to-v4.md'));
  checks.push(fileCheck(workspaceRoot, 'src/protocol/__tests__/mcp-apps.integration.test.ts'));
  checks.push(contentCheck(
    workspaceRoot,
    'src/lib/mcp-apps.ts',
    ['io.modelcontextprotocol/ui', 'text/html;profile=mcp-app', 'memory-center'],
    '正式 MCP Apps 扩展、资源 MIME 和 Memory Center 必须进入发布产物源码'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    'docs/rc-stability-policy.md',
    ['稳定性循环', 'npm `next`', '3.7.0', 'MCP Inspector', '观察窗口'],
    '稳定 RC 策略必须定义稳定性、安全、回退、真实客户端和发布后观察要求'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    'CHANGELOG.md',
    [`## [${packageVersion}]`],
    'CHANGELOG 必须包含当前发布版本的独立章节'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    'docs/specs/mcp-v4/compatibility-matrix.md',
    ['Reference client 自动验证状态', '真实客户端人工验证矩阵', 'pending'],
    '兼容矩阵必须区分自动验证、真实客户端与 pending 状态'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    '.github/workflows/release.yml',
    [
      'node-version: "20"',
      'node-version: "24"',
      'npm@11.18.0',
      'id-token: write',
      'package-manager-cache: false',
      'npm run release:verify',
      'npm publish --tag',
      'prerelease:',
      'publish_mcp_registry',
    ],
    'Tag 发布工作流必须区分 RC 与稳定版发布渠道'
  ));
  const releaseWorkflow = fs.readFileSync(
    path.join(workspaceRoot, '.github/workflows/release.yml'),
    'utf8'
  );
  checks.push(check(
    'release-npm-trusted-publishing',
    !releaseWorkflow.includes('NPM_TOKEN') && !releaseWorkflow.includes('NODE_AUTH_TOKEN'),
    'error',
    'OIDC Trusted Publishing without long-lived npm tokens',
    releaseWorkflow.includes('NPM_TOKEN') || releaseWorkflow.includes('NODE_AUTH_TOKEN')
      ? 'legacy npm token reference found'
      : 'OIDC only',
    'npm release job must use GitHub OIDC Trusted Publishing and must not reference npm tokens'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    '.github/workflows/publish-mcp-registry.yml',
    ['Prerelease ${VERSION} must not be published'],
    '手工 MCP Registry 工作流必须拒绝预发布版本'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    '.github/workflows/ci.yml',
    [
      'node-version: "20"',
      'node-version: "22"',
      'npm run release:verify',
      'ubuntu-latest',
      'macos-latest',
      'windows-latest',
      'npm run smoke:gitnexus-sidecar',
    ],
    '稳定 RC 必须在 Node 20 最低版本持续回归，并在 Windows、macOS、Linux 验证 GitNexus Sidecar'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    '.github/workflows/release.yml',
    [
      'ubuntu-latest',
      'macos-latest',
      'windows-latest',
      'npm run smoke:gitnexus-sidecar',
      'needs: [build, gitnexus-sidecar]',
    ],
    'Tag 发布前必须通过 Windows、macOS、Linux GitNexus Sidecar 闸门'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    'src/lib/gitnexus-runtime-config.ts',
    [
      'gitnexus@1.6.9',
      'sha512-Rq5LXFygx7jjMp/YFsIAcnnzuKvvCsb4rxHFILnu05ZOqk7xNXTUSMRa968EOCbxcKFxnhKYaGXoabOUeGZX6A==',
      'libssl-3-x64.dll',
      'libcrypto-3-x64.dll',
      'GITNEXUS_WORKER_POOL_SIZE',
    ],
    'GitNexus 托管运行时必须锁定经过验证的版本、integrity 和 Windows FTS 运行时依赖'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    'src/lib/gitnexus-runtime-installer.ts',
    [
      'verifyManagedRuntimeCapabilities',
      'Full-text search:',
      'FTS extension unavailable',
      'full-text\\/BM25 search is disabled',
    ],
    'GitNexus 安装完成前必须通过真实 FTS 能力探针，不能接受静默降级运行时'
  ));
  const gitNexusRuntimeFiles = [
    'src/lib/gitnexus-runtime-config.ts',
    'src/lib/gitnexus-runtime-installer.ts',
    'src/lib/gitnexus-runtime-manager.ts',
    'src/lib/gitnexus-bridge.ts',
    'scripts/gitnexus-sidecar-smoke.mjs',
  ];
  const latestReferences = gitNexusRuntimeFiles.flatMap((relativePath) => {
    const absolutePath = path.join(workspaceRoot, relativePath);
    if (!fs.existsSync(absolutePath)) return [`${relativePath}:missing`];
    return fs.readFileSync(absolutePath, 'utf8').includes('gitnexus@latest')
      ? [`${relativePath}:gitnexus@latest`]
      : [];
  });
  checks.push(check(
    'gitnexus-no-latest',
    latestReferences.length === 0,
    'error',
    'no gitnexus@latest references in managed runtime paths',
    latestReferences.length === 0 ? 'none' : latestReferences,
    'GitNexus 托管链路不得重新引入不可复现的 @latest'
  ));
  const requiredReleaseScripts = [
    'clean:build',
    'eval:agents',
    'acceptance:agent',
    'stability:soak',
    'smoke:package',
    'smoke:rollback',
    'smoke:inspector',
    'security:audit',
    'release:verify',
    'build-mcp-apps',
    'smoke:gitnexus-sidecar',
  ];
  checks.push(check(
    'clean-build-before-compile',
    packageJson.scripts?.['clean:build'] === 'node scripts/clean-build.mjs' &&
      Boolean(packageJson.scripts?.prebuild?.trim().startsWith('npm run clean:build')),
    'error',
    {
      cleanScript: 'node scripts/clean-build.mjs',
      prebuildPrefix: 'npm run clean:build',
    },
    {
      cleanScript: packageJson.scripts?.['clean:build'],
      prebuild: packageJson.scripts?.prebuild,
    },
    '每次 TypeScript 构建前必须清空 build，防止已删除模块残留进入 npm tarball'
  ));
  checks.push(check(
    'release-scripts',
    requiredReleaseScripts.every((name) => Boolean(packageJson.scripts?.[name])),
    'error',
    requiredReleaseScripts,
    Object.keys(packageJson.scripts ?? {}),
    '稳定 RC 必须提供 Agent Evals、真实 Agent 验收、稳定性循环、安装包冒烟与统一发布闸门'
  ));
  const errors = checks.filter((item) => !item.passed && item.severity === 'error').length;
  const warnings = checks.filter((item) => !item.passed && item.severity === 'warning').length;
  return {
    passed: errors === 0,
    generatedAt: now.toISOString(),
    packageVersion: packageJson.version ?? 'unknown',
    checks,
    totals: {
      checks: checks.length,
      errors,
      warnings,
    },
  };
}

function readJson<T>(root: string, relativePath: string): T {
  const absolutePath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T;
}

function currentNodeMajor(): number {
  return Number(process.versions.node.split('.')[0] ?? 0);
}

function fileCheck(root: string, relativePath: string): ReleaseReadinessCheck {
  const exists = fs.existsSync(path.join(root, relativePath));
  return check(
    `file-${relativePath}`,
    exists,
    'error',
    'exists',
    exists ? 'exists' : 'missing',
    `${relativePath} 必须存在`
  );
}

function contentCheck(
  root: string,
  relativePath: string,
  requiredTerms: string[],
  message: string
): ReleaseReadinessCheck {
  const absolutePath = path.join(root, relativePath);
  const content = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : '';
  const missing = requiredTerms.filter((term) => !content.includes(term));
  return check(
    `content-${relativePath}`,
    missing.length === 0,
    'error',
    requiredTerms,
    missing.length === 0 ? requiredTerms : { missing },
    message
  );
}

function safeReleaseChannel(version: string): ReturnType<typeof resolveReleaseChannel> | undefined {
  try {
    return resolveReleaseChannel(version);
  } catch {
    return undefined;
  }
}

function check(
  id: string,
  passed: boolean,
  severity: ReleaseReadinessCheck['severity'],
  expected: unknown,
  actual: unknown,
  message: string
): ReleaseReadinessCheck {
  return { id, passed, severity, expected, actual, message };
}
