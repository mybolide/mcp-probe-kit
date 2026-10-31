#!/usr/bin/env node
/**
 * 校验 MCP Skill 注册表与 allToolSchemas 一致。
 * prebuild 自动调用；增删工具后若失败，请更新 src/lib/mcp-tool-skill-registry.ts
 */

import { allToolSchemas } from "../src/schemas/index.ts";
import { isV5Tool } from '../src/server/v5-tool-policy.ts';
import {
  formatSkillRegistryMismatchMessage,
  validateMcpToolSkillRegistry,
} from "../src/lib/mcp-tool-skill-registry.ts";
import { generateWorkflowSkillContent } from "../src/lib/workflow-skill-template.ts";
import { renderV5AgentsMd } from "../src/lib/v5-sqlite-guidance.ts";
import { SKILL_GUIDANCE_REVISION } from "../src/lib/workflow-skill-version.ts";
import { VERSION } from "../src/version.ts";

const registeredToolNames = allToolSchemas.map((tool) => tool.name).filter(isV5Tool).sort();
const result = validateMcpToolSkillRegistry(registeredToolNames);

if (!result.ok) {
  console.error("[verify-workflow-skill] FAIL\n");
  console.error(formatSkillRegistryMismatchMessage(result));
  process.exit(1);
}

// Always validate the templates that ACTUALLY write Skill/AGENTS.md on MCP
// startup and every project tool call. Updating tool names alone is not enough:
// stale lifecycle instructions can require APIs the implementation no longer
// needs. Keep this check in the existing prebuild verification gate.
const guidance = [
  ['Skill', generateWorkflowSkillContent(VERSION)],
  ['AGENTS zh-CN', renderV5AgentsMd('zh-CN', '@.agents/skills/mcp-probe-kit/SKILL.md')],
  ['AGENTS en', renderV5AgentsMd('en', '@.agents/skills/mcp-probe-kit/SKILL.md')],
] as const;
const errors:string[]=[];
for(const [name,source] of guidance){
  if(!source.includes('mcp-probe:guidance-revision: '+SKILL_GUIDANCE_REVISION))
    errors.push(name+' is missing the current managed guidance revision');
  if(!source.includes('self-review')||
    !/reviewMode[=:]?"?self"?/.test(source)||
    !source.includes('gate-review')||!source.includes('verify'))
    errors.push(name+' omits the actual self-review / self Gate review / verify contract');
  if(!source.includes('refresh-protected-worktree'))
    errors.push(name+' omits the Owner-authorized HEAD-restored protected snapshot refresh action');
  if(/have a DIFFERENT reviewer perform review-submit|不同的独立 Reviewer.{0,18}review-submit|distinct Reviewer supplies/.test(source))
    errors.push(name+' still mandates an external Reviewer for every delivery');
}
if(errors.length){
  console.error('[verify-workflow-skill] Managed Skill/AGENTS lifecycle mismatch:\n'+
    errors.map(item=>'- '+item).join('\n'));
  process.exit(1);
}

console.log(
  `[verify-workflow-skill] OK — ${registeredToolNames.length} tools, Skill + AGENTS zh-CN/en lifecycle policy and revision ${SKILL_GUIDANCE_REVISION}`
);
