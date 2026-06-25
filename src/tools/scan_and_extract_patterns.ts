import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs, getString, getNumber } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { handleToolError } from '../utils/error-handler.js';
import { resolveWorkspaceRoot } from '../lib/workspace-root.js';

const DEFAULT_INCLUDE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.vue',
  '.svelte',
]);

const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.turbo',
  'coverage',
  '.cursor-local-assistant',
]);

function inferTags(content: string, filePath = ''): string[] {
  const tags = new Set<string>();
  const lower = `${filePath}\n${content}`.toLowerCase();
  if (lower.includes('react')) tags.add('react');
  if (lower.includes('vue')) tags.add('vue');
  if (lower.includes('svelte')) tags.add('svelte');
  if (lower.includes('typescript') || filePath.endsWith('.ts') || filePath.endsWith('.tsx')) tags.add('typescript');
  if (lower.includes('auth')) tags.add('auth');
  if (lower.includes('api')) tags.add('api');
  if (lower.includes('hook')) tags.add('hook');
  if (lower.includes('component')) tags.add('component');
  if (lower.includes('test(') || lower.includes('describe(') || /\.test\.|\.spec\./.test(filePath)) tags.add('test');
  if (lower.includes('debounce')) tags.add('debounce');
  if (lower.includes('fetch(') || lower.includes('axios')) tags.add('http');
  return [...tags];
}

function detectPatternType(content: string, filePath = ''): string {
  const lower = content.toLowerCase();
  if (/export\s+function\s+use[A-Z]/.test(content) || /function\s+use[A-Z]/.test(content)) {
    return 'hook';
  }
  if (/export\s+(default\s+)?function\s+[A-Z]/.test(content) || /export\s+const\s+[A-Z][\w$]*\s*=/.test(content)) {
    return 'component';
  }
  if (lower.includes('class ') && lower.includes('service')) {
    return 'service';
  }
  if (lower.includes('interface ') || lower.includes('type ')) {
    return 'type-definition';
  }
  if (/\.test\.|\.spec\./.test(filePath)) {
    return 'test-pattern';
  }
  return 'code-pattern';
}

function collectCandidateNames(content: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /export\s+function\s+([A-Za-z_$][\w$]*)/g,
    /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g,
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*\(/g,
    /class\s+([A-Za-z_$][\w$]*)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const name = match[1]?.trim();
      if (name && name.length > 2) {
        names.add(name);
      }
      if (names.size >= 4) {
        return [...names];
      }
    }
  }

  return [...names];
}

function summarizeContent(content: string, maxChars = 200): string {
  return content
    .split(/\r?\n/)
    .slice(0, 8)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function buildPattern(content: string, filePath: string) {
  const normalized = content.trim();
  const candidateNames = collectCandidateNames(normalized);
  const primaryName = candidateNames[0] || (filePath ? path.basename(filePath) : 'snippet');
  const type = detectPatternType(normalized, filePath);
  const summary = summarizeContent(normalized);
  const fileHint = filePath ? `（摘录自 ${filePath}）` : '';

  return {
    name: primaryName,
    type,
    description: filePath
      ? `从 ${filePath} 提取的可复用模式${fileHint}`
      : '从代码片段提取的可复用模式',
    summary,
    content: normalized,
    tags: inferTags(normalized, filePath),
    confidence: filePath ? 0.62 : 0.55,
    candidateNames,
  };
}

function shouldIncludeFile(filePath: string, extensions: Set<string>): boolean {
  return extensions.has(path.extname(filePath).toLowerCase());
}

function walkDirectory(rootDir: string, extensions: Set<string>, maxFiles: number): string[] {
  const collected: string[] = [];

  function walk(currentDir: string) {
    if (collected.length >= maxFiles) {
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (collected.length >= maxFiles) {
        return;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) {
          continue;
        }
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && shouldIncludeFile(fullPath, extensions)) {
        collected.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return collected;
}

function resolveTargetDirectory(projectRoot: string, directoryPath: string): { resolvedPath: string; attemptedRoots: string[] } {
  if (!directoryPath) {
    return { resolvedPath: projectRoot, attemptedRoots: [projectRoot] };
  }

  if (path.isAbsolute(directoryPath)) {
    return {
      resolvedPath: path.resolve(directoryPath),
      attemptedRoots: [path.resolve(directoryPath)],
    };
  }

  const attemptedRoots = Array.from(new Set([
    projectRoot,
    resolveWorkspaceRoot(),
    process.cwd(),
  ].filter(Boolean)));

  for (const root of attemptedRoots) {
    const candidate = path.resolve(root, directoryPath);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return { resolvedPath: candidate, attemptedRoots };
      }
    } catch {
      // ignore and continue probing next root
    }
  }

  return {
    resolvedPath: path.resolve(attemptedRoots[0] || projectRoot, directoryPath),
    attemptedRoots,
  };
}

function isLikelyProjectNamedRelativePath(directoryPath: string): boolean {
  if (!directoryPath || path.isAbsolute(directoryPath)) {
    return false;
  }

  const normalized = directoryPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!normalized || normalized.startsWith('../')) {
    return false;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 2) {
    return false;
  }

  const [firstSegment, secondSegment] = segments;
  const commonRootDirs = new Set([
    'src',
    'app',
    'lib',
    'test',
    'tests',
    'spec',
    'specs',
    'docs',
    'scripts',
    'packages',
    'services',
    'server',
    'client',
    'components',
    'utils',
    'bin',
    'config',
    'examples',
  ]);

  if (commonRootDirs.has(firstSegment.toLowerCase())) {
    return false;
  }

  if (!/^[a-z0-9._-]+$/i.test(firstSegment)) {
    return false;
  }

  return commonRootDirs.has(secondSegment.toLowerCase()) || firstSegment.includes('-');
}

function buildRetryHint(directoryPath: string) {
  const normalized = directoryPath.replace(/\\/g, '/');
  const withoutFirstSegment = normalized.split('/').slice(1).join('/') || 'app/utils';

  return {
    preferred: {
      project_root: 'C:/path/to/your/project',
      directory_path: withoutFirstSegment,
    },
    fallback: {
      directory_path: 'C:/path/to/your/project/' + withoutFirstSegment,
    },
  };
}

function toRelativePath(targetPath: string, rootDir: string): string {
  const relative = path.relative(rootDir, targetPath);
  return relative || path.basename(targetPath);
}

export async function scanAndExtractPatterns(args: any) {
  try {
    const parsed = parseArgs<{
      content?: string;
      file_path?: string;
      project_name?: string;
      directory_path?: string;
      project_root?: string;
      max_files?: number;
      max_patterns?: number;
      include_extensions?: string[] | string;
    }>(args, {
      defaultValues: {
        content: '',
        file_path: '',
        project_name: '',
        directory_path: '',
        project_root: '',
        max_files: 30,
        max_patterns: 20,
      },
      fieldAliases: {
        content: ['code', 'snippet'],
        file_path: ['path'],
        project_name: ['project'],
        directory_path: ['dir', 'directory'],
        project_root: ['root'],
        max_files: ['limit_files'],
        max_patterns: ['limit_patterns'],
        include_extensions: ['extensions', 'exts'],
      },
    });

    const content = getString(parsed.content);
    const filePath = getString(parsed.file_path);
    const directoryPath = getString(parsed.directory_path);
    const projectRoot = resolveWorkspaceRoot(getString(parsed.project_root));
    const maxFiles = Math.max(1, Math.min(200, getNumber(parsed.max_files, 30)));
    const maxPatterns = Math.max(1, Math.min(100, getNumber(parsed.max_patterns, 20)));
    const includeExtensions = new Set(
      Array.isArray(parsed.include_extensions)
        ? parsed.include_extensions
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.startsWith('.') ? item.toLowerCase() : `.${item.toLowerCase()}`)
        : DEFAULT_INCLUDE_EXTENSIONS
    );

    if (content) {
      const pattern = buildPattern(content, filePath);
      return okStructured(
        `已提取 1 个候选模式${filePath ? `: ${filePath}` : ''}`,
        {
          mode: 'single',
          patterns: [pattern],
        }
      );
    }

    if (!getString(parsed.project_root) && isLikelyProjectNamedRelativePath(directoryPath)) {
      return {
        content: [{
          type: 'text',
          text: `拒绝执行目录扫描：directory_path 不能传带项目名的半相对路径，例如 ${directoryPath}。请改为传 project_root + 相对目录路径，或直接传目录绝对路径。`,
        }],
        isError: true,
        structuredContent: {
          error_code: 'INVALID_DIRECTORY_PATH',
          mode: 'directory',
          rejected_directory_path: directoryPath,
          retry_hint: buildRetryHint(directoryPath),
        },
      };
    }

    const { resolvedPath: targetDir, attemptedRoots } = resolveTargetDirectory(projectRoot, directoryPath);

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      const attempted = attemptedRoots.map((root) => path.resolve(root, directoryPath).replace(/\\/g, '/'));
      return okStructured(
        `目录不存在或不可访问: ${targetDir.replace(/\\/g, '/')}。相对路径解析依赖工作区根目录；请显式传入 project_root，或从目标项目目录打开 MCP 客户端以自动识别工作区。`,
        {
          mode: 'directory',
          scannedFiles: 0,
          patterns: [],
          attemptedPaths: attempted,
        }
      );
    }

    const files = walkDirectory(targetDir, includeExtensions, maxFiles);
    const patterns = [] as any[];

    for (const absoluteFile of files) {
      if (patterns.length >= maxPatterns) {
        break;
      }

      let raw = '';
      try {
        raw = fs.readFileSync(absoluteFile, 'utf-8');
      } catch {
        continue;
      }

      const normalized = raw.trim();
      if (!normalized || normalized.length < 40) {
        continue;
      }

      const relativePath = toRelativePath(absoluteFile, projectRoot).replace(/\\/g, '/');
      patterns.push(buildPattern(normalized, relativePath));
    }

    return okStructured(
      `已扫描 ${files.length} 个文件，提取 ${patterns.length} 个候选模式`,
      {
        mode: 'directory',
        scannedRoot: targetDir.replace(/\\/g, '/'),
        scannedFiles: files.length,
        patterns,
      }
    );
  } catch (error) {
    return handleToolError(error, 'scan_and_extract_patterns');
  }
}
