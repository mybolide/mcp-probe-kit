/**
 * 单元测试：start_ui 工具
 * 
 * 测试具体的功能点、边界情况和错误条件
 */

import { describe, test, expect } from 'vitest';
import { startUi } from '../start_ui.js';

describe('start_ui 单元测试', () => {
  describe('任务 7.3: 错误处理', () => {
    test('缺少描述参数时返回错误', async () => {
      const result = await startUi({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/缺少必要参数|Missing required parameter/i);
      expect(result.content[0].text).toMatch(/用法|Usage/i);
    });

    test('空描述参数时返回错误', async () => {
      const result = await startUi({ description: '' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/缺少必要参数|Missing required parameter/i);
    });

    test('无效 mode 值时返回错误', async () => {
      const result = await startUi({ 
        description: '测试',
        mode: 'invalid'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/无效的模式|Invalid mode/i);
      expect(result.content[0].text).toMatch(/auto.*manual/i);
    });

    test('错误响应包含使用示例', async () => {
      const result = await startUi({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/示例|Example/i);
      expect(result.content[0].text).toMatch(/start_ui/);
    });
  });

  describe('参数解析', () => {
    test('默认 framework 为 react', async () => {
      const result = await startUi({ description: '测试' });
      
      expect(result.content[0].text).toMatch(/react/i);
    });

    test('支持 vue framework', async () => {
      const result = await startUi({ 
        description: '测试',
        framework: 'vue'
      });
      
      expect(result.content[0].text).toMatch(/vue/i);
    });

    test('支持 html framework', async () => {
      const result = await startUi({ 
        description: '测试',
        framework: 'html'
      });
      
      expect(result.content[0].text).toMatch(/html/i);
    });

    test('自动生成模板名称', async () => {
      const result = await startUi({ description: '登录页面' });
      
      // 应该生成类似 login 的模板名
      expect(result.content[0].text).toMatch(/login|登录/i);
    });
  });

  describe('模式参数', () => {
    test('默认模式为 manual', async () => {
      const result = await startUi({ description: '测试' });
      
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toMatch(/快速开始|Quick Start/i);
    });

    test('显式 manual 模式返回指导', async () => {
      const result = await startUi({ 
        description: '测试',
        mode: 'manual'
      });
      
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toMatch(/快速开始|Quick Start/i);
    });

    test('auto 模式返回智能计划', async () => {
      const result = await startUi({ 
        description: '测试',
        mode: 'auto'
      });
      
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toMatch(/智能 UI 开发计划|智能分析结果/i);
    });
  });

  describe('输出格式', () => {
    test('返回有效的 markdown', async () => {
      const result = await startUi({ description: '测试' });
      
      const text = result.content[0].text;
      
      // 应该包含 markdown 标题
      expect(text).toMatch(/^#/m);
      
      // 应该包含代码块
      expect(text).toMatch(/```/);
    });

    test('包含所有必需的步骤', async () => {
      const result = await startUi({ description: '测试' });
      
      const text = result.content[0].text;
      
      // 应该包含 4 个步骤
      expect(text).toMatch(/步骤 1/);
      expect(text).toMatch(/步骤 2/);
      expect(text).toMatch(/步骤 3/);
      expect(text).toMatch(/步骤 4/);
    });

    test('包含高级选项部分', async () => {
      const result = await startUi({ description: '测试' });
      
      const text = result.content[0].text;
      
      expect(text).toMatch(/高级选项|Advanced Options/i);
    });
  });
});
