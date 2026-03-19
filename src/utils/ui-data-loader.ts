/**
 * UI/UX 数据加载器
 *
 * 三层数据策略：
 * 1. 内嵌数据（构建时同步）
 * 2. 缓存数据（运行时更新）
 * 3. 自动后台同步（当前会话不热切换，下次启动生效）
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CacheManager } from './cache-manager.js';
import { UISearchEngine, UIDataset } from './ui-search-engine.js';
import { syncUIDataToCache } from './ui-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTO_SYNC_FAILURE_COOLDOWN_MS = 30 * 60 * 1000;

export interface DataLoaderOptions {
  useCache?: boolean;
  autoUpdate?: boolean;
}

export interface UIDataSessionInfo {
  source: 'cache' | 'embedded';
  activeVersion?: string;
  pendingVersion?: string;
  lastCheckedAt?: string;
  hasPendingUpdate: boolean;
}

/**
 * UI/UX 数据加载器
 */
export class UIDataLoader {
  private cacheManager: CacheManager;
  private searchEngine: UISearchEngine;
  private useCache: boolean;
  private autoUpdate: boolean;
  private loaded: boolean = false;
  private autoSyncRunning: boolean = false;
  private autoSyncFailureUntil: number = 0;
  private sessionInfo: UIDataSessionInfo = {
    source: 'embedded',
    hasPendingUpdate: false,
  };

  constructor(options: DataLoaderOptions = {}) {
    this.useCache = options.useCache ?? true;
    this.autoUpdate = options.autoUpdate ?? true;
    this.cacheManager = new CacheManager({
      autoUpdate: this.autoUpdate,
    });
    this.searchEngine = new UISearchEngine();
  }

  /**
   * 加载数据
   */
  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    // 尝试从缓存加载
    if (this.useCache && this.cacheManager.hasCache()) {
      try {
        await this.loadFromCache();
        const metadata = this.cacheManager.getMetadata();
        this.sessionInfo = {
          source: 'cache',
          activeVersion: metadata?.version,
          hasPendingUpdate: false,
        };
        this.loaded = true;
      } catch (error) {
        console.error('Failed to load from cache, falling back to embedded data:', error);
      }
    }

    if (!this.loaded) {
      // 从内嵌数据加载
      await this.loadFromEmbedded();
      this.sessionInfo = {
        source: 'embedded',
        activeVersion: this.readEmbeddedVersion(),
        hasPendingUpdate: false,
      };
      this.loaded = true;
    }

    // 后台自动检查并下载更新，当前会话保持版本锁定
    void this.checkUpdateInBackground();
  }

  /**
   * 从缓存加载数据
   */
  private async loadFromCache(): Promise<void> {
    const files = this.cacheManager.listFiles();
    const datasets: UIDataset[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const data = this.cacheManager.readFile(file);
      if (!data || !Array.isArray(data)) {
        continue;
      }

      // 提取类别名称
      const category = this.extractCategory(file);

      datasets.push({
        category,
        data,
      });
    }

    this.searchEngine.loadDatasets(datasets);
  }

  /**
   * 从内嵌数据加载
   */
  private async loadFromEmbedded(): Promise<void> {
    const dataDir = path.join(__dirname, '..', 'resources', 'ui-ux-data');

    if (!fs.existsSync(dataDir)) {
      throw new Error('Embedded UI/UX data not found. Please run "npm run sync-ui-data" first.');
    }

    const datasets: UIDataset[] = [];

    const walk = (dir: string, prefix: string = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          walk(fullPath, relativePath);
        } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'metadata.json') {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const data = JSON.parse(content);

            if (Array.isArray(data)) {
              const category = this.extractCategory(relativePath);
              datasets.push({ category, data });
            }
          } catch (error) {
            console.error(`Failed to load ${relativePath}:`, error);
          }
        }
      }
    };

    walk(dataDir);

    this.searchEngine.loadDatasets(datasets);
  }

  private readEmbeddedVersion(): string | undefined {
    try {
      const metadataPath = path.join(__dirname, '..', 'resources', 'ui-ux-data', 'metadata.json');
      if (!fs.existsSync(metadataPath)) {
        return undefined;
      }

      const content = fs.readFileSync(metadataPath, 'utf-8');
      const metadata = JSON.parse(content) as { version?: string };
      return metadata.version;
    } catch {
      return undefined;
    }
  }

  /**
   * 提取类别名称
   */
  private extractCategory(filename: string): string {
    // 移除扩展名
    let category = filename.replace(/\.json$/, '');

    // 处理子目录（如 stacks/react.json -> react）
    if (category.includes('/')) {
      const parts = category.split('/');
      category = parts[parts.length - 1];
    }

    return category;
  }

  /**
   * 后台检查更新
   */
  private async checkUpdateInBackground(): Promise<void> {
    if (!this.autoUpdate) {
      return;
    }
    if (this.autoSyncRunning) {
      return;
    }
    if (Date.now() < this.autoSyncFailureUntil) {
      return;
    }

    this.autoSyncRunning = true;
    try {
      const updateInfo = await this.cacheManager.checkUpdate();
      this.sessionInfo.lastCheckedAt = new Date().toISOString();

      if (updateInfo.hasUpdate) {
        const current = updateInfo.currentVersion || this.sessionInfo.activeVersion || 'none';
        console.log(`UI/UX data update available: ${current} -> ${updateInfo.latestVersion}`);
        await syncUIDataToCache(false, false);
        this.sessionInfo.pendingVersion = updateInfo.latestVersion;
        this.sessionInfo.hasPendingUpdate = true;
        console.log(`UI/UX data ${updateInfo.latestVersion} downloaded. It will apply on next restart.`);
      }
    } catch (error) {
      this.autoSyncFailureUntil = Date.now() + AUTO_SYNC_FAILURE_COOLDOWN_MS;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`UI/UX background sync skipped: ${message}`);
    } finally {
      this.autoSyncRunning = false;
    }
  }

  /**
   * 获取搜索引擎
   */
  getSearchEngine(): UISearchEngine {
    if (!this.loaded) {
      throw new Error('Data not loaded. Call load() first.');
    }
    return this.searchEngine;
  }

  /**
   * 获取缓存管理器
   */
  getCacheManager(): CacheManager {
    return this.cacheManager;
  }

  /**
   * 获取当前会话的数据状态
   */
  getSessionInfo(): UIDataSessionInfo {
    return { ...this.sessionInfo };
  }

  /**
   * 重新加载数据（手动触发时使用）
   */
  async reload(): Promise<void> {
    this.searchEngine.clear();
    this.loaded = false;
    await this.load();
  }
}
