import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_SYNC_TIMEOUT_MS = 60_000;

export function resolveSyncTimeoutMs(raw = process.env.UI_SYNC_TIMEOUT_MS): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SYNC_TIMEOUT_MS;
}

export function isTransientSyncError(error: unknown, aborted: boolean): boolean {
  if (aborted) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|network|fetch|socket|ECONN|ENOTFOUND|EAI_AGAIN|TLS|aborted|cancelled/i.test(message);
}

export function hasEmbeddedUiData(outputDir: string): boolean {
  return fs.existsSync(path.join(outputDir, 'metadata.json'));
}
