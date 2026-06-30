import * as fs from "node:fs";
import * as path from "node:path";
import { MCP_PROBE_SKILL_REL_PATH } from "./workflow-skill-template.js";

/** Canonical Skill path — never changes per harness */
export const CANONICAL_SKILL_REL_PATH = MCP_PROBE_SKILL_REL_PATH;

export type HarnessId =
  | "agents"
  | "cursor"
  | "claude"
  | "codex"
  | "opencode"
  | "trae"
  | "traecli"
  | "codebuddy"
  | "lingma"
  | "comate";

export type HarnessAdapterKind = "skill-mirror" | "rules-pointer" | "claude-pointer";

export interface HarnessAdapterTarget {
  id: string;
  harnessId: HarnessId;
  relPath: string;
  kind: HarnessAdapterKind;
  /** 项目内已有该目录时才写适配层（零配置） */
  markerDir: string;
}

export interface HarnessDetectionResult {
  markerHarnesses: HarnessId[];
  detected: HarnessId[];
  skillCanonical: string;
  adaptersToWrite: HarnessAdapterTarget[];
}

export const HARNESS_ADAPTER_TARGETS: HarnessAdapterTarget[] = [
  {
    id: "trae-skill",
    harnessId: "trae",
    relPath: ".trae/skills/mcp-probe-kit/SKILL.md",
    kind: "skill-mirror",
    markerDir: ".trae",
  },
  {
    id: "traecli-skill",
    harnessId: "traecli",
    relPath: ".traecli/skills/mcp-probe-kit/SKILL.md",
    kind: "skill-mirror",
    markerDir: ".traecli",
  },
  {
    id: "codebuddy-skill",
    harnessId: "codebuddy",
    relPath: ".codebuddy/skills/mcp-probe-kit/SKILL.md",
    kind: "skill-mirror",
    markerDir: ".codebuddy",
  },
  {
    id: "lingma-rules",
    harnessId: "lingma",
    relPath: ".lingma/rules/mcp-probe-kit-mcp.md",
    kind: "rules-pointer",
    markerDir: ".lingma",
  },
  {
    id: "comate-rules",
    harnessId: "comate",
    relPath: ".comate/rules/mcp-probe-kit-mcp.mdr",
    kind: "rules-pointer",
    markerDir: ".comate",
  },
  {
    id: "claude-pointer",
    harnessId: "claude",
    relPath: "CLAUDE.md",
    kind: "claude-pointer",
    markerDir: ".claude",
  },
];

const MARKER_DIR_TO_HARNESS: Record<string, HarnessId> = {
  ".trae": "trae",
  ".traecli": "traecli",
  ".codebuddy": "codebuddy",
  ".lingma": "lingma",
  ".comate": "comate",
  ".cursor": "cursor",
  ".claude": "claude",
  ".codex": "codex",
  ".opencode": "opencode",
};

function detectMarkerHarnesses(projectRoot: string): HarnessId[] {
  const found: HarnessId[] = [];
  for (const [markerDir, harnessId] of Object.entries(MARKER_DIR_TO_HARNESS)) {
    if (fs.existsSync(path.join(projectRoot, markerDir))) {
      found.push(harnessId);
    }
  }
  return found;
}

function shouldWriteAdapter(projectRoot: string, adapter: HarnessAdapterTarget): boolean {
  return fs.existsSync(path.join(projectRoot, adapter.markerDir));
}

/**
 * 零配置 harness 检测：项目里已有工具目录（如 `.trae/`）则写对应薄适配。
 * AGENTS.md 与 canonical Skill 路径始终不变。
 */
export function detectHarnessContext(projectRoot: string): HarnessDetectionResult {
  const root = path.resolve(projectRoot);
  const markerHarnesses = detectMarkerHarnesses(root);
  const detected = markerHarnesses.length > 0 ? markerHarnesses : (["agents"] as HarnessId[]);
  const adaptersToWrite = HARNESS_ADAPTER_TARGETS.filter((adapter) =>
    shouldWriteAdapter(root, adapter)
  );

  return {
    markerHarnesses,
    detected,
    skillCanonical: CANONICAL_SKILL_REL_PATH,
    adaptersToWrite,
  };
}

export interface LayoutHarnessManifest {
  detected: HarnessId[];
  skillCanonical: string;
  adapters: Array<{ id: string; kind: HarnessAdapterKind; path: string }>;
}

export function toLayoutHarnessManifest(
  detection: HarnessDetectionResult,
  writtenAdapters: Array<{ id: string; kind: HarnessAdapterKind; path: string }>
): LayoutHarnessManifest {
  return {
    detected: detection.detected,
    skillCanonical: detection.skillCanonical,
    adapters: writtenAdapters,
  };
}
