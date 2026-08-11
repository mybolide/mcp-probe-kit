# MCP Probe Kit Delivery System V1 — Implementation Progress

This file tracks implementation status separately from the frozen requirements document.

> **Current rc.20 surface:** Compact 24, Compact + Memory 30, Full 34, Apps model-visible 30, App-only 1, unique callable names 35. Phase 0 counts below are the historical pre-`architecture` compatibility baseline, not the current tool surface.

## Phase status

| Phase | Status | Scope |
|---|---|---|
| Phase 0 — Compatibility baseline | Complete | Freeze exact tool names, counts, visibility, App-only behavior and protocol surface |
| Phase 1 — Responsibility alignment | Complete | Align Skill, Catalog, workflow guidance and tests without changing public schemas |
| Phase 2 — `architecture` / ARC-8 | Complete | Add the single architecture domain tool and its shared methodology core |
| Phase 3 — Plan lifecycle | Complete | Extend Plan, Heartbeat, Resume and Converge compatibly |
| Phase 4 — Orchestrator closure | Complete | Feature, Bugfix, UI, Onboard, Product and bounded Ralph delivery loops are closed |
| Phase 5 — Diff and verification consistency | Complete | Compare declared scope, real diff, contracts, tests and architecture drift |
| Phase 6 — Memory quality | Complete | Enforce conflict, deduplication, lifecycle, supersede, negative-evidence, ranking and injection quality |

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

## Phase 5 evidence

Implemented:

- `code_review` can now collect a bounded real Git diff directly from `project_root` when no inline code or `file_path` is provided;
- supported diff scopes are `auto`, `working`, `staged` and explicit `range` with validated `base_ref` / `head_ref`;
- Git commands use argument arrays without shell interpolation, record current revision, branch, changed files, numstat, rename/copy status, untracked file names and truncation state;
- untracked contents are never silently treated as reviewed, and internal `.mcp-probe-kit/plans/` checkpoint files are excluded from business diff evidence;
- `plan_id` loads the persisted Plan state and exposes declared scope, expected artifacts, evidence, candidates, acceptance results, runtime evidence and last verified revision;
- deterministic consistency checks compare real changed files with explicit Plan paths, verify expected artifacts, detect missing test evidence, flag potential public-contract/Schema/migration/protocol changes, require architecture validate/drift evidence when applicable and detect stale revision evidence;
- deterministic consistency findings are separated from Agent-owned semantic code issues. MCP does not claim static scanning or automatically invent quality/security findings;
- inline `code` and `file_path` review remain compatible; the new Git/Plan inputs are optional and do not require every direct review to have a managed Plan;
- public Schema and Catalog now describe the real diff and Plan consistency inputs without changing tool names, visibility or tool counts;
- production modules remain bounded: `code_review.ts` 325 lines, `git-diff-evidence.ts` 281 lines, `code-review-evidence.ts` 199 lines and `review-consistency.ts` 286 lines.

Validation completed:

```text
Phase 5 focused evidence suite: 12 / 12 passed across 3 test files
full regression suite: 513 / 513 passed across 104 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
release static checks: 37 / 37 passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
ARC-8 drift: passed; ARC-1 through ARC-8 completed, 0 gaps, 0 drift findings
```

Phase 5 is complete. Phase 6 can now focus on Memory conflict detection, supersede/expiry lifecycle, negative evidence quality, deduplication and retrieval ranking without changing the orchestration or Plan contracts.

## Phase 6 evidence

Implemented:

- Memory lifecycle input is now strict. Invalid values no longer silently degrade to `active`; `retracted` and negative-memory types require evidence, and `superseded` requires a successor reference;
- lifecycle history is monotonic: a retracted or superseded asset cannot be silently reactivated, existing `superseded_by` cannot be rewritten, and established `supersedes` relationships are append-only;
- exact duplicate detection remains compatible with the former content/type/project scope, but now returns an explicit `deduplicated` disposition rather than claiming a new write;
- exact duplicates use deterministic Qdrant-compatible UUIDs. When the deterministic base ID already belongs to stale, expired, superseded or retracted history, a deterministic revision UUID is allocated instead of overwriting the historical record;
- same-process writes are serialized by both deduplication key and identity key. Deterministic exact-duplicate IDs also converge across processes, but the implementation does not claim globally atomic uniqueness for different-content identity conflicts across independent processes because Qdrant does not provide a corresponding unique constraint;
- same-identity, different-content writes require an explicit `conflict_policy`: `reject` by default, `supersede` for a confirmed replacement, or `allow_parallel` for intentionally concurrent conclusions;
- supersede validation prevents self-reference, cross-scope replacement, replacement of retracted targets and overwriting an existing different successor;
- successor and predecessor links are validated before persistence and written together in one Qdrant batch. Updating `superseded_by` also updates the successor's `supersedes` relationship;
- assets participating in a supersede chain cannot be hard-deleted. They must be retracted with evidence through `update_memory_asset`, preserving the audit trail;
- Qdrant scroll pagination, vector generation and batch persistence are isolated in a storage adapter. Pagination follows every cursor and rejects repeated cursors rather than silently scanning only an initial subset or looping indefinitely;
- `MemoryClient` remains the transport/read/search adapter and preserves the existing `upsertAsset` return contract. The richer write outcome is additive, and injected legacy clients that only implement `upsertAsset` continue to work;
- legacy payloads without `identityKey` remain readable because the key is derived during payload normalization. No collection migration or destructive rewrite is required;
- Memory search ranking is lifecycle-first and exposes a deterministic explanation covering vector relevance, preferred type/tag, project scope, confidence, evidence strength, applicability and weak-negative-memory penalties;
- active assets remain ahead of stale, expired, superseded and retracted assets in maintenance searches, while ordinary searches still exclude inactive lifecycle states by default;
- `search_memory` and complete-delivery Memory injection now have explicit total text budgets in addition to per-asset limits. Human-readable text reports truncation while structured results and `read_memory_asset` retain full access;
- public Memory schemas and Catalog guidance describe conflict handling, lifecycle evidence, retrieval explanations and protected deletion without adding, removing or renaming tools;
- production responsibilities remain bounded: `memory-write-operations.ts` 415 lines, `memory-write-storage.ts` 117 lines, `memory-client.ts` 350 lines, `memory-quality.ts` 207 lines, `memory-write-lock.ts` 25 lines, `memory-orchestration.ts` 468 lines, `memory-ranking.ts` 140 lines and `memory-text-budget.ts` 47 lines.

Compatibility preserved:

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
Memory quality focused suite: 78 / 78 passed across 13 test files
full regression suite: 542 / 542 passed across 108 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
release static checks: 37 / 37 passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
ARC-8 drift: passed; ARC-1 through ARC-8 completed, 0 gaps, 0 drift findings
```

Phase 6 is complete. Delivery System V1 phases 0 through 6 are now implemented, independently validated and locally reversible. No push, tag, release, npm publication or Memory collection migration was performed.

## Historical Post-V1 experiment — Explainable workflow routing (superseded by rc.20)

> Historical record only. The regex/action-object classifier described in this section is **not** the current product contract. rc.20 removed natural-language intent classification from the production path; Agent-owned tool selection and the guide-only `workflow` fallback are the current behavior. The section is retained to preserve implementation history.

This is a bounded post-V1 improvement, not a new Delivery System phase. `workflow` remains an optional fallback helper used only when the Agent cannot confidently choose the first capability after reading the Skill. It does not become a mandatory entry point, intent engine, risk classifier or orchestration controller.

Implemented:

- explicit `scenario` remains the highest-priority routing source and overrides inferred ambiguity;
- delivery routing is now represented as a named decision table rather than a sequence whose array order silently decides the winner;
- known parent/nested relationships use an explicit dominance map. For example, UI implementation suppresses its nested feature/spec candidates, product planning suppresses prototype/UI steps, Bug delivery suppresses exploratory inspection, and feature delivery suppresses its specification step;
- independent strong intents remain independent. Architecture change plus Bug repair, or review plus refactor with equal evidence, returns `unknown` instead of selecting whichever rule happens to appear first;
- keyword ties also return `unknown`; insufficient signals no longer default to a low-confidence feature workflow;
- unresolved results expose `firstTool=null`, `requiresClarification=true`, the competing candidates and their matched rule IDs, and a `clarify_or_configure` handle;
- selected results expose the routing source, reason, selected candidate and any nested candidates that were explicitly suppressed;
- word order no longer changes the outcome for the validated routing pairs;
- the existing `detectWorkflowScenario` API remains compatible and continues to return only `scenario` and `confidence`; the richer `detectWorkflowRoute` result is additive;
- `workflow` now has a dedicated structured output schema for `routingDecision`, candidate status and nullable first-tool results;
- Tool Schema, Catalog and generated Skill guidance now state that independent conflicts and ties return `unknown` rather than being guessed;
- responsibilities remain separated: `workflow-routing-contract.ts` owns the public routing types, `dev-workflow-routing.ts` owns the decision rules, `workflow-routing-render.ts` owns human-readable explanation, and `workflow.ts` owns bootstrap and response decoration;
- production modules remain bounded: `dev-workflow-routing.ts` 446 lines, `dev-workflow.ts` 483 lines, `workflow-routing-contract.ts` 50 lines, `workflow-routing-render.ts` 19 lines and `workflow.ts` 124 lines.

Compatibility preserved:

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
workflow routing focused suite: 35 / 35 passed across 3 test files
full regression suite: 557 / 557 passed across 109 test files
TypeScript compiler and production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
release static checks: 37 / 37 passed
workflow Skill verification: 34 tools synchronized
docs verification: 1080 checks passed
ARC-8 drift: passed; ARC-1 through ARC-8 completed, 0 gaps, 0 drift findings
```

The improvement is additive and locally reversible. It introduces no tool, migration, persisted routing state, push, tag, release or publication.

## Historical Post-V1 bugfix — Independent acceptance hardening (routing classifier later retired)

This bugfix is driven by an independent Cursor full-functional acceptance run. It does not add a Delivery System phase and does not turn `workflow` into a mandatory or central intent engine.

Implemented:

- replaced broad sentence-level delivery regexes with a bounded action–object signal table for Bug, architecture, onboarding, product, UI, feature, specification and Git work-report intents;
- added Chinese, English and mixed-language signals for production incidents, architecture boundaries, repository onboarding and UI visual specifications;
- preserved the fallback boundary: direct atomic and `start_*` tools remain independently callable, while `workflow` only helps when the Agent has not already selected the first capability;
- known nested steps still use an explicit dominance table, but independent deliverables do not suppress one another. Bug + Feature and architecture change + Feature now return `unknown` with conflict evidence;
- product planning suppresses its prototype/UI substep, UI implementation suppresses its nested feature/spec step, Feature suppresses its specification step, and explicit spec-only requests suppress implementation;
- explicit spec-only delivery now recognises output/generate/write wording and negative implementation constraints such as `不进行代码实现`; PRD plus prototype/UI remains a Product workflow, call-relation analysis routes to `code_insight`, and architecture modification plus an independent feature remains an unresolved conflict;
- corrected a false positive where `只读` was interpreted as “只检查规格”; explicit spec-only constraints are now evaluated before ordinary dominance and suppressed candidates cannot suppress other candidates;
- introduced the additive `work_report` workflow scenario, routed to `git_work_report`, with `report` as an explicit alias;
- architecture submode selection now uses action semantics: architecture assessment remains `assess` even when the architecture object contains “拆分”, while target-architecture conformance checks select `validate`;
- imported the independent acceptance routing matrix as a regression suite and added further Chinese/English, cross-keyword and independent-goal cases;
- ARC-8 steps outside the selected architecture mode now report `not_in_scope` rather than `completed`; successful `assess` completes only ARC-1 through ARC-3 and exposes ARC-4 through ARC-8 in `notInScopeSteps`;
- an `assess` call with explicitly empty facts, structural causes and protected invariants is now blocked at ARC-2/ARC-3 instead of being reported as a successful assessment;
- code-review intent now uses positive review action/object evidence, while the commit fallback only matches actual commit-message generation requests; the phrase “未提交代码” no longer creates a false commit/review conflict;
- Inspector smoke now follows the actual MCP Apps contract: `list_memory_assets` remains registered in the Manifest as the sole app-only action but must not appear in `tools/list` for compact or full clients;
- Git-dependent tools now select an explicit project root first, then an actual Git repository among client workspaces. When the client supplies only non-Git workspaces, they fail safely and request `project_root` instead of silently operating on the MCP server repository;
- MCP and CLI multi-workspace Git selection, no-client-workspace fallback and explicit non-Git rejection are covered by deterministic tests;
- generated PowerShell, CMD and shell wrappers no longer change the caller working directory to the wrapper installation root or force `project_root`; a test-only `MCP_PROBE_LOCAL_ENTRY` override allows acceptance to exercise the exact local build while the normal wrapper remains pinned to the exact package version;
- AGENTS.md bootstrap repairs every duplicate managed block, orphan marker and recognisable legacy generated fragment, preserves user-authored MCP sections, and remains hash-stable across repeated bootstrap calls;
- an older process now preserves a newer-version Skill, AGENTS managed block and pinned CLI rather than structurally “repairing” them back to the older version;
- `code_review` now rejects `diff_mode=range` unless both refs are supplied, and `search_memory` rejects non-integer, zero, negative or over-limit pagination values;
- Claude contract-audit batches now have a configurable model and hard timeout, terminate the process tree on timeout, and report missing AGENTS.md as a failed integrity result rather than masking the timeout with a secondary filesystem exception;
- CLI project-root selection and CLI error contracts were split out of the command dispatcher, reducing `command-line.ts` from 550 to 485 lines;
- workflow natural-language intent classification has been removed from the production path. Agents choose tools from Skill/AGENTS/tool descriptions; `workflow` is only the fallback tool-selection guide. Explicit `scenario` remains deterministic for compatibility, and the former `workflow-intent-signals.ts` classifier is retired.

Representative workflow guide contract:

```text
scenario=auto -> guide only / firstTool=null
scenario=feature -> feature / start_feature
scenario=bugfix -> bugfix / start_bugfix
scenario=ui -> ui / start_ui
scenario=architecture -> architecture / architecture
scenario=explore -> explore / code_insight
scenario=refactor -> refactor / refactor
multiple independent user goals -> Agent splits or clarifies; workflow does not classify the sentence
```

Architecture assess status:

```text
completed: ARC-1, ARC-2, ARC-3
not_in_scope: ARC-4, ARC-5, ARC-6, ARC-7, ARC-8
nextStep: null
```

Architecture assess with empty evidence:

```text
completed: ARC-1
blocked: ARC-2, ARC-3
validation.passed: false
gaps: missing current facts, structural cause and protected invariants
```

Compatibility preserved:

```text
Compact: 24
Compact + Memory: 30
Full: 34
Apps model-visible: 30
App-only registered: 1
App-only exposed through tools/list: 0
Unique callable names: 35
```

Validation completed:

```text
workflow / higher-version / wrapper focused suite: 87 / 87 passed across 5 test files
final full regression suite: 605 / 605 passed across 111 test files
TypeScript compiler and final production build: passed
tool contract audit: 39 / 39 passed
Legacy / Modern protocol smoke: passed
Inspector smoke: passed; compact 24, full 34, no app-only leakage
release static checks: 37 / 37 passed
docs verification: 1080 checks passed
Agent local acceptance: passed
Agent evals: 26 / 26 passed
package installation smoke: passed
rollback smoke to 3.7.0: passed
production dependency security audit: 0 vulnerabilities
final build black-box routing/architecture/Git-safety matrix: passed
final build wrapper, higher-version and strict-input closure: passed
real Claude MCP calls: passed for the four independent-acceptance workflow cases, empty architecture assess, project context, Git report and Memory search
final independent Claude evidence review: PASS_FOR_CURSOR_ACCEPTANCE; 0 product defects
Claude environment limitations retained as evidence: dedicated connector HTTP 404, intermittent BYOK reasoning_content errors and large-batch timeouts
final ARC-8 drift: passed; 0 gaps, 0 drift findings
build/index.js size: 3668454 bytes
build/index.js SHA-256: 64231bef472c0a726abc0d95ad50a8a01cf30a4b3ab5a2e7dd872050b09635ba
```

The build recorded immediately above is historical pre-rc.20 evidence and is not the current frozen release candidate.

## rc.20 current release-candidate closure

rc.20 restores the intended responsibility boundary: the Agent interprets the user request and chooses the MCP tool from the conversation, Skill, AGENTS.md and tool descriptions. `workflow` is only a fallback tool-selection guide; `scenario=auto` is guide-only and returns `firstTool=null`, while an explicit `scenario` remains deterministic for compatibility.

Current public tool-surface contract:

```text
Compact: 24
Compact + Memory: 30
Full: 34
Apps model-visible: 30
App-only: 1
Unique callable names: 35
```

Final frozen candidate accepted by Cursor:

```text
version: 4.0.0-rc.9
build/index.js size: 3681669 bytes
build/index.js SHA-256: 3907abeb326db62caa7ceeee0ad1ab76eaed6e6182564139717e9fee5e27ff62
Cursor final acceptance: PASS / READY_TO_RELEASE
fresh Agent tool-selection black box: 24 / 24 correct
```

The rc.20 candidate remains uncommitted and unpublished until explicit release authorization.
