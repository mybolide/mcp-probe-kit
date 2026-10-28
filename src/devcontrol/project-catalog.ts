/**
 * Read-only project context for the DevControl project workspace.
 *
 * Requirements, architecture and vision stay in their canonical Git documents.
 * This adapter only indexes and presents them. No AI-generated duplicate
 * descriptions, new Markdown or second persistent project catalogue.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface ProjectDocument {
  path: string;
  title: string;
  category: "product" | "architecture" | "delivery" | "other";
  summary: string;
  modifiedAt: string;
}

export interface ProjectContext {
  name: string;
  root: string;
  projectStatus: "documented" | "partial";
  vision: { title: string; summary: string; source: string; available: boolean };
  architecture: { title: string; summary: string; source: string; available: boolean; diagram: string };
  requirements: {
    title: string; source: string; frCount: number; nfrCount: number; available: boolean;
    items: Array<{ id: string; title: string; stage: string; acceptance: string }>;
  };
  roadmap: { title: string; summary: string; source: string; available: boolean };
  okr: { title: string; summary: string; source: string; available: boolean };
  documents: ProjectDocument[];
  git: { branch: string | null; head: string | null };
}

const DOC_LIMIT = 262_144;
const TEXT_LIMIT = 550;

function isWithin(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return !!relative && relative !== ".." && !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative);
}

/** Prevent path traversal, symlinks out of the project and private histories. */
export function safeProjectDocument(root: string, requested: string): string {
  const realRoot = fs.realpathSync(root);
  if (typeof requested !== "string" || requested.length > 230 ||
      !/^(docs\/[A-Za-z0-9_.\/-]+|README\.md)$/.test(requested) ||
      !requested.endsWith(".md") || requested.split("/").includes("..") ||
      requested.includes("//") || requested.includes("/.") ||
      requested.startsWith("docs/history-session/")) {
    throw new Error("Document path is outside the approved project index");
  }
  const absolute = path.resolve(root, requested);
  if (!fs.existsSync(absolute)) throw new Error("Document does not exist");
  const real = fs.realpathSync(absolute);
  if (!isWithin(realRoot, real) || !fs.statSync(real).isFile() ||
      fs.statSync(real).size > DOC_LIMIT) {
    throw new Error("Document is outside project scope or too large");
  }
  const docDir = path.join(realRoot, "docs");
  if (requested !== "README.md" && !isWithin(docDir, real)) {
    throw new Error("Document escaped docs directory");
  }
  return real;
}

function readMarkdown(root: string, document: string): string | null {
  try {
    return fs.readFileSync(safeProjectDocument(root, document), "utf8");
  } catch {
    return null;
  }
}

function heading(content: string): string {
  return /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? "未命名文档";
}

function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function intro(content: string, max = TEXT_LIMIT): string {
  const blocks = content.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (!lines.length || /^(#|\||```|[-*] |\d+\.|>|状态：|状态:)/.test(lines[0].trim())) {
      continue;
    }
    const cleaned = plainText(block);
    if (cleaned.length > 22) return cleaned.slice(0, max);
  }
  return "";
}

function categoryOf(document: string): ProjectDocument["category"] {
  if (/^docs\/(product|okr)\//.test(document)) return "product";
  if (/^docs\/(architecture|design)\//.test(document)) return "architecture";
  if (/^docs\/(engineering|roadmap|specs)\//.test(document)) return "delivery";
  return "other";
}

function indexDocuments(root: string): string[] {
  const found = new Set<string>();
  const welcome = "README.md";
  if (readMarkdown(root, welcome) !== null) found.add(welcome);
  const source = readMarkdown(root, "docs/README.md");
  if (source !== null) {
    found.add("docs/README.md");
    // Follow the *existing* canonical docs index and nested section indexes
    // (e.g. decisions/README.md -> ADR-0001.md), not a broad filesystem scan.
    // Bound both depth and total files to prevent cycles and expensive links.
    const queue = [{ document: "docs/README.md", depth: 0 }];
    const visited = new Set<string>();
    while (queue.length && visited.size < 160) {
      const current = queue.shift()!;
      if (visited.has(current.document)) continue;
      visited.add(current.document);
      const markdown = readMarkdown(root, current.document);
      if (!markdown || current.depth > 3) continue;
      for (const matched of markdown.matchAll(/\[[^\]]+\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
        const target = matched[1];
        const resolved = path.posix.normalize(path.posix.join(
          path.posix.dirname(current.document), target,
        ));
        if ((resolved.startsWith("docs/") || resolved === "README.md") &&
            readMarkdown(root, resolved) !== null) {
          found.add(resolved);
          if (current.depth < 3) queue.push({ document: resolved, depth: current.depth + 1 });
        }
      }
    }
  }
  const specs = path.join(root, "docs", "specs");
  if (fs.existsSync(specs) && fs.statSync(specs).isDirectory()) {
    const scan = (directory: string, depth: number): void => {
      if (depth > 3) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scan(full, depth + 1);
        } else if (entry.name.endsWith(".md")) {
          const relative = path.relative(root, full).split(path.sep).join("/");
          if (readMarkdown(root, relative) !== null) found.add(relative);
        }
      }
    };
    scan(specs, 0);
  }
  return [...found].sort();
}

function gitValue(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      windowsHide: true, cwd: root, encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Re-evaluate each request; no stale summary cache or separate database.
 * Missing files are reported as missing instead of being hallucinated.
 */
export function projectContext(root: string): ProjectContext {
  const sections = {
    vision: "docs/product/vision.md",
    architecture: "docs/architecture/overview.md",
    requirements: "docs/product/requirements.md",
    roadmap: "docs/roadmap/releases.md",
  } as const;
  const docs = indexDocuments(root);
  const documents: ProjectDocument[] = docs.map((document) => {
    const source = readMarkdown(root, document) ?? "";
    return {
      path: document, title: heading(source),
      category: categoryOf(document), summary: intro(source, 165),
      modifiedAt: fs.statSync(safeProjectDocument(root, document)).mtime.toISOString(),
    };
  });
  const summary = (source: string) => {
    const content = readMarkdown(root, source);
    return {
      title: content === null ? "尚未建立" : heading(content),
      summary: content === null ? "" : intro(content),
      source,
      available: content !== null,
    };
  };
  const requirementMarkdown = readMarkdown(root, sections.requirements);
  const architectureContent = readMarkdown(root, sections.architecture);
  const diagram = architectureContent?.match(/```(?:text|plaintext)?\s*\n([\s\S]*?)\n```/i)?.[1]?.trim() ?? "";
  const items = (requirementMarkdown ?? "").split("\n").flatMap((line) => {
    const cells = line.trim().startsWith("|")
      ? line.trim().split("|").slice(1, -1).map((cell) => plainText(cell)) : [];
    if (!/^(?:FR|NFR)-\d+$/.test(cells[0] ?? "") || cells.length < 3) return [];
    return [{
      id: cells[0], title: cells[1],
      stage: cells[2] && cells.length >= 4 ? cells[2] : "NFR",
      acceptance: cells.length >= 4 ? cells[3] : cells[2],
    }];
  });
  const okrPath = docs.find((document) => document.startsWith("docs/okr/")) ?? "docs/okr/README.md";
  const count = (pattern: RegExp): number =>
    requirementMarkdown === null ? 0 : new Set(requirementMarkdown.match(pattern) ?? []).size;
  return {
    name: path.basename(path.resolve(root)),
    root: path.resolve(root),
    projectStatus: docs.length && Object.values(sections).every((document) =>
      readMarkdown(root, document) !== null) ? "documented" : "partial",
    vision: summary(sections.vision),
    architecture: { ...summary(sections.architecture), diagram },
    requirements: {
      title: requirementMarkdown === null ? "尚未建立" : heading(requirementMarkdown),
      source: sections.requirements, frCount: count(/\bFR-\d+\b/g),
      nfrCount: count(/\bNFR-\d+\b/g), available: requirementMarkdown !== null, items,
    },
    roadmap: summary(sections.roadmap),
    okr: summary(okrPath),
    documents,
    git: { branch: gitValue(root, ["branch", "--show-current"]),
      head: gitValue(root, ["rev-parse", "--short", "HEAD"]) },
  };
}

export function readProjectDoc(root: string, document: string): {
  path: string; title: string; markdown: string; modifiedAt: string;
} {
  // Fetch only docs indexed in the project, not arbitrary locally readable MD.
  const indexed = indexDocuments(root);
  if (!indexed.includes(document)) {
    throw new Error("Document is not in this project's documented index");
  }
  const file = safeProjectDocument(root, document);
  const markdown = fs.readFileSync(file, "utf8");
  return {
    path: document, title: heading(markdown), markdown,
    modifiedAt: fs.statSync(file).mtime.toISOString(),
  };
}
