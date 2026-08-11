import { VERSION } from "../version.js";
import {
  compareSemver,
  formatAgentsContextVersionMarker,
  parseAgentsContextVersion,
} from "./workflow-skill-version.js";

const BLOCK_BEGIN = "<!-- mcp-probe:context begin — auto-generated; re-run init_project_context updates this block only -->";
const BLOCK_BEGIN_PREFIX = "<!-- mcp-probe:context begin";
const BLOCK_END = "<!-- mcp-probe:context end -->";
const GENERATED_HEADINGS = new Set([
  "## MCP（必须先调）",
  "## MCP (call first)",
]);

export type AgentsMdMergeMode =
  | "created"
  | "prepended"
  | "replaced-and-moved-to-top"
  | "skipped-empty";

export function wrapMcpProbeBlock(innerMarkdown: string, contextVersion: string = VERSION): string {
  const versionLine = formatAgentsContextVersionMarker(contextVersion);
  return `${BLOCK_BEGIN}\n${versionLine}\n${innerMarkdown.trim()}\n${BLOCK_END}`;
}

interface MarkedBlockRange {
  start: number;
  end: number;
  content: string;
  version: string | null;
}

function collectMarkedBlockRanges(content: string): MarkedBlockRange[] {
  const ranges: MarkedBlockRange[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const beginIdx = content.indexOf(BLOCK_BEGIN_PREFIX, cursor);
    if (beginIdx === -1) break;
    const markerEnd = content.indexOf("-->", beginIdx + BLOCK_BEGIN_PREFIX.length);
    if (markerEnd === -1) break;
    const nextBegin = content.indexOf(BLOCK_BEGIN_PREFIX, markerEnd + 3);
    const endIdx = content.indexOf(BLOCK_END, markerEnd + 3);
    if (endIdx === -1 || (nextBegin !== -1 && nextBegin < endIdx)) {
      cursor = nextBegin === -1 ? markerEnd + 3 : nextBegin;
      continue;
    }
    const end = endIdx + BLOCK_END.length;
    const block = content.slice(beginIdx, end);
    ranges.push({
      start: beginIdx,
      end,
      content: block,
      version: parseAgentsContextVersion(block),
    });
    cursor = end;
  }
  return ranges;
}

/**
 * Repair duplicate managed blocks without downgrading content produced by a newer kit.
 * The highest-version existing block is kept verbatim; all other managed blocks are removed.
 */
export function consolidateAgentsMdBlocksPreservingNewest(
  existingContent: string,
): { content: string; mergeMode: AgentsMdMergeMode; preservedVersion: string | null } {
  const blocks = collectMarkedBlockRanges(existingContent);
  if (blocks.length <= 1) {
    return {
      content: existingContent,
      mergeMode: "skipped-empty",
      preservedVersion: blocks[0]?.version ?? null,
    };
  }

  const newest = blocks.reduce((selected, current) => {
    if (!selected.version) return current.version ? current : selected;
    if (!current.version) return selected;
    return compareSemver(current.version, selected.version) > 0 ? current : selected;
  });
  const userBody = stripExistingBlocks(existingContent);
  const normalizedBlock = newest.content.trim();
  return {
    content: userBody ? `${normalizedBlock}\n\n${userBody}\n` : `${normalizedBlock}\n`,
    mergeMode: "replaced-and-moved-to-top",
    preservedVersion: newest.version,
  };
}

export interface AgentsMdBlockInspection {
  beginCount: number;
  endCount: number;
  unmanagedGeneratedSectionCount: number;
  validSingleBlock: boolean;
}

export function inspectAgentsMdBlocks(content: string | null | undefined): AgentsMdBlockInspection {
  const value = content ?? "";
  const beginCount = countOccurrences(value, BLOCK_BEGIN_PREFIX);
  const endCount = countOccurrences(value, BLOCK_END);
  const firstBegin = value.indexOf(BLOCK_BEGIN_PREFIX);
  const firstEnd = value.indexOf(BLOCK_END);
  const unmanagedGeneratedSectionCount = findUnmanagedGeneratedSectionRanges(
    stripMarkedBlocksOnly(value),
  ).length;
  return {
    beginCount,
    endCount,
    unmanagedGeneratedSectionCount,
    validSingleBlock:
      beginCount === 1
      && endCount === 1
      && firstBegin >= 0
      && firstEnd > firstBegin
      && unmanagedGeneratedSectionCount === 0,
  };
}

function stripExistingBlocks(content: string): string {
  return stripResidualManagedArtifacts(stripMarkedBlocksOnly(content));
}

function stripMarkedBlocksOnly(content: string): string {
  const fragments: string[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const beginIdx = content.indexOf(BLOCK_BEGIN_PREFIX, cursor);
    if (beginIdx === -1) break;
    fragments.push(content.slice(cursor, beginIdx));

    const markerEnd = content.indexOf("-->", beginIdx + BLOCK_BEGIN_PREFIX.length);
    if (markerEnd === -1) {
      cursor = nextLineStart(content, beginIdx);
      continue;
    }

    const nextBegin = content.indexOf(BLOCK_BEGIN_PREFIX, markerEnd + 3);
    const endIdx = content.indexOf(BLOCK_END, markerEnd + 3);
    const hasOwnEnd = endIdx !== -1 && (nextBegin === -1 || endIdx < nextBegin);
    if (hasOwnEnd) {
      cursor = endIdx + BLOCK_END.length;
      continue;
    }

    cursor = findOrphanedBlockEnd(
      content,
      markerEnd + 3,
      nextBegin === -1 ? content.length : nextBegin,
    );
  }

  fragments.push(content.slice(cursor));
  return fragments
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function stripResidualManagedArtifacts(content: string): string {
  let value = content.split(BLOCK_END).join("");
  const ranges = findUnmanagedGeneratedSectionRanges(value);
  for (const range of [...ranges].reverse()) {
    value = `${value.slice(0, range.start)}${value.slice(range.end)}`;
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findUnmanagedGeneratedSectionRanges(
  content: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const headingPattern = /^## MCP(?:（必须先调）| \(call first\))\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(content)) !== null) {
    const start = match.index;
    const end = findNextSectionBoundary(content, headingPattern.lastIndex);
    const section = content.slice(start, end);
    if (isGeneratedMcpSection(section)) {
      ranges.push({ start, end });
    }
    headingPattern.lastIndex = Math.max(headingPattern.lastIndex, end);
  }
  return ranges;
}

function findNextSectionBoundary(content: string, from: number): number {
  const boundaryPattern = /^#{1,2}\s+.+$/gm;
  boundaryPattern.lastIndex = from;
  const next = boundaryPattern.exec(content);
  return next?.index ?? content.length;
}

function isGeneratedMcpSection(section: string): boolean {
  if (!section.includes("mcp-probe-kit")) return false;
  const signatures = [
    "`start_feature`",
    "`start_bugfix`",
    "`init_project_context`",
    ".mcp-probe-kit/bin/probe.*",
    ".agents/skills/mcp-probe-kit/SKILL.md",
  ];
  return signatures.filter((signature) => section.includes(signature)).length >= 2;
}

function findOrphanedBlockEnd(content: string, start: number, limit: number): number {
  const segment = content.slice(start, limit);
  const headingPattern = /^#{1,6}\s+.+$/gm;
  let generatedHeadingSeen = false;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(segment)) !== null) {
    const heading = match[0].trim();
    if (!generatedHeadingSeen && GENERATED_HEADINGS.has(heading)) {
      generatedHeadingSeen = true;
      continue;
    }
    if (generatedHeadingSeen) {
      return start + match.index;
    }
  }

  return generatedHeadingSeen ? limit : start;
}

function nextLineStart(content: string, from: number): number {
  const newline = content.indexOf("\n", from);
  return newline === -1 ? content.length : newline + 1;
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = content.indexOf(needle, cursor);
    if (index === -1) return count;
    count += 1;
    cursor = index + needle.length;
  }
}

export function mergeAgentsMdBlock(
  existingContent: string | null | undefined,
  generatedInner: string,
  contextVersion: string = VERSION
): { content: string; mergeMode: AgentsMdMergeMode } {
  const block = wrapMcpProbeBlock(generatedInner, contextVersion);

  if (!existingContent?.trim()) {
    return { content: `${block}\n`, mergeMode: "created" };
  }

  const inspection = inspectAgentsMdBlocks(existingContent);
  const userBody = stripExistingBlocks(existingContent);
  const hadBlock = inspection.beginCount > 0 || inspection.endCount > 0;

  if (!userBody) {
    return { content: `${block}\n`, mergeMode: hadBlock ? "replaced-and-moved-to-top" : "created" };
  }

  if (!hadBlock) {
    return {
      content: `${block}\n\n${userBody}\n`,
      mergeMode: "prepended",
    };
  }

  return {
    content: `${block}\n\n${userBody}\n`,
    mergeMode: "replaced-and-moved-to-top",
  };
}
