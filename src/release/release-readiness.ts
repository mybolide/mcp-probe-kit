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
    'legacy-sdk-removed',
    !Object.prototype.hasOwnProperty.call(dependencies, '@modelcontextprotocol/sdk'),
    'error',
    'absent',
    dependencies['@modelcontextprotocol/sdk'] ?? 'absent',
    '顶层依赖不得继续加载旧单包 SDK'
  ));
  checks.push(check(
    'tool-count',
    toolManifest.totalTools === 33,
    'error',
    33,
    toolManifest.totalTools,
    'Tool Manifest 必须包含 33 个工具'
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
  checks.push(fileCheck(workspaceRoot, 'docs/migration-v3-to-v4.md'));
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
      'npm run release:verify',
      'npm publish --tag',
      'prerelease:',
      'publish_mcp_registry',
    ],
    'Tag 发布工作流必须区分 RC 与稳定版发布渠道'
  ));
  checks.push(contentCheck(
    workspaceRoot,
    '.github/workflows/publish-mcp-registry.yml',
    ['Prerelease ${VERSION} must not be published'],
    '手工 MCP Registry 工作流必须拒绝预发布版本'
  ));
  checks.push(check(
    'release-scripts',
    Boolean(packageJson.scripts?.['eval:agents'] && packageJson.scripts?.['release:verify']),
    'error',
    ['eval:agents', 'release:verify'],
    Object.keys(packageJson.scripts ?? {}),
    '发布候选必须提供 Agent Evals 与统一发布闸门'
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
