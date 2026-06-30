import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildFileStatusEntries } from "../file-delivery.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("buildFileStatusEntries", () => {
  test("marks MCP-created files as written", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "file-delivery-"));
    tempDirs.push(projectRoot);

    const result = buildFileStatusEntries(
      projectRoot,
      [{ path: "docs/guide.md", purpose: "User guide" }],
      [{ path: "docs/guide.md", action: "created" }],
      []
    );

    expect(result).toEqual([
      {
        path: "docs/guide.md",
        purpose: "User guide",
        exists: false,
        written: true,
        agent_action_required: false,
      },
    ]);
  });

  test("treats pre-existing on-disk files as written when not pending", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "file-delivery-"));
    tempDirs.push(projectRoot);
    const relPath = "docs/existing.md";
    fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, relPath), "# existing", "utf8");

    const result = buildFileStatusEntries(projectRoot, [{ path: relPath }], [], []);

    expect(result).toEqual([
      {
        path: relPath,
        exists: true,
        written: true,
        agent_action_required: false,
      },
    ]);
  });

  test("pending files require agent action and are not written", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "file-delivery-"));
    tempDirs.push(projectRoot);
    const relPath = "docs/pending.md";
    fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, relPath), "stub", "utf8");

    const result = buildFileStatusEntries(
      projectRoot,
      [{ path: relPath }],
      [{ path: relPath, action: "skipped" }],
      [{ path: relPath, reason: "Agent must fill template" }]
    );

    expect(result).toEqual([
      {
        path: relPath,
        exists: true,
        written: false,
        agent_action_required: true,
      },
    ]);
  });
});
