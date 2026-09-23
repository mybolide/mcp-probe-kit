# Graph insights — CLI fallback unpublished pin

- Target: `ensureCliFallback` (`src/lib/cli-fallback-installer.ts`)
- Mode: impact / upstream (GitNexus via `code_insight`)
- Risk: low–medium for wrapper text only; callers are `workflow-skill-installer` / agent install, not start_feature / memory / converge logic

## Boundary

- Generated artifacts: `.mcp-probe-kit/bin/probe.*`, `runtime.json`
- Docs/skill: `workflow-skill-template.ts` → `.agents/skills/mcp-probe-kit/SKILL.md`, `cli-local-env.ts` example
- Out of scope: MCP tool business logic, publish to npm, pinning to `4.0.3`

## Callers

- `ensureCliFallback` writes wrappers used by agent CLI fallback when native MCP tools are missing
- Consumer wrappers previously fell through to `npx mcp-probe-kit@<pin>` only; unpublished RC yields ETARGET
