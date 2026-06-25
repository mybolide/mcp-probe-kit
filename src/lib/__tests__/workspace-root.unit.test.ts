import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  resolveFromWorkspaceFolderPathsEnv,
  resolveWorkspaceRoot,
} from "../workspace-root.js";

const original = process.env.WORKSPACE_FOLDER_PATHS;
const tempDirs: string[] = [];

afterEach(() => {
  if (original === undefined) {
    delete process.env.WORKSPACE_FOLDER_PATHS;
  } else {
    process.env.WORKSPACE_FOLDER_PATHS = original;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("workspace-root WORKSPACE_FOLDER_PATHS", () => {
  test("解析 JSON 数组形式", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, "package.json"), "{}", "utf8");
    process.env.WORKSPACE_FOLDER_PATHS = JSON.stringify([root]);

    expect(resolveFromWorkspaceFolderPathsEnv()).toBe(path.resolve(root));
    expect(resolveWorkspaceRoot("")).toBe(path.resolve(root));
  });
});
