import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertExactToolSurface,
  deriveExpectedToolSurfaces,
  loadToolSurfaceBaseline,
  validateToolSurfaceBaseline,
} from '../tool-surface-baseline.mjs';

test('frozen baseline derives the expected Phase 0 surfaces', async () => {
  const baseline = await loadToolSurfaceBaseline();
  const surfaces = deriveExpectedToolSurfaces(baseline);

  assert.equal(surfaces.compact.length, 23);
  assert.equal(surfaces.compactWithMemory.length, 29);
  assert.equal(surfaces.full.length, 33);
  assert.equal(surfaces.appsModelVisible.length, 29);
  assert.deepEqual(surfaces.appOnly, ['list_memory_assets']);
  assert.equal(new Set([...surfaces.full, ...surfaces.appOnly]).size, 34);
});

test('baseline validation rejects duplicate or cross-group tool ownership', async () => {
  const baseline = await loadToolSurfaceBaseline();
  const invalid = structuredClone(baseline);
  invalid.groups.memoryModel.push(invalid.groups.compactModel[0]);
  invalid.expectedCounts.compactWithMemory += 1;
  invalid.expectedCounts.full += 1;
  invalid.expectedCounts.appsModelVisible += 1;
  invalid.expectedCounts.uniqueCallable += 1;

  assert.throws(
    () => validateToolSurfaceBaseline(invalid),
    /assigns tools to multiple groups/,
  );
});

test('exact surface assertion reports missing and unexpected tools', () => {
  assert.throws(
    () => assertExactToolSurface('compact', ['workflow', 'unexpected'], ['workflow', 'start_feature']),
    /missing=\[start_feature\].*unexpected=\[unexpected\]/,
  );
});

test('exact surface assertion ignores order but preserves exact membership', () => {
  const result = assertExactToolSurface(
    'compact',
    ['start_feature', 'workflow'],
    ['workflow', 'start_feature'],
  );

  assert.equal(result.count, 2);
  assert.deepEqual(result.names, ['start_feature', 'workflow']);
});
