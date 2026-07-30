import { describe, expect, it } from "vitest";
import {
  getProtocolModeFromEnv,
  resolveProtocolEra,
  resolveProtocolFeatures,
} from "../protocol-capabilities.js";

describe("protocol capabilities", () => {
  it("按协商版本识别 Legacy 与 Modern", () => {
    expect(resolveProtocolEra("2025-11-25")).toBe("legacy");
    expect(resolveProtocolEra("2026-07-28")).toBe("modern");
  });

  it("input_required 取决于真实 elicitation 能力，不取决于时代标签", () => {
    expect(
      resolveProtocolFeatures({
        era: "modern",
        formElicitationSupported: false,
        progressEnabled: false,
        appsEnabled: false,
      }).inputRequired
    ).toBe(false);

    expect(
      resolveProtocolFeatures({
        era: "legacy",
        formElicitationSupported: true,
        progressEnabled: false,
        appsEnabled: false,
      }).inputRequired
    ).toBe(true);
  });

  it("Modern Tasks 未接 wire adapter 时必须报告 false", () => {
    const features = resolveProtocolFeatures({
      era: "modern",
      formElicitationSupported: true,
      progressEnabled: true,
      appsEnabled: true,
      modernTasksEnabled: false,
    });
    expect(features).toMatchObject({
      legacyTasks: false,
      modernTasks: false,
      inputRequired: true,
    });
  });

  it("拒绝无效 protocol mode", () => {
    expect(getProtocolModeFromEnv("legacy")).toBe("legacy");
    expect(() => getProtocolModeFromEnv("unknown")).toThrow(/auto\/legacy\/modern/);
  });
});
