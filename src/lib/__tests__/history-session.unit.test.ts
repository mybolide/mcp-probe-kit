import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
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
import { readSqliteHistoryDocuments, writeSqliteHistoryDocument } from '../history-session/sqlite-store.js';
import { appendCheckpointRecord, checkpointFromArgs, initialInputFingerprint, renderDocument } from '../history-session/markdown.js';

const tmpRoots: string[] = [];
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (file: string, options: {readOnly:true}) => {
    prepare: (sql:string) => { get: () => Record<string,unknown> | undefined };
    close: () => void;
  };
};

function tempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'history-session-'));
  tmpRoots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root, timeout: 3000, windowsHide: true });
  return root;
}

const legacyTimestamp = '2025-01-01T00:00:00.000Z';
function legacyDocument(number: number, key: string, input: string): string {
  return renderDocument(number, '历史导入来源', key, legacyTimestamp, {
    raw_user_input: input, captured_at: legacyTimestamp,
    revision: 1, content_hash: initialInputFingerprint(input),
  });
}
function legacyFile(root: string, number: number, content: string): string {
  const file = path.join(root, 'docs', 'history-session', number + '.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return file;
}
function legacyAppend(content: string, input: string, turnId: string): string {
  const record = checkpointFromArgs({
    turn_id: turnId, raw_user_input: input,
  }, '2025-01-02T00:00:00.000Z');
  record.revision = 1;
  return appendCheckpointRecord(content, record);
}
function sqliteContent(root: string, number: number): string {
  const found = readSqliteHistoryDocuments(root).find((doc) => doc.number === number);
  if (!found) throw new Error('Missing SQLite archive ' + number);
  return found.content;
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
    const sourceFile = legacyFile(root, 1, legacyDocument(1, 'old-session', 'legacy text'));
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
    expect(fs.readFileSync(sourceFile,'utf8')).not.toContain('now stored inside SQLite');
    const current = readHistorySession(root,{number:1});
    expect(current.content).toContain('now stored inside SQLite');
    const second = bootstrapHistorySession(root,{ session_key: 'new-session' });
    expect(second.current_number).toBe(2);
    expect(fs.existsSync(path.join(root,'docs/history-session/2.md'))).toBe(false);
  });

  it('continues importing numbered files written after the initial migration by an older host', () => {
    const root=tempProject();
    const original = legacyDocument(1, 'old-host-1', 'first session');
    const file1 = legacyFile(root, 1, original);
    // The first read imports only 1.md, without replacing the source.
    expect(searchHistorySession(root,{}).total).toBe(1);
    legacyFile(root, 1, legacyAppend(original, 'later first session checkpoint', 'old-1'));
    legacyFile(root, 2, legacyDocument(2, 'old-host-2', 'second session'));
    legacyFile(root, 3, legacyDocument(3, 'old-host-3', 'third session'));
    // A still-running older host can append archived Markdown; v5 imports it
    // as READ-ONLY source without reenabling the forbidden file workflow.
    const listing=searchHistorySession(root,{});
    expect(listing.total).toBe(3);
    expect((listing.results as Array<{number:number}>).map((x)=>x.number)).toEqual([3,2,1]);
    expect(readHistorySession(root,{number:1}).content).toContain('later first session checkpoint');
    const db=new DatabaseSync(path.join(root,'.mcp-probe-kit/state/devcontrol.sqlite3'),{readOnly:true});
    try {
      expect(db.prepare('SELECT count(*) AS n FROM hs_archive').get()?.n).toBe(3);
    }finally{db.close();}
    // Re-reading does not create duplicate records or alter the original files.
    expect(searchHistorySession(root,{}).total).toBe(3);
    expect(fs.existsSync(path.join(root,'docs/history-session/3.md'))).toBe(true);
    expect(fs.readFileSync(file1,'utf8')).toContain('later first session checkpoint');
  });

  it('never replaces a newer SQLite checkpoint with divergent old-host Markdown', () => {
    const root=tempProject();
    const original = legacyDocument(1, 'split-writer', 'original source');
    const file = legacyFile(root, 1, original);
    const current=bootstrapHistorySession(root,{session_key:'split-writer'});
    checkpointHistorySession(root,{
      session_key:'split-writer',expected_path:current.current_path,
      raw_user_input:'SQLite-owned checkpoint',turn_id:'sql-writer',
    });
    fs.writeFileSync(file, legacyAppend(original, 'divergent old-file checkpoint', 'old-writer'));
    fs.utimesSync(file,new Date(Date.now()+5_000),new Date(Date.now()+5_000));
    const currentSqlite=readHistorySession(root,{number:1});
    expect(currentSqlite.content).toContain('SQLite-owned checkpoint');
    expect(currentSqlite.content).not.toContain('divergent old-file checkpoint');
    const db=new DatabaseSync(path.join(root,'.mcp-probe-kit/state/devcontrol.sqlite3'),{readOnly:true});
    try{
      const diagnostic=db.prepare("SELECT value FROM hs_meta WHERE key='legacy_conflict_1'").get();
      expect(diagnostic?.value).toMatch(/"sqlite":"[a-f0-9]{64}"/);
      expect(String(diagnostic?.value)).not.toContain('checkpoint');
    }finally{db.close();}
    expect(fs.readFileSync(file,'utf8')).toContain('divergent old-file checkpoint');
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

    const bugText = sqliteContent(root, Number(bug.current_number));
    const releaseText = sqliteContent(root, Number(release.current_number));
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
    const padded = `${sqliteContent(root, Number(boot.current_number))}${'\nline\n'.repeat(50)}`;
    writeSqliteHistoryDocument(root, Number(boot.current_number), padded);

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

    const sealed = sqliteContent(root, Number(boot.current_number));
    expect(sealed).toContain('**Status:** sealed');

    const rotated = sqliteContent(root, Number(result.current_number));
    expect(rotated).toContain('**Status:** active');
    expect(rotated).toContain('"raw_user_input": "seed"');
    expect(rotated).not.toContain('未提供首次用户输入');

    const resumed = bootstrapHistorySession(root, { session_key: 'rotate-me' });
    expect((resumed.state as { current_session: { number: number } }).current_session.number)
      .toBe(result.current_number);
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
