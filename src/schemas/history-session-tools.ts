export const historySessionToolSchemas = [
  {
    name: 'history_session_bootstrap',
    description:
      'Initialize or resume a lossless project history archive (docs/history-session/). Call once near the start of a conversation with the user\'s verbatim first request as initial_user_input. Without host/explicit session_key, uses the project-active archive. Returns bounded state (≤64 KiB), not full history. Disable with MCP_HISTORY_SESSION=0|false|off.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string', description: 'Project root; omit to use workspace resolution' },
        workspace_root: { type: 'string', description: 'Alias of project_root' },
        session_key: { type: 'string', description: 'Optional explicit session key; omit for project-active archive' },
        title: { type: 'string', description: 'Archive title when creating a new session' },
        initial_user_input: { type: 'string', description: 'Verbatim first user request for this conversation' },
        history_dir: { type: 'string', description: 'Relative history directory; default docs/history-session' },
        create_if_missing: { type: 'boolean', description: 'Create archive when missing; default true' },
        mode: {
          type: 'string',
          enum: ['resume', 'fresh'],
          description: 'resume (default) reuses project-active/keyed archive; fresh always creates a new archive',
        },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'history_session_checkpoint',
    description:
      'Append an idempotent, redacted development checkpoint. Pass session_key and expected_path exactly as returned by history_session_bootstrap, plus the user\'s verbatim raw_user_input. Archives that exceed MCP_HISTORY_MAX_LINES/BYTES soft-rotate to the next N.md before append.',
    inputSchema: {
      type: 'object',
      required: ['session_key', 'expected_path'],
      properties: {
        project_root: { type: 'string' },
        workspace_root: { type: 'string' },
        session_key: { type: 'string' },
        expected_path: { type: 'string' },
        history_dir: { type: 'string' },
        turn_id: { type: 'string' },
        timestamp: { type: 'string' },
        user_intent: { type: 'string' },
        raw_user_input: { type: 'string' },
        findings: { type: 'array', items: { type: 'string' } },
        decisions: { type: 'array', items: { type: 'string' } },
        files_changed: { type: 'array', items: { type: 'string' } },
        tests: { type: 'array', items: { type: 'string' } },
        runtime_state: { type: 'array', items: { type: 'string' } },
        remaining_issues: { type: 'array', items: { type: 'string' } },
        next_actions: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'history_session_validate',
    description:
      'Validate history-session numbering, duplicates, and derived state/manifest. Optional repair rebuilds state and manifest from Markdown archives.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string' },
        workspace_root: { type: 'string' },
        history_dir: { type: 'string' },
        repair: { type: 'boolean', description: 'Rebuild state/manifest from archives; default false' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'history_session_search',
    description:
      'Search lossless history archives by deterministic keywords and return a bounded page of ranked locations and snippets. Use history_session_read to retrieve exact source text.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string' },
        workspace_root: { type: 'string' },
        history_dir: { type: 'string' },
        query: { type: 'string', description: 'Keyword query; empty returns recent archives' },
        cursor: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'history_session_read',
    description:
      'Read one lossless numeric Markdown archive by number or a path returned from history_session_search. Responses are UTF-8-safe pages: max_bytes defaults to 32 KiB and is capped at 64 KiB; follow next_cursor to recover the complete source.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string' },
        workspace_root: { type: 'string' },
        history_dir: { type: 'string' },
        number: { type: 'integer', minimum: 1 },
        path: { type: 'string' },
        cursor: { type: 'integer', minimum: 0 },
        max_bytes: { type: 'integer', minimum: 1, maximum: 65536 },
        expected_hash: { type: 'string', minLength: 64, maxLength: 64 },
      },
      additionalProperties: true,
    },
  },
];
