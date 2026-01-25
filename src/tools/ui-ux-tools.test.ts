/**
 * Unit tests for generateFileIndex and generateCreationGuidance functions
 * 
 * Requirements: 3.2, 3.3, 4.2, 4.3, 4.4, 4.5
 */

import { describe, it, expect } from 'vitest';
import { generateFileIndex, generateCreationGuidance, FileIndex, CreationGuidance } from './ui-ux-tools.js';

describe('generateFileIndex', () => {
  it('should return the correct number of files', () => {
    const fileIndex = generateFileIndex();
    
    // 验证返回7个文件
    expect(fileIndex).toHaveLength(7);
  });

  it('should return files in the correct order', () => {
    const fileIndex = generateFileIndex();
    
    // 验证文件按 order 字段正确排序
    for (let i = 0; i < fileIndex.length; i++) {
      expect(fileIndex[i].order).toBe(i + 1);
    }
    
    // 验证具体的文件顺序
    expect(fileIndex[0].path).toBe('docs/design-system.json');
    expect(fileIndex[1].path).toBe('docs/design-guidelines/README.md');
    expect(fileIndex[2].path).toBe('docs/design-guidelines/01-principles.md');
    expect(fileIndex[3].path).toBe('docs/design-guidelines/02-interaction.md');
    expect(fileIndex[4].path).toBe('docs/design-guidelines/03-layout.md');
    expect(fileIndex[5].path).toBe('docs/design-guidelines/04-config.md');
    expect(fileIndex[6].path).toBe('docs/design-system.md');
  });

  it('should have design-system.md as the last file', () => {
    const fileIndex = generateFileIndex();
    
    // 验证最后一个文件是 design-system.md
    const lastFile = fileIndex[fileIndex.length - 1];
    expect(lastFile.path).toBe('docs/design-system.md');
    expect(lastFile.order).toBe(7);
  });

  it('should mark all files as required', () => {
    const fileIndex = generateFileIndex();
    
    // 验证所有文件都标记为必需
    fileIndex.forEach(file => {
      expect(file.required).toBe(true);
    });
  });

  it('should have valid file metadata', () => {
    const fileIndex = generateFileIndex();
    
    // 验证每个文件都有必需的元数据
    fileIndex.forEach(file => {
      expect(file.path).toBeTruthy();
      expect(file.purpose).toBeTruthy();
      expect(file.order).toBeGreaterThan(0);
      expect(typeof file.required).toBe('boolean');
    });
  });
});

describe('generateCreationGuidance', () => {
  it('should include topics for all four document types', () => {
    const guidance = generateCreationGuidance('SaaS');
    
    // 验证所有四个文档类型都有主题
    expect(guidance.principles).toBeDefined();
    expect(guidance.interaction).toBeDefined();
    expect(guidance.layout).toBeDefined();
    expect(guidance.config).toBeDefined();
    
    // 验证每个类型都有至少一个主题
    expect(guidance.principles.length).toBeGreaterThan(0);
    expect(guidance.interaction.length).toBeGreaterThan(0);
    expect(guidance.layout.length).toBeGreaterThan(0);
    expect(guidance.config.length).toBeGreaterThan(0);
  });

  it('should include productType in tips', () => {
    const productType = 'E-commerce';
    const guidance = generateCreationGuidance(productType);
    
    // 验证提示中包含 productType
    expect(guidance.tips).toBeDefined();
    expect(guidance.tips.length).toBeGreaterThan(0);
    
    // 检查是否有提示提到了产品类型
    const hasProductTypeMention = guidance.tips.some(tip => 
      tip.includes(productType)
    );
    expect(hasProductTypeMention).toBe(true);
  });

  it('should include stack in tips when provided', () => {
    const stack = 'react';
    const guidance = generateCreationGuidance('SaaS', stack);
    
    // 验证提示中包含 stack
    const hasStackMention = guidance.tips.some(tip => 
      tip.toLowerCase().includes(stack.toLowerCase())
    );
    expect(hasStackMention).toBe(true);
  });

  it('should add stack-specific config topics when stack is provided', () => {
    const guidanceWithoutStack = generateCreationGuidance('SaaS');
    const guidanceWithReact = generateCreationGuidance('SaaS', 'react');
    const guidanceWithVue = generateCreationGuidance('SaaS', 'vue');
    const guidanceWithTailwind = generateCreationGuidance('SaaS', 'tailwind');
    
    // React 应该有额外的配置主题
    expect(guidanceWithReact.config.length).toBeGreaterThan(guidanceWithoutStack.config.length);
    
    // Vue 应该有额外的配置主题
    expect(guidanceWithVue.config.length).toBeGreaterThan(guidanceWithoutStack.config.length);
    
    // Tailwind 应该有额外的配置主题
    expect(guidanceWithTailwind.config.length).toBeGreaterThan(guidanceWithoutStack.config.length);
  });

  it('should include tips array', () => {
    const guidance = generateCreationGuidance('SaaS');
    
    // 验证 tips 数组存在且不为空
    expect(guidance.tips).toBeDefined();
    expect(Array.isArray(guidance.tips)).toBe(true);
    expect(guidance.tips.length).toBeGreaterThan(0);
  });

  it('should provide different tips for different product types', () => {
    const saasGuidance = generateCreationGuidance('SaaS');
    const ecommerceGuidance = generateCreationGuidance('E-commerce');
    const healthcareGuidance = generateCreationGuidance('Healthcare');
    
    // 验证不同产品类型有不同的提示
    // 至少应该有一个提示是不同的（因为包含了产品类型）
    const saasSpecificTips = saasGuidance.tips.filter(tip => tip.includes('SaaS'));
    const ecommerceSpecificTips = ecommerceGuidance.tips.filter(tip => tip.includes('E-commerce'));
    const healthcareSpecificTips = healthcareGuidance.tips.filter(tip => tip.includes('Healthcare'));
    
    expect(saasSpecificTips.length).toBeGreaterThan(0);
    expect(ecommerceSpecificTips.length).toBeGreaterThan(0);
    expect(healthcareSpecificTips.length).toBeGreaterThan(0);
  });

  it('should have valid structure for all guidance fields', () => {
    const guidance = generateCreationGuidance('SaaS', 'react');
    
    // 验证所有字段都是字符串数组
    expect(Array.isArray(guidance.principles)).toBe(true);
    expect(Array.isArray(guidance.interaction)).toBe(true);
    expect(Array.isArray(guidance.layout)).toBe(true);
    expect(Array.isArray(guidance.config)).toBe(true);
    expect(Array.isArray(guidance.tips)).toBe(true);
    
    // 验证数组中的元素都是字符串
    guidance.principles.forEach(item => expect(typeof item).toBe('string'));
    guidance.interaction.forEach(item => expect(typeof item).toBe('string'));
    guidance.layout.forEach(item => expect(typeof item).toBe('string'));
    guidance.config.forEach(item => expect(typeof item).toBe('string'));
    guidance.tips.forEach(item => expect(typeof item).toBe('string'));
  });
});
