import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  detectDocumentLocale,
  discoverProjectRootFromLayout,
  layoutAbsPath,
  readLayoutManifest,
  relativeLink,
  resolveProjectContextLayout,
  writeLayoutManifest,
} from "../project-context-layout.js";
import { mergeAgentsMdBlock } from "../merge-agents-md.js";

describe("project-context-layout", () => {
  test("relativeLink from AGENTS.md to docs paths", () => {
    const link = relativeLink("AGENTS.md", "docs/project-context/tech-stack.md");
    expect(link === "docs/project-context/tech-stack.md" || link === "./docs/project-context/tech-stack.md").toBe(true);
  });

  test("default layout uses AGENTS.md and docs/", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-"));
    const layout = resolveProjectContextLayout(root, {});
    expect(layout.indexPath).toBe("AGENTS.md");
    expect(layout.contextRoot).toBe("docs");
    expect(layout.modularDir).toBe("docs/project-context");
    expect(layout.latestMarkdownPath).toBe("docs/graph-insights/latest.md");
  });

  test("writeLayoutManifest is portable (no absolute projectRoot)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-manifest-"));
    const layout = resolveProjectContextLayout(root, {});
    const rel = writeLayoutManifest(root, layout);
    expect(rel).toBe("docs/.mcp-probe/layout.json");
    const manifest = readLayoutManifest(root);
    expect(manifest?.indexPath).toBe("AGENTS.md");
    expect(manifest?.projectRoot).toBeUndefined();
    expect(manifest?.projectRootEnv).toBe("MCP_PROJECT_ROOT");
    expect(discoverProjectRootFromLayout(root)).toBe(path.resolve(root));
  });

  test("ignores stale absolute projectRoot in manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-stale-root-"));
    const layout = resolveProjectContextLayout(root, {});
    writeLayoutManifest(root, layout);
    const manifestPath = path.join(root, "docs", ".mcp-probe", "layout.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.projectRoot = "Z:/nonexistent/wrong-root";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    expect(discoverProjectRootFromLayout(path.join(root, "src"))).toBe(path.resolve(root));
  });

  test("infers root for custom contextRoot manifest path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-custom-docs-"));
    const layout = resolveProjectContextLayout(root, { docs_dir: "documentation" });
    writeLayoutManifest(root, layout);
    expect(fs.existsSync(path.join(root, "documentation", ".mcp-probe", "layout.json"))).toBe(true);
    const fromSub = resolveProjectContextLayout(path.join(root, "src"), {});
    expect(fromSub.projectRoot).toBe(path.resolve(root));
    expect(fromSub.contextRoot).toBe("documentation");
  });

  test("discovers projectRoot from layout.json when cwd is subdirectory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-discover-"));
    const layout = resolveProjectContextLayout(root, {});
    writeLayoutManifest(root, layout);
    const subDir = path.join(root, "src", "tools");
    fs.mkdirSync(subDir, { recursive: true });
    expect(discoverProjectRootFromLayout(subDir)).toBe(path.resolve(root));
    const fromSub = resolveProjectContextLayout(subDir, {});
    expect(fromSub.projectRoot).toBe(path.resolve(root));
    expect(layoutAbsPath(fromSub, "docs/project-context.md")).toBe(
      path.join(root, "docs", "project-context.md")
    );
  });

  test("detectDocumentLocale zh from README", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-zh-"));
    fs.writeFileSync(
      path.join(root, "README.md"),
      "# 测试项目\n\n这是一个中文项目说明，用于单元测试。\n".repeat(5),
      "utf8"
    );
    expect(detectDocumentLocale(root)).toBe("zh-CN");
  });
});

describe("mergeAgentsMdBlock", () => {
  test("prepends block when no marker exists", () => {
    const { content, mergeMode } = mergeAgentsMdBlock("# User rules\n", "## MCP block");
    expect(mergeMode).toBe("prepended");
    expect(content.startsWith("<!-- mcp-probe:context begin")).toBe(true);
    expect(content).toContain("# User rules");
  });

  test("replaces and moves block to top", () => {
    const existing = "# Footer\n\n<!-- mcp-probe:context begin -->\nold\n<!-- mcp-probe:context end -->\n";
    const { content, mergeMode } = mergeAgentsMdBlock(existing, "new inner");
    expect(mergeMode).toBe("replaced-and-moved-to-top");
    expect(content.indexOf("new inner")).toBeLessThan(content.indexOf("# Footer"));
  });
});
