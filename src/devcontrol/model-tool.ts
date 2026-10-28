/**
 * v5's primary project-development MCP entry. The SQLite ledger, not a
 * Delegated Plan or an Agent-authored Markdown task, owns project state.
 * Deliberately does not expose the legacy import-spec/ad-hoc task shortcuts.
 */
import { resolve } from 'node:path';
import { dispatchDevControl } from './command.js';
import { DevControlError, ProjectTaskLedger } from './task-ledger.js';
import type { RegisteredToolResult } from '../server/tool-definition.js';

export const V5_DEVC_ACTIONS = [
  'onboard', 'next', 'list', 'get', 'execution-contract', 'task-detail-audit',
  'release-plan', 'plan-review', 'plan-propose', 'plan-revise', 'plan-approve',
  'release-work-plan', 'release-work-review', 'release-work-stage', 'release-work-approve',
  'release-work-scope-review', 'release-work-scope-stage', 'release-work-scope-get',
  'release-work-scope-independent-review', 'release-work-scope-approve', 'release-work-scope-withdraw',
  'release-work-incremental-review', 'release-work-incremental-stage', 'release-work-incremental-get',
  'release-work-incremental-independent-review', 'release-work-incremental-approve',
  'release-work-incremental-withdraw', 'pause-for-scope', 'pause-for-reviewed-incremental',
  'features', 'feature-get', 'feature-create', 'feature-save', 'feature-validate', 'feature-export',
  'feature-task-brief', 'feature-task-plan', 'feature-task-plans', 'feature-task-review',
  'feature-task-stage', 'feature-task-propose', 'feature-task-approve',
  'work-items', 'work-record', 'architecture-sync', 'bug-get', 'bug-step-save', 'bug-task-link',
  'idea-capture', 'idea-list', 'idea-get', 'idea-assess', 'idea-review', 'idea-decide',
  'artifact-get', 'artifact-check', 'artifact-stage', 'artifact-independent-review', 'artifact-approve',
  'claim', 'renew', 'release', 'check', 'report', 'gate-review', 'complete', 'verify', 'trace',
  'decision-save', 'decision-get', 'local-developer', 'hook-status', 'hook-install',
] as const;

const actionSet: ReadonlySet<string> = new Set(V5_DEVC_ACTIONS);

export async function runV5DevControlTool(args: unknown): Promise<RegisteredToolResult> {
  const value = args && typeof args === 'object' && !Array.isArray(args)
    ? args as Record<string, unknown> : {};
  const action = value.action;
  const projectRoot = value.project_root;
  const input = value.input ?? {};
  if (typeof action !== 'string' || !actionSet.has(action)) {
    return failure('UNSUPPORTED_V5_ACTION', 'Use an action from the v5 SQLite DevControl operation list');
  }
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) {
    return failure('PROJECT_ROOT_REQUIRED', 'Provide the target Git project_root; never infer the MCP source checkout');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return failure('INVALID_INPUT', 'input must be a JSON object');
  }
  let ledger: ProjectTaskLedger | undefined;
  try {
    ledger = new ProjectTaskLedger(resolve(projectRoot));
    const result = dispatchDevControl(ledger, action, input as Record<string, any>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
      isError: 'passed' in result && result.passed === false,
    };
  } catch (error) {
    return failure(error instanceof DevControlError ? error.code : 'DEVCONTROL_ERROR',
      error instanceof Error ? error.message : String(error));
  } finally {
    ledger?.close();
  }
}

function failure(code: string, message: string): RegisteredToolResult {
  const result = { ok: false, code, message };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
}
