import { describe, expect, test } from "vitest";
import { estimate } from "../estimate.js";

describe("estimate guidance contract", () => {
  test("returns symmetric text and structured guidance without claiming execution", async () => {
    const result = await estimate({
      task_description: "Add authentication and audit logs",
      team_size: 2,
      experience_level: "senior",
    });
    const text = (result.content ?? []).map((item: any) => item.text ?? "").join("\n");
    const structured = (result as any).structuredContent;

    expect(result.isError).toBe(false);
    expect(text).toContain("estimate");
    expect(structured.mode).toBe("guidance");
    expect(structured.input.teamSize).toBe(2);
    expect(structured.instructions.length).toBeGreaterThan(2);
    expect(structured.outputContract.storyPoints).toBe("number");
    expect(structured.outputContract.confidence).toBe("high|medium|low");
    expect(text).toContain('"storyPoints"');
    expect(text).toContain('"confidence"');
    expect(text).toContain('"timeEstimates"');
    expect(text).toContain('"task"');
    expect(text).toContain('"risk"');
    expect(text).toContain('"assumptions"');
    expect(text).not.toContain('"story_points"');
    expect(text).not.toContain('"split_suggestion"');
    expect(text).not.toContain('"activity"');
    expect(text).not.toContain("## 📊 输出模板");
    expect(text).toContain("分析检查清单（非输出结构）");
    expect(structured.boundaries.join(" ")).toContain("不声称");
  });

  test("rejects non-positive or fractional team_size", async () => {
    for (const team_size of [-1, 0, 1.5]) {
      const result = await estimate({
        task_description: "Estimate a small change",
        team_size,
      });
      expect(result.isError).toBe(true);
      expect(String(result.content[0].text)).toContain("team_size");
    }
  });

  test("rejects unsupported experience_level", async () => {
    const result = await estimate({
      task_description: "Estimate a small change",
      experience_level: "expert",
    });
    expect(result.isError).toBe(true);
    expect(String(result.content[0].text)).toContain("experience_level");
  });
});
