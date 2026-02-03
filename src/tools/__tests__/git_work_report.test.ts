import { describe, it, expect } from 'vitest';
import { gitWorkReport } from '../git_work_report.js';

describe('git_work_report', () => {
  describe('参数验证', () => {
    it('应该拒绝缺少日期参数', async () => {
      const result = await gitWorkReport({});
      expect(result.content[0].text).toContain('请提供 date（日报）或 start_date + end_date（周期报）');
    });

    it('应该拒绝同时使用日报和周期报模式', async () => {
      const result = await gitWorkReport({
        date: '2026-1-27',
        start_date: '2026-2-1',
        end_date: '2026-2-6',
      });
      expect(result.content[0].text).toContain('不能同时使用日报和周期报模式');
    });

    it('应该拒绝无效的日期格式', async () => {
      const result = await gitWorkReport({ date: '2026/1/27' });
      expect(result.content[0].text).toContain('日期格式错误');
    });

    it('应该拒绝结束日期早于开始日期', async () => {
      const result = await gitWorkReport({
        start_date: '2026-2-6',
        end_date: '2026-2-1',
      });
      expect(result.content[0].text).toContain('结束日期不能早于开始日期');
    });
  });

  describe('日报模式', () => {
    it('应该返回日报生成指南', async () => {
      const result = await gitWorkReport({ date: '2026-1-27' });
      expect(result.content[0].type).toBe('text');
      const text = result.content[0].text;
      
      // 应该包含指导文本的关键部分
      expect(text).toContain('Git 工作报告生成指南');
      expect(text).toContain('日期：2026-1-27');
      expect(text).toContain('git log');
      expect(text).toContain('git show');
      expect(text).toContain('执行步骤');
      expect(text).toContain('输出要求');
    });
  });

  describe('周期报模式', () => {
    it('应该返回周期报生成指南', async () => {
      const result = await gitWorkReport({
        start_date: '2026-2-1',
        end_date: '2026-2-6',
      });
      expect(result.content[0].type).toBe('text');
      const text = result.content[0].text;
      
      // 应该包含指导文本的关键部分
      expect(text).toContain('Git 工作报告生成指南');
      expect(text).toContain('日期范围：2026-2-1 至 2026-2-6');
      expect(text).toContain('git log');
      expect(text).toContain('git show');
    });
  });

  describe('输出文件', () => {
    it('应该在指南中包含输出文件路径', async () => {
      const result = await gitWorkReport({
        date: '2026-1-27',
        output_file: 'daily-report.md',
      });
      expect(result.content[0].type).toBe('text');
      const text = result.content[0].text;
      
      expect(text).toContain('输出文件');
      expect(text).toContain('daily-report.md');
    });
  });
});
