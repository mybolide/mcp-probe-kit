import * as fs from "node:fs";
import * as path from "node:path";

export const DEFAULT_CONTEXT_ROOT = "docs";
export const DEFAULT_INDEX_PATH = "AGENTS.md";

/** Relative path to layout manifest under a given context root */
export function layoutManifestRel(contextRoot: string = DEFAULT_CONTEXT_ROOT): string {
  return joinRel(normalizeRelativePath(contextRoot), ".mcp-probe/layout.json");
}

/** Default manifest location when contextRoot is `docs` */
export const LAYOUT_MANIFEST_REL = layoutManifestRel(DEFAULT_CONTEXT_ROOT);

const MANIFEST_SCAN_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

export type IndexStyle = "auto" | "agents" | "legacy";
export type LayoutSource = "args" | "manifest" | "detect" | "default";
export type DocumentLocale = "en" | "zh-CN";

export interface ProjectContextLayout {
  /** Absolute project root (platform path) */
  projectRoot: string;
  /** Absolute project root (POSIX, stored in layout.json) */
  projectRootPosix: string;
  indexPath: string;
  contextRoot: string;
  modularDir: string;
  graphDir: string;
  latestMarkdownPath: string;
  latestJsonPath: string;
  manifestPath: string;
  indexStyle: "agents" | "legacy";
  source: LayoutSource;
  legacyIndexPath: string;
}

export interface ProjectContextLayoutArgs {
  docs_dir?: string;
  output?: string;
  output_dir?: string;
  filename?: string;
  index_style?: IndexStyle;
}

/** Primary env key recorded in layout.json (optional local override via projectRoot) */
export const LAYOUT_PROJECT_ROOT_ENV = "MCP_PROJECT_ROOT";

const LAYOUT_PROJECT_ROOT_ENV_FALLBACKS = [
  LAYOUT_PROJECT_ROOT_ENV,
  "MCP_WORKSPACE_ROOT",
  "CURSOR_WORKSPACE_ROOT",
  "WORKSPACE_ROOT",
  "PROJECT_ROOT",
] as const;

export interface LayoutManifestV1 {
  version: 1;
  /** Ignored if present in old files — project root is always inferred from manifest path */
  projectRoot?: string;
  /** Env fallback when manifest path cannot be resolved (default MCP_PROJECT_ROOT) */
  projectRootEnv?: string;
  indexPath: string;
  contextRoot: string;
  modularDir: string;
  graphDir: string;
  indexStyle: "agents" | "legacy";
  generatedBy: string;
  generatedAt: string;
}

export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function relativeLink(fromRel: string, toRel: string): string {
  const fromDir = path.posix.dirname(toPosixPath(fromRel).replace(/^\.\//, "") || ".");
  const toPath = toPosixPath(toRel).replace(/^\.\//, "");
  let rel = path.posix.relative(fromDir, toPath);
  if (!rel || rel === ".") {
    return toPath;
  }
  if (!rel.startsWith(".")) {
    rel = `./${rel}`;
  }
  return rel;
}

function normalizeRelativePath(raw: string): string {
  const cleaned = toPosixPath(raw.trim()).replace(/^\/+/, "").replace(/\/+$/, "");
  if (!cleaned || cleaned === ".") {
    return cleaned || ".";
  }
  if (cleaned.split("/").includes("..")) {
    throw new Error(`路径不允许包含 '..': ${raw}`);
  }
  return cleaned;
}

function joinRel(...segments: string[]): string {
  return normalizeRelativePath(path.posix.join(...segments.filter(Boolean)));
}

function isExistingDirectory(target: string): boolean {
  try {
    return fs.existsSync(target) && fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function assertPathInsideProject(projectRoot: string, relativePath: string): void {
  const resolved = path.resolve(projectRoot, relativePath);
  const root = path.resolve(projectRoot);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`路径必须在项目根目录内: ${relativePath}`);
  }
}

function fileExists(projectRoot: string, relativePath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

export function projectRootToManifestValue(projectRoot: string): string {
  return toPosixPath(path.resolve(projectRoot));
}

function resolveProjectRootFromEnv(envKey?: string): string | null {
  const keys = envKey?.trim()
    ? [envKey.trim(), ...LAYOUT_PROJECT_ROOT_ENV_FALLBACKS]
    : [...LAYOUT_PROJECT_ROOT_ENV_FALLBACKS];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const raw = process.env[key]?.trim();
    if (!raw) {
      continue;
    }
    const resolved = path.resolve(raw.replace(/\//g, path.sep));
    if (isExistingDirectory(resolved)) {
      return resolved;
    }
  }
  return null;
}

/**
 * Resolve project root: infer from manifest file path → env → fallback (never reads manifest.projectRoot).
 */
export function resolveManifestProjectRoot(
  manifest: LayoutManifestV1,
  fallbackProjectRoot: string,
  manifestFilePath?: string
): string {
  if (manifestFilePath) {
    const inferred = inferProjectRootFromManifestPath(
      manifestFilePath,
      manifest.contextRoot
    );
    if (isExistingDirectory(inferred)) {
      return inferred;
    }
  }

  const fromEnv = resolveProjectRootFromEnv(manifest.projectRootEnv);
  if (fromEnv) {
    return fromEnv;
  }

  return path.resolve(fallbackProjectRoot);
}

/**
 * `{projectRoot}/{contextRoot}/.mcp-probe/layout.json` → walk up from manifest file to project root.
 */
export function inferProjectRootFromManifestPath(
  manifestFilePath: string,
  contextRoot: string = DEFAULT_CONTEXT_ROOT
): string {
  let dir = path.dirname(path.resolve(manifestFilePath));
  const segments = layoutManifestRel(contextRoot).split("/").filter(Boolean);
  for (let i = 1; i < segments.length; i++) {
    dir = path.dirname(dir);
  }
  return dir;
}

function findLayoutManifestInTree(dir: string): string | null {
  const defaultCandidate = path.join(dir, LAYOUT_MANIFEST_REL);
  if (fs.existsSync(defaultCandidate)) {
    return defaultCandidate;
  }

  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || MANIFEST_SCAN_SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const candidate = path.join(dir, entry.name, ".mcp-probe", "layout.json");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function findLayoutManifestPath(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const found = findLayoutManifestInTree(current);
    if (found) {
      return found;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function discoverProjectRootFromLayout(startDir: string): string | null {
  const manifestPath = findLayoutManifestPath(startDir);
  if (!manifestPath) {
    return null;
  }
  const manifest = readLayoutManifestFromPath(manifestPath);
  if (!manifest) {
    return inferProjectRootFromManifestPath(manifestPath);
  }
  return resolveManifestProjectRoot(manifest, startDir, manifestPath);
}

export function readLayoutManifestFromPath(manifestFilePath: string): LayoutManifestV1 | null {
  if (!fs.existsSync(manifestFilePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestFilePath, "utf8")) as LayoutManifestV1;
    if (parsed?.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readLayoutManifest(projectRoot: string): LayoutManifestV1 | null {
  const manifestPath = findLayoutManifestPath(projectRoot);
  return manifestPath ? readLayoutManifestFromPath(manifestPath) : null;
}

export function manifestPathRelativeToProject(projectRoot: string, absoluteManifestPath: string): string {
  const rel = path.relative(path.resolve(projectRoot), path.resolve(absoluteManifestPath));
  return toPosixPath(rel);
}

export function layoutAbsPath(layout: ProjectContextLayout, relativePath: string): string {
  return path.join(layout.projectRoot, normalizeRelativePath(relativePath));
}

type ProjectContextLayoutCore = Omit<ProjectContextLayout, "projectRoot" | "projectRootPosix">;

export function attachProjectRoot(layout: ProjectContextLayoutCore, projectRoot: string): ProjectContextLayout {
  const resolved = path.resolve(projectRoot);
  return {
    ...layout,
    projectRoot: resolved,
    projectRootPosix: projectRootToManifestValue(resolved),
  };
}

export function buildLayoutManifest(layout: ProjectContextLayout): LayoutManifestV1 {
  return {
    version: 1,
    projectRootEnv: LAYOUT_PROJECT_ROOT_ENV,
    indexPath: layout.indexPath,
    contextRoot: layout.contextRoot,
    modularDir: layout.modularDir,
    graphDir: layout.graphDir,
    indexStyle: layout.indexStyle,
    generatedBy: "init_project_context",
    generatedAt: new Date().toISOString(),
  };
}

export function writeLayoutManifest(projectRoot: string, layout: ProjectContextLayout): string {
  const resolvedRoot = path.resolve(projectRoot);
  const manifestRel = layoutManifestRel(layout.contextRoot);
  const manifest = buildLayoutManifest(attachProjectRoot(layout, resolvedRoot));
  const absoluteManifest = path.join(resolvedRoot, ...manifestRel.split("/"));
  fs.mkdirSync(path.dirname(absoluteManifest), { recursive: true });
  fs.writeFileSync(absoluteManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestRel;
}

export function layoutFromManifest(
  manifest: LayoutManifestV1,
  fallbackProjectRoot: string,
  manifestFilePath?: string
): ProjectContextLayout {
  const contextRoot = normalizeRelativePath(manifest.contextRoot);
  const projectRoot = resolveManifestProjectRoot(manifest, fallbackProjectRoot, manifestFilePath);
  const graphDir = normalizeRelativePath(manifest.graphDir);
  const manifestRel = manifestFilePath
    ? manifestPathRelativeToProject(projectRoot, manifestFilePath)
    : layoutManifestRel(contextRoot);
  return attachProjectRoot(
    {
      indexPath: normalizeRelativePath(manifest.indexPath),
      contextRoot,
      modularDir: normalizeRelativePath(manifest.modularDir),
      graphDir,
      latestMarkdownPath: joinRel(graphDir, "latest.md"),
      latestJsonPath: joinRel(graphDir, "latest.json"),
      manifestPath: manifestRel,
      indexStyle: manifest.indexStyle,
      source: "manifest",
      legacyIndexPath: joinRel(contextRoot, "project-context.md"),
    },
    projectRoot
  );
}

function buildLayoutFromParts(
  projectRoot: string,
  contextRoot: string,
  indexPath: string,
  indexStyle: "agents" | "legacy",
  source: LayoutSource
): ProjectContextLayout {
  const modularDir = joinRel(contextRoot, "project-context");
  const graphDir = joinRel(contextRoot, "graph-insights");
  return attachProjectRoot(
    {
      indexPath,
      contextRoot,
      modularDir,
      graphDir,
      latestMarkdownPath: joinRel(graphDir, "latest.md"),
      latestJsonPath: joinRel(graphDir, "latest.json"),
      manifestPath: layoutManifestRel(contextRoot),
      indexStyle,
      source,
      legacyIndexPath: joinRel(contextRoot, "project-context.md"),
    },
    projectRoot
  );
}

export function resolveProjectContextLayout(
  projectRoot: string,
  args: ProjectContextLayoutArgs = {}
): ProjectContextLayout {
  const startRoot = path.resolve(projectRoot);
  const hasExplicitArgs = Boolean(
    args.docs_dir?.trim() ||
      args.output?.trim() ||
      args.output_dir?.trim() ||
      args.filename?.trim() ||
      args.index_style
  );

  const manifestPath = findLayoutManifestPath(startRoot);
  const manifest = manifestPath ? readLayoutManifestFromPath(manifestPath) : readLayoutManifest(startRoot);

  let canonicalRoot = startRoot;
  if (!hasExplicitArgs && manifest) {
    canonicalRoot = resolveManifestProjectRoot(manifest, startRoot, manifestPath ?? undefined);
  }

  if (!hasExplicitArgs && manifest) {
    const fromManifest = layoutFromManifest(manifest, canonicalRoot, manifestPath ?? undefined);
    assertPathInsideProject(fromManifest.projectRoot, fromManifest.indexPath);
    assertPathInsideProject(fromManifest.projectRoot, fromManifest.contextRoot);
    return fromManifest;
  }

  const contextRoot = normalizeRelativePath(args.docs_dir?.trim() || DEFAULT_CONTEXT_ROOT);

  let indexPath: string;
  let indexStyle: "agents" | "legacy";

  if (args.output?.trim()) {
    indexPath = normalizeRelativePath(args.output.trim());
    indexStyle = indexPath.endsWith("AGENTS.md") ? "agents" : "legacy";
  } else if (args.output_dir?.trim()) {
    indexPath = joinRel(args.output_dir.trim(), args.filename?.trim() || "project-context.md");
    indexStyle = "legacy";
  } else if (args.index_style === "legacy") {
    indexPath = joinRel(contextRoot, "project-context.md");
    indexStyle = "legacy";
  } else if (args.index_style === "agents") {
    indexPath = DEFAULT_INDEX_PATH;
    indexStyle = "agents";
  } else {
    indexPath = DEFAULT_INDEX_PATH;
    indexStyle = "agents";
  }

  const layout = buildLayoutFromParts(
    canonicalRoot,
    contextRoot,
    indexPath,
    indexStyle,
    hasExplicitArgs ? "args" : manifest ? "manifest" : "default"
  );

  assertPathInsideProject(layout.projectRoot, layout.indexPath);
  assertPathInsideProject(layout.projectRoot, layout.contextRoot);
  assertPathInsideProject(layout.projectRoot, layout.modularDir);
  assertPathInsideProject(layout.projectRoot, layout.graphDir);

  return layout;
}

export function countCjkChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
}

export function detectDocumentLocale(projectRoot: string, existingAgentsContent?: string): DocumentLocale {
  if (existingAgentsContent) {
    const begin = existingAgentsContent.indexOf("<!-- mcp-probe:context begin");
    const end = existingAgentsContent.indexOf("<!-- mcp-probe:context end -->");
    if (begin !== -1 && end > begin) {
      const block = existingAgentsContent.slice(begin, end);
      if (countCjkChars(block) >= 8) {
        return "zh-CN";
      }
    }
  }

  const readmePath = path.join(projectRoot, "README.md");
  if (fs.existsSync(readmePath)) {
    const sample = fs.readFileSync(readmePath, "utf8").slice(0, 4000);
    const cjk = countCjkChars(sample);
    const letters = (sample.match(/[a-zA-Z]/g) || []).length;
    if (cjk >= 20 && cjk / Math.max(letters, 1) > 0.12) {
      return "zh-CN";
    }
  }

  if (fs.existsSync(path.join(projectRoot, "i18n", "README.zh-CN.md"))) {
    return "zh-CN";
  }

  return "en";
}

export function legacyProjectContextExists(projectRoot: string, layout: ProjectContextLayout): boolean {
  return fileExists(layout.projectRoot, layout.legacyIndexPath);
}

export function agentsMdExists(projectRoot: string, layout: ProjectContextLayout): boolean {
  return fileExists(layout.projectRoot, layout.indexPath);
}

export function parseLayoutArgsFromRecord(args: Record<string, unknown>): ProjectContextLayoutArgs {
  return {
    docs_dir: typeof args.docs_dir === "string" ? args.docs_dir : undefined,
    output: typeof args.output === "string" ? args.output : undefined,
    output_dir: typeof args.output_dir === "string" ? args.output_dir : undefined,
    filename: typeof args.filename === "string" ? args.filename : undefined,
    index_style:
      args.index_style === "auto" || args.index_style === "agents" || args.index_style === "legacy"
        ? args.index_style
        : undefined,
  };
}
