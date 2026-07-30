import { describe, expect, test } from "vitest";
import { buildToolManifestSections, mergeToolManifest } from "../tool-manifest.js";

describe("Tool Manifest", () => {
  test("由 Catalog 生成真实工具集数量和成员", () => {
    const sections = buildToolManifestSections();

    expect(sections.totalTools).toBe(30);
    expect(sections.toolsets.core.count).toBe(12);
    expect(sections.toolsets.workflow.count).toBe(29);
    expect(sections.toolsets.workflow.tools).toContain("workflow");
    expect(sections.toolsets.workflow.tools).not.toContain("git_work_report");
    expect(sections.categories.routing.tools).toEqual(["workflow"]);
  });

  test("同步时保留历史兼容说明并更新版本", () => {
    const merged = mergeToolManifest(
      {
        protocol: "2025-11-25",
        structuredOutput: { version: "old", schemas: { example: "Schema" } },
        v3Changes: { philosophy: "keep" },
      },
      "4.0.0"
    );

    expect(merged.version).toBe("4.0.0");
    expect(merged.protocol).toBe("2025-11-25");
    expect(merged.v3Changes).toEqual({ philosophy: "keep" });
    expect(merged.structuredOutput).toEqual({
      version: "4.0.0",
      schemas: { example: "Schema" },
    });
  });
});
