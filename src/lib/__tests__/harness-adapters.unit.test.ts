import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ensureHarnessAdapters } from "../harness-adapters.js";
import {
  patchLayoutManifestHarness,
  readLayoutManifest,
  resolveProjectContextLayout,
  writeLayoutManifest,
} from "../project-context-layout.js";
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

describe("harness-adapters", () => {
  test("规则指针使用自定义 indexPath", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-adapter-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, ".lingma"), { recursive: true });

    const customIndex = "docs/project-context.md";
    ensureHarnessAdapters(root, generateWorkflowSkillContent(VERSION), customIndex);

    const text = fs.readFileSync(path.join(root, ".lingma/rules/mcp-probe-kit-mcp.md"), "utf8");
    expect(text).toContain(customIndex);
    expect(text).not.toContain("阅读项目根 `AGENTS.md`");
  });

  test("第二次 bootstrap 仍记录已存在的 adapters", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-adapter-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, ".trae"), { recursive: true });
    const skill = generateWorkflowSkillContent(VERSION);

    const first = ensureHarnessAdapters(root, skill);
    expect(first.layoutHarness.adapters).toHaveLength(1);

    const second = ensureHarnessAdapters(root, skill);
    expect(second.adapters[0]?.skipped).toBe(true);
    expect(second.layoutHarness.adapters).toEqual(first.layoutHarness.adapters);
  });

  test("patchLayoutManifestHarness 保留 generatedAt 且无变化时不写盘", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-adapter-"));
    tempDirs.push(root);
    const layout = resolveProjectContextLayout(root, {});
    writeLayoutManifest(root, layout, {
      detected: ["agents"],
      skillCanonical: ".agents/skills/mcp-probe-kit/SKILL.md",
      adapters: [],
    });
    const manifestPath = path.join(root, "docs", ".mcp-probe", "layout.json");
    const before = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const generatedAt = before.generatedAt;
    const generatedBy = before.generatedBy;

    const noop = patchLayoutManifestHarness(root, before.harness);
    expect(noop).toBeNull();
    const afterNoop = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(afterNoop.generatedAt).toBe(generatedAt);

    fs.mkdirSync(path.join(root, ".trae"), { recursive: true });
    const harnessResult = ensureHarnessAdapters(root, generateWorkflowSkillContent(VERSION));
    const patched = patchLayoutManifestHarness(root, harnessResult.layoutHarness);
    expect(patched).not.toBeNull();

    const afterPatch = readLayoutManifest(root);
    expect(afterPatch?.generatedAt).toBe(generatedAt);
    expect(afterPatch?.generatedBy).toBe(generatedBy);
    expect(afterPatch?.harness?.adapters).toHaveLength(1);

    const patchedAgain = patchLayoutManifestHarness(root, harnessResult.layoutHarness);
    expect(patchedAgain).toBeNull();
  });
});
