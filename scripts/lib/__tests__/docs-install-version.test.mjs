import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveDocsInstallVersion } from '../docs-install-version.mjs';

const developmentChangelog = [
  '## [Unreleased]',
  '## [5.0.0] - Development milestone (not published)',
  '## [4.1.1] - 2026-10-13',
  '## [4.1.0] - 2026-10-08',
].join('\n');

test('unpublished 5.0.0 source keeps public docs pinned to published stable', () => {
  assert.deepEqual(resolveDocsInstallVersion('5.0.0', developmentChangelog), {
    specifier: 'mcp-probe-kit@4.1.1',
    label: 'published stable 4.1.1',
    development: true,
  });
});

test('published stable source advertises its own exact version', () => {
  assert.equal(
    resolveDocsInstallVersion('4.1.1', '## [4.1.1] - 2026-10-13').specifier,
    'mcp-probe-kit@4.1.1'
  );
});

test('prerelease source uses the next channel', () => {
  assert.equal(
    resolveDocsInstallVersion('5.0.0-rc.1', developmentChangelog).specifier,
    'mcp-probe-kit@next'
  );
});

test('unpublished development without a known stable release is a hard error', () => {
  assert.throws(
    () => resolveDocsInstallVersion('5.0.0', '## [5.0.0] - Development milestone (not published)'),
    /no dated published stable release/
  );
});
