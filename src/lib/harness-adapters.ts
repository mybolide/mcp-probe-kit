import * as fs from "node:fs";
import * as path from "node:path";
import {
  CANONICAL_SKILL_REL_PATH,
  type HarnessAdapterKind,
  type HarnessAdapterTarget,
  type HarnessDetectionResult,
  detectHarnessContext,
  toLayoutHarnessManifest,
  type LayoutHarnessManifest,
} from "./harness-skill-targets.js";
import { getMcpProbeSkillVersion } from "./workflow-skill-version.js";

const RULES_POINTER_VERSION_KEY = "mcp-probe-kit-harness-adapter-version";
const CLAUDE_BLOCK_BEGIN =
  "<!-- mcp-probe:harness begin — auto-generated; do not edit -->";
const CLAUDE_BLOCK_END = "<!-- mcp-probe:harness end -->";

export interface HarnessAdapterWriteResult {
  id: string;
  path: string;
  kind: HarnessAdapterKind;
  created: boolean;
  updated: boolean;
  skipped: boolean;
}

export interface HarnessAdapterEnsureResult {
  detection: HarnessDetectionResult;
  adapters: HarnessAdapterWriteResult[];
  layoutHarness: LayoutHarnessManifest;
}

function generateRulesPointerContent(skillCanonical: string, version: string): string {
  return `# mcp-probe-kit MCP

> ${RULES_POINTER_VERSION_KEY}: ${version}

配置 **mcp-probe-kit** MCP 后，写代码 / 改文件前：

1. 阅读项目根 \`AGENTS.md\` 中 \`<!-- mcp-probe:context -->\` 块（MCP 触发规则）
2. 需要完整工具表时阅读 \`${skillCanonical}\`

**不要**跳过 MCP 直接改业务代码。拿不准先调 \`workflow\`。
`;
}

function generateComateRulesContent(skillCanonical: string, version: string): string {
  return `# mcp-probe-kit-mcp

> ${RULES_POINTER_VERSION_KEY}: ${version}

配置 mcp-probe-kit MCP 后，写代码前阅读 AGENTS.md 的 mcp-probe 块或 ${skillCanonical}。拿不准先调 workflow。
`;
}

function generateClaudePointerBlock(skillCanonical: string, agentsPath: string): string {
  return `${CLAUDE_BLOCK_BEGIN}
## MCP (mcp-probe-kit)

Before coding, read the \`mcp-probe:context\` block in \`${agentsPath}\` or Skill \`${skillCanonical}\`.
${CLAUDE_BLOCK_END}`;
}

function stripClaudeHarnessBlock(content: string): string {
  const beginIdx = content.indexOf(CLAUDE_BLOCK_BEGIN);
  if (beginIdx === -1) {
    return content.trim();
  }
  const endIdx = content.indexOf(CLAUDE_BLOCK_END);
  if (endIdx === -1) {
    return content.trim();
  }
  const before = content.slice(0, beginIdx).trimEnd();
  const after = content.slice(endIdx + CLAUDE_BLOCK_END.length).trimStart();
  return [before, after].filter(Boolean).join("\n\n").trim();
}

function mergeClaudePointer(existing: string | null, block: string): string {
  const userBody = existing ? stripClaudeHarnessBlock(existing) : "";
  if (!userBody) {
    return `${block}\n`;
  }
  return `${block}\n\n${userBody}\n`;
}

function adapterNeedsUpdate(
  existing: string | null,
  nextContent: string,
  kind: HarnessAdapterKind
): boolean {
  if (!existing?.trim()) {
    return true;
  }
  if (kind === "skill-mirror") {
    return existing !== nextContent;
  }
  const version = getMcpProbeSkillVersion();
  if (!existing.includes(RULES_POINTER_VERSION_KEY) || !existing.includes(version)) {
    return true;
  }
  if (kind === "claude-pointer") {
    return !existing.includes(CANONICAL_SKILL_REL_PATH);
  }
  return existing !== nextContent;
}

function resolveAdapterContent(
  adapter: HarnessAdapterTarget,
  skillContent: string,
  agentsIndexPath: string
): string {
  const version = getMcpProbeSkillVersion();
  switch (adapter.kind) {
    case "skill-mirror":
      return skillContent;
    case "rules-pointer":
      return adapter.relPath.endsWith(".mdr")
        ? generateComateRulesContent(CANONICAL_SKILL_REL_PATH, version)
        : generateRulesPointerContent(CANONICAL_SKILL_REL_PATH, version);
    case "claude-pointer":
      return mergeClaudePointer(
        null,
        generateClaudePointerBlock(CANONICAL_SKILL_REL_PATH, agentsIndexPath)
      );
    default:
      return skillContent;
  }
}

function writeAdapterFile(
  projectRoot: string,
  adapter: HarnessAdapterTarget,
  content: string
): HarnessAdapterWriteResult {
  const absolute = path.join(projectRoot, adapter.relPath);
  const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;

  if (adapter.kind === "claude-pointer" && existing) {
    const block = generateClaudePointerBlock(CANONICAL_SKILL_REL_PATH, "AGENTS.md");
    const merged = mergeClaudePointer(existing, block);
    if (!adapterNeedsUpdate(existing, merged, adapter.kind)) {
      return {
        id: adapter.id,
        path: adapter.relPath,
        kind: adapter.kind,
        created: false,
        updated: false,
        skipped: true,
      };
    }
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, merged, "utf8");
    return {
      id: adapter.id,
      path: adapter.relPath,
      kind: adapter.kind,
      created: false,
      updated: true,
      skipped: false,
    };
  }

  if (!adapterNeedsUpdate(existing, content, adapter.kind)) {
    return {
      id: adapter.id,
      path: adapter.relPath,
      kind: adapter.kind,
      created: false,
      updated: false,
      skipped: true,
    };
  }

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, "utf8");
  const hadContent = Boolean(existing?.trim());
  return {
    id: adapter.id,
    path: adapter.relPath,
    kind: adapter.kind,
    created: !hadContent,
    updated: hadContent,
    skipped: false,
  };
}

/**
 * Write optional harness adapters. AGENTS.md and canonical Skill are unchanged.
 * Canonical Skill must already exist at `.agents/skills/mcp-probe-kit/SKILL.md`.
 */
export function ensureHarnessAdapters(
  projectRoot: string,
  skillContent: string,
  agentsIndexPath = "AGENTS.md"
): HarnessAdapterEnsureResult {
  const root = path.resolve(projectRoot);
  const detection = detectHarnessContext(root);
  const adapters: HarnessAdapterWriteResult[] = [];

  for (const adapter of detection.adaptersToWrite) {
    const content = resolveAdapterContent(adapter, skillContent, agentsIndexPath);
    adapters.push(writeAdapterFile(root, adapter, content));
  }

  const written = adapters
    .filter((a) => !a.skipped)
    .map((a) => ({ id: a.id, kind: a.kind, path: a.path }));

  return {
    detection,
    adapters,
    layoutHarness: toLayoutHarnessManifest(detection, written),
  };
}
