import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  PROJECT_BOOTSTRAP_URI,
  ensureAndDiscoverProjectResources,
  readProjectResourceContent,
} from "../project-mcp-resources.js";
import { MCP_PROBE_SKILL_REL_PATH } from "../workflow-skill-template.js";

function withTempProject(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-proj-res-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("project-mcp-resources", () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  test("ensureAndDiscoverProjectResources auto-creates skill and agents", () => {
    withTempProject((root) => {
      const snapshot = ensureAndDiscoverProjectResources(root);
      expect(snapshot.bootstrap.skill.created).toBe(true);
      expect(snapshot.bootstrap.agentsMd.created).toBe(true);
      expect(fs.existsSync(path.join(root, MCP_PROBE_SKILL_REL_PATH))).toBe(true);
      expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);

      const skill = snapshot.resources.find((item) => item.id === "skill");
      expect(skill?.exists).toBe(true);
    });
  });

  test("readProjectResourceContent returns bootstrap catalog", () => {
    withTempProject((root) => {
      const content = readProjectResourceContent(PROJECT_BOOTSTRAP_URI, root);
      expect(content?.mimeType).toBe("application/json");
      const payload = JSON.parse(content?.text ?? "{}");
      expect(payload.autoBootstrap.skill.path).toBe(MCP_PROBE_SKILL_REL_PATH);
      expect(Array.isArray(payload.resources)).toBe(true);
    });
  });

  test("readProjectResourceContent reads skill markdown", () => {
    withTempProject((root) => {
      ensureAndDiscoverProjectResources(root);
      const content = readProjectResourceContent("probe://project/skill", root);
      expect(content?.mimeType).toBe("text/markdown");
      expect(content?.text).toContain("mcp-probe-kit-skill-version");
    });
  });
});
