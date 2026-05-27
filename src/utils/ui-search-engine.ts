/**
 * UI/UX 搜索引擎
 * 
 * 基于 BM25 算法的 UI/UX 数据搜索引擎
 */

import { BM25, BM25Document, BM25SearchResult } from './bm25.js';

export interface UISearchOptions {
  category?: string;  // 数据类别 (colors, icons, charts, etc.)
  stack?: string;     // 技术栈 (react, vue, nextjs, etc.)
  limit?: number;     // 返回结果数量
  minScore?: number;  // 最小相关性得分
}

export interface UISearchResult {
  id: string;
  score: number;
  category: string;
  data: Record<string, any>;
}

export interface UIDataset {
  category: string;
  data: Record<string, any>[];
}

/**
 * UI/UX 搜索引擎
 */
export class UISearchEngine {
  private bm25: BM25;
  private datasets: Map<string, Record<string, any>[]> = new Map();
  
  constructor() {
    this.bm25 = new BM25({
      k1: 1.5,
      b: 0.75,
    });
  }
  
  /**
   * 加载数据集
   */
  loadDataset(category: string, data: Record<string, any>[]): void {
    this.datasets.set(category, data);
    
    // 为每条数据创建 BM25 文档
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const docId = `${category}:${i}`;
      
      // 构建搜索文本（包含所有字段）
      const searchText = this.buildSearchText(item);
      
      this.bm25.addDocument({
        id: docId,
        text: searchText,
        metadata: {
          category,
          index: i,
        },
      });
    }
  }
  
  /**
   * 批量加载数据集
   */
  loadDatasets(datasets: UIDataset[]): void {
    for (const dataset of datasets) {
      this.loadDataset(dataset.category, dataset.data);
    }
  }
  
  /**
   * 构建搜索文本
   */
  private buildSearchText(item: Record<string, any>): string {
    const parts: string[] = [];
    
    for (const [key, value] of Object.entries(item)) {
      if (value == null) continue;
      
      if (typeof value === 'string') {
        parts.push(value);
      } else if (typeof value === 'number') {
        parts.push(String(value));
      } else if (Array.isArray(value)) {
        parts.push(value.join(' '));
      } else if (typeof value === 'object') {
        parts.push(JSON.stringify(value));
      }
    }
    
    return parts.join(' ');
  }
  
  /**
   * 搜索 UI/UX 数据
   */
  search(query: string, options: UISearchOptions = {}): UISearchResult[] {
    const {
      category,
      stack,
      limit = 10,
      minScore = 0,
    } = options;

    const bm25Results = this.bm25.search(
      query,
      limit * 3,
      category ? (metadata) => metadata?.category === category : undefined
    );
    const results: UISearchResult[] = [];

    for (const result of bm25Results) {
      if (result.score < minScore) continue;

      const { category: resultCategory, index } = result.metadata!;

      if (category && resultCategory !== category) {
        continue;
      }

      const dataset = this.datasets.get(resultCategory);
      if (!dataset || index >= dataset.length) {
        continue;
      }

      const item = dataset[index];
      if (stack && !this.matchesStack(item, stack)) {
        continue;
      }

      results.push({
        id: result.id,
        score: result.score,
        category: resultCategory,
        data: item,
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  private matchesStack(item: Record<string, any>, stack: string): boolean {
    const normalized = stack.toLowerCase();
    const itemStack = String(item.stack || '').toLowerCase();
    if (itemStack && itemStack !== normalized) {
      if (!(normalized.includes('next') && itemStack === 'react')) {
        return false;
      }
    }

    if (normalized.includes('shadcn') || normalized.includes('react') || normalized.includes('next')) {
      return item.category?.startsWith('shadcn-') || itemStack === 'react' || !itemStack;
    }

    return true;
  }
  
  /**
   * 获取所有类别
   */
  getCategories(): string[] {
    return Array.from(this.datasets.keys());
  }
  
  /**
   * 获取类别数据
   */
  getCategoryData(category: string): Record<string, any>[] | undefined {
    return this.datasets.get(category);
  }
  
  /**
   * 清空索引
   */
  clear(): void {
    this.bm25.clear();
    this.datasets.clear();
  }
}
