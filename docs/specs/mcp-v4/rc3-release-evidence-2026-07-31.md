# MCP Probe Kit v4.0.0-rc.3 Release Evidence

Date: 2026-07-31

## Scope

This candidate focuses on MCP Apps product quality and Host-readable Memory contracts without changing the approved 23/29/33 model-tool surfaces.

- Unified visual system for Memory Center, Feature Workbench, Bug Workbench, Product Workbench, and Convergence Gate.
- Feature/Bug live progress reads persisted delegated-plan state through `resume_plan`; the UI does not advance from local clicks alone.
- Memory Center removes the nested fixed-height list scrollbar and uses batched master-detail browsing.
- `memorize_asset` exposes `asset_id`, status, and the next read call in text.
- `search_memory` defaults omitted or invalid limits to a positive configured value and constrains explicit values to 1–50.

## Automated release gate

`npm run release:verify` exited 0 on Node.js 22.21.1.

- Release static checks: 26/26, 0 errors, 0 warnings
- Test files: 85 passed
- Tests: 401 passed
- TypeScript and generated MCP App bundle: passed
- Deterministic Tool Contract Audit: 38/38 passed
- Legacy/Modern protocol smoke: passed
- Local Agent acceptance: passed
- Stability soak: 16 scenarios, 81 calls, 0 failures
- Agent Evals: 25/25 passed
- Package smoke: 374 entries, 23 model-visible tools
- v3.7.0 rollback smoke: passed
- MCP Inspector 2.0.0: compact 24 raw/23 model; full 34 raw/33 model
- Production dependency audit: 0 vulnerabilities

## Host evidence boundary

Cursor 3.0.16 tested the published rc.2 baseline with real `CallMcpTool` calls:

- `workflow`, `start_feature`, and `start_bugfix` passed;
- Memory create/search/read/update/delete passed and the temporary record was removed;
- Feature Workbench and Memory Center rendered as MCP Apps.

That evidence discovered the two Memory contract defects fixed in rc.3. It also established that Cursor can render the App resources. The rc.3 visual redesign itself remains pending a post-publication Cursor screenshot and progress-step verification; rc.2 screenshots must not be presented as rc.3 evidence.

Claude Code 2.1.179 and Codex CLI 0.144.1 host evidence remains the rc.2 protocol/tool baseline. OpenCode 1.17.11 connected to MCP but did not obtain a model response.

## Release channel

This is a prerelease candidate. It may be published to npm `next` and as a GitHub prerelease. It must not update npm `latest` or the stable MCP Registry.
