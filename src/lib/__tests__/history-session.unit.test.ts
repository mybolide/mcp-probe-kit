import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bootstrapHistorySession,
  checkpointHistorySession,
  MINTED_SESSION_PREFIX,
  readHistorySession,
  searchHistorySession,
  validateHistorySession,
} from '../history-session/index.js';
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
  it('uses the project SQLite for Git-backed session archives without creating numbered Markdown', () => {
    const root = tempProject();
    execFileSync('git', ['init','-q'], { cwd: root });
    const boot = bootstrapHistorySession(root, {
      session_key: 'sql-session-a', initial_user_input: '需要避免工程文档膨胀',
      title: 'SQLite Project History',
    });
    expect(boot.created).toBe(true);
    expect(boot.current_path).toBe('docs/history-session/1.md'); // virtual read locator
    const initialFile = path.join(root, String(boot.current_path));
    expect(fs.existsSync(initialFile)).toBe(false);
    expect(fs.existsSync(path.join(root, '.mcp-probe-kit/state/devcontrol.sqlite3'))).toBe(true);
    const checked = checkpointHistorySession(root, {
      session_key: 'sql-session-a', expected_path: boot.current_path,
      turn_id: 'turn-1', raw_user_input: '项目需要完整开发记忆',
      decisions: ['统一使用 History Session 而非 Qdrant 共享记忆'],
      next_actions: ['检查 Windows 运行包'],
    });
    expect(checked.ok).toBe(true);
    const echoed = bootstrapHistorySession(root, { session_key: 'sql-session-a' });
    expect(echoed.resumed).toBe(true);
    const results = searchHistorySession(root, { query: 'History Session' });
    expect(results.total).toBe(1);
    const page = readHistorySession(root, { number: 1, max_bytes: 110 });
    expect(page.content_hash).toMatch(/^[a-f0-9]{64}$/);
    const remaining = readHistorySession(root, { number: 1,
      expected_hash: page.content_hash, cursor: page.next_cursor, max_bytes: 64 });
    expect(remaining.content).toBeTruthy();
    expect(validateHistorySession(root, {}).sequence_valid).toBe(true);
    expect(fs.existsSync(initialFile)).toBe(false);
    expect(fs.existsSync(path.join(root, 'docs/history-session/memory/state.json'))).toBe(false);
    const workingTree = execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
    expect(workingTree).toBe('');
  });

  it('imports historical numbered Markdown into SQLite without deleting originals or duplicating archives', () => {
    const root = tempProject();
    execFileSync('git', ['init','-q'], { cwd: root });
    const original = bootstrapHistorySession(root, {
      session_key: 'old-session', title: 'Old archive', initial_user_input: 'legacy text',
      history_dir: 'legacy-history', // old file-based archive for controlled import
    });
    const legacyFile = path.join(root, 'docs/history-session/1.md');
    fs.mkdirSync(path.dirname(legacyFile),{recursive:true});
    fs.copyFileSync(path.join(root,String(original.current_path)),legacyFile);
    const boot = bootstrapHistorySession(root, {
      session_key: 'old-session',
    });
    expect(boot.resumed).toBe(true);
    expect(boot.current_number).toBe(1);
    const change = checkpointHistorySession(root, {
      session_key: 'old-session', expected_path: boot.current_path,
      turn_id: 'later', raw_user_input: 'now stored inside SQLite',
    });
    expect(change.ok).toBe(true);
    expect(fs.readFileSync(legacyFile,'utf8')).not.toContain('now stored inside SQLite');
    const current = readHistorySession(root,{number:1});
    expect(current.content).toContain('now stored inside SQLite');
    const second = bootstrapHistorySession(root,{ session_key: 'new-session' });
    expect(second.current_number).toBe(2);
    expect(fs.existsSync(path.join(root,'docs/history-session/2.md'))).toBe(false);
  });
  it('mints a unique handle when no session key is provided and does not merge later omitted-key bootstraps', () => {
    const root = tempProject();
    const first = bootstrapHistorySession(root, {
      initial_user_input: 'hello minted',
      title: 'PA',
    });
    expect(String(first.session_key).startsWith(MINTED_SESSION_PREFIX)).toBe(true);
    expect(first.session_key_source).toBe('minted_handle');
    expect(first.created).toBe(true);

    const omitted = bootstrapHistorySession(root, {
      initial_user_input: 'hello minted',
    });
    expect(omitted.created).toBe(true);
    expect(omitted.session_key).not.toBe(first.session_key);
    expect(omitted.current_path).not.toBe(first.current_path);

    const echoed = bootstrapHistorySession(root, {
      session_key: first.session_key,
    });
    expect(echoed.created).toBe(false);
    expect(echoed.resumed).toBe(true);
    expect(echoed.current_number).toBe(first.current_number);
    expect(echoed.session_key).toBe(first.session_key);
  });

  it('isolates parallel bootstraps that omit session_key', () => {
    const root = tempProject();
    const release = bootstrapHistorySession(root, {
      initial_user_input: '可以发布了',
      title: 'Release',
    });
    const bug = bootstrapHistorySession(root, {
      initial_user_input: '两个 session 串台了',
      title: 'Crosstalk',
    });

    expect(bug.session_key).not.toBe(release.session_key);
    expect(bug.current_path).not.toBe(release.current_path);
    expect(bug.created).toBe(true);
    expect(bug.current_number).not.toBe(release.current_number);

    checkpointHistorySession(root, {
      session_key: bug.session_key,
      expected_path: bug.current_path,
      turn_id: 'bug-1',
      raw_user_input: '两个 session 串台了',
      user_intent: '修串台',
      findings: ['并行会话应分档'],
    });
    checkpointHistorySession(root, {
      session_key: release.session_key,
      expected_path: release.current_path,
      turn_id: 'rel-1',
      raw_user_input: '可以发布了',
      user_intent: '发 4.1.0',
      findings: ['发布流程'],
    });

    const bugText = fs.readFileSync(path.join(root, String(bug.current_path)), 'utf8');
    const releaseText = fs.readFileSync(path.join(root, String(release.current_path)), 'utf8');
    expect(bugText).toContain('修串台');
    expect(bugText).not.toContain('发 4.1.0');
    expect(releaseText).toContain('发 4.1.0');
    expect(releaseText).not.toContain('修串台');
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
