# MCP Probe Kit Delivery System V1 — Implementation Progress

This file tracks implementation status separately from the frozen requirements document.

## Phase status

| Phase | Status | Scope |
|---|---|---|
| Phase 0 — Compatibility baseline | Complete | Freeze exact tool names, counts, visibility, App-only behavior and protocol surface |
| Phase 1 — Responsibility alignment | Complete | Align Skill, Catalog, workflow guidance and tests without changing public schemas |
| Phase 2 — `architecture` / ARC-8 | In progress | Add the single architecture domain tool and its shared methodology core |
| Phase 3 — Plan lifecycle | Pending | Extend Plan, Heartbeat, Resume and Converge compatibly |
| Phase 4 — Orchestrator closure | Pending | Complete feature, bugfix, UI, onboard, product and Ralph delivery loops |
| Phase 5 — Diff and verification consistency | Pending | Compare declared scope, real diff, contracts, tests and architecture drift |
| Phase 6 — Memory quality | Pending | Improve conflict, supersede, expiry, negative evidence and retrieval quality |

## Phase 0 evidence

Implemented:

- machine-readable baseline: `config/tool-surface-baseline.json`;
- reusable baseline validator: `scripts/lib/tool-surface-baseline.mjs`;
- focused validator tests: `scripts/lib/__tests__/tool-surface-baseline.test.mjs`;
- exact runtime surface checks integrated into `npm run audit:tools`;
- compatibility record: `docs/verification/tool-surface-baseline-v4.0.0-rc.8.md`.

Frozen baseline:

```text
Compact: 23
Compact + Memory: 29
Full: 33
Apps model-visible: 29
App-only: 1
Unique callable names: 34
```

Validation completed:

```text
tool-surface validator tests: 4 / 4 passed
tool contract audit: 38 / 38 passed
dual-era protocol smoke: passed
docs verification: 1067 checks passed
git diff --check: passed
```

No production tool behavior was changed in Phase 0.

## Phase 1 evidence

Implemented:

- Skill now distinguishes direct domain/atomic capability calls from complete-delivery `start_*` orchestration;
- `workflow` is documented as an optional first-tool fallback, not a mandatory entry or lifecycle owner;
- `start_feature`, `start_bugfix` and `start_ui` Catalog guidance now describes complete delivery rather than universal task routing;
- `fix_bug` is explicitly the SRC-8 public capability and can be called directly;
- `gentest`, `code_insight`, `code_review`, UI tools and Memory tools remain first-class direct capabilities;
- Plan and Converge guidance is scoped to managed, resumable or formal delivery tasks;
- Memory guidance distinguishes managed workflow persistence from explicit standalone memory management;
- the generated project Skill is rebuilt from the canonical Catalog and template and remains synchronized with all 33 current model-visible tools.

Compatibility preserved:

```text
Compact: 23
Compact + Memory: 29
Full: 33
Apps model-visible: 29
App-only: 1
Unique callable names: 34
```

Validation completed:

```text
focused Skill, workflow and registry tests: 42 / 42 passed
deterministic Agent governance evals: 2 / 2 passed
full regression suite: 464 / 464 passed
tool contract audit: 38 / 38 passed
dual-era protocol smoke: passed
workflow Skill verification: 33 tools synchronized
docs verification: 1067 checks passed
```

Phase 1 changed responsibility guidance and generated Skill content only. It did not add, remove or rename tools, alter public input/output schemas, or change App-only visibility.

## Phase 2 progress

Shared ARC-8 foundation completed before public exposure:

- `src/lib/architecture-method.ts` owns ARC-1 through ARC-8, mode mapping, gates, normalization, candidates and bounded drift checks;
- `src/schemas/architecture-tools.ts` defines the future public input contract;
- `src/schemas/output/architecture-tools.ts` defines one compatible output model across assess/design/validate/drift;
- focused method tests cover assess, blocked design, migration/rollback gates, valid design, missing drift evidence and explicit drift findings.

Current validation:

```text
ARC-8 method tests: 7 / 7 passed
TypeScript compiler: passed with npx tsc --noEmit
```

The public `architecture` tool is not exposed yet. Catalog, Registry, Visibility and the frozen tool-surface baseline remain unchanged until the tool handler and integration tests are ready.
