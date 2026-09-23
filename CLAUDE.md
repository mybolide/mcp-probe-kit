<!-- mcp-probe:harness begin — auto-generated; do not edit -->
## MCP (mcp-probe-kit)

> mcp-probe-kit-harness-adapter-version: 4.0.3

- If the user says only “continue”, “start”, or “keep going”, call `resume_plan` first. Pass `plan_id` when known; otherwise pass only `project_root` to recover the latest active/blocked Plan.
- Before confirming there is no resumable Plan, do not inspect the workspace with Bash, call `workflow`, or restart with `start_*`.
- When `resume_plan` returns `mustContinue=true`, do not stop after reporting recovery. Execute `nextStep/nextTool` immediately, call `plan_heartbeat` after each step, and continue until blocked, cancelled, or converged.
- For all other work, read the `mcp-probe:context` block in `AGENTS.md` or Skill `.agents/skills/mcp-probe-kit/SKILL.md` before coding.
<!-- mcp-probe:harness end -->
