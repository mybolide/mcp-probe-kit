import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createProbeServer } from "../create-server.js";

const previousEnv = {
  ui: process.env.MCP_ENABLE_UI_APPS,
  trace: process.env.MCP_TRACE_META_KEY,
  graph: process.env.MCP_GRAPH_SNAPSHOT_DIR,
};
const tempDirs: string[] = [];

afterEach(() => {
  restore("MCP_ENABLE_UI_APPS", previousEnv.ui);
  restore("MCP_TRACE_META_KEY", previousEnv.trace);
  restore("MCP_GRAPH_SNAPSHOT_DIR", previousEnv.graph);
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("createProbeServer", () => {
  test("创建已配置 Tool/Resource Runtime 的 Server", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-server-"));
    tempDirs.push(root);
    process.env.MCP_ENABLE_UI_APPS = "true";
    process.env.MCP_TRACE_META_KEY = "trace-id";
    process.env.MCP_GRAPH_SNAPSHOT_DIR = root;

    const runtime = createProbeServer();

    expect(runtime.server).toBeDefined();
    expect(runtime.decorator.traceMetaKey).toBe("trace-id");
    expect(runtime.decorator.uiStore.enabled).toBe(true);
    expect(runtime.decorator.graphStore.snapshotDir).toBe(root);
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
