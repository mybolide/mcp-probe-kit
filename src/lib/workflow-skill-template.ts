/**
 * v5 Skill is generated exclusively from the SQLite + DevControl contract.
 * Historical v4 Skill paths are accepted only as migration markers.
 */
import { VERSION } from '../version.js';
import { renderV5Skill } from './v5-sqlite-guidance.js';
import { SKILL_GUIDANCE_MARKER, SKILL_GUIDANCE_REVISION, SKILL_VERSION_FRONTMATTER_KEY } from './workflow-skill-version.js';

export const MCP_PROBE_SKILL_REL_PATH = '.agents/skills/mcp-probe-kit/SKILL.md';
/** @deprecated Only used when repairing an existing Agents.md v4 Skill path. */
export const LEGACY_WORKFLOW_SKILL_REL_PATH = '.agents/skills/workflow/SKILL.md';
export const MCP_PROBE_SKILL_NAME = 'mcp-probe-kit';
export const MCP_PROBE_SKILL_DESCRIPTION =
  'v5 SQLite + DevControl 唯一研发流程：需求、Feature、Bug、Idea、冻结任务、审批、真实测试与 SQLite History。Node.js 22+；不支持 v4 文件式 Spec / Plan / Heartbeat / start_*。';

export function generateWorkflowSkillBody(skillVersion: string = VERSION): string {
  return renderV5Skill(skillVersion);
}

export function formatSkillFrontmatter(skillVersion: string = VERSION): string {
  return `---
name: ${MCP_PROBE_SKILL_NAME}
description: >-
  ${MCP_PROBE_SKILL_DESCRIPTION}
${SKILL_VERSION_FRONTMATTER_KEY}: "${skillVersion}"
---`;
}

export function generateWorkflowSkillContent(skillVersion: string = VERSION): string {
  return `${formatSkillFrontmatter(skillVersion)}

${generateWorkflowSkillBody(skillVersion)}
<!-- ${SKILL_GUIDANCE_MARKER}: ${SKILL_GUIDANCE_REVISION} -->
`;
}
