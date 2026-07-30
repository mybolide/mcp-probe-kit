import * as fs from 'node:fs';
import * as path from 'node:path';
import { verifyReleaseTag } from '../src/release/release-channel.js';

interface PackageManifest {
  version?: string;
}

const rawTag = process.argv[2]?.trim();
if (!rawTag) {
  console.error('用法: tsx scripts/verify-release-tag.ts <git-tag>');
  process.exit(1);
}

const packagePath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PackageManifest;
if (!packageJson.version) {
  throw new Error('package.json 缺少 version');
}

const channel = verifyReleaseTag(rawTag, packageJson.version);
const outputs = {
  version: channel.version,
  npm_tag: channel.npmTag,
  prerelease: String(channel.prerelease),
  publish_mcp_registry: String(channel.publishMcpRegistry),
};

const githubOutput = process.env.GITHUB_OUTPUT?.trim();
if (githubOutput) {
  fs.appendFileSync(
    githubOutput,
    Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
    'utf8'
  );
}

console.log(JSON.stringify(channel, null, 2));
