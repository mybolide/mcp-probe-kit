# MCP Probe Kit Delivery System V1 — Implementation Progress

This file tracks implementation status separately from the frozen requirements document.

## Phase status

| Phase | Status | Scope |
|---|---|---|
| Phase 0 — Compatibility baseline | Complete | Freeze exact tool names, counts, visibility, App-only behavior and protocol surface |
| Phase 1 — Responsibility alignment | Complete | Align Skill, Catalog, workflow guidance and tests without changing public schemas |
| Phase 2 — `architecture` / ARC-8 | Complete | Add the single architecture domain tool and its shared methodology core |
| Phase 3 — Plan lifecycle | Complete | Extend Plan, Heartbeat, Resume and Converge compatibly |
| Phase 4 — Orchestrator closure | Complete | Feature, Bugfix, UI, Onboard, Product and bounded Ralph delivery loops are closed |
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

- close and normalize `start_product` and `start_ralph`;
- keep each remaining workflow independently testable and reversible.

Completed in the third bounded Phase 4 slice:

- `start_onboard` now returns a formal `DelegatedPlanContract` rather than a one-step prompt around `init_project_context`;
- onboarding pins the resolved project root, uses a safe project-relative docs directory, and rejects path traversal;
- the plan now covers project instructions, project context, `code_insight`, manifests/runtime configuration, entry points and module flows, command extraction and safe verification, constraints/risks, quickstart/navigation documentation, acceptance and optional project-knowledge MemoryCandidate preparation;
- onboarding remains read-only with `requiredEvidenceKinds=[]`, but declares three explicit quality gates for context readiness, command verification and project navigation;
- command validation requires real command, working directory and exit-code evidence; unexecuted commands remain candidates and dependency installation or long-running services are not performed automatically;
- all steps have explicit dependencies and all output guidance uses the shared Heartbeat/Resume/Converge protocol;
- production modules remain bounded: `start_onboard.ts` is 159 lines and `start-onboard-plan.ts` is 257 lines.

Validation completed:

```text
start_onboard focused suite: 3 / 3 passed
full regression suite: 498 / 498 passed across 102 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
release static checks: 37 / 37 passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
```

Remaining Phase 4 scope:

- close and normalize `start_ralph` independently;
- complete one final Phase 4 regression after Ralph is committed.

Completed in the fourth bounded Phase 4 slice:

- `start_product` now uses a formal product `DelegatedPlanContract` with product-specific requirements and review evidence rather than software implementation/test/code-review gates;
- the Plan declares product Brief, PRD, page-flow documents, design-system contract, interactive prototype, product acceptance report and project-context artifacts;
- material gaps in target users, scope, constraints or success metrics become an explicit user-input step rather than silent assumptions;
- `ui_design_system` is represented truthfully as returning a structured contract, followed by a separate Agent persistence step for JSON/Markdown files;
- `start_ui` is treated as a child delegated workflow: the parent prototype step requires the child plan ID, real prototype artifacts, screenshot acceptance and `converge passed=true` before completion;
- product acceptance checks PRD/prototype/state/visual consistency and performs a dedicated product-package review without pretending production code has been implemented;
- optional Memory recall and post-validation MemoryCandidate preparation are integrated without bypassing parent convergence;
- `docs_dir` and `requirements_file` are constrained to the resolved project root;
- production modules remain bounded: `start_product.ts` is 268 lines and `start-product-plan.ts` is 351 lines.

Validation completed:

```text
start_product focused suite: 5 / 5 passed
full regression suite: 501 / 501 passed across 102 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
release static checks: 37 / 37 passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
```

Remaining Phase 4 scope:

- close `start_ralph` with a bounded round model, per-round Heartbeat evidence, stop/failure policy and final Converge;
- run the final Phase 4 regression and mark the phase complete.

Completed in the fifth bounded Phase 4 slice:

- `start_ralph` now returns a formal `DelegatedPlanContract` with a deterministic Plan ID, pinned project root, explicit round bounds and `backgroundExecution=false`;
- the Plan creates one explicit step per permitted round, so `resume_plan` can restore the real round and the Workbench can display cumulative progress;
- every executed or skipped round requires structured runtime evidence including round status, revision, diff size, test command/exit code, summary, next step and stop reason, followed immediately by `plan_heartbeat`;
- the loop distinguishes successful completion from safety stops. STOP files, user decline/timeout, maximum rounds/time, repeated output, diff limits, command failure, blocked work and three failed repairs do not count as success;
- final convergence requires independent completion-promise verification, final tests, real `code_review`, conditional `architecture drift`, round-evidence audit and one recorded final stop reason;
- safe and normal modes both remain bounded and foreground-only. Generated scripts are optional helpers; `start_ralph` never starts them, creates a background process or claims a round completed;
- Memory recall and post-validation candidate preparation are integrated without bypassing final convergence;
- public Schema and Catalog wording now describe the bounded foreground behavior and accept an explicit `project_root`;
- the previous 976-line module was split into focused production modules: `start_ralph.ts` 158 lines, `start-ralph-config.ts` 175 lines, `start-ralph-templates.ts` 232 lines and `start-ralph-plan.ts` 374 lines.

Final Phase 4 validation:

```text
start_ralph focused behavior tests: 5 / 5 passed
Ralph + Skill + Registry focused suite: 16 / 16 passed
full regression suite: 504 / 504 passed across 102 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
release static checks: 37 / 37 passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
```

Phase 4 is complete. All six complete-delivery orchestrators now use explicit delivery boundaries, resumable state and task-appropriate convergence semantics. Phase 5 can begin with declared-scope versus real-diff verification and architecture-drift consistency.
