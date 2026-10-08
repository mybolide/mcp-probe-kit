import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bootstrapHistorySession,
  checkpointHistorySession,
  readHistorySession,
  searchHistorySession,
  validateHistorySession,
} from '../history-session/index.js';
import { PROJECT_ACTIVE_SESSION_KEY } from '../history-session-config.js';
import { resolveToolsetNames } from '../toolset-manager.js';

const tmpRoots: string[] = [];

function tempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'history-session-'));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('history-session service', () => {
  it('falls back to project-active when no session key is provided', () => {
    const root = tempProject();
    const first = bootstrapHistorySession(root, {
      initial_user_input: 'hello project active',
      title: 'PA',
    });
    expect(first.session_key).toBe(PROJECT_ACTIVE_SESSION_KEY);
    expect(first.session_key_source).toBe('project_active');
    expect(first.created).toBe(true);

    const second = bootstrapHistorySession(root, {
      initial_user_input: 'hello project active',
    });
    expect(second.created).toBe(false);
    expect(second.resumed).toBe(true);
    expect(second.current_number).toBe(first.current_number);
    expect(second.current_path).toBe(first.current_path);
  });

  it('reuses an explicit session_key archive', () => {
    const root = tempProject();
    const first = bootstrapHistorySession(root, {
      session_key: 'chat-abc',
      initial_user_input: 'keyed',
    });
    const second = bootstrapHistorySession(root, {
      session_key: 'chat-abc',
    });
    expect(second.session_key_source).toBe('explicit_session_key');
    expect(second.current_number).toBe(first.current_number);
    expect(second.created).toBe(false);
  });

  it('soft-rotates when archive exceeds line limit before checkpoint', () => {
    const root = tempProject();
    const boot = bootstrapHistorySession(root, {
      session_key: 'rotate-me',
      initial_user_input: 'seed',
    });
    const archivePath = path.join(root, String(boot.current_path));
    const padded = `${fs.readFileSync(archivePath, 'utf8')}${'\nline\n'.repeat(50)}`;
    fs.writeFileSync(archivePath, padded, 'utf8');

    const result = checkpointHistorySession(
      root,
      {
        session_key: 'rotate-me',
        expected_path: boot.current_path,
        turn_id: 't1',
        raw_user_input: 'after rotate',
        user_intent: 'continue',
      },
      { maxLines: 20, maxBytes: 10_000_000 },
    );

    expect(result.rotated).toBe(true);
    expect(result.current_number).toBeGreaterThan(boot.current_number as number);
    expect(result.expected_path).not.toBe(boot.current_path);
    expect(result.ok).toBe(true);

    const sealed = fs.readFileSync(archivePath, 'utf8');
    expect(sealed).toContain('**Status:** sealed');

    const rotatedPath = path.join(root, String(result.current_path));
    const rotated = fs.readFileSync(rotatedPath, 'utf8');
    expect(rotated).toContain('**Status:** active');
    expect(rotated).toContain('"raw_user_input": "seed"');
    expect(rotated).not.toContain('未提供首次用户输入');

    const state = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/history-session/memory/state.json'), 'utf8'),
    );
    expect(state.current_session.number).toBe(result.current_number);
  });

  it('ignores duplicate checkpoints with the same fingerprint', () => {
    const root = tempProject();
    const boot = bootstrapHistorySession(root, {
      session_key: 'idem',
      initial_user_input: 'seed',
    });
    const args = {
      session_key: 'idem',
      expected_path: boot.current_path as string,
      turn_id: 'turn-1',
      raw_user_input: 'same',
      user_intent: 'same',
      findings: ['a'],
    };
    const first = checkpointHistorySession(root, args);
    const second = checkpointHistorySession(root, args);
    expect(first.duplicate_ignored).toBe(false);
    expect(second.duplicate_ignored).toBe(true);
    expect(second.current_number).toBe(first.current_number);
  });

  it('searches and paginates reads', () => {
    const root = tempProject();
    const boot = bootstrapHistorySession(root, {
      session_key: 'searchable',
      initial_user_input: 'unique-token-xyz',
      title: 'Searchable Session',
    });
    checkpointHistorySession(root, {
      session_key: 'searchable',
      expected_path: boot.current_path,
      turn_id: 't-search',
      raw_user_input: 'unique-token-xyz again',
      decisions: ['keep unique-token-xyz'],
    });

    const hits = searchHistorySession(root, { query: 'unique-token-xyz', limit: 5 });
    expect(hits.total).toBeGreaterThanOrEqual(1);
    expect((hits.results as Array<{ number: number }>)[0].number).toBe(boot.current_number);

    const page = readHistorySession(root, {
      number: boot.current_number,
      max_bytes: 64,
      cursor: 0,
    });
    expect(String(page.content).length).toBeGreaterThan(0);
    expect(page.content_hash).toMatch(/^[a-f0-9]{64}$/);
    if (page.next_cursor != null) {
      const more = readHistorySession(root, {
        number: boot.current_number,
        cursor: page.next_cursor,
        max_bytes: 64,
        expected_hash: page.content_hash,
      });
      expect(String(more.content).length).toBeGreaterThan(0);
    }

    const validation = validateHistorySession(root, { repair: true });
    expect(validation.sequence_valid).toBe(true);
    expect(validation.repaired).toBe(true);
  });

  it('hides history tools from compact when disabled', () => {
    expect(
      resolveToolsetNames('compact', { historyEnabled: false, memoryEnabled: false }),
    ).not.toEqual(expect.arrayContaining(['history_session_bootstrap']));
    expect(
      resolveToolsetNames('compact', { historyEnabled: true, memoryEnabled: false }),
    ).toEqual(expect.arrayContaining([
      'history_session_bootstrap',
      'history_session_checkpoint',
      'history_session_validate',
      'history_session_search',
      'history_session_read',
    ]));
  });
});
