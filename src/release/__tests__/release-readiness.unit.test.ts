import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyReleaseReadiness } from '../release-readiness.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('release readiness', () => {
  it('完整的 4.0.0-rc.1 发布候选通过静态闸门', () => {
    const root = createFixture({
      version: '4.0.0-rc.1',
      serverVersion: '2.0.0',
      includeMigration: true,
    });
    const report = verifyReleaseReadiness(root, new Date('2026-07-30T12:00:00.000Z'));

    expect(report.passed).toBe(true);
    expect(report.totals.errors).toBe(0);
    expect(report.packageVersion).toBe('4.0.0-rc.1');
    expect(report.checks.find((item) => item.id === 'version-parity')?.passed).toBe(true);
  });

  it('缺少迁移材料或 SDK 版本漂移时阻断发布候选', () => {
    const root = createFixture({
      version: '4.0.0-rc.1',
      serverVersion: '^2.0.0',
      includeMigration: false,
    });
    const report = verifyReleaseReadiness(root);

    expect(report.passed).toBe(false);
    expect(report.totals.errors).toBeGreaterThan(0);
    expect(report.checks.find((item) => item.id === 'sdk-server')?.passed).toBe(false);
    expect(report.checks.find((item) => item.id === 'file-docs/migration-v3-to-v4.md')?.passed).toBe(false);
  });
});

function createFixture(options: {
  version: string;
  serverVersion: string;
  includeMigration: boolean;
}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-release-readiness-'));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs/specs/mcp-v4'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/protocol/__tests__'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    version: options.version,
    engines: { node: '>=20.0.0' },
    dependencies: {
      '@modelcontextprotocol/server': options.serverVersion,
      '@modelcontextprotocol/client': '2.0.0',
      '@modelcontextprotocol/core': '2.0.0',
    },
    devDependencies: {
      '@modelcontextprotocol/ext-apps': '1.7.2',
    },
    files: ['build', 'README.md', 'LICENSE'],
    scripts: { 'eval:agents': 'eval', 'acceptance:agent': 'accept', 'stability:soak': 'soak', 'smoke:package': 'pack', 'smoke:rollback': 'rollback', 'smoke:inspector': 'inspector', 'security:audit': 'audit', 'release:verify': 'verify', 'build-mcp-apps': 'build-apps' },
  }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
    version: options.version,
    packages: { '': { version: options.version } },
  }));
  fs.writeFileSync(path.join(root, 'server.json'), JSON.stringify({
    version: options.version,
    packages: [{ version: options.version }],
  }));
  const compactTools = [
    'start_feature', 'start_bugfix', 'start_ui', 'start_onboard', 'start_product',
    'start_ralph', 'workflow', 'init_project_context', 'init_project', 'check_spec',
    'estimate', 'code_insight', 'gentest', 'code_review', 'refactor', 'gencommit',
    'git_work_report', 'ui_design_system', 'ui_search', 'plan_heartbeat',
    'resume_plan', 'converge', 'interview',
  ];
  const memoryTools = [
    'search_memory', 'read_memory_asset', 'memorize_asset',
    'update_memory_asset', 'delete_memory_asset', 'scan_and_extract_patterns',
  ];
  fs.writeFileSync(path.join(root, 'tools-manifest.json'), JSON.stringify({
    version: options.version,
    structuredOutput: { version: options.version },
    totalTools: 33,
    toolsets: {
      compact: { count: 23, tools: compactTools },
      compactWithMemory: { count: 29, tools: [...compactTools, ...memoryTools] },
      memoryConditional: { count: 6, tools: memoryTools },
      appOnly: { count: 1, tools: ['list_memory_assets'] },
      workflow: { tools: ['plan_heartbeat', 'resume_plan', 'converge'] },
      full: { count: 33 },
    },
  }));
  fs.writeFileSync(
    path.join(root, 'src/lib/mcp-apps.ts'),
    'io.modelcontextprotocol/ui\ntext/html;profile=mcp-app\nmemory-center\n'
  );
  fs.writeFileSync(
    path.join(root, 'src/protocol/__tests__/mcp-apps.integration.test.ts'),
    'official MCP Apps integration\n'
  );
  fs.writeFileSync(
    path.join(root, 'CHANGELOG.md'),
    `# Changelog\n\n## [${options.version}] - 2026-07-30\n\n- release candidate\n`
  );
  fs.writeFileSync(
    path.join(root, 'docs/specs/mcp-v4/compatibility-matrix.md'),
    'Reference client 自动验证状态\n真实客户端人工验证矩阵\npending'
  );
  fs.writeFileSync(
    path.join(root, 'docs/rc-stability-policy.md'),
    '稳定性循环\nnpm `next`\n3.7.0\nMCP Inspector\n观察窗口\n'
  );
  fs.writeFileSync(
    path.join(root, '.github/workflows/release.yml'),
    'node-version: "20"\nnpm run release:verify\nnpm publish --tag\nprerelease:\npublish_mcp_registry\n'
  );
  fs.writeFileSync(
    path.join(root, '.github/workflows/publish-mcp-registry.yml'),
    'Prerelease ${VERSION} must not be published\n'
  );
  fs.writeFileSync(
    path.join(root, '.github/workflows/ci.yml'),
    'node-version: "20"\nnode-version: "22"\nnpm run release:verify\n'
  );
  if (options.includeMigration) {
    fs.writeFileSync(path.join(root, 'docs/migration-v3-to-v4.md'), 'migration');
  }
  return root;
}
