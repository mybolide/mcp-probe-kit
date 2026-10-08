import * as path from 'node:path';
import {
  BOOTSTRAP_RESPONSE_BUDGET,
  PROJECT_ACTIVE_SESSION_KEY,
  getHistoryLimits,
  type HistorySessionLimits,
} from '../history-session-config.js';
import {
  appendCheckpointRecord,
  appendInitialInputRevision,
  checkpointFingerprint,
  checkpointFromArgs,
  documentTitle,
  initialInputFingerprint,
  parseCheckpointRecords,
  parseInitialInputRecords,
  redactText,
  renderDocument,
  withStatus,
  withUpdatedAt,
} from './markdown.js';
import {
  archiveNeedsRotate,
  buildManifest,
  buildState,
  ensureDirectory,
  historyError,
  lockDirectory,
  readState,
  relativeArchivePath,
  resolveHistoryDir,
  scan,
  sha256Text,
  writeManifest,
  writeMarkdown,
  writeState,
} from './storage.js';
import {
  latestNumber,
  sequenceValid,
  totalBytes,
  type HistoryDocument,
  type InitialInputRecord,
  type ScanReport,
} from './types.js';

export type SessionSource = 'platform_conversation_id' | 'explicit_session_key' | 'project_active';

function nowTimestamp(): string {
  return new Date().toISOString();
}

export function resolveSessionKey(args: Record<string, unknown>): {
  sessionKey: string;
  source: SessionSource;
} {
  const host = typeof args._host_session_key === 'string' ? args._host_session_key.trim() : '';
  if (host) return { sessionKey: host, source: 'platform_conversation_id' };
  const explicit = typeof args.session_key === 'string' ? args.session_key.trim() : '';
  if (explicit) return { sessionKey: explicit, source: 'explicit_session_key' };
  return { sessionKey: PROJECT_ACTIVE_SESSION_KEY, source: 'project_active' };
}

function findLatestBySession(report: ScanReport, sessionKey: string): HistoryDocument | undefined {
  const matches = report.documents.filter((d) => d.sessionKey === sessionKey && !d.sealed);
  if (matches.length) return matches[matches.length - 1];
  const sealed = report.documents.filter((d) => d.sessionKey === sessionKey);
  return sealed.length ? sealed[sealed.length - 1] : undefined;
}

function resolveActiveDocument(
  report: ScanReport,
  historyDir: string,
  sessionKey: string,
  source: SessionSource,
): HistoryDocument | undefined {
  if (source === 'project_active') {
    const state = readState(historyDir);
    const n = state?.current_session?.number;
    if (n) {
      const byState = report.documents.find((d) => d.number === n);
      if (byState) return byState;
    }
    const byKey = findLatestBySession(report, sessionKey);
    if (byKey) return byKey;
    return report.documents.filter((d) => !d.sealed).at(-1) ?? report.documents.at(-1);
  }
  return findLatestBySession(report, sessionKey);
}

function persistDerived(
  projectRoot: string,
  historyDir: string,
  currentNumber: number | undefined,
  previousRevision: number,
): { manifest: ReturnType<typeof buildManifest>; state: ReturnType<typeof buildState> } {
  const refreshed = scan(projectRoot, historyDir);
  const manifest = buildManifest(refreshed);
  const state = buildState(refreshed, manifest, currentNumber, nowTimestamp(), previousRevision + 1);
  writeManifest(historyDir, manifest);
  writeState(historyDir, state);
  return { manifest, state };
}

function sealArchive(historyDir: string, document: HistoryDocument, timestamp: string): void {
  const sealed = withStatus(withUpdatedAt(document.content, timestamp), 'sealed');
  writeMarkdown(path.join(historyDir, `${document.number}.md`), sealed);
}

function latestInitialInput(content: string): InitialInputRecord | undefined {
  const records = parseInitialInputRecords(content);
  if (!records.length) return undefined;
  return records.reduce((best, item) => (item.revision >= best.revision ? item : best), records[0]);
}

function carriedInitialInput(
  previous: InitialInputRecord | undefined,
  timestamp: string,
): InitialInputRecord | undefined {
  if (!previous?.raw_user_input?.trim()) return undefined;
  return {
    raw_user_input: previous.raw_user_input,
    captured_at: previous.captured_at || timestamp,
    revision: 1,
    content_hash: previous.content_hash || initialInputFingerprint(previous.raw_user_input),
  };
}

function rotateArchive(
  projectRoot: string,
  historyDir: string,
  document: HistoryDocument,
  sessionKey: string,
): HistoryDocument {
  const timestamp = nowTimestamp();
  sealArchive(historyDir, document, timestamp);
  const number = (latestNumber(scan(projectRoot, historyDir)) ?? document.number) + 1;
  const title = documentTitle(document.content, document.number);
  const initialInput = carriedInitialInput(latestInitialInput(document.content), timestamp);
  writeMarkdown(
    path.join(historyDir, `${number}.md`),
    renderDocument(number, title, sessionKey, timestamp, initialInput),
  );
  const refreshed = scan(projectRoot, historyDir);
  const next = findLatestBySession(refreshed, sessionKey);
  if (!next) {
    throw historyError('HISTORY_ROTATE_FAILED', 'Failed to open rotated archive.', true);
  }
  return next;
}

export function bootstrapHistorySession(
  projectRoot: string,
  args: Record<string, unknown>,
  _limits: HistorySessionLimits = getHistoryLimits(),
): Record<string, unknown> {
  const { sessionKey, source } = resolveSessionKey(args);
  const historyDir = resolveHistoryDir(projectRoot, typeof args.history_dir === 'string' ? args.history_dir : undefined);
  const lock = lockDirectory(historyDir);
  try {
    ensureDirectory(historyDir);
    const report = scan(projectRoot, historyDir);
    if (report.missingNumbers.length) {
      throw historyError(
        'HISTORY_SEQUENCE_CONFLICT',
        'History numbering contains gaps; run history_session_validate before creating a session.',
        true,
        { missing_numbers: report.missingNumbers },
      );
    }
    if (report.duplicateSessionKeys.includes(sessionKey)) {
      throw historyError(
        'HISTORY_INDEX_CONFLICT',
        'Multiple active history files declare the same session_key.',
        false,
        { duplicate_session_keys: report.duplicateSessionKeys },
      );
    }

    const mode = typeof args.mode === 'string' && args.mode === 'fresh' ? 'fresh' : 'resume';
    const warnings: string[] = [];
    const requestedInitial = typeof args.initial_user_input === 'string' && args.initial_user_input.trim()
      ? args.initial_user_input
      : undefined;

    let currentNumber: number;
    let currentPath: string;
    let created = false;
    let resumed = false;
    let initialInputCaptured = false;

    const existing = mode === 'fresh'
      ? undefined
      : resolveActiveDocument(report, historyDir, sessionKey, source);

    if (existing) {
      currentNumber = existing.number;
      currentPath = existing.path;
      resumed = true;
      const initialRecords = parseInitialInputRecords(existing.content);
      initialInputCaptured = initialRecords.length > 0;
      if (requestedInitial) {
        const { text, redacted } = redactText(requestedInitial);
        if (redacted) warnings.push('首次用户输入含疑似敏感信息，归档内容已脱敏。');
        const hash = initialInputFingerprint(text);
        if (!initialRecords.some((r) => r.content_hash === hash)) {
          const latest = initialRecords.reduce(
            (a, b) => (b.revision >= a.revision ? b : a),
            initialRecords[0],
          );
          const revision = latest ? latest.revision + 1 : 1;
          const record: InitialInputRecord = {
            raw_user_input: text,
            captured_at: nowTimestamp(),
            revision,
            supersedes: latest ? `initial-input revision-${latest.revision}` : undefined,
            content_hash: hash,
          };
          const updated = appendInitialInputRevision(
            withUpdatedAt(existing.content, record.captured_at),
            record,
          );
          writeMarkdown(path.join(historyDir, `${existing.number}.md`), updated);
        }
        initialInputCaptured = true;
      } else if (!initialInputCaptured) {
        warnings.push('未提供 initial_user_input；服务端无法读取未作为工具参数传入的首次用户输入。');
      }
    } else {
      if (args.create_if_missing === false) {
        throw historyError('SESSION_NOT_BOOTSTRAPPED', 'No history mapping exists for this session_key.', false, {
          session_key_source: source,
        });
      }
      currentNumber = (latestNumber(report) ?? 0) + 1;
      currentPath = relativeArchivePath(projectRoot, historyDir, currentNumber);
      created = true;
      const timestamp = nowTimestamp();
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : '开发会话';
      let initial: InitialInputRecord | undefined;
      if (requestedInitial) {
        const { text, redacted } = redactText(requestedInitial);
        if (redacted) warnings.push('首次用户输入含疑似敏感信息，归档内容已脱敏。');
        initial = {
          raw_user_input: text,
          captured_at: timestamp,
          revision: 1,
          content_hash: initialInputFingerprint(text),
        };
        initialInputCaptured = true;
      } else {
        warnings.push('未提供 initial_user_input；服务端无法读取未作为工具参数传入的首次用户输入。');
      }
      writeMarkdown(
        path.join(historyDir, `${currentNumber}.md`),
        renderDocument(currentNumber, title, sessionKey, timestamp, initial),
      );
    }

    const previous = readState(historyDir)?.state_revision ?? 0;
    const { manifest, state } = persistDerived(projectRoot, historyDir, currentNumber, previous);
    const refreshed = scan(projectRoot, historyDir);

    const continuity = mode === 'fresh'
      ? {
          current_focus: '',
          recent_changes: [] as string[],
          open_items: [] as string[],
          references: [] as typeof state.references,
        }
      : {
          current_focus: state.current_focus,
          recent_changes: state.recent_changes,
          open_items: state.open_items,
          references: state.references,
        };

    let result: Record<string, unknown> = {
      is_new_session: created,
      session_key: sessionKey,
      session_key_source: source,
      platform_conversation_id: source === 'platform_conversation_id' ? true : undefined,
      current_number: currentNumber,
      current_path: currentPath,
      created,
      resumed,
      mode,
      initial_input_captured: initialInputCaptured,
      sequence_valid: sequenceValid(refreshed),
      history_count: refreshed.documents.length,
      total_history_bytes: totalBytes(refreshed),
      state_revision: state.state_revision,
      archive_revision: manifest.archive_revision,
      state: { ...state, ...continuity },
      continuity,
      history_read_mode: 'bounded_state_with_on_demand_search_and_read',
      persistence_mode: 'model_mediated_tool_calls',
      assistant_instructions:
        mode === 'fresh'
          ? 'Fresh mode: do not use prior focus/open items. Preserve session_key and current_path. Checkpoint with raw_user_input before final response.'
          : 'Use the bounded continuity state to begin work. Call history_session_search then history_session_read for exact earlier context. Preserve session_key and current_path. Before the final response, call history_session_checkpoint with verbatim raw_user_input.',
      required_next_actions: [
        'review_bounded_state',
        'search_or_read_relevant_archives_when_precision_is_needed',
        'verify_workspace_state',
        'execute_user_task',
        'checkpoint_with_raw_user_input_before_final_response',
      ],
      checkpoint_policy: {
        tool: 'history_session_checkpoint',
        session_key: sessionKey,
        expected_path: currentPath,
        raw_user_input_required_for_full_fidelity: true,
        required_before_final_response: true,
      },
      search_guide: {
        tool: 'history_session_search',
        then_read_with: 'history_session_read',
        archive_is_lossless: true,
      },
      warnings,
    };

    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > BOOTSTRAP_RESPONSE_BUDGET) {
      result = {
        ...result,
        state: {
          ...state,
          current_focus: String(continuity.current_focus).slice(0, 256),
          recent_changes: [],
          open_items: [],
          references: [],
        },
        continuity: {
          current_focus: String(continuity.current_focus).slice(0, 256),
          recent_changes: [],
          open_items: [],
          references: [],
        },
        state_truncated: true,
      };
    }
    return result;
  } finally {
    lock.release();
  }
}

export function checkpointHistorySession(
  projectRoot: string,
  args: Record<string, unknown>,
  limits: HistorySessionLimits = getHistoryLimits(),
): Record<string, unknown> {
  const sessionKey = typeof args.session_key === 'string' ? args.session_key.trim() : '';
  const expectedPath = typeof args.expected_path === 'string'
    ? args.expected_path.trim().replace(/\\/g, '/')
    : '';
  if (!sessionKey || !expectedPath) {
    throw historyError(
      'SESSION_NOT_BOOTSTRAPPED',
      'Pass session_key and expected_path exactly as returned by history_session_bootstrap.',
      false,
    );
  }
  const historyDir = resolveHistoryDir(projectRoot, typeof args.history_dir === 'string' ? args.history_dir : undefined);
  const lock = lockDirectory(historyDir);
  try {
    let report = scan(projectRoot, historyDir);
    const source: SessionSource = sessionKey === PROJECT_ACTIVE_SESSION_KEY
      ? 'project_active'
      : 'explicit_session_key';
    let document = resolveActiveDocument(report, historyDir, sessionKey, source)
      ?? findLatestBySession(report, sessionKey);
    if (!document) {
      throw historyError('SESSION_NOT_BOOTSTRAPPED', 'The session_key has not been bootstrapped.', false);
    }
    if (document.path !== expectedPath) {
      throw historyError('SESSION_TARGET_MISMATCH', 'expected_path does not match mapped archive.', false, {
        expected_path: expectedPath,
        actual_path: document.path,
        session_key: sessionKey,
      });
    }

    const warnings: string[] = [];
    let rotated = false;
    if (archiveNeedsRotate(document.content, limits)) {
      document = rotateArchive(projectRoot, historyDir, document, sessionKey);
      report = scan(projectRoot, historyDir);
      rotated = true;
      warnings.push(`Archive exceeded limits; rotated to ${document.path}.`);
    }

    const record = checkpointFromArgs(args, nowTimestamp());
    if (!record.raw_user_input) {
      warnings.push('未提供 raw_user_input；服务端无法读取未作为工具参数传入的用户输入。');
    }
    const existing = parseCheckpointRecords(document.content).filter((r) => r.turn_id === record.turn_id);
    const same = existing.find((r) => checkpointFingerprint(r) === record.content_hash);
    if (same) {
      const previous = readState(historyDir)?.state_revision ?? 0;
      persistDerived(projectRoot, historyDir, document.number, previous);
      return {
        ok: true,
        session_key: sessionKey,
        expected_path: document.path,
        current_number: document.number,
        current_path: document.path,
        duplicate_ignored: true,
        rotated,
        content_hash: sha256Text(document.content),
        user_input_captured: Boolean(record.raw_user_input),
        warnings,
      };
    }
    const latest = existing.reduce((a, b) => (b.revision >= a.revision ? b : a), existing[0]);
    record.revision = latest ? latest.revision + 1 : 1;
    if (latest) record.supersedes = `${record.turn_id} revision-${latest.revision}`;

    const updated = appendCheckpointRecord(withUpdatedAt(document.content, record.timestamp), record);
    writeMarkdown(path.join(historyDir, `${document.number}.md`), updated);
    const previous = readState(historyDir)?.state_revision ?? 0;
    persistDerived(projectRoot, historyDir, document.number, previous);

    return {
      ok: true,
      session_key: sessionKey,
      expected_path: document.path,
      current_number: document.number,
      current_path: document.path,
      duplicate_ignored: false,
      revision: record.revision,
      rotated,
      content_hash: sha256Text(updated),
      user_input_captured: Boolean(record.raw_user_input),
      warnings,
    };
  } finally {
    lock.release();
  }
}

export function validateHistorySession(
  projectRoot: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const historyDir = resolveHistoryDir(projectRoot, typeof args.history_dir === 'string' ? args.history_dir : undefined);
  const lock = lockDirectory(historyDir);
  try {
    const report = scan(projectRoot, historyDir);
    const repair = args.repair === true;
    if (repair) {
      const current = readState(historyDir)?.current_session?.number;
      persistDerived(projectRoot, historyDir, current, readState(historyDir)?.state_revision ?? 0);
    }
    return {
      sequence_valid: sequenceValid(report),
      missing_numbers: report.missingNumbers,
      duplicate_session_keys: report.duplicateSessionKeys,
      invalid_files: report.invalidFiles,
      empty_files: report.emptyFiles,
      history_count: report.documents.length,
      total_archive_bytes: totalBytes(report),
      repaired: repair,
    };
  } finally {
    lock.release();
  }
}
