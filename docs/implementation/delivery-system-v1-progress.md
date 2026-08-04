# MCP Probe Kit Delivery System V1 — Implementation Progress

This file tracks implementation status separately from the frozen requirements document.

## Phase status

| Phase | Status | Scope |
|---|---|---|
| Phase 0 — Compatibility baseline | Complete | Freeze exact tool names, counts, visibility, App-only behavior and protocol surface |
| Phase 1 — Responsibility alignment | Complete | Align Skill, Catalog, workflow guidance and tests without changing public schemas |
| Phase 2 — `architecture` / ARC-8 | Complete | Add the single architecture domain tool and its shared methodology core |
| Phase 3 — Plan lifecycle | Complete | Extend Plan, Heartbeat, Resume and Converge compatibly |
| Phase 4 — Orchestrator closure | In progress | Feature, Bugfix and UI closure complete; onboard, product and Ralph remain |
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

## Phase 2 evidence

Implemented:

- `architecture` is a model-visible direct domain capability with `assess`, `design`, `validate` and `drift` modes;
- ARC-8 remains the single method source of truth and is split into focused production modules:
  - `src/lib/architecture-types.ts` — contracts, step definitions and trade-off dimensions;
  - `src/lib/architecture-normalization.ts` — input and baseline normalization;
  - `src/lib/architecture-validation.ts` — gates, step state and bounded drift checks;
  - `src/lib/architecture-method.ts` — result composition, ADR and Memory candidates;
- every new production module remains below 500 lines; the largest architecture module is 360 lines;
- `src/tools/architecture.ts` performs optional `code_insight` and Memory evidence collection, then returns a structured ARC-8 worksheet without claiming implementation work is complete;
- `save_to_docs=true` returns a delegated document plan rather than directly rewriting project architecture documents;
- Catalog, Registry, output Schema, Skill, CLI, workflow routing, tool visibility and generated docs all use the same public tool contract;
- `workflow` can suggest `architecture` only for explicit architecture work; ordinary code understanding still routes to `code_insight`;
- App-only behavior is unchanged: `list_memory_assets` remains outside the model registry.

Updated production surface:

```text
Compact: 24
Compact + Memory: 30
Full: 34
Apps model-visible: 30
App-only: 1
Unique callable names: 35
```

Validation completed:

```text
ARC-8 method and tool tests: 11 / 11 passed
full regression suite: 477 / 477 passed across 100 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
git diff --check: passed
```

Phase 2 adds exactly one model-visible tool and does not add a central intent engine, policy kernel, risk classifier, mandatory architecture gate or new MCP App UI.

## Phase 3 evidence

Implemented:

- Delegated Plans can declare workflow-specific `requiredEvidenceKinds`, `qualityGates`, `completionCriteria` and `declaredScope`;
- Heartbeat records preserve `artifacts`, `memoryCandidates`, `architectureCandidates`, `acceptanceResults` and `runtimeEvidence` without breaking old state files;
- state metadata is normalized and merged by stable identity so repeated heartbeats do not create duplicate candidate or acceptance records;
- `resume_plan` restores the full declared scope, candidates, evidence and runtime metadata needed by a new Agent;
- `converge` evaluates the Plan's own evidence and quality gates rather than a universal fixed five-kind list;
- a `converge` call may add stricter evidence requirements but cannot weaken requirements already declared by the Plan;
- custom or read-only Plans can explicitly declare an empty evidence set;
- managed workflow Memory persistence remains gated by `converge passed=true`, while standalone Memory administration remains directly callable.

Validation completed:

```text
Plan lifecycle and metadata focused tests: passed
full regression suite: 492 / 492 passed across 102 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
release static checks: 37 / 37 passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
git diff --check: passed
```

Phase 3 was committed independently as `f137704`.

## Phase 4 progress

Completed in the first bounded Phase 4 slice:

- `start_feature` steady Plans now include implementation, affected/full testing and `code_review`, rather than ending at specification and estimation;
- `start_feature` and `start_bugfix` pin the resolved project root in their Plan scope and expose an explicit Heartbeat/Resume protocol;
- the protocol states that `resume_plan` only reads checkpoints and cannot infer completion from chat text, files or Git changes;
- Feature and Bug workbenches automatically create a marked initial checkpoint when none exists, but display it as untracked until an Agent verifies and writes real progress;
- the workbench uses the resolved project root, reports checkpoint counts honestly, and sends exact cumulative `plan_heartbeat` instructions when execution continues;
- existing executions that never wrote Heartbeats are not falsely marked complete or pending; they require explicit reconciliation.

Remaining Phase 4 scope:

- close and normalize `start_ui`, `start_onboard`, `start_product` and `start_ralph` delivery loops;
- verify conditional architecture validate/drift closure where those workflows use architecture evidence;
- keep each workflow independently testable and reversible.

The first Phase 4 slice was committed independently as `39a4866`.

Completed in the second bounded Phase 4 slice:

- all `start_ui` modes (`manual`, `auto`, and requirements `loop`) now use one canonical `DelegatedPlanContract` rather than three ad hoc plan shapes;
- the UI Plan pins the resolved project root and declares UI-specific evidence, completion criteria and quality gates;
- the full delivery chain now includes requirements, design-system/context setup, page structure, implementation, desktop/mobile screenshots, visual review, bounded iteration, responsive/state/accessibility acceptance, real tests, `code_review`, conditional `architecture drift`, context update and optional MemoryCandidate preparation;
- every step has explicit dependencies so `resume_plan` can recover the real next action rather than relying on array order or chat context;
- all modes render the same Heartbeat/Resume/Converge protocol and generate their structured report directly from the canonical Plan;
- architecture validation remains conditional: tasks using an ArchitectureCandidate/ADR or changing boundaries/contracts must run drift, while ordinary UI work records a justified skip;
- `start_ui.ts` was reduced from 1148 lines to 473 lines by extracting request normalization, UI policy, plan construction and report rendering into focused modules; every new production module remains below 500 lines.

Validation completed:

```text
start_ui focused suite: 48 / 48 passed across 4 test files
full regression suite: 496 / 496 passed across 102 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
release static checks: 37 / 37 passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
```

Remaining Phase 4 scope:

- close and normalize `start_onboard`, `start_product` and `start_ralph`;
- keep each remaining workflow independently testable and reversible.
