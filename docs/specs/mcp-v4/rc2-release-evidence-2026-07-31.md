# MCP Probe Kit v4.0.0-rc.2 Release Evidence — 2026-07-31

## Scope

- Branch: `develop/v4`
- Candidate: `4.0.0-rc.2`
- Platform: Windows x64
- Node.js: `v22.21.1`
- Server: local production build `build/index.js`
- Command: `npm run release:verify`
- Result: exit code `0`

This document records local automated and process-level release evidence. It does not claim that every named editor or Agent Host has passed manual acceptance.

## Release readiness

Static release gate:

- 26 checks passed
- 0 errors
- 0 warnings
- package, lockfile, server metadata, Tool Manifest and structured-output version all matched `4.0.0-rc.2`
- Node.js minimum engine remained `>=20.0.0`
- SDK v2 packages remained fixed at `2.0.0`
- MCP Apps build SDK remained fixed at `1.7.2`

## Tool surfaces

| Surface | Raw tools/list | Model-visible | App-only |
|---|---:|---:|---:|
| compact, plain client | 23 | 23 | 0 |
| compact, Apps-capable Inspector | 24 | 23 | 1 |
| full, plain client | 33 | 33 | 0 |
| full, Apps-capable Inspector | 34 | 33 | 1 |

The App-only action is `list_memory_assets`, with `_meta.ui.visibility=["app"]`.

The six Memory tools are conditionally added to compact only when both Memory storage and embedding configuration are complete, producing 29 model-visible tools.

## Tests and build

- Test files: 85 passed
- Tests: 400 passed
- Deterministic Tool Contract Audit: 38/38 passed
- TypeScript build: passed
- Generated MCP App bundle: passed
- Production modules remained under the repository line-count gate
- `git diff --check`: passed

## Protocol smoke

Legacy:

- negotiated Legacy era
- 23 compact model tools
- Legacy Task completed
- `workflow` routed to `start_feature`

Modern:

- negotiated Modern era
- 23 compact model tools
- form elicitation completed once
- Modern Task request used synchronous fallback
- Plan heartbeat, resume and convergence completed

Full compatibility:

- 33 model tools discovered
- hidden compact compatibility tools remained available

## MCP Apps

Validated behavior:

- extension ID: `io.modelcontextprotocol/ui`
- MIME: `text/html;profile=mcp-app`
- stable `ui://` resources
- Memory Center
- Feature Workbench
- Bug Workbench
- Product Workbench
- Convergence Gate
- plain clients receive no UI metadata, no UI resources and cannot call App-only actions
- Apps-capable clients receive model/App visibility metadata and App-only discovery
- deprecated `_meta["ui/resourceUri"]` alias remains for older Hosts

## Agent acceptance and evals

Local process-level Agent acceptance:

- 23 compact model tools discovered
- short continuation routed to `start_feature`
- complete task summary preserved `spec_layout=auto`
- complex feature selected parent-child layout
- unfinished plan failed convergence and prohibited Memory write
- completed plan passed convergence and allowed Memory write

Agent Evals:

- 25/25 passed
- routing: 10/10
- parameter construction: 2/2
- plan compliance: 3/3
- Memory safety: 4/4
- tool triggering: 6/6

## Stability

- scenarios: 16
- Workflow calls: 81
- failures: 0
- covered cold Legacy/Modern starts, hot calls, concurrent clients, Memory failure degradation and protocol rejection

Observed latency for this run:

- p50: 759 ms
- p95: 3279 ms
- max: 3279 ms

These values are environment observations, not a cross-platform performance guarantee.

## Package, rollback and security

Package smoke:

- tarball: `mcp-probe-kit-4.0.0-rc.2.tgz`
- entries: 374
- packed size: 719040 bytes
- clean install started successfully
- installed server exposed 23 compact model tools
- `workflow` routed to `start_feature`

Rollback:

- installed `mcp-probe-kit@3.7.0`
- Legacy client connected
- 30 v3 tools discovered
- `start_feature`, `start_bugfix` and `check_spec` present

Security:

- `npm audit --omit=dev --audit-level=high`
- 0 vulnerabilities

## MCP Inspector 2.0.0

- compact raw tools: 24
- compact model-visible tools: 23
- full raw tools: 34
- full model-visible tools: 33
- App-only actions: `list_memory_assets`
- core Workflow and Plan tools discovered

## Real host acceptance

Claude Code 2.1.179 was run against the local rc.2 production build using a strict one-server MCP configuration and `MCP_PROTOCOL_MODE=auto`.

Full real-Agent contract audit (`npm run audit:tools:agent`):

- 33 expected model tools;
- 33 distinct model tools actually called;
- 7/7 audit batches passed;
- 0 contract assessment failures;
- 0 missing tools;
- 0 unexpected tools;
- one non-blocking duplicate-call warning: `start_ralph` was called twice; both calls succeeded.

For every tool, the Agent checked purpose understanding, guidance readability, text/`structuredContent` consistency, executable next steps, and false-completion claims. The initial audit found bootstrap contradictions and incomplete guidance contracts in `estimate`, `git_work_report`, `code_review`, `refactor`, and `gentest`; those issues were fixed before the final passing run.

The Host negotiated Legacy protocol `2025-11-25`; forcing Modern correctly failed because this Host does not advertise the Modern protocol version. Claude Code did not negotiate MCP Apps, so no GUI claim is made for this Host.

Codex CLI 0.144.1 was connected to the same local rc.2 production build and made a real `workflow` call with a feature intent. It received `scenario=feature`, `firstTool=start_feature`, and assessed the text and structured response as readable, symmetric, and executable.

OpenCode 1.17.11 connected to the local rc.2 MCP server. Direct `models.dev` access timed out and proxy access through `127.0.0.1:10808` succeeded, but `openzen-1/deepseek-v4-flash-free`, `cpa/deepseek-v4-flash`, and another configured Provider produced no model response before timeout. OpenCode therefore did not reach a real MCP tool call.

## Remaining manual host work

Current rc.2 status:

- MCP Inspector 2.0.0: passed, including Apps metadata/resource and App-only surface tests
- Claude Code 2.1.179: passed for all 33 model-tool contracts and core Workflow/Plan lifecycle; Apps GUI not negotiated or claimed
- Codex CLI 0.144.1: passed for a real local rc.2 `workflow` call
- Cursor 3.0.16: blocked pending GUI/manual Agent acceptance
- VS Code Copilot: blocked by host installation state
- Cline: blocked because no client version is installed
- OpenCode 1.17.11: local rc.2 MCP connected, but model/provider startup returned no response even after `models.dev` became reachable through the configured proxy

No npm publish, Git tag, GitHub Release or MCP Registry action is asserted by this evidence document.
