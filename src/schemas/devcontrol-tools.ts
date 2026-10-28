import { V5_DEVC_ACTIONS } from '../devcontrol/model-tool.js';

export const devcontrolToolSchemas = [{
  name: 'devcontrol',
  description: 'MCP Probe Kit v5 ONLY project-development entry. Manage requirements, Features, Bugs, Ideas, release plans, scope approvals, task leases, real gates and audit evidence in the target Git project SQLite ledger. The Agent reviews, writes code and runs actual tests; DevControl never substitutes for independent review or Owner authorization. All work uses approved frozen task contracts; old Markdown/Delegated Plan workflows are not accepted.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'project_root'],
    properties: {
      action: { type: 'string', enum: [...V5_DEVC_ACTIONS], description: 'Exact DevControl operation from the v5 SQLite project lifecycle.' },
      project_root: { type: 'string', description: 'Git root of the TARGET application project (not MCP source). Required for safe project isolation.' },
      input: { type: 'object', description: 'Operation-specific reviewed payload. Include exact IDs, lease tokens, revision/hash and explicit Owner authorization when required.', additionalProperties: true },
    },
  },
}];
