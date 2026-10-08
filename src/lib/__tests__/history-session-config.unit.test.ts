import { describe, expect, it } from 'vitest';
import {
  getHistoryLimits,
  isHistorySessionEnabled,
} from '../history-session-config.js';

describe('history-session-config', () => {
  it('defaults to enabled when unset or empty', () => {
    expect(isHistorySessionEnabled({})).toBe(true);
    expect(isHistorySessionEnabled({ MCP_HISTORY_SESSION: '' })).toBe(true);
    expect(isHistorySessionEnabled({ MCP_HISTORY_SESSION: '1' })).toBe(true);
    expect(isHistorySessionEnabled({ MCP_HISTORY_SESSION: 'yes' })).toBe(true);
  });

  it('disables on 0|false|off|no', () => {
    for (const value of ['0', 'false', 'off', 'no', 'FALSE', ' Off ']) {
      expect(isHistorySessionEnabled({ MCP_HISTORY_SESSION: value })).toBe(false);
    }
  });

  it('parses positive limits with defaults', () => {
    expect(getHistoryLimits({})).toEqual({ maxLines: 800, maxBytes: 131_072 });
    expect(getHistoryLimits({ MCP_HISTORY_MAX_LINES: '10', MCP_HISTORY_MAX_BYTES: '2048' })).toEqual({
      maxLines: 10,
      maxBytes: 2048,
    });
    expect(getHistoryLimits({ MCP_HISTORY_MAX_LINES: '0', MCP_HISTORY_MAX_BYTES: 'abc' })).toEqual({
      maxLines: 800,
      maxBytes: 131_072,
    });
  });
});
