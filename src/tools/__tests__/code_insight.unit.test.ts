import { describe, expect, test } from "vitest";
import { codeInsight } from "../code_insight.js";

describe("code_insight 单元测试", () => {
  test("mode 非法时返回错误", async () => {
    const result = await codeInsight({
      mode: "unknown-mode",
      query: "auth",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/不支持的 mode/i);
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
});
