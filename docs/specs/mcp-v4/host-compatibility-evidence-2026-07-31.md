# Real Host Compatibility Evidence — 2026-07-31

## Scope

- Branch: `develop/v4`
- Revision: `058af88`
- Candidate: `4.0.0-rc.1`
- Server under test: local production build `build/index.js`
- Platform: Windows x64
- No Git tag, push, npm publish, GitHub Release, or MCP Registry publish was performed.

A host is marked `passed` only after that named host executes MCP tools against the local RC build. A successful transport connection without an Agent tool call is not treated as full acceptance.

## Claude Code 2.1.179 — passed

Claude Code was run in non-interactive mode with an explicit, strict MCP configuration pointing to the local production build in Modern protocol mode.

### Workflow routing

The Claude Code Agent called `workflow` through the configured MCP server. The returned result preserved the complete intent and reported:

- `scenario=feature`
- `firstTool=start_feature`
- `firstToolArgsHint.spec_layout=auto`

### Plan lifecycle

The same host then called, in sequence:

1. `plan_heartbeat`
2. `resume_plan`
3. `converge`

Observed result:

```json
{
  "heartbeatStored": true,
  "resumeFound": true,
  "nextStepId": null,
  "convergePassed": true,
  "memoryWriteAllowed": true
}
```

This verifies native MCP tool discovery and execution, workflow routing, persisted Plan recovery, convergence, and the post-convergence Memory gate. It does not claim GUI-only behavior or automatic installation of a filesystem Skill outside the explicit package/server configuration.

## Cursor 3.0.16 — blocked

The installed Cursor CLI was detected and its help exposes `--add-mcp` and an `agent` subcommand. In this installation:

- `cursor agent --help` falls back to the top-level CLI help.
- `cursor agent` exits without a usable terminal Agent session or result.
- No separate `cursor-agent` executable is installed.

A headless MCP Agent call could therefore not be completed. Cursor remains blocked pending a GUI/manual host acceptance run. This is not evidence of an RC server failure.

## VS Code Copilot — blocked

The installed host is VS Code 1.104.1 with `github.copilot-chat` 0.31.5. The CLI exposes both `--add-mcp` and the `chat` subcommand with Agent mode.

An isolated MCP registration succeeded and reported `Added MCP servers: probe_rc`. A temporary trusted workspace was then opened with a workspace-local MCP definition and an Agent prompt that required a `workflow` call and a result file.

No MCP result was produced. The Copilot Chat extension log recorded a successful GitHub login followed by `Copilot extension not found` and an undefined Copilot API. The base `github.copilot` extension is not installed in this VS Code profile, so the Agent could not reach MCP tool execution. This is a host installation blocker, not an RC server failure.

## Cline — blocked

No Cline extension is present in the installed VS Code extension list, and no `cline` executable is available on `PATH`. A named Cline version must be installed and configured before Legacy/Modern negotiation and Requirements Loop acceptance can be run. No client was installed automatically during this validation.

## OpenCode 1.17.11 — blocked

An isolated inline OpenCode configuration added `probe_rc` as a local stdio MCP server pointing to `build/index.js`. `opencode mcp list --pure` reported the server as connected.

Two Agent runs were then attempted:

- The first model run timed out without producing a tool result.
- The second run logged a `models.dev` fetch timeout before inference or MCP tool execution.

The local MCP transport and discovery path passed, but model-driven tool execution was blocked by the host's external model-catalog/provider startup. OpenCode must be rerun when that dependency is reachable. No credential values are recorded in this evidence.

## Remaining host work

- Cursor: `blocked` — GUI/manual acceptance required.
- VS Code Copilot: `blocked` — base Copilot extension missing.
- Cline: `blocked` — client not installed.
- OpenCode: `blocked` — external model-catalog/provider startup timeout.
