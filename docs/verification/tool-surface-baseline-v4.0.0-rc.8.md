# Tool Surface Baseline — v4.0.0-rc.8

This file records the Phase 0 compatibility boundary before the `architecture` tool is implemented.

## Frozen surfaces

| Surface | Expected count |
|---|---:|
| Compact | 23 |
| Compact + Memory | 29 |
| Full | 33 |
| Apps model-visible | 29 |
| App-only | 1 |
| Unique callable names | 34 |

The machine-readable source of truth is:

```text
config/tool-surface-baseline.json
```

The baseline is enforced by:

```text
npm run audit:tools
```

The audit now fails when any surface has a missing or unexpected tool, when an App-only action leaks into model `tools/list`, when the unique callable count changes, or when a phantom tool appears in delegated output.

## Current compatibility groups

- Compact model tools: 23
- Memory model tools: 6
- Full-only compatibility tools: `add_feature`, `fix_bug`, `sync_ui_data`, `ask_user`
- App-only action: `list_memory_assets`

`architecture` is intentionally absent from this baseline. Phase 2 must update the machine-readable contract in the same isolated commit that exposes the new tool, after its Schema, Catalog, Registry, Visibility, CLI, protocol and Host tests pass.
