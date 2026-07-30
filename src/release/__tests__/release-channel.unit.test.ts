import { describe, expect, it } from 'vitest';
import { resolveReleaseChannel, verifyReleaseTag } from '../release-channel.js';

describe('release channel', () => {
  it('预发布版本固定使用 next，且不发布到正式 MCP Registry', () => {
    expect(resolveReleaseChannel('4.0.0-rc.1')).toEqual({
      version: '4.0.0-rc.1',
      gitTag: 'v4.0.0-rc.1',
      prerelease: true,
      npmTag: 'next',
      publishMcpRegistry: false,
    });
  });

  it('稳定版本使用 latest，并允许发布到 MCP Registry', () => {
    expect(resolveReleaseChannel('4.0.0')).toEqual({
      version: '4.0.0',
      gitTag: 'v4.0.0',
      prerelease: false,
      npmTag: 'latest',
      publishMcpRegistry: true,
    });
  });

  it('Git Tag 与 package version 不一致时拒绝发布', () => {
    expect(() => verifyReleaseTag('v4.0.0', '4.0.0-rc.1')).toThrow(
      'Git Tag 与 package.json 不一致'
    );
  });
});
