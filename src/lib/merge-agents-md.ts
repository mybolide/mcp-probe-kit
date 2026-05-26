const BLOCK_BEGIN = "<!-- mcp-probe:context begin — auto-generated; re-run init_project_context updates this block only -->";
const BLOCK_END = "<!-- mcp-probe:context end -->";

export type AgentsMdMergeMode =
  | "created"
  | "prepended"
  | "replaced-and-moved-to-top"
  | "skipped-empty";

export function wrapMcpProbeBlock(innerMarkdown: string): string {
  return `${BLOCK_BEGIN}\n${innerMarkdown.trim()}\n${BLOCK_END}`;
}

function stripExistingBlock(content: string): string {
  const beginIdx = content.indexOf(BLOCK_BEGIN);
  if (beginIdx === -1) {
    const legacyBegin = content.indexOf("<!-- mcp-probe:context begin");
    if (legacyBegin === -1) {
      return content.trim();
    }
    const legacyEnd = content.indexOf(BLOCK_END);
    if (legacyEnd === -1) {
      return content.trim();
    }
    const legacyLineEnd = content.indexOf("-->", legacyBegin);
    const blockStart = legacyLineEnd === -1 ? legacyBegin : legacyLineEnd + 3;
    const before = content.slice(0, legacyBegin).trimEnd();
    const after = content.slice(legacyEnd + BLOCK_END.length).trimStart();
    return [before, after].filter(Boolean).join("\n\n").trim();
  }

  const endIdx = content.indexOf(BLOCK_END);
  if (endIdx === -1) {
    return content.trim();
  }

  const before = content.slice(0, beginIdx).trimEnd();
  const after = content.slice(endIdx + BLOCK_END.length).trimStart();
  return [before, after].filter(Boolean).join("\n\n").trim();
}

export function mergeAgentsMdBlock(
  existingContent: string | null | undefined,
  generatedInner: string
): { content: string; mergeMode: AgentsMdMergeMode } {
  const block = wrapMcpProbeBlock(generatedInner);

  if (!existingContent?.trim()) {
    return { content: `${block}\n`, mergeMode: "created" };
  }

  const userBody = stripExistingBlock(existingContent);
  const hadBlock =
    existingContent.includes(BLOCK_BEGIN) || existingContent.includes("<!-- mcp-probe:context begin");

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
