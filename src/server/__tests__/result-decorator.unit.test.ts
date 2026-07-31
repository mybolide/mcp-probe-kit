import { describe, expect, test } from "vitest";
import { withBootstrapMeta } from "../result-decorator.js";
import type { McpProbeKitBootstrapResult } from "../../lib/workflow-skill-installer.js";

const bootstrap: McpProbeKitBootstrapResult = {
  projectRoot: "/tmp/project",
  skill: {
    skillPath: "/tmp/project/.agents/skills/mcp-probe-kit/SKILL.md",
    skillRelPath: ".agents/skills/mcp-probe-kit/SKILL.md",
    existed: false,
    created: true,
    updated: false,
    version: "4.0.0-rc.2",
    previousVersion: null,
  },
  agentsMd: {
    path: "AGENTS.md",
    existed: false,
    created: true,
    updated: false,
  },
};

describe("withBootstrapMeta", () => {
  test("keeps model-visible structuredContent unchanged and stores bootstrap in _meta", () => {
    const structuredContent = {
      mode: "guidance",
      summary: "Readable guidance",
      instructions: ["Do the work"],
      outputContract: {},
      boundaries: [],
    };
    const result = withBootstrapMeta(
      {
        content: [{ type: "text", text: "Readable guidance" }],
        structuredContent,
        _meta: { existing: true },
      },
      bootstrap
    );

    expect(result.structuredContent).toEqual(structuredContent);
    expect(result._meta?.existing).toBe(true);
    expect((result._meta?.mcp_probe_bootstrap as any)?.skill?.created).toBe(true);
  });

  test("does not create structuredContent for text-only guidance", () => {
    const result = withBootstrapMeta(
      { content: [{ type: "text", text: "Text-only guidance" }] },
      bootstrap
    );

    expect(result.structuredContent).toBeUndefined();
    expect(result._meta?.mcp_probe_bootstrap).toBeDefined();
  });
});
