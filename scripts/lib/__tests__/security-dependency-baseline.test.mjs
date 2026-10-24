import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));
const repairedVersions = {
  '@modelcontextprotocol/client': '2.4.0',
  '@modelcontextprotocol/core': '2.4.0',
  '@modelcontextprotocol/server': '2.4.0',
  'csv-parse': '7.0.3',
  'zod': '4.6.7',
};

test('production dependencies stay pinned to the reviewed security baseline', () => {
  for (const [name, version] of Object.entries(repairedVersions)) {
    assert.equal(pkg.dependencies[name], version, name + ' must not revert to a vulnerable release');
  }
});

test('lockfile and package manifest agree on repaired dependencies', () => {
  for (const [name, version] of Object.entries(repairedVersions)) {
    assert.equal(lock.packages[''].dependencies[name], version, 'lock root: ' + name);
    assert.equal(lock.packages['node_modules/' + name]?.version, version, 'installed lock entry: ' + name);
  }
});
