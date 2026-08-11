import { describe, expect, test } from "vitest";
import {
  buildCodeInsightDelegatedPlan,
  codeInsight,
  deriveCodeInsightStatus,
  resolveCodeInsightQuery,
} from "../code_insight.js";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

describe("code_insight 单元测试", () => {
  test("mode 非法时返回错误", async () => {
    const result = await codeInsight({
      mode: "unknown-mode",
      query: "auth",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/不支持的 mode/i);
  });

  test("GitNexus 降级时返回真实本地文件与符号证据，不伪造调用图", async () => {
    const previous = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "0";
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code-insight-local-fallback-"));
    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "test"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({
      name: "local-fallback-fixture",
      type: "module",
      scripts: { test: "node --test" },
    }), "utf8");
    fs.writeFileSync(
      path.join(projectRoot, "src", "calculator.js"),
      [
        "export function add(a, b) { return a + b; }",
        "export const divide = (a, b) => { if (b === 0) throw new Error('zero'); return a / b; };",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "src", "status.js"),
      "export function status() { return { ok: true }; }\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "test", "calculator.test.js"),
      "import test from 'node:test';\n",
      "utf8",
    );

    try {
      const result = await codeInsight({
        mode: "query",
        query: "calculator add divide status",
        project_root: projectRoot,
        include_tests: true,
      });
      expect(result.isError ?? false).toBe(false);
      const structured = (result as any).structuredContent;
      expect(structured.status).toBe("degraded");
      expect(structured.localFallback.available).toBe(true);
      expect(structured.localFallback.provider).toBe("local-source-evidence");
      expect(structured.localFallback.files.map((item: any) => item.path)).toEqual(
        expect.arrayContaining(["src/calculator.js", "src/status.js"]),
      );
      expect(structured.localFallback.symbols.map((item: any) => item.name)).toEqual(
        expect.arrayContaining(["add", "divide", "status"]),
      );
      expect(structured.localFallback.packageInfo.scripts.test).toBe("node --test");
      expect(structured.localFallback.capabilities).toMatchObject({
        fileInventory: true,
        symbolExtraction: true,
        callGraph: false,
        dependencyGraph: false,
        impactAnalysis: false,
      });
      const text = String(result.content[0].text);
      expect(text).toContain("本地源码证据回退");
      expect(text).toContain("src/calculator.js");
      expect(text).toContain("function add");
      expect(text).toContain("不提供调用图、依赖图或影响分析结论");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      if (previous === undefined) delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      else process.env.MCP_ENABLE_GITNEXUS_BRIDGE = previous;
    }
  });

  test("bridge 禁用时返回降级结果（非硬错误）", async () => {
    const prev = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "0";

    try {
      const result = await codeInsight({
        mode: "query",
        query: "authentication middleware",
      });

      expect(result.isError).toBe(false);
      expect("structuredContent" in result).toBe(true);
      const structured = (result as any).structuredContent;
      expect(structured.status).toBe("degraded");
      expect(structured.provider).toBe("gitnexus");
    } finally {
      if (prev === undefined) {
        delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      } else {
        process.env.MCP_ENABLE_GITNEXUS_BRIDGE = prev;
      }
    }
  });

  test("显式 project_root 为父 Git 仓库子目录时降级结果也不得扩到父仓库", async () => {
    const prev = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "0";
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code-insight-explicit-scope-"));
    fs.mkdirSync(path.join(repoRoot, ".git"));
    const scopedRoot = path.join(repoRoot, "apps", "payments");
    fs.mkdirSync(path.join(scopedRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "outside.ts"), "export const outside = true;\n", "utf8");
    fs.writeFileSync(path.join(scopedRoot, "src", "inside.ts"), "export const inside = true;\n", "utf8");

    try {
      const result = await codeInsight({
        mode: "query",
        query: "inside",
        project_root: scopedRoot,
        save_to_docs: false,
      });

      expect(result.isError).toBe(false);
      const structured = (result as any).structuredContent;
      expect(structured.sourceRoot).toBe(scopedRoot);
      expect(structured.analysisRoot).toBe(scopedRoot);
      expect(structured.localFallback?.files?.map((item: any) => item.path))
        .toContain("src/inside.ts");
      expect(structured.localFallback?.files?.map((item: any) => item.path))
        .not.toContain("outside.ts");
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      if (prev === undefined) delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      else process.env.MCP_ENABLE_GITNEXUS_BRIDGE = prev;
    }
  });

  test("当前目录为家目录时提示传入 project_root", async () => {
    const prev = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "1";

    try {
      const result = await codeInsight({
        mode: "query",
        query: "authentication middleware",
        project_root: os.homedir(),
      });

      expect(result.isError).toBe(false);
      expect("structuredContent" in result).toBe(true);
      const structured = (result as any).structuredContent;
      expect(structured.status).toBe("degraded");
      if (structured.warnings.includes("bridge_disabled")) {
        expect(structured.summary).toMatch(/bridge/i);
      } else {
        expect(structured.warnings).toContain("project_root_required");
        expect(structured.summary).toMatch(/project_root/i);
      }
    } finally {
      if (prev === undefined) {
        delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      } else {
        process.env.MCP_ENABLE_GITNEXUS_BRIDGE = prev;
      }
    }
  });

  test("auto 模式在缺少 query/target 时使用项目概览默认查询", () => {
    const resolved = resolveCodeInsightQuery({
      mode: "auto",
      query: "",
      target: "",
      input: "",
    });

    expect(resolved.finalTarget).toBe("");
    expect(resolved.finalQuery).toMatch(/核心流程/);
    expect(resolved.finalQuery).toMatch(/依赖关系/);
  });

  test("歧义结果会生成候选选择 delegated plan", () => {
    const status = deriveCodeInsightStatus({
      available: true,
      ambiguities: [
        {
          tool: "context",
          message: "找到多个 login 符号",
          candidates: [{ uid: "Method:auth.ts:login:12", file_path: "/repo/src/auth.ts" }],
        },
      ],
      executions: [{ tool: "context", ok: true, durationMs: 10, args: {}, status: "ambiguous" }],
    } as any);

    const plan = buildCodeInsightDelegatedPlan({
      status,
      ambiguities: [
        {
          tool: "context",
          message: "找到多个 login 符号",
          candidates: [{ uid: "Method:auth.ts:login:12", file_path: "/repo/src/auth.ts" }],
        },
      ],
      showPlan: true,
    });

    expect(status).toBe("ambiguous");
    expect(plan?.kind).toBe("ambiguity");
    expect(plan?.steps).toHaveLength(2);
    expect(plan?.steps[1].action).toMatch(/uid 或 file_path/);
  });

  test("未显式要求保存时不生成 docs delegated plan", async () => {
    const prev = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "0";

    try {
      const result = await codeInsight({
        mode: "auto",
      });

      expect(result.isError).toBe(false);
      const text = String((result as any).content?.[0]?.text || "");
      const structured = (result as any).structuredContent;
      expect(text).not.toMatch(/## delegated plan/);
      expect(text).toMatch(/使用场景指南/);
      expect(structured.plan).toBeUndefined();
      expect(structured.projectDocs).toBeUndefined();
    } finally {
      if (prev === undefined) {
        delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      } else {
        process.env.MCP_ENABLE_GITNEXUS_BRIDGE = prev;
      }
    }
  });

  test("save_to_docs 时返回 delegated plan，由 Agent 落盘图谱文件", async () => {
    const prev = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "0";
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code-insight-docs-"));

    try {
      const result = await codeInsight({
        mode: "auto",
        project_root: projectRoot,
      });

      expect(result.isError).toBe(false);
      const text = String((result as any).content?.[0]?.text || "");
      const structured = (result as any).structuredContent;
      expect(text).toMatch(/delegated plan/);
      expect(text).toMatch(/不要只口头总结而不写文件/);
      expect(text).toMatch(/docs\/graph-insights\/latest\.md/);
      expect(text).toMatch(/使用场景指南/);
      expect(structured.projectDocs.latestMarkdownFilePath).toMatch(/docs\/graph-insights\/latest\.md$/);
      expect(structured.projectDocs.archiveMarkdownFilePath).toContain("/docs/graph-insights/");
      expect(structured.plan.mode).toBe("delegated");
      expect(structured.plan.steps).toHaveLength(2);
      expect(structured.plan.steps[0].id).toBe("consume-result");
      expect(structured.plan.steps[1].id).toBe("optional-save");
      expect(structured.writtenFiles).toBeUndefined();
      expect(fs.existsSync(path.join(projectRoot, "docs", "graph-insights", "latest.md"))).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      if (prev === undefined) {
        delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      } else {
        process.env.MCP_ENABLE_GITNEXUS_BRIDGE = prev;
      }
    }
  });
});
