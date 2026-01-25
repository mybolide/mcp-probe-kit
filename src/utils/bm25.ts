/**
 * BM25 搜索引擎实现
 * 
 * BM25 是一种基于概率的信息检索算法，用于计算文档与查询的相关性得分
 */

export interface BM25Document {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface BM25SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface BM25Options {
  k1?: number;  // 词频饱和参数 (默认 1.5)
  b?: number;   // 长度归一化参数 (默认 0.75)
  fields?: string[];  // 要索引的字段
}

/**
 * BM25 搜索引擎
 */
export class BM25 {
  private documents: BM25Document[] = [];
  private invertedIndex: Map<string, Map<string, number>> = new Map();
  private documentLengths: Map<string, number> = new Map();
  private avgDocLength: number = 0;
  private k1: number;
  private b: number;
  
  constructor(options: BM25Options = {}) {
    this.k1 = options.k1 ?? 1.5;
    this.b = options.b ?? 0.75;
  }
  
  /**
   * 分词（简单实现）
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }
  
  /**
   * 添加文档到索引
   */
  addDocument(doc: BM25Document): void {
    this.documents.push(doc);
    
    const tokens = this.tokenize(doc.text);
    const docLength = tokens.length;
    
    this.documentLengths.set(doc.id, docLength);
    
    // 构建倒排索引
    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    
    for (const [term, freq] of termFreq) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
      }
      this.invertedIndex.get(term)!.set(doc.id, freq);
    }
  }
  
  /**
   * 批量添加文档
   */
  addDocuments(docs: BM25Document[]): void {
    for (const doc of docs) {
      this.addDocument(doc);
    }
    
    // 计算平均文档长度
    let totalLength = 0;
    for (const length of this.documentLengths.values()) {
      totalLength += length;
    }
    this.avgDocLength = totalLength / this.documents.length;
  }
  
  /**
   * 计算 IDF (Inverse Document Frequency)
   */
  private calculateIDF(term: string): number {
    const N = this.documents.length;
    const df = this.invertedIndex.get(term)?.size || 0;
    
    if (df === 0) return 0;
    
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }
  
  /**
   * 计算 BM25 得分
   */
  private calculateScore(docId: string, queryTerms: string[]): number {
    let score = 0;
    const docLength = this.documentLengths.get(docId) || 0;
    
    for (const term of queryTerms) {
      const termDocs = this.invertedIndex.get(term);
      if (!termDocs || !termDocs.has(docId)) {
        continue;
      }
      
      const tf = termDocs.get(docId)!;
      const idf = this.calculateIDF(term);
      
      // BM25 公式
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
      
      score += idf * (numerator / denominator);
    }
    
    return score;
  }
  
  /**
   * 搜索文档
   */
  search(query: string, limit: number = 10): BM25SearchResult[] {
    const queryTerms = this.tokenize(query);
    
    if (queryTerms.length === 0) {
      return [];
    }
    
    // 获取所有相关文档
    const relevantDocs = new Set<string>();
    for (const term of queryTerms) {
      const termDocs = this.invertedIndex.get(term);
      if (termDocs) {
        for (const docId of termDocs.keys()) {
          relevantDocs.add(docId);
        }
      }
    }
    
    // 计算得分
    const results: BM25SearchResult[] = [];
    for (const docId of relevantDocs) {
      const score = this.calculateScore(docId, queryTerms);
      const doc = this.documents.find(d => d.id === docId);
      
      if (doc && score > 0) {
        results.push({
          id: docId,
          score,
          metadata: doc.metadata,
        });
      }
    }
    
    // 按得分排序并返回前 N 个
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  
  /**
   * 清空索引
   */
  clear(): void {
    this.documents = [];
    this.invertedIndex.clear();
    this.documentLengths.clear();
    this.avgDocLength = 0;
  }
}
