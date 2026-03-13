import { describe, expect, test } from "vitest";
import { gencommit } from "../gencommit.js";

describe("gencommit 单元测试", () => {
  test("提供变更内容时返回指导文档而不是最终 commit 草稿", async () => {
    const result = await gencommit({
      changes: "修复登录时 token 为空导致的报错\nsrc/auth/login.ts\nsrc/auth/session.ts",
    });

    expect(result.isError).toBe(false);
    expect("structuredContent" in result).toBe(true);

    const structured = (result as any).structuredContent;
    expect(structured.mode).toBe("guidance");
    expect(structured.status).toBe("ready");
    expect(structured.hasChanges).toBe(true);
    expect(structured.steps[2]).toMatch(/不要再调用 gencommit/);
    expect(structured.nextAction).toMatch(/最终 commit message/);
    expect(result.content[0].text).toMatch(/本工具返回的是说明文档/);
    expect((result as any)._meta?.note).toMatch(/固定提交规范说明/);
  });

  test("缺少变更内容时返回非空补充指引", async () => {
    const result = await gencommit({});

    expect(result.isError).toBe(false);
    expect("structuredContent" in result).toBe(true);

    const structured = (result as any).structuredContent;
    expect(structured.mode).toBe("guidance");
    expect(structured.status).toBe("needs_changes");
    expect(structured.hasChanges).toBe(false);
    expect(structured.nextAction).toMatch(/先补充变更内容/);
    expect(result.content[0].text).toMatch(/git diff|git diff --staged/);
  });

  test("结构化输出包含规则、类型列表和模板", async () => {
    const result = await gencommit({
      changes: "更新 README 中关于 code_insight 的使用说明",
    });

    const structured = (result as any).structuredContent;
    expect(Array.isArray(structured.rules)).toBe(true);
    expect(structured.rules).toContain("不要再次调用 gencommit");
    expect(Array.isArray(structured.allowedTypes)).toBe(true);
    expect(structured.allowedTypes.some((item: any) => item.type === "feat")).toBe(true);
    expect(structured.outputTemplate).toMatch(/<type>: <emoji> <subject>/);
  });
});
