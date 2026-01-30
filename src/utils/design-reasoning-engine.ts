/**
 * 设计推理引擎
 * 
 * 根据产品类型和需求，智能推荐完整的设计系统
 * 基于 100 条行业规则和最佳实践
 * 
 * 完全匹配原版 Python 实现：
 * https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
 */

export interface DesignRequest {
  productType: string;      // 产品类型（如 "SaaS", "E-commerce", "Healthcare"）
  description?: string;      // 产品描述
  stack?: string;           // 技术栈
  targetAudience?: string;  // 目标用户
  keywords?: string[];      // 关键词
}

export interface ReasoningRule {
  No: string;
  UI_Category: string;
  Recommended_Pattern: string;
  Style_Priority: string;
  Color_Mood: string;
  Typography_Mood: string;
  Key_Effects: string;
  Decision_Rules: Record<string, string>;
  Anti_Patterns: string;
  Severity: string;
}

export interface DesignSystemRecommendation {
  target: string;                    // 目标产品
  pattern: LandingPagePattern;       // 落地页模式
  style: StyleRecommendation;        // UI 风格
  colors: ColorPalette;              // 配色方案
  typography: TypographyPairing;     // 字体配对
  effects: EffectsRecommendation;    // 效果和动画
  antiPatterns: string[];            // 反模式（应避免）
  checklist: string[];               // 交付前检查清单
  reasoning: string;                 // 推理过程
}

export interface LandingPagePattern {
  name: string;
  description: string;
  conversion: string;
  cta: string;
  sections: string[];
}

export interface StyleRecommendation {
  primary: string;
  keywords: string[];
  bestFor: string[];
  performance: string;
  accessibility: string;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  cta: string;
  background: string;
  text: string;
  notes: string;
}

export interface TypographyPairing {
  heading: string;
  body: string;
  mood: string;
  bestFor: string[];
  googleFontsUrl: string;
}

export interface EffectsRecommendation {
  shadows: string;
  transitions: string;
  hover: string;
  animations: string;
}

/**
 * 设计推理引擎（完全匹配 Python 版本）
 */
export class DesignReasoningEngine {
  private productsData: any[] = [];
  private stylesData: any[] = [];
  private colorsData: any[] = [];
  private typographyData: any[] = [];
  private landingData: any[] = [];
  private uxGuidelinesData: any[] = [];
  private reasoningData: ReasoningRule[] = [];
  
  /**
   * 加载数据
   */
  loadData(data: {
    products: any[];
    styles: any[];
    colors: any[];
    typography: any[];
    landing: any[];
    uxGuidelines: any[];
    reasoning: ReasoningRule[];
  }): void {
    this.productsData = data.products;
    this.stylesData = data.styles;
    this.colorsData = data.colors;
    this.typographyData = data.typography;
    this.landingData = data.landing;
    this.uxGuidelinesData = data.uxGuidelines;
    this.reasoningData = data.reasoning;
  }
  
  /**
   * 生成设计系统推荐（完全匹配 Python 版本）
   */
  generateRecommendation(request: DesignRequest): DesignSystemRecommendation {
    // Step 1: 匹配产品类型
    const productRule = this.matchProductType(request);
    const category = productRule['Product Type'] || 'General';
    
    // Step 2: 应用推理规则
    const reasoning = this.applyReasoning(category);
    const stylePriority = reasoning.stylePriority;
    
    // Step 3: 使用优先级搜索各个领域
    const styleResults = this.searchStyles(request, stylePriority);
    const colorResults = this.searchColors(request);
    const typographyResults = this.searchTypography(request);
    const landingResults = this.searchLanding(request);
    
    // Step 4: 选择最佳匹配
    const bestStyle = this.selectBestMatch(styleResults, stylePriority);
    const colorDecision = this.applyColorPolicy(colorResults, request);
    const bestColor = colorDecision.color;
    const bestTypography = typographyResults[0] || {};
    const bestLanding = landingResults[0] || {};
    
    // Step 5: 组合效果（优先使用搜索结果）
    const styleEffects = bestStyle['Effects & Animation'] || '';
    const reasoningEffects = reasoning.keyEffects;
    const combinedEffects = styleEffects || reasoningEffects;
    
    // Step 6: 构建最终推荐
    const avoidBluePurple = this.shouldAvoidBluePurple(request);
    const fallbackPrimary = avoidBluePurple ? '#16A34A' : '#2563EB';
    const fallbackSecondary = avoidBluePurple ? '#22C55E' : '#3B82F6';
    const fallbackText = avoidBluePurple ? '#0F172A' : '#1E293B';

    return {
      target: request.productType,
      pattern: {
        name: bestLanding.Pattern || reasoning.pattern,
        description: bestLanding.Description || '',
        conversion: bestLanding['Conversion Focus'] || '',
        cta: bestLanding['CTA Placement'] || 'Above fold',
        sections: (bestLanding['Section Order'] || 'Hero, Features, CTA').split(',').map((s: string) => s.trim()),
      },
      style: {
        primary: bestStyle['Style Category'] || 'Minimalism',
        keywords: (bestStyle.Keywords || '').split(',').map((k: string) => k.trim()),
        bestFor: (bestStyle['Best For'] || '').split(',').map((b: string) => b.trim()),
        performance: bestStyle.Performance || 'Good',
        accessibility: bestStyle.Accessibility || 'WCAG AA',
      },
      colors: {
        primary: bestColor['Primary (Hex)'] || fallbackPrimary,
        secondary: bestColor['Secondary (Hex)'] || fallbackSecondary,
        cta: bestColor['CTA (Hex)'] || '#F97316',
        background: bestColor['Background (Hex)'] || '#F8FAFC',
        text: bestColor['Text (Hex)'] || fallbackText,
        notes: [bestColor.Notes || bestColor.Usage || '', colorDecision.note].filter(Boolean).join(' | '),
      },
      typography: {
        heading: bestTypography['Heading Font'] || 'Inter',
        body: bestTypography['Body Font'] || 'Inter',
        mood: bestTypography['Mood/Style Keywords'] || reasoning.typographyMood,
        bestFor: (bestTypography['Best For'] || '').split(',').map((b: string) => b.trim()),
        googleFontsUrl: bestTypography['Google Fonts URL'] || '',
      },
      effects: {
        shadows: this.extractShadows(combinedEffects),
        transitions: this.extractTransitions(combinedEffects),
        hover: this.extractHover(combinedEffects),
        animations: combinedEffects,
      },
      antiPatterns: (reasoning.antiPatterns || '').split('+').map((p: string) => p.trim()).filter(Boolean),
      checklist: this.generateChecklist(bestStyle, request),
      reasoning: this.generateReasoningText(productRule, bestStyle, bestColor, bestTypography, reasoning),
    };
  }

  private applyColorPolicy(colorResults: any[], request: DesignRequest): { color: any; note?: string } {
    const preferred = colorResults[0] || {};
    if (!this.shouldAvoidBluePurple(request)) {
      return { color: preferred };
    }

    if (preferred && this.isBluePurplePalette(preferred)) {
      const alternative = colorResults.find((item) => !this.isBluePurplePalette(item));
      if (alternative) {
        return { color: alternative, note: 'Color guard applied: avoid blue/purple unless explicitly requested' };
      }
    }

    const fallback = this.colorsData.find((item) => !this.isBluePurplePalette(item));
    if (fallback && this.isBluePurplePalette(preferred)) {
      return { color: fallback, note: 'Color guard applied: avoid blue/purple unless explicitly requested' };
    }

    return { color: preferred };
  }

  private shouldAvoidBluePurple(request: DesignRequest): boolean {
    const terms = [
      request.productType,
      request.description || '',
      request.targetAudience || '',
      ...(request.keywords || []),
    ].join(' ').toLowerCase();

    return !/(blue|indigo|purple|violet|lavender|blueish|bluish|紫|蓝|靛|靛蓝|紫色|蓝色)/i.test(terms);
  }

  private isBluePurplePalette(color: any): boolean {
    const primary = color?.['Primary (Hex)'] || '';
    const secondary = color?.['Secondary (Hex)'] || '';
    return this.isBluePurpleHex(primary) || this.isBluePurpleHex(secondary);
  }

  private isBluePurpleHex(hex: string): boolean {
    const hsl = this.hexToHsl(hex);
    if (!hsl) {
      return false;
    }
    const hue = hsl.h;
    return hue >= 200 && hue <= 290;
  }

  private hexToHsl(hex: string): { h: number; s: number; l: number } | null {
    const normalized = (hex || '').replace('#', '').trim();
    if (normalized.length !== 3 && normalized.length !== 6) {
      return null;
    }
    const full = normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized;

    const r = parseInt(full.substring(0, 2), 16) / 255;
    const g = parseInt(full.substring(2, 4), 16) / 255;
    const b = parseInt(full.substring(4, 6), 16) / 255;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r:
          h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
          break;
        case g:
          h = ((b - r) / delta + 2) * 60;
          break;
        default:
          h = ((r - g) / delta + 4) * 60;
          break;
      }
    }

    return { h, s, l };
  }
  
  /**
   * 应用推理规则
   */
  private applyReasoning(category: string): {
    pattern: string;
    stylePriority: string[];
    colorMood: string;
    typographyMood: string;
    keyEffects: string;
    antiPatterns: string;
    decisionRules: Record<string, string>;
    severity: string;
  } {
    const rule = this.findReasoningRule(category);
    
    if (!rule) {
      return {
        pattern: 'Hero + Features + CTA',
        stylePriority: ['Minimalism', 'Flat Design'],
        colorMood: 'Professional',
        typographyMood: 'Clean',
        keyEffects: 'Subtle hover transitions',
        antiPatterns: '',
        decisionRules: {},
        severity: 'MEDIUM',
      };
    }
    
    return {
      pattern: rule.Recommended_Pattern || 'Hero + Features + CTA',
      stylePriority: (rule.Style_Priority || '').split('+').map((s: string) => s.trim()),
      colorMood: rule.Color_Mood || '',
      typographyMood: rule.Typography_Mood || '',
      keyEffects: rule.Key_Effects || '',
      antiPatterns: rule.Anti_Patterns || '',
      decisionRules: rule.Decision_Rules || {},
      severity: rule.Severity || 'MEDIUM',
    };
  }
  
  /**
   * 查找推理规则
   */
  private findReasoningRule(category: string): ReasoningRule | null {
    const categoryLower = category.toLowerCase();
    
    // 1. 精确匹配
    for (const rule of this.reasoningData) {
      if (rule.UI_Category.toLowerCase() === categoryLower) {
        return rule;
      }
    }
    
    // 2. 部分匹配
    for (const rule of this.reasoningData) {
      const uiCat = rule.UI_Category.toLowerCase();
      if (uiCat.includes(categoryLower) || categoryLower.includes(uiCat)) {
        return rule;
      }
    }
    
    // 3. 关键词匹配
    for (const rule of this.reasoningData) {
      const uiCat = rule.UI_Category.toLowerCase();
      const keywords = uiCat.replace(/[\/\-]/g, ' ').split(/\s+/);
      if (keywords.some(kw => categoryLower.includes(kw))) {
        return rule;
      }
    }
    
    return null;
  }
  
  /**
   * 搜索风格（带优先级）
   */
  private searchStyles(request: DesignRequest, priority: string[]): any[] {
    const query = `${request.productType} ${request.description || ''} ${priority.join(' ')}`.toLowerCase();
    return this.searchWithScore(this.stylesData, query, ['Style Category', 'Keywords', 'Best For']).slice(0, 3);
  }
  
  /**
   * 搜索配色
   */
  private searchColors(request: DesignRequest): any[] {
    const query = `${request.productType} ${request.description || ''}`.toLowerCase();
    return this.searchWithScore(this.colorsData, query, ['Name', 'Usage', 'Product Type']).slice(0, 2);
  }
  
  /**
   * 搜索字体
   */
  private searchTypography(request: DesignRequest): any[] {
    const query = `${request.productType} ${request.description || ''}`.toLowerCase();
    return this.searchWithScore(this.typographyData, query, ['Mood/Style Keywords', 'Best For']).slice(0, 2);
  }
  
  /**
   * 搜索落地页模式
   */
  private searchLanding(request: DesignRequest): any[] {
    const query = `${request.productType} ${request.description || ''}`.toLowerCase();
    return this.searchWithScore(this.landingData, query, ['Pattern', 'Keywords']).slice(0, 2);
  }
  
  /**
   * 带评分的搜索
   */
  private searchWithScore(data: any[], query: string, fields: string[]): any[] {
    const scored = data.map(item => {
      let score = 0;
      const text = fields.map(f => item[f] || '').join(' ').toLowerCase();
      
      // 简单的关键词匹配评分
      const queryWords = query.split(/\s+/).filter(w => w.length > 2);
      for (const word of queryWords) {
        if (text.includes(word)) {
          score += 1;
        }
      }
      
      return { item, score };
    });
    
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.item);
  }
  
  /**
   * 选择最佳匹配（基于优先级）
   */
  private selectBestMatch(results: any[], priorityKeywords: string[]): any {
    if (!results || results.length === 0) {
      return {};
    }
    
    if (!priorityKeywords || priorityKeywords.length === 0) {
      return results[0];
    }
    
    // 1. 尝试精确风格名称匹配
    for (const priority of priorityKeywords) {
      const priorityLower = priority.toLowerCase().trim();
      for (const result of results) {
        const styleName = (result['Style Category'] || '').toLowerCase();
        if (priorityLower === styleName || styleName.includes(priorityLower) || priorityLower.includes(styleName)) {
          return result;
        }
      }
    }
    
    // 2. 按关键词评分
    const scored = results.map(result => {
      let score = 0;
      const resultStr = JSON.stringify(result).toLowerCase();
      
      for (const kw of priorityKeywords) {
        const kwLower = kw.toLowerCase().trim();
        
        // 风格名称匹配（高分）
        if ((result['Style Category'] || '').toLowerCase().includes(kwLower)) {
          score += 10;
        }
        // 关键词字段匹配（中分）
        else if ((result.Keywords || '').toLowerCase().includes(kwLower)) {
          score += 3;
        }
        // 其他字段匹配（低分）
        else if (resultStr.includes(kwLower)) {
          score += 1;
        }
      }
      
      return { result, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored[0] && scored[0].score > 0 ? scored[0].result : results[0];
  }
  
  /**
   * 提取阴影效果
   */
  private extractShadows(effects: string): string {
    if (effects.toLowerCase().includes('shadow')) {
      const match = effects.match(/([^+]*shadow[^+]*)/i);
      return match ? match[1].trim() : 'Subtle shadows';
    }
    return 'Subtle shadows';
  }
  
  /**
   * 提取过渡时间
   */
  private extractTransitions(effects: string): string {
    const match = effects.match(/(\d+[-–]\d+ms|\d+ms)/);
    return match ? match[0] : '200-300ms';
  }
  
  /**
   * 提取悬停效果
   */
  private extractHover(effects: string): string {
    if (effects.toLowerCase().includes('hover')) {
      const match = effects.match(/([^+]*hover[^+]*)/i);
      return match ? match[1].trim() : 'Gentle hover states';
    }
    return 'Gentle hover states';
  }
  
  /**
   * 匹配产品类型（增强版 - 使用 BM25 风格的匹配）
   */
  private matchProductType(request: DesignRequest): any {
    const query = `${request.productType} ${request.description || ''} ${request.keywords?.join(' ') || ''}`.toLowerCase();
    
    // 使用更智能的匹配算法
    let bestMatch = this.productsData[0] || {}; // 默认使用第一个
    let bestScore = 0;
    
    for (const product of this.productsData) {
      const keywords = (product.Keywords || '').toLowerCase();
      const productType = (product['Product Type'] || '').toLowerCase();
      const considerations = (product['Key Considerations'] || '').toLowerCase();
      
      let score = 0;
      
      // 1. 精确匹配产品类型（最高权重）
      if (query.includes(productType)) {
        score += 20;
      }
      
      // 2. 部分匹配产品类型
      const productWords = productType.split(/[\s/]+/);
      for (const word of productWords) {
        if (word.length > 2 && query.includes(word)) {
          score += 5;
        }
      }
      
      // 3. 关键词匹配（中等权重）
      const keywordList = keywords.split(',').map((k: string) => k.trim());
      for (const keyword of keywordList) {
        if (keyword.length > 2 && query.includes(keyword)) {
          score += 2;
        }
      }
      
      // 4. 考虑因素匹配（低权重）
      const considerationWords = considerations.split(/[\s,\.]+/);
      for (const word of considerationWords) {
        if (word.length > 3 && query.includes(word)) {
          score += 0.5;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }
    
    return bestMatch;
  }
  
  /**
   * 生成检查清单
   */
  private generateChecklist(style: any, request: DesignRequest): string[] {
    const transitions = this.extractTransitions(style['Effects & Animation'] || '');
    
    const checklist: string[] = [
      'No emojis as icons (use SVG: Heroicons/Lucide)',
      'cursor-pointer on all clickable elements',
      `Hover states with smooth transitions (${transitions})`,
      'Light mode: text contrast 4.5:1 minimum',
      'Focus states visible for keyboard nav',
      'prefers-reduced-motion respected',
      'Responsive: 375px, 768px, 1024px, 1440px',
      'Loading states for async operations',
      'Error states with clear messages',
      'Alt text for all images',
    ];
    
    // 根据技术栈添加特定检查项
    if (request.stack?.toLowerCase().includes('react')) {
      checklist.push('React keys on list items');
      checklist.push('useCallback for event handlers');
    } else if (request.stack?.toLowerCase().includes('vue')) {
      checklist.push('v-for with :key bindings');
      checklist.push('Computed properties for derived state');
    }
    
    return checklist;
  }
  
  /**
   * 生成推理说明
   */
  private generateReasoningText(
    productRule: any,
    style: any,
    colors: any,
    typography: any,
    reasoning: any
  ): string {
    const parts: string[] = [];
    
    parts.push(`Product Type: ${productRule['Product Type']}`);
    parts.push(`Recommended Style: ${style['Style Category'] || reasoning.stylePriority[0]}`);
    parts.push(`Reasoning: ${(style['Best For'] || '').split(',').slice(0, 3).join(', ')}`);
    parts.push(`Color Strategy: ${colors.Notes || colors.Usage || reasoning.colorMood}`);
    parts.push(`Typography Mood: ${typography['Mood/Style Keywords'] || reasoning.typographyMood}`);
    parts.push(`Performance: ${style.Performance || 'Good'}`);
    parts.push(`Accessibility: ${style.Accessibility || 'WCAG AA'}`);
    
    return parts.join('\n');
  }
}
