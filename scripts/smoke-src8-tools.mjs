/**
 * SRC-8 工具冒烟测试：直接调用 fix_bug / start_bugfix，验证 Agent 可用性
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { fixBug } = await import(pathToFileURL(path.join(root, "build/tools/fix_bug.js")).href);
const { startBugfix } = await import(pathToFileURL(path.join(root, "build/tools/start_bugfix.js")).href);

const failures = [];

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function textOf(result) {
  return String(result?.content?.[0]?.text ?? "");
}

console.log("=== SRC-8 smoke test (local build) ===\n");

// 1) fix_bug + inline code（旧问题：不消费 code）
const sampleCode = "export function divide(a, b) { return a / b; }\n";
const r1 = await fixBug({
  error_message: "divide(1,0) 返回 Infinity 而非抛错",
  code_context: sampleCode,
  expected_behavior: "除零应抛错",
  actual_behavior: "返回 Infinity",
  success_sample: "divide(1,2) 返回 0.5",
  verification_target: "divide(0,x) 单测通过",
  analysis_mode: "src8",
});

assert(!r1.isError, "fix_bug with code should not error");
const s1 = r1.structuredContent;
assert(s1?.methodology === "src8", "methodology should be src8");
assert(s1?.rootCauseWorksheet?.substeps?.length === 5, "rootCauseWorksheet 5 substeps");
assert(s1?.src8Checklist?.length === 8, "src8Checklist 8 steps");
assert(s1?.bugfixInput?.received === true, "bugfixInput.received");
assert(s1?.bugfixInput?.code_context?.includes("divide"), "code injected in structuredContent");
assert(!s1?.rootCause, "must NOT fake rootCause at top level");
assert(!s1?.rootCauseAnalysis, "MCP must NOT pre-fill rootCauseAnalysis");
const t1 = textOf(r1);
assert(t1.includes("divide"), "code in prompt text");
assert(t1.includes("rootCauseAnalysis") || t1.includes("真因工作表"), "Step 4 worksheet in prompt");
assert(t1.includes("metadata.plan") || t1.includes("src8-1"), "delegated plan in prompt");
assert(!t1.includes("docs/src8-methodology"), "no repo-only docs link in agent prompt");
assert(t1.includes("Infinity"), "error/behavior in prompt");
console.log("✓ fix_bug + code_context");

// 2) fix_bug + file_path
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "src8-smoke-"));
const fp = path.join(dir, "auth.ts");
fs.writeFileSync(fp, "if (!token) throw new Error('missing token');\n", "utf-8");
try {
  const r2 = await fixBug({
    error_message: "登录后 token 为 undefined",
    file_path: fp,
    project_root: dir,
  });
  assert(!r2.isError, "fix_bug file_path should not error");
  assert(r2.structuredContent?.bugfixInput?.code_context?.includes("missing token"), "file read into bugfixInput");
  assert(textOf(r2).includes("missing token"), "file content in prompt");
  console.log("✓ fix_bug + file_path");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3) fix_bug 仅 error_message（应给指南 + 明确缺口，不假装分析完）
const r3 = await fixBug({ error_message: "页面白屏" });
assert(!r3.isError, "fix_bug minimal input ok");
assert(r3.structuredContent?.bugfixInput?.received === true, "has error_message");
assert(r3.structuredContent?.rootCauseWorksheet?.template?.evidenceGaps?.length > 0, "no success_sample → evidenceGaps hint");
assert(!r3.structuredContent?.rootCause, "no fake rootCause");
console.log("✓ fix_bug minimal input (guidance, no fake RCA)");

// 4) gentest/refactor 快速抽检（guidance + input）
const { gentest } = await import(pathToFileURL(path.join(root, "build/tools/gentest.js")).href);
const { refactor } = await import(pathToFileURL(path.join(root, "build/tools/refactor.js")).href);
const r4 = await gentest({ code: "export const add = (a,b)=>a+b", framework: "vitest" });
assert(r4.structuredContent?.mode === "guidance", "gentest guidance mode");
assert(r4.structuredContent?.gentestInput?.code?.includes("add"), "gentest consumes code");
const r5 = await refactor({ code: "function f(){return 1}", goal: "simplify" });
assert(r5.structuredContent?.refactorInput?.received === true, "refactor consumes code");
console.log("✓ gentest + refactor input injection");

// 5) start_bugfix 编排
const r6 = await startBugfix({
  error_message: "TypeError: Cannot read property 'x' of undefined",
  stack_trace: "at src/app.ts:10",
  analysis_mode: "src8",
});
assert(!r6.isError, "start_bugfix ok");
assert(r6.structuredContent?.analysisMode === "src8", "start_bugfix analysisMode src8");
const plan = r6.structuredContent?.metadata?.plan;
const src8Step = plan?.steps?.find((s) => s.id === "src8-4");
assert(src8Step?.action?.includes("把握真因") || src8Step?.action?.includes("真因"), "plan has src8-4 root cause action");
assert(plan?.steps?.some((s) => s.id === "src8-7" && s.tool === "gentest"), "plan has gentest at src8-7");
assert(textOf(r6).match(/SRC-8|rootCauseWorksheet|真因工作表/), "start_bugfix prompt mentions SRC-8");
console.log("✓ start_bugfix orchestration");

console.log("\n=== Summary ===");
if (failures.length) {
  console.error("FAILED:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("All smoke checks passed.");
