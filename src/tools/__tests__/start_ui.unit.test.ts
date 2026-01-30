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
    test('默认 framework 为 html（最通用）', async () => {
      const result = await startUi({ description: '测试' });
      
      expect(result.content[0].text).toMatch(/html/i);
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

  describe('模板档位', () => {
    test('auto 模式可自动选择 strict', async () => {
      const result = await startUi({
        description: `# 页面目标
需要一个带筛选和批量操作的管理后台，用于管理订单与用户数据，包含导出与权限控制。

## 关键交互
1. 支持筛选、排序、分页、导出
2. 批量启用/禁用、批量标签、批量删除

## 数据来源
来自订单服务与用户服务接口，刷新频率 30s

## 状态
空态、加载态、错误态、无权限提示、空筛选结果`,
        template_profile: 'auto',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toMatch(/模板档位:\s*strict/);
    });

    test('显式 guided 生效', async () => {
      const result = await startUi({
        description: '简单页面',
        template_profile: 'guided',
      });

      expect(result.isError).not.toBe(true);
      expect('structuredContent' in result).toBe(true);
      if (!('structuredContent' in result)) {
        throw new Error('structuredContent 缺失');
      }
      const structured = (result as any).structuredContent;
      const template = structured?.metadata?.template;
      expect(template?.profile).toBe('guided');
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
      
      // 应该包含 7 个步骤
      expect(text).toMatch(/步骤 1/);
      expect(text).toMatch(/步骤 2/);
      expect(text).toMatch(/步骤 3/);
      expect(text).toMatch(/步骤 4/);
      expect(text).toMatch(/步骤 5/);
      expect(text).toMatch(/步骤 6/);
      expect(text).toMatch(/步骤 7/);
    });

    test('包含高级选项部分', async () => {
      const result = await startUi({ description: '测试' });
      
      const text = result.content[0].text;
      
      expect(text).toMatch(/高级选项|Advanced Options/i);
    });
  });
});
