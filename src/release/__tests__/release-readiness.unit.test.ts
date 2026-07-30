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
  it('当前仓库通过错误级静态检查，并正确报告版本准备状态', () => {
    const report = verifyReleaseReadiness(process.cwd(), new Date('2026-07-30T12:00:00.000Z'));

    expect(report.passed).toBe(true);
    expect(report.totals.errors).toBe(0);
    const versionCheck = report.checks.find((item) => item.id === 'v4-version-bump');
    expect(versionCheck?.severity).toBe('warning');
    expect(versionCheck?.passed).toBe(/^4\./.test(report.packageVersion));
  });

  it('缺少迁移材料或 SDK 版本漂移时阻断发布候选', () => {
    const root = createFixture({ serverVersion: '^2.0.0', includeMigration: false });
    const report = verifyReleaseReadiness(root);

    expect(report.passed).toBe(false);
    expect(report.totals.errors).toBeGreaterThan(0);
    expect(report.checks.find((item) => item.id === 'sdk-server')?.passed).toBe(false);
    expect(report.checks.find((item) => item.id === 'file-docs/migration-v3-to-v4.md')?.passed).toBe(false);
  });
});

function createFixture(options: { serverVersion: string; includeMigration: boolean }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-release-readiness-'));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, 'docs/specs/mcp-v4'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    version: '3.7.0',
    engines: { node: '>=20.0.0' },
    dependencies: {
      '@modelcontextprotocol/server': options.serverVersion,
      '@modelcontextprotocol/client': '2.0.0',
      '@modelcontextprotocol/core': '2.0.0',
    },
    files: ['build', 'README.md', 'LICENSE'],
    scripts: { 'eval:agents': 'eval', 'release:verify': 'verify' },
  }));
  fs.writeFileSync(path.join(root, 'tools-manifest.json'), JSON.stringify({
    totalTools: 33,
    toolsets: { workflow: { tools: ['plan_heartbeat', 'resume_plan', 'converge'] } },
  }));
  fs.writeFileSync(
    path.join(root, 'docs/specs/mcp-v4/compatibility-matrix.md'),
    'Reference client 自动验证状态\n真实客户端人工验证矩阵\npending'
  );
  if (options.includeMigration) {
    fs.writeFileSync(path.join(root, 'docs/migration-v3-to-v4.md'), 'migration');
  }
  return root;
}
