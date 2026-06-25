import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { VERSION } from "../../version.js";
import {
  ensureAgentsMdSkillReference,
  ensureMcpProbeKitBootstrap,
  ensureMcpProbeSkill,
  resolveProjectRootFromToolArgs,
} from "../workflow-skill-installer.js";
import {
  formatSkillVersionMarker,
  agentsContextNeedsUpgrade,
  compareSemver,
  skillContentNeedsUpgrade,
} from "../workflow-skill-version.js";
import {
  LEGACY_WORKFLOW_SKILL_REL_PATH,
  MCP_PROBE_SKILL_REL_PATH,
} from "../workflow-skill-template.js";
import { wrapMcpProbeBlock } from "../merge-agents-md.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("workflow-skill-version", () => {
  test("compareSemver 比较主次补丁", () => {
    expect(compareSemver("3.5.0", "3.5.1")).toBeLessThan(0);
    expect(compareSemver("3.6.0", "3.5.9")).toBeGreaterThan(0);
    expect(compareSemver("3.5.0", "3.5.0")).toBe(0);
  });

  test("无版本标记视为需要升级", () => {
    expect(skillContentNeedsUpgrade("# custom", VERSION)).toBe(true);
    expect(agentsContextNeedsUpgrade("<!-- mcp-probe:context begin -->", VERSION)).toBe(true);
  });
});

describe("workflow-skill-installer", () => {
  test("缺失时创建 mcp-probe-kit Skill", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wf-skill-"));
    tempDirs.push(root);

    const result = ensureMcpProbeSkill(root);

    expect(result.created).toBe(true);
    expect(result.updated).toBe(false);
    expect(result.version).toBe(VERSION);
    const text = fs.readFileSync(path.join(root, MCP_PROBE_SKILL_REL_PATH), "utf8");
    expect(text).toContain(formatSkillVersionMarker(VERSION));
    expect(text).toContain("MCP 调用时机");
  });

  test("同版本 Skill 不覆盖", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wf-skill-"));
    tempDirs.push(root);
    const skillPath = path.join(root, MCP_PROBE_SKILL_REL_PATH);
    const content = `${formatSkillVersionMarker(VERSION)}\n# same version\n`;
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, content, "utf8");

    const result = ensureMcpProbeSkill(root);

    expect(result.created).toBe(false);
    expect(result.updated).toBe(false);
    expect(fs.readFileSync(skillPath, "utf8")).toBe(content);
  });

  test("旧版本 Skill 会升级覆盖", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wf-skill-"));
    tempDirs.push(root);
    const skillPath = path.join(root, MCP_PROBE_SKILL_REL_PATH);
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(
      skillPath,
      `${formatSkillVersionMarker("0.1.0")}\n# stale tools list\n`,
      "utf8"
    );

    const result = ensureMcpProbeSkill(root);

    expect(result.updated).toBe(true);
    expect(result.previousVersion).toBe("0.1.0");
    const text = fs.readFileSync(skillPath, "utf8");
    expect(text).toContain(formatSkillVersionMarker(VERSION));
    expect(text).toContain("何时调用");
    expect(text).not.toContain("stale tools list");
  });

  test("无 AGENTS.md 时创建并引用 Skill", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wf-skill-"));
    tempDirs.push(root);

    const result = ensureAgentsMdSkillReference(root);

    expect(result.created).toBe(true);
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("mcp-probe:context-version");
    expect(agents).toContain(MCP_PROBE_SKILL_REL_PATH);
  });

  test("已有 AGENTS.md 但缺 Skill 引用时更新", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wf-skill-"));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Custom rules\n", "utf8");

    const result = ensureAgentsMdSkillReference(root);

    expect(result.updated).toBe(true);
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Custom rules");
    expect(agents).toContain(MCP_PROBE_SKILL_REL_PATH);
  });

  test("旧 workflow Skill 路径会触发 AGENTS.md 更新", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wf-skill-"));
    tempDirs.push(root);
    const legacyBlock = wrapMcpProbeBlock(
      `## MCP\nSee [skill](${LEGACY_WORKFLOW_SKILL_REL_PATH})`,
      "0.1.0"
    );
    fs.writeFileSync(path.join(root, "AGENTS.md"), `${legacyBlock}\n`, "utf8");

    const result = ensureAgentsMdSkillReference(root);

    expect(result.updated).toBe(true);
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain(MCP_PROBE_SKILL_REL_PATH);
    expect(agents).toContain(`mcp-probe:context-version: ${VERSION}`);
  });

  test("bootstrap 同时处理 Skill 与 AGENTS.md", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wf-skill-"));
    tempDirs.push(root);

    const result = ensureMcpProbeKitBootstrap(root);

    expect(result.skill.created).toBe(true);
    expect(result.agentsMd.created).toBe(true);
  });

  test("从 tool args 解析 project_root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wf-skill-"));
    tempDirs.push(root);
    expect(resolveProjectRootFromToolArgs({ project_root: root })).toBe(path.resolve(root));
  });
});
