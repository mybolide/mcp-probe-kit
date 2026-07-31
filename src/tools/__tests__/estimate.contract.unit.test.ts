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
    expect(structured.boundaries.join(" ")).toContain("不声称");
  });
});
