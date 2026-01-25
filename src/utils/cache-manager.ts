/**
 * 缓存管理器
 * 
 * 管理 UI/UX 数据的缓存，支持版本检查和自动更新
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';

export interface CacheMetadata {
  version: string;
  syncedAt: string;
  source: string;
  format: 'csv' | 'json';
}

export interface CacheOptions {
  cacheDir?: string;
  packageName?: string;
  autoUpdate?: boolean;
}

/**
 * 缓存管理器
 */
export class CacheManager {
  private cacheDir: string;
  private packageName: string;
  private autoUpdate: boolean;
  
  constructor(options: CacheOptions = {}) {
    this.cacheDir = options.cacheDir || path.join(os.homedir(), '.mcp-probe-kit', 'ui-ux-data');
    this.packageName = options.packageName || 'uipro-cli';
    this.autoUpdate = options.autoUpdate ?? true;
    
    this.ensureCacheDir();
  }
  
  /**
   * 确保缓存目录存在
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }
  
  /**
   * 获取缓存元数据
   */
  getMetadata(): CacheMetadata | null {
    const metadataPath = path.join(this.cacheDir, 'metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read cache metadata:', error);
      return null;
    }
  }
  
  /**
   * 检查缓存是否存在
   */
  hasCache(): boolean {
    return this.getMetadata() !== null;
  }
  
  /**
   * 获取 npm 包的最新版本
   */
  async getLatestVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `https://registry.npmjs.org/${this.packageName}/latest`;
      
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
   * 检查是否有更新
   */
  async checkUpdate(): Promise<{ hasUpdate: boolean; currentVersion?: string; latestVersion: string }> {
    const metadata = this.getMetadata();
    const latestVersion = await this.getLatestVersion();
    
    if (!metadata) {
      return {
        hasUpdate: true,
        latestVersion,
      };
    }
    
    return {
      hasUpdate: metadata.version !== latestVersion,
      currentVersion: metadata.version,
      latestVersion,
    };
  }
  
  /**
   * 读取缓存文件
   */
  readFile(filename: string): any {
    const filePath = path.join(this.cacheDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      if (filename.endsWith('.json')) {
        return JSON.parse(content);
      }
      
      return content;
    } catch (error) {
      console.error(`Failed to read cache file ${filename}:`, error);
      return null;
    }
  }
  
  /**
   * 列出所有缓存文件
   */
  listFiles(): string[] {
    if (!fs.existsSync(this.cacheDir)) {
      return [];
    }
    
    const files: string[] = [];
    
    const walk = (dir: string, prefix: string = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          walk(fullPath, relativePath);
        } else if (entry.isFile() && entry.name !== 'metadata.json') {
          files.push(relativePath);
        }
      }
    };
    
    walk(this.cacheDir);
    
    return files;
  }
  
  /**
   * 清空缓存
   */
  clear(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
    }
    this.ensureCacheDir();
  }
  
  /**
   * 获取缓存目录路径
   */
  getCacheDir(): string {
    return this.cacheDir;
  }
}
