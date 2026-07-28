import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-parent-child-smoke-"));
const featureRoot = path.join(projectRoot, "docs", "specs", "commerce-v2");

function write(relativePath, content) {
  const target = path.join(featureRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function structured(result) {
  return result.structuredContent ?? {};
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const transport = new StdioClientTransport({
  command: "node",
  args: [path.join(root, "build", "index.js")],
  cwd: root,
  env: { ...process.env, MCP_ENABLE_GITNEXUS_BRIDGE: "1" },
  stderr: "pipe",
});
const client = new Client({ name: "parent-child-smoke", version: "1.0.0" });

try {
  await client.connect(transport, { timeout: 15_000 });
  const subspecs = [{ id: "01-foundation", title: "数据底座", fr: ["FR-1"] }];
  const addResult = await client.callTool({
    name: "add_feature",
    arguments: {
      feature_name: "commerce-v2",
      description: "v2 兼容升级",
      spec_layout: "parent-child",
      subspecs,
    },
  }, undefined, { timeout: 15_000 });
  assert(structured(addResult).specLayout === "parent-child", "add_feature 未返回 parent-child 布局");
  assert(structured(addResult).pendingFiles?.length === 7, "add_feature pendingFiles 数量不正确");

  const startedAt = Date.now();
  const startResult = await client.callTool({
    name: "start_feature",
    arguments: {
      feature_name: "commerce-v2",
      description: "v2 兼容升级",
      project_root: root,
      spec_layout: "parent-child",
      subspecs,
    },
  }, undefined, { timeout: 15_000 });
  assert(!startResult.isError, "start_feature 返回错误");
  assert(Date.now() - startedAt < 15_000, "start_feature 超过客户端预算");

  write("README.md", "# 母规格\n## 原则\n保持兼容。\n## 子规格索引\n- 01-foundation\n## 依赖关系\n无。\n## 里程碑\n先完成底座。");
  write("requirements.md", "# 需求\n## 功能概述\n升级。\n## 需求列表\n### FR-1\n## 非功能需求\n兼容。\n## 依赖关系\n无。");
  write("design.md", "# 设计\n## 概述\nFR-1\n## 技术方案\n增量升级。\n## 文件结构\nsrc/");
  write("tasks.md", "# 任务\n## 交付物清单\n规格。\n## 任务列表\n子规格维护。\n## 需求覆盖矩阵\nFR-1\n## 文件变更清单\nsrc/example.ts\n## 子规格任务覆盖矩阵\n- 01-foundation/1.1");
  write("spec-manifest.json", JSON.stringify({ layout: "parent-child", subspecs }, null, 2));
  write("subspecs/01-foundation/spec.md", "# 子规格\n## 范围\n数据底座。\n## 需求回链\nFR-1\nWHEN 请求 THEN 系统 SHALL 执行。\n## 涉及文件\n- src/example.ts\n## 不做项\n- 不做导出");
  write("subspecs/01-foundation/tasks.md", "# 子任务\n- [ ] 1.1 实现底座\n  - 证据块: src/example.ts:1\n  - _需求: FR-1_");

  const validResult = await client.callTool({
    name: "check_spec",
    arguments: { feature_name: "commerce-v2", project_root: projectRoot },
  }, undefined, { timeout: 15_000 });
  assert(structured(validResult).passed === true, "有效 parent-child 规格未通过 check_spec");

  write("tasks.md", fs.readFileSync(path.join(featureRoot, "tasks.md"), "utf8").replace("01-foundation/1.1", ""));
  const invalidResult = await client.callTool({
    name: "check_spec",
    arguments: { feature_name: "commerce-v2", project_root: projectRoot },
  }, undefined, { timeout: 15_000 });
  assert(structured(invalidResult).issues?.some((issue) => issue.code === "unreferenced_subspec_task"), "断链任务未被 check_spec 拦截");

  console.log("parent-child MCP smoke passed");
} finally {
  await client.close().catch(() => undefined);
  fs.rmSync(projectRoot, { recursive: true, force: true });
}
