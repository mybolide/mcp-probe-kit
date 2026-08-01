# UI Design Workflow v2

## Purpose

The UI toolchain treats design as a sequence of coordinated decisions and visible verification, not as a collection of style labels.

The authority order is:

1. User task, target users, product constraints and explicit avoid list.
2. The `ui_design_system` visual-direction contract.
3. The selected `ui_search mode=structure` page structure.
4. Existing project components and brand assets.
5. External Skills and component libraries as controlled implementation aids.

A later source cannot silently override an earlier source.

## `ui_design_system`

The tool returns contract version `2.0` with:

- primary task, screen type, target audience and content density;
- one coherent visual direction with rationale and reference lessons;
- information hierarchy, layout, navigation and responsive behavior;
- typography, OKLCH color tokens, spacing, radius, border, depth, imagery and motion;
- component and content rules;
- global and project-specific prohibited patterns;
- seven weighted review dimensions, target score, required viewports and blocking failures.

The only required artifacts are:

- `docs/design-system.json`
- `docs/design-system.md`

Legacy `colors` and `typography` views remain in structured output for compatibility. They are derived from the v2 contract rather than independently selected.

## `ui_search mode=structure`

Structure search matches the user's task, screen type and density against task-oriented page patterns. Results describe:

- named regions and their purpose;
- user task flow;
- interaction behavior;
- desktop, tablet and mobile restructuring;
- when the pattern is appropriate;
- prohibited layout shortcuts;
- reference methods without copying another product's brand appearance.

The selected result is saved to `docs/ui/page-structure.json`.

Legacy component, guideline and data search modes remain available. They do not control the visual direction.

## `start_ui`

All modes include these mandatory execution stages:

1. Lock visual direction.
2. Select and save page structure.
3. Implement one key screen before expanding the surface area.
4. Capture a real 1440x900 screenshot.
5. Capture a real 390x844 screenshot.
6. Score both screenshots against all seven contract dimensions.
7. Iterate from visible defects when the score is below target, a dimension is below the floor, or a blocking failure is present.
8. Re-capture and re-score after every iteration.
9. Pass only when the current screenshots meet the target and contain no blocking failure.

The default target is 8.5/10. Review rounds are bounded from one to five, with a default of three.

A code review, DOM inspection, CSS audit or verbal claim cannot replace screenshot evidence. Historical screenshots cannot be reused as current evidence.

## External Skill boundary

The Skill order for UI work is:

1. `interaction-design`
2. `frontend-design`
3. `ui-ux-pro-max`

These Skills may supplement interaction states, accessibility, implementation details and structural references. They cannot reselect the style, palette, typography, density, page structure, avoid list or target score. Conflicting recommendations are discarded.

For React and Next.js, shadcn is used at the component-primitive level after page structure is locked. Full-page blocks are not layout authority.

## Real-Agent validation

An isolated acceptance project was run with Claude Code 2.1.179 against the local server build.

Exact MCP calls were verified in this order:

1. `start_ui`
2. `ui_design_system`
3. `ui_search` with `mode=structure`

The trace confirmed:

- visual contract version `2.0`;
- required review steps: `structure`, `capture-desktop`, `capture-mobile`, `visual-review`, `visual-iterate`, `visual-acceptance`;
- exactly two design artifacts;
- `signal-workbench` selected for the professional trading dashboard.

The Agent then implemented a dependency-free opportunity-radar dashboard and generated real screenshots.

- Round 1: 8.41/10, rejected.
- Final round: 8.84/10, passed with no blocking failure.
- Visible changes included removal of unused desktop space, a populated evidence inspector, a clear selected-row state, removal of duplicated mobile titles, and a condensed mobile toolbar.
- Remaining issues were recorded rather than hidden: several secondary mobile controls still appeared below the 44px target, and dense evidence text could align more cleanly.

This sample proves that the workflow can reject an insufficient first render and converge through visible evidence. It does not prove that every product or Host will achieve the same score. Real project and Host validation remain independent.
