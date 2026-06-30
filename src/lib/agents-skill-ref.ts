import { MCP_PROBE_SKILL_REL_PATH } from "./workflow-skill-template.js";

export type AgentsSkillRefMode = "link" | "at" | "both";

/** AGENTS.md 中如何引用 mcp-probe-kit Skill（默认 both：@ 强绑定 + Markdown 链接） */
export function resolveAgentsSkillRefMode(): AgentsSkillRefMode {
  const raw = process.env.MCP_AGENTS_SKILL_REF?.trim().toLowerCase();
  if (raw === "link" || raw === "at" || raw === "both") {
    return raw;
  }
  return "both";
}

export function formatAgentsSkillReference(
  skillLink: string,
  mode: AgentsSkillRefMode = resolveAgentsSkillRefMode()
): string {
  const atRef = `@${MCP_PROBE_SKILL_REL_PATH}`;
  const linkRef = `[MCP 调用时机](${skillLink})`;

  switch (mode) {
    case "at":
      return `写代码前先读 Skill：${atRef}`;
    case "link":
      return `写代码前先读 Skill：${linkRef}（\`${MCP_PROBE_SKILL_REL_PATH}\`）`;
    default:
      return `写代码前先读 Skill：${atRef}（或 ${linkRef}）`;
  }
}

export function formatAgentsSkillReferenceEn(
  skillLink: string,
  mode: AgentsSkillRefMode = resolveAgentsSkillRefMode()
): string {
  const atRef = `@${MCP_PROBE_SKILL_REL_PATH}`;
  const linkRef = `[When to call MCP](${skillLink})`;

  switch (mode) {
    case "at":
      return `Before coding, read Skill: ${atRef}`;
    case "link":
      return `Before coding, read Skill: ${linkRef} (\`${MCP_PROBE_SKILL_REL_PATH}\`)`;
    default:
      return `Before coding, read Skill: ${atRef} (or ${linkRef})`;
  }
}

export function agentsSkillReferenceSatisfied(
  content: string,
  mode: AgentsSkillRefMode = resolveAgentsSkillRefMode()
): boolean {
  const hasAt = content.includes(`@${MCP_PROBE_SKILL_REL_PATH}`);
  const hasLink = content.includes(MCP_PROBE_SKILL_REL_PATH);
  switch (mode) {
    case "at":
      return hasAt;
    case "link":
      return hasLink;
    default:
      return hasAt && hasLink;
  }
}
