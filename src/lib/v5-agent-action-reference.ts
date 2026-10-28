import { V5_DEVC_ACTION_GROUPS, V5_DEVC_ACTIONS } from '../devcontrol/action-catalog.js';

/** Documentation of actual live DevControl actions, never a hand-maintained list. */
export function renderV5DevControlActionReference(): string {
  const rows = V5_DEVC_ACTION_GROUPS.map(group => {
    const names = group.actions.map(name => '`' + name + '`').join(', ');
    return '| ' + group.title + ' | ' + names + ' |';
  }).join('\n');
  return `## DevControl operation reference — ${V5_DEVC_ACTIONS.length} SQLite actions

First discover the correct flow with the **read-only, project-free** call
\`{"action":"guide","input":{"intent":"feature"}}\`. Other supported intents:
\`start\`, \`planning\`, \`task\`, \`verification\`, \`bug\`,
\`idea\`, \`scope\`, \`architecture\`.
The response gives a short list of relevant actions, copyable input example,
and approval caution, without modifying SQLite. Then call the **single**
MCP tool \`devcontrol\` with
\`{"action":"next","project_root":"/ABSOLUTE/GIT/PROJECT","input":{}}\`.
Each action has different input fields; do not invent parameters, approvals,
test results or task state. Actions are not separate MCP tools.

| Area | Supported action names |
| --- | --- |
${rows}

Read actual versioned requirements → design → tasks before drafting atomic
leaf work. Each leaf has one independently verifiable outcome, exact approved
files and dependencies, expected evidence and positive/negative cases.
For project-specific tests, the Agent runs the test, reports evidence and an
independent reviewer records the outcome via \`gate-review\`.
The mere existence of evidence cannot pass \`verify\`.
`;
}
