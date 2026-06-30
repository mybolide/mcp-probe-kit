import { afterEach, describe, expect, test } from "vitest";
import {
  agentsSkillReferenceSatisfied,
  formatAgentsSkillReference,
  resolveAgentsSkillRefMode,
} from "../agents-skill-ref.js";
import { MCP_PROBE_SKILL_REL_PATH } from "../workflow-skill-template.js";

const prev = process.env.MCP_AGENTS_SKILL_REF;

afterEach(() => {
  if (prev === undefined) {
    delete process.env.MCP_AGENTS_SKILL_REF;
  } else {
    process.env.MCP_AGENTS_SKILL_REF = prev;
  }
});

describe("agents-skill-ref", () => {
  test("默认 both 模式包含 @ 与链接", () => {
    delete process.env.MCP_AGENTS_SKILL_REF;
    const text = formatAgentsSkillReference(".agents/skills/mcp-probe-kit/SKILL.md");
    expect(text).toContain(`@${MCP_PROBE_SKILL_REL_PATH}`);
    expect(text).toContain("[MCP 调用时机]");
  });

  test("at 模式仅 @ 引用", () => {
    process.env.MCP_AGENTS_SKILL_REF = "at";
    expect(resolveAgentsSkillRefMode()).toBe("at");
    const text = formatAgentsSkillReference("skill.md");
    expect(text).toContain("@");
    expect(text).not.toContain("[MCP 调用时机]");
  });

  test("agentsSkillReferenceSatisfied 校验 both", () => {
    const ok = `before @${MCP_PROBE_SKILL_REL_PATH} and [link](${MCP_PROBE_SKILL_REL_PATH})`;
    expect(agentsSkillReferenceSatisfied(ok, "both")).toBe(true);
    expect(agentsSkillReferenceSatisfied(`only ${MCP_PROBE_SKILL_REL_PATH}`, "both")).toBe(false);
  });
});
