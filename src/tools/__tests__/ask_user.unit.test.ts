import { describe, expect, test } from "vitest";
import { askUser } from "../ask_user.js";

describe("ask_user input contract", () => {
  test("accepts schema-declared questions[].question", async () => {
    const result = await askUser({
      questions: [{ question: "复现步骤是什么？", required: true }],
    });

    expect(result.isError).toBeFalsy();
    expect(String(result.content[0].text)).toContain("复现步骤是什么？");
    expect((result as any).structuredContent.questions[0].question).toBe("复现步骤是什么？");
  });

  test("rejects question objects without a non-empty question instead of rendering undefined", async () => {
    const result = await askUser({
      questions: [{ prompt: "复现步骤是什么？" }],
    });

    expect(result.isError).toBe(true);
    expect(String(result.content[0].text)).toContain("questions[0].question");
    expect(String(result.content[0].text)).not.toContain("undefined");
  });

  test("rejects explicitly blank top-level question", async () => {
    const result = await askUser({ question: "   " });

    expect(result.isError).toBe(true);
    expect(String(result.content[0].text)).toContain("question 必须是非空字符串");
  });

  test("multi-question required defaults to optional unless explicitly true", async () => {
    const result = await askUser({
      questions: [
        { question: "可选问题" },
        { question: "必答问题", required: true },
      ],
    });

    expect(result.isError).toBeFalsy();
    const text = String(result.content[0].text);
    expect(text).toContain("可选问题 _[可选]_");
    expect(text).toContain("必答问题 **[必答]**");
    expect((result as any).structuredContent.questions).toEqual([
      expect.objectContaining({ question: "可选问题", required: false }),
      expect.objectContaining({ question: "必答问题", required: true }),
    ]);
  });
});
