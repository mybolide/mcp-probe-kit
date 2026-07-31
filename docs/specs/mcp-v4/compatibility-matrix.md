# MCP Probe Kit v4 Compatibility Matrix

## 1. Protocol capabilities

| Capability | Legacy MCP | Modern MCP | v4.0.0-rc.3 behavior |
|---|---|---|---|
| Tool discovery | `initialize` + `tools/list` | Modern opening + `tools/list` | Shared Tool Registry and ordering |
| Tool calls | `tools/call` | `tools/call` | Shared business handlers |
| Requirements clarification | SDK shim or structured loop | `input_required` after Host-declared form elicitation | Falls back without fabricating interaction |
| Tasks | Legacy Task wire | Native Modern adapter not yet implemented | Modern Task requests execute synchronously |
| Resources | supported | supported | Plain resources remain available |
| MCP Apps | text fallback | enabled after `io.modelcontextprotocol/ui` negotiation | `text/html;profile=mcp-app` and stable `ui://` resources |

## 2. Tool surfaces

| Configuration | Model-visible tools | Raw `tools/list` for Apps Host | Notes |
|---|---:|---:|---|
| default / `compact` | 23 | 24 | 23 model tools plus app-only `list_memory_assets` |
| `compact` with Memory | 29 | 30 | Adds 6 model-visible Memory tools |
| `full` | 33 | 34 | Compatibility surface plus one app-only action |

App-only actions use `_meta.ui.visibility=["app"]` and do not count toward model-visible tools.

## 3. Product capabilities

| Capability | v3 | v4 Legacy | v4 Modern |
|---|---:|---:|---:|
| Canonical Skill | yes | yes | yes |
| `start_*` delegated plans | yes | yes | yes |
| Heartbeat / Resume / Converge | no | yes | yes |
| Memory CRUD | yes | yes | yes |
| Text-only Memory CRUD | not guaranteed | yes | yes |
| Memory Center | no | when Host supports Apps | when Host supports Apps |
| Parent-child Spec Gate and SRC-8 | yes | yes | yes |
| `input_required` | no | shim/loop fallback | enabled when declared by Host |

## 4. Runtime modes

| Environment variable | Behavior |
|---|---|
| `MCP_PROTOCOL_MODE=auto` | Negotiates Legacy or Modern |
| `MCP_PROTOCOL_MODE=legacy` | Legacy opening and Legacy Tasks |
| `MCP_PROTOCOL_MODE=modern` | Rejects Legacy opening |
| `MCP_TOOLSET=compact` | 23 or 29 model tools |
| `MCP_TOOLSET=full` | 33 model tools |
| `MCP_ENABLE_UI_APPS=0` | Disables Apps metadata, resources, and app-only calls |

Requires Node.js 20 or newer. SDK v2 packages are pinned to 2.0.0 and MCP Apps SDK to 1.7.2.

## 5. Reference client 自动验证状态

| Check | Status | rc.3 evidence |
|---|---|---|
| Legacy and Modern tools/resources | passed | dual-era integration and protocol smoke |
| Legacy Task wire and Modern synchronous fallback | passed | integration tests |
| Plan Heartbeat / Resume / Converge | passed | plan lifecycle tests and production smoke |
| MCP Apps negotiation and text fallback | passed | MCP Apps integration tests |
| App-only visibility | passed | Inspector and integration tests |
| Text-only Memory CRUD | passed | Parses ID from `content[].text`; completes CRUD without reading `structuredContent` |
| Agent routing, plan compliance, Memory safety | passed | Agent Evals 25/25 |
| Tool Contract Audit | passed | 38/38 |
| Package install smoke | passed | 374 entries; 23 model tools after install |
| Stability soak | passed | 16 scenarios; 81 calls; 0 failures |
| MCP Inspector 2.0.0 | passed | compact 24 raw/23 model; full 34 raw/33 model |
| Production dependency audit | passed | 0 vulnerabilities |
| v3.7.0 rollback | passed | Legacy 30-tool baseline and core tools |
| Full release gate | passed | 86 test files; 402 tests; `release:verify` exit 0 |

Detailed evidence: `docs/specs/mcp-v4/rc3-release-evidence-2026-07-31.md`.

## 6. 真实客户端人工验证矩阵

Reference client and Inspector results do not imply every named Host has passed the current RC.

| Client | Version | Core tools | MCP Apps GUI | Evidence boundary |
|---|---|---|---|---|
| MCP Inspector | 2.0.0 | passed | passed | Current rc.3 negotiation, resources, and visibility |
| Claude Code | 2.1.179 | passed | not negotiated | rc.2 33/33 real tool calls; no GUI claim |
| Cursor | 3.0.16 | passed on rc.2 | pending on rc.3 | rc.2 real workflow, feature, bugfix, Memory CRUD, and base App rendering; compact rc.3 GUI requires post-release review |
| VS Code Copilot | 1.104.1 / 0.31.5 | blocked | blocked | Base extension missing |
| Cline | not installed | blocked | blocked | Versioned installation required |
| Codex CLI | 0.144.1 | passed on rc.2 | not applicable | Real rc.2 `workflow` call |
| OpenCode | 1.17.11 | blocked | blocked | MCP connected but Provider returned no model response |

Allowed states include `pending`, `passed`, `failed`, `blocked`, `not negotiated`, and `not applicable`.

## 7. Release decision

- The local v4.0.0-rc.3 release gate passed.
- Publish only to npm `next` and as a GitHub prerelease; do not update `latest` or the stable MCP Registry.
- Cursor core tools and base Apps rendering passed on rc.2; rc.3 compact GUI remains `pending` and does not block a Host-neutral RC release.
- Named Host results remain independent and are not inferred from Cursor or Inspector.
