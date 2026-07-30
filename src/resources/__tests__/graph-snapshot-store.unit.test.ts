import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { GraphSnapshotStore } from "../graph-snapshot-store.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("GraphSnapshotStore", () => {
  test("记录 code_insight 快照、Handles 与资源索引", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graph-store-"));
    tempDirs.push(root);
    const store = new GraphSnapshotStore(root);

    const result = store.decorate("code_insight", {
      structuredContent: {
        status: "ok",
        summary: "impact complete",
        executions: [{ text: "details" }],
      },
    });
    const graphMeta = result._meta?.graph as Record<string, unknown>;
    const snapshotUri = String(graphMeta.snapshotUri);

    expect(snapshotUri).toMatch(/^probe:\/\/graph\//);
    expect(
      (result.structuredContent as Record<string, unknown>).handles
    ).toMatchObject({ graph_snapshot: snapshotUri, graph_resource: snapshotUri });
    expect(store.status().count).toBe(1);
    expect(store.read("probe://graph/latest")?.text).toContain("impact complete");
    expect(store.read("probe://graph/history")?.text).toContain(snapshotUri);
    expect(store.read("probe://graph/files")?.text).toContain(".json");
    expect(store.read(snapshotUri)?.text).toContain("impact complete");

    const jsonPath = String(graphMeta.jsonFilePath);
    const persisted = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(persisted.summary).toBe("impact complete");
    expect(persisted.files).toBeUndefined();
  });

  test("无快照时 latest 返回明确 empty 状态", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "graph-store-"));
    tempDirs.push(root);
    const store = new GraphSnapshotStore(root);

    expect(store.read("probe://graph/latest")?.text).toContain('"status": "empty"');
    expect(store.read("probe://graph/latest.md")?.text).toContain("暂无图谱快照");
  });
});
