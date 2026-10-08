import { okStructured } from '../lib/response.js';
import { resolveWorkspaceRootWithMeta } from '../lib/workspace-root.js';
import { isHistorySessionEnabled } from '../lib/history-session-config.js';
import {
  bootstrapHistorySession,
  checkpointHistorySession,
  readHistorySession,
  searchHistorySession,
  validateHistorySession,
} from '../lib/history-session/index.js';
import { handleToolError } from '../utils/error-handler.js';
import { getString, parseArgs } from '../utils/parseArgs.js';

function resolveRoot(args: Record<string, unknown>): string {
  const explicit =
    getString(args.project_root)
    || getString(args.workspace_root)
    || '';
  return resolveWorkspaceRootWithMeta(explicit || undefined).root;
}

function asRecord(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function ensureEnabled(): void {
  if (!isHistorySessionEnabled()) {
    const error = new Error(
      'History Session is disabled. Unset MCP_HISTORY_SESSION or set it to a non-off value to enable.',
    ) as Error & { code?: string };
    error.code = 'HISTORY_SESSION_DISABLED';
    throw error;
  }
}

function historyErrorResponse(error: unknown, tool: string) {
  const err = error as Error & { code?: string; retryable?: boolean; details?: unknown };
  if (err?.code) {
    return {
      content: [{ type: 'text' as const, text: err.message }],
      isError: true,
      structuredContent: {
        ok: false,
        code: err.code,
        message: err.message,
        retryable: Boolean(err.retryable),
        details: err.details,
        tool,
      },
    };
  }
  return handleToolError(error, tool);
}

export async function historySessionBootstrap(args: unknown) {
  try {
    ensureEnabled();
    const parsed = parseArgs<Record<string, unknown>>(args, {
      fieldAliases: {
        project_root: ['projectRoot', 'workspace_root', 'workspaceRoot'],
        session_key: ['sessionKey'],
        initial_user_input: ['initialUserInput'],
        history_dir: ['historyDir'],
        create_if_missing: ['createIfMissing'],
        _host_session_key: ['hostSessionKey'],
      },
    });
    const root = resolveRoot(parsed);
    const result = bootstrapHistorySession(root, asRecord(parsed));
    return okStructured(
      result.created
        ? `已创建历史会话 #${result.current_number}（${result.session_key_source}）`
        : `已恢复历史会话 #${result.current_number}（${result.session_key_source}）`,
      result,
    );
  } catch (error) {
    return historyErrorResponse(error, 'history_session_bootstrap');
  }
}

export async function historySessionCheckpoint(args: unknown) {
  try {
    ensureEnabled();
    const parsed = parseArgs<Record<string, unknown>>(args, {
      fieldAliases: {
        project_root: ['projectRoot', 'workspace_root', 'workspaceRoot'],
        session_key: ['sessionKey'],
        expected_path: ['expectedPath'],
        history_dir: ['historyDir'],
        turn_id: ['turnId'],
        raw_user_input: ['rawUserInput'],
        user_intent: ['userIntent'],
        files_changed: ['filesChanged'],
        remaining_issues: ['remainingIssues'],
        next_actions: ['nextActions'],
        runtime_state: ['runtimeState'],
      },
    });
    const root = resolveRoot(parsed);
    const result = checkpointHistorySession(root, asRecord(parsed));
    return okStructured(
      result.duplicate_ignored
        ? `检查点已幂等忽略（#${result.current_number}）`
        : result.rotated
          ? `检查点已写入并轮转至 #${result.current_number}`
          : `检查点已写入 #${result.current_number}`,
      result,
    );
  } catch (error) {
    return historyErrorResponse(error, 'history_session_checkpoint');
  }
}

export async function historySessionValidate(args: unknown) {
  try {
    ensureEnabled();
    const parsed = parseArgs<Record<string, unknown>>(args, {
      fieldAliases: {
        project_root: ['projectRoot', 'workspace_root', 'workspaceRoot'],
        history_dir: ['historyDir'],
      },
    });
    const root = resolveRoot(parsed);
    const result = validateHistorySession(root, asRecord(parsed));
    return okStructured(
      result.sequence_valid ? '历史档案序列有效' : '历史档案序列存在问题',
      result,
    );
  } catch (error) {
    return historyErrorResponse(error, 'history_session_validate');
  }
}

export async function historySessionSearch(args: unknown) {
  try {
    ensureEnabled();
    const parsed = parseArgs<Record<string, unknown>>(args, {
      fieldAliases: {
        project_root: ['projectRoot', 'workspace_root', 'workspaceRoot'],
        history_dir: ['historyDir'],
      },
    });
    const root = resolveRoot(parsed);
    const result = searchHistorySession(root, asRecord(parsed));
    return okStructured(`历史搜索命中 ${result.total} 条`, result);
  } catch (error) {
    return historyErrorResponse(error, 'history_session_search');
  }
}

export async function historySessionRead(args: unknown) {
  try {
    ensureEnabled();
    const parsed = parseArgs<Record<string, unknown>>(args, {
      fieldAliases: {
        project_root: ['projectRoot', 'workspace_root', 'workspaceRoot'],
        history_dir: ['historyDir'],
        max_bytes: ['maxBytes'],
        expected_hash: ['expectedHash'],
      },
    });
    const root = resolveRoot(parsed);
    const result = readHistorySession(root, asRecord(parsed));
    return okStructured(`已读取历史档案 #${result.number}`, result);
  } catch (error) {
    return historyErrorResponse(error, 'history_session_read');
  }
}
