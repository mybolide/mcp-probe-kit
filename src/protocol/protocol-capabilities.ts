export type ProtocolEra = "legacy" | "modern";
export type ProtocolMode = "auto" | "legacy" | "modern";

export interface ProtocolFeatureSet {
  era: ProtocolEra;
  inputRequired: boolean;
  legacyTasks: boolean;
  modernTasks: boolean;
  progress: boolean;
  resources: boolean;
  apps: boolean;
}

export interface ResolveProtocolFeaturesInput {
  era: ProtocolEra;
  formElicitationSupported: boolean;
  progressEnabled: boolean;
  resourcesEnabled?: boolean;
  appsEnabled: boolean;
  modernTasksEnabled?: boolean;
}

export function getProtocolModeFromEnv(
  raw: string | undefined = process.env.MCP_PROTOCOL_MODE
): ProtocolMode {
  const normalized = (raw ?? "auto").trim().toLowerCase();
  if (normalized === "auto" || normalized === "legacy" || normalized === "modern") {
    return normalized;
  }
  throw new Error(
    `不支持的 MCP_PROTOCOL_MODE: ${normalized}（可选 auto/legacy/modern）`
  );
}

export function resolveProtocolEra(protocolVersion: string | undefined): ProtocolEra {
  return protocolVersion?.startsWith("2026-") ? "modern" : "legacy";
}

export function resolveProtocolFeatures(
  input: ResolveProtocolFeaturesInput
): ProtocolFeatureSet {
  return {
    era: input.era,
    inputRequired: input.formElicitationSupported,
    legacyTasks: input.era === "legacy",
    modernTasks: input.era === "modern" && Boolean(input.modernTasksEnabled),
    progress: input.progressEnabled,
    resources: input.resourcesEnabled ?? true,
    apps: input.appsEnabled,
  };
}
