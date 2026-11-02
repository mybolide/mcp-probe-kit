import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { boardHtml } from "../board-html.js";
import { workbenchJS } from "../workbench/generated.js";

function browserScript(html: string): string {
  const match = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw Error("Missing inline browser script");
  return match[1];
}

describe("DevControl board browser script", () => {
  for (const embedded of [false, true]) {
    it(`is parseable JavaScript in ${embedded ? "embedded" : "standalone"} mode`, () => {
      const html = boardHtml("test-nonce", embedded);
      expect(() => new vm.Script(browserScript(html), {
        filename: "generated-devcontrol-board.js",
      })).not.toThrow();
    });
  }

  it("keeps trace evidence line separators escaped inside the generated script", () => {
    const script = browserScript(boardHtml("nonce", true));
    expect(script).toContain('refs.join("\\n")');
    expect(script).toContain('.join("\\n") || "无"');
    expect(script).toContain('fetch("/api/board"');
  });

  it("excludes proposed feature work and historical tasks from frozen release progress", () => {
    const source = readFileSync(new URL("../workbench/tasks.js", import.meta.url), "utf8");
    const start = source.indexOf("  function taskBucket(row){");
    const end = source.indexOf("  function displayTaskTitle(", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const approved = Array.from({ length: 409 }, (_, i) => ({ id: `F2-${i}` }));
    const rows = [
      ...approved.map((item, i) => ({
        item, status: i === 0 ? "pending" : i < 272 ? "verified" : "ready",
        pending: i === 0,
        current: { status: i < 272 ? "verified" : "ready" },
      })),
      ...Array.from({ length: 15 }, (_, i) => ({
        item: { id: `PROPOSAL-${i}` }, status: "pending", pending: true,
      })),
      ...["F0", "F1"].map(id => ({
        item: { id }, status: "verified", pending: false,
        current: { status: "verified" },
      })),
    ];
    const factory = vm.runInNewContext(
      `(function(taskRows,releaseWorkPlan){${source.slice(start, end)}\nreturn {currentReleaseRows,currentReleaseProgressRows};})`,
    ) as (taskRows: () => typeof rows, releaseWorkPlan: unknown) => {
      currentReleaseRows: () => typeof rows;
      currentReleaseProgressRows: () => typeof rows;
    };
    const release = { status: "frozen", frozen: { plan: { workItems: approved } } };
    const { currentReleaseRows, currentReleaseProgressRows } = factory(() => rows, release);
    expect(currentReleaseRows()).toHaveLength(424);
    const progress = currentReleaseProgressRows();
    expect(progress).toHaveLength(409);
    expect(progress.filter(row => row.status === "verified")).toHaveLength(272);
    expect(progress.some(row => row.item.id === "F0" || row.item.id === "F1")).toBe(false);
    expect(workbenchJS).toContain("function renderTaskProgress(){");
  });
});
