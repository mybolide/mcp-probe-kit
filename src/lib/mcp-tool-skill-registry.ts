/**
 * v5 active-tool metadata used for auditing the generated SQLite Skill.
 * All development workflow instructions live in v5-sqlite-guidance.ts.
 */
import { TOOL_CATALOG } from '../server/tool-catalog.js';
import type { ToolCatalogEntry } from '../server/tool-catalog.js';

export interface McpToolSkillEntry { name: string; whenToCall: string }
export interface McpToolSkillGroup {
  id: string; title: string; note?: string; tools: McpToolSkillEntry[];
}

export const MCP_TOOL_SKILL_GROUPS: McpToolSkillGroup[] = (() => {
  const groups = new Map<string, McpToolSkillGroup>();
  for (const item of TOOL_CATALOG) {
    const { groupId, groupTitle, whenToCall } = item.skillRoute;
    const group = groups.get(groupId) ?? { id: groupId, title: groupTitle, tools: [] };
    group.tools.push({ name: item.name, whenToCall });
    groups.set(groupId, group);
  }
  return [...groups.values()];
})();

export function listMcpToolSkillRegistryNames(): string[] {
  return MCP_TOOL_SKILL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.name));
}

export function validateMcpToolSkillRegistry(registeredToolNames: string[]): {
  ok: boolean; missingInRegistry: string[]; extraInRegistry: string[]; duplicateInRegistry: string[];
} {
  const entries = listMcpToolSkillRegistryNames();
  const registered = new Set(registeredToolNames);
  const inCatalog = new Set(entries);
  const missingInRegistry = registeredToolNames.filter((name) => !inCatalog.has(name));
  const extraInRegistry = entries.filter((name) => !registered.has(name));
  const duplicateInRegistry = [...new Set(entries.filter((name, i) => entries.indexOf(name) !== i))];
  return {
    ok: !missingInRegistry.length && !extraInRegistry.length && !duplicateInRegistry.length,
    missingInRegistry, extraInRegistry, duplicateInRegistry,
  };
}

export function formatSkillRegistryMismatchMessage(result: ReturnType<typeof validateMcpToolSkillRegistry>): string {
  const lines = ['v5 SQLite Tool Registry and generated Skill are inconsistent.'];
  if (result.missingInRegistry.length) lines.push('Missing: ' + result.missingInRegistry.join(', '));
  if (result.extraInRegistry.length) lines.push('Removed: ' + result.extraInRegistry.join(', '));
  if (result.duplicateInRegistry.length) lines.push('Duplicate: ' + result.duplicateInRegistry.join(', '));
  return lines.join('\n');
}
