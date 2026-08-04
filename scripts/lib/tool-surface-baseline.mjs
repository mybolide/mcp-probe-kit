import { readFile } from 'node:fs/promises';

const DEFAULT_BASELINE_URL = new URL('../../config/tool-surface-baseline.json', import.meta.url);

export async function loadToolSurfaceBaseline(url = DEFAULT_BASELINE_URL) {
  const raw = JSON.parse(await readFile(url, 'utf8'));
  validateToolSurfaceBaseline(raw);
  return raw;
}

export function deriveExpectedToolSurfaces(baseline) {
  validateToolSurfaceBaseline(baseline);
  const compact = unique(baseline.groups.compactModel);
  const memory = unique(baseline.groups.memoryModel);
  const fullCompatibilityOnly = unique(baseline.groups.fullCompatibilityOnly);
  const appOnly = unique(baseline.groups.appOnly);

  return {
    compact,
    compactWithMemory: unique([...compact, ...memory]),
    full: unique([...compact, ...memory, ...fullCompatibilityOnly]),
    appsModelVisible: unique([...compact, ...memory]),
    appOnly,
  };
}

export function assertExactToolSurface(surfaceName, actualNames, expectedNames) {
  const actual = unique([...actualNames]);
  const expected = unique(expectedNames);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((name) => !actualSet.has(name));
  const unexpected = actual.filter((name) => !expectedSet.has(name));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error([
      `Tool surface ${surfaceName} does not match the frozen baseline.`,
      missing.length > 0 ? `missing=[${missing.join(', ')}]` : '',
      unexpected.length > 0 ? `unexpected=[${unexpected.join(', ')}]` : '',
      `expectedCount=${expected.length}`,
      `actualCount=${actual.length}`,
    ].filter(Boolean).join(' '));
  }

  return {
    count: actual.length,
    names: [...actual].sort(),
  };
}

export function validateToolSurfaceBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw new Error('Tool surface baseline must be an object.');
  }
  if (baseline.schemaVersion !== 1) {
    throw new Error(`Unsupported tool surface baseline schemaVersion: ${baseline.schemaVersion}`);
  }
  if (!baseline.groups || typeof baseline.groups !== 'object') {
    throw new Error('Tool surface baseline is missing groups.');
  }

  for (const groupName of ['compactModel', 'memoryModel', 'fullCompatibilityOnly', 'appOnly']) {
    const group = baseline.groups[groupName];
    if (!Array.isArray(group) || group.some((name) => typeof name !== 'string' || !name.trim())) {
      throw new Error(`Tool surface baseline group ${groupName} must contain non-empty strings.`);
    }
    const duplicates = findDuplicates(group);
    if (duplicates.length > 0) {
      throw new Error(`Tool surface baseline group ${groupName} contains duplicates: ${duplicates.join(', ')}`);
    }
  }

  const allGroups = [
    ...baseline.groups.compactModel,
    ...baseline.groups.memoryModel,
    ...baseline.groups.fullCompatibilityOnly,
    ...baseline.groups.appOnly,
  ];
  const crossGroupDuplicates = findDuplicates(allGroups);
  if (crossGroupDuplicates.length > 0) {
    throw new Error(`Tool surface baseline assigns tools to multiple groups: ${crossGroupDuplicates.join(', ')}`);
  }

  const surfaces = {
    compact: baseline.groups.compactModel.length,
    compactWithMemory: baseline.groups.compactModel.length + baseline.groups.memoryModel.length,
    full:
      baseline.groups.compactModel.length +
      baseline.groups.memoryModel.length +
      baseline.groups.fullCompatibilityOnly.length,
    appsModelVisible: baseline.groups.compactModel.length + baseline.groups.memoryModel.length,
    appOnly: baseline.groups.appOnly.length,
    uniqueCallable: allGroups.length,
  };

  for (const [name, actualCount] of Object.entries(surfaces)) {
    const expectedCount = baseline.expectedCounts?.[name];
    if (expectedCount !== actualCount) {
      throw new Error(
        `Tool surface baseline count ${name} is inconsistent: declared=${expectedCount}, derived=${actualCount}`,
      );
    }
  }
}

function unique(values) {
  return [...new Set(values)];
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}
