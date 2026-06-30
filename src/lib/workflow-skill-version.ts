import { VERSION } from "../version.js";

/** Skill frontmatter 版本字段 */
export const SKILL_VERSION_FRONTMATTER_KEY = "mcp-probe-kit-version";

/** @deprecated 旧版 HTML 版本标记，仍用于解析历史文件 */
export const SKILL_VERSION_MARKER = "mcp-probe-kit-skill-version";

/** AGENTS.md mcp-probe 块内版本标记 */
export const AGENTS_CONTEXT_VERSION_MARKER = "mcp-probe:context-version";

export function getMcpProbeSkillVersion(): string {
  return VERSION;
}

export function formatSkillVersionMarker(version: string = VERSION): string {
  return `<!-- ${SKILL_VERSION_MARKER}: ${version} -->`;
}

export function formatAgentsContextVersionMarker(version: string = VERSION): string {
  return `<!-- ${AGENTS_CONTEXT_VERSION_MARKER}: ${version} -->`;
}

export function parseSkillVersionMarker(content: string): string | null {
  const pattern = new RegExp(
    `<!--\\s*${SKILL_VERSION_MARKER}:\\s*([^\\s>]+)\\s*-->`,
    "i"
  );
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function parseSkillVersionFromFrontmatter(content: string): string | null {
  if (!content.trimStart().startsWith("---")) {
    return null;
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    return null;
  }
  const header = content.slice(0, end + 4);
  const pattern = new RegExp(
    `^${SKILL_VERSION_FRONTMATTER_KEY}:\\s*["']?([^"'\\n]+)["']?\\s*$`,
    "m"
  );
  const match = header.match(pattern);
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null;
}

/** 从 Skill 正文解析已安装版本（frontmatter 优先，HTML 注释兜底） */
export function parseSkillInstalledVersion(content: string): string | null {
  return parseSkillVersionFromFrontmatter(content) ?? parseSkillVersionMarker(content);
}

/** 是否缺少 Agent Skill 发现所需的 YAML frontmatter */
export function skillFrontmatterNeedsUpgrade(content: string): boolean {
  if (!content.trimStart().startsWith("---")) {
    return true;
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    return true;
  }
  const header = content.slice(0, end + 4);
  if (!/^name:\s*mcp-probe-kit\s*$/m.test(header)) {
    return true;
  }
  if (!/^description:\s*>?-?\s*\S/m.test(header)) {
    return true;
  }
  if (!new RegExp(`^${SKILL_VERSION_FRONTMATTER_KEY}:\\s*`, "m").test(header)) {
    return true;
  }
  return false;
}

export function parseAgentsContextVersion(content: string): string | null {
  const pattern = new RegExp(
    `<!--\\s*${AGENTS_CONTEXT_VERSION_MARKER}:\\s*([^\\s>]+)\\s*-->`,
    "i"
  );
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

/** 比较 semver（仅主版本号段，忽略 prerelease 后缀） */
export function compareSemver(a: string, b: string): number {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const left = normalize(a);
  const right = normalize(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

/** 已安装 Skill 是否落后于当前 kit 版本（无标记视为过期） */
export function skillContentNeedsUpgrade(
  existing: string | null | undefined,
  targetVersion: string = VERSION
): boolean {
  if (!existing?.trim()) {
    return true;
  }
  if (skillFrontmatterNeedsUpgrade(existing)) {
    return true;
  }
  const installed = parseSkillInstalledVersion(existing);
  if (!installed) {
    return true;
  }
  return compareSemver(installed, targetVersion) < 0;
}

/** AGENTS.md mcp-probe 块是否落后于当前 kit 版本 */
export function agentsContextNeedsUpgrade(
  existing: string | null | undefined,
  targetVersion: string = VERSION
): boolean {
  if (!existing?.trim()) {
    return true;
  }
  const installed = parseAgentsContextVersion(existing);
  if (!installed) {
    return true;
  }
  return compareSemver(installed, targetVersion) < 0;
}
