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
import {
  getMcpProbeSkillVersion,
  parseSkillInstalledVersion,
  SKILL_GUIDANCE_REVISION,
} from "./workflow-skill-version.js";

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

/** Pure preview used both by the installer and by DevControl's Git gate.
 * The expected bytes are derived from the committed user-owned CLAUDE.md,
 * never from a potentially edited working-tree copy. */
export function previewManagedClaudePointer(existing:string|null,
  agentsIndexPath:string,version=getMcpProbeSkillVersion()):string {
  return mergeClaudePointer(existing,generateClaudePointerBlock(
    CANONICAL_SKILL_REL_PATH,agentsIndexPath,version));
}

export interface HarnessAdapterEnsureResult {
  detection: HarnessDetectionResult;
  adapters: HarnessAdapterWriteResult[];
  layoutHarness: LayoutHarnessManifest;
}

function generateRulesPointerContent(
  skillCanonical: string,
  version: string,
  agentsIndexPath: string
): string {
  return `# mcp-probe-kit MCP

> ${RULES_POINTER_VERSION_KEY}: ${version}

配置 **mcp-probe-kit** MCP 后，写代码 / 改文件前：

1. 阅读项目根 \`${agentsIndexPath}\` 中 \`<!-- mcp-probe:context -->\` 块（MCP 触发规则）
2. 需要完整工具表时阅读 \`${skillCanonical}\`

**不要**跳过 MCP 直接改业务代码。正式研发任务统一通过 \`devcontrol\`，不确定时先调 \`devcontrol\` action=\`guide\`。
`;
}

function generateCursorRulesContent(
  skillCanonical: string,
  version: string,
  agentsIndexPath: string
): string {
  return [
    "---",
    "description: mcp-probe-kit native MCP and version-locked CLI fallback",
    "alwaysApply: true",
    "---",
    "",
    "# mcp-probe-kit",
    "",
    `> ${RULES_POINTER_VERSION_KEY}: ${version}`,
    `> mcp-probe:guidance-revision: ${SKILL_GUIDANCE_REVISION}`,
    "",
    `Before coding, read \`${agentsIndexPath}\` and \`${skillCanonical}\`.`,
    "",
    "1. Prefer native mcp-probe-kit tools. Use `devcontrol` as the only formal development workflow.",
    "2. At conversation start, call `history_session_bootstrap`; then use `devcontrol` actions such as `onboard`, `next`, and `execution-contract` to recover the actual SQLite task state.",
    "3. Only modify approved task files. After running real tests and committing approved changes, use `devcontrol` action=`submit` for ordinary in_progress work to record completion and real test evidence atomically. This moves only to in_review, never passes a Gate. Independently review the frozen delivery and use one `verify` acceptance object with real findings for every Gate. A separate Reviewer is optional; follow the Skill. Legacy review actions are for historical receipts only.",
    "4. If native MCP tools are unavailable, use an already installed, matching `.mcp-probe-kit/bin/probe.*` wrapper only. If it is missing, report the configuration problem; do not install from the current directory or fetch an unpublished release.",
    "5. An installation or repair, if separately authorized, must use the verified absolute project root. Never guess a root from the current working directory.",
    "6. A new chat reads next.sessionRecoveryCandidates and task-closure-status. resume-session reopens expired safe work. A submitted Git review releases the writer and returns independent reviewToken; recover-review rotates expired Review without taking a writer. Only failed or invalidated work uses reopen-for-rework, preserving the previous completion/evidence and Gate.",
    "",
  ].join("\n");
}

function generateComateRulesContent(
  skillCanonical: string,
  version: string,
  agentsIndexPath: string
): string {
  return `# mcp-probe-kit-mcp

> ${RULES_POINTER_VERSION_KEY}: ${version}

配置 mcp-probe-kit MCP 后，写代码前阅读 ${agentsIndexPath} 的 mcp-probe 块或 ${skillCanonical}。正式研发流程使用 devcontrol；不确定时调用 devcontrol action=guide。
`;
}

function generateClaudePointerBlock(
  skillCanonical: string,
  agentsPath: string,
  version: string,
): string {
  return `${CLAUDE_BLOCK_BEGIN}
## MCP (mcp-probe-kit)

> ${RULES_POINTER_VERSION_KEY}: ${version}
> mcp-probe:guidance-revision: ${SKILL_GUIDANCE_REVISION}

- At conversation start, use \`history_session_bootstrap\` and read the \`mcp-probe:context\` block in \`${agentsPath}\` and Skill \`${skillCanonical}\`.
- When the user says “continue” or “start”, use \`devcontrol\` actions \`onboard\`, \`next\`, and \`execution-contract\` to recover the approved SQLite task state before changing files.
- Use \`devcontrol\` for formal development work. For ordinary in_progress tasks, run real tests and commit approved source changes, then call \`devcontrol\` action=\`submit\` once with completion details and original test evidence. Submit only records an in_review delivery; it never passes a Gate or makes the task Verified. Independently review the exact frozen Git revision or immutable source snapshot, then use a separate \`verify\` acceptance object with findings for every real Gate. A different Reviewer is optional; legacy \`complete\` / \`report\` and review actions remain available for exceptional or historical receipts. Never fabricate test evidence.
- New sessions read next.sessionRecoveryCandidates and task-closure-status. resume-session restores expired safe work; submitted Git reviews release the writer and use a separate reviewToken. recover-review rotates an expired review-only permission without taking a Git index. reopen-for-rework creates a new approved-scope attempt ONLY for failed or invalidated reviews, preserving earlier evidence and Gate requirements.
- Never install guidance from the current directory. For any separately authorized installation, verify an absolute project root first.
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
  kind: HarnessAdapterKind,
  version: string,
  agentsIndexPath?: string
): boolean {
  if (!existing?.trim()) {
    return true;
  }
  if (kind === "skill-mirror" || kind === "claude-pointer") {
    return existing !== nextContent;
  }
  if (!existing.includes(RULES_POINTER_VERSION_KEY) || !existing.includes(version)) {
    return true;
  }
  if (kind === "rules-pointer" && agentsIndexPath && !existing.includes(agentsIndexPath)) {
    return true;
  }
  return existing !== nextContent;
}

function resolveAdapterContent(
  adapter: HarnessAdapterTarget,
  skillContent: string,
  agentsIndexPath: string
): string {
  const version = parseSkillInstalledVersion(skillContent) ?? getMcpProbeSkillVersion();
  switch (adapter.kind) {
    case "skill-mirror":
      return skillContent;
    case "rules-pointer":
      if (adapter.relPath.endsWith(".mdc")) {
        return generateCursorRulesContent(CANONICAL_SKILL_REL_PATH, version, agentsIndexPath);
      }
      return adapter.relPath.endsWith(".mdr")
        ? generateComateRulesContent(CANONICAL_SKILL_REL_PATH, version, agentsIndexPath)
        : generateRulesPointerContent(CANONICAL_SKILL_REL_PATH, version, agentsIndexPath);
    case "claude-pointer":
      return previewManagedClaudePointer(null,agentsIndexPath,version);
    default:
      return skillContent;
  }
}

function writeAdapterFile(
  projectRoot: string,
  adapter: HarnessAdapterTarget,
  content: string,
  version: string,
  agentsIndexPath: string
): HarnessAdapterWriteResult {
  const absolute = path.join(projectRoot, adapter.relPath);
  // `existsSync` follows symlinks and returns false for a dangling link.
  // Check lstat BEFORE reading or writing so an auto-upgrade cannot follow
  // CLAUDE.md into an unrelated user file outside the project.
  let fileStat:fs.Stats|null=null;
  try{fileStat=fs.lstatSync(absolute);}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(adapter.kind==='claude-pointer'&&fileStat&&
    (!fileStat.isFile()||fileStat.isSymbolicLink()))
    throw Error('Unsafe managed Claude instructions file: '+adapter.relPath);
  const existing = fileStat ? fs.readFileSync(absolute, "utf8") : null;

  if (adapter.kind === "claude-pointer" && existing) {
    const merged = previewManagedClaudePointer(existing,agentsIndexPath,version);
    if (!adapterNeedsUpdate(existing, merged, adapter.kind, version, agentsIndexPath)) {
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

  if (!adapterNeedsUpdate(existing, content, adapter.kind, version, agentsIndexPath)) {
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

function collectInstalledAdapterManifest(
  projectRoot: string,
  detection: HarnessDetectionResult
): Array<{ id: string; kind: HarnessAdapterKind; path: string }> {
  return detection.adaptersToWrite
    .filter((adapter) => fs.existsSync(path.join(projectRoot, adapter.relPath)))
    .map((adapter) => ({
      id: adapter.id,
      kind: adapter.kind,
      path: adapter.relPath,
    }));
}

/**
 * Write optional harness adapters. AGENTS.md and canonical Skill are unchanged.
 * Canonical Skill must already exist at `.agents/skills/mcp-probe-kit/SKILL.md`.
 */
export function ensureHarnessAdapters(
  projectRoot: string,
  skillContent: string,
  agentsIndexPath = "AGENTS.md",
  environment: NodeJS.ProcessEnv = process.env,
): HarnessAdapterEnsureResult {
  const root = path.resolve(projectRoot);
  const detection = detectHarnessContext(root, environment);
  const adapters: HarnessAdapterWriteResult[] = [];
  const version = parseSkillInstalledVersion(skillContent) ?? getMcpProbeSkillVersion();

  for (const adapter of detection.adaptersToWrite) {
    const content = resolveAdapterContent(adapter, skillContent, agentsIndexPath);
    adapters.push(writeAdapterFile(root, adapter, content, version, agentsIndexPath));
  }

  return {
    detection,
    adapters,
    layoutHarness: toLayoutHarnessManifest(
      detection,
      collectInstalledAdapterManifest(root, detection)
    ),
  };
}
