<!-- mcp-probe:harness begin — auto-generated; do not edit -->
## MCP (mcp-probe-kit)

> mcp-probe-kit-harness-adapter-version: 5.0.0
> mcp-probe:guidance-revision: v5-sqlite-devcontrol-20261109-session-resume-r44

- At conversation start, use `history_session_bootstrap` and read the `mcp-probe:context` block in `AGENTS.md` and Skill `.agents/skills/mcp-probe-kit/SKILL.md`.
- When the user says “continue” or “start”, use `devcontrol` actions `onboard`, `next`, and `execution-contract` to recover the approved SQLite task state before changing files.
- Use `devcontrol` for formal development work. For ordinary in_progress tasks, run real tests and commit approved source changes, then call `devcontrol` action=`submit` once with completion details and original test evidence. Submit only records an in_review delivery; it never passes a Gate or makes the task Verified. Independently review the exact frozen Git revision or immutable source snapshot, then use a separate `verify` acceptance object with findings for every real Gate. A different Reviewer is optional; legacy `complete` / `report` and review actions remain available for exceptional or historical receipts. Never fabricate test evidence.
- New sessions read next.sessionRecoveryCandidates and task-closure-status. resume-session restores expired safe work; submitted Git reviews release the writer and use a separate reviewToken. recover-review rotates an expired review-only permission without taking a Git index. reopen-for-rework creates a new approved-scope attempt ONLY for failed or invalidated reviews, preserving earlier evidence and Gate requirements.
- Never install guidance from the current directory. For any separately authorized installation, verify an absolute project root first.
<!-- mcp-probe:harness end -->
