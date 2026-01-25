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

/**
 * 获取 npm 包的最新版本号
 */
async function getLatestVersion(packageName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const pkg = JSON.parse(data);
          resolve(pkg.version);
        } catch (error) {
          reject(new Error(`Failed to parse package metadata: ${error}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Failed to fetch package metadata: ${error}`));
    });
  });
}

/**
 * 下载文件
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        if (res.headers.location) {
          downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
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
        fileStream.close();
        resolve();
      });
      
      fileStream.on('error', (error) => {
        fs.unlinkSync(outputPath);
        reject(error);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 解压 tarball 并提取指定目录
 */
async function extractTarball(
  tarballPath: string,
  extractPath: string,
  targetDir: string
): Promise<string> {
  const tempDir = path.join(extractPath, '.temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  await tar.extract({
    file: tarballPath,
    cwd: tempDir,
  });
  
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
 * 处理数据文件
 */
async function processDataFiles(
  sourceDir: string,
  outputDir: string,
  verbose: boolean
): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const files = fs.readdirSync(sourceDir);
  
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      const subOutputDir = path.join(outputDir, file);
      await processDataFiles(sourcePath, subOutputDir, verbose);
      continue;
    }
    
    if (!file.endsWith('.csv')) {
      continue;
    }
    
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
    const outputPath = path.join(outputDir, outputFile);
    
    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    
    if (verbose) {
      console.log(`  → ${outputFile} (${jsonData.length} records)`);
    }
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
export async function syncUIDataTo(outputDir: string, verbose: boolean = false): Promise<void> {
  const packageName = 'uipro-cli';
  
  if (verbose) {
    console.log('🚀 Starting UI/UX data sync...\n');
  }
  
  try {
    // 1. 获取最新版本
    if (verbose) {
      console.log(`Fetching latest version of ${packageName}...`);
    }
    const latestVersion = await getLatestVersion(packageName);
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
    await downloadFile(tarballUrl, tarballPath);
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
      'package/assets/data'
    );
    if (verbose) {
      console.log('✓ Extracted data files\n');
    }
    
    // 4. 处理数据文件
    if (verbose) {
      console.log('Processing data files...');
    }
    await processDataFiles(extractedDataDir, outputDir, verbose);
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
    if (verbose) {
      console.log('✓ Written metadata\n');
    }
    
    // 6. 清理临时文件
    cleanup(tempDir);
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
export async function syncUIDataToCache(force: boolean = false, verbose: boolean = false): Promise<void> {
  const cacheDir = path.join(os.homedir(), '.mcp-probe-kit', 'ui-ux-data');
  await syncUIDataTo(cacheDir, verbose);
}
