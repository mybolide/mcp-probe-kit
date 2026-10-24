/**
 * The source package version can be ahead of the last published npm release.
 * Keep public installation instructions pinned to a real stable version while
 * an explicitly marked development milestone has not been published.
 */
export function resolveDocsInstallVersion(packageVersion, changelog) {
  const isPrerelease = packageVersion.includes('-');
  if (isPrerelease) {
    return { specifier: 'mcp-probe-kit@next', label: 'npm next', development: false };
  }
  const unpublishedHeading = `## [${packageVersion}] - Development milestone (not published)`;
  if (!changelog.includes(unpublishedHeading)) {
    return { specifier: `mcp-probe-kit@${packageVersion}`, label: packageVersion, development: false };
  }
  const published = /^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/gm.exec(changelog);
  if (!published) {
    throw new Error('Development version has no dated published stable release in CHANGELOG');
  }
  return {
    specifier: `mcp-probe-kit@${published[1]}`,
    label: `published stable ${published[1]}`,
    development: true,
  };
}
