import { describe, expect, test } from 'vitest';
import {
  isTransientSyncError,
  resolveSyncTimeoutMs,
} from '../ui-sync-build.js';

describe('sync-ui-data build fallback', () => {
  test('uses a bounded default timeout', () => {
    expect(resolveSyncTimeoutMs(undefined)).toBe(60_000);
    expect(resolveSyncTimeoutMs('1500')).toBe(1500);
    expect(resolveSyncTimeoutMs('invalid')).toBe(60_000);
  });

  test('only treats abort and network failures as transient', () => {
    expect(isTransientSyncError(new Error('socket ECONNRESET'), false)).toBe(true);
    expect(isTransientSyncError(new Error('Sync cancelled'), true)).toBe(true);
    expect(isTransientSyncError(new Error('Target directory not found'), false)).toBe(false);
  });
});
