import { parseArgs, getString, getNumber, getBoolean } from "../utils/parseArgs.js";
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { VERSION } from '../version.js';

interface ProjectAnalysis {
  projectStructure: {
    name: string;
    type: string;
    framework: string;
    language: string;
    packageManager: string;
  };
  directoryTree: string;
  keyFiles: Array<{
    path: string;
    purpose: string;
    content: string;
  }>;
  dependencies: {
    production: string[];
    development: string[];
    total: number;
  };
  codeMetrics: {
    totalFiles: number;
    totalLines: number;
    fileTypes: Record<string, number>;
    largestFiles: Array<{
      path: string;
      lines: number;
    }>;
    skippedFiles: number;
  };
  architecture: {
    patterns: string[];
    entryPoints: string[];
    mainModules: string[];
  };
  summary: {
    purpose: string;
    complexity: 'low' | 'medium' | 'high';
    recommendations: string[];
  };
}

export async function analyzeProject(args: any): Promise<any> {
  // 智能参数解析，支持自然语言输入
  const parsedArgs = parseArgs<{
    project_path?: string;
    max_depth?: number;
    include_content?: boolean;
  }>(args, {
    defaultValues: {
      project_path: process.cwd(),
      max_depth: 5,
      include_content: true,
    },
    primaryField: "project_path", // 纯文本输入默认映射到 project_path 字段
    fieldAliases: {
      project_path: ["path", "dir", "directory", "路径", "项目路径"],
      max_depth: ["depth", "level", "深度", "层级"],
      include_content: ["content", "with_content", "包含内容"],
    },
  });

  const projectPath = getString(parsedArgs.project_path) || process.cwd();
  const maxDepth = getNumber(parsedArgs.max_depth, 5);
  const includeContent = getBoolean(parsedArgs.include_content, true);

  try {
    console.error(`开始分析项目: ${projectPath}`);
    const analysis = await performProjectAnalysis(projectPath, maxDepth, includeContent);
    
    return {
      content: [
        {
          type: "text",
          text: `# 📊 项目分析报告

## 🏗️ 项目概览
- **项目名称**: ${analysis.projectStructure.name}
- **项目类型**: ${analysis.projectStructure.type}
- **技术栈**: ${analysis.projectStructure.framework}
- **主要语言**: ${analysis.projectStructure.language}
- **包管理器**: ${analysis.projectStructure.packageManager}

## 📁 目录结构
\`\`\`
${analysis.directoryTree}
\`\`\`

## 🔑 关键文件
${analysis.keyFiles.map(file => 
  `### ${file.path}
**用途**: ${file.purpose}
${includeContent ? `\`\`\`${getFileExtension(file.path)}
${file.content.substring(0, 500)}${file.content.length > 500 ? '\n...' : ''}
\`\`\`` : ''}`).join('\n\n')}

## 📦 依赖分析
- **生产依赖**: ${analysis.dependencies.production.length} 个
- **开发依赖**: ${analysis.dependencies.development.length} 个
- **总依赖数**: ${analysis.dependencies.total} 个

### 主要依赖
${analysis.dependencies.production.slice(0, 10).map(dep => `- ${dep}`).join('\n')}

## 📈 代码指标
- **总文件数**: ${analysis.codeMetrics.totalFiles}
- **总行数**: ${analysis.codeMetrics.totalLines}
${analysis.codeMetrics.skippedFiles > 0 ? `- **跳过文件**: ${analysis.codeMetrics.skippedFiles} 个（过大或无法读取）` : ''}
- **文件类型分布**:
${Object.entries(analysis.codeMetrics.fileTypes)
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .slice(0, 10)
  .map(([type, count]) => `  - ${type}: ${count} 个文件`)
  .join('\n')}
${Object.keys(analysis.codeMetrics.fileTypes).length > 10 ? '  - ... (更多类型已省略)' : ''}

### 最大文件
${analysis.codeMetrics.largestFiles.slice(0, 5).map(file => 
  `- ${file.path} (${file.lines} 行)`
).join('\n')}

## 🏛️ 架构分析
- **设计模式**: ${analysis.architecture.patterns.join(', ')}
- **入口文件**: ${analysis.architecture.entryPoints.join(', ')}
- **核心模块**: ${analysis.architecture.mainModules.join(', ')}

## 📋 项目总结
**项目目的**: ${analysis.summary.purpose}
**复杂度**: ${analysis.summary.complexity}
**建议**: 
${analysis.summary.recommendations.map(rec => `- ${rec}`).join('\n')}

---
*分析完成时间: ${new Date().toLocaleString('zh-CN')}*
*分析工具: MCP Probe Kit v${VERSION}*

**分析说明**:
- 大型项目会自动采样分析，限制最多扫描 5000 个文件
- 已自动忽略以下目录: \`node_modules\`, \`dist\`, \`build\`, \`.git\`, \`coverage\`, \`.next\`, \`.nuxt\`, \`vendor\` 等
- 单个文件大小限制: 1MB，超过则跳过`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ 项目分析失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function performProjectAnalysis(
  projectPath: string, 
  maxDepth: number, 
  includeContent: boolean
): Promise<ProjectAnalysis> {
  // 读取 package.json
  const packageJson = await readPackageJson(projectPath);
  
  // 分析项目结构
  const projectStructure = analyzeProjectStructure(packageJson);
  
  // 生成目录树
  const directoryTree = generateDirectoryTree(projectPath, maxDepth);
  
  // 识别关键文件
  const keyFiles = await identifyKeyFiles(projectPath, includeContent);
  
  // 分析依赖
  const dependencies = analyzeDependencies(packageJson);
  
  // 代码指标
  const codeMetrics = await calculateCodeMetrics(projectPath);
  
  // 架构分析
  const architecture = await analyzeArchitecture(projectPath, keyFiles);
  
  // 生成总结
  const summary = generateSummary(projectStructure, codeMetrics, architecture);

  return {
    projectStructure,
    directoryTree,
    keyFiles,
    dependencies,
    codeMetrics,
    architecture,
    summary,
  };
}

async function readPackageJson(projectPath: string): Promise<any> {
  try {
    const packageJsonPath = join(projectPath, 'package.json');
    const content = readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function analyzeProjectStructure(packageJson: any) {
  const name = packageJson.name || 'unknown';
  const type = detectProjectType(packageJson);
  const framework = detectFramework(packageJson);
  const language = detectLanguage(packageJson);
  const packageManager = detectPackageManager();

  return { name, type, framework, language, packageManager };
}

function detectProjectType(packageJson: any): string {
  if (packageJson.dependencies?.react) return 'React 应用';
  if (packageJson.dependencies?.vue) return 'Vue 应用';
  if (packageJson.dependencies?.angular) return 'Angular 应用';
  if (packageJson.dependencies?.express) return 'Node.js 后端';
  if (packageJson.dependencies?.next) return 'Next.js 应用';
  if (packageJson.dependencies?.nuxt) return 'Nuxt.js 应用';
  if (packageJson.dependencies?.svelte) return 'Svelte 应用';
  if (packageJson.dependencies?.electron) return 'Electron 应用';
  if (packageJson.dependencies?.jest || packageJson.devDependencies?.jest) return '测试项目';
  if (packageJson.dependencies?.webpack || packageJson.devDependencies?.webpack) return '构建工具';
  return '通用项目';
}

function detectFramework(packageJson: any): string {
  const frameworks = [];
  if (packageJson.dependencies?.react) frameworks.push('React');
  if (packageJson.dependencies?.vue) frameworks.push('Vue');
  if (packageJson.dependencies?.angular) frameworks.push('Angular');
  if (packageJson.dependencies?.express) frameworks.push('Express');
  if (packageJson.dependencies?.next) frameworks.push('Next.js');
  if (packageJson.dependencies?.nuxt) frameworks.push('Nuxt.js');
  if (packageJson.dependencies?.svelte) frameworks.push('Svelte');
  if (packageJson.dependencies?.electron) frameworks.push('Electron');
  return frameworks.join(', ') || '无框架';
}

function detectLanguage(packageJson: any): string {
  if (packageJson.devDependencies?.typescript) return 'TypeScript';
  if (packageJson.dependencies?.typescript) return 'TypeScript';
  return 'JavaScript';
}

function detectPackageManager(): string {
  if (existsSync('yarn.lock')) return 'Yarn';
  if (existsSync('pnpm-lock.yaml')) return 'pnpm';
  return 'npm';
}

function generateDirectoryTree(projectPath: string, maxDepth: number): string {
  const ignoreDirs = [
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 
    'coverage', '.vscode', '.idea', 'tmp', 'temp', 'out', 
    'vendor', '__pycache__', '.cache', '.parcel-cache',
    'bower_components', 'jspm_packages'
  ];
  const MAX_ITEMS_PER_DIR = 50; // 每个目录最多显示50项
  
  function buildTree(dir: string, prefix: string = '', depth: number = 0): string {
    if (depth >= maxDepth) return '';
    
    try {
      let items = readdirSync(dir)
        .filter(item => !ignoreDirs.includes(item) && !item.startsWith('.'))
        .map(item => {
          const fullPath = join(dir, item);
          try {
            const stat = statSync(fullPath);
            return { name: item, isDir: stat.isDirectory(), path: fullPath };
          } catch {
            return null;
          }
        })
        .filter(item => item !== null) as Array<{ name: string; isDir: boolean; path: string }>;
      
      // 限制每个目录显示的项目数量
      const hasMore = items.length > MAX_ITEMS_PER_DIR;
      items = items.slice(0, MAX_ITEMS_PER_DIR);
      
      items.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

      let result = '';
      items.forEach((item, index) => {
        const isLast = index === items.length - 1 && !hasMore;
        const currentPrefix = isLast ? '└── ' : '├── ';
        const nextPrefix = isLast ? '    ' : '│   ';
        
        result += `${prefix}${currentPrefix}${item.name}\n`;
        
        if (item.isDir) {
          result += buildTree(item.path, prefix + nextPrefix, depth + 1);
        }
      });
      
      if (hasMore) {
        result += `${prefix}└── ... (更多项目被省略)\n`;
      }
      
      return result;
    } catch {
      return '';
    }
  }
  
  return buildTree(projectPath);
}

async function identifyKeyFiles(projectPath: string, includeContent: boolean) {
  const keyFilePatterns = [
    'package.json', 'README.md', 'index.js', 'index.ts', 'main.js', 'main.ts',
    'app.js', 'app.ts', 'server.js', 'server.ts', 'config.js', 'config.ts',
    'webpack.config.js', 'vite.config.js', 'next.config.js', 'nuxt.config.js',
    'tsconfig.json', 'babel.config.js', '.env', '.env.example'
  ];
  
  const MAX_FILE_SIZE = 100 * 1024; // 100KB
  const MAX_CONTENT_LINES = 100; // 最多显示100行
  const keyFiles = [];
  
  for (const pattern of keyFilePatterns) {
    try {
      const filePath = join(projectPath, pattern);
      const stat = statSync(filePath);
      
      // 跳过过大的文件
      if (stat.size > MAX_FILE_SIZE) {
        keyFiles.push({
          path: pattern,
          purpose: getFilePurpose(pattern, ''),
          content: includeContent ? `[文件过大 (${Math.round(stat.size / 1024)}KB)，已跳过]` : ''
        });
        continue;
      }
      
      let content = readFileSync(filePath, 'utf-8');
      const purpose = getFilePurpose(pattern, content);
      
      // 限制内容行数
      if (includeContent && content) {
        const lines = content.split('\n');
        if (lines.length > MAX_CONTENT_LINES) {
          content = lines.slice(0, MAX_CONTENT_LINES).join('\n') + `\n... (省略 ${lines.length - MAX_CONTENT_LINES} 行)`;
        }
      }
      
      keyFiles.push({
        path: pattern,
        purpose,
        content: includeContent ? content : ''
      });
    } catch {
      // 文件不存在，跳过
    }
  }
  
  return keyFiles;
}

function getFilePurpose(filename: string, content: string): string {
  const purposes: Record<string, string> = {
    'package.json': '项目配置和依赖管理',
    'README.md': '项目说明文档',
    'index.js': '项目入口文件',
    'index.ts': 'TypeScript 项目入口文件',
    'main.js': '主程序文件',
    'main.ts': 'TypeScript 主程序文件',
    'app.js': '应用程序主文件',
    'app.ts': 'TypeScript 应用程序主文件',
    'server.js': '服务器文件',
    'server.ts': 'TypeScript 服务器文件',
    'config.js': '配置文件',
    'config.ts': 'TypeScript 配置文件',
    'webpack.config.js': 'Webpack 构建配置',
    'vite.config.js': 'Vite 构建配置',
    'next.config.js': 'Next.js 配置',
    'nuxt.config.js': 'Nuxt.js 配置',
    'tsconfig.json': 'TypeScript 配置',
    'babel.config.js': 'Babel 配置',
    '.env': '环境变量配置',
    '.env.example': '环境变量示例'
  };
  
  return purposes[filename] || '配置文件';
}

function analyzeDependencies(packageJson: any) {
  const production = Object.keys(packageJson.dependencies || {});
  const development = Object.keys(packageJson.devDependencies || {});
  
  return {
    production,
    development,
    total: production.length + development.length
  };
}

async function calculateCodeMetrics(projectPath: string) {
  const fileTypes: Record<string, number> = {};
  const largestFiles: Array<{ path: string; lines: number }> = [];
  const MAX_FILES_TO_SCAN = 5000; // 最多扫描5000个文件
  const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
  const SAMPLE_LARGE_PROJECTS = true; // 大项目采样
  
  let totalFiles = 0;
  let totalLines = 0;
  let skippedFiles = 0;
  let scannedFiles = 0;
  
  function scanDirectory(dir: string) {
    // 达到文件数量限制
    if (scannedFiles >= MAX_FILES_TO_SCAN) {
      return;
    }
    
    try {
      const items = readdirSync(dir);
      
      for (const item of items) {
        if (scannedFiles >= MAX_FILES_TO_SCAN) break;
        
        const fullPath = join(dir, item);
        let stat;
        
        try {
          stat = statSync(fullPath);
        } catch {
          continue;
        }
        
        if (stat.isDirectory()) {
          const ignoreDirs = [
            'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 
            'coverage', '.vscode', '.idea', 'tmp', 'temp', 'out', 
            'vendor', '__pycache__', '.cache', '.parcel-cache',
            'bower_components', 'jspm_packages', 'target', 'bin', 'obj'
          ];
          if (!ignoreDirs.includes(item) && !item.startsWith('.')) {
            scanDirectory(fullPath);
          }
        } else {
          const ext = extname(item);
          const fileType = ext || 'no-extension';
          
          fileTypes[fileType] = (fileTypes[fileType] || 0) + 1;
          totalFiles++;
          scannedFiles++;
          
          // 跳过过大的文件
          if (stat.size > MAX_FILE_SIZE) {
            skippedFiles++;
            continue;
          }
          
          try {
            // 只读取文本文件
            const textExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.java', '.go', '.rs', '.php', '.rb', '.cpp', '.c', '.h', '.cs', '.swift', '.kt'];
            if (textExtensions.includes(ext.toLowerCase())) {
              const content = readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n').length;
              totalLines += lines;
              
              // 只保存相对路径
              const relativePath = fullPath.replace(projectPath, '').replace(/\\/g, '/');
              largestFiles.push({ path: relativePath, lines });
            }
          } catch {
            // 忽略无法读取的文件（二进制文件等）
            skippedFiles++;
          }
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }
  
  console.error('开始扫描代码文件...');
  console.error('忽略目录: node_modules, dist, build, .git 等');
  scanDirectory(projectPath);
  console.error(`扫描完成: ${totalFiles} 个文件, ${skippedFiles} 个跳过`);
  
  // 按行数排序，取前10个
  largestFiles.sort((a, b) => b.lines - a.lines);
  
  return {
    totalFiles,
    totalLines,
    fileTypes,
    largestFiles: largestFiles.slice(0, 10),
    skippedFiles
  };
}

async function analyzeArchitecture(projectPath: string, keyFiles: any[]) {
  const patterns: string[] = [];
  const entryPoints: string[] = [];
  const mainModules: string[] = [];
  
  // 分析入口文件
  keyFiles.forEach(file => {
    if (file.path.includes('index') || file.path.includes('main') || file.path.includes('app')) {
      entryPoints.push(file.path);
    }
  });
  
  // 检测设计模式
  if (keyFiles.some(f => f.path.includes('component'))) patterns.push('组件化');
  if (keyFiles.some(f => f.path.includes('service'))) patterns.push('服务层');
  if (keyFiles.some(f => f.path.includes('controller'))) patterns.push('MVC');
  if (keyFiles.some(f => f.path.includes('middleware'))) patterns.push('中间件');
  if (keyFiles.some(f => f.path.includes('hook'))) patterns.push('Hooks');
  if (keyFiles.some(f => f.path.includes('store'))) patterns.push('状态管理');
  
  // 识别核心模块
  const srcDir = join(projectPath, 'src');
  try {
    const srcItems = readdirSync(srcDir);
    mainModules.push(...srcItems.filter(item => 
      statSync(join(srcDir, item)).isDirectory()
    ));
  } catch {
    // src 目录不存在
  }
  
  return { patterns, entryPoints, mainModules };
}

function generateSummary(
  projectStructure: any, 
  codeMetrics: any, 
  architecture: any
) {
  let complexity: 'low' | 'medium' | 'high' = 'low';
  
  if (codeMetrics.totalFiles > 100 || codeMetrics.totalLines > 10000) {
    complexity = 'high';
  } else if (codeMetrics.totalFiles > 20 || codeMetrics.totalLines > 1000) {
    complexity = 'medium';
  }
  
  const purpose = `${projectStructure.type}，使用 ${projectStructure.framework} 框架，主要语言为 ${projectStructure.language}`;
  
  const recommendations: string[] = [];
  
  if (codeMetrics.totalFiles > 50) {
    recommendations.push('考虑模块化重构，减少文件数量');
  }
  
  if (codeMetrics.largestFiles[0]?.lines > 500) {
    recommendations.push('拆分大文件，提高代码可维护性');
  }
  
  if (architecture.patterns.length === 0) {
    recommendations.push('引入设计模式，提高代码组织性');
  }
  
  if (!architecture.entryPoints.length) {
    recommendations.push('明确项目入口文件');
  }
  
  return { purpose, complexity, recommendations };
}

function getFileExtension(filename: string): string {
  const ext = extname(filename).slice(1);
  const extMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'jsx',
    'tsx': 'tsx',
    'vue': 'vue',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'php': 'php',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'txt': 'text',
    'sql': 'sql',
    'sh': 'bash',
    'bat': 'batch',
    'ps1': 'powershell'
  };
  
  return extMap[ext] || ext || 'text';
}
