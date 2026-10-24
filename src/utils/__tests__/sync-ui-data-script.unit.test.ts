import { describe, expect, test } from 'vitest';
import {
  isTransientSyncError,
  resolveSyncTimeoutMs,
} from '../ui-sync-build.js';

describe('sync-ui-data build fallback', () => {
  test('uses a bounded default timeout', () => {
    // Build/test jobs may intentionally set UI_SYNC_TIMEOUT_MS to a much
    // smaller value. Isolate the unit under test from the host environment.
    const original = process.env.UI_SYNC_TIMEOUT_MS;
    try {
      delete process.env.UI_SYNC_TIMEOUT_MS;
      expect(resolveSyncTimeoutMs(undefined)).toBe(60_000);
      expect(resolveSyncTimeoutMs('1500')).toBe(1500);
      expect(resolveSyncTimeoutMs('invalid')).toBe(60_000);
    } finally {
      if (original === undefined) delete process.env.UI_SYNC_TIMEOUT_MS;
      else process.env.UI_SYNC_TIMEOUT_MS = original;
    }
  });

  test('only treats abort and network failures as transient', () => {
    expect(isTransientSyncError(new Error('socket ECONNRESET'), false)).toBe(true);
    expect(isTransientSyncError(new Error('Sync cancelled'), true)).toBe(true);
    expect(isTransientSyncError(new Error('Target directory not found'), false)).toBe(false);
  });
});
