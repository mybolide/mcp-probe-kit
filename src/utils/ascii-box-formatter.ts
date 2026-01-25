/**
 * ASCII Box 格式化工具
 * 
 * 将设计系统推荐格式化为漂亮的 ASCII Box 格式
 */

import { DesignSystemRecommendation } from './design-reasoning-engine.js';

export class ASCIIBoxFormatter {
  private readonly BOX_WIDTH = 92;  // 总宽度（包括两侧的 | 符号）
  
  /**
   * 格式化设计系统推荐
   */
  format(recommendation: DesignSystemRecommendation): string {
    const lines: string[] = [];
    const w = this.BOX_WIDTH - 2;  // 内容宽度（不包括两侧的 |）
    
    // 顶部边框
    lines.push('+' + '-'.repeat(w) + '+');
    
    // 标题
    const title = `  TARGET: ${recommendation.target} - RECOMMENDED DESIGN SYSTEM`;
    lines.push('|' + this.pad(title, w) + '|');
    
    // 分隔线
    lines.push('+' + '-'.repeat(w) + '+');
    
    // 空行
    lines.push('|' + ' '.repeat(w) + '|');
    
    // 落地页模式
    lines.push('|' + this.pad(`  PATTERN: ${recommendation.pattern.name}`, w) + '|');
    lines.push('|' + this.pad(`     Conversion: ${recommendation.pattern.conversion}`, w) + '|');
    lines.push('|' + this.pad(`     CTA: ${recommendation.pattern.cta}`, w) + '|');
    lines.push('|' + this.pad('     Sections:', w) + '|');
    recommendation.pattern.sections.forEach((section, i) => {
      lines.push('|' + this.pad(`       ${i + 1}. ${section}`, w) + '|');
    });
    
    // 空行
    lines.push('|' + ' '.repeat(w) + '|');
    
    // UI 风格
    lines.push('|' + this.pad(`  STYLE: ${recommendation.style.primary}`, w) + '|');
    
    // Keywords - 处理长文本换行
    const keywords = recommendation.style.keywords.slice(0, 8).join(', ');
    const keywordsLines = this.wrapText(`Keywords: ${keywords}`, w - 7);
    keywordsLines.forEach(line => {
      lines.push('|' + this.pad(`     ${line}`, w) + '|');
    });
    
    const bestFor = recommendation.style.bestFor.slice(0, 3).join(', ');
    lines.push('|' + this.pad(`     Best For: ${bestFor}`, w) + '|');
    lines.push('|' + this.pad(`     Performance: ${recommendation.style.performance} | Accessibility: ${recommendation.style.accessibility}`, w) + '|');
    
    // 空行
    lines.push('|' + ' '.repeat(w) + '|');
    
    // 配色方案
    lines.push('|' + this.pad('  COLORS:', w) + '|');
    lines.push('|' + this.pad(`     Primary:    ${recommendation.colors.primary}`, w) + '|');
    lines.push('|' + this.pad(`     Secondary:  ${recommendation.colors.secondary}`, w) + '|');
    lines.push('|' + this.pad(`     CTA:        ${recommendation.colors.cta}`, w) + '|');
    lines.push('|' + this.pad(`     Background: ${recommendation.colors.background}`, w) + '|');
    lines.push('|' + this.pad(`     Text:       ${recommendation.colors.text}`, w) + '|');
    
    const notesLines = this.wrapText(`Notes: ${recommendation.colors.notes}`, w - 7);
    notesLines.forEach(line => {
      lines.push('|' + this.pad(`     ${line}`, w) + '|');
    });
    
    // 空行
    lines.push('|' + ' '.repeat(w) + '|');
    
    // 字体配对
    lines.push('|' + this.pad(`  TYPOGRAPHY: ${recommendation.typography.heading} / ${recommendation.typography.body}`, w) + '|');
    
    const moodLines = this.wrapText(`Mood: ${recommendation.typography.mood}`, w - 7);
    moodLines.forEach(line => {
      lines.push('|' + this.pad(`     ${line}`, w) + '|');
    });
    
    const typoBestFor = recommendation.typography.bestFor.slice(0, 3).join(', ');
    lines.push('|' + this.pad(`     Best For: ${typoBestFor}`, w) + '|');
    
    if (recommendation.typography.googleFontsUrl) {
      const url = this.truncate(recommendation.typography.googleFontsUrl, 60);
      lines.push('|' + this.pad(`     Google Fonts: ${url}`, w) + '|');
    }
    
    // 空行
    lines.push('|' + ' '.repeat(w) + '|');
    
    // 效果和动画
    lines.push('|' + this.pad('  KEY EFFECTS:', w) + '|');
    const effects = `${recommendation.effects.shadows} + ${recommendation.effects.transitions} + ${recommendation.effects.hover}`;
    const effectsLines = this.wrapText(effects, w - 7);
    effectsLines.forEach(line => {
      lines.push('|' + this.pad(`     ${line}`, w) + '|');
    });
    
    // 空行
    lines.push('|' + ' '.repeat(w) + '|');
    
    // 反模式
    lines.push('|' + this.pad('  AVOID (Anti-patterns):', w) + '|');
    const antiPatternsText = recommendation.antiPatterns.slice(0, 4).join(' + ');
    const antiLines = this.wrapText(antiPatternsText, w - 7);
    antiLines.forEach(line => {
      lines.push('|' + this.pad(`     ${line}`, w) + '|');
    });
    
    // 空行
    lines.push('|' + ' '.repeat(w) + '|');
    
    // 检查清单
    lines.push('|' + this.pad('  PRE-DELIVERY CHECKLIST:', w) + '|');
    recommendation.checklist.slice(0, 7).forEach(item => {
      lines.push('|' + this.pad(`     [ ] ${item}`, w) + '|');
    });
    
    // 空行
    lines.push('|' + ' '.repeat(w) + '|');
    
    // 底部边框
    lines.push('+' + '-'.repeat(w) + '+');
    
    return lines.join('\n');
  }
  
  /**
   * 填充字符串到指定宽度
   */
  private pad(text: string, width: number): string {
    if (text.length >= width) {
      return text.substring(0, width);
    }
    return text + ' '.repeat(width - text.length);
  }
  
  /**
   * 文本换行 - 返回字符串数组
   */
  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }
  
  /**
   * 截断文本
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * 生成 Markdown 格式（备用）
   */
  formatMarkdown(recommendation: DesignSystemRecommendation): string {
    const lines: string[] = [];
    
    lines.push(`# ${recommendation.target} - Design System`);
    lines.push('');
    
    lines.push(`## Landing Page Pattern: ${recommendation.pattern.name}`);
    lines.push(`- **Conversion**: ${recommendation.pattern.conversion}`);
    lines.push(`- **CTA**: ${recommendation.pattern.cta}`);
    lines.push(`- **Sections**: ${recommendation.pattern.sections.join(', ')}`);
    lines.push('');
    
    lines.push(`## UI Style: ${recommendation.style.primary}`);
    lines.push(`- **Keywords**: ${recommendation.style.keywords.join(', ')}`);
    lines.push(`- **Best For**: ${recommendation.style.bestFor.join(', ')}`);
    lines.push(`- **Performance**: ${recommendation.style.performance}`);
    lines.push(`- **Accessibility**: ${recommendation.style.accessibility}`);
    lines.push('');
    
    lines.push('## Color Palette');
    lines.push(`- **Primary**: ${recommendation.colors.primary}`);
    lines.push(`- **Secondary**: ${recommendation.colors.secondary}`);
    lines.push(`- **CTA**: ${recommendation.colors.cta}`);
    lines.push(`- **Background**: ${recommendation.colors.background}`);
    lines.push(`- **Text**: ${recommendation.colors.text}`);
    lines.push(`- **Notes**: ${recommendation.colors.notes}`);
    lines.push('');
    
    lines.push(`## Typography: ${recommendation.typography.heading} / ${recommendation.typography.body}`);
    lines.push(`- **Mood**: ${recommendation.typography.mood}`);
    lines.push(`- **Best For**: ${recommendation.typography.bestFor.join(', ')}`);
    if (recommendation.typography.googleFontsUrl) {
      lines.push(`- **Google Fonts**: ${recommendation.typography.googleFontsUrl}`);
    }
    lines.push('');
    
    lines.push('## Key Effects');
    lines.push(`- **Shadows**: ${recommendation.effects.shadows}`);
    lines.push(`- **Transitions**: ${recommendation.effects.transitions}`);
    lines.push(`- **Hover**: ${recommendation.effects.hover}`);
    lines.push(`- **Animations**: ${recommendation.effects.animations}`);
    lines.push('');
    
    lines.push('## Anti-Patterns (Avoid)');
    recommendation.antiPatterns.forEach(pattern => {
      lines.push(`- ${pattern}`);
    });
    lines.push('');
    
    lines.push('## Pre-Delivery Checklist');
    recommendation.checklist.forEach(item => {
      lines.push(`- [ ] ${item}`);
    });
    lines.push('');
    
    return lines.join('\n');
  }
}
