/**
 * UI/UX 数据加载器
 * 
 * 三层数据策略：
 * 1. 内嵌数据（构建时同步）
 * 2. 缓存数据（运行时更新）
 * 3. 手动同步（用户触发）
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CacheManager } from './cache-manager.js';
import { UISearchEngine, UIDataset } from './ui-search-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DataLoaderOptions {
  useCache?: boolean;
  autoUpdate?: boolean;
}

/**
 * UI/UX 数据加载器
 */
export class UIDataLoader {
  private cacheManager: CacheManager;
  private searchEngine: UISearchEngine;
  private useCache: boolean;
  private loaded: boolean = false;
  
  constructor(options: DataLoaderOptions = {}) {
    this.useCache = options.useCache ?? true;
    this.cacheManager = new CacheManager({
      autoUpdate: options.autoUpdate ?? true,
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
        this.loaded = true;
        
        // 后台检查更新
        this.checkUpdateInBackground();
        
        return;
      } catch (error) {
        console.error('Failed to load from cache, falling back to embedded data:', error);
      }
    }
    
    // 从内嵌数据加载
    await this.loadFromEmbedded();
    this.loaded = true;
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
    try {
      const updateInfo = await this.cacheManager.checkUpdate();
      
      if (updateInfo.hasUpdate) {
        console.log(`UI/UX data update available: ${updateInfo.currentVersion || 'none'} -> ${updateInfo.latestVersion}`);
        console.log('Run "npm run sync-ui-data" to update.');
      }
    } catch (error) {
      // 静默失败，不影响主流程
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
   * 重新加载数据
   */
  async reload(): Promise<void> {
    this.searchEngine.clear();
    this.loaded = false;
    await this.load();
  }
}
