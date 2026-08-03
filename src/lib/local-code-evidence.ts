import * as fs from 'node:fs';
import * as path from 'node:path';

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.py', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.php', '.rb',
]);

const IGNORED_DIRECTORIES = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'build', 'dist', 'coverage',
  '.next', '.nuxt', '.turbo', '.cache', 'vendor', 'target', '__pycache__',
]);

const DEFAULT_MAX_FILES = 120;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

export interface LocalCodeFileEvidence {
  path: string;
  size: number;
  isTest: boolean;
  matchedTerms: string[];
}

export interface LocalCodeSymbolEvidence {
  name: string;
  kind: 'function' | 'class' | 'method' | 'variable' | 'interface' | 'type';
  file: string;
  line: number;
  exported: boolean;
  signature: string;
}

export interface LocalPackageEvidence {
  name?: string;
  type?: string;
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
}

export interface LocalCodeEvidence {
  available: boolean;
  provider: 'local-source-evidence';
  sourceRoot: string;
  summary: string;
  files: LocalCodeFileEvidence[];
  symbols: LocalCodeSymbolEvidence[];
  packageInfo?: LocalPackageEvidence;
  warnings: string[];
  limits: {
    maxFiles: number;
    maxFileBytes: number;
    maxTotalBytes: number;
    scannedFiles: number;
    scannedBytes: number;
    truncated: boolean;
  };
  capabilities: {
    fileInventory: true;
    symbolExtraction: true;
    callGraph: false;
    dependencyGraph: false;
    impactAnalysis: false;
  };
}

export interface CollectLocalCodeEvidenceInput {
  projectRoot: string;
  query?: string;
  target?: string;
  filePath?: string;
  includeTests?: boolean;
  maxFiles?: number;
}

interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  size: number;
  content: string;
  isTest: boolean;
  matchedTerms: string[];
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isTestPath(relativePath: string): boolean {
  return /(^|\/)(?:test|tests|__tests__)(\/|$)|\.(?:test|spec)\.[^.]+$/i.test(relativePath);
}

function tokenizeSearch(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_$\u4e00-\u9fff]+/i)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .filter((item) => ![
        '项目', '整体', '架构', '核心', '流程', '关键', '模块', '依赖', '关系', '入口点',
        'project', 'overall', 'architecture', 'core', 'flow', 'module', 'dependency',
      ].includes(item)),
  )];
}

function scoreText(text: string, terms: string[]): { score: number; matches: string[] } {
  if (terms.length === 0) return { score: 0, matches: [] };
  const lower = text.toLowerCase();
  const matches = terms.filter((term) => lower.includes(term));
  return { score: matches.length, matches };
}

function readPackageEvidence(projectRoot: string): LocalPackageEvidence | undefined {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
    const scripts = parsed.scripts && typeof parsed.scripts === 'object'
      ? Object.fromEntries(
          Object.entries(parsed.scripts as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
      : {};
    const dependencies = parsed.dependencies && typeof parsed.dependencies === 'object'
      ? Object.keys(parsed.dependencies as Record<string, unknown>).sort()
      : [];
    const devDependencies = parsed.devDependencies && typeof parsed.devDependencies === 'object'
      ? Object.keys(parsed.devDependencies as Record<string, unknown>).sort()
      : [];
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      type: typeof parsed.type === 'string' ? parsed.type : undefined,
      scripts,
      dependencies,
      devDependencies,
    };
  } catch {
    return undefined;
  }
}

function collectCandidateFiles(
  projectRoot: string,
  explicitFilePath: string | undefined,
  includeTests: boolean,
  maxFiles: number,
): { files: string[]; truncated: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (explicitFilePath) {
    const absolute = path.resolve(projectRoot, explicitFilePath);
    if (!isInsideRoot(projectRoot, absolute)) {
      return { files: [], truncated: false, warnings: ['local_fallback_file_outside_project_root'] };
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      return { files: [], truncated: false, warnings: ['local_fallback_file_not_found'] };
    }
    return { files: [absolute], truncated: false, warnings };
  }

  const files: string[] = [];
  let truncated = false;
  const visit = (directory: string): void => {
    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      warnings.push(`local_fallback_unreadable_directory:${toPosix(path.relative(projectRoot, directory))}`);
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) visit(absolute);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const relative = toPosix(path.relative(projectRoot, absolute));
      if (!includeTests && isTestPath(relative)) continue;
      files.push(absolute);
    }
  };
  visit(projectRoot);
  return { files, truncated, warnings };
}

function pushSymbol(
  output: LocalCodeSymbolEvidence[],
  seen: Set<string>,
  input: Omit<LocalCodeSymbolEvidence, 'signature'> & { signature: string },
): void {
  const key = `${input.file}:${input.line}:${input.kind}:${input.name}`;
  if (seen.has(key)) return;
  seen.add(key);
  output.push(input);
}

function extractSymbols(file: ScannedFile): LocalCodeSymbolEvidence[] {
  const symbols: LocalCodeSymbolEvidence[] = [];
  const seen = new Set<string>();
  const lines = file.content.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) return;
    const exported = /\bexport\b|\bpublic\b/.test(line);
    const definitions: Array<{
      regex: RegExp;
      kind: LocalCodeSymbolEvidence['kind'];
      group?: number;
    }> = [
      { regex: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/, kind: 'function' },
      { regex: /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)\b/, kind: 'class' },
      { regex: /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\b/, kind: 'interface' },
      { regex: /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\b/, kind: 'type' },
      { regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, kind: 'function' },
      { regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, kind: 'variable' },
      { regex: /^(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/, kind: 'function' },
      { regex: /^class\s+([A-Za-z_][\w]*)\b/, kind: 'class' },
      { regex: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)\s*\(/, kind: 'function' },
      { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/, kind: 'function' },
      { regex: /^(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][\w]*)\b/, kind: 'type' },
      { regex: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:class|interface|enum)\s+([A-Za-z_$][\w$]*)\b/, kind: 'type' },
    ];
    for (const definition of definitions) {
      const match = line.match(definition.regex);
      if (!match) continue;
      pushSymbol(symbols, seen, {
        name: match[definition.group ?? 1],
        kind: definition.kind,
        file: file.relativePath,
        line: index + 1,
        exported,
        signature: line.slice(0, 240),
      });
      break;
    }
  });

  return symbols;
}

export function collectLocalCodeEvidence(input: CollectLocalCodeEvidenceInput): LocalCodeEvidence {
  const projectRoot = path.resolve(input.projectRoot);
  const maxFiles = Math.max(1, Math.min(input.maxFiles ?? DEFAULT_MAX_FILES, 300));
  const warnings = ['local_fallback_no_call_graph', 'local_fallback_evidence_only'];
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    return {
      available: false,
      provider: 'local-source-evidence',
      sourceRoot: projectRoot,
      summary: '项目根目录不存在，无法收集本地源码证据。',
      files: [],
      symbols: [],
      warnings: [...warnings, 'local_fallback_project_root_unavailable'],
      limits: {
        maxFiles,
        maxFileBytes: MAX_FILE_BYTES,
        maxTotalBytes: MAX_TOTAL_BYTES,
        scannedFiles: 0,
        scannedBytes: 0,
        truncated: false,
      },
      capabilities: {
        fileInventory: true,
        symbolExtraction: true,
        callGraph: false,
        dependencyGraph: false,
        impactAnalysis: false,
      },
    };
  }

  const terms = tokenizeSearch(`${input.query ?? ''} ${input.target ?? ''}`);
  const candidates = collectCandidateFiles(
    projectRoot,
    input.filePath,
    input.includeTests ?? false,
    maxFiles,
  );
  warnings.push(...candidates.warnings);
  const scanned: ScannedFile[] = [];
  let scannedBytes = 0;
  let truncated = candidates.truncated;

  for (const absolutePath of candidates.files) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) {
      warnings.push(`local_fallback_file_too_large:${toPosix(path.relative(projectRoot, absolutePath))}`);
      continue;
    }
    if (scannedBytes + stat.size > MAX_TOTAL_BYTES) {
      truncated = true;
      break;
    }
    try {
      const content = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = toPosix(path.relative(projectRoot, absolutePath));
      const score = scoreText(`${relativePath}\n${content}`, terms);
      scanned.push({
        absolutePath,
        relativePath,
        size: stat.size,
        content,
        isTest: isTestPath(relativePath),
        matchedTerms: score.matches,
      });
      scannedBytes += stat.size;
    } catch {
      warnings.push(`local_fallback_unreadable_file:${toPosix(path.relative(projectRoot, absolutePath))}`);
    }
  }

  const allSymbols = scanned.flatMap(extractSymbols);
  const rankedFiles = scanned
    .map((file) => ({
      path: file.relativePath,
      size: file.size,
      isTest: file.isTest,
      matchedTerms: file.matchedTerms,
      score: file.matchedTerms.length,
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const symbolTerms = terms.length > 0 ? terms : [];
  const rankedSymbols = allSymbols
    .map((symbol) => ({
      ...symbol,
      score: scoreText(`${symbol.name} ${symbol.file} ${symbol.signature}`, symbolTerms).score,
    }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);

  const relevantFiles = terms.length > 0 && rankedFiles.some((item) => item.score > 0)
    ? rankedFiles.filter((item) => item.score > 0).slice(0, 30)
    : rankedFiles.slice(0, 30);
  const relevantSymbols = terms.length > 0 && rankedSymbols.some((item) => item.score > 0)
    ? rankedSymbols.filter((item) => item.score > 0).slice(0, 80)
    : rankedSymbols.slice(0, 80);

  const packageInfo = readPackageEvidence(projectRoot);
  const available = scanned.length > 0 || Boolean(packageInfo);
  const summary = available
    ? `本地证据回退扫描了 ${scanned.length} 个源码文件，识别 ${allSymbols.length} 个声明；返回 ${relevantFiles.length} 个文件和 ${relevantSymbols.length} 个相关符号。该结果不包含调用图或影响分析。`
    : '未找到可读取的受支持源码文件或 package.json；未生成本地分析结论。';

  return {
    available,
    provider: 'local-source-evidence',
    sourceRoot: projectRoot,
    summary,
    files: relevantFiles.map(({ score: _score, ...file }) => file),
    symbols: relevantSymbols.map(({ score: _score, ...symbol }) => symbol),
    packageInfo,
    warnings: [...new Set(warnings)],
    limits: {
      maxFiles,
      maxFileBytes: MAX_FILE_BYTES,
      maxTotalBytes: MAX_TOTAL_BYTES,
      scannedFiles: scanned.length,
      scannedBytes,
      truncated,
    },
    capabilities: {
      fileInventory: true,
      symbolExtraction: true,
      callGraph: false,
      dependencyGraph: false,
      impactAnalysis: false,
    },
  };
}
