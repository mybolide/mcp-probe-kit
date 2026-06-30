import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ensureHarnessAdapters } from "../harness-adapters.js";
import { CANONICAL_SKILL_REL_PATH, detectHarnessContext } from "../harness-skill-targets.js";
import { generateWorkflowSkillContent } from "../workflow-skill-template.js";
import { VERSION } from "../../version.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("harness-skill-targets", () => {
  test("无工具目录时不写适配层", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-"));
    tempDirs.push(root);

    const detection = detectHarnessContext(root);

    expect(detection.adaptersToWrite).toHaveLength(0);
    expect(detection.detected).toEqual(["agents"]);
    expect(detection.skillCanonical).toBe(CANONICAL_SKILL_REL_PATH);
  });

  test("存在 .trae 时自动写 trae Skill 镜像", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, ".trae"), { recursive: true });

    const skill = generateWorkflowSkillContent(VERSION);
    const result = ensureHarnessAdapters(root, skill);

    expect(result.adapters.some((a) => a.path === ".trae/skills/mcp-probe-kit/SKILL.md")).toBe(true);
    const mirror = fs.readFileSync(
      path.join(root, ".trae/skills/mcp-probe-kit/SKILL.md"),
      "utf8"
    );
    expect(mirror).toBe(skill);
    expect(result.detection.detected).toContain("trae");
  });

  test("存在 .lingma 时自动写规则指针", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, ".lingma"), { recursive: true });

    const result = ensureHarnessAdapters(root, generateWorkflowSkillContent(VERSION));

    const lingma = result.adapters.find((a) => a.id === "lingma-rules");
    expect(lingma?.created).toBe(true);
    const text = fs.readFileSync(path.join(root, ".lingma/rules/mcp-probe-kit-mcp.md"), "utf8");
    expect(text).toContain("AGENTS.md");
    expect(text).toContain(CANONICAL_SKILL_REL_PATH);
  });

  test("AGENTS.md 引用路径不因 harness 变化", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, ".trae"), { recursive: true });
    fs.mkdirSync(path.join(root, ".lingma"), { recursive: true });

    ensureHarnessAdapters(root, generateWorkflowSkillContent(VERSION));

    const detection = detectHarnessContext(root);
    expect(detection.skillCanonical).toBe(".agents/skills/mcp-probe-kit/SKILL.md");
    expect(detection.adaptersToWrite).toHaveLength(2);
  });
});
