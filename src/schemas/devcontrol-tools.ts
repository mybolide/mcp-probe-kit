import { V5_DEVC_ACTIONS } from '../devcontrol/model-tool.js';

export const devcontrolToolSchemas = [{
  name: 'devcontrol',
  description: 'MCP Probe Kit v5 SQLite project governance with approved frozen task contracts. Unsure what to call? FIRST use action=guide with input={intent:"feature"|"task"|"verification"|"bug"|"idea"|"scope"}. Guide is read-only and needs no project_root. All other actions use project_root of the target Git project. Agent reviews changes, executes business tests, and performs independent review; Owner explicitly approves frozen plans. No retired v4 file workflows.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: { type: 'string', enum: [...V5_DEVC_ACTIONS], description: 'Start with guide (read-only) when unsure, then use the recommended exact SQLite action.' },
      project_root: { type: 'string', description: 'Required for all actions except guide. Absolute Git root of TARGET application (not MCP source).' },
      input: { type: 'object', description: 'For guide, {intent:"start|feature|planning|task|verification|bug|idea|scope|architecture"}; other actions need operation-specific IDs, hashes, leases and reviewed parameters.', additionalProperties: true },
    },
  },
}];
