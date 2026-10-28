/**
 * v5's primary project-development MCP entry. The SQLite ledger, not a
 * Delegated Plan or an Agent-authored Markdown task, owns project state.
 * Deliberately does not expose the legacy import-spec/ad-hoc task shortcuts.
 */
import { resolve } from 'node:path';
import { dispatchDevControl } from './command.js';
import { DevControlError, ProjectTaskLedger } from './task-ledger.js';
import { V5_DEVC_ACTIONS } from './action-catalog.js';
import { devControlGuide } from './action-guide.js';
import type { RegisteredToolResult } from '../server/tool-definition.js';

export { V5_DEVC_ACTIONS } from './action-catalog.js';

const actionSet: ReadonlySet<string> = new Set(V5_DEVC_ACTIONS);

export async function runV5DevControlTool(args: unknown): Promise<RegisteredToolResult> {
  const value = args && typeof args === 'object' && !Array.isArray(args)
    ? args as Record<string, unknown> : {};
  const action = value.action;
  const projectRoot = value.project_root;
  const input = value.input ?? {};
  if (typeof action !== 'string' || !actionSet.has(action)) {
    return failure('UNSUPPORTED_V5_ACTION', 'Unknown v5 operation. Call devcontrol action=guide with input={intent:"feature|task|verification|bug|idea|scope"} for supported actions and examples.');
  }
  if (action === 'guide') {
    const result = devControlGuide(input && typeof input==='object' && !Array.isArray(input)
      ? input as Record<string,unknown> : {});
    return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false};
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
