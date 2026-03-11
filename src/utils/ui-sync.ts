/**
 * UI/UX 数据同步工具
 * 
 * 从 npm 包 uipro-cli 同步数据到缓存目录
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as tar from 'tar';
import { createWriteStream } from 'fs';
import { parse as parseCSV } from 'csv-parse/sync';

interface PackageMetadata {
  version: string;
  syncedAt: string;
  source: string;
  format: 'csv' | 'json';
}

export interface SyncRuntimeOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, message: string) => Promise<void> | void;
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (!signal?.aborted) {
    return;
  }
  const err = new Error(message);
  err.name = 'AbortError';
  throw err;
}

async function emitProgress(
  options: SyncRuntimeOptions | undefined,
  progress: number,
  message: string
): Promise<void> {
  if (!options?.onProgress) {
    return;
  }
  await options.onProgress(progress, message);
}

/**
 * 获取 npm 包的最新版本号
 */
async function getLatestVersion(
  packageName: string,
  signal?: AbortSignal
): Promise<string> {
  throwIfAborted(signal, 'Sync cancelled before fetching latest version');

  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    const req = https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        if (signal?.aborted) {
          req.destroy(new Error('Sync cancelled while reading package metadata'));
          return;
        }
        data += chunk;
      });

      res.on('end', () => {
        try {
          throwIfAborted(signal, 'Sync cancelled after reading package metadata');
          const pkg = JSON.parse(data);
          resolve(pkg.version);
        } catch (error) {
          reject(new Error(`Failed to parse package metadata: ${error}`));
        }
      });
    });

    const onAbort = () => req.destroy(new Error('Sync cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });

    req.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        const abortError = new Error('Sync cancelled');
        abortError.name = 'AbortError';
        reject(abortError);
        return;
      }
      reject(new Error(`Failed to fetch package metadata: ${error}`));
    });

    req.on('close', () => {
      signal?.removeEventListener('abort', onAbort);
    });
  });
}

/**
 * 下载文件
 */
async function downloadFile(
  url: string,
  outputPath: string,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal, 'Sync cancelled before download');

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        if (res.headers.location) {
          downloadFile(res.headers.location, outputPath, signal).then(resolve).catch(reject);
          return;
        }
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
        return;
      }
      
      const fileStream = createWriteStream(outputPath);
      res.pipe(fileStream);
      
      fileStream.on('finish', () => {
        throwIfAborted(signal, 'Sync cancelled during download');
        fileStream.close();
        resolve();
      });
      
      fileStream.on('error', (error) => {
        fs.unlinkSync(outputPath);
        reject(error);
      });
    });

    const onAbort = () => req.destroy(new Error('Sync cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });

    req.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch {
          // ignore cleanup error
        }
        const abortError = new Error('Sync cancelled');
        abortError.name = 'AbortError';
        reject(abortError);
        return;
      }
      reject(error);
    });

    req.on('close', () => {
      signal?.removeEventListener('abort', onAbort);
    });
  });
}

/**
 * 解压 tarball 并提取指定目录
 */
async function extractTarball(
  tarballPath: string,
  extractPath: string,
  targetDir: string,
  signal?: AbortSignal
): Promise<string> {
  throwIfAborted(signal, 'Sync cancelled before extract');

  const tempDir = path.join(extractPath, '.temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  await tar.extract({
    file: tarballPath,
    cwd: tempDir,
  });

  throwIfAborted(signal, 'Sync cancelled after extract');
  
  const sourceDir = path.join(tempDir, targetDir);
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Target directory not found in tarball: ${targetDir}`);
  }
  
  return sourceDir;
}

/**
 * 转换 CSV 到 JSON
 */
function convertCSVToJSON(csvContent: string, filename: string): any[] {
  try {
    const records = parseCSV(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
      escape: '\\',
      quote: '"',
      skip_records_with_error: true,
    });
    return records;
  } catch (error) {
    console.warn(`Warning: Failed to parse ${filename}, skipping: ${error}`);
    return [];
  }
}

/**
 * 收集目录下所有 CSV 文件（递归）
 */
function collectCsvFiles(rootDir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCsvFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.csv')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 处理数据文件
 */
async function processDataFiles(
  sourceDir: string,
  outputDir: string,
  verbose: boolean,
  options?: SyncRuntimeOptions
): Promise<void> {
  throwIfAborted(options?.signal, 'Sync cancelled before processing files');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const csvFiles = collectCsvFiles(sourceDir);
  if (csvFiles.length === 0) {
    await emitProgress(options, 100, 'No CSV files found');
    return;
  }

  for (let index = 0; index < csvFiles.length; index++) {
    throwIfAborted(options?.signal, 'Sync cancelled while processing data files');

    const sourcePath = csvFiles[index];
    const file = path.basename(sourcePath);
    
    if (verbose) {
      console.log(`Processing: ${file}`);
    }
    
    const csvContent = fs.readFileSync(sourcePath, 'utf-8');
    const jsonData = convertCSVToJSON(csvContent, file);
    
    if (jsonData.length === 0) {
      if (verbose) {
        console.log(`  ⚠️  Skipped ${file} (no valid records)`);
      }
      continue;
    }
    
    const outputFile = file.replace('.csv', '.json');
    const relativePath = path.relative(sourceDir, sourcePath);
    const relativeDir = path.dirname(relativePath);
    const outputSubDir = relativeDir === '.' ? outputDir : path.join(outputDir, relativeDir);

    if (!fs.existsSync(outputSubDir)) {
      fs.mkdirSync(outputSubDir, { recursive: true });
    }

    const outputPath = path.join(outputSubDir, outputFile);
    
    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    
    if (verbose) {
      console.log(`  → ${outputFile} (${jsonData.length} records)`);
    }

    const fileProgress = Math.round(((index + 1) / csvFiles.length) * 100);
    await emitProgress(
      options,
      fileProgress,
      `Processed ${index + 1}/${csvFiles.length}: ${relativePath}`
    );
  }
}

/**
 * 写入元数据
 */
function writeMetadata(outputDir: string, metadata: PackageMetadata): void {
  const metadataPath = path.join(outputDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * 清理临时文件
 */
function cleanup(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * 同步 UI/UX 数据到指定目录（通用函数）
 */
export async function syncUIDataTo(
  outputDir: string,
  verbose: boolean = false,
  options?: SyncRuntimeOptions
): Promise<void> {
  const packageName = 'uipro-cli';
  throwIfAborted(options?.signal, 'Sync cancelled before start');
  await emitProgress(options, 5, 'Initializing sync');
  
  if (verbose) {
    console.log('🚀 Starting UI/UX data sync...\n');
  }
  
  try {
    // 1. 获取最新版本
    if (verbose) {
      console.log(`Fetching latest version of ${packageName}...`);
    }
    const latestVersion = await getLatestVersion(packageName, options?.signal);
    await emitProgress(options, 15, `Fetched latest version: ${latestVersion}`);
    if (verbose) {
      console.log(`✓ Latest version: ${latestVersion}\n`);
    }
    
    // 2. 下载 tarball
    const tarballUrl = `https://registry.npmjs.org/${packageName}/-/${packageName}-${latestVersion}.tgz`;
    const tempDir = path.join(os.tmpdir(), '.mcp-ui-sync');
    const tarballPath = path.join(tempDir, 'package.tgz');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    if (verbose) {
      console.log(`Downloading tarball...`);
    }
    await downloadFile(tarballUrl, tarballPath, options?.signal);
    await emitProgress(options, 35, 'Downloaded package tarball');
    if (verbose) {
      console.log('✓ Downloaded tarball\n');
    }
    
    // 3. 解压并提取数据
    if (verbose) {
      console.log('Extracting data files...');
    }
    const extractedDataDir = await extractTarball(
      tarballPath,
      tempDir,
      'package/assets/data',
      options?.signal
    );
    await emitProgress(options, 50, 'Extracted package data files');
    if (verbose) {
      console.log('✓ Extracted data files\n');
    }
    
    // 4. 处理数据文件
    if (verbose) {
      console.log('Processing data files...');
    }
    await processDataFiles(extractedDataDir, outputDir, verbose, {
      signal: options?.signal,
      onProgress: async (progress, message) => {
        const normalized = 50 + Math.round(progress * 0.35);
        await emitProgress(options, normalized, message);
      },
    });
    if (verbose) {
      console.log('✓ Processed all data files\n');
    }
    
    // 5. 写入元数据
    const metadata: PackageMetadata = {
      version: latestVersion,
      syncedAt: new Date().toISOString(),
      source: packageName,
      format: 'json',
    };
    writeMetadata(outputDir, metadata);
    await emitProgress(options, 90, 'Wrote metadata');
    if (verbose) {
      console.log('✓ Written metadata\n');
    }
    
    // 6. 清理临时文件
    cleanup(tempDir);
    await emitProgress(options, 100, 'Sync completed');
    if (verbose) {
      console.log('✓ Cleaned up temporary files\n');
      console.log('✅ Sync completed successfully!');
      console.log(`   Version: ${latestVersion}`);
      console.log(`   Output: ${outputDir}`);
    }
    
  } catch (error) {
    const tempDir = path.join(os.tmpdir(), '.mcp-ui-sync');
    cleanup(tempDir);
    throw error;
  }
}

/**
 * 同步 UI/UX 数据到缓存
 */
export async function syncUIDataToCache(
  force: boolean = false,
  verbose: boolean = false,
  options?: SyncRuntimeOptions
): Promise<void> {
  const cacheDir = path.join(os.homedir(), '.mcp-probe-kit', 'ui-ux-data');
  void force;
  await syncUIDataTo(cacheDir, verbose, options);
}
