import { describe, expect, test } from "vitest";
import { UiAppResourceStore } from "../ui-app-resource-store.js";

describe("UiAppResourceStore", () => {
  test("禁用时不生成资源或修改结果", () => {
    const store = new UiAppResourceStore(false);
    const result = { structuredContent: { ok: true } };

    expect(store.decorate("start_ui", {}, result)).toBe(result);
    expect(store.list()).toEqual([]);
  });

  test("启用时为 UI 工具生成可读取资源", () => {
    const store = new UiAppResourceStore(true);
    const result = store.decorate(
      "start_ui",
      { description: "创建登录页" },
      { structuredContent: { summary: "UI plan" } }
    );
    const resourceUri = (result._meta?.ui as Record<string, unknown>)?.resourceUri;

    expect(typeof resourceUri).toBe("string");
    expect(store.list()).toHaveLength(1);
    const content = store.read(String(resourceUri));
    expect(content?.mimeType).toBe("text/html");
    expect(content?.text).toContain("start_ui");
  });
});
