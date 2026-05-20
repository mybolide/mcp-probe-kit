import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sqlite3 from 'sqlite3';
import { createToolError } from '../utils/error-handler.js';

export interface CursorConversationSummary {
  composerId: string;
  name: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  workspaceId?: string;
  workspacePath?: string;
  mode?: string;
  contextUsagePercent?: number;
  subtitle?: string;
  isArchived?: boolean;
  source: 'composerHeaders';
}

export interface CursorConversationMessage {
  bubbleId: string;
  type: number;
  text: string;
  createdAt?: string;
  requestId?: string;
}

export interface CursorConversationDetail {
  composerId: string;
  messages: CursorConversationMessage[];
}

export interface CursorHistorySearchResult {
  composerId: string;
  conversationName: string;
  bubbleId: string;
  type: number;
  text: string;
  createdAt?: string;
  requestId?: string;
}

interface ComposerHeadersPayload {
  allComposers?: Array<Record<string, unknown>>;
}

interface CursorDbRow {
  key: string;
  value: string;
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveCursorGlobalDbPath(): string {
  const appData = process.env.APPDATA?.trim();
  const homeDir = os.homedir();
  const candidates = [
    appData ? path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb') : '',
    path.join(homeDir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
  ].filter(Boolean);

  const hit = candidates.find(fileExists);
  if (!hit) {
    throw createToolError('未找到 Cursor 全局状态库 state.vscdb', undefined, {
      candidates,
    });
  }

  return hit;
}

function openDatabase(dbPath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (error) => {
      if (error) {
        reject(createToolError(`打开 Cursor 数据库失败: ${error.message}`, error, { dbPath }));
        return;
      }
      resolve(db);
    });
  });
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function allRows<T = CursorDbRow>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve((rows ?? []) as T[]);
    });
  });
}

function getRow<T = CursorDbRow>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row as T | undefined);
    });
  });
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function extractConversationsFromHeaders(payload: ComposerHeadersPayload | null): CursorConversationSummary[] {
  const items = payload?.allComposers ?? [];
  return items
    .filter((item) => item?.type === 'head')
    .map((item) => {
      const workspace = (item.workspaceIdentifier as Record<string, unknown> | undefined) ?? {};
      const uri = (workspace.uri as Record<string, unknown> | undefined) ?? {};
      return {
        composerId: asString(item.composerId),
        name: asString(item.name),
        createdAt: asNumber(item.createdAt),
        lastUpdatedAt: asNumber(item.lastUpdatedAt),
        workspaceId: asString(workspace.id) || undefined,
        workspacePath: asString(uri.fsPath) || undefined,
        mode: asString(item.unifiedMode) || undefined,
        contextUsagePercent: asNumber(item.contextUsagePercent),
        subtitle: asString(item.subtitle) || undefined,
        isArchived: asBoolean(item.isArchived) ?? false,
        source: 'composerHeaders',
      } satisfies CursorConversationSummary;
    });
}

function extractBubbleId(key: string): string {
  const parts = key.split(':');
  return parts[parts.length - 1] || key;
}

function extractComposerId(key: string): string {
  const parts = key.split(':');
  return parts.length >= 3 ? parts[1] || '' : '';
}

export class CursorHistoryClient {
  private async withDatabase<T>(runner: (db: sqlite3.Database) => Promise<T>): Promise<T> {
    const dbPath = resolveCursorGlobalDbPath();
    const db = await openDatabase(dbPath);

    try {
      return await runner(db);
    } catch (error) {
      if (error instanceof Error) {
        throw createToolError(`读取 Cursor 历史失败: ${error.message}`, error, { dbPath });
      }
      throw error;
    } finally {
      await closeDatabase(db).catch(() => undefined);
    }
  }

  private async loadConversationIndex(db: sqlite3.Database): Promise<CursorConversationSummary[]> {
    const row = await getRow<CursorDbRow>(db, "select key, value from ItemTable where key = ?", ['composer.composerHeaders']);
    const payload = parseJson<ComposerHeadersPayload>(row?.value);
    return extractConversationsFromHeaders(payload);
  }

  async listConversations(params: {
    titleQuery?: string;
    workspaceQuery?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {}): Promise<CursorConversationSummary[]> {
    return this.withDatabase(async (db) => {
      const titleQuery = (params.titleQuery ?? '').trim().toLowerCase();
      const workspaceQuery = (params.workspaceQuery ?? '').trim().toLowerCase();
      const includeArchived = params.includeArchived ?? false;
      const limit = Math.max(1, Math.min(params.limit ?? 20, 200));

      const conversations = await this.loadConversationIndex(db);
      return conversations
        .filter((item) => includeArchived || !item.isArchived)
        .filter((item) => !titleQuery || item.name.toLowerCase().includes(titleQuery))
        .filter((item) => !workspaceQuery || (item.workspacePath ?? '').toLowerCase().includes(workspaceQuery))
        .sort((a, b) => (b.lastUpdatedAt ?? 0) - (a.lastUpdatedAt ?? 0))
        .slice(0, limit);
    });
  }

  async searchHistory(params: {
    query: string;
    composerId?: string;
    limit?: number;
  }): Promise<CursorHistorySearchResult[]> {
    return this.withDatabase(async (db) => {
      const query = (params.query ?? '').trim().toLowerCase();
      if (!query) {
        throw new Error('缺少 query');
      }

      const limit = Math.max(1, Math.min(params.limit ?? 20, 200));
      const composerId = (params.composerId ?? '').trim();
      const index = await this.loadConversationIndex(db);
      const names = new Map(index.map((item) => [item.composerId, item.name]));
      const rows = await allRows<CursorDbRow>(
        db,
        'select key, value from cursorDiskKV where key like ?',
        [composerId ? `bubbleId:${composerId}:%` : 'bubbleId:%']
      );

      const matches = rows
        .map<CursorHistorySearchResult | null>((row) => {
          const parsed = parseJson<Record<string, unknown>>(row.value);
          if (!parsed) {
            return null;
          }

          const text = asString(parsed.text);
          const requestId = asString(parsed.requestId);
          const haystack = `${row.key}\n${text}\n${requestId}`.toLowerCase();
          if (!haystack.includes(query)) {
            return null;
          }

          const currentComposerId = extractComposerId(row.key);
          return {
            composerId: currentComposerId,
            conversationName: names.get(currentComposerId) ?? '',
            bubbleId: extractBubbleId(row.key),
            type: asNumber(parsed.type) ?? 0,
            text,
            createdAt: asString(parsed.createdAt) || undefined,
            requestId: requestId || undefined,
          };
        })
        .filter((item): item is CursorHistorySearchResult => item !== null)
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .slice(0, limit);

      return matches;
    });
  }

  async readConversation(params: {
    composerId: string;
    limit?: number;
    includeEmpty?: boolean;
  }): Promise<CursorConversationDetail> {
    return this.withDatabase(async (db) => {
      const composerId = (params.composerId ?? '').trim();
      if (!composerId) {
        throw new Error('缺少 composer_id');
      }

      const limit = Math.max(1, Math.min(params.limit ?? 200, 2000));
      const includeEmpty = params.includeEmpty ?? false;
      const rows = await allRows<CursorDbRow>(
        db,
        'select key, value from cursorDiskKV where key like ?',
        [`bubbleId:${composerId}:%`]
      );

      const messages = rows
        .map<CursorConversationMessage | null>((row) => {
          const parsed = parseJson<Record<string, unknown>>(row.value);
          if (!parsed) {
            return null;
          }

          const text = asString(parsed.text);
          if (!includeEmpty && !text) {
            return null;
          }

          return {
            bubbleId: extractBubbleId(row.key),
            type: asNumber(parsed.type) ?? 0,
            text,
            createdAt: asString(parsed.createdAt) || undefined,
            requestId: asString(parsed.requestId) || undefined,
          };
        })
        .filter((item): item is CursorConversationMessage => item !== null)
        .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
        .slice(0, limit);

      return {
        composerId,
        messages,
      };
    });
  }
}

export function createCursorHistoryClient() {
  return new CursorHistoryClient();
}