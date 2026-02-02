import { describe, it, expect } from 'vitest';
import {
  ToolkitError,
  ErrorType,
  handleToolError,
  createUserError,
  createValidationError,
  createFileSystemError,
  createNetworkError,
  createToolError,
  safeGetErrorMessage,
} from '../error-handler.js';

describe('error-handler', () => {
  describe('ToolkitError', () => {
    it('应该创建基本错误', () => {
      const error = new ToolkitError('测试错误');
      expect(error.message).toBe('测试错误');
      expect(error.type).toBe(ErrorType.SYSTEM_ERROR);
      expect(error.name).toBe('ToolkitError');
    });

    it('应该创建带类型的错误', () => {
      const error = new ToolkitError('用户错误', ErrorType.USER_ERROR);
      expect(error.type).toBe(ErrorType.USER_ERROR);
    });

    it('应该保存原始错误', () => {
      const originalError = new Error('原始错误');
      const error = new ToolkitError('包装错误', ErrorType.SYSTEM_ERROR, originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('应该保存上下文信息', () => {
      const context = { tool: 'gencommit', input: 'test' };
      const error = new ToolkitError('错误', ErrorType.USER_ERROR, undefined, context);
      expect(error.context).toEqual(context);
    });
  });

  describe('便捷函数', () => {
    it('createUserError 应该创建用户错误', () => {
      const error = createUserError('参数缺失');
      expect(error.type).toBe(ErrorType.USER_ERROR);
      expect(error.message).toBe('参数缺失');
    });

    it('createValidationError 应该创建验证错误', () => {
      const error = createValidationError('格式不正确');
      expect(error.type).toBe(ErrorType.VALIDATION_ERROR);
    });

    it('createFileSystemError 应该创建文件系统错误', () => {
      const error = createFileSystemError('文件不存在');
      expect(error.type).toBe(ErrorType.FILE_SYSTEM_ERROR);
    });

    it('createNetworkError 应该创建网络错误', () => {
      const error = createNetworkError('连接超时');
      expect(error.type).toBe(ErrorType.NETWORK_ERROR);
    });

    it('createToolError 应该创建工具错误', () => {
      const error = createToolError('工具执行失败');
      expect(error.type).toBe(ErrorType.TOOL_ERROR);
    });
  });

  describe('handleToolError', () => {
    it('应该处理 ToolkitError', () => {
      const error = createUserError('参数缺失');
      const result = handleToolError(error, 'gencommit');
      
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('参数错误');
      expect(result.content[0].text).toContain('参数缺失');
    });

    it('应该处理普通 Error', () => {
      const error = new Error('普通错误');
      const result = handleToolError(error, 'code_review');
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('code_review 执行失败');
      expect(result.content[0].text).toContain('普通错误');
    });

    it('应该处理非 Error 对象', () => {
      const result = handleToolError('字符串错误', 'gentest');
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('字符串错误');
    });

    it('应该为不同错误类型生成不同的友好消息', () => {
      const userError = createUserError('参数错误');
      const validationError = createValidationError('验证失败');
      const fileError = createFileSystemError('文件错误');
      const networkError = createNetworkError('网络错误');
      const toolError = createToolError('工具错误');

      const userResult = handleToolError(userError, 'test');
      const validationResult = handleToolError(validationError, 'test');
      const fileResult = handleToolError(fileError, 'test');
      const networkResult = handleToolError(networkError, 'test');
      const toolResult = handleToolError(toolError, 'test');

      expect(userResult.content[0].text).toContain('参数错误');
      expect(validationResult.content[0].text).toContain('验证失败');
      expect(fileResult.content[0].text).toContain('文件操作失败');
      expect(networkResult.content[0].text).toContain('网络请求失败');
      expect(toolResult.content[0].text).toContain('工具执行失败');
    });
  });

  describe('safeGetErrorMessage', () => {
    it('应该从 Error 对象获取消息', () => {
      const error = new Error('错误消息');
      expect(safeGetErrorMessage(error)).toBe('错误消息');
    });

    it('应该处理字符串', () => {
      expect(safeGetErrorMessage('字符串错误')).toBe('字符串错误');
    });

    it('应该处理数字', () => {
      expect(safeGetErrorMessage(404)).toBe('404');
    });

    it('应该处理 null', () => {
      expect(safeGetErrorMessage(null)).toBe('null');
    });

    it('应该处理 undefined', () => {
      expect(safeGetErrorMessage(undefined)).toBe('undefined');
    });
  });
});
