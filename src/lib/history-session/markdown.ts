import { createHash } from 'node:crypto';
import type { CheckpointRecord, InitialInputRecord } from './types.js';

const CHECKPOINT_HEADING = '## 本轮检查点';
const INITIAL_INPUT_HEADING = '## 首次用户输入';

const REDACT_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-]+\b/gi,
  /\b(?:api[_-]?key|token|cookie|password)\s*[=:]\s*['"]?[^\s'"]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function metadata(content: string, label: string): string | undefined {
  const prefix = `**${label}:**`;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length).trim();
      if (value) return value;
    }
  }
  return undefined;
}

export function documentTitle(content: string, number: number): string {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('# ')) continue;
    const rest = trimmed.slice(2);
    const idx = rest.indexOf('：');
    if (idx >= 0) {
      const title = rest.slice(idx + 1).trim();
      if (title) return title;
    }
  }
  return '开发会话';
}

export function renderDocument(
  number: number,
  title: string,
  sessionKey: string,
  createdAt: string,
  initialInput?: InitialInputRecord,
): string {
  const safeTitle = title.trim() || '开发会话';
  let output =
    `# 会话 ${number}：${safeTitle}\n\n`
    + `**Session key:** ${sessionKey}\n`
    + `**Created:** ${createdAt}\n`
    + `**Updated:** ${createdAt}\n`
    + `**Status:** active\n\n`
    + `${INITIAL_INPUT_HEADING}\n\n`;
  if (initialInput) {
    output += jsonBlock(`initial-input revision-1`, initialInput) + '\n';
  } else {
    output += '未提供首次用户输入；服务端无法读取未作为工具参数传入的聊天内容。\n\n';
  }
  output += `${CHECKPOINT_HEADING}\n\n`;
  return output;
}

export function parseInitialInputRecords(content: string): InitialInputRecord[] {
  const body = sectionBody(content, INITIAL_INPUT_HEADING);
  return body ? parseJsonBlocks<InitialInputRecord>(body) : [];
}

export function parseCheckpointRecords(content: string): CheckpointRecord[] {
  const body = sectionBody(content, CHECKPOINT_HEADING);
  return body ? parseJsonBlocks<CheckpointRecord>(body) : [];
}

export function appendCheckpointRecord(content: string, record: CheckpointRecord): string {
  let updated = content;
  if (!updated.includes(CHECKPOINT_HEADING)) {
    if (!updated.endsWith('\n')) updated += '\n';
    updated += `\n${CHECKPOINT_HEADING}\n`;
  }
  if (!updated.endsWith('\n')) updated += '\n';
  updated += jsonBlock(`${record.turn_id} revision-${record.revision}`, record) + '\n';
  return updated;
}

export function appendInitialInputRevision(content: string, record: InitialInputRecord): string {
  const block = jsonBlock(`initial-input revision-${record.revision}`, record);
  const start = content.indexOf(INITIAL_INPUT_HEADING);
  if (start >= 0) {
    const after = start + INITIAL_INPUT_HEADING.length;
    const tail = content.slice(after);
    const next = tail.indexOf('\n## ');
    const insertAt = next >= 0 ? after + next : content.length;
    return content.slice(0, insertAt) + `\n\n${block}` + content.slice(insertAt);
  }
  const cp = content.indexOf(CHECKPOINT_HEADING);
  if (cp >= 0) {
    return content.slice(0, cp) + `${INITIAL_INPUT_HEADING}\n\n${block}\n\n` + content.slice(cp);
  }
  return `${content}\n${INITIAL_INPUT_HEADING}\n\n${block}\n`;
}

export function withUpdatedAt(content: string, timestamp: string): string {
  const prefix = '**Updated:**';
  const start = content.indexOf(prefix);
  if (start < 0) return content;
  const end = content.indexOf('\n', start);
  if (end < 0) return content;
  return `${content.slice(0, start)}${prefix} ${timestamp}${content.slice(end)}`;
}

export function withStatus(content: string, status: string): string {
  const prefix = '**Status:**';
  const start = content.indexOf(prefix);
  if (start < 0) {
    const updated = content.indexOf('**Updated:**');
    if (updated < 0) return `${content}\n${prefix} ${status}\n`;
    const end = content.indexOf('\n', updated);
    const insertAt = end < 0 ? content.length : end + 1;
    return `${content.slice(0, insertAt)}${prefix} ${status}\n${content.slice(insertAt)}`;
  }
  const end = content.indexOf('\n', start);
  if (end < 0) return `${content.slice(0, start)}${prefix} ${status}`;
  return `${content.slice(0, start)}${prefix} ${status}${content.slice(end)}`;
}

export function redactText(value: string): { text: string; redacted: boolean } {
  let text = value;
  let redacted = false;
  for (const pattern of REDACT_PATTERNS) {
    const next = text.replace(pattern, '[REDACTED]');
    if (next !== text) redacted = true;
    text = next;
  }
  return { text, redacted };
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(stableFingerprintPayload(value), 'utf8').digest('hex');
}

export function initialInputFingerprint(raw: string): string {
  return contentHash({ raw_user_input: raw });
}

export function checkpointFingerprint(record: CheckpointRecord): string {
  const clone: CheckpointRecord = {
    ...record,
    timestamp: '',
    revision: 0,
    supersedes: undefined,
    content_hash: '',
  };
  return contentHash(clone);
}

export function checkpointFromArgs(
  args: Record<string, unknown>,
  defaultTimestamp: string,
): CheckpointRecord {
  const turnId = stringField(args, 'turn_id') ?? '';
  const record: CheckpointRecord = {
    turn_id: turnId,
    timestamp: stringField(args, 'timestamp') ?? '',
    user_intent: stringField(args, 'user_intent') ?? '',
    raw_user_input: stringField(args, 'raw_user_input') ?? '',
    revision: 0,
    content_hash: '',
    findings: stringArray(args, 'findings'),
    decisions: stringArray(args, 'decisions'),
    files_changed: stringArray(args, 'files_changed'),
    tests: stringArray(args, 'tests'),
    runtime_state: stringArray(args, 'runtime_state'),
    remaining_issues: stringArray(args, 'remaining_issues'),
    next_actions: stringArray(args, 'next_actions'),
    notes: stringField(args, 'notes') ?? '',
  };
  if (!record.turn_id) {
    record.turn_id = `auto-${contentHash(record).slice(0, 12)}`;
  }
  if (!record.timestamp) record.timestamp = defaultTimestamp;
  const redactedInput = redactText(record.raw_user_input);
  record.raw_user_input = redactedInput.text;
  record.content_hash = checkpointFingerprint(record);
  return record;
}

function sectionBody(content: string, heading: string): string | undefined {
  const start = content.indexOf(heading);
  if (start < 0) return undefined;
  const after = start + heading.length;
  const tail = content.slice(after);
  const end = tail.indexOf('\n## ');
  return (end >= 0 ? tail.slice(0, end) : tail).trim();
}

function parseJsonBlocks<T>(content: string): T[] {
  const records: T[] = [];
  let remaining = content;
  while (true) {
    const fenceStart = remaining.indexOf('```json\n');
    if (fenceStart < 0) break;
    const jsonStart = fenceStart + '```json\n'.length;
    const fenceEnd = remaining.indexOf('\n```', jsonStart);
    if (fenceEnd < 0) break;
    const jsonText = remaining.slice(jsonStart, fenceEnd);
    try {
      records.push(JSON.parse(jsonText) as T);
    } catch {
      /* skip malformed */
    }
    remaining = remaining.slice(fenceEnd + '\n```'.length);
  }
  return records;
}

function jsonBlock(heading: string, value: unknown): string {
  return `### ${heading}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

function stringField(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function stringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function stableFingerprintPayload(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}
