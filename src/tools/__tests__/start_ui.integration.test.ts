/**
 * 集成测试：start_ui 工具
 * 
 * 测试完整的工作流程和端到端场景
 */

import { describe, test, expect } from 'vitest';
import { startUi } from '../start_ui.js';

describe('start_ui 集成测试', () => {
  describe('任务 9.3: 完整的手动模式流程', () => {
    test('生成可执行的工具调用指导', async () => {
      const result = await startUi({ 
        description: '登录页面',
        framework: 'react'
      });
      
      expect(result.isError).not.toBe(true);
      
      const text = result.content[0].text || '';
      
      // 1. 应该包含快速开始部分
      expect(text).toMatch(/^#\s+快速开始/m);
      
      // 2. 应该包含 6 个步骤（新增了项目上下文和更新索引）
      expect(text).toMatch(/步骤 1.*生成项目上下文/);
      expect(text).toMatch(/步骤 2.*生成设计系统/);
      expect(text).toMatch(/步骤 3.*生成组件目录/);
      expect(text).toMatch(/步骤 4.*搜索.*模板/);
      expect(text).toMatch(/步骤 5.*渲染.*代码/);
      expect(text).toMatch(/步骤 6.*更新项目上下文/);
      
      // 3. 每个步骤应该包含工具名称
      expect(text).toMatch(/init_project_context/);
      expect(text).toMatch(/ui_design_system/);
      expect(text).toMatch(/init_component_catalog/);
      expect(text).toMatch(/ui_search/);
      expect(text).toMatch(/render_ui/);
      
      // 4. 每个步骤应该包含 JSON 参数
      const jsonBlocks = text.match(/```json[\s\S]*?```/g);
      expect(jsonBlocks).toBeTruthy();
      expect(jsonBlocks!.length).toBeGreaterThanOrEqual(3);
      
      // 5. 所有 JSON 应该是有效的
      jsonBlocks!.forEach(block => {
        const jsonContent = block.replace(/```json\n/, '').replace(/\n```/, '');
        expect(() => JSON.parse(jsonContent)).not.toThrow();
      });
      
      // 6. 应该包含预期输出
      expect(text).toMatch(/预期输出/);
      
      // 7. 应该包含失败处理
      expect(text).toMatch(/失败处理/);
      
      // 8. 应该包含高级选项
      expect(text).toMatch(/高级选项/);
    });

    test('不同框架生成不同的指导', async () => {
      const reactResult = await startUi({ 
        description: '测试',
        framework: 'react'
      });
      
      const vueResult = await startUi({ 
        description: '测试',
        framework: 'vue'
      });
      
      const htmlResult = await startUi({ 
        description: '测试',
        framework: 'html'
      });
      
      // 应该包含对应的框架名称
      expect(reactResult.content[0].text).toMatch(/react/i);
      expect(vueResult.content[0].text).toMatch(/vue/i);
      expect(htmlResult.content[0].text).toMatch(/html/i);
      
      // 应该是不同的内容
      expect(reactResult.content[0].text).not.toBe(vueResult.content[0].text);
      expect(vueResult.content[0].text).not.toBe(htmlResult.content[0].text);
    });

    test('复杂描述生成正确的指导', async () => {
      const result = await startUi({ 
        description: '带有用户认证和权限管理的管理后台',
        framework: 'react'
      });
      
      expect(result.isError).not.toBe(true);
      
      const text = result.content[0].text || '';
      
      // 应该包含转义后的描述
      expect(text).toMatch(/带有用户认证和权限管理的管理后台/);
      
      // 所有 JSON 应该是有效的
      const jsonBlocks = text.match(/```json[\s\S]*?```/g);
      expect(jsonBlocks).toBeTruthy();
      
      jsonBlocks!.forEach(block => {
        const jsonContent = block.replace(/```json\n/, '').replace(/\n```/, '');
        expect(() => JSON.parse(jsonContent)).not.toThrow();
      });
    });
  });

  describe('任务 9.3: 错误恢复流程', () => {
    test('缺少参数时提供清晰的恢复指导', async () => {
      const result = await startUi({});
      
      expect(result.isError).toBe(true);
      
      const text = result.content[0].text;
      
      // 应该说明问题
      expect(text).toMatch(/缺少必要参数/);
      
      // 应该提供用法示例
      expect(text).toMatch(/用法/);
      expect(text).toMatch(/start_ui/);
      
      // 应该提供具体示例
      expect(text).toMatch(/示例/);
    });

    test('无效模式时提供清晰的恢复指导', async () => {
      const result = await startUi({ 
        description: '测试',
        mode: 'invalid'
      });
      
      expect(result.isError).toBe(true);
      
      const text = result.content[0].text || '';
      
      // 应该说明问题
      expect(text).toMatch(/无效的模式/);
      
      // 应该列出有效选项
      expect(text).toMatch(/auto/);
      expect(text).toMatch(/manual/);
      
      // 应该提供示例
      expect(text).toMatch(/示例/);
    });
  });

  describe('任务 9.3: 工具调用可执行性', () => {
    test('生成的 JSON 参数可以直接使用', async () => {
      const result = await startUi({ 
        description: '用户列表',
        framework: 'vue'
      });
      
      const text = result.content[0].text || '';
      
      // 提取所有 JSON 代码块
      const jsonBlocks = text.match(/```json\n([\s\S]*?)\n```/g);
      expect(jsonBlocks).toBeTruthy();
      
      // 验证每个 JSON 都可以解析并包含有效参数
      jsonBlocks!.forEach(block => {
        const jsonContent = block.replace(/```json\n/, '').replace(/\n```/, '');
        const parsed = JSON.parse(jsonContent);
        
        // 应该是一个对象
        expect(typeof parsed).toBe('object');
        expect(parsed).not.toBeNull();
        
        // 不应该包含未替换的占位符
        const jsonStr = JSON.stringify(parsed);
        expect(jsonStr).not.toMatch(/\{description\}/);
        expect(jsonStr).not.toMatch(/\{framework\}/);
        expect(jsonStr).not.toMatch(/\{templateName\}/);
      });
    });

    test('工具名称是有效的 MCP 工具', async () => {
      const result = await startUi({ 
        description: '测试',
        framework: 'react'
      });
      
      const text = result.content[0].text || '';
      
      // 定义有效的工具名称
      const validTools = [
        'ui_design_system',
        'init_component_catalog',
        'ui_search',
        'render_ui'
      ];
      
      // 应该只包含有效的工具名称
      validTools.forEach(tool => {
        if (text.includes(tool)) {
          // 工具名称应该在代码块或工具标记中
          const toolPattern = new RegExp(`(\`${tool}\`|\\*\\*工具\\*\\*.*${tool})`);
          expect(text).toMatch(toolPattern);
        }
      });
    });
  });

  describe('向后兼容性', () => {
    test('支持旧的调用方式', async () => {
      // 只传描述字符串
      const result1 = await startUi({ description: '测试' });
      expect(result1.isError).not.toBe(true);
      
      // 传描述和框架
      const result2 = await startUi({ 
        description: '测试',
        framework: 'react'
      });
      expect(result2.isError).not.toBe(true);
      
      // 使用别名
      const result3 = await startUi({ 
        desc: '测试',
        stack: 'vue'
      });
      expect(result3.isError).not.toBe(true);
    });
  });
});
