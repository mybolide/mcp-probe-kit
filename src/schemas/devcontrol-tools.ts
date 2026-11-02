import { V5_DEVC_ACTIONS } from '../devcontrol/model-tool.js';

export const devcontrolToolSchemas = [{
  name: 'devcontrol',
  description: 'MCP Probe Kit v5 SQLite project governance for Git or Git-free workspaces. FIRST use action=guide if unsure; guide needs no project_root. Other actions discover an established MCP workspace or accept the target project_root when discovery is unavailable. The developer AI runs real tests and reviews deliveries; Owner approves frozen plans. No retired v4 file workflows.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: { type: 'string', enum: [...V5_DEVC_ACTIONS], description: 'Start with guide (read-only) when unsure, then use the recommended exact SQLite action.' },
      project_root: { type: 'string', description: 'Optional for recognized MCP project workspaces; otherwise provide the existing target application workspace path (Git or Git-free), never the MCP install/source directory. Relative paths use MCP server cwd; absolute paths are local to this machine.' },
      input: { type: 'object', description: 'For guide, {intent:"start|feature|planning|task|verification|bug|idea|scope|architecture"}; other actions need operation-specific IDs, hashes, leases and reviewed parameters.', additionalProperties: true },
    },
  },
}];
