/**
 * 项目类型检测模块
 * 
 * 功能：
 * - 检测项目使用的编程语言
 * - 检测项目使用的框架
 * - 判断项目类型（后端/前端/全栈等）
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProjectDetectionResult {
  language: string;           // 'javascript', 'python', 'java', 'go', 'rust', 'cpp', 'php', 'ruby', 'csharp', 'unknown'
  category: string;           // 'backend-api', 'frontend-spa', 'fullstack', 'mobile', 'desktop', 'data-science', 'cli', 'library', 'unknown'
  framework?: string;         // 'express', 'react', 'django', 'spring-boot', etc.
  confidence: number;         // 0-100
  indicators: string[];       // 检测依据
}

interface DetectionRule {
  indicators: string[];       // 配置文件或特征文件
  frameworks: {
    [key: string]: {
      deps?: string[];        // 依赖包名
      devDeps?: string[];     // 开发依赖包名
      imports?: string[];     // import 语句
      files?: string[];       // 特征文件
      category: string;       // 项目类型
    };
  };
}

// 检测规则配置
const detectionRules: Record<string, DetectionRule> = {
  javascript: {
    indicators: ['package.json'],
    frameworks: {
      // 后端框架
      'express': { deps: ['express'], category: 'backend-api' },
      'koa': { deps: ['koa'], category: 'backend-api' },
      'fastify': { deps: ['fastify'], category: 'backend-api' },
      'nestjs': { deps: ['@nestjs/core', '@nestjs/common'], category: 'backend-api' },
      'hapi': { deps: ['@hapi/hapi'], category: 'backend-api' },
      
      // 前端框架
      'react': { deps: ['react'], category: 'frontend-spa' },
      'vue': { deps: ['vue'], category: 'frontend-spa' },
      'angular': { deps: ['@angular/core'], category: 'frontend-spa' },
      'svelte': { deps: ['svelte'], category: 'frontend-spa' },
      
      // 全栈框架
      'nextjs': { deps: ['next'], category: 'fullstack' },
      'nuxtjs': { deps: ['nuxt'], category: 'fullstack' },
      'remix': { deps: ['@remix-run/react'], category: 'fullstack' },
      'sveltekit': { deps: ['@sveltejs/kit'], category: 'fullstack' },
      
      // 移动端
      'react-native': { deps: ['react-native'], category: 'mobile' },
      'expo': { deps: ['expo'], category: 'mobile' },
      
      // 桌面端
      'electron': { deps: ['electron'], category: 'desktop' },
      'tauri': { deps: ['@tauri-apps/api'], category: 'desktop' },
      
      // MCP 服务器
      'mcp-server': { deps: ['@modelcontextprotocol/sdk'], category: 'library' }
    }
  },
  
  python: {
    indicators: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
    frameworks: {
      'django': { deps: ['Django', 'django'], category: 'backend-api' },
      'flask': { deps: ['Flask', 'flask'], category: 'backend-api' },
      'fastapi': { deps: ['fastapi'], category: 'backend-api' },
      'tornado': { deps: ['tornado'], category: 'backend-api' },
      'jupyter': { deps: ['jupyter', 'notebook'], category: 'data-science' },
      'pandas': { deps: ['pandas'], category: 'data-science' },
      'numpy': { deps: ['numpy'], category: 'data-science' },
      'click': { deps: ['click'], category: 'cli' },
      'typer': { deps: ['typer'], category: 'cli' }
    }
  },
  
  java: {
    indicators: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    frameworks: {
      'spring-boot': { deps: ['spring-boot-starter'], category: 'backend-api' },
      'spring-mvc': { deps: ['spring-webmvc'], category: 'backend-api' },
      'android': { files: ['AndroidManifest.xml'], category: 'mobile' },
      'quarkus': { deps: ['quarkus'], category: 'backend-api' },
      'micronaut': { deps: ['micronaut'], category: 'backend-api' }
    }
  },
  
  go: {
    indicators: ['go.mod'],
    frameworks: {
      'gin': { imports: ['github.com/gin-gonic/gin'], category: 'backend-api' },
      'echo': { imports: ['github.com/labstack/echo'], category: 'backend-api' },
      'fiber': { imports: ['github.com/gofiber/fiber'], category: 'backend-api' },
      'chi': { imports: ['github.com/go-chi/chi'], category: 'backend-api' },
      'cobra': { imports: ['github.com/spf13/cobra'], category: 'cli' }
    }
  },
  
  rust: {
    indicators: ['Cargo.toml'],
    frameworks: {
      'actix': { deps: ['actix-web'], category: 'backend-api' },
      'rocket': { deps: ['rocket'], category: 'backend-api' },
      'axum': { deps: ['axum'], category: 'backend-api' },
      'warp': { deps: ['warp'], category: 'backend-api' },
      'clap': { deps: ['clap'], category: 'cli' }
    }
  },
  
  cpp: {
    indicators: ['CMakeLists.txt', 'Makefile', 'meson.build'],
    frameworks: {
      'qt': { files: ['*.pro', '*.qrc'], category: 'desktop' },
      'boost': { files: ['boost'], category: 'library' }
    }
  },
  
  php: {
    indicators: ['composer.json'],
    frameworks: {
      'laravel': { deps: ['laravel/framework'], category: 'backend-api' },
      'symfony': { deps: ['symfony/symfony'], category: 'backend-api' },
      'codeigniter': { deps: ['codeigniter4/framework'], category: 'backend-api' }
    }
  },
  
  ruby: {
    indicators: ['Gemfile'],
    frameworks: {
      'rails': { deps: ['rails'], category: 'backend-api' },
      'sinatra': { deps: ['sinatra'], category: 'backend-api' }
    }
  },
  
  csharp: {
    indicators: ['*.csproj', '*.sln'],
    frameworks: {
      'aspnet-core': { files: ['Program.cs', 'Startup.cs'], category: 'backend-api' },
      'unity': { files: ['Assets', 'ProjectSettings'], category: 'desktop' }
    }
  }
};

/**
 * 检测项目类型
 */
export function detectProjectType(projectRoot: string = process.cwd()): ProjectDetectionResult {
  const indicators: string[] = [];
  let detectedLanguage = 'unknown';
  let detectedFramework: string | undefined;
  let detectedCategory = 'unknown';
  let confidence = 0;
  
  // 遍历所有语言的检测规则
  for (const [language, rule] of Object.entries(detectionRules)) {
    // 检查语言特征文件是否存在
    const languageIndicator = rule.indicators.find(indicator => {
      const filePath = path.join(projectRoot, indicator);
      return fs.existsSync(filePath);
    });
    
    if (languageIndicator) {
      detectedLanguage = language;
      indicators.push(languageIndicator);
      confidence = 50; // 基础置信度
      
      // 检测框架
      const frameworkResult = detectFramework(projectRoot, language, rule);
      if (frameworkResult) {
        detectedFramework = frameworkResult.framework;
        detectedCategory = frameworkResult.category;
        confidence = frameworkResult.confidence;
        indicators.push(...frameworkResult.indicators);
      }
      
      break; // 找到语言后停止
    }
  }
  
  // 如果没有检测到语言，尝试通过文件扩展名判断
  if (detectedLanguage === 'unknown') {
    const languageByExtension = detectLanguageByExtension(projectRoot);
    if (languageByExtension) {
      detectedLanguage = languageByExtension.language;
      confidence = languageByExtension.confidence;
      indicators.push(...languageByExtension.indicators);
    }
  }
  
  return {
    language: detectedLanguage,
    category: detectedCategory,
    framework: detectedFramework,
    confidence,
    indicators
  };
}

/**
 * 检测框架
 */
function detectFramework(
  projectRoot: string,
  language: string,
  rule: DetectionRule
): { framework: string; category: string; confidence: number; indicators: string[] } | null {
  for (const [framework, config] of Object.entries(rule.frameworks)) {
    const indicators: string[] = [];
    let matched = false;
    
    // 检查依赖
    if (config.deps) {
      const deps = getDependencies(projectRoot, language);
      if (deps && config.deps.some(dep => deps.includes(dep))) {
        matched = true;
        indicators.push(`dependency: ${config.deps.find(d => deps.includes(d))}`);
      }
    }
    
    // 检查开发依赖
    if (config.devDeps) {
      const devDeps = getDevDependencies(projectRoot, language);
      if (devDeps && config.devDeps.some(dep => devDeps.includes(dep))) {
        matched = true;
        indicators.push(`devDependency: ${config.devDeps.find(d => devDeps.includes(d))}`);
      }
    }
    
    // 检查 imports
    if (config.imports) {
      const hasImport = checkImports(projectRoot, language, config.imports);
      if (hasImport) {
        matched = true;
        indicators.push(`import: ${config.imports[0]}`);
      }
    }
    
    // 检查特征文件
    if (config.files) {
      const hasFile = config.files.some(file => {
        const filePath = path.join(projectRoot, file);
        return fs.existsSync(filePath);
      });
      if (hasFile) {
        matched = true;
        indicators.push(`file: ${config.files[0]}`);
      }
    }
    
    if (matched) {
      return {
        framework,
        category: config.category,
        confidence: 80,
        indicators
      };
    }
  }
  
  return null;
}

/**
 * 获取依赖列表
 */
function getDependencies(projectRoot: string, language: string): string[] | null {
  try {
    if (language === 'javascript') {
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return Object.keys(pkg.dependencies || {});
      }
    } else if (language === 'python') {
      const reqPath = path.join(projectRoot, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const content = fs.readFileSync(reqPath, 'utf-8');
        return content.split('\n')
          .map(line => line.trim().split(/[=<>]/)[0])
          .filter(Boolean);
      }
    } else if (language === 'rust') {
      const cargoPath = path.join(projectRoot, 'Cargo.toml');
      if (fs.existsSync(cargoPath)) {
        const content = fs.readFileSync(cargoPath, 'utf-8');
        // 简单解析 TOML（只提取依赖名）
        const deps = content.match(/\[dependencies\]([\s\S]*?)(\[|$)/)?.[1];
        if (deps) {
          return deps.split('\n')
            .map(line => line.trim().split(/\s*=/)[0])
            .filter(Boolean);
        }
      }
    } else if (language === 'go') {
      const goModPath = path.join(projectRoot, 'go.mod');
      if (fs.existsSync(goModPath)) {
        const content = fs.readFileSync(goModPath, 'utf-8');
        const requires = content.match(/require\s+\(([\s\S]*?)\)/)?.[1];
        if (requires) {
          return requires.split('\n')
            .map(line => line.trim().split(/\s+/)[0])
            .filter(Boolean);
        }
      }
    }
  } catch (error) {
    // 忽略解析错误
  }
  
  return null;
}

/**
 * 获取开发依赖列表
 */
function getDevDependencies(projectRoot: string, language: string): string[] | null {
  try {
    if (language === 'javascript') {
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return Object.keys(pkg.devDependencies || {});
      }
    }
  } catch (error) {
    // 忽略解析错误
  }
  
  return null;
}

/**
 * 检查 imports
 */
function checkImports(projectRoot: string, language: string, imports: string[]): boolean {
  // 简化实现：检查 go.mod 或主文件
  if (language === 'go') {
    const goModPath = path.join(projectRoot, 'go.mod');
    if (fs.existsSync(goModPath)) {
      const content = fs.readFileSync(goModPath, 'utf-8');
      return imports.some(imp => content.includes(imp));
    }
  }
  
  return false;
}

/**
 * 通过文件扩展名检测语言
 */
function detectLanguageByExtension(projectRoot: string): { language: string; confidence: number; indicators: string[] } | null {
  const extensionMap: Record<string, string> = {
    '.js': 'javascript',
    '.ts': 'javascript',
    '.jsx': 'javascript',
    '.tsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.c': 'cpp',
    '.php': 'php',
    '.rb': 'ruby',
    '.cs': 'csharp'
  };
  
  try {
    const srcDirs = ['src', 'lib', 'app', 'main'];
    for (const dir of srcDirs) {
      const dirPath = path.join(projectRoot, dir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const ext = path.extname(file);
          if (extensionMap[ext]) {
            return {
              language: extensionMap[ext],
              confidence: 30,
              indicators: [`file extension: ${ext}`]
            };
          }
        }
      }
    }
  } catch (error) {
    // 忽略错误
  }
  
  return null;
}
