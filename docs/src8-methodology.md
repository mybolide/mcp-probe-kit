# SRC-8: Software Root-Cause 8-Step Protocol

**SRC-8** is mcp-probe-kit's bug root-cause protocol for **code + AI agent** workflows.

It is **inspired by Toyota Business Practice (TBP) and PDCA**, not a literal translation of the manufacturing 8-step form. We inherit scientific-thinking discipline and elevate it with software-native concepts.

中文文档：[src8-methodology.zh-CN.md](./src8-methodology.zh-CN.md)

---

## What we borrow from Toyota TBP

Reference: [Toyota Business Practice — Art of Lean](https://artoflean.com/reference/tbp/)

| TBP invariant | SRC-8 inheritance |
|---------------|-------------------|
| Problem = ideal − actual (gap) | Step 1 **Clarify gap** |
| Break down; find priority point | Step 2 **Narrow boundary** |
| Set measurable target before RCA | Step 3 **Acceptance contract** |
| Genchi genbutsu, 5 Why, facts | Step 4 **Root cause** (worksheet) |
| Countermeasures vs symptoms | Step 5 **Countermeasures** |
| Implement with monitoring | Step 6 **Implement** |
| Evaluate results **and** process | Step 7 **Evaluate** |
| Standardize & yokoten | Step 8 **Standardize** (memorize + tests) |

**Classic TBP failure (we forbid):** jumping straight to root-cause analysis without clarifying, breaking down, or setting a target.

---

## Our elevation (beyond TBP)

| Dimension | Manufacturing TBP | SRC-8 |
|-----------|-------------------|-------|
| Observation | Shop floor | **Read code/logs/repro**, `code_insight` |
| Decomposition | 4M / process | **Six attribution layers** incl. `agent_behavior` |
| Root cause | Often single chain | Simple: causal sentence; complex: **primary + contributing factors** |
| Done definition | Yield, cycle time | **Failing test green**, repro passes |
| Step 4 depth | 5 Why | **Worksheet 4a–4e** |
| Standardize | Work standards | Tests + **`memorize_asset` cross-repo** |
| Executor | Humans | **MCP guidance + Agent execution** |

---

## The eight steps

| # | Name | PDCA | Key output |
|---|------|------|------------|
| 1 | Clarify gap | Plan | Ideal / actual / gap |
| 2 | Narrow boundary | Plan | Timeline, layer, priority point |
| 3 | Acceptance contract | Plan | SMART acceptance criteria |
| **4** | **Root cause** | Plan | **`rootCauseAnalysis` worksheet** |
| 5 | Countermeasures | Plan | Minimal patch plan |
| 6 | Implement | Do | Patch after repro gate |
| 7 | Evaluate | Check | Results + process |
| 8 | Standardize | Act | Tests + memorize |

Plan ~60–70% of effort; **Step 4 is the core**.

---

## Step 4 worksheet (highlight)

`fix_bug` injects `structuredContent.rootCauseWorksheet`:

- **4a** Hypotheses (incl. `agent_behavior`)
- **4b** Exclusion matrix (evidence / counter-evidence / status)
- **4c** Fork point (or `evidenceGaps` without success sample)
- **4d** 5 Why chain (≥3 levels, fact-bound)
- **4e** Causal statement (simple or complex)

**Gates:** no countermeasures until worksheet closed; `confidence: low` blocks code changes.

---

## Tool mapping

| Tool | Role |
|------|------|
| `start_bugfix` | Full SRC-8 orchestration (`metadata.plan` delegated, same pattern as `start_feature`) |
| `fix_bug` | SRC-8 delegated plan + root-cause worksheet for standalone analysis |
| `code_insight` | **src8-2** in plan: boundary / impact |
| `gentest` | **src8-7** in plan: regression tests |
| `memorize_asset` | **src8-8** in plan: bugfix memory |

### Delegated plan (v3.6.11+)

`start_bugfix` / `fix_bug` return `structuredContent.metadata.plan` with steps `src8-1` … `src8-8`. Agents must follow `plan.steps` in order. MCP tool prompts embed the plan and gates **without linking to this markdown file** (not shipped in the npm package). This doc is for humans and the GitHub docs site.

Implementation: `src/lib/src8-guidance.ts`
