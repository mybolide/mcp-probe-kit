export type NpmReleaseTag = 'next' | 'latest';

export interface ReleaseChannel {
  version: string;
  gitTag: string;
  prerelease: boolean;
  npmTag: NpmReleaseTag;
  publishMcpRegistry: boolean;
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function resolveReleaseChannel(version: string): ReleaseChannel {
  const normalizedVersion = version.trim();
  const match = SEMVER_PATTERN.exec(normalizedVersion);
  if (!match) {
    throw new Error(`无效 SemVer 版本：${version}`);
  }

  const prerelease = Boolean(match[4]);
  return {
    version: normalizedVersion,
    gitTag: `v${normalizedVersion}`,
    prerelease,
    npmTag: prerelease ? 'next' : 'latest',
    publishMcpRegistry: !prerelease,
  };
}

export function verifyReleaseTag(tag: string, version: string): ReleaseChannel {
  const channel = resolveReleaseChannel(version);
  const normalizedTag = tag.trim();
  if (normalizedTag !== channel.gitTag) {
    throw new Error(
      `Git Tag 与 package.json 不一致：期望 ${channel.gitTag}，实际 ${normalizedTag || '<empty>'}`
    );
  }
  return channel;
}
