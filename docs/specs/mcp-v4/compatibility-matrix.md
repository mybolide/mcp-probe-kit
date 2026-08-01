# MCP Probe Kit v4 Compatibility Matrix

## 1. Protocol capabilities

| Capability | Legacy MCP | Modern MCP | v4.0.0-rc.4 behavior |
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
| Startup Skill create/upgrade | no | yes | yes |
| Full SemVer prerelease comparison | no | yes | yes |
| `start_*` delegated plans | yes | yes | yes |
| Heartbeat / Resume / Converge | no | yes | yes |
| Memory CRUD | yes | yes | yes |
| Text-only Memory CRUD | not guaranteed | yes | yes |
| Memory Center | no | when Host supports Apps | when Host supports Apps |
| Parent-child Spec Gate and SRC-8 | yes | yes | yes |
| Product brief structured fields/fallback extraction | no | yes | yes |
| `input_required` | no | shim/loop fallback | enabled when declared by Host |

## 4. Runtime and release modes

| Setting | Behavior |
|---|---|
| `MCP_PROTOCOL_MODE=auto` | Negotiates Legacy or Modern |
| `MCP_PROTOCOL_MODE=legacy` | Legacy opening and Legacy Tasks |
| `MCP_PROTOCOL_MODE=modern` | Rejects Legacy opening |
| `MCP_TOOLSET=compact` | 23 or 29 model tools |
| `MCP_TOOLSET=full` | 33 model tools |
| `MCP_ENABLE_UI_APPS=0` | Disables Apps metadata, resources, and app-only calls |
| npm RC channel | `next` only; must not update `latest` |
| npm authentication | GitHub Actions OIDC Trusted Publishing |
| build hygiene | `build/` is removed before every TypeScript build |

Requires Node.js 20 or newer. SDK v2 packages are pinned to 2.0.0 and MCP Apps SDK to 1.7.2.

## 5. Reference client 自动验证状态

| Check | Status | rc.4 evidence |
|---|---|---|
| Version parity | passed | package, lockfile, server, packages and tool manifest all `4.0.0-rc.4` |
| Static release gate | passed | 29/29 checks, 0 errors, 0 warnings |
| Legacy and Modern tools/resources | passed | dual-era integration and protocol smoke |
| Legacy Task wire and Modern synchronous fallback | passed | integration tests |
| Plan Heartbeat / Resume / Converge | passed | plan lifecycle tests and production smoke |
| MCP Apps negotiation and text fallback | passed | MCP Apps integration tests |
| App-only visibility | passed | Inspector and integration tests |
| Text-only Memory CRUD | passed | Parses ID from `content[].text`; completes CRUD without `structuredContent` |
| Workflow feature/spec routing | passed | deterministic tests, Agent Eval and exact Claude tool traces |
| Product brief extraction | passed | explicit fields and structured-description fallback tests; exact Claude trace |
| Skill startup upgrade | passed | installed rc.4 upgraded project Skill from rc.3 before first tool call; second start did not rewrite |
| Agent routing, plan compliance, Memory safety | passed | Agent Evals 26/26 |
| Tool Contract Audit | passed | 38/38 |
| Clean package installation | passed | 360 entries, 720354 bytes, 23 model tools after install |
| Stability soak | passed | 16 scenarios, 81 calls, 0 failures |
| MCP Inspector 2.0.0 | passed | compact 24 raw/23 model; full 34 raw/33 model |
| Production dependency audit | passed | 0 vulnerabilities |
| v3.7.0 rollback | passed | Legacy 30-tool baseline and core tools |
| Full release gate | passed | 87 test files, 413 tests, `release:verify` exit 0 |

Detailed evidence: `docs/specs/mcp-v4/rc4-release-evidence-2026-08-01.md`.

## 6. 真实客户端人工验证矩阵

Reference client, package smoke, Inspector and one Agent do not imply every named Host has passed every capability.

| Client | Version | Core tools | MCP Apps GUI | Evidence boundary |
|---|---|---|---|---|
| MCP Inspector | 2.0.0 | passed on rc.4 | passed on rc.4 | Current rc.4 negotiation, resources, app-only visibility and compact/full surfaces |
| Claude Code | 2.1.179 | passed on installed rc.4 tarball | not negotiated | Exact tool traces verified feature/spec routing and Product brief; startup upgraded Skill rc.3 to rc.4 and second start was idempotent |
| Cursor | 3.0.16 | passed on rc.3 functional acceptance | pending on rc.4 | rc.3 completed 12-stage functional acceptance; its routing and Skill defects are fixed and tested in rc.4, but rc.4 Cursor visual recheck is not claimed |
| VS Code Copilot | VS Code 1.104.1 / Copilot Chat 0.31.5 | blocked | blocked | Base extension missing |
| Cline | not installed | blocked | blocked | Versioned installation required |
| Codex CLI | 0.144.1 | passed on rc.2 | not applicable | Real rc.2 `workflow` call only |
| OpenCode | 1.17.11 | blocked | blocked | MCP connected, but Provider/model produced no response; no tool-call claim |

Allowed states include `pending`, `passed`, `failed`, `blocked`, `not negotiated`, and `not applicable`.

## 7. Release decision

- The local `v4.0.0-rc.4` source gate, clean tarball installation, installed-package Claude acceptance, Skill upgrade and idempotency checks passed.
- Publish only to npm `next` and as a GitHub prerelease; do not update `latest` or the stable MCP Registry.
- Claude core-tool evidence does not establish MCP Apps rendering because Claude Code did not negotiate Apps.
- Cursor rc.4 GUI remains pending and is recorded separately rather than inferred from Inspector or Claude.
