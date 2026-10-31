import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ensureDatabaseIgnored, resolveProjectDatabase } from "../project-storage.js";

const roots: string[] = [];
function repo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-project-storage-"));
  roots.push(root);
  execFileSync("git", ["init", "-q", root], { timeout: 5_000 });
  return root;
}
function gitExclude(root: string): string {
  const output = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], {
    cwd: root, encoding: "utf8", timeout: 5_000,
  }).trim();
  return path.isAbsolute(output) ? output : path.resolve(root, output);
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("DevControl's Git-local SQLite exclusion", () => {
  it("keeps SQLite WAL and SHM local and idempotently excluded", () => {
    const root = repo();
    const database = resolveProjectDatabase(root);
    fs.mkdirSync(path.dirname(database), { recursive: true });
    for (const candidate of [database, database + "-wal", database + "-shm"]) {
      fs.writeFileSync(candidate, "private local state, never staged");
    }
    ensureDatabaseIgnored(root, database);
    ensureDatabaseIgnored(root, database);
    const lines = fs.readFileSync(gitExclude(root), "utf8").split(/\r?\n/);
    expect(lines.filter((line) => line === "/.mcp-probe-kit/state/")).toHaveLength(1);
    expect(execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: root, encoding: "utf8",
    })).toBe("");
  });

  it("finds the Git worktree's real info/exclude path, not a presumed .git folder", () => {
    const root = repo();
    fs.writeFileSync(path.join(root, "README.md"), "baseline");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c",
      "user.email=test@example.invalid", "commit", "-qm", "baseline"], { cwd: root });
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-project-worktree-"));
    fs.rmSync(tree, { recursive: true });
    roots.push(tree);
    execFileSync("git", ["worktree", "add", "-q", "-b", "test-worktree", tree],
      { cwd: root, timeout: 7_000 });
    ensureDatabaseIgnored(tree, resolveProjectDatabase(tree));
    expect(fs.readFileSync(gitExclude(tree), "utf8"))
      .toContain("/.mcp-probe-kit/state/");
    expect(fs.statSync(path.join(tree, ".git")).isFile()).toBe(true);
  });

  it("fails closed for external DB paths or when Git is missing", () => {
    const root = repo();
    expect(() => ensureDatabaseIgnored(root, path.join(os.tmpdir(), "foreign.sqlite3")))
      .toThrow("within its own project");
    const original = process.env.PATH;
    try {
      process.env.PATH = path.join(root, "no-such-binaries");
      expect(() => ensureDatabaseIgnored(root, resolveProjectDatabase(root)))
        .toThrow(/Cannot configure project-local Git exclude/);
    } finally {
      process.env.PATH = original;
    }
  });

  it.skipIf(process.platform === "win32")(
    "tolerates a real Git command exceeding the former two-second deadline", () => {
      const root = repo();
      const bin = path.join(root, "slow-git");
      fs.mkdirSync(bin);
      const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
      const wrapper = path.join(bin, "git");
      fs.writeFileSync(wrapper, "#!/bin/sh\nsleep 3\nexec " +
        JSON.stringify(realGit) + " \"$@\"\n", { mode: 0o755 });
      const oldPath = process.env.PATH;
      try {
        process.env.PATH = bin + path.delimiter + oldPath;
        ensureDatabaseIgnored(root, resolveProjectDatabase(root));
      } finally {
        process.env.PATH = oldPath;
      }
      expect(fs.readFileSync(gitExclude(root), "utf8"))
        .toContain("/.mcp-probe-kit/state/");
    },
  );
});
