/**
 * v5's primary project-development MCP entry. The SQLite ledger, not a
 * Delegated Plan or an Agent-authored Markdown task, owns project state.
 * Deliberately does not expose the legacy import-spec/ad-hoc task shortcuts.
 */
import { resolve } from 'node:path';
import fs from 'node:fs';
import path from 'node:path';
import { dispatchDevControl } from './command.js';
import { DevControlError, ProjectTaskLedger } from './task-ledger.js';
import { V5_DEVC_ACTIONS } from './action-catalog.js';
import { devControlGuide } from './action-guide.js';
import {mergeDevControlSqlite,type MergeDecision} from './sqlite-merge.js';
import {resolveGitWorktreeContext} from './git-worktree-context.js';
import {resolveProjectDatabase} from './project-storage.js';
import {resolveWorkspaceRootWithMeta,getMcpPackageInstallRoot} from '../lib/workspace-root.js';
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
  let workspace: string;
  if(typeof projectRoot==='string'&&projectRoot.trim()){
    workspace=resolve(projectRoot);
  }else if(projectRoot!==undefined&&projectRoot!==null){
    return failure('PROJECT_ROOT_REQUIRED','project_root must be an existing workspace path');
  }else{
    // Use a verified configured/connected workspace only. In particular do
    // not initialize SQLite in the installed MCP package or guess a child Git
    // repository because the caller omitted project_root.
    let detected:ReturnType<typeof resolveWorkspaceRootWithMeta>;
    try{detected=resolveWorkspaceRootWithMeta();}
    catch(error){return failure('PROJECT_ROOT_REQUIRED',String(error));}
    const candidate=resolve(detected.root);
    const established=['.mcp-probe-kit',path.join('.neyna','state'),
      path.join('.agents','skills','mcp-probe-kit')].some(marker=>
      fs.existsSync(path.join(candidate,marker)));
    if(detected.source==='package-fallback'||candidate===getMcpPackageInstallRoot()||
      !established){
      return failure('PROJECT_ROOT_REQUIRED',
        'No recognized MCP project workspace. Supply project_root (relative to server cwd or absolute on this machine); Git is optional.');
    }
    workspace=candidate;
  }
  if(!fs.existsSync(workspace)||!fs.statSync(workspace).isDirectory())
    return failure('PROJECT_ROOT_REQUIRED','Project workspace directory does not exist');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return failure('INVALID_INPUT', 'input must be a JSON object');
  }
  let ledger: ProjectTaskLedger | undefined;
  try {
    if(action==='sqlite-merge-preview'||action==='sqlite-merge-candidate'){
      const parsed=input as Record<string,unknown>;
      const canonical=fs.existsSync(path.join(workspace,'.git'))?
        resolveGitWorktreeContext(workspace).mainRoot:workspace;
      const result=mergeDevControlSqlite({
        targetPath:resolveProjectDatabase(canonical),
        sourcePath:String(parsed.sourcePath??''),
        mode:action==='sqlite-merge-preview'?'preview':'candidate',
        outputPath:typeof parsed.outputPath==='string'?parsed.outputPath:undefined,
        expectedFingerprint:typeof parsed.expectedFingerprint==='string'?
          parsed.expectedFingerprint:undefined,
        basePath:typeof parsed.basePath==='string'?parsed.basePath:undefined,
        resolutions:parsed.resolutions as MergeDecision[]|undefined,
      });
      return {content:[{type:'text',text:JSON.stringify(result)}],
        structuredContent:result,isError:false};
    }
    ledger = new ProjectTaskLedger(workspace);
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
