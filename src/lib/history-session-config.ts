export interface HistorySessionLimits {
  maxLines: number;
  maxBytes: number;
}

const CLOSED = new Set(['0', 'false', 'off', 'no']);

/** Default ON: unset/empty/other → enabled; 0|false|off|no → disabled. */
export function isHistorySessionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.MCP_HISTORY_SESSION?.trim().toLowerCase();
  if (!raw) return true;
  return !CLOSED.has(raw);
}

export function getHistoryLimits(env: NodeJS.ProcessEnv = process.env): HistorySessionLimits {
  return {
    maxLines: positiveInt(env.MCP_HISTORY_MAX_LINES, 800),
    maxBytes: positiveInt(env.MCP_HISTORY_MAX_BYTES, 131_072),
  };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export const PROJECT_ACTIVE_SESSION_KEY = 'project-active';
export const DEFAULT_HISTORY_DIR = 'docs/history-session';
export const BOOTSTRAP_RESPONSE_BUDGET = 64 * 1024;
export const DEFAULT_READ_MAX_BYTES = 32 * 1024;
export const MAX_READ_MAX_BYTES = 64 * 1024;
