# MCP Probe Kit v4.0.0-rc.3 Release Evidence

Date: 2026-08-01

## Scope

This candidate finalizes compact, Host-themed MCP Apps and Host-readable Memory contracts without changing the approved 23/29/33 model-tool surfaces.

- Feature and Bug Apps are compact command panels containing only task identity, persisted step progress, current executable action, required outputs, and `refresh / converge / continue` controls.
- Progress is real plan state: the App polls `resume_plan` while visible and advances only after `plan_heartbeat` persists a changed step state.
- Memory Center retains search, result list, selected content, optional evidence/boundary details, and lifecycle actions. Decorative statistics, repeated descriptions, large status blocks, and tag clutter were removed.
- Product Workbench retains users, constraints, delivery steps, and handoff controls.
- Convergence Gate retains pass state, blockers, incomplete steps, missing evidence, memory-write permission, and corrective actions.
- Layout, typography, colors, fonts, radii, shadows, and narrow-container behavior follow Host variables when provided and use system UI fallbacks otherwise.
- `memorize_asset` exposes `asset_id`, lifecycle status, and an executable next read call in text.
- `search_memory` defaults omitted or invalid non-positive limits to a positive configured value and caps explicit values at 50.
- A text-only Memory CRUD integration test parses `asset_id` from `content[].text` and completes create, search, read, update, delete, and final absence verification without reading `structuredContent`.

## Automated release gate

`npm run release:verify` exited 0 on Node.js 22.21.1.

- Release static checks: 26/26, 0 errors, 0 warnings
- Test files: 86 passed
- Tests: 402 passed
- TypeScript build and generated MCP App bundle: passed
- Deterministic Tool Contract Audit: 38/38 passed
- Legacy/Modern protocol smoke: passed
- Local Agent acceptance: passed
- Stability soak: 16 scenarios, 81 workflow calls, 0 failures
- Agent Evals: 25/25 passed
- Package smoke: 374 entries, 23 model-visible tools
- v3.7.0 rollback smoke: passed
- MCP Inspector 2.0.0: compact 24 raw/23 model; full 34 raw/33 model
- Production dependency audit: 0 vulnerabilities

## Host evidence boundary

Host compatibility is tracked per named client and version. It is not inferred from one editor to every Agent.

- Cursor 3.0.16 on the published rc.2 baseline completed real `workflow`, `start_feature`, `start_bugfix`, and Memory CRUD calls, removed the temporary record, and rendered Feature Workbench and Memory Center.
- That rc.2 run discovered the two Memory text-contract defects fixed in rc.3.
- Cursor core tools are therefore recorded as passed on the rc.2 protocol baseline; the final rc.3 compact GUI remains pending a post-publication visual check. rc.2 screenshots must not be presented as rc.3 visual evidence.
- Claude Code 2.1.179 completed the rc.2 33/33 tool audit but did not negotiate MCP Apps, so no GUI claim is made.
- Codex CLI 0.144.1 completed the rc.2 `workflow` call. OpenCode 1.17.11 connected to MCP but did not obtain a model response.
- MCP Inspector 2.0.0 directly verified the current rc.3 Apps negotiation, resources, and app-only visibility.

## Release channel

This is a prerelease candidate. It may be published to npm `next` and as a GitHub prerelease. It must not update npm `latest` or the stable MCP Registry.
