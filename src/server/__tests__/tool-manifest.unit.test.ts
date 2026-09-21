import { describe, expect, test } from "vitest";
import {
  MANIFEST_PROTOCOL_CURRENT,
  MANIFEST_PROTOCOL_LEGACY,
  MANIFEST_SUPPORTED_PROTOCOLS,
  buildToolManifestSections,
  mergeToolManifest,
} from "../tool-manifest.js";

describe("Tool Manifest", () => {
  test("由 Catalog 生成真实工具集数量和成员", () => {
    const sections = buildToolManifestSections();

    expect(sections.totalTools).toBe(34);
    expect(sections.toolsets.core.count).toBe(13);
    expect(sections.toolsets.workflow.count).toBe(33);
    expect(sections.toolsets.workflow.tools).toContain("workflow");
    expect(sections.toolsets.workflow.tools).toEqual(
      expect.arrayContaining(["plan_heartbeat", "resume_plan", "converge", "architecture"])
    );
    expect(sections.toolsets.workflow.tools).not.toContain("git_work_report");
    expect(sections.categories.routing.tools).toEqual(["workflow"]);
  });

  test("同步时保留历史兼容说明并更新版本与 Current 协议日期", () => {
    const merged = mergeToolManifest(
      {
        protocol: "2025-11-25",
        structuredOutput: { version: "old", schemas: { example: "Schema" } },
        v3Changes: { philosophy: "keep" },
      },
      "4.0.0"
    );

    expect(merged.version).toBe("4.0.0");
    expect(merged.protocol).toBe(MANIFEST_PROTOCOL_CURRENT);
    expect(merged.supportedProtocols).toEqual([...MANIFEST_SUPPORTED_PROTOCOLS]);
    expect(merged.supportedProtocols).toContain(MANIFEST_PROTOCOL_LEGACY);
    expect(merged.v3Changes).toEqual({ philosophy: "keep" });
    expect(merged.structuredOutput).toEqual({
      version: "4.0.0",
      schemas: { example: "Schema" },
    });
  });

  test("缺少旧 protocol 时仍写入 Current 与 dual-era 列表", () => {
    const merged = mergeToolManifest({}, "4.0.1");
    expect(merged.protocol).toBe(MANIFEST_PROTOCOL_CURRENT);
    expect(merged.supportedProtocols).toEqual([...MANIFEST_SUPPORTED_PROTOCOLS]);
  });
});
