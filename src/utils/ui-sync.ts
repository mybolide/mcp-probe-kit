/**
 * UI/UX 数据同步工具
 *
 * 多源同步：
 * - uipro-cli（设计词典）
 * - shadcn/ui registry（blocks + components 索引）
 * - ui-themes（shadcn 兼容 CSS 变量主题预设）
 * - Vercel Web Interface Guidelines（可搜索规范条文）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as tar from 'tar';
import { createWriteStream } from 'fs';
import { parse as parseCSV } from 'csv-parse/sync';
import { readUISyncMetadata, writeUISyncMetadata, type UISyncMetadata } from './ui-metadata.js';
import {
  computeRegistryChecksum,
  fetchShadcnRegistry,
  syncShadcnTo,
} from './shadcn-sync.js';
import { computeThemesChecksum, syncThemesTo } from './themes-sync.js';
import { getVercelGuidelinesChecksum, syncVercelGuidelinesTo } from './vercel-guidelines-sync.js';

export interface SyncRuntimeOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, message: string) => Promise<void> | void;
  force?: boolean;
}

export interface UISourceUpdateStatus {
  current?: string;
  latest: string;
  upToDate: boolean;
}

export interface UIUpdateCheckResult {
  hasUpdate: boolean;
  uipro: UISourceUpdateStatus;
  shadcn: UISourceUpdateStatus;
  themes: UISourceUpdateStatus;
  vercel: UISourceUpdateStatus;
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

async function getLatestVersion(packageName: string, signal?: AbortSignal): Promise<string> {
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

async function downloadFile(url: string, outputPath: string, signal?: AbortSignal): Promise<void> {
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
    fs.writeFileSync(outputPath, `${JSON.stringify(jsonData, null, 2)}\n`, 'utf-8');

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

function cleanup(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function checkUISourcesUpdate(
  outputDir: string,
  signal?: AbortSignal
): Promise<UIUpdateCheckResult> {
  const existing = readUISyncMetadata(outputDir);
  const latestUipro = await getLatestVersion('uipro-cli', signal);
  const registry = await fetchShadcnRegistry(signal);
  const latestShadcn = computeRegistryChecksum(registry);

  const uiproCurrent = existing?.sources['uipro-cli']?.version || existing?.version;
  const shadcnCurrent = existing?.sources.shadcn?.checksum || existing?.sources.shadcn?.version;
  const themesCurrent = existing?.sources.themes?.checksum || existing?.sources.themes?.version;
  const vercelCurrent = existing?.sources.vercel?.checksum || existing?.sources.vercel?.version;

  const latestThemes = computeThemesChecksum();
  const latestVercel = await getVercelGuidelinesChecksum(signal);

  const uiproUpToDate = uiproCurrent === latestUipro;
  const shadcnUpToDate = shadcnCurrent === latestShadcn;
  const themesUpToDate = themesCurrent === latestThemes;
  const vercelUpToDate = vercelCurrent === latestVercel;

  return {
    hasUpdate: !uiproUpToDate || !shadcnUpToDate || !themesUpToDate || !vercelUpToDate,
    uipro: {
      current: uiproCurrent,
      latest: latestUipro,
      upToDate: uiproUpToDate,
    },
    shadcn: {
      current: shadcnCurrent,
      latest: latestShadcn,
      upToDate: shadcnUpToDate,
    },
    themes: {
      current: themesCurrent,
      latest: latestThemes,
      upToDate: themesUpToDate,
    },
    vercel: {
      current: vercelCurrent,
      latest: latestVercel,
      upToDate: vercelUpToDate,
    },
  };
}

async function syncUiproPackage(
  outputDir: string,
  latestVersion: string,
  verbose: boolean,
  options?: SyncRuntimeOptions
): Promise<{ version: string; syncedAt: string }> {
  const packageName = 'uipro-cli';
  const tarballUrl = `https://registry.npmjs.org/${packageName}/-/${packageName}-${latestVersion}.tgz`;
  const tempDir = path.join(os.tmpdir(), '.mcp-ui-sync');
  const tarballPath = path.join(tempDir, 'package.tgz');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  if (verbose) {
    console.log('Downloading uipro-cli tarball...');
  }
  await downloadFile(tarballUrl, tarballPath, options?.signal);
  await emitProgress(options, 40, 'Downloaded uipro-cli tarball');

  const extractedDataDir = await extractTarball(
    tarballPath,
    tempDir,
    'package/assets/data',
    options?.signal
  );
  await emitProgress(options, 50, 'Extracted uipro-cli data');

  await processDataFiles(extractedDataDir, outputDir, verbose, {
    signal: options?.signal,
    onProgress: async (progress, message) => {
      const normalized = 50 + Math.round(progress * 0.25);
      await emitProgress(options, normalized, message);
    },
  });

  cleanup(tempDir);

  return {
    version: latestVersion,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * 同步 UI/UX 数据到指定目录（通用函数）
 */
export async function syncUIDataTo(
  outputDir: string,
  verbose: boolean = false,
  options?: SyncRuntimeOptions
): Promise<{ skipped: boolean; metadata: UISyncMetadata }> {
  const force = options?.force ?? false;
  throwIfAborted(options?.signal, 'Sync cancelled before start');
  await emitProgress(options, 5, 'Initializing sync');

  if (verbose) {
    console.log('🚀 Starting UI/UX data sync...\n');
  }

  const existing = readUISyncMetadata(outputDir);
  const updateCheck = await checkUISourcesUpdate(outputDir, options?.signal);
  await emitProgress(options, 15, 'Checked upstream versions');

  if (!force && !updateCheck.hasUpdate && existing) {
    await emitProgress(options, 100, 'All UI sources up to date');
    if (verbose) {
      console.log('✅ All UI sources up to date, skipping sync.');
      console.log(`   uipro-cli: ${updateCheck.uipro.latest}`);
      console.log(`   shadcn: ${updateCheck.shadcn.latest}`);
      console.log(`   themes: ${updateCheck.themes.latest}`);
      console.log(`   vercel: ${updateCheck.vercel.latest}`);
    }
    return { skipped: true, metadata: existing };
  }

  const sources: UISyncMetadata['sources'] = {
    ...(existing?.sources || {}),
  };

  try {
    if (force || !updateCheck.uipro.upToDate) {
      if (verbose) {
        console.log(`Syncing uipro-cli ${updateCheck.uipro.latest}...`);
      }
      const uiproMeta = await syncUiproPackage(
        outputDir,
        updateCheck.uipro.latest,
        verbose,
        options
      );
      sources['uipro-cli'] = {
        version: uiproMeta.version,
        syncedAt: uiproMeta.syncedAt,
      };
    }

    await emitProgress(options, 78, 'Syncing shadcn/ui registry');
    const shadcnResult = await syncShadcnTo(outputDir, {
      signal: options?.signal,
      force,
      existingChecksum: updateCheck.shadcn.current,
    });
    if (shadcnResult) {
      sources.shadcn = shadcnResult.metadata;
      if (verbose) {
        console.log(
          `✓ shadcn registry synced (${shadcnResult.blocks} blocks, ${shadcnResult.components} components)`
        );
      }
    } else if (verbose) {
      console.log('✓ shadcn registry unchanged');
    }

    await emitProgress(options, 85, 'Syncing UI theme presets');
    const themesResult = syncThemesTo(outputDir, {
      force,
      existingChecksum: updateCheck.themes.current,
    });
    if (themesResult) {
      sources.themes = themesResult.metadata;
      if (verbose) {
        console.log(`✓ UI themes synced (${themesResult.count} presets)`);
      }
    } else if (verbose) {
      console.log('✓ UI themes unchanged');
    }

    await emitProgress(options, 92, 'Syncing Vercel Web Interface Guidelines');
    const vercelResult = await syncVercelGuidelinesTo(outputDir, {
      signal: options?.signal,
      force,
      existingChecksum: updateCheck.vercel.current,
    });
    if (vercelResult) {
      sources.vercel = vercelResult.metadata;
      if (verbose) {
        console.log(`✓ Vercel guidelines synced (${vercelResult.count} rules)`);
      }
    } else if (verbose) {
      console.log('✓ Vercel guidelines unchanged');
    }

    const metadata: UISyncMetadata = {
      version: sources['uipro-cli']?.version || updateCheck.uipro.latest,
      syncedAt: new Date().toISOString(),
      source: 'uipro-cli',
      format: 'json',
      sources,
    };
    writeUISyncMetadata(outputDir, metadata);
    await emitProgress(options, 100, 'Sync completed');

    if (verbose) {
      console.log('\n✅ Sync completed successfully!');
      console.log(`   uipro-cli: ${metadata.sources['uipro-cli']?.version}`);
      console.log(
        `   shadcn: ${metadata.sources.shadcn?.blocks || 0} blocks, ${metadata.sources.shadcn?.components || 0} components`
      );
      console.log(`   themes: ${sources.themes?.version || 'n/a'} (${sources.themes?.checksum?.slice(0, 8) || '—'})`);
      console.log(`   vercel: ${sources.vercel?.checksum?.slice(0, 8) || 'n/a'} rules checksum`);
      console.log(`   Output: ${outputDir}`);
    }

    return { skipped: false, metadata };
  } catch (error) {
    cleanup(path.join(os.tmpdir(), '.mcp-ui-sync'));
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
  await syncUIDataTo(cacheDir, verbose, { ...options, force });
}
